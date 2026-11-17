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
