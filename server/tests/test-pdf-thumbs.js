/**
 * PDF thumbs without pdftoppm: thumbs.makeThumbForMedia, with a real content
 * folder and sharp, but no browser and no pdftoppm. Both are faked:
 * - pdftoppm, through child_process.spawn: missing, failing, or working
 * - the browser, through webpreview.captureScreenshot: records the call and
 *   writes a PNG, or fails
 * The real capture (Chrome's PDF viewer) is in test-pdf-thumbs-browser.js.
 *
 * Usage:
 *   node --test server/tests/test-pdf-thumbs.js
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const child_process = require("child_process");
const { EventEmitter } = require("events");

// verbose messages are kept, to check what the logs say
const verbose_logs = [];
global.dev = new Proxy(
  {
    logverbose: (message) => verbose_logs.push(String(message)),
  },
  { get: (target, name) => target[name] || (() => {}) }
);

const HOME_URL = "https://localhost:8080";
global.appInfos = { homeURL: HOME_URL };
global.settings = {
  deletedFolderName: "_bin",
  schema: {
    $folders: {
      projects: { $files: { thumbs: { resolutions: [180] } } },
    },
  },
};

const sharp = require("sharp");

function writePNG(full_path) {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: "#336699" },
  })
    .png()
    .toFile(full_path);
}

// pdftoppm: "missing" (ENOENT), "fails" (exit 1), "no_output" (exit 0
// without a file) or "works" (writes the PNG it is asked for)
let pdftoppm_mode = "missing";
const pdftoppm_calls = [];

child_process.spawn = (command, args) => {
  if (command !== "pdftoppm") throw new Error(`unexpected spawn: ${command}`);
  pdftoppm_calls.push(args);

  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};

  setImmediate(async () => {
    if (pdftoppm_mode === "missing") {
      const err = new Error("spawn pdftoppm ENOENT");
      err.code = "ENOENT";
      return proc.emit("error", err);
    }
    if (args[0] === "-v") {
      proc.stderr.emit("data", "pdftoppm version 25.06.0\n");
      return proc.emit("close", 0);
    }
    if (pdftoppm_mode === "fails") {
      proc.stderr.emit("data", "Syntax Error: Couldn't read xref table\n");
      return proc.emit("close", 1);
    }
    // -f <page> -singlefile -png <input> <output base>
    if (pdftoppm_mode === "works") await writePNG(args.at(-1) + ".png");
    proc.emit("close", 0);
  });

  return proc;
};

// the browser: "works" or "fails"
let browser_mode = "works";
const browser_calls = [];

const webpreview = require("../webpreview");
webpreview.captureScreenshot = async (options) => {
  browser_calls.push(options);
  if (browser_mode === "fails") throw new Error("browser crashed");
  await writePNG(options.full_path_to_thumb);
};

// thumbs.js keeps whether pdftoppm exists for the life of the process:
// load it again for each test
function loadThumbs() {
  delete require.cache[require.resolve("../thumbs")];
  return require("../thumbs");
}

async function setup({
  pdftoppm = "missing",
  browser = "works",
  path_to_folder = path.join("projects", "p1"),
  media_filename = "doc.pdf",
} = {}) {
  pdftoppm_mode = pdftoppm;
  browser_mode = browser;
  pdftoppm_calls.length = 0;
  browser_calls.length = 0;
  verbose_logs.length = 0;

  global.pathToUserContent = await fs.mkdtemp(
    path.join(os.tmpdir(), "adc-pdf-thumbs-")
  );
  // the content doesn't matter: nothing reads it
  await fs.outputFile(
    path.join(global.pathToUserContent, path_to_folder, media_filename),
    "%PDF-1.4\n"
  );

  const thumbs = loadThumbs();
  const makeThumb = () =>
    thumbs.makeThumbForMedia({
      media_type: "pdf",
      media_filename,
      path_to_folder,
    });
  const thumbPath = (name) =>
    path.join(global.pathToUserContent, "thumbs", path_to_folder, name);

  return { makeThumb, thumbPath };
}

test.afterEach(async () => {
  if (global.pathToUserContent) await fs.remove(global.pathToUserContent);
});

test("no pdftoppm: the browser opens the PDF file itself, without the app", async () => {
  const { makeThumb, thumbPath } = await setup({ pdftoppm: "missing" });

  const result = await makeThumb();

  assert.strictEqual(browser_calls.length, 1);
  const { url, full_path_to_thumb, wait_ms } = browser_calls[0];
  assert.strictEqual(
    url,
    `${HOME_URL}/projects/p1/doc.pdf#toolbar=0&view=Fit`
  );
  assert.ok(!url.includes("_previewmedia"), "no page of the app needed");
  assert.strictEqual(full_path_to_thumb, thumbPath("doc.pdf.page-1.png"));
  // the PDF viewer can't say it's ready: a fixed wait
  assert.strictEqual(wait_ms, 2500);

  // the capture goes through the usual resizing
  assert.match(result["page-1"]["180"], /^doc\.pdf\.page-1\.png\.180\.png/);
  assert.ok(await fs.pathExists(thumbPath("doc.pdf.page-1.png.180.png")));
});

test("no pdftoppm: the logs say so", async () => {
  const { makeThumb } = await setup({ pdftoppm: "missing" });
  await makeThumb();

  assert.ok(
    verbose_logs.includes("pdftoppm not found, PDF thumbs will use the browser")
  );
  assert.ok(
    verbose_logs.includes("PDF thumb: no pdftoppm, using the browser")
  );
});

test("no pdftoppm: looked for once, not for every PDF", async () => {
  const { makeThumb } = await setup({ pdftoppm: "missing" });
  await makeThumb();

  // a second PDF, same process
  const path_to_folder = path.join("projects", "p1");
  await fs.outputFile(
    path.join(global.pathToUserContent, path_to_folder, "other.pdf"),
    "%PDF-1.4\n"
  );
  await require("../thumbs").makeThumbForMedia({
    media_type: "pdf",
    media_filename: "other.pdf",
    path_to_folder,
  });

  assert.strictEqual(pdftoppm_calls.length, 1);
  assert.strictEqual(browser_calls.length, 2);
});

test("URL: every path segment is encoded, # included", async () => {
  const path_to_folder = path.join("projects", "mon projet");
  const media_filename = "notes #1 é?.pdf";
  const { makeThumb } = await setup({ path_to_folder, media_filename });

  await makeThumb();

  const url = new URL(browser_calls[0].url);
  assert.strictEqual(
    decodeURIComponent(url.pathname),
    "/projects/mon projet/notes #1 é?.pdf"
  );
  assert.strictEqual(url.search, "", "a ? in the name is not a query");
  assert.strictEqual(url.hash, "#toolbar=0&view=Fit");
});

test("pdftoppm fails: falls back to the browser, and the logs say why", async () => {
  const { makeThumb } = await setup({ pdftoppm: "fails" });

  const result = await makeThumb();

  assert.strictEqual(browser_calls.length, 1);
  assert.ok(result["page-1"]);
  assert.ok(
    verbose_logs.includes("pdftoppm found, PDF thumbs will use it"),
    "pdftoppm is there"
  );
  assert.ok(
    verbose_logs.includes("PDF thumb: pdftoppm failed, using the browser")
  );
});

test("pdftoppm writes nothing: falls back to the browser", async () => {
  const { makeThumb } = await setup({ pdftoppm: "no_output" });

  const result = await makeThumb();

  assert.strictEqual(browser_calls.length, 1);
  assert.ok(result["page-1"]);
});

test("pdftoppm works: no browser", async () => {
  const { makeThumb, thumbPath } = await setup({ pdftoppm: "works" });

  const result = await makeThumb();

  assert.strictEqual(browser_calls.length, 0);
  assert.ok(result["page-1"]);
  // first page, written where the thumb is expected
  const args = pdftoppm_calls.find((a) => a[0] === "-f");
  assert.deepStrictEqual(args.slice(0, 4), ["-f", "1", "-singlefile", "-png"]);
  assert.strictEqual(args.at(-1) + ".png", thumbPath("doc.pdf.page-1.png"));
  assert.ok(verbose_logs.includes("PDF thumb: made with pdftoppm"));
});

test("browser fails too: no thumb, marked as no preview, not retried", async () => {
  const { makeThumb, thumbPath } = await setup({
    pdftoppm: "missing",
    browser: "fails",
  });

  const result = await makeThumb();

  assert.deepStrictEqual(result, {});
  assert.ok(await fs.pathExists(thumbPath("doc.pdf.page-1.png.no_preview")));

  await makeThumb();
  assert.strictEqual(browser_calls.length, 1, "not tried again");
});

// Not a PDF, but the other browser fallback that used to exist: a 3D file
// mesh-thumb can't read must not open the app's /_previewmedia page
test("3D file mesh-thumb can't read: no thumb, no browser", async () => {
  const { thumbPath } = await setup();
  const path_to_folder = path.join("projects", "p1");
  await fs.outputFile(
    path.join(global.pathToUserContent, path_to_folder, "broken.stl"),
    "solid nothing here\nendsolid\n"
  );

  const result = await require("../thumbs").makeThumbForMedia({
    media_type: "stl",
    media_filename: "broken.stl",
    path_to_folder,
  });

  assert.strictEqual(browser_calls.length, 0);
  assert.deepStrictEqual(result, {});
  assert.ok(await fs.pathExists(thumbPath("broken.stl.0.png.no_preview")));
  assert.ok(verbose_logs.includes("3D thumb: mesh-thumb failed, no thumb"));
});
