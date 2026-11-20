const path = require("path"),
  fs = require("fs-extra"),
  writeFileAtomic = require("write-file-atomic");

const utils = require("./utils"),
  dev = require("./dev-log");

module.exports = (function () {
  const META_ARCHIVE_FILENAME = "meta_archive.jsonl";

  // Keys that are server-generated or binary and carry no meaningful edit
  // history — always excluded from the log.
  const EXCLUDED_KEYS = new Set([
    "$path",
    "$date_created",
    "$date_modified",
    "$cover",
    "$files",
    "$preview",
    "$archives",
    "$infos",
  ]);

  // Keys whose value must never be stored — presence in the log is enough:
  // any password, a folder's ($password) as the instance's settings'
  // (general_password, signup_password, in the root folder's history)
  const isSensitive = (key) => /password/i.test(key);

  // an entry without the sensitive values, and whether it had any
  function _withoutSensitive(entry) {
    if (!entry || typeof entry !== "object") return { entry, changed: false };
    if (
      entry.event === "updated" &&
      isSensitive(entry.field) &&
      entry.value !== null
    )
      return { entry: { ...entry, value: null }, changed: true };
    if (entry.event === "created" && entry.fields) {
      const keys = Object.keys(entry.fields).filter(
        (key) => isSensitive(key) && entry.fields[key] !== null
      );
      if (keys.length === 0) return { entry, changed: false };
      const fields = { ...entry.fields };
      for (const key of keys) fields[key] = null;
      return { entry: { ...entry, fields }, changed: true };
    }
    return { entry, changed: false };
  }

  const API = {
    META_ARCHIVE_FILENAME,

    // Called once at folder creation. Snapshots all user-editable fields so
    // history is complete from day one.
    appendCreated: async ({ path_to_folder, meta, author_path }) => {
      dev.logfunction({ path_to_folder });

      const fields = {};
      for (const [key, value] of Object.entries(meta || {})) {
        if (EXCLUDED_KEYS.has(key)) continue;
        fields[key] = isSensitive(key) ? null : value;
      }
      if (Object.keys(fields).length === 0) return;

      await _appendLines(path_to_folder, [
        {
          ts: new Date().toISOString(),
          event: "created",
          fields,
          author: author_path || "",
        },
      ]);
    },

    // Called on every meta update. Each changed user-editable field gets its
    // own line. Sensitive values are blanked — their presence is enough.
    appendUpdated: async ({ path_to_folder, data, author_path }) => {
      dev.logfunction({ path_to_folder });

      const ts = new Date().toISOString();
      const entries = Object.entries(data || {})
        .filter(([key]) => !EXCLUDED_KEYS.has(key))
        .map(([key, value]) => ({
          ts,
          event: "updated",
          field: key,
          value: isSensitive(key) ? null : value,
          author: author_path || "",
        }));
      if (entries.length === 0) return;

      // one write, in the fields' order: one append per field, in parallel,
      // landed in any order (it differs between macOS and Linux)
      await _appendLines(path_to_folder, entries);
    },

    // Returns all entries in chronological order (oldest first), without
    // the passwords older versions stored.
    getEntries: async ({ path_to_folder }) => {
      dev.logfunction({ path_to_folder });

      const full_path = _getFullPath(path_to_folder);
      try {
        const content = await fs.readFile(full_path, "utf8");
        return content
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try {
              return _withoutSensitive(JSON.parse(line)).entry;
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    // Blanks the passwords older versions stored in a folder's history (the
    // root folder's had the instance's general_password and signup_password
    // in clear). Called at startup, before any request: nothing else writes
    // to it meanwhile. Returns how many entries were blanked.
    removeSensitive: async ({ path_to_folder }) => {
      const full_path = _getFullPath(path_to_folder);
      let content;
      try {
        content = await fs.readFile(full_path, "utf8");
      } catch {
        return 0;
      }

      let blanked = 0;
      const lines = content.split("\n").map((line) => {
        if (!line) return line;
        try {
          const { entry, changed } = _withoutSensitive(JSON.parse(line));
          if (!changed) return line;
          blanked++;
          return JSON.stringify(entry);
        } catch {
          return line;
        }
      });
      if (blanked > 0) await writeFileAtomic(full_path, lines.join("\n"));
      return blanked;
    },
  };

  function _getFullPath(path_to_folder) {
    return utils.getPathToUserContent(path_to_folder, META_ARCHIVE_FILENAME);
  }

  async function _appendLines(path_to_folder, entries) {
    const full_path = _getFullPath(path_to_folder);
    await fs.ensureDir(path.dirname(full_path));
    await fs.appendFile(
      full_path,
      entries.map((entry) => JSON.stringify(entry) + "\n").join(""),
      "utf8"
    );
  }

  return API;
})();
