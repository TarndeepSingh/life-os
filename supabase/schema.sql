-- LifeOS workout schema for Supabase (PostgreSQL). Prepared but NOT yet connected to the app. Untested.
create table public.exercises(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('reps','time','dist')),
  uses_weight boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now());
create unique index exercises_user_name on public.exercises(user_id, lower(name)) where not archived;

create table public.workout_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Workout',
  local_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active','done')),
  notes text not null default '',
  created_at timestamptz not null default now());
create index on public.workout_sessions(user_id, local_date);

create table public.session_exercises(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position int not null,
  skipped boolean not null default false);
create index on public.session_exercises(session_id);

create table public.exercise_sets(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_number int not null check (set_number > 0),
  reps int check (reps between 1 and 5000),
  duration_seconds int check (duration_seconds between 1 and 86400),
  distance_meters int check (distance_meters > 0),
  weight_grams int check (weight_grams between 0 and 1000000),
  is_completed boolean not null default false,
  is_skipped boolean not null default false,
  unique (session_exercise_id, set_number));

do $$ declare t text; begin
  foreach t in array array['exercises','workout_sessions','session_exercises','exercise_sets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
