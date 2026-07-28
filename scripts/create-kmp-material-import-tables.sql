-- Optional persistence for "Ingat pencocokan ini" in the KMP material Excel importer.
-- The importer still analyzes and commits expenses when these tables are absent;
-- only remembered project/material mappings are disabled.

create table if not exists public.kmp_material_import_aliases (
  id uuid primary key,
  client_key text not null,
  excel_project_name text not null,
  excel_district text not null default '',
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_key, excel_project_name, excel_district)
);

create index if not exists kmp_material_import_aliases_project_id_idx
  on public.kmp_material_import_aliases(project_id);

create table if not exists public.kmp_material_import_rules (
  id uuid primary key,
  client_key text not null,
  source_label text not null,
  material_key text not null default '',
  split_rule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_key, source_label),
  constraint kmp_material_import_rules_target_check
    check (length(trim(material_key)) > 0 or split_rule is not null)
);

alter table public.kmp_material_import_aliases enable row level security;
alter table public.kmp_material_import_rules enable row level security;

comment on table public.kmp_material_import_aliases is
  'Client-scoped Excel project aliases used only by the reviewed KMP material importer.';
comment on table public.kmp_material_import_rules is
  'Client-scoped material aliases and reviewed split rules for KMP Excel imports.';
