
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { getMonetaryChanges } from '../../lib/logUtils';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { supabase } from '../../supabaseClient';
import { ObligationsEditor } from '../accomplishment/ObligationsEditor';
import { getProgramManagementPhysicalDateBasis, resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../../lib/physicalAccomplishmentTimestamp';

interface OfficeRequirementDetailProps {
    item: OfficeRequirement;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: OfficeRequirement) => void;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "form-control";

const getStatusBadge = (status: OfficeRequirement['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value detail-value--emphasis">{value || 'N/A'}</dd>
    </div>
);

const OfficeRequirementDetail: React.FC<OfficeRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Program Management');
    const { logAction } = useLogAction();
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const detailsDecision = getStatusDecision({
        moduleKey: 'office_requirements',
        item,
        action: 'editDetails',
        hasModuleAccess: canEdit,
    });
    const accomplishmentDecision = getStatusDecision({
        moduleKey: 'office_requirements',
        item,
        action: 'editPhysicalAccomplishment',
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
        const months = [
            ...(hasMonthChanged(formData.actualDate, originalFormData.actualDate) ? [formData.actualDate] : []),
            ...(hasMonthChanged(formData.actualDisbursementDate, originalFormData.actualDisbursementDate) ? [formData.actualDisbursementDate] : []),
            ...getChangedRecordMonths(formData.obligations || [], originalFormData.obligations || []),
        ].filter(Boolean) as string[];
        for (const month of months) {
            if (!(await validateActualMonth(month))) return false;
        }
        return true;
    };
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<OfficeRequirement>(item);
    const [originalFormData, setOriginalFormData] = useState<OfficeRequirement>(item);
    const [isSaving, setIsSaving] = useState(false);
    const [monthLockMessage, setMonthLockMessage] = useState('');
    
    // Initial load and whenever the item ID changes
    useEffect(() => {
        if (!item) return;

        // Reset form data to current item
        setFormData(item);
        setOriginalFormData(item);

        const fetchObligations = async () => {
            if (!item?.id || !supabase) return;

            const { data, error } = await supabase
                .from('financial_obligations')
                .select('*')
                .eq('entity_type', 'office_requirement')
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
    }, [item.id, supabase]);

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

    // Reset form data and init selects when switching items or edit modes
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
            setFormData(item);
            setOriginalFormData(item);
            setValidationErrors([]);
        }
    }, [editMode, item, uacsCodes]);


    const formatDateMonthYear = (dateStr: string | undefined) => {
        if (!dateStr) return 'N/A';
        const parts = dateStr.split('-');
        if (parts.length < 2) return 'N/A';
        const year = parts[0];
        const monthIndex = parseInt(parts[1]) - 1;
        if (monthIndex < 0 || monthIndex > 11) return 'N/A';
        return `${MONTH_NAMES[monthIndex]} ${year}`;
    };


    // Status Automation Effect
    useEffect(() => {
        if (editMode === 'accomplishment') {
             if (formData.actualDate) {
                 if (formData.status !== 'Completed') {
                     setFormData(prev => ({ ...prev, status: 'Completed' }));
                 }
             } else {
                 if (formData.status === 'Completed') {
                     // Revert to Ongoing if date removed, or Proposed if it was proposed before edit
                     // Safe default is Ongoing if user is editing accomplishment
                     setFormData(prev => ({ ...prev, status: 'Ongoing' }));
                 }
             }
        }
    }, [formData.actualDate, editMode]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        // Clear validation error for this field
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(f => f !== name));
        }
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
        } else if (name === 'fundYear') {
            const newYear = parseInt(value) || new Date().getFullYear();
            setFormData(prev => ({ ...prev, [name]: newYear }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'form-control--invalid' : ''}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationErrors([]);

        const action = editMode === 'details' ? 'editDetails' : 'editPhysicalAccomplishment';
        const decision = editMode === 'details' ? detailsDecision : accomplishmentDecision;
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'office_requirements',
            item,
            itemId: item.id,
            itemName: item.equipment,
            status: item.status,
            action,
            entityType: 'office_requirement',
        });
        if (!allowed) return;
        if (!(await validateAccomplishmentMonthsForSave())) return;
        
        // Validation for Details mode
        if (editMode === 'details') {
            const requiredFields = [
                { field: 'equipment', label: 'Equipment' },
                { field: 'purpose', label: 'Purpose' },
                { field: 'fundYear', label: 'Fund Year' },
                { field: 'fundType', label: 'Fund Type' },
                { field: 'tier', label: 'Tier' },
                { field: 'uacsCode', label: 'UACS Code' },
                { field: 'physicalDeliveryDate', label: 'Physical Delivery Month' },
                { field: 'obligationDate', label: 'Target Obligation Month' },
                { field: 'disbursementDate', label: 'Target Disbursement Month' },
                { field: 'numberOfUnits', label: 'Number of Units' },
                { field: 'pricePerUnit', label: 'Price per Unit' }
            ];

            const missingFields = requiredFields.filter(f => !formData[f.field as keyof OfficeRequirement]);
            if (missingFields.length > 0) {
                setValidationErrors(missingFields.map(f => f.field));
                alert(`Please fill up the following required fields:\n- ${missingFields.map(f => f.label).join('\n- ')}`);
                return;
            }

            if (!selectedUacsDesc) {
                setValidationErrors(prev => [...prev, 'uacsCode']);
                alert('Please select a valid UACS Code from the list.');
                return;
            }
        }

        const timestamp = new Date().toISOString();
        const nextActualObligationDate = (formData.obligations && formData.obligations.length === 0) ? null : (formData.actualObligationDate || null);
        const actualDateBasis = getProgramManagementPhysicalDateBasis({ ...formData, actualObligationDate: nextActualObligationDate });
        const previousActualDateBasis = getProgramManagementPhysicalDateBasis(item);
        const updatedItem: any = {
            ...formData,
            numberOfUnits: Number(formData.numberOfUnits),
            pricePerUnit: Number(formData.pricePerUnit),
            fundYear: Number(formData.fundYear),
            actualAmount: Number(formData.actualAmount) || 0,
            actualObligationAmount: (formData.obligations && formData.obligations.length === 0) ? null : Number(formData.actualObligationAmount) || 0,
            actualObligationDate: nextActualObligationDate,
            actualDisbursementAmount: Number(formData.actualDisbursementAmount) || 0,
            physical_accomplishment_submitted_at: resolvePhysicalAccomplishmentSubmittedAt({
                hasPhysicalAccomplishment: !!actualDateBasis,
                hasChanged: valuesDiffer(previousActualDateBasis, actualDateBasis),
                previousSubmittedAt: item.physical_accomplishment_submitted_at,
                submittedAt: timestamp
            }),
            updated_at: timestamp
        };

        if (supabase) {
            try {
                setIsSaving(true);
                // Exclude ID and obligations from update payload
                const { id, obligations, disbursements, ...payload } = updatedItem;
                
                console.log("Saving Office Requirement...", { id: item.id, payload });
                const { error: updateError } = await supabase.from('office_requirements').update(payload).eq('id', item.id);
                if (updateError) throw updateError;

                // Sync obligations to centralized table
                const entityType = 'office_requirement';
                const parentId = item.id;
                
                console.log("Syncing obligations to centralized table...", { entityType, parentId, count: obligations?.length });

                // Delete old
                const { error: deleteError } = await supabase.from('financial_obligations')
                    .delete()
                    .eq('entity_type', entityType)
                    .eq('parent_id', parentId);
                
                if (deleteError) {
                    console.error("Error deleting old obligations:", deleteError);
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

                const metadata = getMonetaryChanges(item, updatedItem, 'Office');
                logAction('Updated Office Requirement', updatedItem.equipment, undefined, 'Office Requirement', String(item.id), metadata);
                
                onUpdate(updatedItem as OfficeRequirement);
                setEditMode('none');
            } catch (err: any) {
                console.error("Error in OfficeRequirementDetail handleSubmit:", err);
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
                    <h1 className="detail-title">Editing Details: {item.equipment}</h1>
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
                            <legend className="form-legend">Basic Information</legend>
                            <div className="form-grid">
                                <div><label className="form-label">Operating Unit <span className="form-required">*</span></label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={getInputClasses('operatingUnit')} disabled><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                                <div>
                                    <label className="form-label">Status <span className="form-required">*</span></label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')} disabled={formData.status === 'Completed'}>
                                        <option value="Proposed">Proposed</option>
                                        <option value="Ongoing">Ongoing</option>
                                        <option value="Cancelled">Cancelled</option>
                                        {formData.status === 'Completed' && <option value="Completed">Completed</option>}
                                    </select>
                                    {formData.status === 'Completed' && <p className="form-help">Status set to Completed automatically based on actual delivery date.</p>}
                                </div>
                                <div><label className="form-label">Equipment <span className="form-required">*</span></label><input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} required className={getInputClasses('equipment')} /></div>
                                <div><label className="form-label">Specifications</label><input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={getInputClasses('specs')} /></div>
                                <div className="form-field--full"><label className="form-label">Purpose <span className="form-required">*</span></label><textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} className={getInputClasses('purpose')} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Funding & Classification</legend>
                            <div className="space-y-4">
                                <div className="form-grid">
                                    <div><label className="form-label">Fund Year <span className="form-required">*</span></label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} /></div>
                                    <div><label className="form-label">Fund Type <span className="form-required">*</span></label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={getInputClasses('fundType')}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                    <div><label className="form-label">Tier <span className="form-required">*</span></label><select name="tier" value={formData.tier} onChange={handleInputChange} className={getInputClasses('tier')}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                </div>
                                
                                <div className="program-form-grid program-form-grid--four">
                                    <div><label className="form-label">Object Type <span className="form-required">*</span></label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={getInputClasses('objectType')}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="form-label">Particular <span className="form-required">*</span></label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={getInputClasses('particular')}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="form-label">UACS Code <span className="form-required">*</span></label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                name="uacsCode" 
                                                value={formData.uacsCode} 
                                                onChange={handleInputChange} 
                                                list="uacs-codes-list-detail"
                                                placeholder="Search UACS..."
                                                className={getInputClasses('uacsCode')} 
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                                <svg className="form-control-adornment__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
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
                                            placeholder="Description will appear here..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Target Schedule & Cost</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Physical Delivery Month <span className="form-required">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.physicalDeliveryDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, physicalDeliveryDate: val }));
                                            if (validationErrors.includes('physicalDeliveryDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'physicalDeliveryDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('physicalDeliveryDate') ? 'form-control--invalid' : ''}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Target Obligation Month <span className="form-required">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.obligationDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, obligationDate: val }));
                                            if (validationErrors.includes('obligationDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('obligationDate') ? 'form-control--invalid' : ''}
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Target Disbursement Month <span className="form-required">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.disbursementDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, disbursementDate: val }));
                                            if (validationErrors.includes('disbursementDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'disbursementDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('disbursementDate') ? 'form-control--invalid' : ''}
                                    />
                                </div>
                            
                                <div><label className="form-label">Number of Units <span className="form-required">*</span></label><input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={getInputClasses('numberOfUnits')} /></div>
                                <div><label className="form-label">Price per Unit <span className="form-required">*</span></label><input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={getInputClasses('pricePerUnit')} /></div>
                                <div><label className="form-label">Total Amount</label><input type="text" value={formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))} disabled className={`${commonInputClasses} form-control--readonly`} /></div>
                            </div>
                        </fieldset>

                        <div className="detail-edit-footer">
                            <button type="button" onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Details</button>
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
                    <h1 className="detail-title">Editing Accomplishment: {item.equipment}</h1>
                    <button onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel Editing</button>
                </div>
                <div className="form-card">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Accomplishment Data</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Actual Date (Delivery)</label>
                                    <MonthYearPicker 
                                        value={formData.actualDate}
                                        onChange={async (val) => {
                                            if (val && !(await validateActualMonth(val))) return;
                                            setFormData(prev => ({ ...prev, actualDate: val }));
                                        }}
                                        allowClear
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Actual Amount (Misc)</label>
                                    <input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} className={commonInputClasses} placeholder="Non-specific actuals" />
                                </div>
                                
                                <div className="form-field--full">
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
                                
                                <div>
                                    <label className="form-label">Actual Disbursement Month</label>
                                    <MonthYearPicker 
                                        value={formData.actualDisbursementDate}
                                        onChange={async (val) => {
                                            if (val && !(await validateActualMonth(val))) return;
                                            setFormData(prev => ({ ...prev, actualDisbursementDate: val }));
                                        }}
                                        allowClear
                                    />
                                </div>
                                <div>
                                    <label className="form-label">Actual Disbursement Amount</label>
                                    <input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
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

    return (
        <div className="detail-page animate-fadeIn">
            {/* Header */}
            <header className="detail-header">
                <div>
                    <h1 className="detail-title">{item.equipment}</h1>
                    <p className="detail-subtitle">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="detail-actions">
                    {(canEdit || canEditDetails) && (
                        <button onClick={async () => {
                            const allowed = await ensureDecisionAllowed(detailsDecision, {
                                moduleKey: 'office_requirements',
                                item,
                                itemId: item.id,
                                itemName: item.equipment,
                                status: item.status,
                                action: 'editDetails',
                                entityType: 'office_requirement',
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
                                moduleKey: 'office_requirements',
                                item,
                                itemId: item.id,
                                itemName: item.equipment,
                                status: item.status,
                                action: 'editPhysicalAccomplishment',
                                entityType: 'office_requirement',
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
                        <DetailItem label="Equipment" value={item.equipment} />
                        <DetailItem label="Status" value={<span className={getStatusBadge(item.status)}>{item.status}</span>} />
                        <DetailItem label="Units" value={item.numberOfUnits} />
                        <div className="detail-item--wide">
                            <DetailItem label="Specs" value={item.specs} />
                        </div>
                        <div className="detail-item--wide">
                            <DetailItem label="Purpose" value={item.purpose} />
                        </div>
                        <DetailItem label="Price Per Unit" value={formatCurrency(item.pricePerUnit)} />
                        <DetailItem label="Total Amount" value={formatCurrency(item.pricePerUnit * item.numberOfUnits)} />
                        
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <div className="detail-item--wide">
                            <DetailItem label="UACS Code" value={`${item.uacsCode} - ${selectedParticular} - ${selectedUacsDesc || 'Lookup Failed'}`} />
                        </div>
                        <DetailItem label="Physical Delivery" value={formatDateMonthYear(item.physicalDeliveryDate)} />
                        <DetailItem label="Target Obligation" value={formatDateMonthYear(item.obligationDate)} />
                        <DetailItem label="Target Disbursement" value={formatDateMonthYear(item.disbursementDate)} />
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                </div>

                {/* Accomplishment Section */}
                <div className="detail-card">
                    <h3 className="detail-card-title">Accomplishment Report</h3>
                    <div className="detail-stack">
                        <div className="detail-metric-grid">
                            <DetailItem label="Actual Delivery Date" value={item.actualDate ? new Date(item.actualDate).toLocaleDateString() : 'N/A'} />
                            <DetailItem label="Actual Amount (Misc)" value={formatCurrency(item.actualAmount || 0)} />
                        </div>
                        
                        <div>
                            <h4 className="detail-section-title">Financial Performance</h4>
                            <div className="detail-metric-grid">
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Obligation</p>
                                    <DetailItem label="Date" value={formatDateMonthYear(item.actualObligationDate)} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Disbursement</p>
                                    <DetailItem label="Date" value={formatDateMonthYear(item.actualDisbursementDate)} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default OfficeRequirementDetail;
