-- Awards and Rankings dashboard controller tables
-- Author: 4K

create table if not exists public.award_ranking_settings (
  settings_key text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by bigint references public.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.award_manual_scores (
  id bigserial primary key,
  fund_year integer not null,
  period text not null check (period in ('Q1', 'Q2', 'Q3', 'Q4', 'Year End')),
  operating_unit text not null,
  reportorial_required integer not null default 0,
  reportorial_submitted integer not null default 0,
  national_activities_required integer not null default 0,
  national_activities_attended integer not null default 0,
  remarks text,
  updated_by bigint references public.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fund_year, period, operating_unit)
);

create or replace function public.set_award_rankings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists award_ranking_settings_set_updated_at on public.award_ranking_settings;
create trigger award_ranking_settings_set_updated_at
before update on public.award_ranking_settings
for each row execute function public.set_award_rankings_updated_at();

drop trigger if exists award_manual_scores_set_updated_at on public.award_manual_scores;
create trigger award_manual_scores_set_updated_at
before update on public.award_manual_scores
for each row execute function public.set_award_rankings_updated_at();

alter table public.award_ranking_settings disable row level security;
alter table public.award_manual_scores disable row level security;

grant select, insert, update, delete on table public.award_ranking_settings to anon, authenticated;
grant select, insert, update, delete on table public.award_manual_scores to anon, authenticated;
grant usage, select on sequence public.award_manual_scores_id_seq to anon, authenticated;
