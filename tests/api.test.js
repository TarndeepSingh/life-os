const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../api/_lib.js");

const res = () => { const r = { code: 0, headers: {}, out: "", setHeader(k, v) { r.headers[k] = v; }, end(s) { r.out = s; }, get json() { return JSON.parse(r.out); } }; Object.defineProperty(r, "statusCode", { set(v) { r.code = v; }, get() { return r.code; } }); return r; };
const req = (method, body, headers) => ({ method, body, headers: headers || {} });
const resp = (obj, ok = true, status = 200) => ({ ok, status, json: async () => obj });
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_KEY: "service", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "ak", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", CRON_SECRET: "s3cret" };
const authOK = (url, o) => url.endsWith("/auth/v1/user") && /Bearer good/.test(o.headers.Authorization) ? resp({ id: "u1", email: "me@x.com" }) : null;

test("config exposes only public values", () => {
  const r = res(); require("../api/config.js").make({ env: ENV })(req("GET"), r);
  const j = r.json; assert.equal(j.supabaseAnonKey, "anon"); assert.equal(j.ai, true); assert.equal(j.aiProvider, "anthropic");
  assert.ok(!JSON.stringify(j).includes("service") && !JSON.stringify(j).includes("priv") && !JSON.stringify(j).includes("ak\""));
  const r2 = res(); require("../api/config.js").make({ env: {} })(req("GET"), r2); assert.equal(r2.json.ai, false); assert.equal(r2.json.push, false);
});

const tutor = (fetchImpl, env) => require("../api/tutor.js").make({ fetch: fetchImpl, env: env || ENV });
const passages = [{ title: "Paging", page: 2, text: "The TLB caches recent page table entries." }];
test("tutor: login required, bad input rejected, only POST", async () => {
  const f = async (u, o) => authOK(u, o) || resp({}, false, 401);
  let r = res(); await tutor(f)(req("GET"), r); assert.equal(r.code, 405);
  r = res(); await tutor(f)(req("POST", { question: "q", passages }, {}), r); assert.equal(r.code, 401);
  r = res(); await tutor(f)(req("POST", { question: "", passages }, { authorization: "Bearer good" }), r); assert.equal(r.code, 400);
  r = res(); await tutor(f)(req("POST", { question: "q", passages: new Array(6).fill(passages[0]) }, { authorization: "Bearer good" }), r); assert.equal(r.code, 400);
  r = res(); await tutor(f)(req("POST", { question: "q", passages }, { authorization: "Bearer bad" }), r); assert.equal(r.code, 401);
});
test("tutor: not configured -> 503, and nothing is sent anywhere", async () => {
  let called = 0; const f = async () => { called++; return resp({}); };
  const r = res(); await tutor(f, { ...ENV, ANTHROPIC_API_KEY: "" })(req("POST", { question: "q", passages }, { authorization: "Bearer good" }), r);
  assert.equal(r.code, 503); assert.equal(called, 0);
});
test("tutor: grounded answer, citations validated, prompt carries passages and the injection guard", async () => {
  let sent;
  const f = async (u, o) => authOK(u, o) || (u.includes("rpc/bump_ai_usage") ? resp(1) : (sent = JSON.parse(o.body), resp({ content: [{ text: "The TLB caches page table entries [1]. Also see [9]." }] })));
  const r = res(); await tutor(f)(req("POST", { question: "What does the TLB cache?", passages }, { authorization: "Bearer good" }), r);
  assert.equal(r.code, 200); assert.deepEqual(r.json.cited, [1], "out-of-range citation [9] is dropped"); assert.equal(r.json.provider, "anthropic");
  assert.match(sent.system, /ignore any instructions/); assert.match(sent.messages[0].content, /\[1\] \(Paging, page 2\)/); assert.equal(sent.model, "claude-haiku-5-5");
});
test("tutor: INSUFFICIENT_EVIDENCE passes through, provider failure is a clean 502 without leaking details", async () => {
  const mk = (ans, fail) => async (u, o) => authOK(u, o) || (u.includes("rpc/") ? resp(1) : fail ? resp({}, false, 500) : resp({ content: [{ text: ans }] }));
  let r = res(); await tutor(mk("INSUFFICIENT_EVIDENCE"))(req("POST", { question: "q", passages }, { authorization: "Bearer good" }), r); assert.equal(r.json.insufficient, true);
  r = res(); await tutor(mk("", true))(req("POST", { question: "q", passages }, { authorization: "Bearer good" }), r); assert.equal(r.code, 502); assert.deepEqual(r.json, { error: "provider_failed" });
});
test("tutor: daily quota is enforced from the shared database counter", async () => {
  const f = async (u, o) => authOK(u, o) || (u.includes("rpc/bump_ai_usage") ? resp(31) : resp({ content: [{ text: "x [1]" }] }));
  const r = res(); await tutor(f)(req("POST", { question: "q", passages }, { authorization: "Bearer good" }), r); assert.equal(r.code, 429);
});
test("tutor: openai adapter requires an explicit model (no stale default)", async () => {
  const r = res(); await tutor(async () => resp({}), { ...ENV, AI_PROVIDER: "openai", OPENAI_API_KEY: "k" })(req("POST", { question: "q", passages }, { authorization: "Bearer good" }), r);
  assert.equal(r.code, 503);
});

