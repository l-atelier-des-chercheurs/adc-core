// The changelog follows releases (package.json's scripts, run by
// `npm version patch|minor`): entries go under "## Unreleased", whose heading
// becomes the version's when it is released, in the release commit and tag.
//
// usage:
//   node scripts/changelog-release.js check    preversion: something to release?
//   node scripts/changelog-release.js release  version: "## Unreleased" → "## x.y.z"

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const changelog_path = path.join(root, "CHANGELOG.md");
const UNRELEASED = /^## Unreleased[ \t]*$/m;

function fail(message) {
  console.error(`CHANGELOG.md: ${message}`);
  process.exit(1);
}

const [mode] = process.argv.slice(2);
if (mode !== "check" && mode !== "release")
  fail(`unknown mode "${mode}" (check or release)`);

const text = fs.readFileSync(changelog_path, "utf8");
const match = UNRELEASED.exec(text);
if (!match) fail('no "## Unreleased" section: nothing to release?');

// its entries, up to the next section
const after = text.slice(match.index + match[0].length);
const next = after.search(/^## /m);
if (!/^- /m.test(next === -1 ? after : after.slice(0, next)))
  fail('"## Unreleased" has no entry');

if (mode === "check") process.exit(0);

// in npm version's "version" step, package.json has the new version already
const { version } = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
);
if (text.split("\n").some((line) => line.trim() === `## ${version}`))
  fail(`"## ${version}" is there already`);

fs.writeFileSync(changelog_path, text.replace(UNRELEASED, `## ${version}`));
console.log(`CHANGELOG.md: "## Unreleased" is now "## ${version}"`);
