-- Canonical LOD scoring, completeness metadata, and transactional assessment persistence.
-- Existing assessment scores are preserved. Run public.audit_lod_assessment_scores()
-- before explicitly applying public.repair_lod_assessment_scores(true).

alter table public.lod_assessments
  add column if not exists is_carried_over boolean not null default false,
  add column if not exists is_dropped boolean not null default false,
  add column if not exists assessed_by bigint references public.users(id) on delete set null,
  add column if not exists assessor_name text,
  add column if not exists is_complete boolean not null default false,
  add column if not exists answered_question_count integer not null default 0,
  add column if not exists required_question_count integer not null default 0,
  add column if not exists manual_override_reason text;

alter table public.lod_answers
  add column if not exists remarks text,
  add column if not exists actual_value numeric,
  add column if not exists total_value numeric,
  add column if not exists specific_answer_value text;

-- The original seed used integer-only gaps (20 then 21) even though LOD scores
-- are decimal. Normalize only the untouched default configuration.
do $$
begin
  if (
    select count(*) = 5
      and bool_and(
        (level = 1 and min_score = 0 and max_score = 20)
        or (level = 2 and min_score = 21 and max_score = 40)
        or (level = 3 and min_score = 41 and max_score = 60)
        or (level = 4 and min_score = 61 and max_score = 80)
        or (level = 5 and min_score = 81 and max_score = 100)
      )
    from public.lod_level_configs
    where level between 1 and 5
  ) then
    update public.lod_level_configs
    set min_score = case level
      when 1 then 0
      when 2 then 20
      when 3 then 40
      when 4 then 60
      when 5 then 80
      else min_score
    end,
    updated_at = now()
    where level between 1 and 5;
  end if;
end;
$$;

create or replace function public.resolve_lod_level(p_score numeric)
returns integer
language sql
stable
as $$
  select coalesce(
    (
      select config.level
      from public.lod_level_configs config
      where config.level between 1 and 5
        and p_score <= config.max_score
      order by config.max_score asc, config.level asc
      limit 1
    ),
    (
      select config.level
      from public.lod_level_configs config
      where config.level between 1 and 5
      order by config.max_score desc, config.level desc
      limit 1
    )
  );
$$;

create or replace function public.calculate_lod_assessment(p_assessment_id integer)
returns table (
  total_score numeric,
  computed_level integer,
  is_complete boolean,
  answered_question_count integer,
  required_question_count integer
)
language sql
stable
as $$
  with question_config as (
    select
      question.id as question_id,
      question.section_id,
      greatest(coalesce(section.weight, 0), 0)::numeric as section_weight,
      max(greatest(coalesce(choice.points, 0), 0))::numeric as max_choice_points
    from public.lod_questions question
    join public.lod_sections section on section.id = question.section_id
    join public.lod_choices choice on choice.question_id = question.id
    group by question.id, question.section_id, section.weight
    having max(greatest(coalesce(choice.points, 0), 0)) > 0
      and greatest(coalesce(section.weight, 0), 0) > 0
  ),
  valid_answers as (
    select
      config.question_id,
      config.section_id,
      greatest(coalesce(choice.points, 0), 0)::numeric as earned_points
    from question_config config
    join public.lod_answers answer
      on answer.assessment_id = p_assessment_id
      and answer.question_id = config.question_id
    join public.lod_choices choice
      on choice.id = answer.choice_id
      and choice.question_id = config.question_id
  ),
  section_rollup as (
    select
      config.section_id,
      max(config.section_weight)::numeric as section_weight,
      count(config.question_id)::integer as required_questions,
      count(answer.question_id)::integer as answered_questions,
      coalesce(sum(answer.earned_points), 0)::numeric as earned_points,
      coalesce(sum(config.max_choice_points) filter (where answer.question_id is not null), 0)::numeric as possible_points
    from question_config config
    left join valid_answers answer on answer.question_id = config.question_id
    group by config.section_id
  ),
  totals as (
    select
      coalesce(sum(section_weight), 0)::numeric as configured_weight,
      coalesce(sum(section_weight) filter (where answered_questions > 0), 0)::numeric as answered_section_weight,
      coalesce(sum(
        case
          when answered_questions > 0 and possible_points > 0
            then (earned_points / possible_points) * section_weight
          else 0
        end
      ), 0)::numeric as earned_weighted_score,
      coalesce(sum(answered_questions), 0)::integer as answered_count,
      coalesce(sum(required_questions), 0)::integer as required_count
    from section_rollup
  ),
  score as (
    select
      case
        when configured_weight > 0 and answered_section_weight > 0
          then (earned_weighted_score / answered_section_weight) * configured_weight
        else 0
      end::numeric as score_value,
      (required_count > 0 and answered_count = required_count) as complete_value,
      answered_count,
      required_count
    from totals
  )
  select
    score_value,
    case when complete_value then public.resolve_lod_level(score_value) else null end,
    complete_value,
    answered_count,
    required_count
  from score;
