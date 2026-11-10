-- Two-account isolation check. Sign in with two real accounts first, copy their ids from Authentication > Users.
-- Run each block in the SQL Editor. Replace <A> and <B>. Lines marked MUST FAIL / MUST BE 0 are the proof.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<A>"}', true);
insert into public.records (user_id, kind, id, data) values ('<A>', 'tasks', 'rls-test', '{"t":"secret"}');   -- works
select set_config('request.jwt.claims', '{"sub":"<B>"}', true);
select count(*) from public.records where id = 'rls-test';                                                     -- MUST BE 0
insert into public.records (user_id, kind, id, data) values ('<A>', 'tasks', 'forged', '{}');                  -- MUST FAIL (row-level security)
update public.records set data = '{"t":"hacked"}' where id = 'rls-test';                                       -- affects 0 rows
select count(*) from storage.objects where bucket_id = 'notes' and name like '<A>/%';                          -- MUST BE 0
rollback;
