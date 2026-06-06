create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.input_biaya_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  project_id text not null default '__global__',
  mode text not null,
  draft_data jsonb,
  status text not null default 'active' check (status in ('active', 'cleared', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, mode)
);

alter table public.input_biaya_drafts
  drop constraint if exists input_biaya_drafts_status_check;

alter table public.input_biaya_drafts
  add constraint input_biaya_drafts_status_check
  check (status in ('active', 'cleared', 'deleted'));

create index if not exists input_biaya_drafts_user_idx
  on public.input_biaya_drafts (user_id);

create index if not exists input_biaya_drafts_project_idx
  on public.input_biaya_drafts (project_id);

create index if not exists input_biaya_drafts_mode_idx
  on public.input_biaya_drafts (mode);

create index if not exists input_biaya_drafts_lookup_idx
  on public.input_biaya_drafts (user_id, project_id, mode, status);

create index if not exists input_biaya_drafts_updated_at_idx
  on public.input_biaya_drafts (updated_at desc);

alter table public.input_biaya_drafts enable row level security;

drop policy if exists "input_biaya_drafts_owner_select" on public.input_biaya_drafts;
create policy "input_biaya_drafts_owner_select"
  on public.input_biaya_drafts
  for select
  using (auth.role() = 'service_role' or user_id = auth.uid()::text);

drop policy if exists "input_biaya_drafts_owner_insert" on public.input_biaya_drafts;
create policy "input_biaya_drafts_owner_insert"
  on public.input_biaya_drafts
  for insert
  with check (auth.role() = 'service_role' or user_id = auth.uid()::text);

drop policy if exists "input_biaya_drafts_owner_update" on public.input_biaya_drafts;
create policy "input_biaya_drafts_owner_update"
  on public.input_biaya_drafts
  for update
  using (auth.role() = 'service_role' or user_id = auth.uid()::text)
  with check (auth.role() = 'service_role' or user_id = auth.uid()::text);

drop policy if exists "input_biaya_drafts_owner_delete" on public.input_biaya_drafts;
create policy "input_biaya_drafts_owner_delete"
  on public.input_biaya_drafts
  for delete
  using (auth.role() = 'service_role' or user_id = auth.uid()::text);

create table if not exists public.kmp_client_materials (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  client_name text not null,
  material_key text not null,
  material_name text not null,
  submission_name text,
  minimum_amount numeric not null default 0 check (minimum_amount >= 0),
  checklist_type text not null default 'manual' check (checklist_type in ('none', 'system', 'manual')),
  checklist_status text not null default 'auto' check (checklist_status in ('auto', 'pending', 'fulfilled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_key, material_key)
);

create index if not exists kmp_client_materials_client_key_idx
  on public.kmp_client_materials (client_key);

alter table public.kmp_client_materials enable row level security;

drop policy if exists "kmp_client_materials_select" on public.kmp_client_materials;
create policy "kmp_client_materials_select"
  on public.kmp_client_materials
  for select
  using (true);

drop policy if exists "kmp_client_materials_service_role_write" on public.kmp_client_materials;
create policy "kmp_client_materials_service_role_write"
  on public.kmp_client_materials
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

do $$
begin
  if to_regclass('public.kmp_project_materials') is not null then
    insert into public.kmp_client_materials (
      client_key,
      client_name,
      material_key,
      material_name,
      submission_name,
      minimum_amount,
      checklist_type,
      checklist_status,
      created_at,
      updated_at
    )
    select distinct on (material_key)
      'kmp cianjur',
      'KMP Cianjur',
      material_key,
      material_name,
      submission_name,
      greatest(coalesce(minimum_amount, 0), 0),
      coalesce(checklist_type, 'manual'),
      coalesce(checklist_status, 'auto'),
      coalesce(created_at, now()),
      coalesce(updated_at, created_at, now())
    from public.kmp_project_materials
    where material_key is not null
      and material_name is not null
    order by material_key, updated_at desc nulls last, created_at desc nulls last
    on conflict (client_key, material_key) do update set
      client_name = excluded.client_name,
      material_name = excluded.material_name,
      submission_name = excluded.submission_name,
      minimum_amount = excluded.minimum_amount,
      checklist_type = excluded.checklist_type,
      checklist_status = excluded.checklist_status,
      updated_at = now();
  end if;
end $$;

do $$
begin
  if to_regclass('public.project_expenses') is not null then
    create index if not exists project_expenses_project_category_date_idx
      on public.project_expenses (project_id, category, expense_date desc);

    create index if not exists project_expenses_amount_idx
      on public.project_expenses (amount);

    create index if not exists project_expenses_requester_trgm_idx
      on public.project_expenses using gin (requester_name gin_trgm_ops);

    create index if not exists project_expenses_description_trgm_idx
      on public.project_expenses using gin (description gin_trgm_ops);

    create index if not exists project_expenses_usage_trgm_idx
      on public.project_expenses using gin (usage_info gin_trgm_ops);

    create index if not exists project_expenses_recipient_trgm_idx
      on public.project_expenses using gin (recipient_name gin_trgm_ops);
  end if;
end $$;
