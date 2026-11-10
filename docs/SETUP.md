# Setup guide: turning on sync, AI and reminders

LifeOS works with none of this. Do the steps in order and stop whenever you like; each part is optional and adds one capability.

## Part 1. Put the new files on GitHub and Vercel
1. Back up first: in the live app go to Settings > Export JSON.
2. In your repo (github.com/TarndeepSingh/life-os) click Add file > Upload files. Drag in everything inside the project folder, including the `api`, `docs`, `tests`, `supabase` and `.github` folders. (If `.github` is hidden in your file explorer, switch on "Hidden items".)
3. Choose "Create a new branch" named `cloud-features`, then Propose changes > Create pull request.
4. Vercel adds a Preview link to the pull request. Open it and check the app loads and your old data is there.
5. Merge the pull request. Vercel deploys automatically.

At this point the app works exactly as before plus PDF import. Sync, AI and reminders switch on as you add the settings below.

## Part 2. Cloud sync and file storage (Supabase)
1. supabase.com > your project (create one if needed; the free plan is enough).
2. SQL Editor > New query. Paste all of `supabase/migrations/001_cloud.sql` and click Run. You should see "Success".
3. Table Editor: confirm you see `records`, `push_subscriptions`, `notification_preferences`, `notification_deliveries`, `ai_usage`.
4. Storage: confirm a private bucket named `notes` exists.
5. Project Settings > API. Copy the Project URL, the anon (publishable) key, and the service_role (secret) key.
6. Vercel > your project > Settings > Environment Variables. Add for Production:
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_ANON_KEY` = the anon key
   - `SUPABASE_SERVICE_KEY` = the service_role key (secret: never paste it anywhere else)
7. Deployments > the latest one > Redeploy (environment variables only apply to new deployments).

### Sign-in
1. Supabase > Authentication > URL Configuration. Site URL = your live address. Add the same address, followed by `/**`, under Redirect URLs.
2. Email links work straight away. For Google: Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web application). Add the redirect URI `https://YOUR-PROJECT.supabase.co/auth/v1/callback`. Paste the Client ID and secret into Supabase > Authentication > Providers > Google and enable it.

### Check isolation (do this once)
Sign in with two different accounts, then follow the comments in `supabase/tests_rls.sql`. Every line marked MUST FAIL or MUST BE 0 has to behave that way.

## Part 3. AI explanations (optional, costs money)
1. Get an API key from one provider. A chat subscription does not include API credit; the API is billed separately. Set a monthly spend limit in the provider's dashboard.
2. Vercel > Environment Variables:
   - `AI_PROVIDER` = `anthropic` (or `openai` or `gemini`)
   - the matching key: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`
   - `AI_MODEL` = a current model name from the provider's docs (required for openai and gemini; anthropic defaults to `claude-haiku-5-5`)
   - `DAILY_AI_LIMIT` = questions per person per day (default 30)
3. Redeploy. In the app, Notes > Ask your notes now shows "Explain with AI" to signed-in users.

Only one provider is used. If it fails, the app says so and keeps showing the excerpts; it never silently sends notes to a second company.

## Part 4. Reminders (optional)
1. On your computer, in a terminal: `npx web-push generate-vapid-keys`. Copy both keys.
2. Vercel > Environment Variables:
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` = `mailto:your-email`
   - `CRON_SECRET` = a long random string
3. Redeploy.
4. GitHub > your repo > Settings > Secrets and variables > Actions > New repository secret:
   - `REMINDER_URL` = `https://YOUR-LIVE-ADDRESS/api/dispatch`
   - `CRON_SECRET` = the same string as in Vercel
5. GitHub > Actions > "LifeOS reminders" > Run workflow once to test. A green tick with `{"users":...}` in the log means it reached the server.
6. In the app: Settings > Reminders > Turn on. Pick the hour and quiet hours.
7. iPhone: Share > Add to Home Screen first, then open LifeOS from the Home Screen icon and turn reminders on.

Reminders are sent once a day at your chosen local hour, only if something is due, and never from preview deployments.

## If something does not work
- "Cloud sync is not set up on this site": the three Supabase variables are missing or you did not redeploy.
- "Sync needs attention" in Settings: open the browser console for the message, or tell me the text shown under your email.
- Google sign-in loops back signed out: the Redirect URL in Supabase does not exactly match your live address.
- No reminder arrived: check the Actions run log, the chosen hour (in your own timezone) and that you are not inside quiet hours.
