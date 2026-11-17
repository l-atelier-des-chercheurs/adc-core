# Changelog

## 0.2.5

- New schema field type `datetime`, next to `date`: it keeps the time. It accepts an ISO 8601 string or a millisecond timestamp (number or digit string) and is stored like `$date_created`, as a TOML datetime in UTC with milliseconds (`2026-11-17T13:32:05.250Z`). An empty value is stored as `""`; an unreadable one is refused with `invalid_date_field`, like `date`. `date` is unchanged and still stores `YYYY-MM-DD`.

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
