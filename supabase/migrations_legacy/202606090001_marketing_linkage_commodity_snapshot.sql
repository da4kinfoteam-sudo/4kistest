-- Add commodity snapshot fields to existing nested marketing linkage JSON entries.
-- New linkages save these values from the selected company commodity need.
-- Existing rows remain visible as Unassigned until edited.

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
        coalesce(linkage, '{}'::jsonb)
        || jsonb_build_object(
          'commodityNeedId', coalesce(linkage -> 'commodityNeedId', 'null'::jsonb),
          'commodityName', coalesce(linkage -> 'commodityName', '""'::jsonb),
          'commodityType', coalesce(linkage -> 'commodityType', '""'::jsonb)
        )
        order by ordinality
      )
      from jsonb_array_elements(coalesce(to_jsonb("marketingLinkages"), '[]'::jsonb)) with ordinality as items(linkage, ordinality)
    ), '[]'::jsonb)
    where "marketingLinkages" is not null;
  end if;
end $$;
