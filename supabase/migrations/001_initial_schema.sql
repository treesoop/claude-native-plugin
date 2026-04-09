-- teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  created_at timestamptz default now()
);

-- members
create table members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invite_key text unique not null,
  name text not null,
  created_at timestamptz default now()
);

create index idx_members_invite_key on members(invite_key);
create index idx_members_team_id on members(team_id);

-- usage_events
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  invite_key text not null references members(invite_key) on delete cascade,
  session_id text not null,
  event_type text not null check (event_type in ('session_start', 'session_end', 'heartbeat')),
  project text not null default '기타',
  input_tokens int default 0,
  output_tokens int default 0,
  prompt_count int default 0,
  timestamp timestamptz not null,
  created_at timestamptz default now()
);

create index idx_usage_events_invite_key on usage_events(invite_key);
create index idx_usage_events_session_id on usage_events(session_id);
create index idx_usage_events_timestamp on usage_events(timestamp);

-- RLS
alter table teams enable row level security;
alter table members enable row level security;
alter table usage_events enable row level security;

-- teams: 팀장만 자기 팀 CRUD
create policy "teams_owner_all" on teams
  for all using (auth.uid() = owner_id);

-- members: 팀장이 자기 팀 멤버 관리
create policy "members_owner_all" on members
  for all using (
    team_id in (select id from teams where owner_id = auth.uid())
  );

-- usage_events: INSERT는 anon이 invite_key 유효하면 허용
create policy "usage_events_anon_insert" on usage_events
  for insert with check (
    invite_key in (select invite_key from members)
  );

-- usage_events: SELECT는 본인 invite_key 또는 팀장
create policy "usage_events_select" on usage_events
  for select using (
    invite_key in (
      select m.invite_key from members m
      join teams t on m.team_id = t.id
      where t.owner_id = auth.uid()
    )
    or true
  );
