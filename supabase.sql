-- Dragonfire Muster: cloud saves.  Run once in Supabase > SQL Editor.

-- One row per roster.  client_id is the roster's id inside the app.
create table public.rosters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id  text not null,
  name       text not null check (char_length(name) <= 100),
  data       jsonb not null check (pg_column_size(data) < 1000000),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

-- Locked by default; each signed-in person can reach only their own rows.
alter table public.rosters enable row level security;
grant select, insert, update, delete on public.rosters to authenticated;

create policy "read own rosters"   on public.rosters for select to authenticated using (auth.uid() = user_id);
create policy "add own rosters"    on public.rosters for insert to authenticated with check (auth.uid() = user_id);
create policy "change own rosters" on public.rosters for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own rosters" on public.rosters for delete to authenticated using (auth.uid() = user_id);

-- Lets a person delete their own account and everything in it.
create function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
