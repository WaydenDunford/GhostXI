"""Download pinned, named SkillCorner tracking and retain validated action windows.

No inferred identities, interpolated frames or invented locations are added.
Raw full-match downloads are cached locally and verified against Git LFS SHA256.
"""
import concurrent.futures
import csv
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def prepare():
    config = json.loads((ROOT / "config/skillcorner-sources.json").read_text(encoding="utf-8"))
    revision = config["revision"]
    cache = ROOT / "work/datasets/skillcorner" / revision
    cache.mkdir(parents=True, exist_ok=True)
    raw = f"https://raw.githubusercontent.com/SkillCorner/opendata/{revision}"
    media = f"https://media.githubusercontent.com/media/SkillCorner/opendata/{revision}"

    def acquire(name, url, expected=None):
        path = cache / name
        if not path.exists():
            temporary = path.with_suffix(path.suffix + ".download")
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "GhostXI-data-import"})
                with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as out:
                    while block := response.read(1024 * 1024):
                        out.write(block)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        with path.open("rb") as file:
            digest = hashlib.file_digest(file, "sha256").hexdigest()
        if expected and digest != expected:
            raise ValueError(f"Source SHA256 mismatch: {name}")
        print(f"Ready: {name} ({path.stat().st_size:,} bytes)", flush=True)
        return path, {"url": url, "sha256": digest, "bytes": path.stat().st_size}

    (license_file, _) = acquire("LICENSE", f"{raw}/LICENSE")
    destination = ROOT / "src/data/skillcorner/replays"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "LICENSE").write_bytes(license_file.read_bytes())

    def match(mid):
        prefix = f"data/matches/{mid}/{mid}"
        metadata_file, metadata_source = acquire(f"{mid}_match.json", f"{raw}/{prefix}_match.json")
        event_file, event_source = acquire(f"{mid}_dynamic_events.csv", f"{raw}/{prefix}_dynamic_events.csv")
        pointer_file, _ = acquire(f"{mid}_tracking.lfs", f"{raw}/{prefix}_tracking_extrapolated.jsonl")
        pointer = dict(line.split(" ", 1) for line in pointer_file.read_text().splitlines())
        expected = pointer["oid"].removeprefix("sha256:")
        tracking_file, tracking_source = acquire(f"{mid}_tracking.jsonl", f"{media}/{prefix}_tracking_extrapolated.jsonl", expected)
        if tracking_file.stat().st_size != int(pointer["size"]):
            raise ValueError("LFS source size mismatch")
        metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
        if metadata["id"] != mid or len({p["id"] for p in metadata["players"]}) != len(metadata["players"]):
            raise ValueError("Invalid match or roster identity")
        roster = {p["id"]: p for p in metadata["players"]}
        team_ids = {metadata["home_team"]["id"], metadata["away_team"]["id"]}
        with event_file.open(encoding="utf-8", newline="") as file:
            possessions = [r for r in csv.DictReader(file) if r["event_type"] == "player_possession"]
        for row in possessions:
            row["priority"] = (100 if row["lead_to_goal"] == "True" else 0) + (10 if row["end_type"] == "shot" else 0)
        # Include shots and a spread of ordinary source possessions, not fabricated scenarios.
        selected = []
        for row in sorted(possessions, key=lambda r: (-r["priority"], int(r["frame_start"]))):
            if not any(abs(int(row["frame_start"]) - int(other["frame_start"])) < 150 for other in selected):
                selected.append(row)
            if len(selected) == 80:
                break
        by_start = {int(r["frame_start"]): r for r in selected}
        active, eligible = [], []
        count = int(config["windowSeconds"] * 10) + 1
        missing_period_frames = 0

        def complete(frames):
            if len(frames) != count or any(f["period"] != frames[0]["period"] for f in frames):
                return False
            identity = None
            for i, frame in enumerate(frames):
                if frame["frame"] != frames[0]["frame"] + i or frame["timestamp"] is None:
                    return False
                players = frame["player_data"]
                ids = {p["player_id"] for p in players}
                if len(players) != 22 or len(ids) != 22 or not ids.issubset(roster) or (identity is not None and ids != identity):
                    return False
                identity = ids
                if any(sum(roster[p]["team_id"] == team for p in ids) != 11 for team in team_ids):
                    return False
                for p in [frame["ball_data"], *players]:
                    if any(not isinstance(p.get(k), (int, float)) or not math.isfinite(p[k]) for k in ("x", "y")):
                        return False
                    if abs(p["x"]) > metadata["pitch_length"] / 2 or abs(p["y"]) > metadata["pitch_width"] / 2:
                        return False
            detected = sum(p.get("is_detected") is True for f in frames for p in f["player_data"])
            return detected >= count * 5 and any(f["ball_data"].get("is_detected") is True for f in frames)

        with tracking_file.open(encoding="utf-8") as file:
            for line in file:
                frame = json.loads(line)
                row = by_start.get(frame["frame"])
                if row:
                    active.append({"event": row, "frames": []})
                next_active = []
                for window in active:
                    window["frames"].append(frame)
                    if len(window["frames"]) == count:
                        if complete(window["frames"]):
                            eligible.append(window)
                    else:
                        next_active.append(window)
                active = next_active
                missing_period_frames += int(frame["period"] is None)
        chosen = []
        for window in sorted(eligible, key=lambda w: (-w["event"]["priority"], w["frames"][0]["frame"])):
            if any(abs(window["frames"][0]["frame"] - w["frames"][0]["frame"]) <= count for w in chosen):
                continue
            chosen.append(window)
            if len(chosen) == config["windowsPerMatch"]:
                break
        if not chosen:
            raise ValueError(f"Match {mid} has no complete 22-player action windows; no replay created")
        chosen.sort(key=lambda w: w["frames"][0]["frame"])
        result = {"schemaVersion": "skillcorner-clips-1", "metadata": metadata, "windows": chosen,
                  "possessions": possessions, "revision": revision,
                  "files": {"metadata": metadata_source, "events": event_source, "tracking": tracking_source},
                  "excludedFramesWithoutPeriod": missing_period_frames}
        path = destination / f"{mid}.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
        os.replace(temporary, path)
        print(f"Prepared {mid}: {metadata['home_team']['name']} vs {metadata['away_team']['name']}; {len(chosen)} validated windows", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(match, config["matchIds"]))


if __name__ == "__main__":
    prepare()