$$;

-- Coverage backfill is safe and does not modify historical scores or levels.
with calculations as (
  select assessment.id, calculation.*
  from public.lod_assessments assessment
  cross join lateral public.calculate_lod_assessment(assessment.id) calculation
)
update public.lod_assessments assessment
set
  is_complete = calculation.is_complete,
  answered_question_count = calculation.answered_question_count,
  required_question_count = calculation.required_question_count
from calculations calculation
where calculation.id = assessment.id;

update public.lod_assessments
set manual_override_reason = 'Legacy manual override (reason not recorded)'
where manual_level is not null
  and nullif(trim(manual_override_reason), '') is null;

create or replace function public.audit_lod_assessment_scores()
returns table (
  assessment_id integer,
  ipo_id integer,
  assessment_year integer,
  current_total_score numeric,
  recalculated_total_score numeric,
  current_computed_level integer,
  recalculated_computed_level integer,
  current_is_complete boolean,
  recalculated_is_complete boolean,
  answered_question_count integer,
  required_question_count integer,
  has_manual_override boolean,
  is_dropped boolean,
  needs_repair boolean
)
language sql
stable
as $$
  select
    assessment.id,
    assessment.ipo_id,
    assessment.year,
    assessment.total_score,
    calculation.total_score,
    assessment.computed_level,
    calculation.computed_level,
    assessment.is_complete,
    calculation.is_complete,
    calculation.answered_question_count,
    calculation.required_question_count,
    assessment.manual_level is not null,
    assessment.is_dropped,
    (
      abs(coalesce(assessment.total_score, 0) - coalesce(calculation.total_score, 0)) > 0.0001
      or coalesce(assessment.computed_level, 0) <> coalesce(calculation.computed_level, 0)
      or assessment.is_complete is distinct from calculation.is_complete
      or assessment.answered_question_count <> calculation.answered_question_count
      or assessment.required_question_count <> calculation.required_question_count
    )
  from public.lod_assessments assessment
  cross join lateral public.calculate_lod_assessment(assessment.id) calculation
  order by assessment.year desc, assessment.ipo_id;
$$;

create or replace function public.repair_lod_assessment_scores(p_apply boolean default false)
returns table (
  assessment_id integer,
  ipo_id integer,
  assessment_year integer,
  current_total_score numeric,
  recalculated_total_score numeric,
  current_computed_level integer,
  recalculated_computed_level integer,
  current_is_complete boolean,
  recalculated_is_complete boolean,
  answered_question_count integer,
  required_question_count integer,
  has_manual_override boolean,
  is_dropped boolean,
  needs_repair boolean
)
language plpgsql
as $$
begin
  if p_apply then
    update public.lod_answers answer
    set
      points_earned = greatest(coalesce(choice.points, 0), 0),
      updated_at = now()
    from public.lod_choices choice
    where choice.id = answer.choice_id
      and choice.question_id = answer.question_id;

    with calculations as (
      select assessment.id, calculation.*
      from public.lod_assessments assessment
      cross join lateral public.calculate_lod_assessment(assessment.id) calculation
    )
    update public.lod_assessments assessment
    set
      total_score = calculation.total_score,
      computed_level = coalesce(calculation.computed_level, 0),
      is_complete = calculation.is_complete,
      answered_question_count = calculation.answered_question_count,
      required_question_count = calculation.required_question_count,
      updated_at = now()
    from calculations calculation
    where calculation.id = assessment.id;
  end if;

  return query select * from public.audit_lod_assessment_scores();
end;
$$;

