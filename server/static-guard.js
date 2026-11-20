const path = require("path");

// The content folder is served as static files (server.js), except what the
// server keeps for itself: the instance's and the folders' meta.txt (the
// instance's holds its settings), the tokens (tokens.json), the journal and
// the feedback (feedback.js).
// The check is made on the path as the disk will find it, not as it was
// written, so that another spelling of it doesn't get through:
// - "//journal/x", "/a/../journal/x", "/a/..%2Fjournal/x": express.static
//   decodes and resolves them
// - "/a\..\journal\x": "\" is a separator on Windows
// - "/META.TXT": macOS and Windows disks ignore the case
// - "/tokens.json::$DATA", "/TOKENS~1.JSO": on Windows, the file's own
//   stream, and its short name
// - "/meta.txt.": trailing dots and spaces, which Windows can drop
module.exports = {
  isInternalPath(req_path = "") {
    let p = req_path;
    try {
      p = decodeURIComponent(p);
    } catch (err) {}

    const segments = path.posix
      .normalize("/" + p.replace(/\\/g, "/"))
      .toLowerCase()
      .split("/")
      .map((s) => s.split(":")[0].replace(/[. ]+$/, ""))
      .filter(Boolean);
    const first = segments[0] || "";
    const last = segments[segments.length - 1] || "";

    return (
      first === "journal" ||
      first === "feedback" ||
      // meta.txt, and write-file-atomic's temporary copies of it
      segments.some((s) => s.startsWith("meta.txt")) ||
      last === "tokens.json" ||
      /^tokens~\d+\.jso$/.test(last)
    );
  },
};
