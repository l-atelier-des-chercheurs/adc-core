# Changelog

## 0.2.10

- PDF thumbs without `pdftoppm` (or when it fails) are no longer blank grey. Puppeteer's clipped screenshot left out what Chrome's PDF viewer draws: it now takes it with `captureBeyondViewport: false`.
- That fallback no longer needs a `/_previewmedia` route in the app: the browser opens the PDF file itself (`#toolbar=0&view=Fit`, the whole first page, portrait or landscape) and waits 2.5s. STL/OBJ thumbs still go through `/_previewmedia`.
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
