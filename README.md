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

Use the `git+https://` form, not `github:`: npm would store a `git+ssh://` URL in the lockfile, which fails in CI and Docker without an SSH key. Installing needs `git`. The app's lockfile pins the exact commit: `npm update adc-core` moves to the latest tag in the range.

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

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`, commit, then tag and push: `git tag v0.2.0 && git push --follow-tags`. Never move a published tag.
2. In each app, run `npm update adc-core` (or change the range in `package.json` for a breaking 0.x version), and commit the lockfile.

Node is pinned in `.nvmrc` for CI, within `engines.node`. Electron is pinned exactly in `electron/package.json`, and its embedded Node must match the apps' `.nvmrc` (checked by do•doc's `scripts/check-versions.js`).

## License

[AGPL-3.0](LICENSE.md)
