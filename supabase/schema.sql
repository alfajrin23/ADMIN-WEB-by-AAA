create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  client_name text,
  start_date date,
  status text not null default 'aktif' check (status in ('aktif', 'selesai', 'tertunda')),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null,
  specialist_type text,
  requester_name text,
  description text,
  recipient_name text,
  quantity numeric(14, 2) not null default 0,
  unit_label text,
  usage_info text,
  unit_price numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null,
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  worker_name text not null,
  team_type text not null default 'tukang' check (team_type in ('tukang', 'laden', 'spesialis')),
  specialist_team_name text,
  status text not null default 'hadir' check (status in ('hadir', 'izin', 'sakit', 'alpa')),
  work_days integer not null default 1 check (work_days >= 1 and work_days <= 31),
  daily_wage numeric(14, 2) not null default 0 check (daily_wage >= 0),
  overtime_hours numeric(8, 2) not null default 0 check (overtime_hours >= 0),
  overtime_wage numeric(14, 2) not null default 0 check (overtime_wage >= 0),
  kasbon_amount numeric(14, 2) not null default 0 check (kasbon_amount >= 0),
  reimburse_type text check (reimburse_type in ('material', 'kekurangan_dana') or reimburse_type is null),
  reimburse_amount numeric(14, 2) not null default 0 check (reimburse_amount >= 0),
  attendance_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_resets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  team_type text not null check (team_type in ('tukang', 'laden', 'spesialis')),
  specialist_team_name text,
  worker_name text,
  paid_until_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.project_expenses
add column if not exists specialist_type text;
alter table public.project_expenses
add column if not exists requester_name text;
alter table public.project_expenses
add column if not exists quantity numeric(14, 2) not null default 0;
alter table public.project_expenses
add column if not exists unit_label text;
alter table public.project_expenses
add column if not exists usage_info text;
alter table public.project_expenses
add column if not exists unit_price numeric(14, 2) not null default 0;

alter table public.attendance_records
add column if not exists team_type text not null default 'tukang';
alter table public.attendance_records
add column if not exists specialist_team_name text;
alter table public.attendance_records
add column if not exists work_days integer not null default 1;
alter table public.attendance_records
add column if not exists daily_wage numeric(14, 2) not null default 0;
alter table public.attendance_records
add column if not exists overtime_hours numeric(8, 2) not null default 0;
alter table public.attendance_records
add column if not exists overtime_wage numeric(14, 2) not null default 0;
alter table public.attendance_records
add column if not exists reimburse_type text;
alter table public.attendance_records
add column if not exists reimburse_amount numeric(14, 2) not null default 0;
alter table public.attendance_records
alter column project_id drop not null;

alter table public.attendance_records
drop constraint if exists attendance_records_team_type_check;
alter table public.attendance_records
add constraint attendance_records_team_type_check
check (team_type in ('tukang', 'laden', 'spesialis'));

alter table public.attendance_records
drop constraint if exists attendance_records_work_days_check;
alter table public.attendance_records
add constraint attendance_records_work_days_check
check (work_days >= 1 and work_days <= 31);

alter table public.attendance_records
drop constraint if exists attendance_records_reimburse_type_check;
alter table public.attendance_records
add constraint attendance_records_reimburse_type_check
check (reimburse_type in ('material', 'kekurangan_dana') or reimburse_type is null);

alter table public.attendance_records
drop constraint if exists attendance_records_reimburse_amount_check;
alter table public.attendance_records
add constraint attendance_records_reimburse_amount_check
check (reimburse_amount >= 0);

alter table public.attendance_records
drop constraint if exists attendance_records_overtime_hours_check;
alter table public.attendance_records
add constraint attendance_records_overtime_hours_check
check (overtime_hours >= 0);

alter table public.attendance_records
drop constraint if exists attendance_records_overtime_wage_check;
alter table public.attendance_records
add constraint attendance_records_overtime_wage_check
check (overtime_wage >= 0);

