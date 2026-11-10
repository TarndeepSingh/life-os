/* StudySphere rules inside LifeOS: pure functions only (no DOM, no storage).
   Loaded by the browser as a classic script and by Node for tests. Dates are local "YYYY-MM-DD" strings. */
(function (root) {
  "use strict";
  const DAY = 864e5;
  const dn = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;
  const fromDn = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const addDays = (s, n) => fromDn(dn(s) + n);

  /* ---------- Lists and syllabus ---------- */
  const key = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  /** "Maths, Physics and Data Structures" or one per line -> unique clean names. */
  function parseList(input, max) {
    max = max || 30;
    const cleaned = String(input || "").replace(/^\s*(my\s+)?(subjects?|topics?)\s*(are|is|:)\s*/i, "");
    const parts = cleaned.split(/[\n,;]+|\s+&\s+|\s+and\s+/i).map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean);
    const seen = new Set(), out = [];
    for (const p of parts) { const k = key(p); if (k && !seen.has(k)) { seen.add(k); out.push(p.slice(0, 80)); } }
    return out.slice(0, max);
  }
  const LEAD = /^\s*(?:[-*\u2022\u2013\u2014]+\s*|\d+(?:\.\d+)*[.)\]:-]?\s+|\(?[a-zA-Z][.)]\s+)/;
  const jacc = (a, b) => { const A = new Set(key(a).split(" ").map(stem)), B = new Set(key(b).split(" ").map(stem)); let i = 0; A.forEach((x) => B.has(x) && i++); return i / (A.size + B.size - i || 1); };
  /** One topic per line. Strips bullets/numbering, skips blanks and exact duplicates, warns about near-duplicates. */
  function parseSyllabus(text, existing) {
    const have = new Set((existing || []).map(key)), topics = [], dupes = [], similar = [];
    String(text || "").split(/\r?\n/).forEach((line) => {
      const t = line.replace(LEAD, "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (!t) return;
      const k = key(t);
      if (!k) return;
      if (have.has(k)) { dupes.push(t); return; }
      const near = topics.concat(existing || []).find((o) => jacc(o, t) >= 0.8);
      if (near) similar.push([t, near]);
      have.add(k); topics.push(t);
    });
    return { topics: topics.slice(0, 300), dupes, similar };
  }

  /* ---------- Learning signals and revision ---------- */
  const KINDS = { s: "Studied", r: "Recalled", p: "Practised" };
  const LADDER = [1, 3, 7, 14, 30];
  const firstReview = (today) => ({ stage: 0, due: addDays(today, LADDER[0]) });
  function afterReview(stage, result, today) {
    const m = LADDER.length - 1;
    const s = result === "again" ? 0 : result === "hard" ? Math.min(stage, m) : Math.min(stage + 1, m);
    return { stage: s, due: addDays(today, LADDER[s]) };
  }
  /** Signal summary for one topic. kinds = how many of the three signals exist at least once (0-3). */
  function topicStat(tid, events) {
    const o = { s: 0, r: 0, p: 0, v: 0, lastS: "", lastR: "", lastP: "" };
    for (const e of events) if (e.tid === tid) {
      o[e.k]++;
      if (e.k !== "v" && e.d > o["last" + e.k.toUpperCase()]) o["last" + e.k.toUpperCase()] = e.d;
    }
    o.kinds = (o.s > 0) + (o.r > 0) + (o.p > 0);
    return o;
  }
  /** Honest label: a count of signals recorded, not a mastery score. */
  function estimate(topics, events) {
    const live = topics.filter((t) => !t.arch);
    let got = 0;
    live.forEach((t) => { got += topicStat(t.id, events).kinds; });
    const max = live.length * 3;
    return { topics: live.length, got, max, pct: max ? Math.round((got / max) * 100) : 0 };
  }
  /** Priority: overdue revision > never studied > studied not recalled > recalled not practised. */
  function nextStep(subjects, topics, events, today, skip) {
    skip = skip || [];
    const subj = new Map(subjects.filter((s) => !s.arch).map((s, i) => [s.id, { s, i }]));
    const c = [];
    topics.forEach((t, ti) => {
      const sb = subj.get(t.sid);
      if (!sb || t.arch || skip.includes(t.id)) return;
      const st = topicStat(t.id, events);
      let rank = -1, reason = "";
      if (st.s > 0 && t.due && t.due <= today) { rank = 0; reason = "Revision was due " + (t.due === today ? "today" : "on " + t.due) + "."; }
      else if (st.s === 0) { rank = 1; reason = "You have not studied this topic yet."; }
      else if (st.r === 0) { rank = 2; reason = "Studied on " + st.lastS + ", not recalled yet. Try it without your notes."; }
      else if (st.p === 0) { rank = 3; reason = "Recalled on " + st.lastR + ", not practised yet."; }
      if (rank >= 0) c.push({ rank, due: t.due || "", si: sb.i, ti, topic: t, subject: sb.s, reason, kind: ["overdue", "new", "recall", "practise"][rank] });
    });
    c.sort((a, b) => a.rank - b.rank || (a.rank === 0 ? a.due.localeCompare(b.due) : 0) || a.si - b.si || a.ti - b.ti);
    return c[0] || null;
  }

  /* ---------- Notes: chunking, retrieval, quiz ---------- */
  const STOP = new Set("a an the and or but if then of to in on at by for with from as is are was were be been being it its this that these those what which who whom how why when where do does did can could should would will shall may might must not no yes i me my we our you your he she they them their about into over under than so such there here also very just".split(" "));
  const stem = (w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  const tokens = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
  /** Bounded passages (<= max chars) from paragraphs, falling back to sentences. */
  function chunk(text, max) {
    max = max || 600;
    const paras = String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean), out = [];
    let buf = "";
    const push = () => { if (buf.trim()) out.push(buf.trim()); buf = ""; };
    for (const p of paras) {
      const pieces = p.length <= max ? [p] : p.split(/(?<=[.!?])\s+/).reduce((a, s) => {
        while (s.length > max) { a.push(s.slice(0, max)); s = s.slice(max); }
        a.push(s); return a;
      }, []);
      for (const piece of pieces) {
        if (buf && (buf.length + piece.length + 2 > max || buf.length >= 120)) push();
        buf += (buf ? "\n\n" : "") + piece;
      }
    }
    push();
    return out;
  }
  /** Passages with page numbers. Pages in a note are separated by a form feed (\f); page is 0 for notes without pages. */
  function chunkPages(text, max) {
    const pages = String(text || "").split("\f"), out = [];
    pages.forEach((p, pi) => chunk(p, max).forEach((c) => out.push({ text: c, page: pages.length > 1 ? pi + 1 : 0 })));
    return out;
  }
  /** Rebuild readable text from pdf.js text items: new line when y changes, blank line for a bigger gap. */
  function itemsToText(items) {
    let out = "", lastY = null;
    for (const it of items || []) {
      if (!it || typeof it.str !== "string") continue;
      const y = it.transform ? it.transform[5] : 0, h = Math.abs(it.transform ? it.transform[3] : 0) || 10;
      if (lastY !== null && out) {
        const dy = Math.abs(lastY - y);
        const nl = (out.match(/\n*$/) || [""])[0].length;
        if (dy > h * 1.8) out += "\n".repeat(Math.max(0, 2 - nl)); else if (dy > h * 0.4) out += "\n".repeat(Math.max(0, 1 - nl));
        else if (!/\s$/.test(out) && it.str && !/^\s/.test(it.str)) out += " ";
      }
      out += it.str;
      if (it.hasEOL && !/\n$/.test(out)) out += "\n";
      lastY = y;
    }
    return out.replace(/[ \t]+\n/g, "\n").replace(/([a-z])-\n(?=[a-z])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  }
  /** True when a PDF yielded too little text to be useful (usually a scanned document). */
  const looksScanned = (pageTexts) => !pageTexts.length || pageTexts.join("").replace(/\s/g, "").length < 30 * pageTexts.length;
  /** Local keyword retrieval with IDF and a title boost. Returns enough:false when evidence is weak. */
  function retrieve(query, notes, opts) {
    opts = opts || {};
    const k = opts.k || 3, qt = [...new Set(tokens(query))];
    if (!qt.length) return { hits: [], enough: false, reason: "empty" };
    const chunks = [];
    notes.filter((n) => !n.arch && (!opts.sid || n.sid === opts.sid)).forEach((n) => {
      const tt = new Set(tokens(n.title));
      chunkPages(n.text).forEach(({ text, page }, idx) => chunks.push({ noteId: n.id, title: n.title, idx, page, text, tk: new Set(tokens(text)), tt }));
    });
    if (!chunks.length) return { hits: [], enough: false, reason: "nonotes" };
    const N = chunks.length, idf = {};
    qt.forEach((t) => { idf[t] = Math.log(1 + N / (1 + chunks.filter((c) => c.tk.has(t)).length)); });
    const total = qt.reduce((a, t) => a + idf[t], 0) || 1, need = Math.ceil(qt.length / 2);
    const hits = chunks.map((c) => {
      let sc = 0, m = 0;
      qt.forEach((t) => { const inT = c.tk.has(t), inH = c.tt.has(t); if (inT || inH) m++; sc += idf[t] * ((inT ? 1 : 0) + (inH ? 0.3 : 0)); });
      return { noteId: c.noteId, title: c.title, idx: c.idx, page: c.page, text: c.text, matched: m, pct: Math.min(100, Math.round((sc / total) * 100)) };
    }).filter((h) => h.matched >= need && h.pct >= 30).sort((a, b) => b.pct - a.pct).slice(0, k);
    return { hits, enough: hits.length > 0, reason: hits.length ? "" : "weak" };
  }
  /** Fill-in-the-blank from a passage: blank out one meaningful word. rnd() lets tests be deterministic. */
  function makeBlank(passage, rnd) {
    rnd = rnd || Math.random;
    const sents = String(passage || "").split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 6);
    if (!sents.length) return null;
    const s = sents[Math.floor(rnd() * sents.length)];
    const words = (s.match(/[A-Za-z][A-Za-z-]{4,}/g) || []).filter((w) => !STOP.has(w.toLowerCase())).sort((a, b) => b.length - a.length);
    if (!words.length) return null;
    const answer = words[Math.floor(rnd() * Math.min(3, words.length))];
    return { prompt: s.replace(answer, "_____"), answer, passage };
  }
  const sameAnswer = (a, b) => { const x = key(a), y = key(b); return !!x && (x === y || x.split(" ").map(stem).join(" ") === y.split(" ").map(stem).join(" ")); };

  /* ---------- Focus timer (timestamps, not a decrementing counter) ---------- */
  const remaining = (t, now) => (t.paused != null ? t.paused : Math.max(0, Math.ceil((t.end - now) / 1000)));
  const startTimer = (planMin, ctx, now) => Object.assign({ plan: planMin, start: now, end: now + planMin * 6e4, paused: null }, ctx || {});
  const pauseTimer = (t, now) => (t.paused != null ? t : Object.assign({}, t, { paused: remaining(t, now) }));
  const resumeTimer = (t, now) => (t.paused == null ? t : Object.assign({}, t, { end: now + t.paused * 1000, paused: null }));
  const actualSeconds = (t, now) => Math.max(0, Math.min(t.plan * 60, t.plan * 60 - remaining(t, now)));
  const focusMinutes = (sessions, date) => Math.round(sessions.filter((s) => s.d === date).reduce((a, s) => a + s.sec, 0) / 60);

  /* ---------- Daily goals ---------- */
  /** Derived goals read from real activity; checklist goals use the user's explicit tick. */
  function goalProgress(g, ctx) {
    if (g.skipped) return { cur: 0, target: g.target || 1, done: false, skipped: true, text: "Skipped" };
    if (g.t === "focus") { const cur = focusMinutes(ctx.focus, ctx.date); return { cur, target: g.target, done: cur >= g.target, text: cur + " of " + g.target + " focus minutes" }; }
    if (g.t === "recall") { const cur = new Set(ctx.events.filter((e) => e.d === ctx.date && e.k === "r").map((e) => e.tid)).size; return { cur, target: g.target, done: cur >= g.target, text: cur + " of " + g.target + " topics recalled" }; }
    return { cur: g.done ? 1 : 0, target: 1, done: !!g.done, text: g.done ? "Done" : "Not done" };
  }
  function daySummary(goals, ctx) {
    const today = goals.filter((g) => g.d === ctx.date);
    const states = today.map((g) => goalProgress(g, ctx));
    return { total: today.filter((g) => !g.skipped).length, done: states.filter((x) => x.done).length, skipped: states.filter((x) => x.skipped).length };
  }
  /** Any learning activity on a day (feeds the LifeOS streak). */
  const activityCount = (date, events, focus) => events.filter((e) => e.d === date).length + focus.filter((f) => f.d === date && f.sec >= 60).length;

  const api = { addDays, parseList, parseSyllabus, chunkPages, itemsToText, looksScanned, KINDS, LADDER, firstReview, afterReview, topicStat, estimate, nextStep, tokens, chunk, retrieve, makeBlank, sameAnswer, remaining, startTimer, pauseTimer, resumeTimer, actualSeconds, focusMinutes, goalProgress, daySummary, activityCount };
  root.SSCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
