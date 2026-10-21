# Changelog

## 0.2.0

- ffprobe now comes from `@derhuerst/ffprobe-static` (ffprobe 6.x, same release and install script as `ffmpeg-static`) instead of `ffprobe-static` (4.x, binaries for every platform). Only the current platform's binary is downloaded, so apps can drop their `cleanup-ffprobe` postinstall.

## 0.1.0

First version in its own repo, extracted from do•doc (`packages/adc-core`, previously `core2/`) with its history.

- `start({ appRoot, clientDist, defaultContent, electron, content, views })`: `appInfos` and `settings` are read from `appRoot` (`package.json`, `settings_base.json`, `settings.json`) unless passed.
- Checks the Node.js / Electron version before loading anything.
- Electron main process, and `adc-electron` (`install`, `start`, `watch`, `dist`), with an exact Electron version.
- Content folders declare `$content_app` / `$content_version`, and are locked by one process at a time.
