-- CallCraft schema. Safe to run more than once.
-- All reads and writes go through the server API using DATABASE_URL; the browser never talks to the database.

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  -- Short code agents enter to join the class.
  class_code text not null unique,
  -- SHA-256 of the trainer key; the key itself is shown once and never stored.
  trainer_key_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes (id) on delete cascade,
  agent_name text not null check (char_length(agent_name) between 1 and 120),
  scenario_id text not null,
  started_at timestamptz not null,
  duration_sec integer not null check (duration_sec >= 0),
  overall_score integer not null check (overall_score between 0 and 100),
  result text not null check (result in ('pass', 'needs_work', 'fail')),
  transcript jsonb not null,
  scorecard jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_class_created_idx on attempts (class_id, created_at desc);

-- On Supabase, block the public REST API entirely: no policies means no access
-- for the anon/authenticated roles. The server connects as the table owner.
alter table classes enable row level security;
alter table attempts enable row level security;

-- Scenario title captured with each call, so dashboards can label calls
-- from trainer-built scenarios even after the scenario changes.
alter table attempts add column if not exists scenario_title text;

-- Trainer-built practice scenarios, scoped to one class.
create table if not exists scenarios (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  focus text not null check (char_length(focus) between 1 and 400),
  lead_name text not null check (char_length(lead_name) between 1 and 80),
  program text not null check (char_length(program) between 1 and 120),
  persona text not null check (char_length(persona) between 20 and 3000),
  success_criteria jsonb not null default '[]'::jsonb,
  not_applicable jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenarios_class_idx on scenarios (class_id, created_at);

alter table scenarios enable row level security;

-- AI usage log, used to enforce spending limits (see server/limits.ts).
-- Stores a salted hash of the caller's IP address, never the address itself.
create table if not exists ai_usage (
  id bigserial primary key,
  kind text not null check (kind in ('reply', 'score', 'draft', 'health')),
  client_hash text not null,
  class_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on ai_usage (created_at);
create index if not exists ai_usage_client_idx on ai_usage (client_hash, created_at);

alter table ai_usage enable row level security;

-- ---- Accounts ----
-- People who use CallCraft. Admins manage trainers; trainers run classes; agents practice.
-- Passwords are stored as scrypt hashes, never as text.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  name text not null check (char_length(name) between 1 and 120),
  role text not null check (role in ('admin', 'trainer', 'agent')),
  password_hash text not null,
  -- The class an agent is in (agents are in one class at a time).
  class_id uuid references classes (id) on delete set null,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists users_class_idx on users (class_id);

-- Signed-in browsers. Only a SHA-256 of the session token is stored.
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions (user_id);

-- One-time links: invites for new trainers and admins, and password resets.
create table if not exists account_links (
  token_hash text primary key,
  kind text not null check (kind in ('invite', 'reset')),
  role text check (role in ('admin', 'trainer')),
  user_id uuid references users (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table users enable row level security;
alter table sessions enable row level security;
alter table account_links enable row level security;

-- Classes belong to a trainer account; calls belong to the person who made them.
-- Trainer keys are no longer used.
alter table classes add column if not exists trainer_id uuid references users (id) on delete set null;
alter table classes alter column trainer_key_hash drop not null;
alter table attempts add column if not exists user_id uuid references users (id) on delete set null;
alter table attempts alter column class_id drop not null;
create index if not exists attempts_user_created_idx on attempts (user_id, created_at desc);
create index if not exists classes_trainer_idx on classes (trainer_id);

-- Failed sign-in attempts are counted with the same log as AI usage.
alter table ai_usage drop constraint if exists ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check
  check (kind in ('reply', 'score', 'draft', 'health', 'signin'));

-- ---- Call flows ----
-- Trainer-built call flows: the steps and rules agents are scored against.
-- A class uses one flow; no flow means the built-in sample flow.
create table if not exists call_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  company text not null check (char_length(company) between 1 and 100),
  purpose text not null check (char_length(purpose) between 1 and 300),
  end_goal text not null check (char_length(end_goal) between 1 and 200),
  steps jsonb not null,
  rules jsonb not null default '[]'::jsonb,
  archived boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table call_flows enable row level security;

alter table classes add column if not exists flow_id uuid references call_flows (id) on delete set null;
-- Archived classes are hidden from lists and can't be joined.
alter table classes add column if not exists archived boolean not null default false;

-- ---- Settings ----
-- Settings an admin changes in the app (spending limits) and the last AI problem seen.
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

-- ---- Scenarios belong to call flows ----
-- Every class on a call flow shares its scenarios, so a new class doesn't start from scratch.
-- flow_id null means the built-in sample flow. class_id is kept only for scenarios made before this.
alter table scenarios add column if not exists flow_id uuid references call_flows (id) on delete cascade;
alter table scenarios alter column class_id drop not null;
update scenarios s set flow_id = c.flow_id
  from classes c
  where s.class_id = c.id and s.flow_id is null and c.flow_id is not null;
create index if not exists scenarios_flow_idx on scenarios (flow_id, created_at);

-- ---- Ready for live calls ----
-- The scenarios an agent must pass (at or above pass_score) to count as ready.
alter table classes add column if not exists required_scenarios jsonb not null default '[]'::jsonb;
alter table classes add column if not exists pass_score integer not null default 80;
alter table classes drop constraint if exists classes_pass_score_check;
alter table classes add constraint classes_pass_score_check check (pass_score between 0 and 100);

-- ---- Trainer reviews ----
-- A trainer's note on a call, and optionally a corrected score and result.
alter table attempts add column if not exists review_note text check (char_length(review_note) <= 2000);
alter table attempts add column if not exists review_score integer check (review_score between 0 and 100);
alter table attempts add column if not exists review_result text check (review_result in ('pass', 'needs_work', 'fail'));
alter table attempts add column if not exists reviewed_by_name text;
alter table attempts add column if not exists reviewed_at timestamptz;
create index if not exists attempts_created_idx on attempts (created_at);

-- ---- Activity log ----
-- Who did what: invites, resets, changes to people, classes, call flows, and settings.
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id uuid references users (id) on delete set null,
  actor_name text not null,
  action text not null,
  target text not null
);

create index if not exists audit_log_at_idx on audit_log (at desc);
alter table audit_log enable row level security;

-- ---- Indexes for lookups by foreign key ----
create index if not exists classes_flow_idx on classes (flow_id);
create index if not exists account_links_user_idx on account_links (user_id);
create index if not exists account_links_created_by_idx on account_links (created_by);
create index if not exists audit_log_actor_idx on audit_log (actor_id);
create index if not exists call_flows_created_by_idx on call_flows (created_by);

-- On Supabase, the helper that turns on row-level security for new tables shouldn't be callable
-- through the public API. (It still runs automatically.) Skipped on other Postgres hosts.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- ---- Usage counting at scale ----
-- A running count per day and kind, so checking "how much AI today" stays one small lookup
-- no matter how many requests there have been. (ai_usage keeps the per-person detail.)
create table if not exists ai_usage_daily (
  day date not null,
  kind text not null,
  count integer not null default 0,
  primary key (day, kind)
);

alter table ai_usage_daily enable row level security;

-- Start the counts from what's already logged (only fills days that have no count yet).
insert into ai_usage_daily (day, kind, count)
  select (created_at at time zone 'UTC')::date, kind, count(*)::int from ai_usage group by 1, 2
  on conflict (day, kind) do nothing;

create index if not exists ai_usage_draft_idx on ai_usage (class_code, created_at) where kind = 'draft';
