// node --test server/tests/test-static-guard.js
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { isInternalPath } = require("../static-guard");

test("the server's own files are refused", () => {
  for (const p of [
    "/tokens.json",
    "/meta.txt",
    "/projects/a/meta.txt",
    "/journal",
    "/journal/",
    "/journal/2026-11-20_16-36-13.jsonl",
    "/feedback/2026-11-20_11-00-00_a1b2c3.json",
  ])
    assert.equal(isInternalPath(p), true, p);
});

test("however their path is written", () => {
  for (const p of [
    "//journal/a.jsonl",
    "/x/../journal/a.jsonl",
    "/./feedback/a.json",
    "/x/..%2Fjournal/a.jsonl",
    "/x\\..\\journal\\a.jsonl",
    "/Journal/a.jsonl",
    "/FEEDBACK/a.json",
    "/META.TXT",
    "/projects/a/Meta.Txt",
    "/TOKENS.json",
    "/%74okens.json",
    "/tokens.json::$DATA",
    "/TOKENS~1.JSO",
    "/meta.txt.",
    "/journal./a.jsonl",
  ])
    assert.equal(isInternalPath(p), true, p);
});

test("media, pages and the API are not", () => {
  for (const p of [
    "/",
    "/projects/a/image.jpg",
    "/projects/journal/a.jpg",
    "/projects/a/feedback.pdf",
    "/logo.png",
    "/_api2/_feedback",
    "/_client/build.js",
    "/%E0%A4%A",
  ])
    assert.equal(isInternalPath(p), false, p);
});
