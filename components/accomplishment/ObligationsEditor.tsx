import React from 'react';
import { ObligationRecord } from '../../constants';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { FormattedAmountInput } from '../ui/FormattedAmountInput';
import { Plus, Trash2 } from 'lucide-react';

interface ObligationsEditorProps {
    obligations: ObligationRecord[];
    onChange: (obligations: ObligationRecord[], totalAmount: number) => void;
    defaultYear?: string;
    readOnly?: boolean;
    validateMonthChange?: (month: string) => boolean | Promise<boolean>;
}

export const ObligationsEditor: React.FC<ObligationsEditorProps> = ({ obligations = [], onChange, defaultYear, readOnly = false, validateMonthChange }) => {
    const getTotal = (items: ObligationRecord[]) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const handleAdd = () => {
        const updated = [
            ...obligations,
            { id: Date.now() + Math.floor(Math.random() * 1000), date: '', amount: 0, remarks: '' },
        ];
        onChange(updated, getTotal(updated));
    };

    const handleUpdate = async (id: number, field: keyof ObligationRecord, value: any) => {
        if (field === 'date' && value && validateMonthChange) {
            const allowed = await validateMonthChange(value);
            if (!allowed) return;
        }
        const updated = obligations.map(ob => ob.id === id ? { ...ob, [field]: value } : ob);
        onChange(updated, getTotal(updated));
    };

    const handleDelete = (id: number) => {
        const updated = obligations.filter(ob => ob.id !== id);
        onChange(updated, getTotal(updated));
    };

    const totalAmount = getTotal(obligations);

    return (
        <div className="budget-record-editor budget-record-editor--obligation">
            {obligations.map((ob, idx) => (
                <div key={ob.id || idx} className="budget-record-row">
                    <div className="budget-record-row__fields">
                        <div className="budget-record-row__month">
                            <MonthYearPicker
                                value={ob.date}
                                onChange={(val) => handleUpdate(ob.id, 'date', val)}
                                placeholder="Month"
                                defaultYear={defaultYear}
                                className="form-control form-control--compact"
                                disabled={readOnly}
                                allowClear
                            />
                        </div>
                        <div className="budget-record-row__amount">
                            <FormattedAmountInput
                                value={Number(ob.amount) || 0}
                                onValueChange={(value) => handleUpdate(ob.id, 'amount', value)}
                                className="form-control form-control--compact"
                                placeholder="0.00"
                                disabled={readOnly}
                                emptyWhenZero={!ob.date}
                            />
                        </div>
                        {!readOnly && (
                            <button type="button" title="Remove Row" onClick={() => handleDelete(ob.id)} className="budget-record-row__remove">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {!readOnly && (
                <button type="button" onClick={handleAdd} className="budget-record-add">
                    <Plus size={14} /> Add Obligation
                </button>
            )}
            {obligations.length > 0 && (
                <div className="budget-record-total">
                    Total: ₱{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount)}
                </div>
            )}
        </div>
    );
};
