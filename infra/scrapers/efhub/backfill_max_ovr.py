#!/usr/bin/env python3
"""
Backfill max_overall_rating from the efhub player index.

The maxed OVR ("Messi 106") exists ONLY in the index entry's "o" field — the
player page carries the level-1 rating and efhub derives the maxed one in the
browser from the progression curve. So re-scraping player pages can never fill
this column; the index can, in a single request.

One HTTP call for all ~44k index rows, then one UPDATE batch per card table.
Idempotent — re-run any time efhub bumps values.

Usage:
    export DATABASE_URL="postgresql://efbazaar:$POSTGRES_PASSWORD@localhost:5432/efbazaar"
    python3 infra/scrapers/efhub/backfill_max_ovr.py

    # index URL rotates with efhub deploys; override when the default 404s
    EFHUB_INDEX_URL="https://efhub.com/search/player-index.json?v=..." \
        python3 infra/scrapers/efhub/backfill_max_ovr.py
"""
import json
import os
import sys
import urllib.request

try:
    import psycopg
except ImportError:
    print("Install: pip install 'psycopg[binary]'", file=sys.stderr)
    sys.exit(1)

DSN = os.environ.get("DATABASE_URL")
if not DSN:
    print("Set DATABASE_URL env var", file=sys.stderr)
    sys.exit(1)

INDEX_URL = os.environ.get(
    "EFHUB_INDEX_URL",
    "https://efhub.com/search/player-index.json?v=dpl_8nXHsdY9zYwQoaxurdEqy7P2S9Gi",
)
CACHE = "/tmp/player_index.json"
USER_AGENT = "Mozilla/5.0"

# Same prefix → table map as CardType.java / scrape.py.
TABLE_BY_PREFIX = {"89": "bigtime", "88": "epic", "1067": "showtime"}
MIN_ID_LEN = 10


def load_index():
    if os.path.exists(CACHE):
        print(f"Using cached {CACHE}", file=sys.stderr)
        with open(CACHE) as f:
            return json.load(f)
    print(f"Fetching {INDEX_URL}", file=sys.stderr)
    req = urllib.request.Request(INDEX_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8", "replace")
    with open(CACHE, "w") as f:
        f.write(raw)
    return json.loads(raw)


def table_for(efhub_id):
    s = str(efhub_id)
    if len(s) < MIN_ID_LEN:
        return None
    for prefix, table in TABLE_BY_PREFIX.items():
        if s.startswith(prefix):
            return table
    return None


def main():
    index = load_index()
    print(f"Index rows: {len(index)}", file=sys.stderr)

    by_table = {t: [] for t in TABLE_BY_PREFIX.values()}
    for entry in index:
        efhub_id, max_ovr = entry.get("i"), entry.get("o")
        if efhub_id is None or max_ovr is None:
            continue
        table = table_for(efhub_id)
        if table:
            by_table[table].append((max_ovr, efhub_id, max_ovr))

    total = 0
    with psycopg.connect(DSN) as conn:
        for table, rows in by_table.items():
            if not rows:
                continue
            with conn.cursor() as cur:
                cur.executemany(
                    f"UPDATE {table} SET max_overall_rating = %s, updated_at = NOW() "
                    f"WHERE efhub_id = %s AND max_overall_rating IS DISTINCT FROM %s",
                    rows,
                )
                # executemany reports the last statement only; count for real
                cur.execute(
                    f"SELECT count(*) FROM {table} WHERE max_overall_rating IS NOT NULL"
                )
                filled = cur.fetchone()[0]
                cur.execute(f"SELECT count(*) FROM {table}")
                all_rows = cur.fetchone()[0]
            conn.commit()
            print(f"  {table}: {filled}/{all_rows} rows have max_overall_rating",
                  file=sys.stderr)
            total += filled

    print(f"DONE — {total} cards carry a maxed OVR", file=sys.stderr)


if __name__ == "__main__":
    main()
