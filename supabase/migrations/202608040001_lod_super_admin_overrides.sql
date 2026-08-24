-- Secure, answer-preserving LOD list overrides for Super Admin users.
-- Existing questionnaire answers, computed scores, carry-over, and dropped state are not changed.

create or replace function public.save_lod_manual_overrides(
  p_rows jsonb,
  p_actor_id bigint,
  p_actor_name text,
  p_source text
)
returns setof public.lod_assessments
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  row_ipo_id integer;
  row_year integer;
  row_manual integer;
  row_reason text;
  version_id bigint;
  previous_assessment public.lod_assessments%rowtype;
  saved_assessment public.lod_assessments%rowtype;
  actor public.users%rowtype;
  ipo_name text;
  previous_level integer;
  previous_state text;
begin
  select * into actor from public.users where id = p_actor_id;
  if actor.id is null or actor.role <> 'Super Admin' then
    raise exception 'Only Super Admin users can apply LOD list overrides.';
  end if;
  if p_source not in ('lod_list_bulk', 'lod_list_inline') then
    raise exception 'Invalid LOD override source.';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one LOD override row is required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) row_item
    group by (row_item->>'ipo_id')::integer, (row_item->>'year')::integer having count(*) > 1
  ) then
    raise exception 'The override contains duplicate IPO/year rows.';
  end if;

  -- Validate the entire request before changing any assessment.
  for row_data in select value from jsonb_array_elements(p_rows) loop
    row_ipo_id := nullif(row_data->>'ipo_id', '')::integer;
    row_year := nullif(row_data->>'year', '')::integer;
    row_manual := nullif(row_data->>'manual_level', '')::integer;
    row_reason := nullif(trim(row_data->>'manual_override_reason'), '');
    if row_ipo_id is null or not exists (select 1 from public.ipos where id = row_ipo_id) then
      raise exception 'Invalid IPO id in override.';
    end if;
    if row_year is null or row_year < 1900 or row_year > 2200 then
      raise exception 'Invalid assessment year in override.';
    end if;
    if row_manual is null or row_manual < 1 or row_manual > 5 or row_reason is null then
      raise exception 'Every override requires Level 1-5 and a reason.';
    end if;
  end loop;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    row_ipo_id := (row_data->>'ipo_id')::integer;
    row_year := (row_data->>'year')::integer;
    row_manual := (row_data->>'manual_level')::integer;
    row_reason := trim(row_data->>'manual_override_reason');

    select * into previous_assessment
    from public.lod_assessments where ipo_id = row_ipo_id and year = row_year;
    select name into ipo_name from public.ipos where id = row_ipo_id;
    previous_level := case
      when previous_assessment.is_dropped then null
      when previous_assessment.manual_level between 1 and 5 then previous_assessment.manual_level
      when previous_assessment.is_complete and previous_assessment.computed_level between 1 and 5 then previous_assessment.computed_level
      when previous_assessment.is_carried_over and previous_assessment.carried_over_level between 1 and 5 then previous_assessment.carried_over_level
      else null
    end;
    previous_state := case
      when previous_assessment.id is null then 'For Assessment'
      when previous_assessment.is_dropped then 'Dropped'
      when previous_level is not null then format('Level %s', previous_level)
      when coalesce(previous_assessment.answered_question_count, 0) > 0 then 'Incomplete'
      else 'For Assessment'
    end;

    select id into version_id from public.lod_questionnaire_versions
    where effective_year <= row_year order by effective_year desc, version_number desc limit 1;
    if version_id is null then raise exception 'No questionnaire version is available for %.', row_year; end if;

    insert into public.lod_assessments (
      ipo_id, year, total_score, computed_level, manual_level, manual_override_reason,
      questionnaire_version_id, is_dropped, is_complete, answered_question_count,
      required_question_count, assessed_by, assessor_name, updated_at
    ) values (
      row_ipo_id, row_year, 0, 0, row_manual, row_reason, version_id,
      false, false, 0, 0, p_actor_id, coalesce(nullif(trim(p_actor_name), ''), actor."fullName"), now()
    )
    on conflict (ipo_id, year) do update set
      manual_level = excluded.manual_level,
      manual_override_reason = excluded.manual_override_reason,
      assessed_by = excluded.assessed_by,
      assessor_name = excluded.assessor_name,
      updated_at = now()
    returning * into saved_assessment;

    insert into public.user_logs (
      description, username, operating_unit, user_role, created_at,
      entity_type, entity_id, action_metadata
    ) values (
      format('Manual LOD override: %s / %s / Level %s', ipo_name, row_year, row_manual),
      actor.username, actor."operatingUnit", actor.role, now(), 'LOD Assessment', saved_assessment.id::text,
      jsonb_build_object(
        'ipo_id', row_ipo_id, 'ipo_name', ipo_name, 'assessment_year', row_year,
        'previous_level', previous_level, 'previous_state', previous_state,
        'new_manual_level', row_manual, 'override_reason', row_reason,
        'actor_id', actor.id, 'actor_name', coalesce(nullif(trim(p_actor_name), ''), actor."fullName"),
        'actor_role', actor.role, 'source', p_source, 'server_timestamp', now()
      )
    );

    return next saved_assessment;
  end loop;
end;
$$;

revoke all on function public.save_lod_manual_overrides(jsonb, bigint, text, text) from public;
grant execute on function public.save_lod_manual_overrides(jsonb, bigint, text, text) to authenticated, anon;
