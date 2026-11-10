/* StudySphere features inside LifeOS: Learn, Notes + Ask, Planner, Focus, Daily goals, More.
   Plain classic script. It relies on LifeOS globals (esc, uid, today, iso, val, toast, T, view, render, row, prOpts, PR, K, sv).
   New actions use data-s="..." (LifeOS keeps data-a="..."), so the two systems never collide. */
const SS = (function () {
  "use strict";
  const C = SSCore, KEY = "lifeos.study", DAYS = 864e5;
  let S = null;
  const U = { file: null, sub: "", nt: "lib", nid: "", edit: false, nq: "", nsub: "", syl: null, res: null, qz: null, hl: -1, ft: 25, fctx: { sid: "", tid: "" }, src: "paste" };
  const blank = () => ({ v: 1, subjects: [], topics: [], ev: [], notes: [], goals: [], focus: [], quiz: [], timer: null, skip: {} });
  function norm(d) {
    const b = blank();
    if (!d || typeof d !== "object") return b;
    for (const k of Object.keys(b)) if (Array.isArray(b[k])) b[k] = Array.isArray(d[k]) ? d[k].filter((x) => x && typeof x === "object") : [];
    b.timer = d.timer && typeof d.timer === "object" ? d.timer : null;
    b.skip = d.skip && typeof d.skip === "object" ? d.skip : {};
    return b;
  }
  const st = () => S || (S = norm(ld(KEY, null)));
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast("Storage is full or blocked. Export a backup and remove large notes."); return false; }
    if (typeof CLOUD !== "undefined") CLOUD.touch();
    return true;
  }
  const quiet = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* surfaced on the next user save */ } };
  const MAP = { subjects: "subjects", topics: "topics", events: "ev", notes: "notes", goals: "goals", focus: "focus", quiz: "quiz" };
  const td = () => today();
  const subj = (id) => st().subjects.find((x) => x.id === id);
  const topic = (id) => st().topics.find((x) => x.id === id);
  const live = (a) => a.filter((x) => !x.arch);
  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const small = 'style="font-size:12px"';
  const subOpts = (sel) => '<option value="">No subject</option>' + live(st().subjects).map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  const topOpts = (sel) => '<option value="">No topic</option>' + live(st().subjects).map((s) => {
    const t = live(st().topics).filter((x) => x.sid === s.id);
    return t.length ? `<optgroup label="${esc(s.name)}">${t.map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const sigText = (e) => (e.max ? `${e.got} of ${e.max} signals (${e.pct}%)` : "No topics yet");
  const emp = (b, t, x) => `<div class="emp"><b>${b}</b>${t || ""}${x || ""}</div>`;

  /* ================= Navigation ================= */
  const PRIMARY = ["day", "tasks", "learn", "focus"];
  function navHTML(v) {
    const G = [["Overview", [["day", "My Day"]]], ["Plan", [["tasks", "My Tasks"], ["plan", "Planner"]]], ["Study", [["learn", "Learn"], ["notes", "Notes"]]], ["Routine", [["focus", "Focus"], ["habits", "Habits"], ["move", "Exercise"]]], ["", [["settings", "Settings"]]]];
    let n = 0, h = "";
    G.forEach(([g, items]) => {
      if (g) h += `<div class="ng">${g}</div>`;
      items.forEach(([id, label]) => { n++; h += `<button class="nv ${v === id ? "on" : ""} ${PRIMARY.includes(id) ? "" : "sec"}" data-a="v" data-i="${id}"><i>0${n}</i>${label}</button>`; });
    });
    h += `<button class="nv mob ${v === "more" || !PRIMARY.includes(v) ? "on" : ""}" data-a="v" data-i="more">More</button>`;
    return h;
  }
  function vMore() {
    const items = [["plan", "Planner", "Assignments, tests and exams with dates."], ["notes", "Notes", "Your notes, and questions answered from them."], ["habits", "Habits", "Daily habits and history."], ["move", "Exercise", "Workouts, sets and progress."], ["settings", "Settings", "Name, theme, backup and data."]];
    return `<div class="top"><div><h1>More</h1><p class="q">Everything else in LifeOS.</p></div></div>` + items.map(([id, n, d]) => `<div class="row"><span><b>${n}</b><br><span class="mu" style="font-size:13px">${d}</span></span><button class="btn s" data-a="v" data-i="${id}">Open</button></div>`).join("");
  }

  /* ================= Learn ================= */
  function vLearn() { const sb = subj(U.sub); return sb && !sb.arch ? learnSub(sb) : learnList(); }
  function learnList() {
    const s = st(), act = live(s.subjects), arc = s.subjects.filter((x) => x.arch);
    return `<div class="top"><div><h1>Learn</h1><p class="q">Subjects and topics. Studied, recalled and practised are tracked separately.</p></div></div>
<div class="add"><input type="text" id="ss-sn" data-se="addsub" placeholder="Add subjects, for example Maths, Physics" aria-label="New subjects"><button class="btn" data-s="addsub">Add</button></div>` +
      (act.map((sb) => {
        const tp = live(s.topics).filter((t) => t.sid === sb.id), est = C.estimate(tp, s.ev), due = tp.filter((t) => t.due && t.due <= td() && C.topicStat(t.id, s.ev).s > 0).length;
        return `<div class="hb"><div class="tr" style="margin:0;padding:0"><div class="g hn">${esc(sb.name)}</div>${due ? `<span class="chip" style="--c:var(--yl)">${due} to review</span>` : ""}<button class="btn s" data-s="open" data-i="${sb.id}">Open</button></div><div class="mo mu" style="font-size:12px;margin-top:6px">${tp.length} ${tp.length === 1 ? "topic" : "topics"} · ${sigText(est)}</div></div>`;
      }).join("") || emp("No subjects yet.", "Add the subjects you are studying this semester.")) +
      (arc.length ? `<h3 style="margin-top:40px">Archived</h3>` + arc.map((sb) => `<div class="row"><span>${esc(sb.name)} <span class="mu mo" ${small}>history kept</span></span><button class="lk" data-s="ressub" data-i="${sb.id}">Restore</button></div>`).join("") : "");
  }
  function previewHTML(p) {
    if (!p.topics.length) return `<p class="mu">Nothing new to import.${p.dupes.length ? ` ${p.dupes.length} already exist or repeat.` : ""}</p>`;
    return `<div class="ss-pv"><p><b>${p.topics.length}</b> ${p.topics.length === 1 ? "topic" : "topics"} will be added.${p.dupes.length ? ` Skipping ${p.dupes.length} duplicate${p.dupes.length === 1 ? "" : "s"}.` : ""}</p>
<div class="mu" style="font-size:13.5px">${p.topics.slice(0, 8).map(esc).join(" · ")}${p.topics.length > 8 ? ` · and ${p.topics.length - 8} more` : ""}</div>
${p.similar.length ? `<p class="od" style="font-size:13.5px">Check these look different: ${p.similar.slice(0, 3).map((x) => esc(x[0]) + " and " + esc(x[1])).join("; ")}.</p>` : ""}
<div class="add" style="margin-top:12px"><button class="btn" data-s="synok">Import ${p.topics.length}</button><button class="btn s" data-s="syno">Cancel</button></div></div>`;
  }
  function learnSub(sb) {
    const s = st(), tp = live(s.topics).filter((t) => t.sid === sb.id), est = C.estimate(tp, s.ev), d = td();
    return `<div class="top"><div><button class="lk" data-s="back" style="padding-left:0">← All subjects</button><h1>${esc(sb.name)}</h1><p class="q">${sigText(est)}. A count of what you recorded, not a mastery score.</p></div><button class="btn s" data-s="archsub" data-i="${sb.id}">Archive subject</button></div>
<section class="card" style="margin-bottom:28px"><h3>Add topics</h3><textarea id="ss-syl" aria-label="Syllabus, one topic per line" placeholder="Paste your syllabus, one topic per line. Numbering and bullets are removed.">${esc(U.syl ? U.syl.raw : "")}</textarea><div class="add" style="margin:10px 0 0"><button class="btn s" data-s="syl">Preview</button></div>${U.syl ? previewHTML(U.syl) : ""}</section>` +
      (tp.map((t, i) => {
        const x = C.topicStat(t.id, s.ev), due = x.s > 0 && t.due && t.due <= d;
        const sg = ["s", "r", "p"].map((k) => { const on = s.ev.some((e) => e.tid === t.id && e.k === k && e.d === d); return `<button class="sg ${on ? "on" : ""}" aria-pressed="${on}" data-s="tog" data-i="${t.id}" data-d="${k}">${on ? "✓ " : ""}${C.KINDS[k]} <span class="mo">${x[k]}</span></button>`; }).join("");
        return `<div class="hb"><div class="tr" style="margin:0;padding:0"><div class="g hn" style="font-size:19px">${esc(t.name)}</div>${due ? `<span class="chip" style="--c:var(--yl)">Review due</span>` : t.due && x.s ? `<span class="chip">Review ${t.due}</span>` : ""}<button class="lk" data-s="up" data-i="${t.id}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button><button class="lk" data-s="down" data-i="${t.id}" aria-label="Move down" ${i < tp.length - 1 ? "" : "disabled"}>↓</button><button class="lk" data-s="rmtopic" data-i="${t.id}" aria-label="Remove topic ${esc(t.name)}">Remove</button></div>
<div class="sgs">${sg}</div><div class="mo mu" ${small}>${x.lastS ? "Last studied " + x.lastS : "Not studied yet"}${x.lastR ? " · recalled " + x.lastR : ""}${x.lastP ? " · practised " + x.lastP : ""}</div>
${due ? `<div class="sgs"><span class="mu" style="font-size:13px">How did the review go?</span><button class="sg" data-s="rev" data-i="${t.id}" data-d="again">Forgot</button><button class="sg" data-s="rev" data-i="${t.id}" data-d="hard">Hard</button><button class="sg on" data-s="rev" data-i="${t.id}" data-d="good">Got it</button></div>` : ""}</div>`;
      }).join("") || emp("No topics yet.", "Paste your syllabus above to add them in one go."));
  }

  /* ================= Notes, Ask, Quiz ================= */
  const tabs = () => `<div class="tabs"><button class="${U.nt === "lib" ? "on" : ""}" data-s="ntab" data-i="lib">Library</button><button class="${U.nt === "ask" ? "on" : ""}" data-s="ntab" data-i="ask">Ask your notes</button></div>`;
  function vNotes() { return U.nt === "ask" ? askView() : U.nid && st().notes.find((n) => n.id === U.nid) ? noteDetail() : libView(); }
  function noteList() {
    const q = U.nq.toLowerCase();
    const a = live(st().notes).filter((n) => (!U.nsub || n.sid === U.nsub) && (!q || (n.title + " " + n.text).toLowerCase().includes(q))).sort((x, y) => (y.updated || "").localeCompare(x.updated || ""));
    return a.map((n) => `<div class="hb"><div class="tr" style="margin:0;padding:0"><div class="g hn">${esc(n.title)}</div>${n.sid && subj(n.sid) ? `<span class="chip" style="--c:var(--sg)">${esc(subj(n.sid).name)}</span>` : ""}<button class="btn s" data-s="nopen" data-i="${n.id}">Open</button><button class="lk" data-s="ndel" data-i="${n.id}" aria-label="Delete note ${esc(n.title)}">Delete</button></div><div class="mo mu" ${small}>Updated ${n.updated} · ${n.text.length} characters</div><div class="mu" style="font-size:14px;margin-top:4px">${esc(n.text.slice(0, 120))}${n.text.length > 120 ? "…" : ""}</div></div>`).join("") || emp(q || U.nsub ? "No matching notes." : "No notes yet.", q || U.nsub ? "Try a different word or subject." : "Paste notes above, or import a text or Markdown file.");
  }
  function libView() {
    return `<div class="top"><div><h1>Notes</h1><p class="q">Your notes stay in this browser. Ask questions against them in the next tab.</p></div></div>${tabs()}
<section class="card" style="margin:12px 0 28px"><h3>New note</h3><input type="text" id="ss-nt" placeholder="Title" aria-label="Note title" style="width:100%;margin-bottom:8px">
<div class="add"><select id="ss-ns" aria-label="Subject">${subOpts("")}</select><select id="ss-nto" aria-label="Link to topic">${topOpts("")}</select></div>
<textarea id="ss-nx" aria-label="Note text" placeholder="Paste or type your notes"></textarea>
<div class="add" style="margin:10px 0 0"><button class="btn" data-s="nsave">Save note</button><button class="btn s" data-s="nfile">Import .txt, .md or .pdf</button><input type="file" id="ss-nf" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" hidden></div>${CLOUD.signedIn() ? '<label style="display:block;margin-top:10px;font-size:13.5px"><input type="checkbox" id="ss-nk"> Keep the original file in my private cloud storage</label>' : ""}
<p class="mu" style="font-size:12.5px;margin:10px 0 0">Text and Markdown files up to 1 MB. PDFs with selectable text up to 10 MB (first 300 pages); scanned PDFs are not supported yet. The file fills the form so you can check it before saving.</p></section>
<div class="add"><input type="search" id="ss-nq" placeholder="Search notes" value="${esc(U.nq)}" aria-label="Search notes" style="width:100%;max-width:320px"><select id="ss-nfs" aria-label="Filter by subject"><option value="">All subjects</option>${live(st().subjects).map((x) => `<option value="${x.id}" ${U.nsub === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div><div id="ss-nl">${noteList()}</div>`;
  }
  function noteDetail() {
    const n = st().notes.find((x) => x.id === U.nid), sb = subj(n.sid), tp = topic(n.tid);
    const body = U.edit
      ? `<input type="text" id="ss-et" value="${esc(n.title)}" aria-label="Title" style="width:100%;margin-bottom:8px"><textarea id="ss-ex" aria-label="Note text" style="min-height:260px">${esc(n.text)}</textarea><div class="add" style="margin:10px 0 0"><button class="btn" data-s="nupd">Save changes</button><button class="btn s" data-s="nedit">Cancel</button></div>`
      : `<div class="card ss-doc">${C.chunkPages(n.text).map((c, i, a) => `${c.page && (!i || a[i - 1].page !== c.page) ? `<div class="mo mu" style="font-size:11px;padding-top:10px">PAGE ${c.page}</div>` : ""}<div class="pas ${i === U.hl ? "hl" : ""}" id="pas-${i}">${esc(c.text)}</div>`).join("") || '<span class="mu">This note is empty.</span>'}</div>`;
    return `<div class="top"><div><button class="lk" data-s="nback" style="padding-left:0">← All notes</button><h1>${esc(n.title)}</h1><p class="mo mu" ${small}>${sb ? esc(sb.name) + " · " : ""}${tp ? esc(tp.name) + " · " : ""}Updated ${n.updated}${n.file ? ` · <button class="lk" data-s="nfileopen" data-i="${n.id}">${CLOUD.signedIn() ? "Open original file" : "Original file is in your cloud"}</button>` : ""}</p></div><span><button class="btn s" data-s="nedit">${U.edit ? "Cancel" : "Edit"}</button> <button class="btn s" data-s="ndel" data-i="${n.id}">Delete</button></span></div>${body}`;
  }
  function askView() {
    const r = U.res, z = U.qz;
    const hits = !r ? "" : r.enough ? r.hits.map((h, i) => `<div class="hb"><div class="mo mu" ${small}>[${i + 1}] ${esc(h.title)}${h.page ? " · page " + h.page : ""} · passage ${h.idx + 1} · ${h.pct}% match</div><div class="ss-ex">${esc(h.text)}</div><button class="lk" data-s="nopen" data-i="${h.noteId}" data-d="${h.idx}">Open note at this passage</button></div>`).join("")
      : emp(r.reason === "nonotes" ? "No notes in this scope yet." : r.reason === "empty" ? "Type a question first." : "Not enough evidence in your notes.", r.reason === "weak" ? "Add notes on this topic, or try different words." : "");
    let ai = "";
    if (r && r.enough) {
      const a = r.ai, msg = { login_required: "Sign in (Settings) to use AI explanations.", daily_limit: "You have reached today’s AI limit. The excerpts above still work.", ai_not_configured: "AI is not set up on this site." };
      ai = `<div class="hb">` + (CLOUD.aiReady() ? `<div class="add" style="margin:0"><button class="btn s" data-s="qai" ${r.aiBusy ? "disabled" : ""}>${r.aiBusy ? "Thinking…" : "Explain with AI"}</button></div><p class="mu" style="font-size:12.5px;margin:8px 0 0">Sends only the ${r.hits.length} passage${r.hits.length > 1 ? "s" : ""} above to ${esc(CLOUD.aiProvider())}. Optional.</p>` : CLOUD.aiOffered() ? `<p class="mu" style="font-size:13.5px;margin:0">Sign in from Settings to get an AI explanation of these passages.</p>` : "") +
        (a ? (a.answer ? `<div class="card" style="margin-top:14px"><div class="mo mu" ${small}>AI EXPLANATION · ${esc(a.provider)} · based on ${a.cited.map((n) => "[" + n + "]").join(" ")}</div><div class="ss-ex">${esc(a.answer)}</div><p class="mu" style="font-size:12.5px;margin:6px 0 0">Generated text can be wrong. Check it against the excerpts.</p></div>` : `<p class="mu" style="margin-top:12px">${a.insufficient ? "The AI found the passages do not answer this question." : a.ungrounded ? "The AI reply did not cite your notes, so it was hidden." : esc(msg[a.error] || "AI is unavailable right now. The excerpts above still work.")}</p>`) : "") + `</div>`;
    }
    let quiz = "";
    if (z) {
      const n = st().notes.find((x) => x.id === z.nid);
      quiz = `<div class="hb"><div class="mo mu" ${small}>From ${esc(n ? n.title : "a note")} · passage ${z.idx + 1}</div><p class="ss-ex" style="margin:8px 0">${esc(z.prompt)}</p>` +
        (z.shown ? `<p>${z.ok === true ? "Correct. " : z.ok === false ? "Not quite. " : ""}Answer: <b>${esc(z.answer)}</b></p><div class="sgs"><span class="mu" style="font-size:13px">How did it go?</span><button class="sg on" data-s="qrate" data-d="knew">Knew it</button><button class="sg" data-s="qrate" data-d="partly">Partly</button><button class="sg" data-s="qrate" data-d="missed">Missed it</button></div>`
          : `<div class="add"><input type="text" id="ss-qa" data-se="qchk" placeholder="Your answer" aria-label="Your answer"><button class="btn" data-s="qchk">Check</button><button class="btn s" data-s="qrev">Reveal answer</button></div>`) + `</div>`;
    }
    return `<div class="top"><div><h1>Notes</h1><p class="q">Answers are exact excerpts from your own notes. No AI is used and nothing leaves this browser.</p></div></div>${tabs()}
<div class="add" style="margin-top:12px"><input type="text" id="ss-qq" data-se="qask" placeholder="What do you want to find in your notes?" aria-label="Question" value="${esc(r ? r.q : "")}"><select id="ss-qs" aria-label="Search in">${'<option value="">All subjects</option>' + live(st().subjects).map((x) => `<option value="${x.id}" ${(r ? r.sid : U.nsub) === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><button class="btn" data-s="qask">Search</button></div>${hits}${ai}
<h3 style="margin-top:36px">Quiz</h3><div class="add"><button class="btn s" data-s="quiz">Quiz me from my notes</button></div>${quiz}`;
  }

  /* ================= Planner ================= */
  const CATS = [["assignment", "Assignment"], ["test", "Test"], ["exam", "Exam"], ["practical", "Practical"], ["project", "Project"], ["revision", "Revision"], ["admin", "Admin"]];
  const catName = (c) => (CATS.find((x) => x[0] === c) || [0, "Personal"])[1];
  function vPlan() {
    const d = td(), wk = C.addDays(d, 7), all = T.filter((t) => t.cat && t.cat !== "personal"), open = all.filter((t) => !t.done).sort(cmp);
    const grp = [["Overdue", open.filter((t) => t.due && t.due < d)], ["This week", open.filter((t) => t.due && t.due >= d && t.due <= wk)], ["Later", open.filter((t) => !t.due || t.due > wk)]];
    const done = all.filter((t) => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || "")).slice(0, 5);
    return `<div class="top"><div><h1>Planner</h1><p class="q">Assignments, tests and exams. They also appear in My Tasks.</p></div></div>
<div class="add"><input type="text" id="ss-pt" data-se="padd" placeholder="What is due? For example, DBMS assignment 2" aria-label="Title"><select id="ss-pc" aria-label="Category">${CATS.map((c) => `<option value="${c[0]}">${c[1]}</option>`).join("")}</select><select id="ss-ps" aria-label="Subject">${subOpts("")}</select><select id="ss-pp" aria-label="Priority">${prOpts("medium")}</select><input type="date" id="ss-pd" value="${d}" aria-label="Due date"><input type="time" id="ss-pm" aria-label="Due time"><button class="btn" data-s="padd">Add</button></div>` +
      (all.length ? grp.filter((g) => g[1].length).map((g) => `<h3 style="margin-top:28px">${g[0]} <span class="mo" style="text-transform:none;letter-spacing:0">${g[1].length}</span></h3>${g[1].map(row).join("")}`).join("") + (done.length ? `<h3 style="margin-top:36px">Recently completed</h3>${done.map(row).join("")}` : "") : emp("Nothing planned.", "Add an assignment, test or exam above."));
  }

  /* ================= Focus ================= */
  function finishTimer(status) {
    const s = st(), t = s.timer; if (!t) return;
    const sec = status === "done" ? t.plan * 60 : C.actualSeconds(t, Date.now());
    s.focus.push({ id: uid(), d: iso(t.start), sid: t.sid || "", tid: t.tid || "", plan: t.plan, sec, status });
    s.timer = null; save();
    toast(sec >= 60 ? "Session saved: " + Math.round(sec / 60) + " min" : "Session ended");
  }
  function vFocus() {
    const s = st(), t = s.timer, mins = C.focusMinutes(s.focus, td());
    const recent = s.focus.slice(-8).reverse();
    let main;
    if (t) {
      const rem = C.remaining(t, Date.now()), where = [subj(t.sid) && subj(t.sid).name, topic(t.tid) && topic(t.tid).name].filter(Boolean).map(esc).join(" · ");
      main = `<div class="card ss-clock"><div class="mo mu" ${small}>${t.paused != null ? "PAUSED" : "FOCUSING"} · ${t.plan} MIN PLAN${where ? " · " + where : ""}</div><div class="ss-big" id="ss-clock" role="timer" aria-live="off">${mmss(rem)}</div>
<div class="add" style="margin:0;justify-content:center">${t.paused != null ? '<button class="btn" data-s="fresume">Resume</button>' : '<button class="btn" data-s="fpause">Pause</button>'}<button class="btn s" data-s="ffin">Finish now</button><button class="btn s" data-s="freset">Discard</button></div></div>`;
    } else {
      main = `<div class="card"><h3>Start a session</h3><div class="add" style="align-items:center"><span class="seg">${[15, 25, 45, 60].map((m) => `<button class="${U.ft === m ? "on" : ""}" data-s="fplan" data-i="${m}">${m}</button>`).join("")}</span><label class="mu" for="ss-fm" style="font-size:13px">minutes</label><input type="number" id="ss-fm" class="si" min="1" max="240" value="${U.ft}"></div>
<div class="add"><select id="ss-fs" aria-label="Subject">${subOpts(U.fctx.sid)}</select><select id="ss-ft" aria-label="Topic">${topOpts(U.fctx.tid)}</select></div><button class="btn" data-s="fstart">Start focus</button>
<p class="mu" style="font-size:12.5px;margin:12px 0 0">Time is recorded, not attention. A session does not mark a topic as studied; do that in Learn.</p></div>`;
    }
    return `<div class="top"><div><h1>Focus</h1><p class="q">${mins ? mins + " minutes focused today." : "One session is a good start."}</p></div></div>${main}<h3 style="margin-top:36px">Recent sessions</h3>` +
      (recent.map((f) => `<div class="row"><span>${esc(f.d)} · <b>${Math.round(f.sec / 60)} min</b> <span class="mu" style="font-size:13px">of ${f.plan}${f.sid && subj(f.sid) ? " · " + esc(subj(f.sid).name) : ""}${f.tid && topic(f.tid) ? " · " + esc(topic(f.tid).name) : ""}</span></span><span class="chip">${f.status === "done" ? "Completed" : "Ended early"}</span></div>`).join("") || emp("No sessions yet."));
  }

  /* ================= My Day cards ================= */
  const gctx = () => ({ date: td(), focus: st().focus, events: st().ev });
  function goalRow(g, c) {
    const p = C.goalProgress(g, c), chk = g.t === "check";
    return `<div class="tr ${p.done ? "dn" : ""}">${chk ? `<button class="cb ${p.done ? "on" : ""}" role="checkbox" aria-checked="${p.done}" aria-label="Complete: ${esc(g.label)}" data-s="gtog" data-i="${g.id}"></button>` : `<span class="cb ${p.done ? "on" : ""}" role="img" aria-label="${p.done ? "Goal reached" : "In progress"}"></span>`}<div class="g"><div class="tt">${esc(g.label)}</div><div class="mo mu" ${small}>${chk && !p.skipped ? (p.done ? "Done" : "Tick when done") : p.text}</div></div>${p.skipped ? '<span class="chip">Skipped</span>' : ""}${!p.done ? `<button class="lk" data-s="gskip" data-i="${g.id}">${p.skipped ? "Restore" : "Skip"}</button>` : ""}<button class="lk" data-s="grm" data-i="${g.id}" aria-label="Remove goal ${esc(g.label)}">Remove</button></div>`;
  }
  function dayLeft() {
    const s = st(), c = gctx(), gs = s.goals.filter((g) => g.d === td()), sum = C.daySummary(s.goals, c);
    const sug = `<div class="emp" style="text-align:left"><b>Set today’s goals.</b>One for study, one personal and one for your routine works well. Choose your own.<div class="add" style="margin:12px 0 0"><button class="btn s" data-s="gsug" data-i="study">Study one topic</button><button class="btn s" data-s="gsug" data-i="focus">Focus 25 minutes</button><button class="btn s" data-s="gsug" data-i="walk">15 minute walk</button></div></div>`;
    return `<section><h3>Daily goals <span class="mo" style="text-transform:none;letter-spacing:0">${sum.total ? sum.done + " of " + sum.total + " complete" + (sum.skipped ? ", " + sum.skipped + " skipped" : "") : ""}</span></h3>${gs.length ? gs.map((g) => goalRow(g, c)).join("") : sug}
<div class="add" style="margin-top:10px"><input type="text" id="ss-gl" data-se="addgoal" placeholder="Add a goal for today" aria-label="New goal"><select id="ss-gt" aria-label="Goal type"><option value="check">Checklist</option><option value="focus">Focus minutes</option><option value="recall">Topics recalled</option></select><input type="number" id="ss-gn" class="si" min="1" max="600" value="25" aria-label="Target for focus minutes or recalled topics"><button class="btn" data-s="addgoal">Add</button></div></section>`;
  }
  function dayRight() {
    const s = st(), n = C.nextStep(s.subjects, s.topics, s.ev, td(), s.skip[td()] || []), mins = C.focusMinutes(s.focus, td());
    const body = !live(s.subjects).length ? `<div class="emp"><b>No subjects yet.</b><button class="btn" data-a="v" data-i="learn" style="margin-top:10px">Add a subject</button></div>`
      : !n ? emp("You are caught up.", "Add topics or notes when you have more to study.")
        : `<div class="card"><div class="mo mu" ${small}>${esc(n.subject.name)}</div><div class="hn" style="margin:4px 0 6px">${esc(n.topic.name)}</div><p class="mu" style="margin:0 0 14px;font-size:14px">${esc(n.reason)}</p><div class="add" style="margin:0"><button class="btn" data-s="open" data-i="${n.subject.id}">Continue topic</button><button class="btn s" data-s="ftopic" data-i="${n.topic.id}">Focus on it</button><button class="lk" data-s="dismiss" data-i="${n.topic.id}">Not today</button></div></div>`;
    return `<section><h3>Next study step</h3>${body}<p class="mo mu" ${small} style="margin:10px 0 0">Focus today: ${mins} min · <button class="lk" data-a="v" data-i="focus">Open Focus</button></p></section>`;
  }

  /* ================= Actions ================= */
  function act(a, i, d) {
    const s = st();
    switch (a) {
      case "addsub": { const names = C.parseList(val("ss-sn")), have = new Set(s.subjects.map((x) => x.name.toLowerCase())); let n = 0; names.forEach((nm) => { if (!have.has(nm.toLowerCase())) { s.subjects.push({ id: uid(), name: nm, created: td(), arch: false }); n++; } }); save(); toast(n ? n + " subject" + (n > 1 ? "s" : "") + " added" : "Nothing new to add"); fx = "ss-sn"; break; }
      case "open": U.sub = i; view = "learn"; break;
      case "back": U.sub = ""; U.syl = null; break;
      case "archsub": { const x = subj(i); if (x) { x.arch = true; save(); } U.sub = ""; toast("Archived. Topics, notes and history are kept."); break; }
      case "ressub": { const x = subj(i); if (x) { x.arch = false; save(); } break; }
      case "syl": { const raw = $("#ss-syl").value; U.syl = Object.assign({ raw }, C.parseSyllabus(raw, live(s.topics).filter((t) => t.sid === U.sub).map((t) => t.name))); break; }
      case "syno": U.syl = null; break;
      case "synok": { U.syl.topics.forEach((n) => s.topics.push({ id: uid(), sid: U.sub, name: n, created: td(), due: null, stage: 0, arch: false })); save(); toast(U.syl.topics.length + " topics added"); U.syl = null; break; }
      case "tog": { const t = topic(i); if (!t) break; const ix = s.ev.findIndex((e) => e.tid === i && e.k === d && e.d === td());
        if (ix >= 0) { s.ev.splice(ix, 1); if (d === "s" && !s.ev.some((e) => e.tid === i && e.k === "s")) { t.due = null; t.stage = 0; } }
        else { s.ev.push({ id: uid(), tid: i, sid: t.sid, k: d, d: td(), at: new Date().toISOString() }); if (d === "s" && !t.due) { const f = C.firstReview(td()); t.stage = f.stage; t.due = f.due; } }
        save(); break; }
      case "rev": { const t = topic(i); if (!t) break; const r = C.afterReview(t.stage || 0, d, td()); t.stage = r.stage; t.due = r.due; s.ev = s.ev.filter((e) => !(e.tid === i && e.k === "v" && e.d === td())); s.ev.push({ id: uid(), tid: i, sid: t.sid, k: "v", d: td(), res: d, at: new Date().toISOString() }); save(); toast("Next review " + r.due); break; }
      case "up": case "down": { const t = topic(i); if (!t) break; const idx = s.topics.indexOf(t), step = a === "up" ? -1 : 1; let j = idx + step; while (j >= 0 && j < s.topics.length && (s.topics[j].sid !== t.sid || s.topics[j].arch)) j += step; if (j >= 0 && j < s.topics.length) { s.topics[idx] = s.topics[j]; s.topics[j] = t; save(); } break; }
      case "rmtopic": { const t = topic(i); if (t) { t.arch = true; save(); toast("Topic removed. Its history is kept."); } break; }
      /* notes */
      case "ntab": U.nt = i; U.nid = ""; U.edit = false; break;
      case "nopen": U.nt = "lib"; U.nid = i; U.edit = false; U.hl = d === undefined ? -1 : +d; view = "notes"; render(); if (U.hl >= 0) { const e = $("#pas-" + U.hl); e && e.scrollIntoView({ block: "center" }); } return;
      case "nback": U.nid = ""; U.edit = false; U.hl = -1; break;
      case "nfile": $("#ss-nf").click(); return;
      case "nsave": { const text = $("#ss-nx").value; if (!text.trim()) return toast("Write or import some text first"); const tid = $("#ss-nto").value, sid = tid ? (topic(tid) || {}).sid : $("#ss-ns").value; const nn = { id: uid(), sid: sid || "", tid: tid || "", title: val("ss-nt").slice(0, 120) || "Untitled note", text, src: U.src, created: td(), updated: td(), arch: false }; s.notes.push(nn); const keep = $("#ss-nk") && $("#ss-nk").checked && U.file && CLOUD.signedIn(), f = U.file; U.src = "paste"; U.file = null; if (!save()) { s.notes.pop(); return; } toast("Note saved");
        if (keep) CLOUD.uploadFile(nn.id, f).then((m) => { nn.file = m; save(); render(); toast("Original file stored in your cloud"); }).catch(() => toast("Could not upload the original. The note itself is saved.")); break; }
      case "nedit": U.edit = !U.edit; break;
      case "nfileopen": { const n = s.notes.find((x) => x.id === i); if (n && n.file && CLOUD.signedIn()) CLOUD.fileUrl(n.file.path).then((u) => window.open(u, "_blank", "noopener")).catch(() => toast("Could not open the file")); return; }
      case "nupd": { const n = s.notes.find((x) => x.id === U.nid); if (n) { n.title = val("ss-et").slice(0, 120) || "Untitled note"; n.text = $("#ss-ex").value; n.updated = td(); save(); toast("Note updated"); } U.edit = false; break; }
      case "ndel": { const n = s.notes.find((x) => x.id === i); if (n && confirm("Delete the note “" + n.title + "”?" + (n.file ? " Its original file in your cloud storage is deleted too." : "") + " This cannot be undone.")) { if (n.file && CLOUD.signedIn()) CLOUD.removeFile(n.file.path); s.notes = s.notes.filter((x) => x.id !== i); save(); U.nid = ""; toast("Note deleted"); } break; }
      case "qai": { const r = U.res; if (!r || !r.enough || r.aiBusy) return; r.aiBusy = true; r.ai = null; render();
        CLOUD.ask(r.q, r.hits).then((j) => { r.ai = j.insufficient ? { insufficient: true } : !j.cited || !j.cited.length ? { ungrounded: true } : j; }).catch((e) => { r.ai = { error: e && e.code }; }).finally(() => { r.aiBusy = false; render(); }); return; }
      case "qask": { const q = val("ss-qq"), sid = $("#ss-qs").value; U.res = Object.assign({ q, sid }, C.retrieve(q, live(s.notes), { sid })); break; }
      case "quiz": { const sid = $("#ss-qs") ? $("#ss-qs").value : ""; const pool = []; live(s.notes).filter((n) => !sid || n.sid === sid).forEach((n) => C.chunkPages(n.text).forEach((c, idx) => pool.push({ n, idx, c: c.text }))); const tries = pool.slice().sort(() => Math.random() - 0.5); let z = null; for (const p of tries) { const b = C.makeBlank(p.c); if (b) { z = { nid: p.n.id, idx: p.idx, prompt: b.prompt, answer: b.answer, shown: false, ok: null }; break; } } if (!z) return toast("Add a longer note to generate a quiz"); U.qz = z; break; }
      case "qchk": { const g = val("ss-qa"); U.qz.ok = C.sameAnswer(g, U.qz.answer); U.qz.shown = true; break; }
      case "qrev": U.qz.shown = true; break;
      case "qrate": { const z = U.qz, n = s.notes.find((x) => x.id === z.nid); s.quiz.push({ id: uid(), nid: z.nid, idx: z.idx, res: d, d: td(), at: new Date().toISOString() }); if (n && n.tid && topic(n.tid) && !s.ev.some((e) => e.tid === n.tid && e.k === "p" && e.d === td())) s.ev.push({ id: uid(), tid: n.tid, sid: n.sid, k: "p", d: td(), src: "quiz", at: new Date().toISOString() }); save(); U.qz = null; toast("Recorded. Ask for another when ready."); break; }
      /* planner */
      case "padd": { const t = val("ss-pt"); if (!t) return; T.push({ id: uid(), t, pr: val("ss-pp") || "medium", due: val("ss-pd"), time: val("ss-pm"), done: false, doneAt: "", cat: val("ss-pc"), sid: val("ss-ps") }); sv(K.t, T); fx = "ss-pt"; toast("Added to Planner and My Tasks"); break; }
      /* focus */
      case "fplan": U.ft = +i; break;
      case "fstart": { const m = Math.max(1, Math.min(240, +val("ss-fm") || 25)); U.ft = m; U.fctx = { sid: $("#ss-fs").value, tid: $("#ss-ft").value }; if (U.fctx.tid && !U.fctx.sid) U.fctx.sid = (topic(U.fctx.tid) || {}).sid || ""; s.timer = C.startTimer(m, U.fctx, Date.now()); save(); break; }
      case "fpause": s.timer = C.pauseTimer(s.timer, Date.now()); save(); break;
      case "fresume": s.timer = C.resumeTimer(s.timer, Date.now()); save(); break;
      case "ffin": finishTimer("stopped"); break;
      case "freset": if (confirm("Discard this session without saving it?")) { s.timer = null; save(); } break;
      case "ftopic": { const t = topic(i); U.fctx = { sid: t ? t.sid : "", tid: i }; view = "focus"; break; }
      /* goals */
      case "addgoal": { const t = $("#ss-gt").value, n = Math.max(1, Math.min(600, +val("ss-gn") || 1)); let label = val("ss-gl"); if (!label) { if (t === "check") return; label = t === "focus" ? "Focus " + n + " minutes" : "Recall " + n + (n === 1 ? " topic" : " topics"); } s.goals.push({ id: uid(), d: td(), t, label: label.slice(0, 100), target: t === "check" ? 1 : n, done: false, skipped: false }); save(); fx = "ss-gl"; break; }
      case "gsug": { const m = { study: ["check", "Study one topic", 1], focus: ["focus", "Focus 25 minutes", 25], walk: ["check", "15 minute walk", 1] }[i]; s.goals.push({ id: uid(), d: td(), t: m[0], label: m[1], target: m[2], done: false, skipped: false }); save(); break; }
      case "gtog": { const g = s.goals.find((x) => x.id === i); if (g) { g.done = !g.done; g.doneAt = g.done ? new Date().toISOString() : ""; save(); if (g.done) toast("Goal complete"); } break; }
      case "gskip": { const g = s.goals.find((x) => x.id === i); if (g) { g.skipped = !g.skipped; save(); } break; }
      case "grm": s.goals = s.goals.filter((x) => x.id !== i); save(); break;
      case "dismiss": (s.skip[td()] = s.skip[td()] || []).push(i); Object.keys(s.skip).forEach((k) => k !== td() && delete s.skip[k]); save(); break;
      default: return;
    }
    render();
  }

  document.addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (b && !b.disabled) act(b.dataset.s, b.dataset.i, b.dataset.d); });
  document.addEventListener("keydown", (e) => { const t = e.target; if (e.key === "Enter" && t.dataset && t.dataset.se) { e.preventDefault(); act(t.dataset.se); } });
  document.addEventListener("input", (e) => { if (e.target.id === "ss-nq") { U.nq = e.target.value; const l = $("#ss-nl"); if (l) l.innerHTML = noteList(); } });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "ss-nfs") { U.nsub = t.value; const l = $("#ss-nl"); if (l) l.innerHTML = noteList(); }
    else if (t.id === "ss-nf" && t.files[0]) {
      const f = t.files[0];
      const title = f.name.replace(/\.(txt|md|pdf)$/i, "");
      if (/\.pdf$/i.test(f.name)) {
        if (f.size > 10485760) return toast("That PDF is over 10 MB");
        toast("Reading PDF…"); U.file = f;
        readPdf(f).then(({ pages, total }) => {
          if (C.looksScanned(pages)) { U.file = null; return toast("No selectable text found. This looks like a scanned PDF, which is not supported yet."); }
          $("#ss-nx").value = pages.join("\f"); if (!val("ss-nt")) $("#ss-nt").value = title; U.src = "pdf";
          toast("PDF read: " + total + " pages" + (total > 300 ? " (first 300 kept)" : "") + ". Check it, then save.");
        }).catch(() => { U.file = null; toast("Could not read that PDF"); });
        return;
      }
      if (!/\.(txt|md)$/i.test(f.name)) return toast("Only .txt, .md and .pdf files are supported");
      if (f.size > 1048576) return toast("That file is over 1 MB");
      U.file = f;
      const r = new FileReader();
      r.onload = () => { $("#ss-nx").value = String(r.result); if (!val("ss-nt")) $("#ss-nt").value = f.name.replace(/\.(txt|md)$/i, ""); U.src = "file"; toast("File loaded. Check it, then save."); };
      r.readAsText(f);
    } else if (t.id === "ss-fm") U.ft = Math.max(1, Math.min(240, +t.value || 25));
  });
  /* PDF import: pdf.js is loaded from a CDN only when a PDF is chosen. Text only; scanned PDFs are reported, not guessed at. */
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  async function readPdf(file) {
    if (!window.pdfjsLib) await new Promise((ok, no) => { const el = document.createElement("script"); el.src = PDFJS + "pdf.min.js"; el.onload = ok; el.onerror = () => no(new Error("load")); document.head.appendChild(el); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
    const doc = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, 300); n++) { const tc = await (await doc.getPage(n)).getTextContent(); pages.push(C.itemsToText(tc.items)); }
    return { pages, total: doc.numPages };
  }
  /* Timer tick: derived from timestamps, so it is right after refresh, sleep or navigation. */
  setInterval(() => {
    try {
      const t = st().timer; if (!t) return;
      const rem = C.remaining(t, Date.now());
      if (rem === 0 && t.paused == null) { finishTimer("done"); render(); return; }
      ["ss-clock", "ss-bn"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = mmss(rem); });
    } catch (x) { /* never break the page for a clock */ }
  }, 500);

  /* ================= Hooks used by index.html ================= */
  function after() {
    const s = st(), t = s.timer;
    if (t && t.paused == null && C.remaining(t, Date.now()) === 0) { finishTimer("done"); }
    if (s.timer && view !== "focus") {
      const rem = C.remaining(s.timer, Date.now());
      $("#app").insertAdjacentHTML("afterbegin", `<div class="emp" style="margin-bottom:20px;text-align:left;padding:14px 18px">Focus session ${s.timer.paused != null ? "paused" : "running"}: <b class="mo" id="ss-bn">${mmss(rem)}</b> left. <button class="lk" data-a="v" data-i="focus" style="text-decoration:underline">Open Focus</button></div>`);
    }
  }
  return {
    views: { learn: vLearn, notes: vNotes, plan: vPlan, focus: vFocus, more: vMore },
    navHTML, after, dayLeft, dayRight,
    activity: (d) => C.activityCount(d, st().ev, st().focus),
    taskChips: (t) => (t.cat && t.cat !== "personal" ? `<span class="chip" style="--c:var(--lv)">${esc(catName(t.cat))}</span>` : "") + (t.sid && subj(t.sid) ? `<span class="chip" style="--c:var(--sg)">${esc(subj(t.sid).name)}</span>` : ""),
    seed(text) { const have = new Set(st().subjects.map((x) => x.name.toLowerCase())); C.parseList(text).forEach((n) => { if (!have.has(n.toLowerCase())) st().subjects.push({ id: uid(), name: n, created: td(), arch: false }); }); save(); },
    collections: () => Object.fromEntries(Object.keys(MAP).map((k) => [k, { get: () => st()[MAP[k]], set: (v) => { st()[MAP[k]] = v; quiet(); } }])),
    exportData: () => JSON.parse(JSON.stringify(st())),
    importData(d) { S = norm(d); save(); },
    reset() { S = blank(); save(); },
    settingsRow() { const s = st(); return `<div class="row"><span>Study data<br><span class="mu" style="font-size:13px">${live(s.subjects).length} subjects, ${live(s.topics).length} topics, ${live(s.notes).length} notes, ${s.focus.length} focus sessions. Included in Export JSON.</span></span></div>`; },
    U,
  };
})();
