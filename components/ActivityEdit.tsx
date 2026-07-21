
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity, philippineRegions, operatingUnits, ouToRegionMap } from '../constants';
import LocationPicker from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { getMonetaryChanges } from '../lib/logUtils';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { supabase } from '../supabaseClient';
import { Pencil, Trash2 } from 'lucide-react';
import { ObligationsEditor } from './accomplishment/ObligationsEditor';
import { DisbursementsEditor } from './accomplishment/DisbursementsEditor';
import { MonthYearPicker } from './ui/MonthYearPicker';
import { resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../lib/physicalAccomplishmentTimestamp';
import {
    ensureOriginalBudgetSnapshot,
    getBudgetLineAmount,
    getBudgetLineTag,
    isBudgetLineExcludedFromTargets,
    normalizeBudgetLineStatus,
    requestAdjustmentReason,
    summarizeBudgetAdjustments,
    writeBudgetItemAdjustmentHistory
} from '../lib/budgetLineAdjustments';

interface ActivityEditProps {
    mode: 'create' | 'details' | 'expenses' | 'accomplishment';
    activity?: Activity;
    ipos: IPO[];
    onBack: () => void;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
    forcedType?: 'Training' | 'Activity';
}

const commonInputClasses = "form-control";

const formatCurrency = (amount: number) => {
    const finiteAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(finiteAmount);
};

const formatActivityMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const defaultFormData: Activity = {
    id: 0,
    uid: '',
    type: 'Activity', 
    name: '',
    date: '',
    endDate: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation',
    expenses: [],
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: '',
    catchUpPlanRemarks: '',
    newTargetDate: '',
    actualDate: '',
    actualEndDate: '',
    actualParticipantsMale: 0,
    actualParticipantsFemale: 0,
    // Gender and Inclusivity Actuals
    actualPWD: 0,
    actualMuslim: 0,
    actualLGBTQ: 0,
    actualSoloParent: 0,
    actualSenior: 0,
    actualYouth: 0,
    status: 'Proposed'
};

const ActivityEdit: React.FC<ActivityEditProps> = ({ 
    mode, activity, ipos, onBack, onUpdateActivity, uacsCodes, referenceActivities = [], forcedType 
}) => {
    const { currentUser, hasAccess } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const isAdmin = currentUser?.role === 'Administrator';

    const [formData, setFormData] = useState<Activity>(activity || defaultFormData);
    const [initialActivity, setInitialActivity] = useState<Activity>(activity || defaultFormData);
    const [monthLockMessage, setMonthLockMessage] = useState('');

    const [activeTab, setActiveTab] = useState<'details' | 'expenses'>('details');
    const [selectedActivityType, setSelectedActivityType] = useState('');
    const [conductType, setConductType] = useState<'Single' | 'Multi-day' | 'Repeating'>('Single');
    const [repeatingEntries, setRepeatingEntries] = useState<any[]>([]);
    const [currentRepeatingEntry, setCurrentRepeatingEntry] = useState<any>({
        id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: []
    });
    
    // Filter state for IPO selection
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');

    // Expense Edit State
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [currentExpense, setCurrentExpense] = useState({
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
        amount: '',
        isRealignment: false,
        isSavings: false,
        isCancelled: false,
        adjustmentReason: '',
    });

    const budgetAdjustmentSummary = useMemo(() => summarizeBudgetAdjustments(formData.expenses || []), [formData.expenses]);

    // Helper to get month index from YYYY-MM-DD string
    const getMonthFromDateStr = (dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    // Helper for Actuals (Accomplishments)
    const updateActualDateFromMonth = (id: number, field: keyof ActivityExpense, monthIndex: string) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => {
                if (e.id === id) {
                    let newValue = '';
                    if (monthIndex !== '') {
                        const mIndex = parseInt(monthIndex);
                        const year = prev.fundingYear || new Date().getFullYear();
                        newValue = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
                    }
                    return { ...e, [field]: newValue };
                }
                return e;
            })
        }));
    };

    useEffect(() => {
        if (activity) {
            let processedActivity = { ...activity };
            // Virtualize legacy obligations for each expense on load if missing
            if (processedActivity.expenses) {
                processedActivity.expenses = processedActivity.expenses.map(exp => {
                    const hasAmount = (exp.actualObligationAmount || 0) > 0;
                    const hasNoObligations = !exp.obligations || exp.obligations.length === 0;
                    if (hasAmount && hasNoObligations) {
                        return {
                            ...exp,
                            obligations: [{
                                id: Date.now() + Math.random(),
                                date: exp.actualObligationDate || '',
                                amount: exp.actualObligationAmount || 0,
                                remarks: 'Legacy Record'
                            }]
                        };
                    }
                    return exp;
                });
            }
            setFormData(processedActivity);
            setInitialActivity(processedActivity);
            if (processedActivity.endDate && processedActivity.endDate !== processedActivity.date) {
                setConductType('Multi-day');
            } else {
                setConductType('Single');
            }
            if (activity.type === 'Training') {
                const ref = activity.reference_activity_id
                    ? referenceActivities?.find(ra => String(ra.id) === String(activity.reference_activity_id))
                    : referenceActivities?.find(ra => ra.component === activity.component && ra.type === 'Training');
                setSelectedActivityType(ref ? ref.activity_name : `${activity.component} Training`);
            } else {
                const ref = activity.reference_activity_id
                    ? referenceActivities?.find(ra => String(ra.id) === String(activity.reference_activity_id))
                    : undefined;
                setSelectedActivityType(ref ? ref.activity_name : activity.name);
            }
        } else {
            // Create Mode Defaults
            const userOu = currentUser?.operatingUnit || '';
            setFormData({
                ...defaultFormData,
                type: forcedType || 'Activity',
                operatingUnit: userOu,
                encodedBy: currentUser?.fullName || '',
                status: 'Proposed'
            });
            setConductType('Single');
            setIpoRegionFilter(ouToRegionMap[userOu] || 'All');
        }
        
        if (mode === 'expenses') setActiveTab('expenses');
    }, [activity, mode, forcedType, currentUser]);

    // Derived States
    const activityOptions = useMemo(() => {
        return referenceActivities
            .filter(ra => ra.component === formData.component)
            .filter(ra => forcedType ? ra.type === forcedType : true)
            .map(ra => ra.activity_name);
    }, [formData.component, referenceActivities, forcedType]);

    // Filtered IPO List
    const filteredIpos = useMemo(() => {
        let current = ipos;
        if (ipoRegionFilter !== 'All') {
            current = current.filter(i => i.region === ipoRegionFilter);
        }
        return current.sort((a, b) => a.name.localeCompare(b.name));
    }, [ipos, ipoRegionFilter]);

    // Status Logic
    const availableStatuses = useMemo(() => {
        return ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
    }, []);

    const isDetailsLocked = useMemo(() => {
        return false;
    }, []);

    // --- Handlers ---

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'component') {
            setSelectedActivityType('');
        }

        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'component') {
                newData.reference_activity_id = null;
            }
            if (name === 'operatingUnit') {
                const mappedRegion = ouToRegionMap[value] || 'All';
                setIpoRegionFilter(mappedRegion);
                newData.participatingIpos = [];
            }
            if (name === 'date' && conductType === 'Single') newData.endDate = value;
            if (name === 'actualDate' && conductType === 'Single') newData.actualEndDate = value;
            return newData;
        });
        
        if (missingFields.includes(name)) {
            setMissingFields(prev => prev.filter(f => f !== name));
        }
    };

    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numValue = parseFloat(value) || 0;
        
        setFormData(prev => {
            const newData = { ...prev, [name]: numValue };
            
            if (name === 'fundingYear') {
                newData.expenses = newData.expenses.map(exp => {
                    const updatedExp = { ...exp };
                    if (updatedExp.actualObligationDate) {
                        const month = getMonthFromDateStr(updatedExp.actualObligationDate);
                        if (month !== '') {
                            updatedExp.actualObligationDate = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    if (updatedExp.actualDisbursementDate) {
                        const month = getMonthFromDateStr(updatedExp.actualDisbursementDate);
                        if (month !== '') {
                            updatedExp.actualDisbursementDate = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    return updatedExp;
                });
            }
            
            return newData;
        });
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;
        setSelectedActivityType(selectedName);
        const ref = referenceActivities?.find(ra => ra.activity_name === selectedName && ra.component === formData.component);
        const type = ref?.type || 'Activity'; 
        
        if (missingFields.includes('type')) {
            setMissingFields(prev => prev.filter(f => f !== 'type'));
        }

        setFormData(prev => ({ 
            ...prev, 
            name: type === 'Training' && (!activity || activity.type !== 'Training') ? '' : selectedName, 
            type: type,
            reference_activity_id: ref?.id ? Number(ref.id) : null
        }));
    };

    const handleConductTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        setConductType(val);
        setFormData(prev => {
             if (val === 'Single') return { ...prev, endDate: prev.date, actualEndDate: prev.actualDate };
             if (val === 'Repeating') return { ...prev, date: '', endDate: '' };
             return prev;
        });
    };

    // Repeating Activity Logic
    const handleRepeatingEntryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: checked }));
        } else {
             const isNum = type === 'number';
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: isNum ? (value === '' ? '' : parseFloat(value)) : value }));
        }
        
        if (name === 'date' && !currentRepeatingEntry.isMultiDay) {
             setCurrentRepeatingEntry(prev => ({ ...prev, endDate: value }));
        }
    };
    
    const handleRepeatingIpoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setCurrentRepeatingEntry(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleAddRepeatingEntry = () => {
        if (!currentRepeatingEntry.date) {
            alert("Date is required.");
            return;
        }
        const newEntry = { ...currentRepeatingEntry, id: Date.now() };
        setRepeatingEntries(prev => [...prev, newEntry]);
        setCurrentRepeatingEntry({ id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: [] });
    };

    // Budget Handlers
    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (currentExpense.expenseParticular) {
            const ot = currentExpense.objectType;
            const ep = currentExpense.expenseParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
            Object.entries(uacsCodes).forEach(([ot, eps]) => {
                Object.entries(eps).forEach(([ep, codesObj]) => {
                    Object.entries(codesObj as Record<string, string>).forEach(([code, desc]) => {
                        codes.push({ code, desc });
                    });
                });
            });
        }
        return codes;
    }, [currentExpense.expenseParticular, currentExpense.objectType, uacsCodes]);

    const getUacsDescription = (ot: string, ep: string, code: string) => {
        if (uacsCodes[ot] && uacsCodes[ot][ep] && uacsCodes[ot][ep][code]) {
            return uacsCodes[ot][ep][code];
        }
        return '';
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'objectType') {
            setCurrentExpense(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentExpense(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else if (name === 'uacsCode') {
            let foundOt = currentExpense.objectType;
            let foundEp = currentExpense.expenseParticular;
            
            let isMatch = false;
            if (foundEp && uacsCodes[foundOt] && uacsCodes[foundOt][foundEp] && uacsCodes[foundOt][foundEp][value]) {
                isMatch = true;
            }

            if (!isMatch) {
                for (const ot in uacsCodes) {
                    for (const ep in uacsCodes[ot]) {
                        if (uacsCodes[ot][ep][value]) {
                            foundOt = ot as ObjectType;
                            foundEp = ep;
                            break;
                        }
                    }
                }
            }
            
            setCurrentExpense(prev => ({ ...prev, uacsCode: value, objectType: foundOt, expenseParticular: foundEp }));
        } else {
            setCurrentExpense(prev => ({...prev, [name]: value}));
        }
    };

    const handleEditExpense = (expense: ActivityExpense) => {
        const normalizedExpense = normalizeBudgetLineStatus(expense);
        setEditingExpenseId(normalizedExpense.id);
        setCurrentExpense({
            objectType: normalizedExpense.objectType,
            expenseParticular: normalizedExpense.expenseParticular,
            uacsCode: normalizedExpense.uacsCode,
            obligationMonth: normalizedExpense.obligationMonth,
            disbursementMonth: normalizedExpense.disbursementMonth,
            amount: String(normalizedExpense.amount),
            isRealignment: !!normalizedExpense.isRealignment,
            isSavings: !!normalizedExpense.isSavings,
            isCancelled: !!normalizedExpense.isCancelled,
            adjustmentReason: normalizedExpense.adjustmentReason || '',
        });
    }

    const resetCurrentExpense = () => {
        setCurrentExpense({ objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '', amount: '', isRealignment: false, isSavings: false, isCancelled: false, adjustmentReason: '' });
    };

    const handleCancelEditExpense = () => {
        setEditingExpenseId(null);
        resetCurrentExpense();
    }

    const persistExpenseAdjustmentHistory = async (action: any, beforeSnapshot: any, afterSnapshot: any, reason: string) => {
        if (!activity?.id) return;
        try {
            await writeBudgetItemAdjustmentHistory({
                sourceType: 'activity_expense',
                parentId: activity.id,
                itemId: afterSnapshot?.id || beforeSnapshot?.id,
                action,
                beforeSnapshot,
                afterSnapshot,
                reason,
                currentUser,
            });
        } catch {
            // Keep the local edit; the parent activity save remains authoritative for the nested expense.
        }
    };

    const handleAddExpense = async () => {
        if (!currentExpense.amount || !currentExpense.obligationMonth || !currentExpense.disbursementMonth || !currentExpense.uacsCode) {
            alert('Please fill out all expense fields (UACS, Dates, Amount).'); return;
        }
        if ((currentExpense.isCancelled || currentExpense.isRealignment || currentExpense.isSavings) && !currentExpense.adjustmentReason.trim()) {
            alert('A short reason is required when adding a cancelled, realignment, or savings expense.');
            return;
        }
        const newExpense: ActivityExpense = ensureOriginalBudgetSnapshot(normalizeBudgetLineStatus({
            id: Date.now(),
            ...currentExpense,
            amount: parseFloat(currentExpense.amount),
            // Init actuals
            actualObligationAmount: 0, actualObligationDate: '', actualDisbursementAmount: 0, actualDisbursementDate: '', actualAmount: 0
        }));

        if (editingExpenseId !== null) {
            const beforeExpense = formData.expenses.find(e => e.id === editingExpenseId);
            const afterExpense = { ...beforeExpense, ...newExpense, id: editingExpenseId };
            setFormData(prev => ({ ...prev, expenses: prev.expenses.map(e => e.id === editingExpenseId ? afterExpense : e) }));
            if (beforeExpense && (beforeExpense.isCancelled || beforeExpense.isRealignment || beforeExpense.isSavings || afterExpense.isCancelled || afterExpense.isRealignment || afterExpense.isSavings)) {
                await persistExpenseAdjustmentHistory(
                    afterExpense.isCancelled ? 'cancel'
                        : afterExpense.isRealignment ? 'tag_realignment'
                            : afterExpense.isSavings ? 'tag_savings'
                                : beforeExpense.isCancelled ? 'restore'
                                    : 'clear_tag',
                    beforeExpense,
                    afterExpense,
                    currentExpense.adjustmentReason || 'Updated expense adjustment.'
                );
            }
            setEditingExpenseId(null);
        } else {
            setFormData(prev => ({ ...prev, expenses: [...prev.expenses, newExpense] }));
            if (newExpense.isRealignment || newExpense.isSavings) {
                await persistExpenseAdjustmentHistory('create_adjustment_item', null, newExpense, newExpense.adjustmentReason || 'Created expense adjustment item.');
            }
        }
        resetCurrentExpense();
    };

    const handleExpenseTagChange = async (expenseId: number, tag: 'Cancelled' | 'Realignment' | 'Savings' | null) => {
        const beforeExpense = formData.expenses.find(e => e.id === expenseId);
        if (!beforeExpense) return;
        const reason = requestAdjustmentReason(tag ? `marking this expense as ${tag}` : 'clearing this expense tag');
        if (!reason) return;
        const afterExpense = {
            ...beforeExpense,
            isCancelled: tag === 'Cancelled',
            isRealignment: tag === 'Realignment',
            isSavings: tag === 'Savings',
            adjustmentReason: reason,
        };
        setFormData(prev => ({ ...prev, expenses: prev.expenses.map(e => e.id === expenseId ? afterExpense : e) }));
        await persistExpenseAdjustmentHistory(tag === 'Cancelled' ? 'cancel' : tag === 'Realignment' ? 'tag_realignment' : tag === 'Savings' ? 'tag_savings' : beforeExpense.isCancelled ? 'restore' : 'clear_tag', beforeExpense, afterExpense, reason);
    };

    const handleRemoveExpense = async (expense: ActivityExpense) => {
        const isSavedLine = !!(activity?.expenses || []).some(existing => existing.id === expense.id);
        const hasActuals = ((expense.obligations?.length || 0) > 0)
            || ((expense.disbursements?.length || 0) > 0)
            || Number(expense.actualObligationAmount) > 0
            || Number(expense.actualDisbursementAmount) > 0;
        if (isSavedLine || hasActuals) {
            await handleExpenseTagChange(expense.id, 'Cancelled');
            return;
        }
        setFormData(prev => ({...prev, expenses: prev.expenses.filter(item => item.id !== expense.id)}));
        if (editingExpenseId === expense.id) {
            handleCancelEditExpense();
        }
    };

    // Accomplishment Handlers
    const handleExpenseAccomplishmentChange = (id: number, field: keyof ActivityExpense, value: any) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const validateActivityActualMonth = async (month?: string) => {
        if (!month || !activity) return true;
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
                ? originalRecords.find(item => item.id === record.id)
                : originalRecords[index];
            return !!record.date && (!originalRecord || hasMonthChanged(record.date, originalRecord.date));
        })
        .map(record => record.date)
        .filter(Boolean) as string[];

    const validateActivityAccomplishmentMonthsForSave = async () => {
        if (mode !== 'accomplishment') return true;
        const months = [
            ...(hasMonthChanged(formData.actualDate, initialActivity.actualDate) ? [formData.actualDate] : []),
            ...(hasMonthChanged(formData.actualEndDate, initialActivity.actualEndDate) ? [formData.actualEndDate] : []),
            ...formData.expenses.flatMap((exp, index) => {
                const originalExpense = initialActivity.expenses.find(item => item.id === exp.id) || initialActivity.expenses[index];
                return [
                    ...getChangedRecordMonths(exp.obligations || [], originalExpense?.obligations || []),
                    ...getChangedRecordMonths(exp.disbursements || [], originalExpense?.disbursements || []),
                ];
            }),
        ].filter(Boolean) as string[];
        for (const month of months) {
            if (!(await validateActivityActualMonth(month))) return false;
        }
        return true;
    };

    const handleActualConductDateChange = async (field: 'actualDate' | 'actualEndDate', value: string) => {
        if (value && !(await validateActivityActualMonth(value))) return;
        setFormData(prev => ({
            ...prev,
            [field]: value,
            ...(field === 'actualDate' && conductType === 'Single' ? { actualEndDate: value } : {}),
        }));
        if (missingFields.includes(field)) {
            setMissingFields(prev => prev.filter(item => item !== field));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (mode !== 'create' && activity) {
            const action = mode === 'details'
                ? 'editDetails'
                : mode === 'expenses'
                    ? 'editBudget'
                    : 'editPhysicalAccomplishment';
            const hasModuleAccess = mode === 'accomplishment'
                ? hasAccess('Accomplishment - Physical', 'edit') || hasAccess('Accomplishment - Financial', 'edit')
                : hasAccess('Activities', 'edit');
            const decision = getStatusDecision({
                moduleKey: 'activities',
                item: activity,
                action,
                hasModuleAccess,
            });
            const allowed = await ensureDecisionAllowed(decision, {
                moduleKey: 'activities',
                item: activity,
                itemId: activity.id,
                itemName: activity.name,
                status: activity.status,
                action,
                entityType: 'activity',
            });
            if (!allowed) return;
        }

        if (!(await validateActivityAccomplishmentMonthsForSave())) return;
        
        if ((mode === 'create' && activeTab === 'details') || mode === 'details') {
            const requiredFields = ['component', 'type', 'date', 'location'];
            if (formData.type === 'Training') requiredFields.push('name');
            if (conductType === 'Multi-day') requiredFields.push('endDate');

            const missing = requiredFields.filter(field => !formData[field as keyof Activity]);
            if (missing.length > 0) {
                setMissingFields(missing);
                alert('Please fill out all required fields before proceeding.');
                return;
            }
        }

        let activitiesToSave: Activity[] = [];
        const currentYear = new Date().getFullYear();
        const prefix = formData.type === 'Training' ? 'TRN' : 'ACT';
        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        if (mode === 'create') {
             if (conductType === 'Repeating') {
                activitiesToSave = repeatingEntries.map((entry, idx) => ({
                    ...formData,
                    uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${idx}`,
                    date: entry.date,
                    endDate: entry.endDate || entry.date, 
                    participantsMale: entry.participantsMale,
                    participantsFemale: entry.participantsFemale,
                    participatingIpos: entry.participatingIpos,
                    expenses: formData.expenses.map((exp, eIdx) => ({ ...exp, id: Date.now() + Math.random() + eIdx })), 
                    id: 0,
                    workflow_status,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    history: [{ date: new Date().toISOString(), event: "Created (Repeating)", user: currentUser?.fullName || "System" }]
                }));
             } else {
                 activitiesToSave = [{
                     ...formData,
                     uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
                     id: 0,
                     workflow_status,
                     created_at: new Date().toISOString(),
                     updated_at: new Date().toISOString(),
                     history: [{ date: new Date().toISOString(), event: "Created", user: currentUser?.fullName || "System" }]
                 }];
             }
        } else {
            // Edit Mode
            const submittedAt = new Date().toISOString();
            let updatedStatus = formData.status;
            // Auto-complete logic for Accomplishment Mode if actual date is present
            if (mode === 'accomplishment') {
                 if (formData.actualDate) {
                     updatedStatus = 'Completed';
                 }
            }

            const physicalActualFields: (keyof Activity)[] = [
                'actualDate',
                'actualEndDate',
                'actualParticipantsMale',
                'actualParticipantsFemale',
                'actualPWD',
                'actualMuslim',
                'actualLGBTQ',
                'actualSoloParent',
                'actualSenior',
                'actualYouth'
            ];
            const physicalAccomplishmentChanged = mode === 'accomplishment'
                ? physicalActualFields.some(field => valuesDiffer(initialActivity[field], formData[field]))
                : valuesDiffer(initialActivity.actualDate, formData.actualDate);
            const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                hasPhysicalAccomplishment: !!formData.actualDate,
                hasChanged: physicalAccomplishmentChanged,
                previousSubmittedAt: initialActivity.physical_accomplishment_submitted_at,
                submittedAt
            });

            activitiesToSave = [{
                ...formData,
                status: updatedStatus,
                physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                updated_at: submittedAt,
                history: [...(formData.history || []), { date: submittedAt, event: `Updated (${mode})`, user: currentUser?.fullName || "System" }]
            }];
        }

        if (supabase) {
            try {
                for (let i = 0; i < activitiesToSave.length; i++) {
                    const act = activitiesToSave[i];
                    const { id, participating_ipo_ids, ...payload } = act;
                    
                    // Sanitize date fields: convert empty strings to null
                    const sanitizedPayload: any = { ...payload };
                    if (sanitizedPayload.reference_activity_id === '' || sanitizedPayload.reference_activity_id === undefined) {
                        sanitizedPayload.reference_activity_id = null;
                    }
                    const dateFields = ['date', 'endDate', 'newTargetDate', 'actualDate', 'actualEndDate'];
                    dateFields.forEach(field => {
                        if (sanitizedPayload[field] === '') {
                            sanitizedPayload[field] = null;
                        }
                    });
                    if (sanitizedPayload.expenses) {
                        sanitizedPayload.expenses = sanitizedPayload.expenses.map((exp: any) => {
                            const sanitizedExp = { ...exp };
                            if (sanitizedExp.obligations && sanitizedExp.obligations.length === 0) {
                                sanitizedExp.actualObligationAmount = 0;
                                sanitizedExp.actualObligationDate = null;
                            } else if (sanitizedExp.obligations && sanitizedExp.obligations.length > 0) {
                                const latestOb = [...sanitizedExp.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                sanitizedExp.actualObligationAmount = sanitizedExp.obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
                                sanitizedExp.actualObligationDate = latestOb.date;
                            }
                            if (sanitizedExp.disbursements && sanitizedExp.disbursements.length === 0) {
                                sanitizedExp.actualDisbursementAmount = 0;
                                sanitizedExp.actualDisbursementDate = null;
                            } else if (sanitizedExp.disbursements && sanitizedExp.disbursements.length > 0) {
                                const latestDb = [...sanitizedExp.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                sanitizedExp.actualDisbursementAmount = sanitizedExp.disbursements.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
                                sanitizedExp.actualDisbursementDate = latestDb.date;
                            }
                            ['actualObligationDate', 'actualDisbursementDate'].forEach(field => {
                                if (sanitizedExp[field] === '') {
                                    sanitizedExp[field] = null;
                                }
                            });
                            return sanitizedExp;
                        });
                    }

                    if (mode === 'create') {
                         const { data, error } = await supabase.from('activities').insert([sanitizedPayload]).select();
                         if (error) throw error;
                         if (data && data.length > 0) {
                             const createdId = data[0].id;
                             activitiesToSave[i].id = createdId;
                             logAction(`Created ${act.type}`, act.name, undefined, act.type, String(createdId));
                             
                             // Sync obligations for new activity
                             await syncActivityObligations(createdId, act.expenses);
                             await syncActivityDisbursements(createdId, act.expenses);
                         }
                    } else {
                         const { error } = await supabase.from('activities').update(sanitizedPayload).eq('id', activity!.id);
                         if (error) throw error;
                         
                         const metadata = getMonetaryChanges(activity, sanitizedPayload, 'Activity');
                         logAction(`Updated ${act.type}`, act.name, undefined, act.type, String(activity!.id), metadata);
                         
                         // Sync obligations for updated activity
                         await syncActivityObligations(activity!.id, act.expenses);
                         await syncActivityDisbursements(activity!.id, act.expenses);
                    }
                    
                    // IPO History Log
                    for (const ipoName of act.participatingIpos) {
                        const ipo = ipos.find(i => i.name === ipoName);
                        if(ipo) await addIpoHistory(ipo.id, `${mode === 'create' ? 'Created' : 'Updated'} ${act.type}: ${act.name}`);
                    }
                }
            } catch (err: any) {
                alert("Error saving: " + err.message);
                return;
            }
        } else {
            if (mode === 'create') {
                for (let i = 0; i < activitiesToSave.length; i++) {
                    activitiesToSave[i].id = Date.now() + i;
                }
            }
        }
        
        for (const act of activitiesToSave) {
            onUpdateActivity(act);
        }
        if (mode === 'create') alert(`Saved ${activitiesToSave.length} activities.`);
        onBack();
    };

    const syncActivityObligations = async (parentId: number, expenses: ActivityExpense[]) => {
        if (!supabase) return;
        const entityType = 'activity_expense';
        
        // Delete old
        await supabase.from('financial_obligations')
            .delete()
            .eq('entity_type', entityType)
            .eq('parent_id', parentId);
        
        // Insert new from all expenses
        const syncPayload: any[] = [];
        expenses.forEach(exp => {
            if (exp.obligations && exp.obligations.length > 0) {
                // Also update legacy fields for fallback reporting
                const latestOb = [...exp.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                exp.actualObligationAmount = exp.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                exp.actualObligationDate = latestOb.date;

                exp.obligations.forEach(o => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: exp.id?.toString() || null,
                        obligation_date: o.date,
                        amount: o.amount || 0,
                        remarks: o.remarks || ''
                    });
                });
            } else {
                exp.actualObligationAmount = 0;
                exp.actualObligationDate = null;
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_obligations').insert(syncPayload);
        }
    };

    const syncActivityDisbursements = async (parentId: number, expenses: ActivityExpense[]) => {
        if (!supabase) return;
        const entityType = 'activity_expense';
        
        await supabase.from('financial_disbursements').delete().eq('entity_type', entityType).eq('parent_id', parentId);
        
        const syncPayload: any[] = [];
        expenses.forEach(exp => {
            if (exp.disbursements && exp.disbursements.length > 0) {
                const latestDb = [...exp.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                exp.actualDisbursementAmount = exp.disbursements.reduce((sum, d) => sum + (d.amount || 0), 0);
                exp.actualDisbursementDate = latestDb.date;

                exp.disbursements.forEach(d => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: exp.id?.toString() || null,
                        disbursement_date: d.date,
                        amount: d.amount || 0,
                        remarks: d.remarks || ''
                    });
                });
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_disbursements').insert(syncPayload);
        }
    };

    const TabButton = ({ name, label }: { name: any, label: string }) => (
        <button type="button" onClick={() => setActiveTab(name)} className={`data-tab ${activeTab === name ? 'is-active' : ''}`}>{label}</button>
    );

    return (
        <div className="form-page animate-fadeIn">
             <div className="detail-header">
                <div className="detail-heading">
                <h1 className="detail-title">
                    {mode === 'create' ? 'Create New Activity' : `Edit ${mode === 'expenses' ? 'Expenses' : mode === 'accomplishment' ? 'Accomplishment' : 'Details'}: ${formData.name}`}
                </h1>
                </div>
                <button onClick={onBack} className="btn btn-secondary">Back to List</button>
            </div>

            <form onSubmit={handleSubmit} className="form-card">
                {monthLockMessage && (
                    <div className="notice notice--warning" role="status">
                        {monthLockMessage}
                    </div>
                )}
                
                {/* Mode: Create - Tabs */}
                {mode === 'create' && (
                    <div className="data-tabs">
                        <div className="data-tabs__nav">
                            <button type="button" onClick={() => setActiveTab('details')} className={`data-tab ${activeTab === 'details' ? 'is-active' : ''}`}>Basic Info</button>
                            <button type="button" onClick={() => setActiveTab('expenses')} className={`data-tab ${activeTab === 'expenses' ? 'is-active' : ''}`}>Expenses</button>
                        </div>
                    </div>
                )}

                {/* CREATE / DETAILS MODE */}
                {((mode === 'create' && activeTab === 'details') || mode === 'details') && (
                    <div className="form-stack form-stack--spacious">
                        <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                            <legend className="form-legend">Basic Information</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses} disabled={mode === 'create'}>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Operating Unit</label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit || ''} 
                                        onChange={handleInputChange} 
                                        className={commonInputClasses} 
                                        disabled={!isAdmin}
                                        title={!isAdmin ? "Only Administrators can edit the Operating Unit" : ""}
                                    >
                                        <option value="">Select Operating Unit</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Component <span className="form-required">*</span></label>
                                    <select name="component" value={formData.component} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('component') ? 'form-control--invalid' : ''}`}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Activity Type <span className="form-required">*</span></label>
                                    <select value={selectedActivityType} onChange={handleActivityTypeChange} className={`${commonInputClasses} ${missingFields.includes('type') ? 'form-control--invalid' : ''}`}>
                                        <option value="">Select Activity</option>
                                        {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                {formData.type === 'Training' && (
                                    <div className="form-field--full">
                                        <label className="form-label">Specific Title <span className="form-required">*</span></label>
                                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'form-control--invalid' : ''}`} required />
                                    </div>
                                )}
                                
                                {(mode === 'create' || mode === 'details') && (
                                    <div>
                                        <label className="form-label">Conduct Type</label>
                                        <select value={conductType} onChange={handleConductTypeChange} className={commonInputClasses} disabled={isDetailsLocked}>
                                            <option value="Single">Single Day</option>
                                            <option value="Multi-day">Multi-Day</option>
                                            {mode === 'create' && <option value="Repeating">Repeating Entries</option>}
                                        </select>
                                    </div>
                                )}

                                {conductType !== 'Repeating' && (
                                    <>
                                        <div>
                                            <label className="form-label">Start Date <span className="form-required">*</span></label>
                                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('date') ? 'form-control--invalid' : ''}`} />
                                        </div>
                                        {conductType === 'Multi-day' && (
                                            <div>
                                                <label className="form-label">End Date <span className="form-required">*</span></label>
                                                <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('endDate') ? 'form-control--invalid' : ''}`} />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="form-label">Location <span className="form-required">*</span></label>
                                    <div className={missingFields.includes('location') ? 'form-control-wrap form-control--invalid' : ''}>
                                        <LocationPicker value={formData.location} onChange={(val) => {
                                            setFormData(prev => ({...prev, location: val}));
                                            if (missingFields.includes('location')) {
                                                setMissingFields(prev => prev.filter(f => f !== 'location'));
                                            }
                                        }} />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label">Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} className={commonInputClasses} rows={3} />
                                </div>
                            </div>
                        </fieldset>
                        
                        {/* Participants Section */}
                        {conductType !== 'Repeating' && (
                            <>
                                <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                                    <legend className="form-legend">Participants</legend>
                                    <div className="form-grid">
                                        <div><label className="form-label">Male</label><input type="number" name="participantsMale" value={formData.participantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="form-label">Female</label><input type="number" name="participantsFemale" value={formData.participantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        
                                        <div className="form-field--full">
                                            <label className="form-label">Filter IPOs by Region</label>
                                            <select value={ipoRegionFilter} onChange={(e) => setIpoRegionFilter(e.target.value)} className={commonInputClasses}>
                                                <option value="All">All Regions</option>
                                                {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-field--full">
                                            <label className="form-label">Participating IPOs</label>
                                            <select multiple value={formData.participatingIpos} onChange={(e) => setFormData(prev => ({ ...prev, participatingIpos: Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value) }))} className={`${commonInputClasses} form-control--multiselect`}>
                                                {filteredIpos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                                            </select>
                                            <p className="form-help">Hold Ctrl (Cmd on Mac) to select multiple IPOs.</p>
                                        </div>
                                    </div>
                                </fieldset>

                                <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                                    <legend className="form-legend">Funding</legend>
                                    <div className="form-grid form-grid--compact">
                                        <div><label className="form-label">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="form-label">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                        <div>
                                            <label className="form-label">Tier</label>
                                            <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                <option value="">Select Tier</option>
                                                {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-check-group">
                                            <label className="form-check">
                                                <input type="checkbox" checked={formData.isRealignment || false} onChange={e => setFormData(prev => ({ ...prev, isRealignment: e.target.checked, isSavings: e.target.checked ? false : prev.isSavings }))} className="form-checkbox" />
                                                <span>Realignment</span>
                                            </label>
                                            <label className="form-check">
                                                <input type="checkbox" checked={formData.isSavings || false} onChange={e => setFormData(prev => ({ ...prev, isSavings: e.target.checked, isRealignment: e.target.checked ? false : prev.isRealignment }))} className="form-checkbox" />
                                                <span>Savings</span>
                                            </label>
                                        </div>
                                    </div>
                                </fieldset>
                            </>
                        )}
                        
                        {/* Repeating Entry Form (Create Only) */}
                        {mode === 'create' && conductType === 'Repeating' && (
                             <fieldset className="form-fieldset form-fieldset--highlight">
                                <legend className="form-legend">Repeating Schedule</legend>
                                <div className="form-subsection form-grid form-grid--compact">
                                    <div className="form-field--full form-check-group">
                                        <input type="checkbox" name="isMultiDay" checked={currentRepeatingEntry.isMultiDay} onChange={handleRepeatingEntryChange} className="form-checkbox" />
                                        <label className="form-label form-label--inline">Is Multi-day?</label>
                                    </div>
                                    <div><label className="form-label form-label--compact">Start Date</label><input type="date" name="date" value={currentRepeatingEntry.date} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    {currentRepeatingEntry.isMultiDay && <div><label className="form-label form-label--compact">End Date</label><input type="date" name="endDate" value={currentRepeatingEntry.endDate} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>}
                                    <div><label className="form-label form-label--compact">Male</label><input type="number" name="participantsMale" value={currentRepeatingEntry.participantsMale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    <div><label className="form-label form-label--compact">Female</label><input type="number" name="participantsFemale" value={currentRepeatingEntry.participantsFemale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    
                                    <div className="md:col-span-4">
                                         <label className="form-label form-label--compact">Filter IPOs by Region</label>
                                         <select value={ipoRegionFilter} onChange={(e) => setIpoRegionFilter(e.target.value)} className={commonInputClasses}>
                                            <option value="All">All Regions</option>
                                            {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>

                                    <div className="md:col-span-4">
                                        <label className="form-label form-label--compact">IPOs</label>
                                        <select multiple value={currentRepeatingEntry.participatingIpos} onChange={handleRepeatingIpoSelect} className={`${commonInputClasses} h-20`}>{filteredIpos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}</select>
                                    </div>
                                    <div className="form-field--full"><button type="button" onClick={handleAddRepeatingEntry} className="btn btn-primary btn-block">Add to Schedule</button></div>
                                </div>
                                {/* List of entries to be created */}
                                <div className="form-repeat-list">
                                    {repeatingEntries.map((entry, idx) => (
                                        <div key={idx} className="form-repeat-card">
                                            <span>{entry.date} {entry.endDate ? `to ${entry.endDate}` : ''} | M:{entry.participantsMale} F:{entry.participantsFemale}</span>
                                            <span>{entry.participatingIpos.length} IPOs</span>
                                        </div>
                                    ))}
                                </div>
                             </fieldset>
                        )}
                    </div>
                )}

                {/* EXPENSES MODE (and Create Tab) */}
                {((mode === 'create' && activeTab === 'expenses') || mode === 'expenses') && (
                     <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                        <legend className="form-legend">Expenses</legend>
                        <div className="mb-4 budget-item-list">
                            {formData.expenses.map((exp, idx) => (
                                <div key={idx} className={`budget-item-card ${editingExpenseId === exp.id ? 'budget-item-card--editing' : ''} ${isBudgetLineExcludedFromTargets(exp) ? 'budget-item-card--excluded' : ''} ${exp.isCancelled ? 'budget-item-card--cancelled' : ''} ${exp.isRealignment ? 'budget-item-card--realignment' : ''} ${exp.isSavings ? 'budget-item-card--savings' : ''}`}>
                                    <div className="budget-item-card__summary">
                                        <span className="budget-item-card__title">
                                            {exp.expenseParticular || 'Unspecified expense'}
                                            {getBudgetLineTag(exp) && <span className={`budget-line-badge budget-line-badge--${getBudgetLineTag(exp)?.toLowerCase()} ml-2`}>{getBudgetLineTag(exp)}</span>}
                                        </span>
                                        <div className="budget-item-card__meta">
                                            <div>
                                                {exp.uacsCode || 'No UACS code'}
                                                {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                                    <> - {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</>
                                                )}
                                            </div>
                                            <span className="block mt-1">
                                                Obligation: {formatActivityMonthYear(exp.obligationMonth)} | Disbursement: {formatActivityMonthYear(exp.disbursementMonth)}
                                            </span>
                                        </div>
                                        {isBudgetLineExcludedFromTargets(exp) && <span className="budget-line-exclusion-note">{exp.adjustmentReason || 'No adjustment justification recorded.'}</span>}
                                    </div>
                                    {!isDetailsLocked && (
                                        <div className="budget-item-card__actions">
                                            <span className="budget-item-card__total">{formatCurrency(getBudgetLineAmount(exp))}</span>
                                            <div className="budget-item-card__buttons">
                                                <button type="button" onClick={() => handleEditExpense(exp)} className="table-action table-action--primary" title="Edit expense" aria-label="Edit expense">
                                                    <Pencil className="btn-symbol" aria-hidden="true" />
                                                </button>
                                                <button type="button" onClick={() => handleRemoveExpense(exp)} className="table-action table-action--danger" title="Remove expense" aria-label="Remove expense">
                                                    <Trash2 className="btn-symbol" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        {!isDetailsLocked && (
                            <div className="form-subsection">
                                <h4 className="form-section__title">{editingExpenseId !== null ? 'Update Expense' : 'Add New Expense'}</h4>
                                <div className="form-grid form-grid--compact form-grid--align-end">
                                    {/* Row 1: UACS Selection */}
                                    <div><label className="form-label form-label--compact">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="form-label form-label--compact">Particular</label><select name="expenseParticular" value={currentExpense.expenseParticular} onChange={handleExpenseChange} className={commonInputClasses}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="form-label form-label--compact">UACS Code</label>
                                        <input 
                                            type="text"
                                            name="uacsCode" 
                                            value={currentExpense.uacsCode} 
                                            onChange={handleExpenseChange} 
                                            list="uacs-codes-list-activity-edit"
                                            placeholder="Search UACS..."
                                            className={commonInputClasses}
                                        />
                                        <datalist id="uacs-codes-list-activity-edit">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                        {currentExpense.uacsCode && availableUacsCodes.find(c => c.code === currentExpense.uacsCode)?.desc && (
                                            <p className="form-help">{availableUacsCodes.find(c => c.code === currentExpense.uacsCode)?.desc}</p>
                                        )}
                                    </div>
                                    
                                    {/* Row 2: Financial Details */}
                                    <div>
                                        <label className="form-label form-label--compact">Obligation Month</label>
                                        <MonthYearPicker
                                            value={currentExpense.obligationMonth}
                                            onChange={(val) => setCurrentExpense(prev => ({ ...prev, obligationMonth: val }))}
                                            placeholder="Select month"
                                            defaultYear={formData.fundingYear}
                                            className="h-9"
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label form-label--compact">Disbursement Month</label>
                                        <MonthYearPicker
                                            value={currentExpense.disbursementMonth}
                                            onChange={(val) => setCurrentExpense(prev => ({ ...prev, disbursementMonth: val }))}
                                            placeholder="Select month"
                                            defaultYear={formData.fundingYear}
                                            className="h-9"
                                        />
                                    </div>
                                    <div><label className="form-label form-label--compact">Amount</label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={commonInputClasses} /></div>
                                    <div className="md:col-span-3 budget-line-adjustment-options">
                                        {editingExpenseId !== null && (
                                            <label className="form-check">
                                                <input
                                                    type="checkbox"
                                                    checked={currentExpense.isCancelled}
                                                    onChange={e => setCurrentExpense(prev => ({
                                                        ...prev,
                                                        isCancelled: e.target.checked,
                                                        isRealignment: e.target.checked ? false : prev.isRealignment,
                                                        isSavings: e.target.checked ? false : prev.isSavings,
                                                    }))}
                                                    className="form-checkbox"
                                                />
                                                Cancelled
                                            </label>
                                        )}
                                        <label className="form-check">
                                            <input
                                                type="checkbox"
                                                checked={currentExpense.isRealignment}
                                                onChange={e => setCurrentExpense(prev => ({
                                                    ...prev,
                                                    isRealignment: e.target.checked,
                                                    isCancelled: e.target.checked ? false : prev.isCancelled,
                                                    isSavings: e.target.checked ? false : prev.isSavings,
                                                }))}
                                                className="form-checkbox"
                                            />
                                            Realignment
                                        </label>
                                        <label className="form-check">
                                            <input
                                                type="checkbox"
                                                checked={currentExpense.isSavings}
                                                onChange={e => setCurrentExpense(prev => ({
                                                    ...prev,
                                                    isSavings: e.target.checked,
                                                    isCancelled: e.target.checked ? false : prev.isCancelled,
                                                    isRealignment: e.target.checked ? false : prev.isRealignment,
                                                }))}
                                                className="form-checkbox"
                                            />
                                            Savings
                                        </label>
                                        {(currentExpense.isCancelled || currentExpense.isRealignment || currentExpense.isSavings) && (
                                            <input type="text" name="adjustmentReason" value={currentExpense.adjustmentReason} onChange={handleExpenseChange} placeholder="Reason for this adjustment" className={`${commonInputClasses} budget-line-adjustment-options__reason`} />
                                        )}
                                    </div>
                                
                                    <div className="form-field--full form-action-row">
                                        {editingExpenseId !== null && (
                                            <button type="button" onClick={handleCancelEditExpense} className="btn btn-secondary">Cancel</button>
                                        )}
                                        <button type="button" onClick={handleAddExpense} className="btn btn-primary">
                                            {editingExpenseId !== null ? 'Update Expense' : 'Add Expense'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="budget-adjustment-summary">
                            <div className="budget-adjustment-summary__header">
                                <h4>Expense Calculator</h4>
                            </div>
                            <div className="budget-adjustment-summary__grid">
                                <div><span>Allocation</span><strong>{formatCurrency(budgetAdjustmentSummary.originalPlannedBudget)}</strong></div>
                                <div><span>Active Target</span><strong>{formatCurrency(budgetAdjustmentSummary.activeTargetBudget)}</strong></div>
                                <div><span>Cancelled</span><strong>{formatCurrency(budgetAdjustmentSummary.cancelledAmount)}</strong></div>
                                <div><span>Realigned</span><strong>{formatCurrency(budgetAdjustmentSummary.realignedAmount)}</strong></div>
                                <div><span>Savings</span><strong>{formatCurrency(budgetAdjustmentSummary.savingsAmount)}</strong></div>
                                <div><span>Actual Obligated</span><strong>{formatCurrency(budgetAdjustmentSummary.actualObligated)}</strong></div>
                                <div><span>Actual Disbursed</span><strong>{formatCurrency(budgetAdjustmentSummary.actualDisbursed)}</strong></div>
                            </div>
                        </div>
                     </fieldset>
                )}

                {/* ACCOMPLISHMENT MODE */}
                {mode === 'accomplishment' && (
                     <div className="space-y-6">
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Actual Conduct</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Actual Start Date</label>
                                    <input
                                        type="date"
                                        name="actualDate"
                                        value={formData.actualDate || ''}
                                        onChange={(event) => { void handleActualConductDateChange('actualDate', event.currentTarget.value); }}
                                        className={commonInputClasses}
                                    />
                                </div>
                                {conductType === 'Multi-day' && (
                                    <div>
                                        <label className="form-label">Actual End Date</label>
                                        <input
                                            type="date"
                                            name="actualEndDate"
                                            value={formData.actualEndDate || ''}
                                            onChange={(event) => { void handleActualConductDateChange('actualEndDate', event.currentTarget.value); }}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                )}
                                <div><label className="form-label">Actual Male</label><input type="number" name="actualParticipantsMale" value={formData.actualParticipantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                <div><label className="form-label">Actual Female</label><input type="number" name="actualParticipantsFemale" value={formData.actualParticipantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>
                         
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Budget Utilization</legend>
                            {formData.expenses.map((exp) => (
                                <div key={exp.id} className="budget-utilization-item">
                                    <p className="budget-utilization-title">
                                        {exp.expenseParticular} ({exp.uacsCode})
                                        {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                            <span className="detail-list-copy block">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                        )}
                                    </p>
                                    <div className="budget-utilization-grid">
                                        {/* Actual Obligation Group */}
                                        <div className="budget-editor-panel budget-editor-panel--obligation">
                                            <p className="budget-editor-panel__title">Obligations</p>
                                            <ObligationsEditor
                                                obligations={exp.obligations || []}
                                                onChange={(newObs, total) => {
                                                    handleExpenseAccomplishmentChange(exp.id, 'obligations', newObs);
                                                    handleExpenseAccomplishmentChange(exp.id, 'actualObligationAmount', total);
                                                }}
                                                defaultYear={formData.fundingYear}
                                                validateMonthChange={validateActivityActualMonth}
                                            />
                                        </div>

                                        {/* Actual Disbursement Group */}
                                        <div className="budget-editor-panel budget-editor-panel--disbursement">
                                            <p className="budget-editor-panel__title">Disbursement</p>
                                            <DisbursementsEditor
                                                disbursements={exp.disbursements || []}
                                                onChange={(newDisb, total) => {
                                                    handleExpenseAccomplishmentChange(exp.id, 'disbursements', newDisb);
                                                    handleExpenseAccomplishmentChange(exp.id, 'actualDisbursementAmount', total);
                                                }}
                                                defaultYear={formData.fundingYear}
                                                validateMonthChange={validateActivityActualMonth}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </fieldset>

                        {/* Gender and Inclusivity Section */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Gender and Inclusivity</legend>
                            <div className="form-grid form-grid--compact">
                                <div><label className="form-label">PWD</label><input type="number" name="actualPWD" value={formData.actualPWD || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Muslim</label><input type="number" name="actualMuslim" value={formData.actualMuslim || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">LGBTQ+</label><input type="number" name="actualLGBTQ" value={formData.actualLGBTQ || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Solo Parents</label><input type="number" name="actualSoloParent" value={formData.actualSoloParent || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Senior</label><input type="number" name="actualSenior" value={formData.actualSenior || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Youth</label><input type="number" name="actualYouth" value={formData.actualYouth || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                            </div>
                        </fieldset>
                     </div>
                )}

                <div className="form-footer">
                    <button type="button" onClick={onBack} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                        {mode === 'create' ? 'Create Activity' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ActivityEdit;
