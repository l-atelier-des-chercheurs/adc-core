/**
 * meta-utils tests: schema field types in validateMeta
 *
 * Usage:
 *   node --test server/tests/test-meta-utils.js
 */

const test = require("node:test");
const assert = require("node:assert");

global.dev = global.dev || { logfunction() {}, error() {}, log() {} };

const API = {};
Object.assign(API, require("../utils/meta-utils")(API));

const fields = {
  date_timeline: { type: "datetime" },
  start_date: { type: "date" },
};

function validate(new_meta) {
  return API.validateMeta({ fields, new_meta, context: "update" });
}

// Write to TOML and read back, as storeContent / readMetaFile do
function roundTrip(meta) {
  const TOML = require("@iarna/toml");
  const stored = TOML.stringify(meta);
  return { stored, reread: API.parseMeta(stored) };
}

test("datetime: ISO 8601 with time and offset keeps the instant", () => {
  const meta = validate({ date_timeline: "2026-11-17T14:32:05.250+01:00" });
  assert.ok(meta.date_timeline instanceof Date);
  assert.strictEqual(
    meta.date_timeline.toISOString(),
    "2026-11-17T13:32:05.250Z"
  );
});

test("datetime: millisecond timestamp, as number or digit string", () => {
  for (const value of [1763371701123, "1763371701123", " 1763371701123 "]) {
    const meta = validate({ date_timeline: value });
    assert.strictEqual(
      meta.date_timeline.toISOString(),
      "2025-11-17T09:28:21.123Z",
      `input ${JSON.stringify(value)}`
    );
  }
});

test("datetime: a Date read back from a meta file is accepted", () => {
  const { reread } = roundTrip({ date_timeline: new Date(1763371701123) });
  const meta = validate({ date_timeline: reread.date_timeline });
  assert.strictEqual(
    meta.date_timeline.toISOString(),
    "2025-11-17T09:28:21.123Z"
  );
});

test("datetime: empty values are stored as an empty string", () => {
  for (const value of ["", "   ", null, undefined]) {
    const meta = validate({ date_timeline: value });
    assert.strictEqual(meta.date_timeline, "", `input ${String(value)}`);
  }
});

test("datetime: unreadable value is refused like date", () => {
  for (const value of ["pas une date", "2026-13-45T99:00:00Z", NaN]) {
    assert.throws(
      () => validate({ date_timeline: value }),
      (err) =>
        err.code === "invalid_date_field" &&
        err.err_infos === "date_timeline",
      `input ${String(value)}`
    );
  }
});

test("datetime: stored in the same TOML format as $date_created", () => {
  const meta = validate({ date_timeline: "2026-11-17T14:32:05.250+01:00" });
  meta.$date_created = API.getCurrentDate();
  const { stored, reread } = roundTrip(meta);

  assert.match(stored, /^date_timeline = 2026-11-17T13:32:05\.250Z$/m);
  assert.match(
    stored,
    /^"\$date_created" = \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m
  );
  assert.ok(reread.date_timeline instanceof Date);
  assert.strictEqual(
    JSON.stringify(reread.date_timeline),
    '"2026-11-17T13:32:05.250Z"'
  );
});

test("date: still normalized to YYYY-MM-DD", () => {
  assert.strictEqual(
    validate({ start_date: "2026-11-17" }).start_date,
    "2026-11-17"
  );
  assert.strictEqual(validate({ start_date: "" }).start_date, "");

  const from_iso = validate({ start_date: "2026-11-17T12:00:00" }).start_date;
  assert.strictEqual(from_iso, "2026-11-17");

  const { stored } = roundTrip({ start_date: from_iso });
  assert.strictEqual(stored.trim(), 'start_date = "2026-11-17"');
});

test("date: invalid calendar date is refused", () => {
  assert.throws(
    () => validate({ start_date: "2026-02-30" }),
    (err) =>
      err.code === "invalid_date_field" && err.err_infos === "start_date"
  );
});
