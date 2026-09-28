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
