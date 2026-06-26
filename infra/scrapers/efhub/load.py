#!/usr/bin/env python3
"""
Load scraped efhub JSONL files into the efbazaar Postgres DB.
Usage:
    DATABASE_URL=postgresql://user:pass@host:port/efbazaar python3 efhub_load.py
"""
import json, os, sys, glob
from pathlib import Path

try:
    import psycopg
except ImportError:
    print("Install: pip install 'psycopg[binary]'", file=sys.stderr)
    sys.exit(1)

DSN = os.environ.get('DATABASE_URL')
if not DSN:
    print("Set DATABASE_URL env var", file=sys.stderr)
    sys.exit(1)

DATA_DIR = Path(os.environ.get('EFHUB_OUTPUT', '/tmp/efhub_data'))

STAT_MAP = {
    'offensiveAwareness':'offensive_awareness','ballControl':'ball_control','dribbling':'dribbling',
    'tightPossession':'tight_possession','lowPass':'low_pass','loftedPass':'lofted_pass',
    'finishing':'finishing','heading':'heading','setPieceTaking':'set_piece_taking',
    'curl':'curl','speed':'speed','acceleration':'acceleration','kickingPower':'kicking_power',
    'jump':'jump','physicalContact':'physical_contact','balance':'balance','stamina':'stamina',
    'defensiveAwareness':'defensive_awareness','ballWinning':'ball_winning','trackingBack':'tracking_back',
    'aggression':'aggression','gkAwareness':'gk_awareness','gkCatching':'gk_catching',
    'gkClearing':'gk_clearing','gkReflexes':'gk_reflexes','gkReach':'gk_reach',
}

COLUMNS = [
    'efhub_id','name','name_ja','name_zh','team','league','nationality','nationality_code',
    'position','playing_style','overall_rating','player_type','age','height','weight',
    'preferred_foot','weak_foot_usage','weak_foot_accuracy','image_url',
] + list(STAT_MAP.values()) + ['skills','com_skills','additional_positions','raw_data']

def row_to_tuple(row):
    bs = row.get('baseStats') or {}
    addp = row.get('additionalPositions')
    return (
        int(row['efhubId']),
        row.get('name'), row.get('nameJa'), row.get('nameZh'),
        row.get('team'), row.get('league'),
        row.get('nationality'), row.get('nationalityCode'),
        row.get('position'), row.get('playingStyle'),
        row.get('overallRating'), row.get('playerType'),
        row.get('age'), row.get('height'), row.get('weight'),
        row.get('preferredFoot'), row.get('weakFootUsage'), row.get('weakFootAccuracy'),
        row.get('imageUrl'),
        *[bs.get(k) for k in STAT_MAP],
        row.get('skills') or [],
        row.get('comSkills') or [],
        json.dumps(addp) if addp is not None else None,
        json.dumps(row, ensure_ascii=False),
    )

def load_table(conn, table, jsonl_file):
    if not jsonl_file.exists():
        print(f"  {table}: no file {jsonl_file}", file=sys.stderr)
        return
    cols = ', '.join(COLUMNS)
    placeholders = ', '.join(['%s'] * len(COLUMNS))
    updates = ', '.join(f"{c}=EXCLUDED.{c}" for c in COLUMNS if c != 'efhub_id')
    sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (efhub_id) DO UPDATE SET {updates}, updated_at=NOW()"

    rows = []
    with open(jsonl_file) as f:
        for line in f:
            line = line.strip()
            if not line: continue
            try:
                rows.append(row_to_tuple(json.loads(line)))
            except Exception as e:
                print(f"  {table}: parse error: {e}", file=sys.stderr)
    with conn.cursor() as cur:
        cur.executemany(sql, rows)
    conn.commit()
    print(f"  {table}: {len(rows)} rows upserted", file=sys.stderr)

def main():
    with psycopg.connect(DSN) as conn:
        for table in ['bigtime', 'epic', 'showtime']:
            load_table(conn, table, DATA_DIR / f"{table}.jsonl")

if __name__ == '__main__':
    main()
