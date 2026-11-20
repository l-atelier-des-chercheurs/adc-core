// node --test server/tests/test-feedback.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const path = require("path");
const fs = require("fs-extra");

const feedback = require("../feedback");

const codeOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return undefined;
};

test("a message is required, the rest is optional", () => {
  assert.equal(
    codeOf(() => feedback.validate({})),
    "feedback_message_required"
  );
  assert.equal(
    codeOf(() => feedback.validate({ message: "   " })),
    "feedback_message_required"
  );
  assert.deepEqual(feedback.validate({ message: "  Un bug  " }), {
    type: "other",
    message: "Un bug",
  });
});

test("fields are trimmed, kept within their limits", () => {
  const ok = feedback.validate({
    type: "bug",
    message: "Ça plante",
    name: " Louis ",
    email: "louis@example.org",
    context: { version: "3.1.0", page: "/cahiers/x" },
  });
  assert.equal(ok.name, "Louis");
  assert.equal(ok.context.version, "3.1.0");

  const long = "x".repeat(feedback.LIMITS.message + 1);
  assert.equal(
    codeOf(() => feedback.validate({ message: long })),
    "invalid_feedback_message"
  );
  assert.equal(
    codeOf(() => feedback.validate({ message: "a", email: "pas un mail" })),
    "invalid_feedback_email"
  );
  assert.equal(
    codeOf(() => feedback.validate({ message: "a", context: [1] })),
    "invalid_feedback_context"
  );
  assert.equal(
    codeOf(() =>
      feedback.validate({
        message: "a",
        context: { big: "x".repeat(feedback.LIMITS.context) },
      })
    ),
    "invalid_feedback_context"
  );
  assert.equal(
    codeOf(() => feedback.validate("a")),
    "invalid_feedback"
  );
  assert.equal(
    codeOf(() => feedback.validate({ message: 12 })),
    "invalid_feedback_message"
  );
});

test("sending is limited per IP and for the whole instance", () => {
  const now = 1_000_000_000_000;
  const { per_ip, per_instance, window_ms } = feedback.RATE;
  for (let i = 0; i < per_ip; i++)
    assert.equal(feedback.isRateLimited({ ip: "a", now: now + i }), false);
  assert.equal(feedback.isRateLimited({ ip: "a", now: now + per_ip }), true);
  // another IP still can
  assert.equal(feedback.isRateLimited({ ip: "b", now: now + 10 }), false);
  // once the window has passed, again
  assert.equal(
    feedback.isRateLimited({ ip: "a", now: now + window_ms + per_ip + 1 }),
    false
  );

  // the whole instance: many IPs, one each
  const later = now + 10 * window_ms;
  let refused = 0;
  for (let i = 0; i < per_instance + 5; i++)
    if (feedback.isRateLimited({ ip: `ip${i}`, now: later + i })) refused++;
  assert.equal(refused, 5);
});

test("saved one file each, listed newest first, admins' JSON as sent", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-feedback-"));
  const previous = global.pathToUserContent;
  global.pathToUserContent = dir;
  try {
    assert.deepEqual(await feedback.list(), []);
    await feedback.add({
      input: { message: "premier", type: "idea" },
      now: new Date("2026-11-20T10:00:00Z"),
    });
    await feedback.add({
      input: { message: "second", email: "a@b.fr" },
      token_path: "authors/louis",
      now: new Date("2026-11-20T11:00:00Z"),
    });
    await fs.writeFile(path.join(dir, "feedback", "broken.json"), "{");

    const list = await feedback.list();
    assert.equal(list.length, 2);
    assert.equal(list[0].message, "second");
    assert.equal(list[0].token_path, "authors/louis");
    assert.equal(list[1].type, "idea");
    assert.equal(list[1].token_path, undefined);
    assert.match(list[0].id, /^2026-11-20_11-00-00_[0-9a-f]{6}$/);
  } finally {
    global.pathToUserContent = previous;
    await fs.remove(dir);
  }
});

test("the email to the admins: what it is, who, and a reply to them", () => {
  const entry = {
    id: "x",
    date: "2026-11-20T10:00:00.000Z",
    type: "bug",
    message: `${"Le bouton ne répond plus ".repeat(4)}\nDétails`,
    name: "Louis",
    email: "louis@example.org",
    token_path: "authors/louis",
    context: { version: "3.1.0", page: "/cahiers/a" },
  };
  const mail = feedback.mailFor(entry, {
    app_name: "Les Cahiers du Studio",
    public_url: "https://cahiers.example.org/",
  });
  assert.match(mail.subject, /^\[Les Cahiers du Studio\] Bug : Le bouton/);
  assert.ok(mail.subject.endsWith("…"));
  assert.ok(!mail.subject.includes("\n"));
  assert.equal(mail.replyTo, "louis@example.org");
  assert.match(
    mail.text,
    /De : Louis \(compte authors\/louis\) <louis@example.org>/
  );
  assert.match(mail.text, /page : https:\/\/cahiers\.example\.org\/cahiers\/a/);
  assert.match(mail.text, /\nDétails\n/);

  const anonymous = feedback.mailFor({
    id: "y",
    date: "2026-11-20T10:00:00.000Z",
    type: "something",
    message: "Court",
  });
  assert.equal(anonymous.replyTo, undefined);
  assert.match(anonymous.subject, /^\[adc\] Retour : Court$/);
  assert.match(anonymous.text, /pas de réponse possible/);
  assert.ok(!anonymous.text.includes("—\n"));
});

test("the email links to the instance's pages only, and shows any context", () => {
  const textFor = (context) =>
    feedback.mailFor(
      {
        id: "z",
        date: "2026-11-20T10:00:00.000Z",
        type: "bug",
        message: "Court",
        context,
      },
      { public_url: "https://cahiers.example.org" }
    ).text;

  for (const page of ["@evil.example/x", "//evil.example/x", "/\\evil.example"])
    assert.match(textFor({ page }), new RegExp(`page : ${escape(page)}\\n`));

  const text = textFor({ screen: { w: 390, h: 844 }, touch: true, gone: null });
  assert.match(text, /screen : {"w":390,"h":844}/);
  assert.match(text, /touch : true/);
  assert.ok(!text.includes("gone"));
});

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
