#!/usr/bin/env python3
"""
efHub player card scraper.
Filters index by ID prefix (89/88/1067) and scrapes Big Time / Epic / Showtime cards.
Output: 3 JSON files (one per card type).
"""
import re, json, time, urllib.request, sys, os
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
DELAY = float(os.environ.get('EFHUB_DELAY', '4.5'))  # respect Crawl-delay: 5
OUTPUT_DIR = Path(os.environ.get('EFHUB_OUTPUT', '/tmp/efhub_data'))
INDEX_FILE = Path('/tmp/player_index.json')
# Delta mode: seed the skip-set from the DB so only cards missing from the DB
# get scraped. Set DATABASE_URL to enable (the JSONL /tmp files are ephemeral,
# so DB is the reliable source of "what we already have"). Falls back to
# JSONL-only resume when unset.
DB_DSN = os.environ.get('DATABASE_URL')
# Real card IDs are 14-15 digits; short IDs (e.g. 8959) only share the prefix
# by coincidence and are not our card types — skip them before wasting a fetch.
MIN_ID_LEN = 10

CARD_TYPES = {
    'bigtime':  {'prefix': '89',   'player_type': 7},
    'epic':     {'prefix': '88',   'player_type': 5},
    'showtime': {'prefix': '1067', 'player_type': 8},
}

STAT_FIELDS = [
    'offensiveAwareness', 'ballControl', 'dribbling', 'tightPossession',
    'lowPass', 'loftedPass', 'finishing', 'heading', 'setPieceTaking',
    'curl', 'speed', 'acceleration', 'kickingPower', 'jump',
    'physicalContact', 'balance', 'stamina', 'defensiveAwareness',
    'ballWinning', 'trackingBack', 'aggression',
    'gkAwareness', 'gkCatching', 'gkClearing', 'gkReflexes', 'gkReach',
]

def fetch(pid, retries=3):
    last = None
    for a in range(retries):
        try:
            req = urllib.request.Request(
                f"https://efhub.com/players/{pid}",
                headers={"User-Agent": UA},
            )
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            last = e
            time.sleep(3 * (a + 1))
    raise last

def parse_player(html, pid_hint):
    """Extract player data from Next.js __next_f payloads."""
    matches = re.findall(
        r'self\.__next_f\.push\(\[(\d+),\s*("(?:[^"\\]|\\.)*")\]\)', html
    )
    for kind, raw in matches:
        try: s = json.loads(raw)
        except: continue
        if '"playerType":' not in s or '"baseStats":' not in s:
            continue
        # The "player" object holds canonical fields
        mp = re.search(r'"player":\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', s)
        blob = mp.group(0) if mp else s

        def g(field, typ='str'):
            pat = rf'"{field}":"([^"]*)"' if typ == 'str' else rf'"{field}":(-?\d+)'
            m = re.search(pat, blob)
            if m:
                return m.group(1) if typ == 'str' else int(m.group(1))
            return None

        stats_m = re.search(r'"baseStats":\{[^}]+\}', s)
        skl_m   = re.search(r'"playerSkills":\[([^\]]*)\]', s)
        com_m   = re.search(r'"comSkills":\[([^\]]*)\]', s)
        addp_m  = re.search(r'"additionalPositions":(\[[^\]]*\])', s)

        row = {
            'efhubId':       g('id') or str(pid_hint),
            'name':          g('name'),
            'nameJa':        g('nameJa'),
            'nameZh':        g('nameZh'),
            'team':          g('team'),
            'league':        g('league'),
            'nationality':   g('nationality'),
            'nationalityCode': g('nationalityCode'),
            'position':      g('position'),
            'playingStyle':  g('playingStyle'),
            'overallRating': g('overallRating', 'int'),
            'playerType':    g('playerType', 'int'),
            'age':           g('age', 'int'),
            'height':        g('height', 'int'),
            'weight':        g('weight', 'int'),
            'preferredFoot': g('preferredFoot'),
            'weakFootUsage': g('weakFootUsage', 'int'),
            'weakFootAccuracy': g('weakFootAccuracy', 'int'),
            'imageUrl':      g('imageUrl'),
        }
        if stats_m:
            try:
                stats = json.loads(stats_m.group(0).split(':', 1)[1])
                row['baseStats'] = stats
            except Exception:
                row['baseStats'] = {}
        if skl_m:
            row['skills'] = re.findall(r'"([^"]+)"', skl_m.group(1))
        if com_m:
            row['comSkills'] = re.findall(r'"([^"]+)"', com_m.group(1))
        if addp_m:
            try:
                row['additionalPositions'] = json.loads(addp_m.group(1))
            except:
                pass
        return row
    return None

