-- APP: career-discovery schema.
-- Every table is owned by an auth user and locked down with RLS on auth.uid().
-- The career-domain catalog (weights, roadmaps) is versioned in code (src/lib/careers.js),
-- so recommendations store the catalog version they were computed against.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, holding the onboarding answers.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text,
  branch         text,          -- engineering discipline, e.g. 'cse', 'ece', 'mech'
  year_of_study  smallint check (year_of_study between 1 and 6),
  interests      jsonb not null default '{}'::jsonb,  -- { int_software: 1..5, ... }
  aptitude       jsonb not null default '{}'::jsonb,  -- self-rated { apt_logical: 1..5, ... }
  aptitude_quiz  jsonb not null default '{}'::jsonb,  -- measured { apt_logical: 0..100, ... }
  preferences    jsonb not null default '{}'::jsonb,  -- { pref_team: 0..100, ... }
  traits         jsonb not null default '{}'::jsonb,  -- { tr_curiosity: 1..5, ... }
  onboarded_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recommendations: the ranked shortlist for a user (replaced on each recompute).
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  domain_id        text not null,
  rank             smallint not null,
  score            numeric(5, 1) not null check (score between 0 and 100),
  breakdown        jsonb not null,           -- [{ feature, weight, value, contribution }]
  explanation      jsonb,                    -- { why, watch_out, grounded_on[] } from Gemini
  explanation_model text,
  catalog_version  text not null,
  created_at       timestamptz not null default now(),
  unique (user_id, domain_id)
);
create index recommendations_user_rank_idx on public.recommendations (user_id, rank);

-- ---------------------------------------------------------------------------
-- advisor chat: Q&A about the recommendations.
-- ---------------------------------------------------------------------------
create table public.chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default 'New conversation',
  focus_domain text,                          -- optional career the chat is about
  created_at   timestamptz not null default now()
);
create index chat_sessions_user_idx on public.chat_sessions (user_id, created_at desc);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'model')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.recommendations enable row level security;
alter table public.chat_sessions   enable row level security;
alter table public.chat_messages   enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own recommendations" on public.recommendations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own chat sessions" on public.chat_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A message may only be written into a session the user also owns.
create policy "own chat messages" on public.chat_messages
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Auto-create an empty profile when a user signs up; keep updated_at fresh.
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
