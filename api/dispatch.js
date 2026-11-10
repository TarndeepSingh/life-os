// POST /api/dispatch  (header x-cron-secret). Run hourly by .github/workflows/reminders.yml.
// For each user whose chosen local hour is now, sends ONE digest, at most once per local day. Never from preview deployments.
const { send, rest, safeEqual, localParts, inQuiet, buildDigest } = require("./_lib");
const make = ({ fetch, env, webpush, now = () => new Date() }) => async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!env.CRON_SECRET || !safeEqual(req.headers["x-cron-secret"] || "", env.CRON_SECRET)) return send(res, 401, { error: "unauthorised" });
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return send(res, 200, { skipped: "not production" });
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.SUPABASE_SERVICE_KEY) return send(res, 503, { error: "push_not_configured" });
  webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@example.com", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const db = rest({ fetch, env }), t = now(), stats = { users: 0, sent: 0, removed: 0, skipped: 0 };
  const prefs = await (await db("GET", "notification_preferences?enabled=eq.true&select=*")).json();
  for (const p of Array.isArray(prefs) ? prefs : []) {
    stats.users++;
    const lp = localParts(t, p.tz || "UTC");
    if (lp.hour !== p.hour || inQuiet(lp.hour, p.quiet_start, p.quiet_end)) { stats.skipped++; continue; }
    const subs = await (await db("GET", "push_subscriptions?user_id=eq." + p.user_id + "&select=endpoint,p256dh,auth")).json();
    if (!Array.isArray(subs) || !subs.length) { stats.skipped++; continue; }
    const recs = await (await db("GET", "records?user_id=eq." + p.user_id + "&deleted=eq.false&kind=in.(tasks,topics)&select=kind,data")).json();
    const dg = buildDigest((recs || []).filter((r) => r.kind === "tasks").map((r) => r.data), (recs || []).filter((r) => r.kind === "topics").map((r) => r.data), lp.date, p);
    if (!dg) { stats.skipped++; continue; }
    const claim = await (await db("POST", "notification_deliveries?on_conflict=user_id,local_date,kind", { user_id: p.user_id, local_date: lp.date, kind: "digest" }, "resolution=ignore-duplicates,return=representation")).json();
    if (!Array.isArray(claim) || !claim.length) { stats.skipped++; continue; } // already sent today
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: dg.title, body: dg.body, url: "/" })); stats.sent++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await db("DELETE", "push_subscriptions?endpoint=eq." + encodeURIComponent(s.endpoint)); stats.removed++; } else console.error("push failed", e && e.statusCode); }
    }
  }
  send(res, 200, stats);
};
const real = () => make({ fetch: (...a) => fetch(...a), env: process.env, webpush: require("web-push") });
module.exports = (req, res) => real()(req, res); module.exports.make = make;
