alter table public.projects
  add column if not exists contract_value bigint;

alter table public.projects
  add constraint projects_contract_value_nonnegative
  check (contract_value is null or contract_value >= 0);
