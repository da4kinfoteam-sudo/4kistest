-- Canonical LOD state precedence and verified Super Admin state changes.
-- Existing assessments and answers are preserved. Provisional manual/carry-over
-- fields are retired only when a questionnaire is subsequently saved complete.

create or replace function public.get_lod_effective_level(p_assessment public.lod_assessments)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(p_assessment.is_dropped, false) then null
    when coalesce(p_assessment.is_complete, false) and p_assessment.computed_level between 1 and 5 then p_assessment.computed_level
    when p_assessment.manual_level between 1 and 5 then p_assessment.manual_level
    when coalesce(p_assessment.is_carried_over, false) and p_assessment.carried_over_level between 1 and 5 then p_assessment.carried_over_level
    else null
  end;
$$;

create or replace function public.save_lod_assessment(
  p_ipo_id integer,
  p_year integer,
  p_answers jsonb default '[]'::jsonb,
  p_manual_level integer default null,
  p_manual_override_reason text default null,
  p_is_carried_over boolean default false,
  p_carried_over_from_assessment_id integer default null,
  p_is_dropped boolean default false,
  p_remarks text default null,
  p_assessed_by bigint default null,
  p_assessor_name text default null
)
returns public.lod_assessments
language plpgsql
as $$
declare
  v_assessment public.lod_assessments%rowtype;
  v_existing public.lod_assessments%rowtype;
  v_source public.lod_assessments%rowtype;
  v_version_id bigint;
  v_version_config jsonb;
  v_answer jsonb;
  v_question_id integer;
  v_choice_id integer;
  v_choice_points numeric;
  v_calculation record;
  v_source_level integer;
