import { IPO } from '../constants';
import { supabase } from '../supabaseClient';
import { normalizeEntityName } from './entityIdentity';

export const resolveSelectedIpoIds = (selectedNames: string[], ipos: IPO[]) => {
  const byName = new Map<string, IPO[]>();
  ipos.forEach(ipo => {
    const key = normalizeEntityName(ipo.name);
    byName.set(key, [...(byName.get(key) || []), ipo]);
  });

  return selectedNames.flatMap(name => {
    const matches = byName.get(normalizeEntityName(name)) || [];
    return matches.length === 1 ? [Number(matches[0].id)] : [];
  });
};

export const replaceActivityIpoRelationships = async (
  activityId: number,
  ipoIds: number[],
  createdBy?: string | null
) => {
  if (!supabase) return;
  const uniqueIds = Array.from(new Set(
    ipoIds.map(Number).filter(id => Number.isFinite(id) && id > 0)
  ));

  // Register every desired relationship before removing stale rows. If the insert
  // fails, the existing relationship set is left intact for legacy reads.
  if (uniqueIds.length > 0) {
    const { error: upsertError } = await supabase
      .from('activity_ipos')
      .upsert(
        uniqueIds.map(ipoId => ({
          activity_id: activityId,
          ipo_id: ipoId,
          created_by: createdBy || null,
        })),
        {
          onConflict: 'activity_id,ipo_id',
          ignoreDuplicates: true,
        }
      );
    if (upsertError) throw upsertError;
  }

  let deleteQuery = supabase
    .from('activity_ipos')
    .delete()
    .eq('activity_id', activityId);
  if (uniqueIds.length > 0) {
    deleteQuery = deleteQuery.not('ipo_id', 'in', `(${uniqueIds.join(',')})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;
};

export const replaceManyActivityIpoRelationships = async (
  activities: Array<{ id: number; ipoIds: number[] }>,
  createdBy?: string | null
) => {
  for (const activity of activities) {
    await replaceActivityIpoRelationships(activity.id, activity.ipoIds, createdBy);
  }
};
