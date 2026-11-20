# Changelog

## Unreleased

- Security: the files the server keeps for itself in the content folder (`meta.txt`, the instance's holding its settings, `tokens.json`, `journal/`) could be loaded as static files through another spelling of their path: `//journal/…`, `/x/../journal/…`, `/x/..%2Fjournal/…`, `\` on Windows, another case on macOS and Windows disks (`/META.TXT`, `/TOKENS.json`), a stream (`tokens.json::$DATA`) or a short name (`TOKENS~1.JSO`) on Windows. The check is now made on the path as the disk will find it: decoded, resolved, in lower case (`server/static-guard.js`). Media are served as before.
- Feedback on the app (a bug, an idea…), sent by anyone and read by the instance's admins only. `POST /_api2/_feedback` (behind the general password, if any) takes `{ type, message, name, email, context }`: `message` required (10,000 characters at most), `type` (40) defaults to `"other"`, `name` (200) and `email` (320, checked) optional, `context` an object of 4,000 characters at most as JSON (the page, the version, the browser…). A logged-in sender's `token_path` is added, as checked by the server. Answers `{ id }`, `400` with a code for an invalid field, `429` (`too_much_feedback`) past 20 sendings per IP or 40 for the whole instance in 10 minutes (the instance-wide limit keeps the disk and the mailbox from filling up, whatever the proxy). `GET /_api2/_feedback` (admins) lists them, newest first. Asked by Les Cahiers du Studio, for its prototype's feedback form.
- With a mailer in `settings.json` (`mailer.host`…) and a contact address for the instance (`contactmail_of_instance`), each one is also emailed to that address, once stored: the subject says its type and begins the message (`[App] Bug : …`), the text has the message, who sent it and its context (the page as a link, with `public_url`, only when it is a path on the instance: `"@evil.example/x"` stays as sent, so that it can't pass for one of its links), and answering it replies to the sender's email (`Reply-To`), when they gave one. A failed email is logged (`feedback_mail_failed` in the journal) and changes nothing for the sender: the feedback is stored either way. `mail.sendMail` takes `replyTo`.
- `trust_proxy` in `settings.json`, for Express's `trust proxy`: behind a reverse proxy, `req.ip` is the visitor's, read from `X-Forwarded-For`. It matters for the API's slow down (`express-slow-down`, 60 requests a minute per IP, then up to 1s more each), and for the feedback limit: without it, every visitor shares the proxy's IP, and a workshop of a dozen people slows everyone down within seconds. Defaults to `"loopback, uniquelocal"`: a proxy on the same machine (nginx in front of the app) or on a private network (nginx in front of a Docker container, which sees the bridge's 172.x address) is trusted; a client reaching the app from the internet can't forge the header. On a local network without a proxy, a device could forge it to get round these limits, nothing more: `req.ip` grants no rights. Another value Express takes (an IP, a subnet, a number of hops), `false` to never trust it. `true`, which would take the header from anyone (express-rate-limit says so in the logs), is taken as `1`: one proxy in front. The proxy must send the header (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
- They are kept one JSON file each in `<content>/feedback/`, refused to static requests like `journal/` and `tokens.json`. Never listed as content nor broadcast: folders couldn't do that, since a private folder's readers are also its writers, and `GET /_api2/<type>` still lists private folders' meta to everyone.
- Releases: changes are listed here under `## Unreleased` until `npm version patch|minor` chooses the version. It stops if that section is missing or empty, and renames it `## X.Y.Z` in the release commit, so each tag has its own changelog (`scripts/changelog-release.js`, run by `preversion` and `version`).
- Tests (`server/tests/test-feedback.js`, in `npm test`): required and limited fields, rate limits per IP and per instance, files written and listed newest first, unreadable ones left out, the email's links. `server/tests/test-static-guard.js`: the internal files refused however their path is written, media served.

## 0.2.13

- `GET /_api2/_version` answers `{ version }`, the app's version (`package.json`, as in `window.app_infos.version`), never cached, without any password or token (pages already show it). Asked by Les Cahiers du Studio: an open page asks it when its socket reconnects, and offers to reload when the server was updated meanwhile.

## 0.2.12

- STL/OBJ thumbs can be framed: `$thumb_view` takes, after its 9 rotation values, 3 optional ones, `[zoom, pan_x, pan_y]`. `zoom` scales the model fitted to its bounds (1: fitted, as before; must be above 0); `pan_x` and `pan_y` move the point shown at the centre of the thumb away from the centre of the model's bounds, in view space (x right, y up), in half-extents of these bounds. Asked by Les Cahiers du Studio, whose 3D viewer saves the view as seen, zoom and pan included. A 9-value `$thumb_view` gives the same thumbs as before; one of another length, or with a zoom of 0 or less, is ignored (default angle).

## 0.2.11

- Optimizing a video (`optimize_media`) with nothing asked but a browser-safe file (no size, bitrate or trim) no longer encodes it again when its streams already are: H.264 8-bit 4:2:0 video, with AAC or MP3 sound or none, is copied into an MP4 (`-c copy`, `-movflags +faststart`), in a fraction of a second and without loss. Asked by Les Cahiers du Studio: an iPhone video picked from the photo library in Safari comes as such a `.MOV` (iOS encodes it in H.264 + AAC, in a QuickTime container). Only the video and sound are kept, not Apple's metadata and timecode tracks. Anything else (HEVC, 10-bit, other sound), or a failed copy, is encoded as before.
- The same at upload: a `.mov`, `.qt`, `.m4v` or `.mkv` whose streams browsers already play is copied into an MP4 before its meta is made, so the media is an MP4 from the start (one media, no duplicate, nothing to convert later). Streamed, it takes a few tens of MB of memory whatever the file's size (fine on a Raspberry Pi): it only costs writing the file once more. A video that can't be copied (HEVC, another codec), a failed copy, or a disk without room for it (the file's size plus 100 MB), is kept as it is. Apps can turn it off with `remuxVideosOnUpload: false` in their settings.
- The copy keeps the file's tags (`-map_metadata 0`, `-movflags use_metadata_tags`): its `creation_time` (`$date_created`) and an iPhone's QuickTime tags, its location (`$infos.location`) included, which the MP4 muxer dropped otherwise. It then writes `creation_time` twice (`"a;b"`): dates read from ffprobe take the first.
- `utils.getRemuxableStreams(metadata)`, `utils.probeMedia(path)`, `utils.remuxToMP4(…)` and `utils.remuxVideoToMP4IfPossible({ source, destination })` (probe, room check, copy, clean up on failure), shared by uploads and `optimize_media`.
- Tests (`server/tests/test-remux.js`, in `npm test`): which ffprobe metadata can be copied; with ffmpeg / ffprobe (ffmpeg-static's, or found in the PATH; skipped without them), an H.264 + AAC `.mov` is copied, an MPEG-4 Part 2 one is encoded, and so is an H.264 one asked a size; the copy keeps the date and the location; nothing is written without room for it. The upload path itself (`file.js`, `_remuxUploadedVideo`) has no test.

## 0.2.10

- PDF thumbs without `pdftoppm` (or when it fails) are no longer blank grey. Puppeteer's clipped screenshot left out what Chrome's PDF viewer draws: it now takes it with `captureBeyondViewport: false`.
- That fallback no longer needs a `/_previewmedia` route in the app: the browser opens the PDF file itself (`#toolbar=0&view=Fit`, the whole first page, portrait or landscape) and waits 2.5s.
- STL/OBJ thumbs no longer fall back to the app's `/_previewmedia` page when the mesh can't be read (no triangles, invalid coordinates): the file gets no thumb (`.no_preview`). In an app without that route, the fallback captured whatever page the app showed instead (its home page). adc-core no longer opens `/_previewmedia` at all.
- `webpreview.captureScreenshot` takes `wait_ms`: a fixed wait instead of the `READY_FOR_EXPORT` signal, for pages that can't send it.
- Tests for PDF thumbs without `pdftoppm`. In `npm test`, with pdftoppm and the browser faked: which way is used (missing, failing or working pdftoppm), the URL given to the browser (no `/_previewmedia`, every path segment encoded, `#` and `?` included), the fixed wait, pdftoppm looked for once, the verbose logs, and a `.no_preview` file when the browser fails too. `npm run test:browser`, not in `npm test` nor in CI: a real Chrome opens portrait and landscape PDFs, and the capture must show the whole page, not a grey viewer.

## 0.2.9

- Verbose logs say how each PDF thumb is made: with `pdftoppm` (and how long it took), or with the browser because `pdftoppm` is missing or failed. Whether `pdftoppm` is found, and its version, is logged once, at the first PDF thumb.

## 0.2.7

- JPEGs with decoder warnings (e.g. "Invalid SOS parameters for sequential JPEG") get a thumb again: sharp aborted on libjpeg warnings by default, it now only fails on real errors (`failOn: "error"`), for thumbs, image conversions and metadata.

## 0.2.6

- README: which of adc-core's dependencies each app should list in its `allowScripts` (npm 11 install script approvals), and why.

## 0.2.5

- New schema field type `datetime`, next to `date`: it keeps the time. It accepts an ISO 8601 string or a millisecond timestamp (number or digit string) and is stored like `$date_created`, as a TOML datetime in UTC with milliseconds (`2026-11-17T13:32:05.250Z`). An empty value is stored as `""`; an unreadable one is refused with `invalid_date_field`, like `date`. `date` is unchanged and still stores `YYYY-MM-DD`.
- `npm test` runs the unit tests (`node:test`, no dependency): content lock, and schema field types in `validateMeta`. `npm version` runs it first and stops before tagging if a test fails, and the Checks workflow runs it on every push.

## 0.2.3

- `$can_be_created_by` (`everyone` / `logged-in`) only applies to creating a folder of that type (`_create`, `_import`). It no longer lets anyone, or any logged-in author, upload, edit or remove files in every folder of that type, nor read the private ones. Those follow the folder's `$contributors` / `$admins` again.
- Copying a folder to another type (`_copy`) or remixing it (`_remix`) now follows the destination type's `$can_be_created_by`, like `_create`.

## 0.2.2

- Request bodies are never decompressed (`express.json({ inflate: false })`): Node < 24.22.1 has an RCE in its Brotli decoder (CVE-2026-111497). `engines.node` and `.nvmrc` move to 24.22.1.

## 0.2.1

- Fake presence is off by default in debug mode: it needs `--fake-presence` (6 fake browsers) or `--fake-presence=<count>`, with `--debug`. `DODOC_FAKE_PRESENCE` is gone. Apps get a `debug-presence` npm script.

## 0.2.0

- ffprobe now comes from `@derhuerst/ffprobe-static` (ffprobe 6.x, same release and install script as `ffmpeg-static`) instead of `ffprobe-static` (4.x, binaries for every platform). Only the current platform's binary is downloaded, so apps can drop their `cleanup-ffprobe` postinstall.

## 0.1.0

First version in its own repo, extracted from do•doc (`packages/adc-core`, previously `core2/`) with its history.

- `start({ appRoot, clientDist, defaultContent, electron, content, views })`: `appInfos` and `settings` are read from `appRoot` (`package.json`, `settings_base.json`, `settings.json`) unless passed.
- Checks the Node.js / Electron version before loading anything.
- Electron main process, and `adc-electron` (`install`, `start`, `watch`, `dist`), with an exact Electron version.
- Content folders declare `$content_app` / `$content_version`, and are locked by one process at a time.
