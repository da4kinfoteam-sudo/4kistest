-- Compatibility backfill for the staged activity/IPO dual-read and dual-write rollout.
-- Only empty or malformed legacy ID arrays are populated. Existing non-empty arrays
-- and all legacy display-name snapshots remain untouched.

with relationship_ids as (
  select
    relationship.activity_id,
    jsonb_agg(relationship.ipo_id order by relationship.ipo_id) as ipo_ids
  from public.activity_ipos relationship
  group by relationship.activity_id
)
update public.activities activity
set participating_ipo_ids = relationships.ipo_ids
from relationship_ids relationships
where activity.id = relationships.activity_id
  and (
    jsonb_typeof(coalesce(activity.participating_ipo_ids, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(activity.participating_ipo_ids, '[]'::jsonb)) = 0
  );