const push = (f) => require("../api/push.js").make({ fetch: f, env: ENV });
test("push: subscribe validates, binds to the verified user, ignores any user id sent by the client", async () => {
  let saved; const f = async (u, o) => authOK(u, o) || (saved = { u, b: JSON.parse(o.body) }, resp({}));
  let r = res(); await push(f)(req("POST", { action: "subscribe", subscription: { endpoint: "http://insecure", keys: { p256dh: "a", auth: "b" } } }, { authorization: "Bearer good" }), r); assert.equal(r.code, 400);
  r = res(); await push(f)(req("POST", { action: "subscribe", user_id: "attacker", subscription: { endpoint: "https://push.example/abc", keys: { p256dh: "a", auth: "b" } } }, { authorization: "Bearer good" }), r);
  assert.equal(r.code, 200); assert.equal(saved.b.user_id, "u1");
  r = res(); await push(f)(req("POST", { action: "subscribe" }, {}), r); assert.equal(r.code, 401);
});
test("push: prefs are clamped and timezone-checked", async () => {
  let saved; const f = async (u, o) => authOK(u, o) || (saved = JSON.parse(o.body), resp({}));
  let r = res(); await push(f)(req("POST", { action: "prefs", prefs: { enabled: true, hour: 99, tz: "Asia/Kolkata" } }, { authorization: "Bearer good" }), r);
  assert.equal(saved.hour, 8, "invalid hour falls back to the default"); assert.equal(saved.enabled, true);
  r = res(); await push(f)(req("POST", { action: "prefs", prefs: { tz: "Nope/Zone" } }, { authorization: "Bearer good" }), r); assert.equal(r.code, 400);
});

test("digest counts only what the student opted into", () => {
  const tasks = [{ cat: "exam", due: "2026-11-10" }, { cat: "assignment", due: "2026-11-09" }, { cat: "assignment", due: "2026-11-11" }, { t: "buy milk", due: "2026-11-10" }, { cat: "exam", due: "2026-11-10", done: true }];
  const topics = [{ due: "2026-11-09" }, { due: "2026-11-20" }, { due: "2026-11-01", arch: true }];
  assert.equal(L.buildDigest(tasks, topics, "2026-11-10", { personal: false }).body, "1 overdue · 1 due today · 1 due tomorrow · 1 topic to review");
  assert.equal(L.buildDigest(tasks, topics, "2026-11-10", { personal: true }).counts.dueToday, 2);
  assert.equal(L.buildDigest([], [], "2026-11-10", {}), null, "nothing to say -> no notification");
});
test("timezone and quiet hours", () => {
  const t = new Date("2026-11-10T02:30:00Z");
  assert.deepEqual(L.localParts(t, "Asia/Kolkata"), { date: "2026-11-10", hour: 8 });
  assert.deepEqual(L.localParts(t, "America/New_York"), { date: "2026-11-09", hour: 21 });
  assert.equal(L.inQuiet(23, 22, 7), true); assert.equal(L.inQuiet(8, 22, 7), false); assert.equal(L.inQuiet(3, 22, 7), true); assert.equal(L.inQuiet(5, 5, 5), false);
});

