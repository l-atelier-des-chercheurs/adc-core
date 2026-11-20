# adc-core

Server core shared by L’Atelier des Chercheurs apps: [do•doc](https://github.com/l-atelier-des-chercheurs/dodoc), slashdoc and Les Cahiers. It serves an app's client, stores its content as flat files, and runs it in Node or, with `adc-electron`, as a desktop app.

How an app is built on it (folder layout, `start()` options, content format, Electron) is described in do•doc's [docs/FORKING.md](https://github.com/l-atelier-des-chercheurs/dodoc/blob/main/docs/FORKING.md).

## Use it in an app

adc-core is not published on npm: apps install it from the git tags of this repo, with a semver range.

```json
"dependencies": {
  "adc-core": "git+https://github.com/l-atelier-des-chercheurs/adc-core.git#semver:^0.1.0"
}
```

The app's lockfile pins the exact commit: `npm update adc-core` moves to the latest tag in the range. npm stores a `git+ssh://` URL there, but as long as this repo is public, `npm ci` downloads the commit's tarball over HTTPS, without an SSH key or `git`. `git` is only needed to resolve the range (`npm install` without a lockfile, `npm update`).

```js
// the app's index.js
const path = require("path");

require("adc-core").start({
  appRoot: path.resolve(__dirname), // reads package.json, settings_base.json, settings.json
  clientDist: path.join(__dirname, "client", "dist"),
  defaultContent: path.join(__dirname, "content"),
});
```

Electron is not a dependency: `adc-electron install` installs the exact version set in `electron/package.json`, inside `node_modules/adc-core/electron/node_modules`. Run it again after each `npm install` / `npm ci` that reinstalls adc-core.

### Install scripts (`allowScripts`)

npm 11 (Node 24) checks dependencies' install scripts (`preinstall`, `install`, `postinstall`) against the `allowScripts` field of the root `package.json`. For now it only warns about unreviewed ones; a future npm release will skip them. npm reads that field from the app's `package.json` only, never from adc-core's, so each app has to approve adc-core's dependencies itself:

```json
"allowScripts": {
  "ffmpeg-static": true,
  "@derhuerst/ffprobe-static": true,
  "sharp": true,
  "puppeteer": true,
  "fast-folder-size": true,
  "bufferutil": true
}
```

- `ffmpeg-static` and `@derhuerst/ffprobe-static` download the ffmpeg / ffprobe binaries, and `sharp` its native binary: without them, media processing fails.
- `puppeteer` downloads Chrome, used for PDF / PNG exports, screenshots and thumbnails (skipped anyway with `PUPPETEER_SKIP_DOWNLOAD`).
- `fast-folder-size` downloads Sysinternals `du` on Windows, for folder sizes.
- `bufferutil` builds an optional native module for `ws`; without it, `ws` falls back to plain JavaScript.

These entries are name-only: they allow any version, so `npm update adc-core` never leaves a dependency unapproved. `npm install-scripts approve <pkg>` writes pinned entries instead (`sharp@0.34.5`), to review again on each update. Run `npm install-scripts ls` in the app to list what is still unreviewed, including the app's own dependencies.

`adc-electron install` is the exception: it installs into `node_modules/adc-core/electron` with that folder as the root, so there npm reads `electron/package.json` from this repo. Of its dependencies, only `electron-winstaller` (used by electron-builder for the `squirrel.windows` target) has an install script.

### Behind a reverse proxy

On a server, apps are usually served by nginx (or another proxy) in front of adc-core. To know each visitor's IP (the API's slow down, 60 requests a minute per IP, and the feedback limit), adc-core reads `X-Forwarded-For` from a proxy on the same machine or on a private network: `"trust_proxy": "loopback, uniquelocal"`, the default in `settings.json`. It covers nginx on the server and nginx in front of a Docker container. The proxy must send the header:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Without it, every visitor shares the proxy's IP, and is slowed down with all the others. A proxy elsewhere: set `trust_proxy` to its address or subnet (any value Express's `trust proxy` takes). `false` never trusts the header; `true`, which would take it from anyone, is taken as `1` (one proxy in front).

## Develop the core with an app

Link your local clone into the app, then go back to the tag before committing the app:

```sh
cd adc-core && npm install --omit=dev --no-package-lock
cd ../dodoc && npm link ../adc-core
# … work on both …
cd ../dodoc && npm install   # back to the version of package.json
```

With a link, the core uses its own `node_modules`: run `npm run install:electron` from the app again to rebuild native modules for Electron.

## Release

1. Add an entry to `CHANGELOG.md` and commit it, then run `npm version patch` (or `minor`) on a clean tree. It runs `npm test` first and stops if a test fails, then bumps `package.json`, commits as `CORE / vX.Y.Z`, tags `vX.Y.Z` and pushes the commit and tag. Never move a published tag. Don't run `npm publish`: the package is `private`.
2. In each app, run `npm update adc-core` (or change the range in `package.json` for a breaking 0.x version), and commit the lockfile.

Node is pinned in `.nvmrc` for CI, within `engines.node`. Electron is pinned exactly in `electron/package.json`, and its embedded Node must match the apps' `.nvmrc` (checked by do•doc's `scripts/check-versions.js`).

## License

[AGPL-3.0](LICENSE.md)
