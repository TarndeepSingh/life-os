/* Cross-device sync engine. No DOM, no Supabase imports: the app wires in `collections` (local data)
   and `remote` (cloud). Records are synced one by one (kind + id), never as one big document.
   Rules: pull first, then push. Newer edit wins a conflict; the losing version is kept in `conflicts`.
   Nothing is deleted without a tombstone, and a failed sync never clears pending local changes. */
(function (root) {
  "use strict";
  const stable = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}") : JSON.stringify(v));
  const hash = (v) => { const s = stable(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ":" + s.length; };
  const K = (kind, id) => kind + "\u0001" + id;
  const split = (k) => k.split("\u0001");
  const PAGE = 500, BATCH = 200;

  function createSync(o) {
    const { collections, remote, loadState, saveState } = o, now = o.now || (() => new Date().toISOString());
    const state = () => { const s = loadState() || {}; return Object.assign({ user: "", base: {}, cursor: "", pend: {}, last: "", conflicts: [] }, s); };

    function snapshot() {
      const m = new Map();
      for (const kind of Object.keys(collections)) for (const rec of collections[kind].get()) {
        if (rec && rec.id != null) m.set(K(kind, String(rec.id)), { kind, id: String(rec.id), data: rec, h: hash(rec) });
      }
      return m;
    }
    const changedKeys = (st, local) => {
      const ch = [];
      local.forEach((r, k) => { const b = st.base[k]; if (!b || b.h !== r.h) ch.push(k); });
      Object.keys(st.base).forEach((k) => { if (!st.base[k].del && !local.has(k)) ch.push(k); });
      return ch;
    };
    /** Call after local edits: remembers WHEN each changed record was first noticed (used to settle conflicts). */
    function mark() {
      const st = state(), local = snapshot(), t = now();
      changedKeys(st, local).forEach((k) => { if (!st.pend[k]) st.pend[k] = t; });
      saveState(st);
      return Object.keys(st.pend).length;
    }
    const pending = () => changedKeys(state(), snapshot()).length;
    const counts = () => { const c = {}; snapshot().forEach((r) => { c[r.kind] = (c[r.kind] || 0) + 1; }); return c; };

    async function sync() {
      const st = state(), t0 = now();
      let local = snapshot();
      changedKeys(st, local).forEach((k) => { if (!st.pend[k]) st.pend[k] = t0; });

      /* ---- pull ---- */
      const rows = [];
      for (let off = 0; ; off += PAGE) { const page = await remote.pull(st.cursor || "", off, PAGE); rows.push(...page); if (page.length < PAGE) break; }
      const incoming = {}; let pulled = 0, conflicts = 0, maxT = st.cursor || "";
      const stash = (which, kind, id, data) => { st.conflicts.push({ at: t0, which, kind, id, data }); if (st.conflicts.length > 100) st.conflicts.shift(); conflicts++; };
      for (const r of rows) {
        const key = K(r.kind, r.id), loc = local.get(key), b = st.base[key];
        if (r.updated_at > maxT) maxT = r.updated_at;
        if (b && b.s === r.updated_at) continue; // already have this exact server version
        const rh = r.deleted ? "deleted" : hash(r.data);
        const changed = loc ? !b || b.h !== loc.h : !!(b && !b.del);
        const takeRemote = () => { (incoming[r.kind] = incoming[r.kind] || new Map()).set(r.id, r.deleted ? null : r.data); st.base[key] = { h: rh, s: r.updated_at, del: !!r.deleted }; delete st.pend[key]; pulled++; };
        if (!changed) { takeRemote(); continue; }
        if ((loc && !r.deleted && loc.h === rh) || (!loc && r.deleted)) { st.base[key] = { h: rh, s: r.updated_at, del: !!r.deleted }; delete st.pend[key]; continue; } // same result both sides
        if (r.updated_at > (st.pend[key] || t0)) { if (loc) stash("local", r.kind, r.id, loc.data); takeRemote(); }      // remote is newer
        else { if (!r.deleted) stash("remote", r.kind, r.id, r.data); st.base[key] = { h: b ? b.h : "", s: r.updated_at, del: false }; } // local is newer: keep it, push below
      }
      for (const kind of Object.keys(incoming)) {
        const col = collections[kind]; if (!col) continue;
        const arr = col.get().slice(), idx = new Map(arr.map((x, i) => [String(x.id), i])), add = [];
        incoming[kind].forEach((data, id) => {
          if (data === null) { if (idx.has(id)) arr[idx.get(id)] = null; }
          else if (idx.has(id)) arr[idx.get(id)] = data; else add.push(data);
        });
        col.set(arr.filter((x) => x !== null).concat(add));
      }
      st.cursor = maxT;

      /* ---- push ---- */
      local = snapshot();
      const out = [];
      local.forEach((r, k) => { const b = st.base[k]; if (!b || b.h !== r.h) out.push({ kind: r.kind, id: r.id, data: r.data, deleted: false, h: r.h }); });
      Object.keys(st.base).forEach((k) => { if (!st.base[k].del && !local.has(k)) { const [kind, id] = split(k); out.push({ kind, id, data: null, deleted: true, h: "deleted" }); } });
      let pushed = 0;
      try {
        for (let i = 0; i < out.length; i += BATCH) {
          const batch = out.slice(i, i + BATCH), res = await remote.push(batch.map(({ kind, id, data, deleted }) => ({ kind, id, data, deleted })));
          const ts = new Map(res.map((x) => [K(x.kind, x.id), x.updated_at]));
          batch.forEach((x) => { const k = K(x.kind, x.id); st.base[k] = { h: x.h, s: ts.get(k) || "", del: x.deleted }; delete st.pend[k]; pushed++; });
        }
      } finally { st.last = now(); saveState(st); } // progress is saved even if a later batch fails
      return { pulled, pushed, conflicts };
    }
    return { sync, mark, pending, counts, state, snapshot };
  }
  const api = { createSync, hash, stable };
  root.SyncCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
