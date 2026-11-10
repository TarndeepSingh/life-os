// Shared helpers for the serverless functions. Files starting with "_" are not exposed as endpoints.
const crypto = require("crypto");

const send = (res, code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); };
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const c of req) { raw += c; if (raw.length > 300000) throw new Error("too large"); }
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}
/** Verify a Supabase access token by asking Supabase itself. Returns {id,email} or null. */
async function authUser(req, { fetch, env }) {
  const t = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!t || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + t } });
    if (!r.ok) return null; const u = await r.json(); return u && u.id ? { id: u.id, email: u.email || "" } : null;
  } catch (e) { return null; }
}
/** Service-role REST helper. The service key stays on the server and is never sent to the browser. */
const rest = ({ fetch, env }) => (method, path, payload, prefer) => fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
  method, headers: Object.assign({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" }, prefer ? { Prefer: prefer } : {}),
  body: payload === undefined ? undefined : JSON.stringify(payload),
});
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Local date (YYYY-MM-DD) and hour (0-23) in an IANA timezone. */
function localParts(now, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
  } catch (e) { return localParts(now, "UTC"); }
}
const addDay = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const inQuiet = (h, from, to) => (from === to ? false : from < to ? h >= from && h < to : h >= from || h < to);

/** One calm morning digest. Only counts what the student asked to hear about. */
function buildDigest(tasks, topics, today, prefs) {
  const own = (t) => t && !t.done && t.due && (prefs.personal || (t.cat && t.cat !== "personal"));
  const open = tasks.filter(own);
  const overdue = open.filter((t) => t.due < today).length, dueToday = open.filter((t) => t.due === today).length, tomorrow = open.filter((t) => t.due === addDay(today, 1)).length;
  const revise = topics.filter((t) => t && !t.arch && t.due && t.due <= today).length;
  const parts = [];
  if (overdue) parts.push(overdue + " overdue");
  if (dueToday) parts.push(dueToday + " due today");
  if (tomorrow) parts.push(tomorrow + " due tomorrow");
  if (revise) parts.push(revise + (revise === 1 ? " topic" : " topics") + " to review");
  if (!parts.length) return null;
  return { title: "LifeOS", body: parts.join(" · "), counts: { overdue, dueToday, tomorrow, revise } };
}
module.exports = { send, body, authUser, rest, safeEqual, localParts, addDay, inQuiet, buildDigest };
