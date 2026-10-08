-- Phone pairing: short-lived, single-use codes that let the Praxio mobile app sign in as a
-- person who is already signed in on the website (account menu → Connect your phone).
--
-- Only the device-link edge function (service role) reads or writes this table. Codes are
-- stored as SHA-256 hashes, never in plain text, expire after 5 minutes and work once.
-- Idempotent, so it is safe to paste into the SQL editor and later run via `supabase db push`.
create table if not exists public.device_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists device_link_codes_user_idx on public.device_link_codes (user_id);

-- RLS on with no policies: browsers and phones can never read or write codes directly.
alter table public.device_link_codes enable row level security;
revoke all on public.device_link_codes from anon, authenticated;

comment on table public.device_link_codes is 'Phone pairing codes (hashed, 5-minute, single use). Service role only, via the device-link edge function.';