alter table public.project_expenses
drop constraint if exists project_expenses_category_check;

create index if not exists idx_projects_created_at on public.projects(created_at desc);
create index if not exists idx_expense_categories_slug on public.expense_categories(slug);
create index if not exists idx_project_expenses_project_id on public.project_expenses(project_id);
create index if not exists idx_project_expenses_category on public.project_expenses(category);
create index if not exists idx_project_expenses_expense_date on public.project_expenses(expense_date desc);
create index if not exists idx_project_expenses_project_id_expense_date on public.project_expenses(project_id, expense_date desc);
create index if not exists idx_project_expenses_expense_date_id on public.project_expenses(expense_date desc, id desc);
create index if not exists idx_attendance_project_id on public.attendance_records(project_id);
create index if not exists idx_attendance_date on public.attendance_records(attendance_date desc);
create index if not exists idx_attendance_project_id_attendance_date on public.attendance_records(project_id, attendance_date desc);
create index if not exists idx_payroll_resets_project_id on public.payroll_resets(project_id);
create index if not exists idx_payroll_resets_paid_until_date on public.payroll_resets(paid_until_date desc);

alter table public.projects enable row level security;
alter table public.expense_categories enable row level security;
alter table public.project_expenses enable row level security;
alter table public.attendance_records enable row level security;
alter table public.payroll_resets enable row level security;

drop policy if exists "projects_select_all" on public.projects;
create policy "projects_select_all"
on public.projects
for select
using (true);
drop policy if exists "projects_insert_all" on public.projects;
create policy "projects_insert_all"
on public.projects
for insert
with check (true);
drop policy if exists "projects_update_all" on public.projects;
create policy "projects_update_all"
on public.projects
for update
using (true)
with check (true);
drop policy if exists "projects_delete_all" on public.projects;
create policy "projects_delete_all"
on public.projects
for delete
using (true);

drop policy if exists "expense_categories_select_all" on public.expense_categories;
create policy "expense_categories_select_all"
on public.expense_categories
for select
using (true);
drop policy if exists "expense_categories_insert_all" on public.expense_categories;
create policy "expense_categories_insert_all"
on public.expense_categories
for insert
with check (true);
drop policy if exists "expense_categories_update_all" on public.expense_categories;
create policy "expense_categories_update_all"
on public.expense_categories
for update
using (true)
with check (true);
drop policy if exists "expense_categories_delete_all" on public.expense_categories;
create policy "expense_categories_delete_all"
on public.expense_categories
for delete
using (true);

drop policy if exists "project_expenses_select_all" on public.project_expenses;
create policy "project_expenses_select_all"
on public.project_expenses
for select
using (true);
drop policy if exists "project_expenses_insert_all" on public.project_expenses;
create policy "project_expenses_insert_all"
on public.project_expenses
for insert
with check (true);
drop policy if exists "project_expenses_update_all" on public.project_expenses;
create policy "project_expenses_update_all"
on public.project_expenses
for update
using (true)
with check (true);
drop policy if exists "project_expenses_delete_all" on public.project_expenses;
create policy "project_expenses_delete_all"
on public.project_expenses
for delete
using (true);

drop policy if exists "attendance_records_select_all" on public.attendance_records;
create policy "attendance_records_select_all"
on public.attendance_records
for select
using (true);
drop policy if exists "attendance_records_insert_all" on public.attendance_records;
create policy "attendance_records_insert_all"
on public.attendance_records
for insert
with check (true);
drop policy if exists "attendance_records_update_all" on public.attendance_records;
create policy "attendance_records_update_all"
on public.attendance_records
for update
using (true)
with check (true);
drop policy if exists "attendance_records_delete_all" on public.attendance_records;
create policy "attendance_records_delete_all"
on public.attendance_records
for delete
using (true);

