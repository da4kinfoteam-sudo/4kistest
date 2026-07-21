import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FormattedAmountInput } from './FormattedAmountInput';
import { MonthYearPicker } from './MonthYearPicker';

export interface FinancialRecord {
    id: number;
    amount: number;
    date: string;
    remarks?: string;
}

interface FinancialRecordListEditorProps<T extends FinancialRecord> {
    records: T[];
    onChange: (records: T[]) => void;
    noun: 'obligation' | 'disbursement';
    totalLabel: string;
    readOnly?: boolean;
    hideHeaderAddButton?: boolean;
    validateMonthChange?: (month: string) => boolean | Promise<boolean>;
}

export function FinancialRecordListEditor<T extends FinancialRecord>({
    records = [],
    onChange,
    noun,
    totalLabel,
    readOnly = false,
    hideHeaderAddButton = false,
    validateMonthChange,
}: FinancialRecordListEditorProps<T>) {
    const addRecord = () => {
        if (readOnly) return;
        onChange([...records, {
            id: Date.now(),
            amount: 0,
            date: new Date().toISOString().split('T')[0],
        } as T]);
    };

    const removeRecord = (id: number) => {
        if (!readOnly) onChange(records.filter(record => record.id !== id));
    };

    const updateRecord = async (id: number, updates: Partial<T>) => {
        if (readOnly) return;
        if (updates.date && validateMonthChange && !(await validateMonthChange(updates.date))) return;
        onChange(records.map(record => record.id === id ? { ...record, ...updates } : record));
    };

    const total = records.reduce((sum, record) => sum + (Number(record.amount) || 0), 0);

    return (
        <div className="financial-record-editor form-stack">
            <header className="financial-record-editor__summary">
                <span><small>{totalLabel}</small><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(total)}</strong></span>
                {!readOnly && !hideHeaderAddButton && <button type="button" onClick={addRecord} className="btn-primary btn-compact"><Plus className="btn-symbol" />Add Record</button>}
            </header>
            {records.length === 0 ? (
                <div className="ui-state financial-record-editor__empty"><p>No {noun} records yet.</p>{!readOnly && <button type="button" onClick={addRecord} className="btn-ghost">Add the first record</button>}</div>
            ) : (
                <div className="financial-record-editor__list">
                    {records.map(record => <article key={record.id} className="financial-record-editor__item">
                        <div className="form-grid">
                            <label className="form-field"><span className="form-label form-label--compact">Month</span><MonthYearPicker value={record.date} onChange={value => updateRecord(record.id, { date: value } as Partial<T>)} disabled={readOnly} className="form-control form-control--compact" allowClear /></label>
                            <label className="form-field"><span className="form-label form-label--compact">Amount</span><FormattedAmountInput value={Number(record.amount) || 0} onValueChange={value => updateRecord(record.id, { amount: value } as Partial<T>)} disabled={readOnly} emptyWhenZero placeholder="0.00" className="form-control form-control--compact financial-record-editor__amount" /></label>
                            <label className="form-field form-field--full"><span className="form-label form-label--compact">Remarks (Optional)</span><input type="text" value={record.remarks || ''} onChange={event => updateRecord(record.id, { remarks: event.target.value } as Partial<T>)} disabled={readOnly} placeholder="e.g. 1st tranche, final payment..." className="form-control form-control--compact" /></label>
                        </div>
                        {!readOnly && <button type="button" onClick={() => removeRecord(record.id)} className="table-action table-action--delete" aria-label={`Remove ${noun} record`}><Trash2 className="btn-symbol" /></button>}
                    </article>)}
                </div>
            )}
        </div>
    );
}
