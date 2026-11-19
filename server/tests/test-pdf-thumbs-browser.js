/**
 * PDF thumbs without pdftoppm, for real: Chrome (puppeteer) opens a PDF
 * served over HTTP in its own viewer, and the capture must show the page,
 * not a blank grey viewer (the bug fixed with captureBeyondViewport: false).
 * pdftoppm is hidden even if installed.
 *
 * Slow (a Chrome launch, a fixed 2.5 s wait per PDF) and needs Chrome
 * downloaded by puppeteer (or PUPPETEER_EXECUTABLE_PATH): not in `npm test`.
 *
 * Usage:
 *   npm run test:browser
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const child_process = require("child_process");

global.dev = new Proxy({}, { get: () => () => {} });

// pdftoppm is "not installed"; Chrome and everything else start as usual
const real_spawn = child_process.spawn;
child_process.spawn = function (command, ...rest) {
  if (command === "pdftoppm") {
    const err = new Error("spawn pdftoppm ENOENT");
    err.code = "ENOENT";
    throw err;
  }
  return real_spawn.call(this, command, ...rest);
};

const express = require("express");
const sharp = require("sharp");
const { PDFDocument, rgb } = require("@cantoo/pdf-lib");

const thumbs = require("../thumbs");
const puppeteer = require("../puppeteer");

const PATH_TO_FOLDER = path.join("projects", "p1");
let server;

test.before(async () => {
  global.pathToUserContent = await fs.mkdtemp(
    path.join(os.tmpdir(), "adc-pdf-thumbs-browser-")
  );
  global.settings = {
    deletedFolderName: "_bin",
    schema: {
      $folders: {
        projects: { $files: { thumbs: { resolutions: [180] } } },
      },
    },
  };

  // the content folder at the root, as server.js serves it
  const app = express();
  app.use(express.static(global.pathToUserContent));
  await new Promise((resolve, reject) => {
    const fail = (message) =>
      reject(new Error(`can't start the HTTP server: ${message}`));
    server = app.listen(0, "127.0.0.1", () =>
      server.address() ? resolve() : fail("no address (port binding not allowed?)")
    );
    server.once("error", (err) => fail(err.message));
  });
  global.appInfos = { homeURL: `http://127.0.0.1:${server.address().port}` };
});

test.after(async () => {
  await puppeteer.closeSharedBrowser();
  await new Promise((resolve) => server?.close(resolve));
  await fs.remove(global.pathToUserContent);
});

// A white page with a black band along its far edge (the bottom of a
// portrait page, the right of a landscape one): seen only if the whole page
// is in the capture
async function writePDF({ media_filename, width, height }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  const band = 0.15;
  const black = rgb(0, 0, 0);
  if (height > width)
    page.drawRectangle({ x: 0, y: 0, width, height: height * band, color: black });
  else
    page.drawRectangle({
      x: width * (1 - band),
      y: 0,
      width: width * band,
      height,
      color: black,
    });

  await fs.outputFile(
    path.join(global.pathToUserContent, PATH_TO_FOLDER, media_filename),
    await pdf.save()
  );
}

// share of dark (< 60) and white (> 230) pixels, in all the image or in a part
async function measure(full_path, region) {
  const image = sharp(full_path).greyscale();
  const { width, height } = await image.metadata();
  const area = region ? region({ width, height }) : { left: 0, top: 0, width, height };
  const data = await image.extract(area).raw().toBuffer();
  let dark = 0;
  let white = 0;
  for (const v of data) {
    if (v < 60) dark++;
    else if (v > 230) white++;
  }
  return { dark: dark / data.length, white: white / data.length };
}

async function makeThumb(media_filename) {
  const result = await thumbs.makeThumbForMedia({
    media_type: "pdf",
    media_filename,
    path_to_folder: PATH_TO_FOLDER,
  });
  const capture = path.join(
    global.pathToUserContent,
    "thumbs",
    PATH_TO_FOLDER,
    `${media_filename}.page-1.png`
  );
  return { result, capture };
}

test(
  "portrait PDF: the capture shows the whole page, not a grey viewer",
  { timeout: 60_000 },
  async () => {
    await writePDF({ media_filename: "portrait.pdf", width: 595, height: 842 });

    const { result, capture } = await makeThumb("portrait.pdf");

    assert.ok(result["page-1"], "a thumb is made");
    const all = await measure(capture);
    assert.ok(all.white > 0.05, `the white page is seen (${all.white})`);
    assert.ok(all.dark > 0.01, `the black band is seen (${all.dark})`);

    // the band is at the bottom of the page: the page is not cut
    const bottom = await measure(capture, ({ width, height }) => ({
      left: 0,
      top: Math.round(height / 2),
      width,
      height: height - Math.round(height / 2),
    }));
    assert.ok(bottom.dark > 0.01, `the bottom of the page is seen (${bottom.dark})`);
  }
);

test(
  "landscape PDF: the capture shows the whole page",
  { timeout: 60_000 },
  async () => {
    await writePDF({ media_filename: "landscape.pdf", width: 842, height: 595 });

    const { result, capture } = await makeThumb("landscape.pdf");

    assert.ok(result["page-1"], "a thumb is made");
    const right = await measure(capture, ({ width, height }) => ({
      left: Math.round(width / 2),
      top: 0,
      width: width - Math.round(width / 2),
      height,
    }));
    assert.ok(right.dark > 0.01, `the right of the page is seen (${right.dark})`);
    assert.ok(right.white > 0.05, `the white page is seen (${right.white})`);
  }
);
