const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../study-core.js");

test("parseList: lead-in, and, &, newline, dupes", () => {
  assert.deepEqual(C.parseList("My subjects are Maths, Physics and Data Structures"), ["Maths", "Physics", "Data Structures"]);
  assert.deepEqual(C.parseList("OS\nDBMS & CN\nos"), ["OS", "DBMS", "CN"]);
  assert.deepEqual(C.parseList("  "), []);
});
test("parseSyllabus strips bullets/numbering, skips blanks and exact dupes", () => {
  const r = C.parseSyllabus("1. Arrays\n- Linked lists\n\n(a) Stacks\n1.2 Queues\nARRAYS\n  • Trees ", []);
  assert.deepEqual(r.topics, ["Arrays", "Linked lists", "Stacks", "Queues", "Trees"]);
  assert.deepEqual(r.dupes, ["ARRAYS"]);
});
test("parseSyllabus skips topics that already exist and warns on near-duplicates", () => {
  const r = C.parseSyllabus("Binary trees\nBinary tree traversal basics\nBinary Trees", ["Binary Trees"]);
  assert.deepEqual(r.dupes.sort(), ["Binary Trees", "Binary trees"]);
  assert.equal(r.topics.length, 1);
  assert.ok(C.parseSyllabus("Sorting algorithms\nSorting algorithm", []).similar.length === 1);
});
test("3D graphics is not treated as numbering", () => assert.deepEqual(C.parseSyllabus("3D graphics").topics, ["3D graphics"]));

test("revision ladder", () => {
  assert.deepEqual(C.firstReview("2026-11-10"), { stage: 0, due: "2026-11-11" });
  assert.deepEqual(C.afterReview(0, "good", "2026-11-10"), { stage: 1, due: "2026-11-13" });
  assert.deepEqual(C.afterReview(2, "hard", "2026-11-10"), { stage: 2, due: "2026-11-17" });
  assert.deepEqual(C.afterReview(3, "again", "2026-11-10"), { stage: 0, due: "2026-11-11" });
  assert.deepEqual(C.afterReview(4, "good", "2026-11-10"), { stage: 4, due: "2026-12-10" });
});

const subjects = [{ id: "A", name: "Maths" }, { id: "B", name: "OS" }];
const topics = [{ id: "t1", sid: "A", name: "Limits" }, { id: "t2", sid: "A", name: "Derivatives" }, { id: "t3", sid: "B", name: "Paging" }];
test("topicStat and estimate count signals, not mastery", () => {
  const ev = [{ tid: "t1", k: "s", d: "2026-11-01" }, { tid: "t1", k: "r", d: "2026-11-02" }, { tid: "t1", k: "s", d: "2026-11-03" }, { tid: "t2", k: "v", d: "2026-11-03" }];
  const s = C.topicStat("t1", ev);
  assert.equal(s.s, 2); assert.equal(s.kinds, 2); assert.equal(s.lastS, "2026-11-03");
  assert.deepEqual(C.estimate(topics, ev), { topics: 3, got: 2, max: 9, pct: 22 });
  assert.equal(C.estimate([], []).pct, 0);
});
test("nextStep priority and reasons", () => {
  const today = "2026-11-10";
  assert.equal(C.nextStep(subjects, topics, [], today).topic.id, "t1"); // never studied, subject order
  const ev = [{ tid: "t1", k: "s", d: "2026-11-05" }, { tid: "t2", k: "s", d: "2026-11-05" }, { tid: "t3", k: "s", d: "2026-11-05" }];
  const withDue = topics.map((t) => (t.id === "t3" ? { ...t, due: "2026-11-09" } : t));
  const n = C.nextStep(subjects, withDue, ev, today);
  assert.equal(n.topic.id, "t3"); assert.equal(n.kind, "overdue"); // overdue beats subject order
  assert.equal(C.nextStep(subjects, topics, ev, today).kind, "recall");
  const all = ev.concat([{ tid: "t1", k: "r", d: "2026-11-06" }, { tid: "t2", k: "r", d: "2026-11-06" }, { tid: "t3", k: "r", d: "2026-11-06" }]);
  assert.equal(C.nextStep(subjects, topics, all, today).kind, "practise");
  assert.equal(C.nextStep(subjects, topics, all.concat(topics.map((t) => ({ tid: t.id, k: "p", d: "2026-11-07" }))), today), null);
});
test("nextStep respects dismissed topics and archived subjects", () => {
  assert.equal(C.nextStep(subjects, topics, [], "2026-11-10", ["t1"]).topic.id, "t2");
  assert.equal(C.nextStep([{ id: "A", arch: true }, subjects[1]], topics, [], "2026-11-10").topic.id, "t3");
});

