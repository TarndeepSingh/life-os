-- LifeOS cloud layer. Run once in Supabase > SQL Editor. Safe to read top to bottom.
-- Every table is protected by row-level security: a signed-in user can only touch their own rows.

-- 1) Synced data: one row per record (task, habit, topic, note ...), never one big document.
create table if not exists public.records (
  user_id    uuid not null references auth.users on delete cascade,
  kind       text not null check (kind in ('tasks','habits','exercises','workouts','daynotes','subjects','topics','events','notes','goals','focus','quiz')),
  id         text not null check (char_length(id) between 1 and 80),
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- The server clock decides updated_at, so a wrong phone clock cannot reorder history.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists records_set_updated_at on public.records;
create trigger records_set_updated_at before insert or update on public.records for each row execute function public.set_updated_at();

alter table public.records enable row level security;
drop policy if exists "own records select" on public.records;
drop policy if exists "own records insert" on public.records;
drop policy if exists "own records update" on public.records;
drop policy if exists "own records delete" on public.records;
create policy "own records select" on public.records for select to authenticated using (user_id = auth.uid());
create policy "own records insert" on public.records for insert to authenticated with check (user_id = auth.uid());
create policy "own records update" on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own records delete" on public.records for delete to authenticated using (user_id = auth.uid());

-- 2) Reminders. Written only by the server (service role); users may read and delete their own rows.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  enabled boolean not null default false,
  hour int not null default 8 check (hour between 0 and 23),
  quiet_start int not null default 22 check (quiet_start between 0 and 23),
  quiet_end int not null default 7 check (quiet_end between 0 and 23),
  personal boolean not null default false,
  tz text not null default 'UTC',
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_deliveries (
  user_id uuid not null references auth.users on delete cascade,
  local_date date not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, local_date, kind)
);
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
drop policy if exists "own subscriptions read" on public.push_subscriptions;
drop policy if exists "own subscriptions delete" on public.push_subscriptions;
drop policy if exists "own prefs read" on public.notification_preferences;
create policy "own subscriptions read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own subscriptions delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
create policy "own prefs read" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
-- notification_deliveries has no policies on purpose: only the server can touch it.

-- 3) AI daily quota, atomic and shared across server instances.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create or replace function public.bump_ai_usage(p_user uuid, p_day date) returns int language sql security definer set search_path = public as $$
  insert into public.ai_usage (user_id, day, count) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;
revoke execute on function public.bump_ai_usage(uuid, date) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, date) to service_role;

-- 4) Private file storage for original note files (PDF, text, Markdown). Each user can only reach their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 10485760, array['application/pdf','text/plain','text/markdown'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf','text/plain','text/markdown'];
drop policy if exists "own note files read" on storage.objects;
drop policy if exists "own note files insert" on storage.objects;
drop policy if exists "own note files update" on storage.objects;
drop policy if exists "own note files delete" on storage.objects;
create policy "own note files read" on storage.objects for select to authenticated using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own note files insert" on storage.objects for insert to authenticated with check (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own note files update" on storage.objects for update to authenticated using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own note files delete" on storage.objects for delete to authenticated using (bucket_id = 'notes' and (storage.foldername(name))[1] = auth.uid()::text);
