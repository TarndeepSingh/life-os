const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSync } = require("../sync-core.js");

// In-memory "cloud": server-assigned, strictly increasing updated_at, like the Postgres trigger.
function cloud() {
  const rows = new Map(); let clock = Date.parse("2026-11-10T10:00:00Z"); const log = { pulls: 0, pushes: 0, failNext: false };
  const tick = () => new Date((clock += 1000)).toISOString();
  return { rows, log, tick,
    remote: {
      async pull(cursor, off, size) { log.pulls++; return [...rows.values()].filter((r) => r.updated_at >= cursor).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)).slice(off, off + size).map((r) => JSON.parse(JSON.stringify(r))); },
      async push(batch) { log.pushes++; if (log.failNext) { log.failNext = false; throw new Error("network"); } return batch.map((r) => { const u = tick(); rows.set(r.kind + r.id, { kind: r.kind, id: r.id, data: JSON.parse(JSON.stringify(r.data)), deleted: r.deleted, updated_at: u }); return { kind: r.kind, id: r.id, updated_at: u }; }); },
    } };
}
function device(c, init, clockOf) {
  const data = { tasks: init?.tasks || [], notes: init?.notes || [] }; let st = null; let t = Date.parse("2026-11-10T09:00:00Z");
  const e = createSync({ collections: { tasks: { get: () => data.tasks, set: (v) => (data.tasks = v) }, notes: { get: () => data.notes, set: (v) => (data.notes = v) } },
    remote: c.remote, loadState: () => st, saveState: (s) => (st = JSON.parse(JSON.stringify(s))), now: () => new Date(clockOf ? clockOf() : (t += 1000)).toISOString() });
  return { data, e, st: () => st };
}

test("first sync pushes local records and creates nothing twice", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "Read" }, { id: "t2", t: "Write" }] });
  const r = await A.e.sync(); assert.equal(r.pushed, 2); assert.equal(c.rows.size, 2);
  assert.equal((await A.e.sync()).pushed, 0, "second sync has nothing to push");
});
test("second device receives everything", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "Read" }], notes: [{ id: "n1", title: "Paging" }] }), B = device(c);
  await A.e.sync(); const r = await B.e.sync();
  assert.equal(r.pulled, 2); assert.deepEqual(B.data.tasks, [{ id: "t1", t: "Read" }]); assert.equal(B.data.notes[0].title, "Paging");
});
test("edits and deletes propagate both ways", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "Read", done: false }, { id: "t2", t: "Old" }] }), B = device(c);
  await A.e.sync(); await B.e.sync();
  B.data.tasks.find((x) => x.id === "t1").done = true; B.data.tasks = B.data.tasks.filter((x) => x.id !== "t2");
  await B.e.sync(); await A.e.sync();
  assert.deepEqual(A.data.tasks, [{ id: "t1", t: "Read", done: true }]);
  assert.equal(c.rows.get("taskst2").deleted, true, "deletion is a tombstone, not a hard delete");
});
test("edits to DIFFERENT records on two devices both survive (no blob overwrite)", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "A" }, { id: "t2", t: "B" }] }), B = device(c);
  await A.e.sync(); await B.e.sync();
  A.data.tasks[0].t = "A edited on A"; B.data.tasks[1].t = "B edited on B";
  await A.e.sync(); await B.e.sync(); await A.e.sync();
  for (const d of [A, B]) assert.deepEqual(d.data.tasks.map((x) => x.t), ["A edited on A", "B edited on B"]);
});
test("same record edited on both: newer edit wins, older is kept in conflicts", async () => {
  const c = cloud(); let ca = Date.parse("2026-11-10T09:00:00Z"), cb = Date.parse("2026-11-10T09:00:00Z");
  const A = device(c, { tasks: [{ id: "t1", t: "start" }] }, () => (ca += 1000)), B = device(c, null, () => (cb += 1000));
  await A.e.sync(); await B.e.sync();
  A.data.tasks[0].t = "from A"; A.e.mark();
  B.data.tasks[0].t = "from B"; B.e.mark();
  await A.e.sync(); // A pushes first
  const r = await B.e.sync(); // B noticed its edit earlier than A's server time -> decide by timestamps
  assert.equal(r.conflicts, 1);
  const winner = B.data.tasks[0].t; await A.e.sync();
  assert.equal(A.data.tasks[0].t, winner, "both devices converge");
  const kept = [...A.st().conflicts, ...B.st().conflicts]; assert.ok(kept.length >= 1 && kept.every((x) => x.data), "the losing version is saved, not discarded");
});
test("edit vs delete conflict never silently loses the edit", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "x" }] }), B = device(c);
  await A.e.sync(); await B.e.sync();
  B.data.tasks = []; B.e.mark(); A.data.tasks[0].t = "edited"; A.e.mark();
  await B.e.sync(); await A.e.sync(); await B.e.sync();
  assert.deepEqual(A.data.tasks.map((x) => x.t), B.data.tasks.map((x) => x.t));
  const all = JSON.stringify([A.st().conflicts, B.st().conflicts, A.data, B.data, [...c.rows.values()]]); assert.ok(all.includes("edited"));
});
test("a failed push keeps changes pending and retries cleanly", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", t: "x" }] });
  c.log.failNext = true; await assert.rejects(() => A.e.sync()); assert.equal(A.e.pending(), 1);
  const r = await A.e.sync(); assert.equal(r.pushed, 1); assert.equal(A.e.pending(), 0); assert.equal(c.rows.size, 1);
});
test("first link of two devices that each have different guest data merges both (union)", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "a1", t: "phone task" }] }), B = device(c, { tasks: [{ id: "b1", t: "laptop task" }] });
  await A.e.sync(); await B.e.sync(); await A.e.sync();
  for (const d of [A, B]) assert.deepEqual(d.data.tasks.map((x) => x.id).sort(), ["a1", "b1"]);
});
test("paging through more than one page of remote rows", async () => {
  const c = cloud(), many = Array.from({ length: 1234 }, (_, i) => ({ id: "t" + i, t: "n" + i })), A = device(c, { tasks: many }), B = device(c);
  await A.e.sync(); const r = await B.e.sync(); assert.equal(r.pulled, 1234); assert.equal(B.data.tasks.length, 1234);
});
test("key order does not cause phantom changes", async () => {
  const c = cloud(), A = device(c, { tasks: [{ id: "t1", b: 2, a: 1 }] }); await A.e.sync();
  A.data.tasks[0] = { a: 1, id: "t1", b: 2 }; assert.equal(A.e.pending(), 0);
});