def load_index():
    with open(INDEX_FILE) as f:
        return json.load(f)

def load_known_from_db():
    """Return set of efhub_id strings already in the DB, or empty set if
    DATABASE_URL is unset / psycopg is missing."""
    if not DB_DSN:
        return set()
    try:
        import psycopg
    except ImportError:
        print("  DATABASE_URL set but psycopg missing — install 'psycopg[binary]'",
              file=sys.stderr, flush=True)
        return set()
    known = set()
    with psycopg.connect(DB_DSN) as conn, conn.cursor() as cur:
        for t in CARD_TYPES:
            cur.execute(f"SELECT efhub_id FROM {t}")
            known.update(str(r[0]) for r in cur.fetchall())
    print(f"  DB delta: {len(known)} cards already in DB, will skip them",
          file=sys.stderr, flush=True)
    return known

def scrape_type(type_name, cfg, index, db_known):
    candidates = [d for d in index
                  if str(d['i']).startswith(cfg['prefix']) and len(str(d['i'])) >= MIN_ID_LEN]
    candidates.sort(key=lambda x: -x['o'])
    print(f"\n=== {type_name.upper()}: {len(candidates)} candidates ===", file=sys.stderr, flush=True)

    out_file = OUTPUT_DIR / f"{type_name}.jsonl"
    err_file = OUTPUT_DIR / f"{type_name}.errors.txt"

    # Resume: skip already-scraped IDs (from prior JSONL runs + what's in the DB)
    scraped = set(db_known)
    if out_file.exists():
        with open(out_file) as f:
            for line in f:
                try:
                    row = json.loads(line)
                    scraped.add(str(row.get('efhubId')))
                except: pass
        print(f"  Resume: {len(scraped)} already known, skipping", file=sys.stderr, flush=True)

    todo = [d for d in candidates if str(d['i']) not in scraped]
    print(f"  Will scrape {len(todo)} ({len(todo)*DELAY/60:.1f} min)", file=sys.stderr, flush=True)

    out = open(out_file, 'a')
    errs = open(err_file, 'a')
    n_ok = n_skip = n_err = 0

    for i, d in enumerate(todo, 1):
        pid = str(d['i'])
        try:
            html = fetch(pid)
            row = parse_player(html, pid)
            if row is None:
                errs.write(f"{pid}\tno-data\n")
                n_err += 1
            elif row.get('playerType') != cfg['player_type']:
                # Wrong type — log but don't insert into this table
                errs.write(f"{pid}\twrong-type:{row.get('playerType')}\n")
                n_skip += 1
            else:
                # Max-level OVR ("Messi 106") lives ONLY in the index entry's
                # "o" — the player page carries the level-1 rating and computes
                # the maxed one client-side from the progression curve.
                if d.get('o') is not None:
                    row['maxOverallRating'] = d['o']
                out.write(json.dumps(row, ensure_ascii=False) + '\n')
                out.flush()
                n_ok += 1
            if i % 25 == 0 or i == len(todo):
                print(f"  [{i}/{len(todo)}] ok={n_ok} skip={n_skip} err={n_err}", file=sys.stderr, flush=True)
        except Exception as e:
            errs.write(f"{pid}\t{e}\n")
            errs.flush()
            n_err += 1
        time.sleep(DELAY)

    out.close()
    errs.close()
    print(f"  DONE {type_name}: ok={n_ok}  skip={n_skip}  err={n_err}", file=sys.stderr, flush=True)

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    index = load_index()
    db_known = load_known_from_db()
    print(f"Index: {len(index)} players. Delay: {DELAY}s. Output: {OUTPUT_DIR}", file=sys.stderr, flush=True)
    for name, cfg in CARD_TYPES.items():
        scrape_type(name, cfg, index, db_known)
    print("\nALL DONE", file=sys.stderr, flush=True)

if __name__ == '__main__':
    main()
