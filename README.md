# LifeOS

A calm personal workspace: daily goals, tasks, habits, exercise, focus sessions and study. Plain HTML, CSS and JavaScript with no build step. Optional serverless functions add sync, AI and reminders.

## Sections
| Group | Section | What it does |
|---|---|---|
| Overview | My Day | Greeting, daily goals, today's priorities, next study step, habit snapshot, notes |
| Plan | My Tasks | All tasks (one list) with Today, Upcoming, Overdue, All, Completed |
| Plan | Planner | Assignments, tests, exams. Same task records as My Tasks, with category and subject |
| Study | Learn | Subjects, syllabus paste, topics, Studied / Recalled / Practised, revision schedule |
| Study | Notes | Note library (paste, .txt, .md, text PDF), search, "Ask your notes" with page-cited excerpts, optional AI explanation, quiz |
| Routine | Focus | Timer that survives refresh; sessions are logged |
| Routine | Habits, Exercise | Unchanged from the original LifeOS |

On a phone the bottom bar shows My Day, My Tasks, Learn, Focus and More. More opens Planner, Notes, Habits, Exercise and Settings.

## Files
```
index.html        the original LifeOS app (small, marked hooks added)
study-core.js     study rules as pure functions (revision, retrieval, PDF text, goals, focus)
study.js          Learn, Notes, Planner, Focus, Daily goals, More
study.css         a few extra styles using the existing LifeOS tokens
sync-core.js      per-record cross-device sync engine
cloud.js          sign-in, sync wiring, file storage, AI and push (all optional)
api/              serverless functions: config, tutor, push, dispatch, account
supabase/migrations/001_cloud.sql   tables, security rules, private storage
supabase/tests_rls.sql              two-account isolation check
manifest.webmanifest, sw.js, icon*  install to home screen, offline shell, push receiver
.github/workflows/reminders.yml     hourly reminder trigger
docs/SETUP.md, docs/CAPSTONE.md     setup steps; architecture and test report
tests/                              70 automated tests (node --test)
supabase/schema.sql                 an earlier, unconnected workout draft (kept, not used)
```

## Run locally
Double-click `index.html`. Install-to-home-screen and offline support need a web address (https), so they work on the live site, not from a file.

## Tests
Needs Node 20 or newer. In this folder run: `node --test`  (or `npm test`)

## Where data is stored
In each visitor's own browser (localStorage): the original LifeOS keys plus `lifeos.study`. Nothing is sent anywhere. Use Settings > Export JSON to back up; the backup now includes study data. Browsers allow about 5 MB, so very large notes can hit the limit; the app warns when that happens.

## Optional cloud features
Sync across devices, private file storage, AI explanations and daily reminders switch on when you add the settings in `docs/SETUP.md`. Without them LifeOS is exactly the local app. Architecture and test report: `docs/CAPSTONE.md`.

## Not built yet
Scanned-PDF, Word and PowerPoint import; normalised cloud tables; native store apps; build/ease-off habits; manual revision rescheduling; attendance (removed by choice).