drop policy if exists "payroll_resets_select_all" on public.payroll_resets;
create policy "payroll_resets_select_all"
on public.payroll_resets
for select
using (true);
drop policy if exists "payroll_resets_insert_all" on public.payroll_resets;
create policy "payroll_resets_insert_all"
on public.payroll_resets
for insert
with check (true);
drop policy if exists "payroll_resets_update_all" on public.payroll_resets;
create policy "payroll_resets_update_all"
on public.payroll_resets
for update
using (true)
with check (true);
drop policy if exists "payroll_resets_delete_all" on public.payroll_resets;
create policy "payroll_resets_delete_all"
on public.payroll_resets
for delete
using (true);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  username text not null unique,
  password_hash text not null,
  role text not null default 'viewer' check (role in ('dev', 'staff', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null references public.app_roles(role_key) on delete cascade,
  module text not null check (module in ('dashboard', 'projects', 'attendance', 'reports', 'logs', 'roles')),
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_import boolean not null default false,
  created_at timestamptz not null default now(),
  unique (role_key, module)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text not null,
  actor_username text,
  actor_role text not null check (actor_role in ('dev', 'staff', 'viewer')),
  action_type text not null,
  module text not null,
  entity_id text,
  entity_name text,
  description text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_users
add column if not exists role_key text references public.app_roles(role_key) on delete set null;

create index if not exists idx_app_users_username on public.app_users(username);
create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_app_users_role_key on public.app_users(role_key);
create index if not exists idx_app_roles_role_key on public.app_roles(role_key);
create index if not exists idx_role_permissions_role_key on public.role_permissions(role_key);
create index if not exists idx_role_permissions_module on public.role_permissions(module);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_actor_id on public.activity_logs(actor_id);

alter table public.app_users enable row level security;
alter table public.app_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "app_users_select_all" on public.app_users;
create policy "app_users_select_all"
on public.app_users
for select
using (true);
drop policy if exists "app_users_insert_all" on public.app_users;
create policy "app_users_insert_all"
on public.app_users
for insert
with check (true);
drop policy if exists "app_users_update_all" on public.app_users;
create policy "app_users_update_all"
on public.app_users
for update
using (true)
with check (true);
drop policy if exists "app_users_delete_all" on public.app_users;
create policy "app_users_delete_all"
on public.app_users
for delete
using (true);

drop policy if exists "app_roles_select_all" on public.app_roles;
create policy "app_roles_select_all"
on public.app_roles
for select
using (true);
drop policy if exists "app_roles_insert_all" on public.app_roles;
create policy "app_roles_insert_all"
on public.app_roles
for insert
with check (true);
drop policy if exists "app_roles_update_all" on public.app_roles;
create policy "app_roles_update_all"
on public.app_roles
for update
using (true)
with check (true);
drop policy if exists "app_roles_delete_all" on public.app_roles;
create policy "app_roles_delete_all"
on public.app_roles
for delete
using (true);

drop policy if exists "role_permissions_select_all" on public.role_permissions;
create policy "role_permissions_select_all"
on public.role_permissions
for select
using (true);
drop policy if exists "role_permissions_insert_all" on public.role_permissions;
create policy "role_permissions_insert_all"
on public.role_permissions
for insert
with check (true);
drop policy if exists "role_permissions_update_all" on public.role_permissions;
create policy "role_permissions_update_all"
on public.role_permissions
for update
using (true)
with check (true);
drop policy if exists "role_permissions_delete_all" on public.role_permissions;
create policy "role_permissions_delete_all"
on public.role_permissions
for delete
using (true);

drop policy if exists "activity_logs_select_all" on public.activity_logs;
create policy "activity_logs_select_all"
on public.activity_logs
for select
using (true);
drop policy if exists "activity_logs_insert_all" on public.activity_logs;
create policy "activity_logs_insert_all"
on public.activity_logs
for insert
with check (true);
drop policy if exists "activity_logs_update_all" on public.activity_logs;
create policy "activity_logs_update_all"
on public.activity_logs
for update
using (true)
with check (true);
drop policy if exists "activity_logs_delete_all" on public.activity_logs;
create policy "activity_logs_delete_all"
on public.activity_logs
for delete
using (true);
