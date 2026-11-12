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

- **Who can upload:** by default the API listens on `127.0.0.1`, and uploads are
  accepted only there. To accept uploads on any other `HOST`, set
  `GHOSTXI_UPLOAD_TOKEN`; otherwise the server disables the upload routes and logs
  a warning. With a token, every upload request needs `Authorization: Bearer <token>`,
  and the dialog asks for an "Upload key" when the server requires one. If you expose
  the frontend (its `/api` proxy) beyond this machine, set the token too.
- **Disk:** at most 3 packages can be staged at once. Abandoned staging folders are
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

## Not yet supported

Other providers (Second Spectrum, Hawk-Eye, Stats Perform, PFF) need their own
converter into the same validated replay shape. PFF already has a CLI importer
(`PFF_IMPORT.md`). Tracking extracted from broadcast video would be one more
converter of this kind.
