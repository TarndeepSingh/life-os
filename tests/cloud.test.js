// Cloud wiring against a fake Supabase shared by simulated devices. Real index.html + cloud.js + study.js run in a fake page.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./harness.js");
const wait = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await wait(); };

function world() {
  const w = { rows: new Map(), clock: Date.parse("2026-11-10T10:00:00Z"), files: [], removed: [], prefs: null, calls: [] };
  const ts = () => new Date((w.clock += 1000)).toISOString();
  w.sb = (uid, email) => ({
    auth: { async getSession() { return { data: { session: { access_token: "tok-" + uid, user: { id: uid, email } } } }; }, onAuthStateChange() {}, async signOut() { w.calls.push("signOut"); }, async signInWithOtp(o) { w.calls.push("otp:" + o.email); return { error: null }; }, async signInWithOAuth(o) { w.calls.push("oauth:" + o.provider); return { error: null }; } },
    from(table) {
      const q = { f: [], o: [], count: false };
      const b = { select(_c, o) { if (o && o.count) q.count = true; return b; }, gte(c, v) { q.f.push([c, v]); return b; }, eq(c, v) { q.f.push(["eq:" + c, v]); return b; }, order(c) { q.o.push(c); return b; }, range(a, z) { q.r = [a, z]; return b; }, upsert(rows) { q.up = rows; return b; }, maybeSingle: async () => ({ data: w.prefs, error: null }),
        then(res, rej) { return Promise.resolve().then(() => {
          if (table !== "records") return { data: [], error: null };
          if (q.up) { const out = q.up.map((r) => { const u = ts(); w.rows.set(r.user_id + r.kind + r.id, { ...JSON.parse(JSON.stringify(r)), updated_at: u }); return { kind: r.kind, id: r.id, updated_at: u }; }); return { data: out, error: null }; }
          let rows = [...w.rows.values()].filter((r) => r.user_id === uid);
          q.f.forEach(([c, v]) => { if (c === "updated_at") rows = rows.filter((r) => r.updated_at >= v); if (c === "eq:deleted") rows = rows.filter((r) => r.deleted === v); });
          if (q.count) return { data: null, count: rows.length, error: null };
          rows.sort((a, b2) => a.updated_at.localeCompare(b2.updated_at) || a.id.localeCompare(b2.id));
          if (q.r) rows = rows.slice(q.r[0], q.r[1] + 1);
          return { data: rows.map((r) => ({ kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, updated_at: r.updated_at })), error: null };
        }).then(res, rej); } };
      return b;
    },
    storage: { from: () => ({ async upload(path, file, o) { w.files.push({ path, type: o.contentType }); return { error: null }; }, async createSignedUrl(p) { return { data: { signedUrl: "https://signed/" + p }, error: null }; }, async remove(a) { w.removed.push(...a); return { error: null }; } }) },
  });
  return w;
}
const json = (o, ok = true) => ({ ok, json: async () => o });
async function device(w, uid, opts) {
  opts = opts || {};
  const confirms = []; const fetchLog = [];
  const cfg = { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", ai: opts.ai !== false, aiProvider: "anthropic", vapidPublicKey: "", push: false };
  const b = boot({ "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "T" }), ...(opts.seed || {}) }, {
    confirm: (m) => { confirms.push(m); return opts.confirm ? opts.confirm(m, confirms.length) : true; },
    fetch: async (url, o) => { fetchLog.push([url, o]); if (url === "/api/config") return json(cfg); if (url === "/api/tutor") return opts.tutor ? opts.tutor(o) : json({ error: "ai_not_configured" }, false); return json({}, false); },
  });
  b.ctx.supabase = { createClient: () => w.sb(uid, uid + "@x.com") };
  b.confirms = confirms; b.fetchLog = fetchLog;
  await b.run("CLOUD.init()"); await settle();
  return b;
}
const doc = (b) => b.run("document.createElement") && null;

test("first sign-in: preview with counts, backup downloads first, then local data reaches the cloud", async () => {
  const w = world();
  const A = await device(w, "u1", { seed: { "lifeos.tasks": JSON.stringify([{ id: "t1", t: "Read", pr: "low", due: "", time: "", done: false, doneAt: "" }]) } });
  assert.equal(A.confirms.length, 1); assert.match(A.confirms[0], /Link this device to u1@x.com/); assert.match(A.confirms[0], /1 tasks/); assert.match(A.confirms[0], /backup file will download/);
  assert.equal([...w.rows.values()].filter((r) => r.kind === "tasks").length, 1);
  assert.equal(A.run("CLOUD._state().status"), "synced"); assert.equal(A.run("CLOUD.badge()").includes("cl-badge"), true);
});
test("declining the link signs out and uploads nothing", async () => {
  const w = world();
  const A = await device(w, "u1", { confirm: () => false, seed: { "lifeos.tasks": JSON.stringify([{ id: "t1", t: "Keep me", pr: "low", due: "", time: "", done: false, doneAt: "" }]) } });
  assert.equal(w.rows.size, 0); assert.ok(w.calls.includes("signOut")); assert.equal(A.run("T.length"), 1, "local data untouched");
});
test("second device receives tasks, habits and study data; edits flow back", async () => {
  const w = world();
  const A = await device(w, "u1", { seed: { "lifeos.tasks": JSON.stringify([{ id: "t1", t: "Read", pr: "low", due: "", time: "", done: false, doneAt: "" }]), "lifeos.habits": JSON.stringify([{ id: "h1", name: "DSA", cat: "Learning", created: "2026-11-01", log: { "2026-11-09": 1 }, arch: false }]), "lifeos.study": JSON.stringify({ subjects: [{ id: "s1", name: "OS" }], topics: [{ id: "tp1", sid: "s1", name: "Paging" }], notes: [{ id: "n1", sid: "s1", title: "Paging", text: "Paging uses frames.", updated: "2026-11-10" }] }) } });
  const B = await device(w, "u1");
  assert.equal(B.run("T[0].t"), "Read"); assert.equal(B.run("H[0].name"), "DSA"); assert.equal(B.run("Object.keys(H[0].log).length"), 1);
  assert.equal(B.study().subjects[0].name, "OS"); assert.equal(B.study().notes[0].title, "Paging");
  B.run("T[0].done=true;T[0].doneAt='2026-11-10';sv(K.t,T)");
  B.click("sn", undefined, undefined, "c"); await settle();
  A.click("sn", undefined, undefined, "c"); await settle();
  assert.equal(A.run("T[0].done"), true, "edit made on device B arrived on device A");
});
test("two different accounts never see each other's rows", async () => {
  const w = world();
  await device(w, "u1", { seed: { "lifeos.tasks": JSON.stringify([{ id: "t1", t: "secret", pr: "low", due: "", time: "", done: false, doneAt: "" }]) } });
  const C = await device(w, "u2"); assert.equal(C.run("T.length"), 0);
});
test("sign out keeps local data; erase while signed in warns about the cloud", async () => {
  const w = world();
  const A = await device(w, "u1", { seed: { "lifeos.tasks": JSON.stringify([{ id: "t1", t: "Mine", pr: "low", due: "", time: "", done: false, doneAt: "" }]) } });
  A.click("so", undefined, undefined, "c"); await settle(); assert.equal(A.run("T.length"), 1); assert.equal(A.run("CLOUD._state().status"), "local"); assert.match(A.run("CLOUD.badge()"), /Local only/);
  const B = await device(w, "u1", { confirm: (m) => !/signed in/.test(m) ? true : false });
  const before = B.run("T.length"); B.click("rst", undefined, undefined, "a");
  assert.equal(B.run("T.length"), before, "declining the cloud warning cancels the erase");
  assert.ok(B.confirms.some((m) => /signed in, so this also deletes your synced cloud copy/.test(m)));
});

test("settings states: sign-in options, then account, reminders and privacy text naming the AI provider", async () => {
  const w = world(); const B = boot({}, { fetch: async (u) => (u === "/api/config" ? json({ supabaseUrl: "u", supabaseAnonKey: "k", ai: true, aiProvider: "anthropic", push: true, vapidPublicKey: "AAAA" }) : json({}, false)) });
  B.ctx.supabase = { createClient: () => ({ auth: { async getSession() { return { data: { session: null } }; }, onAuthStateChange() {} } }) };
  await B.run("CLOUD.init()"); await settle();
  const h = B.view("settings"); assert.match(h, /Continue with Google/); assert.match(h, /Email me a link/); assert.match(h, /Sign in to get one calm morning summary/); assert.match(h, /only the few passages you are asking about are sent to anthropic/);
  const local = boot({}); assert.match(local.view("settings"), /Cloud sync is not set up on this site/);
});
test("sign-in buttons call Supabase auth", async () => {
  const w = world(); const B = boot({}, { fetch: async (u) => (u === "/api/config" ? json({ supabaseUrl: "u", supabaseAnonKey: "k" }) : json({}, false)) });
  B.ctx.supabase = { createClient: () => ({ auth: { async getSession() { return { data: { session: null } }; }, onAuthStateChange() {}, async signInWithOAuth(o) { w.calls.push("oauth:" + o.provider); return { error: null }; }, async signInWithOtp(o) { w.calls.push("otp:" + o.email); return { error: null }; } } }) };
  await B.run("CLOUD.init()"); await settle(); B.view("settings");
  B.click("google", undefined, undefined, "c"); await settle(); assert.ok(w.calls.includes("oauth:google"));
  B.FORM["cl-em"] = "bad"; B.click("em", undefined, undefined, "c"); await settle(); assert.ok(!w.calls.some((c) => c.startsWith("otp")));
  B.FORM["cl-em"] = "me@x.com"; B.click("em", undefined, undefined, "c"); await settle(); assert.ok(w.calls.includes("otp:me@x.com"));
});

const noteSeed = { "lifeos.study": JSON.stringify({ subjects: [{ id: "s1", name: "OS" }], notes: [{ id: "n1", sid: "s1", title: "Paging", text: "Paging divides memory into fixed-size frames.\fThe TLB caches recent page table entries to speed up translation.", updated: "2026-11-10" }] }) };
test("AI explanation: shown only with citations, names the provider, handles every failure kindly", async () => {
  const w = world(); let reply;
  const A = await device(w, "u1", { seed: noteSeed, tutor: async () => reply });
  A.go("notes"); A.click("ntab", "ask"); A.FORM["ss-qq"] = "what does the TLB cache"; A.FORM["ss-qs"] = ""; A.click("qask");
  assert.match(A.app(), /page 2/); assert.match(A.app(), /Explain with AI/); assert.match(A.app(), /Sends only the 1 passage above to anthropic/);
  reply = json({ answer: "The TLB caches page table entries [1].", cited: [1], provider: "anthropic" }); A.click("qai"); await settle();
  assert.match(A.app(), /AI EXPLANATION · anthropic · based on \[1\]/);
  const sent = JSON.parse(A.fetchLog.filter((f) => f[0] === "/api/tutor").at(-1)[1].body); assert.equal(sent.passages.length, 1); assert.equal(sent.passages[0].page, 2); assert.match(A.fetchLog.at(-1)[1].headers.authorization, /^Bearer tok-u1/);
  reply = json({ answer: "Made up [ ]", cited: [], provider: "anthropic" }); A.click("qai"); await settle(); assert.match(A.app(), /did not cite your notes, so it was hidden/); assert.ok(!A.app().includes("Made up"));
  reply = json({ insufficient: true }); A.click("qai"); await settle(); assert.match(A.app(), /passages do not answer/);
  reply = json({ error: "daily_limit" }, false); A.click("qai"); await settle(); assert.match(A.app(), /reached today’s AI limit/);
  reply = json({ error: "provider_failed" }, false); A.click("qai"); await settle(); assert.match(A.app(), /AI is unavailable right now/);
});
test("AI is invisible when not configured, and prompts sign-in when signed out", async () => {
  const w = world(); const A = await device(w, "u1", { seed: noteSeed, ai: false });
  A.go("notes"); A.click("ntab", "ask"); A.FORM["ss-qq"] = "TLB"; A.click("qask"); assert.ok(!A.app().includes("Explain with AI"));
  const L = boot(noteSeed); L.go("notes"); L.click("ntab", "ask"); L.FORM["ss-qq"] = "TLB"; L.click("qask"); assert.ok(!L.app().includes("Explain with AI"));
});

function pdfEnv(pages) {
  return { numPages: pages.length, getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1].map((s, i) => ({ str: s, transform: [12, 0, 0, 12, 50, 700 - i * 14], hasEOL: true })) }) }) };
}
const file = (name, size) => ({ name, size: size || 1000, arrayBuffer: async () => new ArrayBuffer(8) });
test("PDF import: text extracted page by page, page labels survive, retrieval cites the page", async () => {
  const B = boot({ "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "" }) }); B.go("notes");
  B.ctx.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(pdfEnv([["Intro to memory management and why it matters for programs."], ["The TLB caches recent page table entries to speed up address translation."]])) }) };
  B.fire("change", { target: { id: "ss-nf", files: [file("Lecture 4.pdf")] } }); await settle();
  assert.match(B.toastText(), /PDF read: 2 pages/); assert.ok(B.FORM["ss-nx"].includes("\f")); assert.equal(B.FORM["ss-nt"], "Lecture 4");
  B.click("nsave"); const n = B.study().notes[0]; assert.equal(n.src, "pdf");
  B.click("ntab", "ask"); B.FORM["ss-qq"] = "what caches page table entries"; B.click("qask"); assert.match(B.app(), /page 2/);
  B.click("nopen", n.id, "1"); assert.match(B.app(), /PAGE 2/); assert.match(B.app(), /class="pas hl"/);
});
test("PDF import: scanned PDFs, big files and wrong types are refused clearly", async () => {
  const B = boot({ "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "" }) }); B.go("notes");
  B.ctx.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(pdfEnv([[""], [""]])) }) };
  B.fire("change", { target: { id: "ss-nf", files: [file("scan.pdf")] } }); await settle(); assert.match(B.toastText(), /scanned PDF/); assert.equal(B.FORM["ss-nx"] || "", "");
  B.fire("change", { target: { id: "ss-nf", files: [file("huge.pdf", 11e6)] } }); assert.match(B.toastText(), /over 10 MB/);
  B.fire("change", { target: { id: "ss-nf", files: [file("slides.pptx")] } }); assert.match(B.toastText(), /Only .txt, .md and .pdf/);
  B.ctx.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("bad")) }) };
  B.fire("change", { target: { id: "ss-nf", files: [file("broken.pdf")] } }); await settle(); assert.match(B.toastText(), /Could not read that PDF/);
});
test("original file goes to the user's private folder only when ticked and signed in; opening and deleting use it", async () => {
  const w = world(); const A = await device(w, "u1", { seed: { "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "" }) } }); A.go("notes");
  assert.match(A.app(), /Keep the original file in my private cloud storage/);
  A.ctx.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(pdfEnv([["Some real text content that is long enough to count as text."]])) }) };
  A.fire("change", { target: { id: "ss-nf", files: [file("My Notes (final).pdf")] } }); await settle();
  A.ctx.document.querySelector = ((orig) => (sel) => (sel === "#ss-nk" ? { checked: true } : orig(sel)))(A.ctx.document.querySelector);
  A.click("nsave"); await settle();
  const note = A.study().notes[0]; assert.equal(w.files.length, 1); assert.match(w.files[0].path, /^u1\/[a-z0-9]+\/My_Notes_final_\.pdf$/); assert.equal(w.files[0].type, "application/pdf"); assert.equal(note.file.name, "My Notes (final).pdf");
  A.click("ndel", note.id); await settle(); assert.deepEqual(w.removed, [w.files[0].path]); assert.equal(A.study().notes.length, 0);
});
test("without an account there is no cloud checkbox and nothing is uploaded", () => {
  const L = boot({ "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "" }) }); L.go("notes"); assert.ok(!L.app().includes("Keep the original file"));
});
