# LifeOS capstone: architecture and verification

## Problem
Students juggle tasks, habits, exercise and coursework across separate tools. LifeOS puts daily goals, tasks, study (subjects, topics, notes, revision), focus sessions, habits and exercise into one calm, installable web app that works offline and optionally syncs.

## Architecture
```
Browser (static HTML/JS, offline-first)           Vercel serverless (api/)            Supabase
 index.html  LifeOS shell and original views  -->  config.js   public settings         Auth (Google, email)
 study.js    Learn, Notes, Planner, Focus          tutor.js    AI gateway (login,      Postgres: records, prefs,
 study-core  pure study rules                                  quota, 1 provider)               subscriptions, usage (RLS)
 sync-core   per-record sync engine                push.js     subscribe, prefs        Storage: private "notes" bucket
 cloud.js    auth, sync wiring, files, AI, push    dispatch.js hourly digest sender
 sw.js       offline shell + push receiver         account.js  full account deletion   GitHub Actions: hourly cron
```
Design choices and why:
- **Local-first.** Every save lands in the browser first. The cloud is an optional copy, so the app never blocks on a network.
- **Per-record sync, not one blob.** Each task, habit, topic, note and so on is its own row, so edits on two devices to different records never overwrite each other. Conflicts on the same record keep the newer edit and save the other version for download. Deletions are tombstones.
- **Server clock.** A database trigger sets `updated_at`, so a wrong device clock cannot reorder history.
- **Secrets stay on the server.** Browser code only ever receives the public Supabase URL and anon key. The service key, AI keys and VAPID private key exist only in Vercel.
- **Row-level security** on every table and on the storage bucket: a user can only reach rows or files under their own id.
- **AI is optional and grounded.** Retrieval happens on the device. Only the top few passages are sent. The reply is shown only if it cites a passage; otherwise it is hidden. Login and a daily limit stored in Postgres bound the cost.
- **Honest progress.** Studied, recalled and practised are counted separately; the app never claims "mastery". Focus time is recorded time, not attention.

## Requirements and where they are met
| Requirement | Where |
|---|---|
| Daily goals, tasks, planner with one shared task record | `index.html`, `study.js` (Planner, My Day) |
| Subjects, syllabus paste, topics, three learning signals, 1/3/7/14/30-day revision | `study.js`, `study-core.js` |
| Notes: paste, .txt, .md, text PDF; search; grounded Ask with page citations; quiz | `study.js`, `study-core.js` |
| AI explanation, login-gated, quota, one provider | `api/tutor.js` |
| Focus timer that survives refresh | `study-core.js` (timestamps) |
| Cross-device sync, offline-safe, conflict-safe | `sync-core.js`, `cloud.js`, `001_cloud.sql` |
| Cloud file storage (private) | `cloud.js`, `001_cloud.sql` storage policies |
| Push reminders, opt-in, quiet hours, once a day | `cloud.js`, `sw.js`, `api/push.js`, `api/dispatch.js` |
| Export, import, erase, delete cloud account | `index.html`, `api/account.js` |
| Installable app | `manifest.webmanifest`, `sw.js` |
| Attendance | Removed by the project owner |

## Test report (run `node --test`)
Automated, all in `tests/`:
- `core.test.js`: syllabus parsing, revision ladder, next-step priority, retrieval and "not enough evidence", quiz blanks, PDF text assembly, focus timer maths, goals.
- `sync.test.js`: two devices, edits, deletes, conflicts, failed pushes, paging 1,234 records.
- `api.test.js`: login and input checks, quota, grounded-answer rules, no secrets in config, subscription binding to the verified user, digest content, timezone and quiet hours, once-a-day delivery, preview-deployment guard, account deletion.
- `integration.test.js`, `cloud.test.js`: the real `index.html` and scripts driven through their click handlers in a simulated page, including first-sign-in merge, two devices, AI success and every failure, PDF import, cloud file upload and delete, hostile-text escaping.

## What has NOT been verified
The automated tests use simulated services. These need a real check on the deployed site (checklist in `docs/SETUP.md`, plus):
- Visual appearance on desktop and phone, light and dark mode.
- Real Google sign-in, real Supabase queries (including the row-level-security script), and real storage uploads.
- pdf.js reading real PDFs from the CDN.
- A real AI provider reply, and real push delivery on Android and iPhone.
- The hourly GitHub Action reaching the live endpoint.

## Known limits and next steps
- Notes live in browser storage (about 5 MB) on each device; the cloud copy has no such limit. Move to IndexedDB for very large libraries.
- Sync uses one JSON row per record rather than fully normalised tables. Fine at personal scale; normalise if analytics or sharing are needed.
- Conflict choice uses device and server clocks; a badly wrong device clock can pick the older edit (the other version is still saved).
- Scanned PDFs, Word and PowerPoint import are not supported.
- Server-side AI cannot verify that passages truly come from the user's notes; login, length limits, quota and the grounding prompt bound the risk.
- Native store apps (Capacitor) are a possible later step; the installable web app covers most needs.