test("chunk bounds passages and keeps paragraphs", () => {
  const long = ("Sentence number one is here. ").repeat(60);
  const c = C.chunk(long, 300);
  assert.ok(c.length > 3 && c.every((x) => x.length <= 300));
  assert.equal(C.chunk("One.\n\nTwo.", 600).length, 1); // tiny paragraphs merge
  assert.deepEqual(C.chunk("   "), []);
});
const notes = [
  { id: "n1", sid: "B", title: "Paging", text: "Paging divides memory into fixed-size frames. A page table maps virtual pages to physical frames.\n\nThe TLB caches recent page table entries to speed up translation." },
  { id: "n2", sid: "A", title: "Limits", text: "A limit describes the value a function approaches as the input approaches a point. Limits underpin derivatives and continuity." },
];
test("retrieve finds the right passage and cites the note", () => {
  const r = C.retrieve("what does the TLB cache?", notes);
  assert.equal(r.enough, true); assert.equal(r.hits[0].noteId, "n1"); assert.ok(r.hits[0].pct >= 30);
});
test("retrieve says not enough evidence for unrelated or empty questions", () => {
  assert.equal(C.retrieve("history of the roman empire", notes).enough, false);
  assert.equal(C.retrieve("the of and", notes).reason, "empty");
  assert.equal(C.retrieve("paging", []).reason, "nonotes");
});
test("retrieve respects subject scope and archived notes", () => {
  assert.equal(C.retrieve("paging frames", notes, { sid: "A" }).enough, false);
  assert.equal(C.retrieve("paging frames", notes.map((n) => ({ ...n, arch: true }))).reason, "nonotes");
});
test("makeBlank hides one meaningful word and sameAnswer is forgiving", () => {
  const b = C.makeBlank("Paging divides memory into fixed-size frames for translation.", () => 0);
  assert.ok(b.prompt.includes("_____") && !b.prompt.includes(b.answer));
  assert.equal(C.makeBlank("Too short.", () => 0), null);
  assert.ok(C.sameAnswer("Frames", " frame ") && !C.sameAnswer("pages", "frames") && !C.sameAnswer("", ""));
});

test("focus timer survives refresh: derived from timestamps", () => {
  const t0 = 1_000_000, t = C.startTimer(25, { sid: "A" }, t0);
  assert.equal(C.remaining(t, t0), 1500);
  assert.equal(C.remaining(t, t0 + 600_000), 900);
  assert.equal(C.remaining(t, t0 + 9_999_999), 0);
  const p = C.pauseTimer(t, t0 + 600_000);
  assert.equal(C.remaining(p, t0 + 5_000_000), 900); // paused: stays put
  const r = C.resumeTimer(p, t0 + 5_000_000);
  assert.equal(C.remaining(r, t0 + 5_060_000), 840);
  assert.equal(C.actualSeconds(t, t0 + 600_000), 600);
  assert.equal(C.actualSeconds(t, t0 + 99_999_999), 1500);
});
test("goals: derived progress, skipped is distinct, summary counts", () => {
  const date = "2026-11-10", focus = [{ d: date, sec: 1200 }, { d: date, sec: 1500 }, { d: "2026-11-09", sec: 3000 }];
  const events = [{ d: date, k: "r", tid: "t1" }, { d: date, k: "r", tid: "t1" }, { d: date, k: "s", tid: "t2" }];
  const ctx = { date, focus, events };
  assert.equal(C.goalProgress({ t: "focus", target: 45 }, ctx).text, "45 of 45 focus minutes");
  assert.equal(C.goalProgress({ t: "recall", target: 2 }, ctx).cur, 1); // same topic twice counts once
  assert.equal(C.goalProgress({ t: "check", done: true }, ctx).done, true);
  assert.equal(C.goalProgress({ t: "check", skipped: true }, ctx).skipped, true);
  const goals = [{ d: date, t: "focus", target: 45 }, { d: date, t: "check" }, { d: date, t: "check", skipped: true }, { d: "2026-11-09", t: "check", done: true }];
  assert.deepEqual(C.daySummary(goals, ctx), { total: 2, done: 1, skipped: 1 });
});
test("activityCount feeds streak: events and focus >= 1 minute", () => {
  assert.equal(C.activityCount("d", [{ d: "d" }, { d: "x" }], [{ d: "d", sec: 59 }, { d: "d", sec: 60 }]), 2);
});

test("chunkPages carries page numbers and notes without pages use 0", () => {
  const r = C.chunkPages("First page text here.\fSecond page text here.\fThird.");
  assert.deepEqual(r.map((x) => x.page), [1, 2, 3]);
  assert.deepEqual(C.chunkPages("Just one block.").map((x) => x.page), [0]);
});
test("retrieve reports the page of the matching passage", () => {
  const n = [{ id: "n", sid: "", title: "Book", text: "Intro material about cats.\fThe mitochondria is the powerhouse of the cell and makes ATP." }];
  const h = C.retrieve("what makes ATP", n).hits[0];
  assert.equal(h.page, 2);
});
test("itemsToText rebuilds lines and paragraphs from pdf.js items", () => {
  const it = (str, y, h = 12, eol) => ({ str, transform: [h, 0, 0, h, 50, y], hasEOL: eol });
  const t = C.itemsToText([it("Paging divides", 700), it("memory into frames.", 700), it("A page table maps", 686), it("pages to frames.", 686), it("Next topic starts here", 640), it("frag-", 600, 12, true), it("ment joined", 588)]);
  assert.equal(t, "Paging divides memory into frames.\nA page table maps pages to frames.\n\nNext topic starts here\n\nfragment joined".replace("\n\nfragment", "\n\nfragment"));
});
test("looksScanned flags image-only PDFs", () => {
  assert.equal(C.looksScanned(["", "  ", "x"]), true);
  assert.equal(C.looksScanned(["This page has plenty of real extracted text in it."]), false);
  assert.equal(C.looksScanned([]), true);
});
