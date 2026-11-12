# PFF FC import and access status

The full requested-access World Cup distribution was **not found locally**. The
official [PFF announcement](https://www.blog.fc.pff.com/blog/pff-fc-release-2022-world-cup-data)
describes tracking, events and metadata for 64 matches and directs users to request
access. Obtain the files through that page and retain the granted usage terms.
No request, login, access-restriction bypass or contact message was submitted.

The official [Kloppy guide](https://kloppy.pysport.org/user-guide/loading-data/pff/)
identifies Argentina–France, 18 December 2022, as PFF game **10517**. Its example uses
per-game metadata/roster JSON, while the announcement also describes CSV metadata
tables. Inspect the delivered distribution: these layouts are not interchangeable.
The importer does not guess folder names or join tables by names.

## What was verified locally

Kloppy 3.19.1 was installed in the optional local `work/pff-venv` environment. The
Node runtime has no new dependency. A public **parser test excerpt**, published in
[Kloppy's own tests](https://github.com/PySport/kloppy/blob/a9651eba7c4dbbe2d2fc6d4cffb4aea63fadac11/kloppy/tests/test_pff.py),
was downloaded at that pinned revision to `work/datasets/pff-kloppy-tests/`:

- `pff_metadata_10517.json`
- `pff_rosters_10517.json`
- `pff_10517.jsonl`

The actual excerpt parses into 200 frames in four periods. It has large gaps,
missing off-camera/bench observations, and no imported synchronized `events.json`.
It cannot supply a continuous eight-second complete-lineup scenario and is excluded
from playable matches. A prepared local parser artifact exists at
`src/data/pff/10517.json`; the registry calls it `public_parser_excerpt_only`.
This is not the full match or evidence that requested access has been granted.

## Import officially obtained files

```powershell
python -m venv work/pff-venv
& work/pff-venv/Scripts/python.exe -m pip install -r requirements-pff.txt
```

Create a JSON manifest outside version control. Replace every path with a file
you actually received; relative paths resolve against the manifest's directory:

```json
{
  "gameId": "10517",
  "metadata": "ACTUAL_PER_GAME_METADATA_JSON_PATH",
  "roster": "ACTUAL_PER_GAME_ROSTER_JSON_PATH",
  "tracking": "ACTUAL_TRACKING_JSONL_OR_JSONL_BZ2_PATH",
  "distribution": "official requested-access delivery"
}
```

```powershell
& work/pff-venv/Scripts/python.exe scripts/prepare-pff.py `
  --manifest data/pff/manifest.json --output src/data/pff/10517.json
npm test
npm run start:api
```

The output path above replaces the optional public parser excerpt with your real
delivery. Restart the API to reload. `data/pff`, `src/data/pff`, source caches and
the optional Python environment are gitignored. Source files and credentials are
never copied to the frontend build or integration package.

The current loader accepts the actual inspected Kloppy-compatible JSON structures.
If the delivery instead uses CSV tables, inspect their documented schema and make
an explicit per-game conversion first; the importer fails clearly rather than
guessing a conversion. Full-match imports use Kloppy's in-memory loader and may
need substantial memory. A full requested-access delivery has not been tested.

## Validation and representation

`scripts/prepare-pff.py` calls `kloppy.pff.load_tracking` with the real metadata,
roster and tracking paths. It independently validates official game ID, team IDs,
unique roster IDs and team/jersey combinations, increasing frame IDs and within-period
timestamps, and the exact Kloppy/raw timestamp mapping. For 10517 the source team
IDs/date must identify the documented final.

Provider raw stadium axes are preserved through an explicit normalization:
`x=(rawX/pitchLength+.5)*100`, `y=(.5-rawY/pitchWidth)*100`. Kloppy's roster/time
parsing is reused; the exporter avoids silently adopting any additional extra-time
orientation transformation. Source `frameNum`, `periodElapsedTime`, period, optional
video time, roster IDs, quality fields, embedded markers and SHA-256 file hashes
remain separate. `frameNum/fps` is never called match clock time.

PFF `*Smoothed` coordinates are conservatively labeled **ESTIMATED** provider
tracking. Null/missing observations remain null. Out-of-pitch source positions are
retained in a quality issue with raw coordinates and represented as null in the
normalized pitch view; they are not clipped or invented. Frame gaps are reported
and never interpolated. The server independently checks the normalized artifact.

## Event alignment and current limits

Tracking `game_event` markers are retained with their original type/raw content.
They are not automatically converted into shots, passes or a fictional momentum
series. A delivered event file may be declared with `events` and `eventMapping`.
The currently supported explicit mapping is a flat JSON array with mapped
`gameId`, `id`, `frameId`, `type` fields. Events align only by exact source-frame ID
from the same match; unmatched events remain marked unaligned. Unsupported nested
schemas need an explicit source-specific converter after inspection.

An aligned PFF event can identify a scenario using `event:<source-event-id>`, if
there are eight subsequent seconds of complete, stable 22-player source tracking.
PFF semantic pass/shot momentum ranking is **not implemented against an actual
delivered events schema**: recommendations remain empty instead of inventing
event meanings. Score is null because the inspected metadata contains no score;
there is no manual score override masquerading as a source observation.

Kloppy software licensing and PFF dataset usage permission are separate. Keep the
Kloppy license and PFF attribution/terms; this project does not redistribute the
test excerpt or treat its public availability as a grant for the full dataset.