create or replace function public.save_lod_assessment(
  p_ipo_id integer,
  p_year integer,
  p_answers jsonb default '[]'::jsonb,
  p_manual_level integer default null,
  p_manual_override_reason text default null,
  p_is_carried_over boolean default false,
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
  v_answer jsonb;
  v_question_id integer;
  v_choice_id integer;
  v_choice_points numeric;
  v_calculation record;
begin
  if p_year < 1900 or p_year > 2200 then
    raise exception 'Invalid assessment year.';
  end if;
  if p_manual_level is not null and (p_manual_level < 1 or p_manual_level > 5) then
    raise exception 'Manual level must be between 1 and 5.';
  end if;
  if p_manual_level is not null and nullif(trim(p_manual_override_reason), '') is null then
    raise exception 'A reason is required for a manual level override.';
  end if;
  if jsonb_typeof(coalesce(p_answers, '[]'::jsonb)) <> 'array' then
    raise exception 'LOD answers must be a JSON array.';
  end if;

  insert into public.lod_assessments (
    ipo_id,
    year,
    total_score,
    computed_level,
    manual_level,
    manual_override_reason,
    is_carried_over,
    is_dropped,
    remarks,
    assessed_by,
    assessor_name,
    updated_at
  )
  values (
    p_ipo_id,
    p_year,
    0,
    0,
    p_manual_level,
    case when p_manual_level is null then null else trim(p_manual_override_reason) end,
    coalesce(p_is_carried_over, false),
    coalesce(p_is_dropped, false),
    p_remarks,
    p_assessed_by,
    p_assessor_name,
    now()
  )
  on conflict (ipo_id, year) do update
  set
    manual_level = excluded.manual_level,
    manual_override_reason = excluded.manual_override_reason,
    is_carried_over = excluded.is_carried_over,
    is_dropped = excluded.is_dropped,
    remarks = excluded.remarks,
    assessed_by = excluded.assessed_by,
    assessor_name = excluded.assessor_name,
    updated_at = now()
  returning * into v_assessment;

  delete from public.lod_answers existing
  where existing.assessment_id = v_assessment.id
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) incoming
      where (incoming->>'question_id')::integer = existing.question_id
        and incoming->>'choice_id' is not null
    );

  for v_answer in
    select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    v_question_id := nullif(v_answer->>'question_id', '')::integer;
    v_choice_id := nullif(v_answer->>'choice_id', '')::integer;
    if v_question_id is null or v_choice_id is null then
      raise exception 'Every saved LOD answer requires a question and choice.';
    end if;

    select greatest(coalesce(choice.points, 0), 0)
    into v_choice_points
    from public.lod_choices choice
    where choice.id = v_choice_id
      and choice.question_id = v_question_id;

    if not found then
      raise exception 'Choice % is not valid for question %.', v_choice_id, v_question_id;
    end if;

    insert into public.lod_answers (
      assessment_id,
      question_id,
      choice_id,
      points_earned,
      remarks,
      actual_value,
      total_value,
      specific_answer_value,
      updated_at
    )
    values (
      v_assessment.id,
      v_question_id,
      v_choice_id,
      v_choice_points,
      nullif(v_answer->>'remarks', ''),
      nullif(v_answer->>'actual_value', '')::numeric,
      nullif(v_answer->>'total_value', '')::numeric,
      nullif(v_answer->>'specific_answer_value', ''),
      now()
    )
    on conflict (assessment_id, question_id) do update
    set
      choice_id = excluded.choice_id,
      points_earned = excluded.points_earned,
      remarks = excluded.remarks,
      actual_value = excluded.actual_value,
      total_value = excluded.total_value,
      specific_answer_value = excluded.specific_answer_value,
      updated_at = now();
  end loop;

  select * into v_calculation
  from public.calculate_lod_assessment(v_assessment.id);

  update public.lod_assessments
  set
    total_score = v_calculation.total_score,
    computed_level = coalesce(v_calculation.computed_level, 0),
    is_complete = v_calculation.is_complete,
    answered_question_count = v_calculation.answered_question_count,
    required_question_count = v_calculation.required_question_count,
    updated_at = now()
  where id = v_assessment.id
  returning * into v_assessment;

  return v_assessment;
end;
$$;

grant execute on function public.resolve_lod_level(numeric) to anon, authenticated;
grant execute on function public.calculate_lod_assessment(integer) to anon, authenticated;
grant execute on function public.audit_lod_assessment_scores() to anon, authenticated;
grant execute on function public.repair_lod_assessment_scores(boolean) to authenticated;
grant execute on function public.save_lod_assessment(integer, integer, jsonb, integer, text, boolean, boolean, text, bigint, text) to anon, authenticated;