begin
  if p_year < 1900 or p_year > 2200 then raise exception 'Invalid assessment year.'; end if;
  if p_manual_level is not null and (p_manual_level < 1 or p_manual_level > 5) then raise exception 'Manual level must be between 1 and 5.'; end if;
  if p_manual_level is not null and nullif(trim(p_manual_override_reason), '') is null then raise exception 'A reason is required for a manual level override.'; end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then raise exception 'LOD answers must be a JSON array.'; end if;

  select * into v_existing from public.lod_assessments where ipo_id = p_ipo_id and year = p_year;
  v_version_id := v_existing.questionnaire_version_id;
  if v_version_id is null then
    select id into v_version_id from public.lod_questionnaire_versions
    where effective_year <= p_year order by effective_year desc, version_number desc limit 1;
  end if;
  if v_version_id is null then raise exception 'No LOD questionnaire version is available for year %.', p_year; end if;
  select config into v_version_config from public.lod_questionnaire_versions where id = v_version_id;

  if coalesce(p_is_carried_over, false) then
    if p_carried_over_from_assessment_id is null then raise exception 'Select a valid earlier assessment to carry over.'; end if;
    select * into v_source from public.lod_assessments where id = p_carried_over_from_assessment_id;
    v_source_level := public.get_lod_effective_level(v_source);
    if not found or v_source.ipo_id <> p_ipo_id or v_source.year >= p_year or v_source_level is null then
      raise exception 'The selected carry-over source is not a valid earlier published assessment.';
    end if;
  else
    v_source_level := null;
  end if;

  insert into public.lod_assessments (
    ipo_id, year, total_score, computed_level, manual_level, manual_override_reason,
    is_carried_over, carried_over_from_assessment_id, carried_over_from_year, carried_over_level,
    carried_over_total_score, questionnaire_version_id, is_dropped, remarks, assessed_by, assessor_name, updated_at
  ) values (
    p_ipo_id, p_year, 0, 0, p_manual_level,
    case when p_manual_level is null then null else trim(p_manual_override_reason) end,
    coalesce(p_is_carried_over, false), case when p_is_carried_over then v_source.id else null end,
    case when p_is_carried_over then v_source.year else null end, case when p_is_carried_over then v_source_level else null end,
    case when p_is_carried_over then v_source.total_score else null end, v_version_id,
    coalesce(p_is_dropped, false), p_remarks, p_assessed_by, p_assessor_name, now()
  )
  on conflict (ipo_id, year) do update set
    manual_level = excluded.manual_level,
    manual_override_reason = excluded.manual_override_reason,
    is_carried_over = excluded.is_carried_over,
    carried_over_from_assessment_id = excluded.carried_over_from_assessment_id,
    carried_over_from_year = excluded.carried_over_from_year,
    carried_over_level = excluded.carried_over_level,
    carried_over_total_score = excluded.carried_over_total_score,
    questionnaire_version_id = coalesce(public.lod_assessments.questionnaire_version_id, excluded.questionnaire_version_id),
    is_dropped = excluded.is_dropped,
    remarks = excluded.remarks,
    assessed_by = excluded.assessed_by,
    assessor_name = excluded.assessor_name,
    updated_at = now()
  returning * into v_assessment;

  delete from public.lod_answers existing
  where existing.assessment_id = v_assessment.id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) incoming
      where (incoming->>'question_id')::integer = existing.question_id and incoming->>'choice_id' is not null
    );

  for v_answer in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    v_question_id := nullif(v_answer->>'question_id', '')::integer;
    v_choice_id := nullif(v_answer->>'choice_id', '')::integer;
    if v_question_id is null or v_choice_id is null then raise exception 'Every saved LOD answer requires a question and choice.'; end if;
    select greatest(coalesce((choice->>'points')::numeric, 0), 0) into v_choice_points
    from jsonb_array_elements(coalesce(v_version_config->'choices', '[]'::jsonb)) choice
    where (choice->>'id')::integer = v_choice_id and (choice->>'question_id')::integer = v_question_id;
    if not found then raise exception 'Choice % is not valid for question % in this assessment version.', v_choice_id, v_question_id; end if;

    insert into public.lod_answers (assessment_id, question_id, choice_id, points_earned, remarks, actual_value, total_value, specific_answer_value, updated_at)
    values (v_assessment.id, v_question_id, v_choice_id, v_choice_points, nullif(v_answer->>'remarks', ''),
      nullif(v_answer->>'actual_value', '')::numeric, nullif(v_answer->>'total_value', '')::numeric,
      nullif(v_answer->>'specific_answer_value', ''), now())
    on conflict (assessment_id, question_id) do update set
      choice_id = excluded.choice_id, points_earned = excluded.points_earned, remarks = excluded.remarks,
      actual_value = excluded.actual_value, total_value = excluded.total_value,
      specific_answer_value = excluded.specific_answer_value, updated_at = now();
  end loop;

  select * into v_calculation from public.calculate_lod_assessment(v_assessment.id);
  update public.lod_assessments
  set total_score = v_calculation.total_score,
      computed_level = coalesce(v_calculation.computed_level, 0),
      is_complete = v_calculation.is_complete,
      answered_question_count = v_calculation.answered_question_count,
      required_question_count = v_calculation.required_question_count,
      manual_level = case when v_calculation.is_complete then null else manual_level end,
      manual_override_reason = case when v_calculation.is_complete then null else manual_override_reason end,
      is_carried_over = case when v_calculation.is_complete then false else is_carried_over end,
      carried_over_from_assessment_id = case when v_calculation.is_complete then null else carried_over_from_assessment_id end,
      carried_over_from_year = case when v_calculation.is_complete then null else carried_over_from_year end,
      carried_over_level = case when v_calculation.is_complete then null else carried_over_level end,
      carried_over_total_score = case when v_calculation.is_complete then null else carried_over_total_score end,
      updated_at = now()
  where id = v_assessment.id
  returning * into v_assessment;
  return v_assessment;
end;
$$;

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
  row_action text;
  row_manual integer;
  row_reason text;
  version_id bigint;
  version_config jsonb;
  required_count integer;
  previous_assessment public.lod_assessments%rowtype;
  source_assessment public.lod_assessments%rowtype;
  saved_assessment public.lod_assessments%rowtype;
  actor public.users%rowtype;
  ipo_name text;
  previous_level integer;
  previous_state text;
  source_level integer;
  new_state text;
