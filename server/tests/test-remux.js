/**
 * Videos made browser-safe by copying their streams into an MP4 (-c copy)
 * rather than encoding them again: optimizer.convertVideo, through
 * utils.getRemuxableStreams / remuxToMP4.
 * - which ffprobe metadata can be copied (always run)
 * - with a real ffmpeg: an H.264 + AAC .mov is copied, an MPEG-4 Part 2
 *   one is encoded, and so is any video asked a size, a bitrate or a trim.
 *   ffmpeg-static's binaries, or ffmpeg / ffprobe found in the PATH;
 *   skipped without them
 *
 * Usage:
 *   node --test server/tests/test-remux.js
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFileSync } = require("child_process");

// verbose messages are kept, to check which way was taken
const verbose_logs = [];
global.dev = new Proxy(
  { logverbose: (message) => verbose_logs.push(String(message)) },
  { get: (target, name) => target[name] || (() => {}) }
);
global.settings = global.settings || {};

const utils = require("../utils");
const optimizer = require("../exporter_tasks/optimizer");

/* WHICH VIDEOS CAN BE COPIED */

const video = (props) => ({ index: 0, codec_type: "video", ...props });
const audio = (props) => ({ index: 1, codec_type: "audio", ...props });
// Apple's metadata and timecode tracks
const data = (index) => ({ index, codec_type: "data", codec_name: "none" });

test("an iPhone .MOV (H.264 + AAC, data tracks) is copied, without its data tracks", () => {
  const streams = utils.getRemuxableStreams({
    streams: [
      video({ codec_name: "h264", pix_fmt: "yuv420p" }),
      audio({ codec_name: "aac" }),
      data(2),
      data(3),
    ],
  });
  assert.deepStrictEqual(streams, { video_index: 0, audio_index: 1 });
});

test("a silent H.264 video is copied, without sound", () => {
  const streams = utils.getRemuxableStreams({
    streams: [video({ codec_name: "h264", pix_fmt: "yuvj420p" })],
  });
  assert.deepStrictEqual(streams, { video_index: 0, audio_index: undefined });
});

test("MP3 sound is copied too", () => {
  const streams = utils.getRemuxableStreams({
    streams: [
      video({ codec_name: "h264", pix_fmt: "yuv420p" }),
      audio({ codec_name: "mp3" }),
    ],
  });
  assert.ok(streams);
});

test("cover art is not taken for the video", () => {
  const streams = utils.getRemuxableStreams({
    streams: [
      { index: 0, codec_type: "video", codec_name: "mjpeg", disposition: { attached_pic: 1 } },
      { index: 1, codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p" },
      { index: 2, codec_type: "audio", codec_name: "aac" },
    ],
  });
  assert.deepStrictEqual(streams, { video_index: 1, audio_index: 2 });
});

test("HEVC, 10-bit or 4:2:2 H.264, other sound, or no video: encoded", () => {
  const cases = [
    [video({ codec_name: "hevc", pix_fmt: "yuv420p" })],
    [video({ codec_name: "h264", pix_fmt: "yuv420p10le" })],
    [video({ codec_name: "h264", pix_fmt: "yuv422p" })],
    [video({ codec_name: "h264", pix_fmt: "yuv420p" }), audio({ codec_name: "pcm_s16le" })],
    [video({ codec_name: "h264", pix_fmt: "yuv420p" }), audio({ codec_name: "opus" })],
    [audio({ codec_name: "aac" })],
    [],
  ];
  for (const streams of cases)
    assert.strictEqual(utils.getRemuxableStreams({ streams }), null);
  assert.strictEqual(utils.getRemuxableStreams(undefined), null);
});

/* WITH A REAL FFMPEG */

function findBinary(static_module, name) {
  try {
    const p = require(static_module);
    if (fs.existsSync(p)) return p;
  } catch {}
  try {
    return execFileSync("which", [name]).toString().trim() || null;
  } catch {
    return null;
  }
}
const ffmpeg_path = findBinary("ffmpeg-static", "ffmpeg");
const ffprobe_path = findBinary("@derhuerst/ffprobe-static", "ffprobe");
const skip = !ffmpeg_path || !ffprobe_path ? "no ffmpeg / ffprobe" : false;

if (!skip) {
  const ffmpeg = require("fluent-ffmpeg");
  ffmpeg.setFfmpegPath(ffmpeg_path);
  ffmpeg.setFfprobePath(ffprobe_path);
}

let dir;
function makeClip(name, video_args) {
  const file = path.join(dir, name);
  execFileSync(ffmpeg_path, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=320x240:rate=25",
    "-f", "lavfi", "-i", "sine=frequency=440",
    "-t", "1",
    ...video_args,
    "-c:a", "aac",
    file,
  ]);
  return file;
}
async function codecs(file) {
  const { streams } = await utils.probeMedia(file);
  return streams.map((s) => s.codec_name);
}
async function convert(source, options = {}) {
  verbose_logs.length = 0;
  const destination = path.join(dir, `out-${path.basename(source)}-${Date.now()}`);
  const output = await optimizer.convertVideo({ source, destination, ...options });
  const copied = verbose_logs.some((m) => m.includes("copied into an MP4"));
  return { output, copied };
}

test("with ffmpeg", { skip }, async (t) => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "adc-remux-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const h264_mov = makeClip("h264.mov", ["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
  const mpeg4_mov = makeClip("mpeg4.mov", ["-c:v", "mpeg4"]);

  await t.test("an H.264 + AAC .mov is copied into an MP4", async () => {
    let progress;
    const { output, copied } = await convert(h264_mov, {
      reportProgress: (p) => (progress = p),
    });
    assert.ok(copied, "copied");
    assert.strictEqual(path.extname(output), ".mp4");
    assert.deepStrictEqual(await codecs(output), ["h264", "aac"]);
    assert.strictEqual(progress, 100);
  });

  await t.test("an MPEG-4 Part 2 .mov is encoded in H.264", async () => {
    const { output, copied } = await convert(mpeg4_mov);
    assert.ok(!copied, "not copied");
    assert.ok(verbose_logs.some((m) => m.includes("must be encoded again")));
    assert.deepStrictEqual(await codecs(output), ["h264", "aac"]);
  });

  await t.test("asked a size, an H.264 video is encoded anyway", async () => {
    const { copied } = await convert(h264_mov, {
      image_width: 160,
      image_height: 120,
    });
    assert.ok(!copied, "not copied");
  });
});
