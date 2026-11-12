"""Download a bounded, pre-final Euro 2024 history for the GhostXI behavior demo."""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import time
import urllib.request
import hashlib

ROOT = Path(__file__).resolve().parents[1]
CUTOFF = "2024-07-14"


def prepare(cache):
    started = time.perf_counter()
    config = json.loads((ROOT / "config/external-sources.json").read_text(encoding="utf-8"))
    revision = config["statsbomb"]["revision"]
    base = f"https://raw.githubusercontent.com/hudl/open-data/{revision}/data"
    cache.mkdir(parents=True, exist_ok=True)

    def fetch(name, url):
        path = cache / name
        marker = cache / (name + ".source.json")
        if not path.exists() or not marker.exists() or json.loads(marker.read_text())["url"] != url:
            temporary = path.with_suffix(path.suffix + ".download")
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "GhostXI-hackathon-data-import"}), timeout=60) as response:
                    temporary.write_bytes(response.read())
                os.replace(temporary, path)
                marker.write_text(json.dumps({"url": url}), encoding="utf-8")
            finally:
                temporary.unlink(missing_ok=True)
        raw = path.read_bytes()
        return json.loads(raw), {"url": url, "sha256": hashlib.sha256(raw).hexdigest()}

    metadata, metadata_source = fetch("matches-55-282.json", f"{base}/matches/55/282.json")
    selected = sorted((m for m in metadata if m["match_date"] < CUTOFF and
        {m["home_team"]["home_team_id"], m["away_team"]["away_team_id"]} & {772, 768}),
        key=lambda m: (m["match_date"], m["match_id"]))
    if len(selected) != 12 or any(m["match_id"] == 3943043 for m in selected):
        raise ValueError("Expected exactly twelve pre-final Spain/England matches; review source selection")

    def get_match(match):
        mid = match["match_id"]
        events, event_source = fetch(f"sb-events-{mid}.json", f"{base}/events/{mid}.json")
        lineups, lineup_source = fetch(f"sb-lineups-{mid}.json", f"{base}/lineups/{mid}.json")
        # Keep all event types for duration/minutes derivation, with a compact feature set.
        event_keys = {"id", "index", "period", "timestamp", "minute", "second", "duration", "type",
            "team", "player", "position", "location", "possession", "under_pressure", "counterpress", "pass", "carry", "shot"}
        compact = [{k: v for k, v in event.items() if k in event_keys} for event in events]
        print(f"Ready: {mid} {match['match_date']}", flush=True)
        return {"metadata": match, "lineups": lineups, "events": compact, "sources": [event_source, lineup_source]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        matches = list(pool.map(get_match, selected))
    result = {"schemaVersion": "1.0", "cutoffDate": CUTOFF, "holdoutMatchId": 3943043,
        "revision": revision, "matches": matches, "metadataSource": metadata_source,
        "downloadAndPreparationSeconds": round(time.perf_counter() - started, 3)}
    output = ROOT / "src/data/behavior-history.json"
    temp = output.with_suffix(".tmp")
    try:
        temp.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
        os.replace(temp, output)
    finally:
        temp.unlink(missing_ok=True)
    print(json.dumps({"historyMatches": len(matches), "downloadAndPreparationSeconds": result["downloadAndPreparationSeconds"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "work/datasets")
    args = parser.parse_args()
    prepare(args.cache_dir.resolve())

