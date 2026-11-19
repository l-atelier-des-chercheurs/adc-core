# TODO

## Dependency update and `npm audit`

Started on 2026-11-17, then put aside. What was found:

### Audit

- **Root** (19 vulnerabilities, 14 high): almost all fixed only by a major version: `puppeteer` 25, `sharp` 0.35, `nodemailer` 10, `archiver` 8. `extractd` (optional) has no fix: it depends on a vulnerable `exiftool-vendored` and has no newer release.
- **`electron/`** (15 vulnerabilities, 1 critical: `tar`): `npm audit fix` handles `tar`, `undici` and `fast-uri` within range. `electron` itself needs 44.10+. What remains comes from `@electron/rebuild` → `node-gyp` → `tinyglobby` / `picomatch` and from `electron-builder` → `minimatch`, with no fix in their latest versions (npm suggests downgrades: ignore them).
- The root has no lockfile: to audit it, copy `package.json` elsewhere and run `npm install --package-lock-only` there first.

### Majors: what each one changes for us

| Package | Breaking change | Impact on adc-core |
|---|---|---|
| `archiver` 8 | ESM, exports classes | Replace `archiver("zip", opts)` with `new ZipArchive(opts)` (`const { ZipArchive } = require("archiver")`) in `server/downloads.js` (×3) and `server/utils/path-utils.js` |
| `puppeteer` 25 | ESM only; `executablePath()` / `defaultArgs()` return a Promise | `require("puppeteer").launch` still works on Node 24. We only read `PUPPETEER_EXECUTABLE_PATH`, never call `executablePath()`. A new Chrome must be downloaded |
| `sharp` 0.35 | `limitInputChannels` default 5, removed deprecated options, no `install` script | None of the removed options are used. Remove `sharp` from the `allowScripts` list in the README |
| `nodemailer` 10 (8, 9) | `NoAuth` → `ENOAUTH`; TLS checked when fetching remote content | Neither used. `require()` shape unchanged |
| `sharedb` 8 (6, 7) | Bare json0 ops rejected; multi-channel queries no longer polled | We use `rich-text`, not json0. Check that the apps' sharedb client still works with the server |
| `electron-store` 12 | Requires Electron 35+, `conf` 16 | `electron/main.js` already uses `.default` and simple string keys. Test in Electron |
| `write-file-atomic` 8 | Node `^22.22.2 \|\| ^24.15.0 \|\| >=26` | Fine with Node 24.22.1 |
| `undici` 8 | Dispatcher v2 | **Do not upgrade**: a `new Agent()` from undici 8 passed to Node 24's built-in `fetch` fails (`invalid onRequestStart method`). Stay on the latest 7.x |

### Electron and Node

- Electron 44.9.0 (current) embeds Node 24.22.0, **below** the 24.22.1 required since 0.2.2 (Brotli CVE).
- 44.10.0 / 44.10.1 embed Node 24.22.1 (matches `.nvmrc`) and fix the Electron advisory.
- 44.11.x embeds Node 24.22.2: it would also mean moving `.nvmrc` and `engines.node` to 24.22.2, here and in every app.

### Before releasing

- `npm test`, then load the server modules as CI does.
- Try by hand in an app: ZIP download (archiver), PDF / PNG export and thumbnails (puppeteer), image import (sharp), collaborative editing (sharedb), sending a mail (nodemailer), choosing a content folder in Electron (electron-store).
- CHANGELOG entry, and an update to the `allowScripts` section of the README.

## Client: catching up after a disconnection

Noted on 2026-11-19, from Les Cahiers du Studio v3. The code is in the apps' client, not in this repository: dodoc's `client/src/adc-core/api.js` (`rejoinRooms`, `refreshStoreForRoom`, `markAllStoreStale`). Les Cahiers already does both points below, in `client-vue3/src/stores/content.js` (`refresh`).

- **Rejoin the room, then fetch.** `rejoinRooms` fetches a room, then emits `joinRoom`. A change broadcast between the server's answer and the join is lost. Joining first, then fetching, leaves no gap: an event that is also in the fetched content is applied twice, which is harmless.
- **Also fetch when the tab comes back.** After a phone's sleep, Socket.IO only notices the dead connection once its ping fails: up to about 45 s with the defaults (`pingInterval` 25 s + `pingTimeout` 20 s). Until then the page shows stale content while saying it is connected. On `visibilitychange`, if the tab was hidden for more than 30 s, fetch every subscribed room again, even if the socket looks connected.
- Also worth it: fetch the rooms in parallel rather than one after the other, and run one catch-up at a time (a reconnection and a return to the tab often come together).

## Optimize: replace the original on the server

Noted on 2026-11-19, asked by Les Cahiers du Studio v3: its media window has a "Convertir" button for videos and sounds browsers can't all play (a `.MOV`, `.amr`…). It runs the `optimize_media` task through `_optimize`, then the new media takes the original's place: the client removes the original once `taskEnded` says `completed` (`client-vue3/src/components/MediaModal.vue`, `convert`; `client-vue3/src/stores/content.js`, `convertFile`).

- **The problem.** The conversion runs on the server and ends even if the tab is closed, but removing the original depends on the tab: closed too early, the cahier keeps both medias. Les Cahiers works around it with a notification that can't be closed and the browser's `beforeunload` question, asking not to close or reload the tab.
- **Proposal.** A `replace_original: true` instruction for `optimize_media`: once the new file is added (`file.addFileToFolder`, which already copies the meta with `getCopyableMediaMeta`), the server removes the original (media, meta and thumbs) and emits `fileCreated` then `fileRemoved`, so that no tab is needed and no duplicate is left. The `taskEnded` message could also give the original's path, for clients to follow the new media (Les Cahiers moves its window to it). Useful for do•doc too.
- **To decide.** The converted file gets another name (`.MOV` → `.mp4`), so another path: anything pointing to the original by its path (another media, a publication, an export) breaks, replaced automatically or not. Nothing does in Les Cahiers for now; check do•doc's publications.
- Once released, Les Cahiers drops its client-side removal, the `beforeunload` question, and the "don't close this tab" wording (the progress notification stays).
- **Less needed since uploads copy H.264 + AAC videos into an MP4** (`_remuxUploadedVideo`, see CHANGELOG): an iPhone video picked from the photo library no longer needs converting. What still does: HEVC (an iPhone video sent through Files), other codecs, sounds, and medias uploaded before. Still worth doing for those, as their conversion is a real encoding, minutes long on a Raspberry Pi.
- **Not done at upload, on purpose:** encoding (HEVC…) while the upload request waits. Too slow on a Raspberry Pi; it stays on demand.
