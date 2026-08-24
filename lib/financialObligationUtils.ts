export interface ActualObligationRecordLike {
    amount?: number | string | null;
    date?: string | null;
    remarks?: string | null;
}

export interface ActualObligationLineLike {
    obligations?: ActualObligationRecordLike[] | null;
    actualObligationAmount?: number | string | null;
}

const toFiniteNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const hasActualObligationRecords = (line?: ActualObligationLineLike | null) =>
    !!line && ((line.obligations?.length || 0) > 0 || toFiniteNumber(line.actualObligationAmount) !== 0);

export const sumActualObligationRecords = (
    records: ActualObligationRecordLike[] = [],
    include: (record: ActualObligationRecordLike) => boolean = () => true
) => records.reduce((sum, record) => include(record) ? sum + toFiniteNumber(record.amount) : sum, 0);

export const bucketActualObligationRecords = (
    records: ActualObligationRecordLike[] = [],
    getBucketIndex: (record: ActualObligationRecordLike) => number,
    bucketCount = 12
) => {
    const buckets = Array.from({ length: bucketCount }, () => 0);
    records.forEach(record => {
        const index = getBucketIndex(record);
        if (index >= 0 && index < bucketCount) buckets[index] += toFiniteNumber(record.amount);
    });
    return buckets;
};

export const getActualObligationValidationError = (
    records: ActualObligationRecordLike[] = [],
    options: { requireNegativeReason?: boolean } = {}
) => {
    const requireNegativeReason = options.requireNegativeReason ?? true;

    for (const record of records) {
        const amount = toFiniteNumber(record.amount);
        if (!record.date) return 'Each actual obligation entry requires a month and year.';
        if (amount === 0) return 'Actual obligation entries must be greater than or less than zero.';
        if (amount < 0 && requireNegativeReason && !String(record.remarks || '').trim()) {
            return 'A reason is required for every negative actual obligation adjustment.';
        }
    }

    return '';
};