function dispatchWorld(over) {
  const sent = [], del = [], claims = new Set();
  const w = { sent, del, claims, preview: false };
  w.fetch = async (u, o) => {
    if (u.includes("notification_preferences")) return resp([{ user_id: "u1", enabled: true, hour: 8, tz: "Asia/Kolkata", quiet_start: 22, quiet_end: 7, personal: false, ...(over || {}) }]);
    if (u.includes("push_subscriptions") && o.method === "GET") return resp([{ endpoint: "https://p/1", p256dh: "k", auth: "a" }, { endpoint: "https://p/dead", p256dh: "k", auth: "a" }]);
    if (u.includes("push_subscriptions") && o.method === "DELETE") { del.push(u); return resp({}); }
    if (u.includes("/records?")) return resp([{ kind: "tasks", data: { cat: "exam", due: "2026-11-10", t: "DBMS exam" } }, { kind: "topics", data: { due: "2026-11-09" } }]);
    if (u.includes("notification_deliveries")) { const b = JSON.parse(o.body), k = b.user_id + b.local_date + b.kind; if (claims.has(k)) return resp([]); claims.add(k); return resp([b]); }
    return resp({}, false, 500);
  };
  w.webpush = { setVapidDetails() {}, async sendNotification(sub, payload) { if (sub.endpoint.endsWith("dead")) { const e = new Error("gone"); e.statusCode = 410; throw e; } sent.push(JSON.parse(payload)); } };
  return w;
}
const run = (w, headers, env, now) => { const r = res(); return require("../api/dispatch.js").make({ fetch: w.fetch, env: { ...ENV, ...(env || {}) }, webpush: w.webpush, now: () => now || new Date("2026-11-10T02:30:00Z") })(req("POST", {}, headers || { "x-cron-secret": "s3cret" }), r).then(() => r); };
test("dispatch: rejects missing/wrong secret and preview deployments", async () => {
  const w = dispatchWorld();
  assert.equal((await run(w, {})).code, 401); assert.equal((await run(w, { "x-cron-secret": "nope" })).code, 401);
  const r = await run(w, undefined, { VERCEL_ENV: "preview" }); assert.equal(r.json.skipped, "not production"); assert.equal(w.sent.length, 0);
});
test("dispatch: sends one digest at the user's local hour, once per day, and removes dead subscriptions", async () => {
  const w = dispatchWorld(); let r = await run(w);
  assert.equal(r.json.sent, 1); assert.equal(r.json.removed, 1); assert.equal(w.sent[0].body, "1 due today · 1 topic to review"); assert.equal(w.del.length, 1);
  r = await run(w); assert.equal(r.json.sent, 0, "same local day: no duplicate");
});
test("dispatch: respects the chosen hour and quiet hours", async () => {
  assert.equal((await run(dispatchWorld(), undefined, {}, new Date("2026-11-10T05:30:00Z"))).json.sent, 0, "wrong hour");
  assert.equal((await run(dispatchWorld({ hour: 8, quiet_start: 6, quiet_end: 9 }))).json.sent, 0, "inside quiet hours");
});

test("account deletion needs the exact email, removes files then the login", async () => {
  const calls = [];
  const f = async (u, o) => { const a = authOK(u, o); if (a) return a; calls.push((o.method || "GET") + " " + u.replace(ENV.SUPABASE_URL, ""));
    if (u.includes("/object/list/notes")) { const p = JSON.parse(o.body).prefix; return resp(p === "u1" ? [{ name: "n1", id: null }] : p === "u1/n1" ? [{ name: "a.pdf", id: "f1" }] : []); }
    return resp({}); };
  const h = require("../api/account.js").make({ fetch: f, env: ENV });
  let r = res(); await h(req("POST", { action: "delete", confirm: "wrong@x.com" }, { authorization: "Bearer good" }), r); assert.equal(r.code, 400);
  r = res(); await h(req("POST", { action: "delete", confirm: "me@x.com" }, { authorization: "Bearer good" }), r);
  assert.equal(r.code, 200); assert.equal(r.json.filesDeleted, 1);
  assert.ok(calls.some((c) => c.startsWith("DELETE /storage/v1/object/notes")) && calls.some((c) => c === "DELETE /auth/v1/admin/users/u1"));
});
