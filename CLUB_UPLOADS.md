# Club uploads: bring your own match data

Open data is always historical: current-season tracking belongs to leagues and
clubs. A club that licenses tracking can add its own recent matches in Match Lab.
Click **Upload club data** next to the tracking match picker.

## Supported package

The three files SkillCorner delivers per match to licensed clubs. They use the same
schema as [SkillCorner Open Data](https://github.com/SkillCorner/opendata):

| Part | File |
| --- | --- |
| Match | `<id>_match.json` (teams, roster, pitch size, score, competition) |
| Events | `<id>_dynamic_events.csv` (player possessions; used to anchor replay windows) |
| Tracking | `<id>_tracking_extrapolated.jsonl` (10 fps, one JSON frame per line) |

## What happens on import

1. Each file is streamed to `data/uploads/staging/` (git-ignored) with a size limit.
2. `src/data/skillcorner-package.js` selects up to five 8-second windows. It uses
   the same rules as `scripts/prepare-skillcorner.py`: all 22 players and the ball
   on the pitch, a stable 11v11 lineup, and enough detected positions. A test
   checks that both pick identical windows.
3. The package goes through the same `normalizeSkillCorner` and `validateReplay`
   checks as open data. Files from different matches are rejected.
4. The bundle is saved to `data/uploads/replays/<id>.json`. The API reloads it
   without a restart, and Match Lab opens the new match.

Uploaded matches are labelled **Club upload · SkillCorner format**. They are never
presented as public data. GhostXI checks hashes, identities and coordinates, but it
cannot verify the club's licence. The data stays on the server that received it and
is never committed or redistributed.

## Access and limits

- **Who can upload:** uploads need a key. Set `GHOSTXI_UPLOAD_TOKEN` and every upload
  request must send `Authorization: Bearer <token>`. The dialog asks for an "Upload
  key" when the server requires one. Without a key, uploads are disabled.
- **Local demo exception:** `npm run dev` / `npm start` set
  `GHOSTXI_ALLOW_LOCAL_UPLOADS=1`. That is safe only because `scripts/run-app.js` binds
  both the API and the frontend proxy to `127.0.0.1`. Even then, a request passes only
  if it is direct and same-machine: loopback client address and `Host`, and no
  `Forwarded`/`X-Forwarded-*` from elsewhere. Anything else needs the key. If you run
  the servers some other way, or expose them, use a key.
- **Disk:** at most 3 packages can be staged at once. A slot is reserved atomically,
  so simultaneous requests cannot exceed the cap. Abandoned staging folders are
  deleted after 30 minutes. Size caps: match 5 MB, events 25 MB, tracking 300 MB.
- **Memory:** tracking is read line by line, and a line over 1 MB is rejected before
  it is buffered. A file may hold at most 250,000 frames and 150,000 event rows. One
  import runs at a time.
- **Not yet:** a single shared key means a single uploader identity. Several clubs
  sharing one server would need per-club accounts and ownership of uploaded
  matches. Today any key holder can replace an earlier upload of the same match,
  but never the open data.

## API

```text
PUT  /api/v1/uploads/<upload-id>/match      raw file body
PUT  /api/v1/uploads/<upload-id>/events     raw file body
PUT  /api/v1/uploads/<upload-id>/tracking   raw file body
POST /api/v1/uploads/<upload-id>/import     → { id, name, date, competition, season, score, windows }
```

`<upload-id>` is 8–64 lowercase letters, digits or hyphens; the frontend uses a UUID.

## Demo package

To demonstrate an upload without club data, use a SkillCorner Open Data match that
is not in `config/skillcorner-sources.json`. Western United vs Sydney FC, 2025-04-27
(MIT licence, revision `4340d274572876239c154c90bc507a9b3250a656`):

```text
https://raw.githubusercontent.com/SkillCorner/opendata/4340d274572876239c154c90bc507a9b3250a656/data/matches/2013725/2013725_match.json
https://raw.githubusercontent.com/SkillCorner/opendata/4340d274572876239c154c90bc507a9b3250a656/data/matches/2013725/2013725_dynamic_events.csv
https://media.githubusercontent.com/media/SkillCorner/opendata/4340d274572876239c154c90bc507a9b3250a656/data/matches/2013725/2013725_tracking_extrapolated.jsonl
```

## Not yet supported

Other providers (Second Spectrum, Hawk-Eye, Stats Perform, PFF) need their own
converter into the same validated replay shape. PFF already has a CLI importer
(`PFF_IMPORT.md`). Tracking extracted from broadcast video would be one more
converter of this kind.