begin
  select * into actor from public.users where id = p_actor_id;
  if actor.id is null or actor.role <> 'Super Admin' then
    raise exception 'Only Super Admin users can apply LOD list changes.';
  end if;
  if p_source not in ('lod_list_bulk', 'lod_list_inline') then raise exception 'Invalid LOD override source.'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one LOD state row is required.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) row_item
    group by (row_item->>'ipo_id')::integer, (row_item->>'year')::integer having count(*) > 1
  ) then raise exception 'The request contains duplicate IPO/year rows.'; end if;

  -- Validate every row and carry-over source before changing any data.
  for row_data in select value from jsonb_array_elements(p_rows) loop
    row_ipo_id := nullif(row_data->>'ipo_id', '')::integer;
    row_year := nullif(row_data->>'year', '')::integer;
    row_manual := nullif(row_data->>'manual_level', '')::integer;
    row_action := coalesce(nullif(row_data->>'action', ''), case when row_manual is not null then 'manual' else null end);
    row_reason := nullif(trim(row_data->>'manual_override_reason'), '');
    if row_ipo_id is null or not exists (select 1 from public.ipos where id = row_ipo_id) then raise exception 'Invalid IPO id in LOD state request.'; end if;
    if row_year is null or row_year < 1900 or row_year > 2200 then raise exception 'Invalid assessment year in LOD state request.'; end if;
    if row_action is null or row_action not in ('manual', 'carry-over', 'dropped') then raise exception 'Select Level 1-5, Carry Over, or Dropped.'; end if;
    if row_reason is null then raise exception 'Every LOD administrative change requires a reason.'; end if;
    if row_action = 'manual' and (row_manual is null or row_manual < 1 or row_manual > 5) then raise exception 'Manual LOD state requires Level 1-5.'; end if;

    select * into previous_assessment from public.lod_assessments where ipo_id = row_ipo_id and year = row_year;
    if row_action in ('manual', 'carry-over')
       and coalesce(previous_assessment.is_complete, false)
       and previous_assessment.computed_level between 1 and 5 then
      raise exception 'IPO % already has a completed computed assessment for %. Its computed level is authoritative.', row_ipo_id, row_year;
    end if;
    if row_action = 'carry-over' and not exists (
      select 1 from public.lod_assessments candidate
      where candidate.ipo_id = row_ipo_id and candidate.year < row_year
        and not coalesce(candidate.is_dropped, false)
        and public.get_lod_effective_level(candidate) between 1 and 5
    ) then raise exception 'IPO % has no valid earlier LOD assessment to carry into %.', row_ipo_id, row_year; end if;
    if not exists (
      select 1 from public.lod_questionnaire_versions version where version.effective_year <= row_year
    ) then raise exception 'No questionnaire version is available for %.', row_year; end if;
  end loop;

  for row_data in select value from jsonb_array_elements(p_rows) loop
    row_ipo_id := (row_data->>'ipo_id')::integer;
    row_year := (row_data->>'year')::integer;
    row_manual := nullif(row_data->>'manual_level', '')::integer;
    row_action := coalesce(nullif(row_data->>'action', ''), case when row_manual is not null then 'manual' else null end);
    row_reason := trim(row_data->>'manual_override_reason');

    select * into previous_assessment from public.lod_assessments where ipo_id = row_ipo_id and year = row_year for update;
    select name into ipo_name from public.ipos where id = row_ipo_id;
    previous_level := public.get_lod_effective_level(previous_assessment);
    previous_state := case
      when previous_assessment.id is null then 'For Assessment'
      when previous_assessment.is_dropped then 'Dropped'
      when previous_level is not null then format('Level %s', previous_level)
      when coalesce(previous_assessment.answered_question_count, 0) > 0 then 'Incomplete'
      else 'For Assessment'
    end;

    select id, config into version_id, version_config from public.lod_questionnaire_versions
    where effective_year <= row_year order by effective_year desc, version_number desc limit 1;
    required_count := jsonb_array_length(coalesce(version_config->'questions', '[]'::jsonb));
    source_assessment := null;
    source_level := null;
    if row_action = 'carry-over' then
      select candidate.* into source_assessment from public.lod_assessments candidate
      where candidate.ipo_id = row_ipo_id and candidate.year < row_year
        and not coalesce(candidate.is_dropped, false)
        and public.get_lod_effective_level(candidate) between 1 and 5
      order by candidate.year desc, candidate.id desc limit 1;
      source_level := public.get_lod_effective_level(source_assessment);
    end if;

    insert into public.lod_assessments (
      ipo_id, year, total_score, computed_level, manual_level, manual_override_reason,
      is_carried_over, carried_over_from_assessment_id, carried_over_from_year, carried_over_level,
      carried_over_total_score, questionnaire_version_id, is_dropped, is_complete,
      answered_question_count, required_question_count, assessed_by, assessor_name, updated_at
    ) values (
      row_ipo_id, row_year, 0, 0,
      case when row_action = 'manual' then row_manual else null end,
      case when row_action = 'manual' then row_reason else null end,
      row_action = 'carry-over', case when row_action = 'carry-over' then source_assessment.id else null end,
      case when row_action = 'carry-over' then source_assessment.year else null end,
      case when row_action = 'carry-over' then source_level else null end,
      case when row_action = 'carry-over' then source_assessment.total_score else null end,
      version_id, row_action = 'dropped', false, 0, required_count,
      p_actor_id, coalesce(nullif(trim(p_actor_name), ''), actor."fullName"), now()
    )
    on conflict (ipo_id, year) do update set
      manual_level = case when row_action = 'manual' then row_manual else null end,
      manual_override_reason = case when row_action = 'manual' then row_reason else null end,
      is_carried_over = row_action = 'carry-over',
      carried_over_from_assessment_id = case when row_action = 'carry-over' then source_assessment.id else null end,
      carried_over_from_year = case when row_action = 'carry-over' then source_assessment.year else null end,
      carried_over_level = case when row_action = 'carry-over' then source_level else null end,
      carried_over_total_score = case when row_action = 'carry-over' then source_assessment.total_score else null end,
      is_dropped = row_action = 'dropped',
      assessed_by = excluded.assessed_by,
      assessor_name = excluded.assessor_name,
      updated_at = now()
    returning * into saved_assessment;

    new_state := case
      when row_action = 'dropped' then 'Dropped'
      when row_action = 'carry-over' then format('Level %s (Carry Over)', source_level)
      else format('Level %s (Manual)', row_manual)
    end;
    insert into public.user_logs (
      description, username, operating_unit, user_role, created_at,
      entity_type, entity_id, action_metadata
    ) values (
      format('LOD administrative state: %s / %s / %s', ipo_name, row_year, new_state),
      actor.username, actor."operatingUnit", actor.role, now(), 'LOD Assessment', saved_assessment.id::text,
      jsonb_build_object(
        'ipo_id', row_ipo_id, 'ipo_name', ipo_name, 'assessment_year', row_year,
        'previous_level', previous_level, 'previous_state', previous_state,
        'action', row_action, 'new_state', new_state, 'new_manual_level', row_manual,
        'carried_over_from_assessment_id', source_assessment.id,
        'carried_over_from_year', source_assessment.year, 'carried_over_level', source_level,
        'override_reason', row_reason, 'actor_id', actor.id,
        'actor_name', coalesce(nullif(trim(p_actor_name), ''), actor."fullName"),
        'actor_role', actor.role, 'source', p_source, 'server_timestamp', now()
      )
    );
    return next saved_assessment;
  end loop;
