// node --test server/tests/test-history.js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs-extra");

const history = require("../history");

let dir, previous;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-history-"));
  previous = global.pathToUserContent;
  global.pathToUserContent = dir;
});
after(async () => {
  global.pathToUserContent = previous;
  await fs.remove(dir);
});

const fileOf = (path_to_folder) =>
  path.join(dir, path_to_folder, history.META_ARCHIVE_FILENAME);

test("no password is stored, only that it changed", async () => {
  await history.appendCreated({
    path_to_folder: "spaces/a",
    meta: { title: "A", $password: "secret" },
  });
  await history.appendUpdated({
    path_to_folder: ".",
    data: {
      name_of_instance: "Atelier",
      general_password: "g3n3ral",
      signup_password: "s1gnup",
    },
    author_path: "authors/admin",
  });

  for (const p of ["spaces/a", "."]) {
    const raw = await fs.readFile(fileOf(p), "utf8");
    for (const secret of ["secret", "g3n3ral", "s1gnup"])
      assert.ok(!raw.includes(secret), `${p}: ${secret}`);
  }
  const entries = await history.getEntries({ path_to_folder: "." });
  assert.deepEqual(
    entries.map((e) => [e.field, e.value]),
    [
      ["name_of_instance", "Atelier"],
      ["general_password", null],
      ["signup_password", null],
    ]
  );
});

test("those stored by older versions are blanked, the rest kept", async () => {
  const lines = [
    { ts: "1", event: "created", fields: { title: "Hub", general_password: "old1" } },
    { ts: "2", event: "updated", field: "general_password", value: "old2" },
    { ts: "3", event: "updated", field: "title", value: "Hub 2" },
  ].map((e) => JSON.stringify(e));
  await fs.ensureDir(path.join(dir, "old"));
  await fs.writeFile(fileOf("old"), [...lines, "{broken", ""].join("\n"));

  // read: already without them
  const read = await history.getEntries({ path_to_folder: "old" });
  assert.equal(read[0].fields.general_password, null);
  assert.equal(read[1].value, null);

  // on disk: rewritten once
  assert.equal(await history.removeSensitive({ path_to_folder: "old" }), 2);
  const raw = await fs.readFile(fileOf("old"), "utf8");
  assert.ok(!raw.includes("old1") && !raw.includes("old2"));
  assert.ok(raw.includes('"Hub 2"'));
  assert.ok(raw.includes("{broken"));
  assert.equal(await history.removeSensitive({ path_to_folder: "old" }), 0);

  // no history: nothing to do
  assert.equal(await history.removeSensitive({ path_to_folder: "none" }), 0);
});
