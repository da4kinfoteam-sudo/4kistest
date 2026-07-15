create table if not exists public.budget_item_adjustment_history (
  id bigserial primary key,
  source_type text not null check (source_type in ('subproject_detail', 'activity_expense', 'staffing_expense')),
  parent_id bigint not null,
  item_id text not null,
  action text not null check (action in (
    'cancel',
    'restore',
    'tag_realignment',
    'tag_savings',
    'clear_tag',
    'create_adjustment_item',
    'edit_adjustment_item',
    'delete_adjustment_item'
  )),
  source_item_id text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  amount_delta numeric default 0,
  reason text not null,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_budget_item_adjustment_history_source
  on public.budget_item_adjustment_history (source_type, parent_id, item_id);

create index if not exists idx_budget_item_adjustment_history_parent
  on public.budget_item_adjustment_history (parent_id, source_type, created_at desc);

alter table public.budget_item_adjustment_history enable row level security;

drop policy if exists "budget adjustment history readable by authenticated users"
  on public.budget_item_adjustment_history;
create policy "budget adjustment history readable by authenticated users"
  on public.budget_item_adjustment_history
  for select
  to authenticated
  using (true);

drop policy if exists "budget adjustment history insertable by authenticated users"
  on public.budget_item_adjustment_history;
create policy "budget adjustment history insertable by authenticated users"
  on public.budget_item_adjustment_history
  for insert
  to authenticated
  with check (true);
