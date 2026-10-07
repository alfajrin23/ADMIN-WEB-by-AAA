create or replace function public.get_dashboard_summary(
  p_month_start date,
  p_active_since date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_projects as materialized (
    select
      id,
      name,
      client_name,
      case when status::text in ('aktif', 'selesai', 'tertunda') then status::text else 'aktif' end as status
    from public.projects
    where upper(btrim(coalesce(code, ''))) not in (
      'SYS-WORKER-PRESET',
      'SYS-ATTENDANCE-DRAFT'
    )
  ),
  expense_rows as materialized (
    select
      e.project_id::text as project_id,
      coalesce(nullif(btrim(p.name), ''), 'Project') as project_name,
      coalesce(nullif(btrim(p.client_name), ''), 'Tanpa Klien') as client_name,
      coalesce(
        nullif(regexp_replace(lower(btrim(coalesce(p.client_name, ''))), '\s+', ' ', 'g'), ''),
        'tanpa klien'
      ) as client_key,
      coalesce(p.status, 'aktif') as project_status,
      coalesce(
        case
          when normalized.category = '' or normalized.category = 'pasir' then 'material'
          else normalized.category
        end,
        'material'
      ) as category,
      e.amount,
      e.expense_date,
      case
        when normalized.category <> 'upah_staff_pelaksana'
          and lower(concat_ws(' ', e.description, e.usage_info)) ~
            '(^|[^a-z0-9_])upah[[:space:]]+staff([^a-z0-9_]|$)|(^|[^a-z0-9_])upah[[:space:]]+pelaksana([^a-z0-9_]|$)|(^|[^a-z0-9_])kasbon[[:space:]]+pelaksana([^a-z0-9_]|$)|(^|[^a-z0-9_])um[[:space:]]+pelaksana([^a-z0-9_]|$)|(^|[^a-z0-9_])upah[[:space:]]+dan[[:space:]]+um[[:space:]]+pelaksana([^a-z0-9_]|$)|(^|[^a-z0-9_])upah[[:space:]]+office([^a-z0-9_]|$)|(^|[^a-z0-9_])upah[[:space:]]+supir([^a-z0-9_]|$)'
          then 'upah_staff_pelaksana'
        when normalized.category = '' or normalized.category = 'pasir' then 'material'
        else normalized.category
      end as client_category
    from public.project_expenses e
    left join visible_projects p on p.id = e.project_id
    cross join lateral (
      select btrim(regexp_replace(lower(coalesce(e.category, '')), '[^a-z0-9]+', '_', 'g'), '_') as category
    ) normalized
    where normalized.category <> 'perawatan'
  ),
  attendance_summary as (
    select
      count(distinct nullif(lower(btrim(worker_name)), ''))
        filter (where attendance_date >= p_active_since) as active_workers,
      coalesce(sum(kasbon_amount), 0)::numeric as total_kasbon
    from public.attendance_records
    where btrim(coalesce(notes, '')) not like 'ADMINWEBWORKERPRESET:%'
  ),
  project_summary as (
    select
      count(*)::bigint as total_projects,
      count(*) filter (where status = 'aktif')::bigint as active_projects,
      count(*) filter (where status = 'selesai')::bigint as completed_projects,
      count(*) filter (where status = 'tertunda')::bigint as delayed_projects
    from visible_projects
  ),
  expense_summary as (
    select
      coalesce(sum(amount), 0)::numeric as total_expense,
      coalesce(sum(amount) filter (
        where expense_date >= p_month_start
          and expense_date < (p_month_start + interval '1 month')::date
      ), 0)::numeric as month_expense
    from expense_rows
  ),
  category_totals as (
    select category, sum(amount)::numeric as total
    from expense_rows
    group by category
  ),
  client_project_counts as (
    select
      coalesce(nullif(regexp_replace(lower(btrim(coalesce(client_name, ''))), '\s+', ' ', 'g'), ''), 'tanpa klien') as client_key,
      max(coalesce(nullif(btrim(client_name), ''), 'Tanpa Klien')) as client_name,
      count(*)::bigint as project_count
    from visible_projects
    group by 1
  ),
  project_expense_totals as (
    select
      project_id,
      max(project_name) as project_name,
      max(client_name) as client_name,
      max(project_status) as project_status,
      count(*)::bigint as transaction_count,
      sum(amount)::numeric as total_expense,
      max(expense_date) as latest_expense_date
    from expense_rows
    group by project_id
  ),
  client_expense_totals as (
    select client_key, max(client_name) as client_name, sum(amount)::numeric as total_expense
    from expense_rows
    group by client_key
  ),
  client_category_totals as (
    select client_key, client_category as category, sum(amount)::numeric as total
    from expense_rows
    group by client_key, client_category
  )
  select jsonb_build_object(
    'totalProjects', project_summary.total_projects,
    'activeProjects', project_summary.active_projects,
    'completedProjects', project_summary.completed_projects,
    'delayedProjects', project_summary.delayed_projects,
    'activeWorkers', attendance_summary.active_workers,
    'totalExpense', expense_summary.total_expense,
    'monthExpense', expense_summary.month_expense,
    'totalKasbon', attendance_summary.total_kasbon,
    'categoryTotals', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'total', total) order by category)
      from category_totals
    ), '[]'::jsonb),
    'categoryTotalsByClient', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clientName', client_expense_totals.client_name,
        'projectCount', coalesce(client_project_counts.project_count, 0),
        'totalExpense', client_expense_totals.total_expense,
        'categoryTotals', coalesce((
          select jsonb_agg(jsonb_build_object('category', client_category_totals.category, 'total', client_category_totals.total))
          from client_category_totals
          where client_category_totals.client_key = client_expense_totals.client_key
        ), '[]'::jsonb)
      ) order by client_expense_totals.total_expense desc, client_expense_totals.client_name)
      from client_expense_totals
      left join client_project_counts using (client_key)
    ), '[]'::jsonb),
    'projectExpenseTotals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'projectId', project_id,
        'projectName', project_name,
        'clientName', client_name,
        'projectStatus', project_status,
        'transactionCount', transaction_count,
        'totalExpense', total_expense,
        'latestExpenseDate', latest_expense_date
      ) order by
        case project_status when 'selesai' then 0 when 'aktif' then 1 when 'tertunda' then 2 else 3 end,
        total_expense desc,
        project_name
      )
      from project_expense_totals
    ), '[]'::jsonb)
  )
  from project_summary
  cross join expense_summary
  cross join attendance_summary;
$$;

revoke all on function public.get_dashboard_summary(date, date) from public, anon, authenticated;
grant execute on function public.get_dashboard_summary(date, date) to service_role;
