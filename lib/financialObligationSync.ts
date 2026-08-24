import { supabase } from '../supabaseClient';
import type { ActualObligationRecordLike } from './financialObligationUtils';
import {
    assertFinancialObligationIdentity,
    normalizeFinancialObligationItemId,
    replaceAndVerifyFinancialObligationRecords,
} from './financialObligationPersistence';
import type {
    FinancialObligationChange,
    FinancialObligationEntityType,
    FinancialObligationIdentity,
    FinancialObligationPersistence,
    PersistedFinancialObligationRecord,
} from './financialObligationPersistence';

export type {
    FinancialObligationChange,
    FinancialObligationEntityType,
    PersistedFinancialObligationRecord,
} from './financialObligationPersistence';

export const FINANCIAL_OBLIGATIONS_CHANGED_EVENT = '4kis:financial-obligations-changed';

const mapPersistedRows = (rows: any[] = []): PersistedFinancialObligationRecord[] => rows.map(row => ({
    id: Number(row.id),
    itemId: row.item_id === undefined || row.item_id === null || String(row.item_id) === '' ? null : String(row.item_id),
    date: String(row.obligation_date || ''),
    amount: Number(row.amount),
    remarks: String(row.remarks || ''),
}));

export const fetchFinancialObligationsForParent = async ({
    entityType,
    parentId,
}: {
    entityType: FinancialObligationEntityType;
    parentId: number;
}) => {
    if (!supabase) return [] as PersistedFinancialObligationRecord[];
    if (!Number.isInteger(parentId) || parentId <= 0) {
        throw new Error('Cannot load actual obligations because the parent record identity is invalid.');
    }

    const { data, error } = await supabase
        .from('financial_obligations')
        .select('id, obligation_date, amount, remarks, item_id')
        .eq('entity_type', entityType)
        .eq('parent_id', parentId)
        .order('obligation_date', { ascending: true })
        .order('id', { ascending: true });
    if (error) throw error;
    return mapPersistedRows(data || []);
};

export const fetchFinancialObligationRecords = async ({
    entityType,
    parentId,
    itemId,
}: {
    entityType: FinancialObligationEntityType;
    parentId: number;
    itemId?: number | string | null;
}) => {
    if (!supabase) return [] as PersistedFinancialObligationRecord[];

    const normalizedItemId = normalizeFinancialObligationItemId(itemId);
    assertFinancialObligationIdentity({ entityType, parentId, itemId: normalizedItemId });

    let query = supabase
        .from('financial_obligations')
        .select('id, obligation_date, amount, remarks, item_id')
        .eq('entity_type', entityType)
        .eq('parent_id', parentId);

    query = normalizedItemId === null
        ? query.is('item_id', null)
        : query.eq('item_id', normalizedItemId);

    const { data, error } = await query.order('obligation_date', { ascending: true }).order('id', { ascending: true });
    if (error) throw error;
    return mapPersistedRows(data || []);
};

export const replaceFinancialObligationRecords = async ({
    entityType,
    parentId,
    itemId,
    records,
}: {
    entityType: FinancialObligationEntityType;
    parentId: number;
    itemId?: number | string | null;
    records: ActualObligationRecordLike[];
}) => {
    if (!supabase) return [] as PersistedFinancialObligationRecord[];

    const normalizedItemId = normalizeFinancialObligationItemId(itemId);
    const identity: FinancialObligationIdentity = { entityType, parentId, itemId: normalizedItemId };
    const persistence: FinancialObligationPersistence = {
        replaceExact: async (target, normalizedRecords) => {
            let deleteQuery = supabase
                .from('financial_obligations')
                .delete()
                .eq('entity_type', target.entityType)
                .eq('parent_id', target.parentId);

            deleteQuery = target.itemId === null
                ? deleteQuery.is('item_id', null)
                : deleteQuery.eq('item_id', target.itemId);

            const { error: deleteError } = await deleteQuery;
            if (deleteError) throw deleteError;

            if (normalizedRecords.length > 0) {
                const payload = normalizedRecords.map(record => ({
                    entity_type: target.entityType,
                    parent_id: target.parentId,
                    item_id: target.itemId,
                    obligation_date: record.date,
                    amount: record.amount,
                    remarks: record.remarks,
                }));
                const { error: insertError } = await supabase.from('financial_obligations').insert(payload);
                if (insertError) throw insertError;
            }
        },
        fetchExact: target => fetchFinancialObligationRecords({
            entityType: target.entityType,
            parentId: target.parentId,
            itemId: target.itemId,
        }),
    };
    const persisted = await replaceAndVerifyFinancialObligationRecords({ persistence, identity, records });

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<FinancialObligationChange>(FINANCIAL_OBLIGATIONS_CHANGED_EVENT, {
            detail: { entityType, parentId, itemId: normalizedItemId, records: persisted },
        }));
    }

    return persisted;
};
