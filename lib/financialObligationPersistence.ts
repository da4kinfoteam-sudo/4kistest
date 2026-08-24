import type { ActualObligationRecordLike } from './financialObligationUtils';

export type FinancialObligationEntityType =
    | 'subproject_detail'
    | 'activity_expense'
    | 'staffing_expense'
    | 'office_requirement'
    | 'other_program_expense';

export interface FinancialObligationIdentity {
    entityType: FinancialObligationEntityType;
    parentId: number;
    itemId: string | null;
}

export interface NormalizedFinancialObligationRecord {
    date: string;
    amount: number;
    remarks: string;
}

export interface PersistedFinancialObligationRecord extends NormalizedFinancialObligationRecord {
    id: number;
    itemId: string | null;
}

export interface FinancialObligationChange extends FinancialObligationIdentity {
    records: PersistedFinancialObligationRecord[];
}

export interface FinancialObligationPersistence {
    replaceExact(
        identity: FinancialObligationIdentity,
        records: NormalizedFinancialObligationRecord[]
    ): Promise<void>;
    fetchExact(identity: FinancialObligationIdentity): Promise<PersistedFinancialObligationRecord[]>;
}

const REQUIRED_CHILD_LINE_ENTITY_TYPES = new Set<FinancialObligationEntityType>([
    'subproject_detail',
    'activity_expense',
]);

const PARENT_ONLY_ENTITY_TYPES = new Set<FinancialObligationEntityType>([
    'office_requirement',
    'other_program_expense',
]);

export const normalizeFinancialObligationItemId = (itemId?: number | string | null) => {
    if (itemId === undefined || itemId === null || String(itemId).trim() === '') return null;
    return String(itemId);
};

export const assertFinancialObligationIdentity = (identity: FinancialObligationIdentity) => {
    const { entityType, parentId, itemId } = identity;
    if (!Number.isInteger(parentId) || parentId <= 0) {
        throw new Error('Cannot save actual obligations because the parent record identity is invalid.');
    }
    if (REQUIRED_CHILD_LINE_ENTITY_TYPES.has(entityType) && itemId === null) {
        throw new Error('Cannot save actual obligations because the financial child-line identity is missing.');
    }
    if (PARENT_ONLY_ENTITY_TYPES.has(entityType) && itemId !== null) {
        throw new Error('Cannot save actual obligations because this parent financial line has an unexpected child identity.');
    }
};

export const normalizeFinancialObligationRecord = (
    record: ActualObligationRecordLike
): NormalizedFinancialObligationRecord => {
    const date = String(record.date || '').trim();
    const amount = Number(record.amount);
    const remarks = String(record.remarks || '').trim();
    if (!date || !Number.isFinite(amount) || amount === 0) {
        throw new Error('Each actual obligation entry requires a valid month and a non-zero amount.');
    }
    return { date, amount, remarks };
};

const recordSignature = (record: NormalizedFinancialObligationRecord) =>
    `${record.date}\u0000${record.amount}\u0000${record.remarks}`;

export const assertFinancialObligationReadBack = (
    expected: NormalizedFinancialObligationRecord[],
    persisted: PersistedFinancialObligationRecord[]
) => {
    const expectedSignatures = expected.map(recordSignature).sort();
    const persistedSignatures = persisted.map(recordSignature).sort();
    if (JSON.stringify(expectedSignatures) !== JSON.stringify(persistedSignatures)) {
        throw new Error('Actual obligations could not be verified after saving. Please refresh and try again.');
    }
};

export const replaceAndVerifyFinancialObligationRecords = async ({
    persistence,
    identity,
    records,
}: {
    persistence: FinancialObligationPersistence;
    identity: FinancialObligationIdentity;
    records: ActualObligationRecordLike[];
}) => {
    assertFinancialObligationIdentity(identity);
    const normalizedRecords = records.map(normalizeFinancialObligationRecord);
    await persistence.replaceExact(identity, normalizedRecords);
    const persisted = await persistence.fetchExact(identity);
    assertFinancialObligationReadBack(normalizedRecords, persisted);
    return persisted;
};
