"""Fetch only selected StatsBomb matches and two author-published Transfermarkt CSVs.

Uses Python's standard library; no account, token, scraping or API key is needed.
Run from any directory. The server itself never downloads data.
"""
import argparse
import concurrent.futures
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def date(value):
    if not value:
        return None
    return dt.date.fromisoformat(value[:10]).isoformat()


def number(value):
    if value in (None, ""):
        return None
    parsed = float(value)
    if not __import__("math").isfinite(parsed):
        raise ValueError("Nonfinite source number")
    return int(parsed) if parsed.is_integer() else parsed


def prepare(cache, refresh=False):
    config = json.loads((ROOT / "config/external-sources.json").read_text(encoding="utf-8"))
    cache.mkdir(parents=True, exist_ok=True)
    sources = []

    def acquire(name, url):
        path = cache / name
        marker = cache / (name + ".source.json")
        # A URL marker prevents accidental reuse after changing a dataset version.
        reusable = path.exists() and marker.exists() and json.loads(marker.read_text())["url"] == url
        if refresh or not reusable:
            temporary = path.with_name(path.name + ".download")
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "GhostXI-hackathon-data-import"})
                with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as output:
                    while block := response.read(1024 * 1024):
                        output.write(block)
                os.replace(temporary, path)
                marker.write_text(json.dumps({"url": url}), encoding="utf-8")
            finally:
                temporary.unlink(missing_ok=True)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return path, {"file": name, "url": url, "sha256": digest, "bytes": path.stat().st_size}

    rev = config["statsbomb"]["revision"]
    base = f"https://raw.githubusercontent.com/hudl/open-data/{rev}"
    requests = {}
    for item in config["statsbomb"]["matches"]:
        match_id = item["id"]
        c, s = item["competitionId"], item["seasonId"]
        requests[f"matches-{c}-{s}.json"] = f"{base}/data/matches/{c}/{s}.json"
        for kind in ("events", "lineups"):
            requests[f"sb-{kind}-{match_id}.json"] = f"{base}/data/{kind}/{match_id}.json"
    requests["statsbomb-logo.png"] = f"{base}/img/SB%20-%20Icon%20Lockup%20-%20Colour%20positive.png"
    requests["statsbomb-license.pdf"] = f"{base}/LICENSE.pdf"
    version = config["transfermarkt"]["kaggleVersion"]
    # The publisher's R2 endpoint returned HTTP 403. Use the same author's official
    # versioned Kaggle mirror, with provenance explicitly recording this choice.
    for name in ("players.csv", "player_valuations.csv"):
        requests[name] = f"https://www.kaggle.com/api/v1/datasets/download/davidcariboo/player-scores/{name}?datasetVersionNumber={version}"
    paths = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(acquire, name, url): name for name, url in requests.items()}
        for future in concurrent.futures.as_completed(futures):
            path, provenance = future.result()
            paths[futures[future]] = path
            sources.append(provenance)
            print(f"Ready: {path.name} ({path.stat().st_size:,} bytes)", flush=True)

    def read_json(name):
        return json.loads(paths[name].read_text(encoding="utf-8"))

    matches = []
    sb_players = {}
    for item in config["statsbomb"]["matches"]:
        mid, c, s = item["id"], item["competitionId"], item["seasonId"]
        metadata = next((m for m in read_json(f"matches-{c}-{s}.json") if m["match_id"] == mid), None)
        if metadata is None:
            raise ValueError(f"StatsBomb match {mid} missing from its competition-season")
        lineups, events = read_json(f"sb-lineups-{mid}.json"), read_json(f"sb-events-{mid}.json")
        if len(lineups) != 2 or not events or len({e["id"] for e in events}) != len(events):
            raise ValueError(f"Invalid lineups/events for StatsBomb match {mid}")
        for team in lineups:
            for player in team["lineup"]:
                sb_players[player["player_id"]] = player
        matches.append({"metadata": metadata, "lineups": lineups, "events": events})

    players = {}
    with paths["players.csv"].open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"player_id", "name", "date_of_birth", "url"}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected Transfermarkt players schema")
        for row in reader:
            pid = row["player_id"]
            if pid in players:
                raise ValueError(f"Duplicate Transfermarkt player ID {pid}")
            players[pid] = {
                "id": f"transfermarkt:{pid}", "providerId": pid, "name": row["name"],
                "dateOfBirth": date(row["date_of_birth"]), "country": row.get("country_of_citizenship") or None,
                "position": row.get("position") or None, "subPosition": row.get("sub_position") or None,
                "foot": row.get("foot") or None, "heightCm": number(row.get("height_in_cm")),
                "clubSnapshot": {"id": row.get("current_club_id") or None, "name": row.get("current_club_name") or None},
                "url": row["url"], "valuations": [],
            }
    valuation_count = 0
    earliest, latest = None, None
    with paths["player_valuations.csv"].open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"player_id", "date", "market_value_in_eur"}.issubset(reader.fieldnames or []):
            raise ValueError("Unexpected Transfermarkt valuation schema")
        for row in reader:
            pid = row["player_id"]
            if pid not in players:
                continue
            when, value = date(row["date"]), number(row["market_value_in_eur"])
            if when is None or value is None or value < 0:
                raise ValueError("A valuation needs a date and a nonnegative EUR amount")
            players[pid]["valuations"].append({"date": when, "valueEur": value})
            earliest = min(earliest or when, when)
            latest = max(latest or when, when)
            valuation_count += 1
    for player in players.values():
        unique = {(v["date"], v["valueEur"]) for v in player["valuations"]}
        player["valuations"] = [{"date": when, "valueEur": value} for when, value in sorted(unique)]

    links = config["playerLinks"]
    if len({link["statsbombId"] for link in links}) != len(links) or len({link["transfermarktId"] for link in links}) != len(links):
        raise ValueError("Player crosswalk must be one-to-one")
    for link in links:
        sb, tm = sb_players.get(link["statsbombId"]), players.get(link["transfermarktId"])
        if not sb or not tm or sb["player_name"] != link["statsbombName"] or sb["country"]["name"] != link["country"] \
                or tm["name"] != link["transfermarktName"] or tm["country"] != link["country"] or tm["dateOfBirth"] != link["dateOfBirth"]:
            raise ValueError(f"Source records no longer match curated ID link: {link}")
    result = {
        "schemaVersion": "1.0", "preparedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "statsbomb": {"matches": matches, "revision": rev},
        "transfermarkt": {"players": list(players.values()), "kaggleVersion": version,
            "declaredCoverageEnd": config["transfermarkt"]["declaredCoverageEnd"],
            "earliestValuationDate": earliest, "latestValuationDate": latest},
        "playerLinks": links, "files": sorted(sources, key=lambda source: source["file"]),
    }
    destination = ROOT / "src/data/external-football.json"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=destination.parent, suffix=".tmp", delete=False) as temporary:
        temporary_path = Path(temporary.name)
        json.dump(result, temporary, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    try:
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)
    asset_dir = ROOT / "src/data/statsbomb"
    asset_dir.mkdir(exist_ok=True)
    for name in ("statsbomb-logo.png", "statsbomb-license.pdf"):
        (asset_dir / name).write_bytes(paths[name].read_bytes())
    print(json.dumps({"statsbombMatches": len(matches), "transfermarktPlayers": len(players),
        "valuationRecords": valuation_count, "latestValuationDate": latest, "curatedPlayerLinks": len(links)}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "work/datasets")
    parser.add_argument("--refresh", action="store_true", help="Redownload the pinned inputs")
    args = parser.parse_args()
    prepare(args.cache_dir.resolve(), args.refresh)
