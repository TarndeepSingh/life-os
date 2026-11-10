// POST /api/push  { action: "subscribe" | "unsubscribe" | "prefs", ... }  (login required)
const { send, body, authUser, rest } = require("./_lib");
const make = ({ fetch, env }) => async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const user = await authUser(req, { fetch, env });
  if (!user) return send(res, 401, { error: "login_required" });
  let b; try { b = await body(req); } catch (e) { return send(res, 413, { error: "too_large" }); }
  const db = rest({ fetch, env }), ok = (r) => (r.ok ? send(res, 200, { ok: true }) : send(res, 502, { error: "db_error" }));
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  if (b.action === "subscribe") {
    const s = b.subscription || {};
    if (typeof s.endpoint !== "string" || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return send(res, 400, { error: "invalid_subscription" });
    return ok(await db("POST", "push_subscriptions?on_conflict=endpoint", { user_id: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, "resolution=merge-duplicates"));
  }
  if (b.action === "unsubscribe") return ok(await db("DELETE", "push_subscriptions?user_id=eq." + user.id + "&endpoint=eq." + encodeURIComponent(String(b.endpoint || ""))));
  if (b.action === "prefs") {
    const p = b.prefs || {}, tz = typeof p.tz === "string" && p.tz.length < 60 ? p.tz : "UTC";
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch (e) { return send(res, 400, { error: "invalid_timezone" }); }
    return ok(await db("POST", "notification_preferences?on_conflict=user_id", { user_id: user.id, enabled: !!p.enabled, hour: int(p.hour, 0, 23, 8), quiet_start: int(p.quiet_start, 0, 23, 22), quiet_end: int(p.quiet_end, 0, 23, 7), personal: !!p.personal, tz, updated_at: new Date().toISOString() }, "resolution=merge-duplicates"));
  }
  return send(res, 400, { error: "unknown_action" });
};
module.exports = make({ fetch: (...a) => fetch(...a), env: process.env }); module.exports.make = make;
