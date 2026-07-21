// Author: 4K 
import React from 'react';
import { ObligationRecord } from '../../constants';
import { FinancialRecordListEditor } from './FinancialRecordListEditor';

interface Props {
    obligations: ObligationRecord[];
    onChange: (obligations: ObligationRecord[]) => void;
    readOnly?: boolean;
    hideHeaderAddButton?: boolean;
    validateMonthChange?: (month: string) => boolean | Promise<boolean>;
}

export const ObligationListEditor: React.FC<Props> = ({ obligations = [], onChange, readOnly = false, hideHeaderAddButton = false, validateMonthChange }) => {
    return <FinancialRecordListEditor records={obligations} onChange={onChange} noun="obligation" totalLabel="Total Obligated Amount" readOnly={readOnly} hideHeaderAddButton={hideHeaderAddButton} validateMonthChange={validateMonthChange} />;
};

// --- End of ObligationListEditor.tsx ---
