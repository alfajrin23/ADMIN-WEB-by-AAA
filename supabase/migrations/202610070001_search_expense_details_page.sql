create or replace function public.search_expense_details_page(
  p_search_text text default '',
  p_from date default null,
  p_to date default null,
  p_category text default null,
  p_project_id text default null,
  p_client text default null,
  p_date date default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with matching as (
    select
      e.id as expense_id,
      e.project_id,
      p.name as project_name,
      p.client_name,
      e.expense_date,
      e.requester_name,
      e.description,
      e.usage_info,
      e.recipient_name,
      e.category,
      e.amount,
      e.created_at
    from public.project_expenses e
    join public.projects p on p.id = e.project_id
    where (p_from is null or e.expense_date >= p_from)
      and (p_to is null or e.expense_date <= p_to)
      and (p_date is null or e.expense_date = p_date)
      and (p_category is null or e.category = p_category)
      and (p_project_id is null or e.project_id::text = p_project_id)
      and (
        p_client is null
        or lower(coalesce(nullif(trim(p.client_name), ''), 'Tanpa Klien')) = lower(trim(p_client))
      )
      and (
        nullif(trim(p_search_text), '') is null
        or concat_ws(' ',
          p.name,
          p.code,
          p.client_name,
          e.requester_name,
          e.description,
          e.usage_info,
          e.recipient_name,
          e.category,
          e.expense_date::text,
          to_char(e.expense_date, 'DD/MM/YYYY'),
          to_char(e.expense_date, 'DD-MM-YYYY'),
          e.amount::text
        ) ilike (
          '%' || replace(replace(replace(trim(p_search_text), '!', '!!'), '%', '!%'), '_', '!_') || '%'
        ) escape '!'
        or (
          select bool_and(concat_ws(' ',
            p.name,
            p.code,
            p.client_name,
            e.requester_name,
            e.description,
            e.usage_info,
            e.recipient_name,
            e.category,
            e.expense_date::text,
            to_char(e.expense_date, 'DD/MM/YYYY'),
            to_char(e.expense_date, 'DD-MM-YYYY'),
            e.amount::text
          ) ilike '%' || replace(replace(replace(term, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!')
          from unnest(regexp_split_to_array(trim(p_search_text), '\s+')) as terms(term)
        )
        or (
          nullif(regexp_replace(p_search_text, '[^0-9]', '', 'g'), '') is not null
          and abs(e.amount)::text like '%' || regexp_replace(p_search_text, '[^0-9]', '', 'g') || '%'
        )
      )
  ),
  stats as (
    select
      count(*)::bigint as total_count,
      count(distinct project_id)::bigint as total_projects,
      coalesce(sum(amount), 0)::numeric as total_amount
    from matching
  ),
  page_rows as (
    select *
    from matching
    order by expense_date desc, created_at desc, expense_id::text desc
    offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 20), 1), 50)
    limit least(greatest(coalesce(p_page_size, 20), 1), 50)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'expense_id', expense_id,
        'project_id', project_id,
        'project_name', project_name,
        'client_name', client_name,
        'expense_date', expense_date,
        'requester_name', requester_name,
        'description', description,
        'usage_info', usage_info,
        'recipient_name', recipient_name,
        'category', category,
        'amount', amount
      ) order by expense_date desc, created_at desc, expense_id::text desc)
      from page_rows
    ), '[]'::jsonb),
    'totalCount', stats.total_count,
    'totalProjects', stats.total_projects,
    'totalAmount', stats.total_amount
  )
  from stats;
$$;

revoke all on function public.search_expense_details_page(text, date, date, text, text, text, date, integer, integer) from public, anon, authenticated;
grant execute on function public.search_expense_details_page(text, date, date, text, text, text, date, integer, integer) to service_role;
