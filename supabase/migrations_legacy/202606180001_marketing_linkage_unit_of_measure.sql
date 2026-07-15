-- Backfill nested marketing linkage unit of measure values.
-- Marketing linkages are stored as JSON entries under marketing_partners."marketingLinkages".
-- Existing records should behave as KG unless a different unit is selected later.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketing_partners'
      and column_name = 'marketingLinkages'
  ) then
    update public.marketing_partners
    set "marketingLinkages" = coalesce((
      select jsonb_agg(
        case
          when linkage ? 'unitOfMeasure' and nullif(trim(linkage ->> 'unitOfMeasure'), '') is not null then linkage
          else coalesce(linkage, '{}'::jsonb) || jsonb_build_object('unitOfMeasure', 'KG')
        end
        order by ordinality
      )
      from jsonb_array_elements(coalesce(to_jsonb("marketingLinkages"), '[]'::jsonb)) with ordinality as items(linkage, ordinality)
    ), '[]'::jsonb)
    where "marketingLinkages" is not null;
  end if;
end $$;
