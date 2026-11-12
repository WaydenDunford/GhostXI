"""Explicit-manifest PFF importer. No access requests, downloads or inferred coordinates."""
import argparse
import bz2
import hashlib
import json
import math
from pathlib import Path
import sys


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def import_match(manifest_path):
    manifest = read_json(manifest_path)
    game_id = str(manifest.get("gameId", ""))
    require(game_id.isdecimal(), "gameId must be the official PFF numeric identifier.")
    paths = {}
    for key in ("metadata", "roster", "tracking"):
        require(isinstance(manifest.get(key), str), f"Missing manifest path: {key}")
        paths[key] = (manifest_path.parent / manifest[key]).resolve()
    missing = [str(path) for path in paths.values() if not path.is_file()]
    require(not missing, "Missing PFF files: " + ", ".join(missing))
    try:
        from kloppy import pff
        import kloppy
    except ImportError as error:
        raise ValueError("Install optional importer dependencies: python -m pip install -r requirements-pff.txt") from error
    metadata = read_json(paths["metadata"])
    require(isinstance(metadata, list) and len(metadata) == 1, "Kloppy-compatible per-game metadata must contain exactly one object. Inspect/convert CSV distributions explicitly first.")
    meta = metadata[0]
    require(str(meta.get("id")) == game_id, "Metadata game ID does not match manifest.")
    if game_id == "10517":
        require(meta.get("homeTeam", {}).get("id") == "364" and meta.get("awayTeam", {}).get("id") == "363"
                and meta.get("date", "").startswith("2022-12-18"), "10517 metadata is not the verified Argentina-France final.")
    roster = read_json(paths["roster"])
    teams = {str(meta[side]["id"]): meta[side] for side in ("homeTeam", "awayTeam")}
    require(len(teams) == 2, "Two distinct source teams are required.")
    jersey_map, player_map, players = {}, {}, []
    for row in roster:
        pid, tid, jersey = str(row["player"]["id"]), str(row["team"]["id"]), int(row["shirtNumber"])
        require(tid in teams and pid not in player_map and (tid, jersey) not in jersey_map, "Ambiguous roster identity/team/jersey mapping.")
        player = {"id": "pff:" + pid, "providerId": pid, "teamId": "pff:" + tid,
                  "name": row["player"]["nickname"], "position": row.get("positionGroupType"),
                  "secondaryPositions": [], "jerseyNumber": jersey, "isStarter": row.get("started"),
                  "dateOfBirth": row["player"].get("dateOfBirth"), "source": "pff"}
        players.append(player)
        player_map[pid] = player
        jersey_map[(tid, jersey)] = player
    pitch = meta["stadium"]["pitches"][0]
    length, width, fps = float(pitch["length"]), float(pitch["width"]), float(meta["fps"])
    require(90 <= length <= 120 and 45 <= width <= 90 and 1 <= fps <= 120, "Invalid pitch dimensions/frame rate.")
    opener = bz2.open if paths["tracking"].suffix == ".bz2" else open
    with opener(paths["tracking"], "rt", encoding="utf-8") as stream:
        raw_frames = [json.loads(line) for line in stream if line.strip()]
    require(raw_frames and all("frameNum" in frame and "periodElapsedTime" in frame for frame in raw_frames), "Unsupported PFF tracking structure.")
    # Kloppy supplies verified roster/timestamp parsing. Preserve the actual raw axes
    # rather than accepting any implicit extra-time orientation changes from a loader.
    dataset = pff.load_tracking(meta_data=str(paths["metadata"]), roster_meta_data=str(paths["roster"]),
                                raw_data=str(paths["tracking"]), coordinates="pff", only_alive=False)
    require(str(dataset.metadata.game_id) == game_id, "Kloppy game ID mismatch.")
    parsed = {frame.frame_id: frame for frame in dataset.records}
    require(len(parsed) == len(dataset.records), "Duplicate Kloppy source frame IDs.")
    seen, prior, frames, markers, gaps = set(), {}, [], [], []
    all_ids = [player["id"] for player in players]

    def point(value, issues, label):
        if not value or value.get("x") is None or value.get("y") is None:
            return None
        x, y = float(value["x"]), float(value["y"])
        require(math.isfinite(x) and math.isfinite(y), "Nonfinite source coordinate.")
        nx, ny = (x / length + .5) * 100, (.5 - y / width) * 100
        if not (0 <= nx <= 100 and 0 <= ny <= 100):
            issues.append({"id": label, "reason": "outside_pitch", "raw": {"x": x, "y": y}})
            return None
        return {"x": nx, "y": ny}

    for raw in raw_frames:
        period = raw.get("period")
        if period is None:
            continue  # outside a provider match period; explicitly reported below
        require(period in (1, 2, 3, 4), "Unsupported source period; shootouts must be kept separate.")
        fid, seconds = int(raw["frameNum"]), float(raw["periodElapsedTime"])
        require(fid not in seen and math.isfinite(seconds) and seconds >= 0, "Invalid/duplicate tracking timestamp or frame ID.")
        seen.add(fid)
        require(fid in parsed and abs(parsed[fid].timestamp.total_seconds() - seconds) <= .000002
                and parsed[fid].period.id == period, "Kloppy/raw timestamp alignment failed.")
        if period in prior:
            previous = prior[period]
            require(seconds > previous[0] and fid > previous[1], "Frame times/IDs must increase within each period.")
            if fid != previous[1] + 1 or seconds - previous[0] > 1.5 / fps:
                gaps.append({"period": period, "fromSec": previous[0], "toSec": seconds, "reason": "source_gap"})
        prior[period] = (seconds, fid)
        positions, issues, source_quality = {pid: None for pid in all_ids}, [], {}
        for side, tid in (("homePlayersSmoothed", str(meta["homeTeam"]["id"])), ("awayPlayersSmoothed", str(meta["awayTeam"]["id"]))):
            observed = set()
            for observation in raw.get(side) or []:
                key = (tid, int(observation["jerseyNum"]))
                require(key in jersey_map and key not in observed, "Unmapped or duplicated source jersey/team observation.")
                observed.add(key)
                player = jersey_map[key]
                positions[player["id"]] = point(observation, issues, player["id"])
                source_quality[player["id"]] = {key: value for key, value in observation.items() if key not in ("x", "y", "jerseyNum")}
                if positions[player["id"]] is not None:
                    require(any(p.player_id == player["providerId"] and str(p.team.team_id) == tid for p in parsed[fid].players_data), "Kloppy player-to-roster mapping differs from raw data.")
        marker = raw.get("game_event")
        if marker:
            markers.append({"id": f"pff:{game_id}:frame:{fid}", "sourceFrame": fid, "period": period,
                            "periodTimeSec": seconds, "type": marker.get("game_event_type"), "raw": marker})
        frames.append({"sourceFrame": fid, "period": period, "periodTimeSec": seconds,
                       "videoTimeSec": raw.get("videoTime"), "ball": point(raw.get("ballsSmoothed"), issues, "ball"),
                       "players": positions, "dataStatus": "ESTIMATED", "quality": {"issues": issues, "provider": source_quality}})
    require(len(frames) >= 2, "No usable source frames.")
    event_rows, aligned, event_limitations = [], False, ["No synchronized event file has been imported; embedded tracking markers are not pass/shot events."]
    if manifest.get("events"):
        paths["events"] = (manifest_path.parent / manifest["events"]).resolve()
        require(paths["events"].is_file(), "Missing declared PFF events file.")
        events = read_json(paths["events"])
        mapping = manifest.get("eventMapping", {})
        require(isinstance(events, list) and set(("gameId", "id", "frameId", "type")).issubset(mapping),
                "Inspect events.json and provide explicit flat eventMapping for gameId/id/frameId/type. Unsupported nested formats must be converted explicitly.")
        by_frame = {frame["sourceFrame"]: frame for frame in frames}
        for event in events:
            if str(event.get(mapping["gameId"])) != game_id:
                continue
            fid = event.get(mapping["frameId"])
            if fid not in by_frame:
                event_rows.append({"id": str(event[mapping["id"]]), "type": event[mapping["type"]], "sourceFrame": fid, "aligned": False, "raw": event})
                continue
            frame = by_frame[fid]
            event_rows.append({"id": str(event[mapping["id"]]), "type": event[mapping["type"]], "sourceFrame": fid,
                               "period": frame["period"], "periodTimeSec": frame["periodTimeSec"], "aligned": True, "raw": event})
        aligned = bool(event_rows) and all(event["aligned"] for event in event_rows)
        event_limitations = [] if aligned else ["Some events lack source-frame alignment within imported tracking; momentum/scenario selection is disabled."]
    files = [{"role": role, "name": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size} for role, path in paths.items()]
    return {"schemaVersion": "pff-1", "id": "pff:" + game_id, "providerId": game_id, "provider": "pff",
            "name": meta["homeTeam"]["name"] + " vs " + meta["awayTeam"]["name"], "date": meta["date"][:10],
            "teams": [{"id": "pff:" + tid, "providerId": tid, "name": team["name"]} for tid, team in teams.items()],
            "score": None, "scoreSource": None, "pitch": {"length": length, "width": width}, "fps": fps,
            "players": players, "frames": frames, "events": event_rows, "trackingMarkers": markers,
            "homeAttacksRightByPeriod": {"1": meta.get("homeTeamStartLeft"), "2": not meta["homeTeamStartLeft"] if isinstance(meta.get("homeTeamStartLeft"), bool) else None,
                                         "3": meta.get("homeTeamStartLeftExtraTime"), "4": not meta["homeTeamStartLeftExtraTime"] if isinstance(meta.get("homeTeamStartLeftExtraTime"), bool) else None},
            "eventAlignment": {"verified": aligned, "method": "exact source frame ID; no clock guessing"},
            "quality": {"gaps": gaps, "omittedNonPeriodFrames": len(raw_frames) - len(frames),
                        "coordinateStatus": "ESTIMATED", "missingValues": "null; bench and off-camera players are not imputed"},
            "source": {"name": "PFF FC", "url": "https://www.blog.fc.pff.com/blog/pff-fc-release-2022-world-cup-data",
                       "distribution": manifest.get("distribution", "user-supplied requested-access files"), "files": files,
                       "kloppyVersion": kloppy.__version__, "coordinateTransform": "x=(rawX/length+.5)*100; y=(.5-rawY/width)*100; raw stadium axes retained"},
            "limitations": ["Broadcast smoothed coordinates are provider estimates, not claimed direct observations.",
                            "No silent interpolation or fabricated source coordinates."] + event_limitations}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = import_match(args.manifest.resolve())
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(".tmp")
        temporary.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")
        temporary.replace(args.output)
        print(json.dumps({"matchId": result["id"], "frames": len(result["frames"]), "gaps": len(result["quality"]["gaps"]), "eventsAligned": result["eventAlignment"]["verified"]}))
    except Exception as error:
        print("PFF_IMPORT_FAILED: " + (str(error) or type(error).__name__), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
