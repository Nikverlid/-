create schema if not exists school;
revoke all on schema school from public, anon, authenticated;
create table school.accounts (
 id uuid primary key default gen_random_uuid(),
 login text unique not null, name text not null,
 class text check (class in ('7А','7Б','8А','8Б','9А','9Б')),
 role text not null check(role in ('student','teacher','admin')),
 password_hash text not null, salt text not null,
 created_at timestamptz not null default now()
);
create unique index student_name_class on school.accounts(lower(name),class) where role='student';
create table school.sessions(token_hash text primary key, account_id uuid not null references school.accounts on delete cascade, expires_at timestamptz not null);
create table school.rate_limits(key text primary key, hits integer not null, until_at timestamptz not null);
create table school.catalog(work text primary key, data jsonb not null);
create table school.homework(id uuid primary key default gen_random_uuid(), class text not null check(class in ('7А','7Б','8А','8Б','9А','9Б')), work text not null references school.catalog, game text not null check(game in ('truth','crossword','easy','medium','expert')), attempts integer not null check(attempts between 1 and 100), active boolean not null default true, created_at timestamptz not null default now(), unique(class,work,game));
create table school.attempts(id uuid primary key default gen_random_uuid(), account_id uuid not null references school.accounts on delete cascade, homework_id uuid not null references school.homework on delete cascade, state jsonb not null, percent numeric check(percent between 0 and 100), finished boolean not null default false, created_at timestamptz not null default now());
create index attempts_owner_homework on school.attempts(account_id,homework_id);
create table school.audit(id bigint generated always as identity primary key, actor uuid, action text not null, target uuid, created_at timestamptz not null default now());
alter table school.accounts enable row level security;
alter table school.sessions enable row level security;
alter table school.rate_limits enable row level security;
alter table school.catalog enable row level security;
alter table school.homework enable row level security;
alter table school.attempts enable row level security;
alter table school.audit enable row level security;
revoke all on all tables in schema school from public,anon,authenticated;
