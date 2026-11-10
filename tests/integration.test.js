// Loads the REAL index.html script + study files into a fake DOM and drives the real click handlers.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { boot } = require("./harness.js");
const finishOnboarding = (b) => b.click("sk", undefined, undefined, "a");

test("fresh load: onboarding offers optional subjects and the LifeOS nav keeps all existing views", () => {
  const b = boot();
  assert.match(b.ov(), /Subjects you are studying \(optional\)/);
  for (const n of ["My Day", "My Tasks", "Planner", "Learn", "Notes", "Focus", "Habits", "Exercise", "Settings"]) assert.ok(b.nav().includes(n), n);
  assert.match(b.nav(), /class="nv mob/); // mobile "More" entry exists
  b.FORM.obn = "Tarn"; b.FORM.obs = "Maths, Operating Systems and DBMS";
  b.click("ob", undefined, undefined, "a");
  assert.equal(b.study().subjects.length, 3);
  assert.match(b.app(), /Daily goals/); assert.match(b.app(), /Next study step/);
});

test("existing LifeOS views still render with study features present", () => {
  const b = boot(); finishOnboarding(b);
  for (const v of ["day", "tasks", "habits", "move", "settings", "more", "learn", "notes", "plan", "focus"]) assert.ok(b.view(v).length > 100, v);
  assert.match(b.view("settings"), /Study data/);
});

test("Learn: add subjects, preview + import syllabus, signals schedule a review, streak counts study", () => {
  const b = boot(); finishOnboarding(b); b.go("learn");
  b.FORM["ss-sn"] = "Maths, OS"; b.click("addsub");
  assert.equal(b.study().subjects.length, 2);
  const sid = b.study().subjects[0].id;
  b.click("open", sid);
  b.FORM["ss-syl"] = "1. Limits\n2. Derivatives\nLIMITS\n- Integrals"; b.click("syl");
  assert.match(b.app(), /<b>3<\/b> topics will be added/); assert.match(b.app(), /Skipping 1 duplicate/);
  b.click("synok");
  const topics = b.study().topics; assert.equal(topics.length, 3);
  assert.equal(b.run("gstreak()"), 0);
  b.click("tog", topics[0].id, "s");
  const t0 = b.study().topics[0]; assert.ok(t0.due, "first study schedules a review");
  assert.equal(b.run("gstreak()"), 1, "studying counts toward the LifeOS streak");
  assert.match(b.app(), /Studied <span class="mo">1<\/span>/);
  b.click("tog", topics[0].id, "s"); // toggle off = undo
  assert.equal(b.study().ev.length, 0); assert.equal(b.study().topics[0].due, null);
  b.click("up", topics[1].id); assert.equal(b.study().topics[0].id, topics[1].id);
  b.click("rmtopic", topics[2].id); assert.equal(b.study().topics.find((t) => t.id === topics[2].id).arch, true);
  b.click("archsub", sid); assert.match(b.view("learn"), /Archived/); assert.equal(b.study().topics.length, 3, "history kept");
});

test("revision: due topic can be reviewed and is rescheduled", () => {
  const b = boot(); finishOnboarding(b);
  b.run(`SS.importData({subjects:[{id:"s1",name:"Maths"}],topics:[{id:"t1",sid:"s1",name:"Limits",due:"2000-01-01",stage:0}],ev:[{id:"e1",tid:"t1",sid:"s1",k:"s",d:"1999-12-31"}]})`);
  b.run(`SS.U.sub="s1"`); assert.match(b.view("learn"), /Review due/);
  assert.match(b.view("day"), /Revision was due on 2000-01-01/);
  b.click("rev", "t1", "good");
  const t = b.study().topics[0]; assert.equal(t.stage, 1); assert.ok(t.due > "2026-01-01");
});

test("Notes: save, search, ask with citations, insufficient evidence, quiz records practice only after an attempt", () => {
  const b = boot(); finishOnboarding(b);
  b.run(`SS.importData({subjects:[{id:"s1",name:"OS"}],topics:[{id:"t1",sid:"s1",name:"Paging"}]})`);
  b.go("notes");
  b.FORM["ss-nt"] = "Paging notes"; b.FORM["ss-ns"] = "s1"; b.FORM["ss-nto"] = "t1";
  b.FORM["ss-nx"] = "Paging divides memory into fixed-size frames. A page table maps virtual pages to physical frames.\n\nThe TLB caches recent page table entries to speed up translation.";
  b.click("nsave"); assert.equal(b.study().notes.length, 1);
  b.FORM["ss-nq"] = "tlb"; b.run(`SS.U.nq="tlb"`); assert.match(b.view("notes"), /Paging notes/);
  b.click("ntab", "ask"); b.FORM["ss-qq"] = "what does the TLB cache"; b.FORM["ss-qs"] = ""; b.click("qask");
  assert.match(b.app(), /\[1\] Paging notes · passage \d · \d+% match/);
  assert.match(b.app(), /Open note at this passage/);
  b.FORM["ss-qq"] = "history of the roman empire"; b.click("qask");
  assert.match(b.app(), /Not enough evidence in your notes/);
  b.click("quiz"); assert.match(b.app(), /_____/);
  assert.equal(b.study().ev.length, 0, "showing a question is not practice");
  b.FORM["ss-qa"] = "wrong"; b.click("qchk"); assert.match(b.app(), /Not quite/);
  b.click("qrate", undefined, "partly");
  assert.equal(b.study().quiz.length, 1);
  assert.deepEqual(b.study().ev.map((e) => e.k), ["p"], "practised recorded after the attempt, on the linked topic");
  b.click("nopen", b.study().notes[0].id, "0"); assert.match(b.app(), /class="pas hl"/);
});

test("Planner and My Tasks share ONE task record", () => {
  const b = boot(); finishOnboarding(b);
  b.run(`SS.importData({subjects:[{id:"s1",name:"DBMS"}]})`);
  b.FORM["ss-pt"] = "DBMS assignment 2"; b.FORM["ss-pc"] = "assignment"; b.FORM["ss-ps"] = "s1"; b.FORM["ss-pp"] = "high"; b.FORM["ss-pd"] = "2000-01-01"; b.FORM["ss-pm"] = "";
  b.click("padd");
  assert.equal(b.run("T.length"), 1); assert.equal(b.run("T[0].cat"), "assignment"); assert.equal(b.run("T[0].sid"), "s1");
  assert.match(b.view("plan"), /Overdue/); assert.match(b.app(), /DBMS assignment 2/);
  const tasks = b.view("tasks"); b.run(`f="all"`); assert.match(b.view("tasks"), /Assignment/); assert.match(b.app(), /DBMS<\/span>/);
});

test("Daily goals: checklist, derived focus goal, skip stays distinct, nothing rolls over", () => {
  const b = boot(); finishOnboarding(b);
  b.click("gsug", "focus"); b.click("gsug", "study");
  assert.match(b.view("day"), /0 of 2 complete/);
  b.click("gtog", b.study().goals[1].id); assert.match(b.app(), /1 of 2 complete/);
  b.click("gskip", b.study().goals[0].id); assert.match(b.app(), /1 of 1 complete, 1 skipped/);
  b.FORM["ss-gl"] = ""; b.FORM["ss-gt"] = "recall"; b.FORM["ss-gn"] = "2"; b.click("addgoal"); assert.match(b.app(), /Recall 2 topics/);
  b.run(`SS.importData({goals:[{id:"old",d:"2000-01-01",t:"check",label:"Yesterday",done:false}]})`);
  assert.ok(!b.view("day").includes("Yesterday"), "missed goals are not rolled forward");
  assert.equal(b.study().goals.length, 1, "but stay in history");
});

test("Focus: timer is timestamp-based, survives reload, pause/resume, completes and logs", () => {
  const b = boot(); finishOnboarding(b);
  const real = b.run("Date.now()"); let off = 0; b.run(`const __n=Date.now.bind(Date);Date.now=()=>__n()+${0}+(globalThis.__off||0)`);
  b.ctx.__off = 0; b.go("focus");
  b.FORM["ss-fm"] = "25"; b.FORM["ss-fs"] = ""; b.FORM["ss-ft"] = ""; b.click("fstart");
  assert.ok(b.study().timer); assert.match(b.app(), /role="timer"/);
  b.ctx.__off = 10 * 60e3; b.run("render()"); assert.match(b.app(), /15:0\d/);
  b.click("fpause"); const paused = b.study().timer.paused; b.ctx.__off = 60 * 60e3; b.run("render()"); assert.equal(b.study().timer.paused, paused, "paused time does not run down");
  b.click("fresume"); b.ctx.__off += 5 * 60e3; b.click("ffin");
  assert.equal(b.study().focus.length, 1); assert.equal(b.study().focus[0].status, "stopped"); assert.ok(Math.abs(b.study().focus[0].sec - 900) <= 2, "10 min before the pause + 5 min after = 15 min recorded");
  // reload mid-session: a new page boot reads the persisted end time
  const saved = Object.fromEntries(b.store); const b2 = boot(saved); b2.ctx.__off = 0;
  b2.run(`SS.importData(Object.assign(SS.exportData(),{timer:{plan:25,start:Date.now()-1200e3,end:Date.now()+300e3,paused:null}}))`);
  assert.match(b2.view("focus"), /0[45]:\d\d/);
  b2.run(`SS.importData(Object.assign(SS.exportData(),{timer:{plan:25,start:Date.now()-1600e3,end:Date.now()-100e3,paused:null}}))`);
  b2.tick(); assert.equal(b2.study().timer, null); assert.equal(b2.study().focus.at(-1).status, "done");
  assert.match(b2.view("focus"), /Completed/);
});

test("banner shows on other pages while a session runs", () => {
  const b = boot(); finishOnboarding(b); b.go("focus"); b.FORM["ss-fm"] = "25"; b.click("fstart");
  assert.match(b.view("day"), /Focus session running/);
});

test("Export includes study data; reset clears it; import restores it; old backups without study still import", () => {
  const b = boot(); finishOnboarding(b);
  b.run(`SS.importData({subjects:[{id:"s1",name:"Maths"}]})`);
  b.run(`window.__exp=JSON.stringify({prefs:P,tasks:T,habits:H,notes:N,exercises:X,workouts:W,study:SS.exportData()})`);
  assert.ok(b.run("JSON.parse(__exp).study.subjects.length") === 1);
  b.click("rst", undefined, undefined, "a"); assert.equal(b.study().subjects.length, 0);
  b.run(`SS.importData(JSON.parse(__exp).study)`); assert.equal(b.study().subjects.length, 1);
  assert.equal(b.run(`SS.importData("junk"), SS.exportData().subjects.length`), 0, "garbage input cannot corrupt state");
});

test("XSS: hostile names are escaped everywhere they are shown", () => {
  const b = boot(); finishOnboarding(b); const bad = `<img src=x onerror=alert(1)>`;
  b.run(`SS.importData({subjects:[{id:"s1",name:${JSON.stringify(bad)}}],topics:[{id:"t1",sid:"s1",name:${JSON.stringify(bad)}}],notes:[{id:"n1",sid:"s1",tid:"t1",title:${JSON.stringify(bad)},text:${JSON.stringify(bad + ". Another sentence with enough words in it to be quizzed.")},updated:"2026-11-10"}]})`);
  b.run(`T.push({id:"x",t:${JSON.stringify(bad)},pr:"low",due:"2000-01-01",time:"",done:false,doneAt:"",cat:"exam",sid:"s1"})`);
  for (const v of ["day", "learn", "notes", "plan", "focus", "tasks"]) { b.run(`SS.U.sub="s1";SS.U.nid="";f="all"`); const h = b.view(v); assert.ok(!h.includes("<img src=x"), v); }
  b.run(`SS.U.nid="n1"`); assert.ok(!b.view("notes").includes("<img src=x"));
});

test("corrupt study storage does not break the app", () => {
  const b = boot({ "lifeos.study": "{not json", "lifeos.prefs": JSON.stringify({ done: true, theme: "system", name: "" }) });
  assert.match(b.app(), /Daily goals/);
});
