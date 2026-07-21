// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OtherProgramExpense, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { getMonetaryChanges } from '../../lib/logUtils';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { supabase } from '../../supabaseClient';
import { ObligationsEditor } from '../accomplishment/ObligationsEditor';
import { createDisbursementsFromMonthlyFields, summarizeDisbursements } from '../../lib/disbursementUtils';

interface OtherExpenseDetailProps {
    item: OtherProgramExpense;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: OtherProgramExpense) => void;
}

const commonInputClasses = "form-control";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value detail-value--emphasis">{value || 'N/A'}</dd>
    </div>
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OtherExpenseDetail: React.FC<OtherExpenseDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Program Management');
    const { logAction } = useLogAction();
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const detailsDecision = getStatusDecision({
        moduleKey: 'other_program_expenses',
        item,
        action: 'editDetails',
        hasModuleAccess: canEdit,
    });
    const accomplishmentDecision = getStatusDecision({
        moduleKey: 'other_program_expenses',
        item,
        action: 'editFinancialAccomplishment',
        hasModuleAccess: canEdit,
    });
    const canEditDetails = detailsDecision.allowed;
    const canEditAccomplishment = accomplishmentDecision.allowed;

    const validateActualMonth = async (month?: string) => {
        if (!month) return true;
        const decision = getMonthDecision(month);
        if (isMonthSelectionAllowed(decision)) {
            setMonthLockMessage('');
            return true;
        }
        setMonthLockMessage(getMonthLockMessage(decision));
        return false;
    };

    const hasMonthChanged = (current?: string | null, original?: string | null) => (
        normalizePolicyMonth(current) !== normalizePolicyMonth(original)
    );

    const getChangedRecordMonths = (
        currentRecords: Array<{ id?: number | string; date?: string | null }> = [],
        originalRecords: Array<{ id?: number | string; date?: string | null }> = []
    ) => currentRecords
        .filter((record, index) => {
            const originalRecord = record.id !== undefined
                ? originalRecords.find(existing => existing.id === record.id)
                : originalRecords[index];
            return !!record.date && (!originalRecord || hasMonthChanged(record.date, originalRecord.date));
        })
        .map(record => record.date)
        .filter(Boolean) as string[];

    const validateAccomplishmentMonthsForSave = async () => {
        if (editMode !== 'accomplishment') return true;
        const monthsToCheck = [
            ...getChangedRecordMonths(formData.obligations || [], originalFormData.obligations || []),
            ...months
                .map((month, index) => {
                    const field = `actualDisbursement${month}`;
                    const currentAmount = Number((formData as any)[field]) || 0;
                    const originalAmount = Number((originalFormData as any)[field]) || 0;
                    return currentAmount > 0 && currentAmount !== originalAmount
                        ? `${formData.fundYear}-${String(index + 1).padStart(2, '0')}`
                        : '';
                })
                .filter(Boolean),
        ] as string[];
        for (const month of monthsToCheck) {
            if (!(await validateActualMonth(month))) return false;
        }
        return true;
    };

    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<OtherProgramExpense>(item);
    const [originalFormData, setOriginalFormData] = useState<OtherProgramExpense>(item);
    const [isSaving, setIsSaving] = useState(false);
    const [monthLockMessage, setMonthLockMessage] = useState('');

    const getDisplayItem = (source: OtherProgramExpense) => {
        if (!source.disbursements || source.disbursements.length === 0) return source;
        const disbursementSummary = summarizeDisbursements(source.disbursements, source.fundYear);
        return {
            ...source,
            ...disbursementSummary.monthlyFields,
            actualDisbursementAmount: disbursementSummary.total,
            actualDisbursementDate: disbursementSummary.latestDate || source.actualDisbursementDate,
        };
    };

    // Initial load and whenever the item ID changes
    useEffect(() => {
        if (!item) return;

        // Always reset form data to current item first
        const displayItem = getDisplayItem(item);
        setFormData(displayItem);
        setOriginalFormData(displayItem);

        const fetchObligations = async () => {
            if (!item?.id || !supabase) return;

            const { data, error } = await supabase
                .from('financial_obligations')
                .select('*')
                .eq('entity_type', 'other_program_expense')
                .eq('parent_id', item.id);

            if (!error && data && data.length > 0) {
                const mappedObligations = data.map(o => ({
                    id: o.id,
                    date: o.obligation_date,
                    amount: o.amount,
                    remarks: o.remarks
                }));
                const totalAmount = mappedObligations.reduce((sum, ob) => sum + (Number(ob.amount) || 0), 0);
                setFormData(prev => ({
                    ...prev,
                    obligations: mappedObligations,
                    actualObligationAmount: totalAmount
                }));
                setOriginalFormData(prev => ({
                    ...prev,
                    obligations: mappedObligations,
                    actualObligationAmount: totalAmount
                }));
            } else if (item && (!item.obligations || item.obligations.length === 0) && (item.actualObligationAmount || 0) > 0) {
                const virtualObligations = [{
                    id: Date.now(),
                    date: item.actualObligationDate || '',
                    amount: item.actualObligationAmount || 0,
                    remarks: 'Legacy Record'
                }];
                setFormData(prev => ({ ...prev, obligations: virtualObligations }));
                setOriginalFormData(prev => ({ ...prev, obligations: virtualObligations }));
            }
        };

        fetchObligations();
    }, [item, supabase]);

    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    // For selects
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (selectedParticular) {
            const ot = selectedObjectType;
            const ep = selectedParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
             if (uacsCodes[selectedObjectType]) {
                 Object.entries(uacsCodes[selectedObjectType]).forEach(([ep, codesObj]) => {
                     Object.entries(codesObj).forEach(([code, desc]) => {
                         codes.push({ code, desc });
                     });
                 });
             }
        }
        return codes;
    }, [selectedParticular, selectedObjectType, uacsCodes]);

    const selectedUacsDesc = useMemo(() => {
        return availableUacsCodes.find(c => c.code === formData.uacsCode)?.desc || '';
    }, [formData.uacsCode, availableUacsCodes]);

    // Handle selectivity initialization when entering details edit mode
    useEffect(() => {
        if (editMode === 'details') {
            let foundType: ObjectType = 'MOOE';
            let foundParticular = '';
            outerLoop:
            for (const type of objectTypes) {
                if(uacsCodes[type]) {
                    for (const part in uacsCodes[type]) {
                        if (item.uacsCode && uacsCodes[type][part].hasOwnProperty(item.uacsCode)) {
                            foundType = type;
                            foundParticular = part;
                            break outerLoop;
                        }
                    }
                }
            }
            setSelectedObjectType(foundType);
            setSelectedParticular(foundParticular);
        } else if (editMode === 'none') {
            // Reset to original state when canceling
            const displayItem = getDisplayItem(item);
            setFormData(displayItem);
            setOriginalFormData(displayItem);
        }
    }, [editMode, item, uacsCodes]);

    // Recalculate Totals when monthly fields change
    useEffect(() => {
        if (editMode === 'details') {
            // @ts-ignore
            const total = months.reduce((sum, m) => sum + (Number(formData[`disbursement${m}`]) || 0), 0);
            // Optional: Sync obligatedAmount with schedule if strictly enforced
        } else if (editMode === 'accomplishment') {
            // @ts-ignore
            const total = months.reduce((sum, m) => sum + (Number(formData[`actualDisbursement${m}`]) || 0), 0);
            if (total !== formData.actualDisbursementAmount) setFormData(prev => ({ ...prev, actualDisbursementAmount: total }));
        }
    }, [
        ...months.map(m => (formData as any)[`disbursement${m}`]),
        ...months.map(m => (formData as any)[`actualDisbursement${m}`]),
        editMode
    ]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name === 'uacsCode') {
            setFormData(prev => ({ ...prev, [name]: value }));

            // Auto-select particular if a valid code is entered
            if (value && uacsCodes[selectedObjectType]) {
                const trimmedValue = value.trim();
                let foundParticular = '';

                // First check if the code exists in the CURRENT selected particular (optimization)
                if (selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && uacsCodes[selectedObjectType][selectedParticular][trimmedValue]) {
                    foundParticular = selectedParticular;
                } else {
                    // Search all particulars
                    for (const [particular, codes] of Object.entries(uacsCodes[selectedObjectType])) {
                        if (codes[trimmedValue]) {
                            foundParticular = particular;
                            break;
                        }
                    }
                }

                if (foundParticular && foundParticular !== selectedParticular) {
                    setSelectedParticular(foundParticular);
                }
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const getInputClasses = (fieldName: string) => {
        if (validationErrors.includes(fieldName)) {
            return `${commonInputClasses} form-control--invalid`;
        }
        return commonInputClasses;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const action = editMode === 'details' ? 'editDetails' : 'editFinancialAccomplishment';
        const decision = editMode === 'details' ? detailsDecision : accomplishmentDecision;
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'other_program_expenses',
            item,
            itemId: item.id,
            itemName: item.particulars,
            status: item.status,
            action,
            entityType: 'other_program_expense',
        });
        if (!allowed) return;
        if (!(await validateAccomplishmentMonthsForSave())) return;

        if (editMode === 'details') {
            const requiredFields = [
                { key: 'operatingUnit', label: 'Operating Unit' },
                { key: 'status', label: 'Status' },
                { key: 'uacsCode', label: 'UACS Code' },
                { key: 'particulars', label: 'Particular' },
                { key: 'obligationDate', label: 'Obligation Date' },
                { key: 'amount', label: 'Target Allocation Amount' }
            ];

            const errors: string[] = [];
            const missingLabels: string[] = [];

            requiredFields.forEach(field => {
                if (!formData[field.key as keyof OtherProgramExpense]) {
                    errors.push(field.key);
                    missingLabels.push(field.label);
                }
            });

            if (errors.length > 0) {
                setValidationErrors(errors);
                alert(`Please fill in the following required fields:\n- ${missingLabels.join('\n- ')}`);
                return;
            }
        }

        setValidationErrors([]);

        const updatedItem: any = {
            ...formData,
            fundYear: Number(formData.fundYear),
            amount: Number(formData.amount),
            obligatedAmount: Number(formData.amount), // Sync obligatedAmount with amount
            actualAmount: Number(formData.actualAmount),
            actualObligationAmount: (formData.obligations && formData.obligations.length === 0) ? null : Number(formData.actualObligationAmount),
            actualObligationDate: (formData.obligations && formData.obligations.length === 0) ? null : (formData.actualObligationDate || null),
            actualDisbursementAmount: Number(formData.actualDisbursementAmount),
            updated_at: new Date().toISOString()
        };

        // Ensure month fields are numbers
        months.forEach(m => {
            updatedItem[`disbursement${m}`] = Number((formData as any)[`disbursement${m}`]);
            updatedItem[`actualDisbursement${m}`] = Number((formData as any)[`actualDisbursement${m}`]);
        });

        if (supabase) {
            try {
                setIsSaving(true);
                // Exclude ID and obligations from payload
                const { id, obligations, disbursements, ...payload } = updatedItem;

                console.log("Saving Other Program Expense...", { id: item.id, payload });
                const { error: updateError } = await supabase.from('other_program_expenses').update(payload).eq('id', item.id);
                if (updateError) throw updateError;

                // Sync obligations to centralized table
                const entityType = 'other_program_expense';
                const parentId = item.id;

                console.log("Syncing obligations to centralized table...", { entityType, parentId, count: obligations?.length });

                // Delete old
                const { error: deleteError } = await supabase.from('financial_obligations')
                    .delete()
                    .eq('entity_type', entityType)
                    .eq('parent_id', parentId);

                if (deleteError) {
                    console.error("Error deleting old obligations:", deleteError);
                    // Continue as it might still succeed
                }

                // Insert new
                if (obligations && obligations.length > 0) {
                    const syncPayload = obligations.map((o: any) => ({
                        entity_type: entityType,
                        parent_id: parentId,
                        obligation_date: o.date,
                        amount: Number(o.amount) || 0,
                        remarks: o.remarks || ''
                    }));

                    const { error: insertError } = await supabase.from('financial_obligations').insert(syncPayload);
                    if (insertError) {
                        console.error("Critical RLS Error or Insert Error in financial_obligations:", insertError);
                        throw new Error(`Failed to sync obligations: ${insertError.message}. This might be a database permission (RLS) issue.`);
                    }
                }

                const { error: disbursementDeleteError } = await supabase.from('financial_disbursements')
                    .delete()
                    .eq('entity_type', entityType)
                    .eq('parent_id', parentId);

                if (disbursementDeleteError) {
                    console.error("Error deleting old disbursements:", disbursementDeleteError);
                }

                const disbursementPayload = createDisbursementsFromMonthlyFields(updatedItem, updatedItem.fundYear, 'Synced from other expense monthly matrix')
                    .map(disb => ({
                        entity_type: entityType,
                        parent_id: parentId,
                        disbursement_date: disb.date,
                        amount: Number(disb.amount) || 0,
                        remarks: disb.remarks || ''
                    }));

                if (disbursementPayload.length > 0) {
                    const { error: disbursementInsertError } = await supabase.from('financial_disbursements').insert(disbursementPayload);
                    if (disbursementInsertError) {
                        console.error("Critical RLS Error or Insert Error in financial_disbursements:", disbursementInsertError);
                        throw new Error(`Failed to sync disbursements: ${disbursementInsertError.message}. This might be a database permission (RLS) issue.`);
                    }
                }

                const metadata = getMonetaryChanges(item, updatedItem, 'Other');
                logAction('Updated Other Program Expense', updatedItem.particulars, undefined, 'Other Program Expense', String(item.id), metadata);

                onUpdate(updatedItem as OtherProgramExpense);
                setEditMode('none');
                console.log("Save successful!");
            } catch (err: any) {
                console.error("Error saving other program expense:", err);
                alert("Failed to save changes: " + (err.message || "Unknown error"));
            } finally {
                setIsSaving(false);
            }
        }
    };

    if (editMode === 'details') {
        return (
            <div className="form-page animate-fadeIn">
                <div className="detail-header">
                    <h1 className="detail-title">Editing Details: {item.particulars}</h1>
                    <button onClick={() => { setEditMode('none'); setValidationErrors([]); }} className="btn btn-secondary">Cancel Editing</button>
                </div>
                <div className="form-card">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Section 1: Basic Information */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Basic Information</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Operating Unit <span className="form-required">*</span></label>
                                    <select
                                        name="operatingUnit"
                                        value={formData.operatingUnit}
                                        onChange={handleInputChange}
                                        className={getInputClasses('operatingUnit')}
                                        disabled
                                    >
                                        <option value="">Select OU</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Status <span className="form-required">*</span></label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')}>
                                        <option value="Proposed">Proposed</option>
                                        <option value="Ongoing">Ongoing</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Particular <span className="form-required">*</span></label>
                                    <input type="text" name="particulars" value={formData.particulars} onChange={handleInputChange} placeholder="Enter particulars" className={getInputClasses('particulars')} />
                                </div>
                            </div>
                        </fieldset>

                        {/* Section 2: Funding */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Funding</legend>
                            <div className="space-y-6">
                                <div className="form-grid">
                                    <div>
                                        <label className="form-label">Fund Year <span className="form-required">*</span></label>
                                        <input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} />
                                    </div>
                                    <div>
                                        <label className="form-label">Fund Type <span className="form-required">*</span></label>
                                        <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                            {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">Tier <span className="form-required">*</span></label>
                                        <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* UACS Row */}
                                <div className="program-form-grid program-form-grid--four">
                                    <div>
                                        <label className="form-label">Object Type <span className="form-required">*</span></label>
                                        <select
                                            value={selectedObjectType}
                                            onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }}
                                            className={commonInputClasses}
                                        >
                                            {objectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label">Particular <span className="form-required">*</span></label>
                                        <select
                                            value={selectedParticular}
                                            onChange={e => {
                                                setSelectedParticular(e.target.value);
                                                const ot = selectedObjectType;
                                                const ep = e.target.value;
                                                if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                                                    const firstCode = Object.keys(uacsCodes[ot][ep])[0];
                                                    setFormData(prev => ({...prev, uacsCode: firstCode}));
                                                } else {
                                                    setFormData(prev => ({...prev, uacsCode: ''}));
                                                }
                                            }}
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Particular</option>
                                            {uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="relative">
                                        <label className="form-label">UACS Code <span className="form-required">*</span></label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                name="uacsCode"
                                                value={formData.uacsCode}
                                                onChange={handleInputChange}
                                                list="uacs-codes-list-detail"
                                                className={`${getInputClasses('uacsCode')} pr-10`}
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                <svg className="form-control-adornment__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                        <datalist id="uacs-codes-list-detail">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="form-label">Description</label>
                                        <input
                                            type="text"
                                            value={selectedUacsDesc}
                                            readOnly
                                            className={`${commonInputClasses} form-control--readonly`}
                                        />
                                    </div>
                                </div>

                                <div className="form-grid">
                                    <div>
                                        <label className="form-label">Obligation Date <span className="form-required">*</span></label>
                                        <MonthYearPicker
                                            value={formData.obligationDate}
                                            onChange={(val) => {
                                                setFormData(prev => ({...prev, obligationDate: val}));
                                                if (validationErrors.includes('obligationDate')) {
                                                    setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                                }
                                            }}
                                            className={validationErrors.includes('obligationDate') ? 'form-control--invalid' : ''}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Target Allocation Amount <span className="form-required">*</span></label>
                                        <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" className={getInputClasses('amount')} />
                                    </div>
                                </div>

                                <div className="detail-subsection">
                                    <h4 className="detail-section-title detail-section-title--ruled">Monthly Disbursement Schedule <span className="form-required">*</span></h4>
                                    <div className="program-month-grid">
                                        {months.map(month => (
                                            <div key={month} className="program-month-cell">
                                                <label className="program-month-cell__label">{month}</label>
                                                <input
                                                    type="number"
                                                    name={`disbursement${month}`}
                                                    value={(formData as any)[`disbursement${month}`] || 0}
                                                    onChange={handleInputChange}
                                                    className={`${getInputClasses(`disbursement${month}`)} form-control--compact`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <div className="detail-edit-footer">
                            <button type="submit" className="btn btn-primary">
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    if (editMode === 'accomplishment') {
        return (
            <div className="form-page animate-fadeIn">
                <div className="detail-header">
                    <h1 className="detail-title">Editing Accomplishment: {item.particulars}</h1>
                    <button onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel Editing</button>
                </div>
                <div className="form-card">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {monthLockMessage && (
                            <div className="notice notice--warning" role="status">
                                {monthLockMessage}
                            </div>
                        )}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Accomplishment Data</legend>
                            <div className="form-grid">
                                <div className="sm:col-span-2">
                                    <label className="form-label">Obligations</label>
                                    <ObligationsEditor
                                        obligations={formData.obligations || []}
                                        onChange={(newObs, total) => {
                                            const latestOb = newObs.length > 0 ? [...newObs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
                                            setFormData(prev => ({
                                                ...prev,
                                                obligations: newObs,
                                                actualObligationAmount: total,
                                                actualObligationDate: latestOb ? latestOb.date : ''
                                            }));
                                        }}
                                        defaultYear={formData.fundYear?.toString()}
                                        validateMonthChange={validateActualMonth}
                                    />
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Actual Monthly Disbursement</legend>
                            <div className="program-month-grid">
                                {months.map(month => (
                                    <div key={`actual-${month}`} className="program-month-cell"><label className="program-month-cell__label">{month}</label><input type="number" name={`actualDisbursement${month}`}
                                    // @ts-ignore
                                    value={(formData as any)[`actualDisbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="form-control form-control--compact" /></div>
                                ))}
                            </div>
                            <div className="budget-item-list__total">
                                Total Actual Disbursement: {formatCurrency(formData.actualDisbursementAmount || 0)}
                            </div>
                        </fieldset>

                        <div className="detail-edit-footer">
                            <button type="button" onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Accomplishment</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // --- Read Only View ---
    const totalTargetDisbursement = months.reduce((sum, m) => sum + (Number((item as any)[`disbursement${m}`]) || 0), 0);

    return (
        <div className="detail-page animate-fadeIn">
            {/* Header */}
            <header className="detail-header">
                <div>
                    <h1 className="detail-title" title={item.particulars}>{item.particulars}</h1>
                    <p className="detail-subtitle">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="detail-actions">
                    {(canEdit || canEditDetails) && (
                        <button onClick={async () => {
                            const allowed = await ensureDecisionAllowed(detailsDecision, {
                                moduleKey: 'other_program_expenses',
                                item,
                                itemId: item.id,
                                itemName: item.particulars,
                                status: item.status,
                                action: 'editDetails',
                                entityType: 'other_program_expense',
                            });
                            if (allowed) setEditMode('details');
                        }} disabled={!canEditDetails} className={`btn btn-primary btn-responsive ${!canEditDetails ? 'is-disabled' : ''}`} title={canEditDetails ? 'Edit Details' : detailsDecision.message}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            <span className="btn-text">
                            Edit Details
                            </span>
                        </button>
                    )}
                    {(canEdit || canEditAccomplishment) && (
                        <button onClick={async () => {
                            const allowed = await ensureDecisionAllowed(accomplishmentDecision, {
                                moduleKey: 'other_program_expenses',
                                item,
                                itemId: item.id,
                                itemName: item.particulars,
                                status: item.status,
                                action: 'editFinancialAccomplishment',
                                entityType: 'other_program_expense',
                            });
                            if (allowed) setEditMode('accomplishment');
                        }} disabled={!canEditAccomplishment} className={`btn btn-primary btn-responsive ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span className="btn-text">
                            Edit Accomplishment
                            </span>
                        </button>
                    )}
                    <button onClick={onBack} className="btn btn-secondary btn-responsive">
                        <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        <span className="btn-text">
                        Back
                        </span>
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="detail-grid">

                {/* Details Section */}
                <div className="detail-card">
                    <h3 className="detail-card-title">Requirement Details</h3>
                    <div className="detail-dl">
                        <div className="detail-item--wide">
                            <DetailItem label="Particulars" value={item.particulars} />
                        </div>
                        <DetailItem label="Status" value={
                            <span className={`status-badge ${
                                item.status === 'Completed' ? 'status-badge--completed' :
                                item.status === 'Ongoing' ? 'status-badge--ongoing' :
                                item.status === 'Cancelled' ? 'status-badge--cancelled' :
                                'status-badge--proposed'
                            }`}>
                                {item.status}
                            </span>
                        } />
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <div className="detail-item--wide">
                            <DetailItem label="UACS Code" value={`${item.uacsCode} - ${selectedParticular || 'N/A'} - ${selectedUacsDesc || 'N/A'}`} />
                        </div>
                        <DetailItem label="Target Obligation Date" value={item.obligationDate} />

                        {/* Aligned Financial Targets */}
                        <DetailItem label="Target Allocation Amount" value={formatCurrency(item.amount)} />
                        <DetailItem label="Target Obligated Amount" value={formatCurrency(item.obligatedAmount || 0)} />
                        <DetailItem label="Target Disbursement Amount" value={formatCurrency(totalTargetDisbursement)} />

                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>

                    <div className="detail-subsection detail-subsection--separated">
                        <h4 className="detail-section-title detail-section-title--ruled">Target Monthly Disbursement</h4>
                        <div className="program-month-grid">
                            {months.map(m => (
                                <div key={m} className="program-month-cell">
                                    <span className="program-month-cell__label">{m}</span>
                                    <span className="program-month-cell__value">{formatCurrency((item as any)[`disbursement${m}`] || 0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Accomplishment Section */}
                <div className="detail-card">
                    <h3 className="detail-card-title">Accomplishment Report</h3>
                    <div className="detail-stack">

                        <div>
                            <h4 className="detail-section-title detail-section-title--ruled">Financial Performance</h4>
                            <div className="detail-metric-grid">
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Obligation</p>
                                    <DetailItem label="Date" value={item.actualObligationDate} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Disbursement</p>
                                    {/* Disbursement Date removed as redundant */}
                                    <DetailItem label="Total Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>

                        <div className="detail-subsection">
                            <h4 className="detail-section-title detail-section-title--ruled">Actual Monthly Disbursement</h4>
                            <div className="program-month-grid">
                                {months.map(m => (
                                    <div key={m} className="program-month-cell">
                                        <span className="program-month-cell__label">{m}</span>
                                        <span className="program-month-cell__value program-month-cell__value--success">{formatCurrency((item as any)[`actualDisbursement${m}`] || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default OtherExpenseDetail;
