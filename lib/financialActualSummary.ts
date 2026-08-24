import type { DisbursementRecord, ObligationRecord } from '../constants';
import { hasActualObligationRecords } from './financialObligationUtils';

type FinancialActualLine = {
    actualObligationAmount?: number;
    actualObligationDate?: string | null;
    actualDisbursementAmount?: number;
    actualDisbursementDate?: string | null;
    obligations?: ObligationRecord[];
    disbursements?: DisbursementRecord[];
};

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const latestDate = (records: Array<{ date?: string }> = []) =>
    records.reduce((latest, record) => {
        if (!record.date) return latest;
        if (!latest) return record.date;
        return new Date(record.date).getTime() > new Date(latest).getTime() ? record.date : latest;
    }, '');

export const getActualObligationSummary = (line: FinancialActualLine) => {
    const obligations = line.obligations || [];

    if (obligations.length > 0) {
        return {
            amount: obligations.reduce((sum, record) => sum + toNumber(record.amount), 0),
            date: latestDate(obligations),
        };
    }

    return {
        amount: toNumber(line.actualObligationAmount),
        date: line.actualObligationDate || '',
    };
};

export const getActualDisbursementSummary = (line: FinancialActualLine) => {
    const disbursements = line.disbursements || [];

    if (disbursements.length > 0) {
        return {
            amount: disbursements.reduce((sum, record) => sum + toNumber(record.amount), 0),
            date: latestDate(disbursements),
        };
    }

    return {
        amount: toNumber(line.actualDisbursementAmount),
        date: line.actualDisbursementDate || '',
    };
};

export const hasFinancialActuals = (line: FinancialActualLine) =>
    hasActualObligationRecords(line)
    || (line.disbursements?.length || 0) > 0
    || getActualDisbursementSummary(line).amount > 0;
