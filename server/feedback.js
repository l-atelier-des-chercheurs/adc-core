const path = require("path"),
  crypto = require("crypto"),
  fs = require("fs-extra"),
  writeFileAtomic = require("write-file-atomic");

// Feedback sent from an app (a bug, an idea…), by anyone, read by the
// instance's admins only (api2.js: POST and GET /_api2/_feedback).
// One JSON file each, in <content>/feedback/: never listed as content,
// never broadcast, refused to static requests (server.js), kept until an
// admin removes it from the disk.
// Sending is limited: per IP, and for the whole instance (behind a proxy
// that adc-core doesn't trust, every visitor shares one IP: settings.json's
// trust_proxy, server.js), so the disk and the mailbox can't be filled.
// With a mailer and a contact address, the instance's admins also get each
// one by email (mailFor), answering it replies to whoever sent it.

const LIMITS = {
  type: 40,
  message: 10000,
  name: 200,
  email: 320,
  // the page, the version, the browser… as JSON
  context: 4000,
};
const RATE = {
  window_ms: 10 * 60 * 1000,
  // a class behind one school's IP, a person retrying a refused sending
  per_ip: 20,
  per_instance: 40,
};

module.exports = (function () {
  // ip → timestamps of its feedback, within the window
  const sent_by_ip = new Map();
  let sent_by_instance = [];

  const API = {
    LIMITS,
    RATE,
    validate: (input) => validate(input),
    isRateLimited: ({ ip, now = Date.now() }) => isRateLimited({ ip, now }),
    add: async ({ input, token_path, now = new Date() }) => {
      const feedback = validate(input);
      const id = `${timestamp(now)}_${crypto.randomBytes(3).toString("hex")}`;
      const entry = {
        id,
        date: now.toISOString(),
        ...feedback,
        // logged in: who sent it, as checked by the server
        ...(token_path && { token_path }),
      };
      await fs.ensureDir(feedbackDir());
      await writeFileAtomic(
        path.join(feedbackDir(), `${id}.json`),
        JSON.stringify(entry, null, 2)
      );
      return entry;
    },
    mailFor: (entry, options) => mailFor(entry, options),
    // newest first; unreadable files left out
    list: async () => {
      const dir = feedbackDir();
      if (!(await fs.pathExists(dir))) return [];
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
      const entries = await Promise.all(
        files.map((f) => fs.readJson(path.join(dir, f)).catch(() => undefined))
      );
      return entries
        .filter(Boolean)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },
  };

  function feedbackDir() {
    return path.join(global.pathToUserContent, "feedback");
  }

  function isRateLimited({ ip, now }) {
    const since = now - RATE.window_ms;
    sent_by_instance = sent_by_instance.filter((t) => t > since);
    const by_ip = (sent_by_ip.get(ip) || []).filter((t) => t > since);
    // forget the quiet ones
    for (const [key, times] of sent_by_ip)
      if (!times.some((t) => t > since)) sent_by_ip.delete(key);

    if (
      by_ip.length >= RATE.per_ip ||
      sent_by_instance.length >= RATE.per_instance
    )
      return true;
    by_ip.push(now);
    sent_by_ip.set(ip, by_ip);
    sent_by_instance.push(now);
    return false;
  }

  return API;
})();

function fail(code) {
  const err = new Error(code);
  err.code = code;
  throw err;
}

function optionalString(value, max, code) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") fail(code);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(code);
  return trimmed;
}

// { type, message, name, email, context }: message required, the rest
// optional, each within its limit
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("invalid_feedback");

  const message = optionalString(
    input.message,
    LIMITS.message,
    "invalid_feedback_message"
  );
  if (!message) fail("feedback_message_required");

  const type =
    optionalString(input.type, LIMITS.type, "invalid_feedback_type") || "other";
  const name = optionalString(input.name, LIMITS.name, "invalid_feedback_name");
  const email = optionalString(
    input.email,
    LIMITS.email,
    "invalid_feedback_email"
  );
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail("invalid_feedback_email");

  let context;
  if (input.context !== undefined && input.context !== null) {
    if (typeof input.context !== "object" || Array.isArray(input.context))
      fail("invalid_feedback_context");
    if (JSON.stringify(input.context).length > LIMITS.context)
      fail("invalid_feedback_context");
    context = input.context;
  }

  return {
    type,
    message,
    ...(name && { name }),
    ...(email && { email }),
    ...(context && { context }),
  };
}

const TYPE_LABELS = {
  bug: "Bug",
  idea: "Idée",
  improvement: "Amélioration",
  other: "Retour",
};

// the email to the instance's admins, in French as the apps are: its
// subject says what it is and begins the message; answering it replies to
// the sender (replyTo), when they gave an email
function mailFor(entry, { app_name = "", public_url = "" } = {}) {
  const label = TYPE_LABELS[entry.type] || TYPE_LABELS.other;
  const first_line = entry.message.split("\n")[0];
  const excerpt =
    first_line.length > 60 ? `${first_line.slice(0, 60).trim()}…` : first_line;
  const subject = `[${app_name || "adc"}] ${label} : ${excerpt}`;

  const from = [
    entry.name || "Anonyme",
    entry.token_path && `(compte ${entry.token_path})`,
    entry.email ? `<${entry.email}>` : "— pas d’e-mail",
  ]
    .filter(Boolean)
    .join(" ");

  // the page as a link, only for a path on the instance ("/cahiers/a"):
  // anything else stays as sent, so that it can't pass for one of its links
  // ("@evil.example/x" would give https://instance@evil.example/x)
  const context = entry.context || {};
  const page =
    typeof context.page === "string" &&
    public_url &&
    /^\/(?![/\\])/.test(context.page)
      ? public_url.replace(/\/$/, "") + context.page
      : context.page;
  const context_lines = Object.entries({ ...context, page })
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${key} : ${typeof value === "string" ? value : JSON.stringify(value)}`
    );

  const text = [
    `Retour « ${label} », envoyé le ${frenchDate(entry.date)}`,
    `De : ${from}`,
    "",
    entry.message,
    "",
    ...(context_lines.length ? ["—", ...context_lines, ""] : []),
    entry.email
      ? "Répondre à ce message écrit à la personne qui l’a envoyé."
      : "La personne n’a pas laissé d’e-mail : pas de réponse possible.",
    "Il est aussi gardé sur l’instance, avec tous les retours reçus.",
  ].join("\n");

  return { subject, text, ...(entry.email && { replyTo: entry.email }) };
}

// "20 novembre 2026 à 11:00", in the server's time zone
function frenchDate(iso) {
  const date = new Date(iso);
  if (isNaN(date)) return iso;
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 2026-11-20_14-03-07, in UTC: sorts as the dates do
function timestamp(date) {
  return date.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");
}
