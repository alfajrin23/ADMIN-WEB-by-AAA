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

create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check (
    category in (
      'material',
      'upah_kasbon_tukang',
      'upah_staff_pelaksana',
      'upah_tim_spesialis',
      'alat',
      'operasional'
    )
  ),
  description text,
  recipient_name text,
  amount numeric(14, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_name text not null,
  status text not null default 'hadir' check (status in ('hadir', 'izin', 'sakit', 'alpa')),
  daily_wage numeric(14, 2) not null default 0 check (daily_wage >= 0),
  kasbon_amount numeric(14, 2) not null default 0 check (kasbon_amount >= 0),
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

alter table public.attendance_records
add column if not exists daily_wage numeric(14, 2) not null default 0;

create index if not exists idx_project_expenses_project_id on public.project_expenses(project_id);
create index if not exists idx_project_expenses_expense_date on public.project_expenses(expense_date desc);
create index if not exists idx_attendance_project_id on public.attendance_records(project_id);
create index if not exists idx_attendance_date on public.attendance_records(attendance_date desc);
create index if not exists idx_payroll_resets_project_id on public.payroll_resets(project_id);
create index if not exists idx_payroll_resets_paid_until_date on public.payroll_resets(paid_until_date desc);

alter table public.projects enable row level security;
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
