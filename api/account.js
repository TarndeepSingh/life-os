// POST /api/account { action: "delete" }  Permanently deletes the signed-in user's cloud data: files, rows, and the login.
const { send, body, authUser } = require("./_lib");
const make = ({ fetch, env }) => async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!env.SUPABASE_SERVICE_KEY) return send(res, 503, { error: "not_configured" });
  const user = await authUser(req, { fetch, env });
  if (!user) return send(res, 401, { error: "login_required" });
  const b = await body(req); if (b.action !== "delete" || b.confirm !== user.email) return send(res, 400, { error: "confirmation_required" });
  const h = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" };
  const list = async (prefix) => { const r = await fetch(env.SUPABASE_URL + "/storage/v1/object/list/notes", { method: "POST", headers: h, body: JSON.stringify({ prefix, limit: 1000 }) }); return r.ok ? r.json() : []; };
  const files = [];
  for (const a of await list(user.id)) { if (a.id) files.push(user.id + "/" + a.name); else for (const f of await list(user.id + "/" + a.name)) { if (f.id) files.push(user.id + "/" + a.name + "/" + f.name); else for (const g of await list(user.id + "/" + a.name + "/" + f.name)) if (g.id) files.push(user.id + "/" + a.name + "/" + f.name + "/" + g.name); } }
  if (files.length) { const r = await fetch(env.SUPABASE_URL + "/storage/v1/object/notes", { method: "DELETE", headers: h, body: JSON.stringify({ prefixes: files }) }); if (!r.ok) return send(res, 502, { error: "file_delete_failed" }); }
  const d = await fetch(env.SUPABASE_URL + "/auth/v1/admin/users/" + user.id, { method: "DELETE", headers: h }); // cascades records, subscriptions, preferences
  if (!d.ok) return send(res, 502, { error: "user_delete_failed" });
  send(res, 200, { ok: true, filesDeleted: files.length });
};
module.exports = make({ fetch: (...a) => fetch(...a), env: process.env }); module.exports.make = make;