end;
$$;

create or replace function public.audit_lod_effective_state_integrity()
returns table (
  issue_code text,
  assessment_id integer,
  ipo_id integer,
  assessment_year integer,
  detail text
)
language sql
security definer
set search_path = public
as $$
  select 'duplicate-ipo-year', min(a.id)::integer, a.ipo_id, a.year,
         format('%s rows exist for this IPO/year.', count(*))
  from public.lod_assessments a
  group by a.ipo_id, a.year having count(*) > 1
  union all
  select 'override-missing-level', a.id, a.ipo_id, a.year,
         'An override reason exists without a valid manual level.'
  from public.lod_assessments a
  where nullif(trim(a.manual_override_reason), '') is not null
    and (a.manual_level is null or a.manual_level not between 1 and 5)
  union all
  select 'carry-over-missing-source', a.id, a.ipo_id, a.year,
         'Carry-over is active but its source metadata is incomplete.'
  from public.lod_assessments a
  where a.is_carried_over and (
    a.carried_over_from_assessment_id is null or a.carried_over_from_year is null
    or a.carried_over_level is null or a.carried_over_level not between 1 and 5
  )
  union all
  select 'complete-invalid-level', a.id, a.ipo_id, a.year,
         'The assessment is complete but has no valid computed level.'
  from public.lod_assessments a
  where a.is_complete and (a.computed_level is null or a.computed_level not between 1 and 5);
$$;

revoke all on function public.save_lod_manual_overrides(jsonb, bigint, text, text) from public;
grant execute on function public.save_lod_manual_overrides(jsonb, bigint, text, text) to authenticated, anon;
grant execute on function public.save_lod_assessment(integer, integer, jsonb, integer, text, boolean, integer, boolean, text, bigint, text) to anon, authenticated;
grant execute on function public.audit_lod_effective_state_integrity() to authenticated;
