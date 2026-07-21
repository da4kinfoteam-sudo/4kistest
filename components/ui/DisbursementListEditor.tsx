// Author: 4K 
import React from 'react';
import { DisbursementRecord } from '../../constants';
import { FinancialRecordListEditor } from './FinancialRecordListEditor';

interface Props {
    disbursements: DisbursementRecord[];
    onChange: (disbursements: DisbursementRecord[]) => void;
    readOnly?: boolean;
    hideHeaderAddButton?: boolean;
    validateMonthChange?: (month: string) => boolean | Promise<boolean>;
}

export const DisbursementListEditor: React.FC<Props> = ({ disbursements = [], onChange, readOnly = false, hideHeaderAddButton = false, validateMonthChange }) => {
    return <FinancialRecordListEditor records={disbursements} onChange={onChange} noun="disbursement" totalLabel="Total Disbursed Amount" readOnly={readOnly} hideHeaderAddButton={hideHeaderAddButton} validateMonthChange={validateMonthChange} />;
};

// --- End of DisbursementListEditor.tsx ---
