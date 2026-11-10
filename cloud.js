/* Optional cloud layer: sign-in, sync, private file storage, AI tutor calls and push reminders.
   Everything here is optional. If /api/config is missing or Supabase is not set up, LifeOS stays local-only and works as before.
   Uses LifeOS globals (T, H, X, W, N, P, K, SS, render, toast, ld, uid, $, esc). New actions use data-c="...". */
const CLOUD = (function () {
  "use strict";
  const SKEY = "lifeos.sync", LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  let cfg = {}, sb = null, session = null, engine = null, status = "local", timer = 0, running = false, lastErr = "", prefs = null;
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full: the app shows its own warning on user saves */ } };
  const email = () => (session && session.user && session.user.email) || "";
  const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

  /* ---------- Local data, exposed to the sync engine ---------- */
  const collections = () => Object.assign({
    tasks: { get: () => T, set: (v) => { T = v; put(K.t, T); } },
    habits: { get: () => H, set: (v) => { H = v; put(K.h, H); } },
    exercises: { get: () => X, set: (v) => { X = v; put(K.x, X); } },
    workouts: { get: () => W, set: (v) => { W = v; put(K.w, W); } },
    daynotes: { get: () => Object.keys(N).map((d) => ({ id: d, text: N[d] })), set: (a) => { N = {}; a.forEach((r) => { N[r.id] = r.text; }); put(K.n, N); } },
  }, SS.collections());
  const remote = {
    async pull(cursor, off, size) {
      let q = sb.from("records").select("kind,id,data,deleted,updated_at");
      if (cursor) q = q.gte("updated_at", cursor);
      const { data, error } = await q.order("updated_at", { ascending: true }).order("kind").order("id").range(off, off + size - 1);
      if (error) throw error; return data || [];
    },
    async push(rows) {
      const { data, error } = await sb.from("records").upsert(rows.map((r) => ({ user_id: session.user.id, kind: r.kind, id: r.id, data: r.data, deleted: r.deleted })), { onConflict: "user_id,kind,id" }).select("kind,id,updated_at");
      if (error) throw error; return data || [];
    },
  };
  const mkEngine = () => { engine = SyncCore.createSync({ collections: collections(), remote, loadState: () => ld(SKEY, {}), saveState: (s) => put(SKEY, s) }); };

  /* ---------- Status ---------- */
  const label = () => ({ local: cfg.supabaseUrl && !session ? "Local only" : "Saved on this device", pending: "Saved · waiting to sync", syncing: "Syncing…", synced: "Synced " + hhmm((ld(SKEY, {}) || {}).last), error: "Sync needs attention", offline: "Offline · saved on device" })[status];
  function paint() { ["cl-badge", "cl-st"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = label(); }); }
  const setStatus = (s) => { status = s; paint(); };

  /* ---------- Sync ---------- */
  function touch() {
    if (!session || !engine) return;
    try { clearTimeout(timer); engine.mark(); setStatus("pending"); timer = setTimeout(syncNow, 2500); } catch (e) { /* never break saving */ }
  }
  async function syncNow() {
    if (!session || !engine || running) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return setStatus("offline");
    running = true; setStatus("syncing");
    try {
      const r = await engine.sync();
      lastErr = ""; setStatus("synced");
      if (r.pulled) { render(); toast("Updated from your other devices"); }
      if (r.conflicts) toast(r.conflicts + " edit" + (r.conflicts > 1 ? "s" : "") + " conflicted. The newer one was kept; copies are in Settings.");
    } catch (e) { lastErr = String((e && e.message) || e); setStatus("error"); }
    finally { running = false; if (engine.pending() > 0 && status !== "error") { clearTimeout(timer); timer = setTimeout(syncNow, 4000); } }
  }
  const summ = (c) => Object.keys(c).map((k) => c[k] + " " + k).join(", ") || "nothing";
  function downloadBackup() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ prefs: P, tasks: T, habits: H, notes: N, exercises: X, workouts: W, study: SS.exportData() }, null, 2)], { type: "application/json" }));
    a.download = "lifeos-backup-before-sync-" + today() + ".json"; a.click();
  }
  async function onSignedIn() {
    mkEngine();
    const st = ld(SKEY, {}), uid = session.user.id;
    if (st.user && st.user !== uid) {
      if (!confirm("This device still holds data synced from a different account. Add it to the account you just signed in to?\n\nCancel signs you out and leaves everything untouched.")) { await signOut(); return; }
      st.base = {}; st.cursor = ""; st.pend = {};
    }
    if (st.user !== uid) {
      const lc = engine.counts(), local = Object.values(lc).reduce((a, b) => a + b, 0);
      const { count } = await sb.from("records").select("kind", { count: "exact", head: true }).eq("deleted", false);
      if (local > 0 || count > 0) {
        if (!confirm(`Link this device to ${email()}?\n\nOn this device: ${summ(lc)}.\nIn your cloud account: ${count || 0} records.\n\nEverything is combined and nothing is deleted. ${local ? "A backup file will download first." : ""}`)) { await signOut(); return; }
        if (local) downloadBackup();
      }
      st.user = uid; put(SKEY, st);
    }
    setStatus("pending"); syncNow(); loadPrefs();
  }
  function setSession(s) {
    const was = session && session.user && session.user.id; session = s || null;
    if (!session) { engine = null; prefs = null; setStatus("local"); return; }
    if (session.user.id !== was) onSignedIn();
  }

  /* ---------- Auth ---------- */
  const back = () => location.origin + location.pathname;
  async function google() { const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: back() } }); if (error) toast("Could not start Google sign-in"); }
  async function emailLink() {
    const e = val("cl-em"); if (!/^\S+@\S+\.\S+$/.test(e)) return toast("Enter a valid email address");
    const { error } = await sb.auth.signInWithOtp({ email: e, options: { emailRedirectTo: back() } });
    toast(error ? "Could not send the link. Try again in a minute." : "Check your email for the sign-in link");
  }
  async function signOut() { try { await sb.auth.signOut(); } catch (e) { /* ignore */ } setSession(null); render(); toast("Signed out. Your data stays on this device."); }
  const authed = () => ({ "content-type": "application/json", authorization: "Bearer " + session.access_token });
  const api = async (path, body) => { const r = await fetch("/api/" + path, { method: "POST", headers: authed(), body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || "failed"), { code: j.error }); return j; };

  /* ---------- Files (private bucket, one folder per user) ---------- */
  async function uploadFile(noteId, file) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80), path = `${session.user.id}/${noteId}/${safe}`;
    const type = /\.pdf$/i.test(file.name) ? "application/pdf" : /\.md$/i.test(file.name) ? "text/markdown" : "text/plain";
    const { error } = await sb.storage.from("notes").upload(path, file, { upsert: true, contentType: type });
    if (error) throw error; return { path, name: file.name, size: file.size };
  }
  async function fileUrl(path) { const { data, error } = await sb.storage.from("notes").createSignedUrl(path, 60); if (error) throw error; return data.signedUrl; }
  async function removeFile(path) { try { await sb.storage.from("notes").remove([path]); } catch (e) { /* orphan is harmless; account deletion sweeps it */ } }

  /* ---------- AI tutor ---------- */
  const ask = (question, hits) => api("tutor", { question, passages: hits.map((h) => ({ title: h.title, page: h.page, text: h.text })) });

  /* ---------- Push reminders ---------- */
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } };
  const b64 = (s) => { const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  const pushOK = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && typeof Notification !== "undefined";
  async function loadPrefs() {
    try { const { data } = await sb.from("notification_preferences").select("*").maybeSingle(); prefs = Object.assign({ enabled: false, hour: 8, quiet_start: 22, quiet_end: 7, personal: false }, data || {}); } catch (e) { prefs = null; }
    if (prefs && document.getElementById("cl-pe")) render();
  }
  const savePrefs = () => api("push", { action: "prefs", prefs: Object.assign({}, prefs, { tz: tz() }) });
  async function enablePush() {
    if (!pushOK()) return toast("This browser does not support notifications. On iPhone, add LifeOS to your Home Screen first.");
    if ((await Notification.requestPermission()) !== "granted") return toast("Notifications were not allowed");
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cfg.vapidPublicKey) }));
    await api("push", { action: "subscribe", subscription: sub.toJSON() });
    prefs.enabled = true; await savePrefs(); render(); toast("Reminders are on");
  }
  async function disablePush() {
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { await api("push", { action: "unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); } } catch (e) { /* still switch off server side */ }
    prefs.enabled = false; await savePrefs(); render(); toast("Reminders are off");
  }
  async function deleteAccount() {
    const typed = prompt("This permanently deletes your cloud account, synced data and stored files. Data on this device stays.\n\nType your email address to confirm:");
    if (typed === null) return;
    try { await api("account", { action: "delete", confirm: typed.trim() }); await signOut(); put(SKEY, {}); toast("Cloud account deleted"); }
    catch (e) { toast(e.code === "confirmation_required" ? "That email did not match" : "Could not delete the account. Nothing was changed."); }
  }

  /* ---------- Settings UI ---------- */
  const hrs = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  function settingsHTML() {
    const st = ld(SKEY, {}), nc = (st.conflicts || []).length;
    let acct;
    if (!cfg.supabaseUrl) acct = `<span>Account and sync<br><span class="mu" style="font-size:13px">Cloud sync is not set up on this site. Your data stays on this device.</span></span>`;
    else if (!session) acct = `<span>Account and sync<br><span class="mu" style="font-size:13px">Optional. Sign in to keep the same data on your phone and laptop. Everything works without it.</span></span><span><button class="btn" data-c="google">Continue with Google</button><span class="add" style="margin:10px 0 0"><input type="email" id="cl-em" placeholder="you@example.com" aria-label="Email address" data-ce="em"><button class="btn s" data-c="em">Email me a link</button></span></span>`;
    else acct = `<span>Signed in as <b>${esc(email())}</b><br><span class="mu mo" id="cl-st" style="font-size:12px">${label()}</span>${lastErr ? `<br><span class="od" style="font-size:12.5px">${esc(lastErr.slice(0, 120))}</span>` : ""}${nc ? `<br><span class="mu" style="font-size:12.5px">${nc} conflicting edit${nc > 1 ? "s" : ""} resolved by keeping the newer one. <button class="lk" data-c="dc">Download the other versions</button></span>` : ""}</span><span><button class="btn s" data-c="sn">Sync now</button> <button class="btn s" data-c="so">Sign out</button></span>`;
    let rem;
    if (!cfg.push) rem = `<span>Reminders<br><span class="mu" style="font-size:13px">Not set up on this site.</span></span>`;
    else if (!session) rem = `<span>Reminders<br><span class="mu" style="font-size:13px">Sign in to get one calm morning summary of deadlines and topics to review.</span></span>`;
    else if (!prefs) rem = `<span>Reminders<br><span class="mu" style="font-size:13px">Loading…</span></span>`;
    else rem = `<span id="cl-pe">Reminders<br><span class="mu" style="font-size:13px">One summary a day at the hour you choose, never during quiet hours. On iPhone, add LifeOS to your Home Screen first.</span>
<span class="add" style="margin:10px 0 0;align-items:center"><label class="mu" for="cl-hour" style="font-size:13px">Send at</label><select id="cl-hour" data-cp="hour">${hrs(prefs.hour)}</select><label class="mu" for="cl-qs" style="font-size:13px">Quiet</label><select id="cl-qs" data-cp="quiet_start">${hrs(prefs.quiet_start)}</select><span class="mu">to</span><select id="cl-qe" data-cp="quiet_end" aria-label="Quiet hours end">${hrs(prefs.quiet_end)}</select></span>
<label style="display:block;margin-top:8px;font-size:13.5px"><input type="checkbox" id="cl-pp" data-cp="personal" ${prefs.personal ? "checked" : ""}> Include personal tasks, not only assignments, tests and exams</label></span><span>${prefs.enabled ? '<button class="btn s" data-c="pd">Turn off</button>' : '<button class="btn" data-c="pe">Turn on</button>'}</span>`;
    const priv = `<div class="row"><span>What leaves this device<br><span class="mu" style="font-size:13px">Without an account: nothing. With an account: your tasks, habits, workouts, study records and notes sync to your private cloud storage, readable only by you. ${cfg.ai ? `If you press “Explain with AI”, only the few passages you are asking about are sent to ${esc(cfg.aiProvider)}.` : "No AI service is connected."}</span></span></div>`;
    return `<div class="row">${acct}</div><div class="row">${rem}</div>${priv}${session ? `<div class="row"><span>Delete cloud account<br><span class="mu" style="font-size:13px">Removes your login, synced data and stored files. Data on this device stays.</span></span><button class="btn s" data-c="da">Delete…</button></div>` : ""}`;
  }

  /* ---------- Events ---------- */
  const run = (p) => p.catch((e) => toast(e && e.code === "login_required" ? "Please sign in again" : "That did not work. Please try again."));
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-c]"); if (!b) return; const a = b.dataset.c;
    if (a === "google") run(google()); else if (a === "em") run(emailLink()); else if (a === "so") run(signOut());
    else if (a === "sn") { if (engine) { engine.mark(); run(syncNow()); } } else if (a === "pe") run(enablePush()); else if (a === "pd") run(disablePush()); else if (a === "da") run(deleteAccount());
    else if (a === "dc") { const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([JSON.stringify(ld(SKEY, {}).conflicts || [], null, 2)], { type: "application/json" })); l.download = "lifeos-conflicts-" + today() + ".json"; l.click(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.ce === "em") run(emailLink()); });
  document.addEventListener("change", (e) => {
    const f = e.target.dataset && e.target.dataset.cp; if (!f || !prefs) return;
    prefs[f] = f === "personal" ? e.target.checked : +e.target.value; run(savePrefs().then(() => toast("Saved")));
  });
  if (typeof addEventListener === "function") { addEventListener("online", () => syncNow()); document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); }); }
  setInterval(() => { if (session && typeof document !== "undefined" && !document.hidden) syncNow(); }, 60000);

  async function init() {
    try { const r = await fetch("/api/config", { cache: "no-store" }); cfg = r.ok ? await r.json() : {}; } catch (e) { cfg = {}; }
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      try {
        await new Promise((ok, no) => { if (window.supabase) return ok(); const s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = () => no(new Error("lib")); document.head.appendChild(s); });
        sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        const { data } = await sb.auth.getSession(); setSession(data.session);
        sb.auth.onAuthStateChange((_ev, s) => { if (s && session && s.access_token !== session.access_token) session = s; else if (!!s !== !!session || (s && s.user.id !== session.user.id)) setSession(s); });
      } catch (e) { cfg.supabaseUrl = ""; /* offline or blocked: stay local */ }
    }
    paint(); if (document.getElementById("cl-st") || /settings/.test(view)) render();
  }
  return {
    init, touch, settingsHTML, paint,
    badge: () => `<span class="mo" id="cl-badge" style="display:block;font-size:11px;margin-top:10px">${label()}</span>`,
    signedIn: () => !!session, aiOffered: () => !!cfg.ai, aiReady: () => !!(cfg.ai && session), aiProvider: () => cfg.aiProvider || "",
    uploadFile, fileUrl, removeFile, ask,
    okErase: () => !session || confirm("You are signed in, so this also deletes your synced cloud copy and removes it from your other devices. Continue?"),
    _inject(o) { if (o.cfg) cfg = o.cfg; if (o.sb) sb = o.sb; if (o.session) { session = o.session; mkEngine(); } },
    _state: () => ({ status, engine }),
  };
})();
