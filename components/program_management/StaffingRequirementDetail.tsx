
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { StaffingRequirement, StaffingExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType, otherActivityComponents } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { getMonetaryChanges } from '../../lib/logUtils';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { supabase } from '../../supabaseClient';
import { ObligationsEditor } from '../accomplishment/ObligationsEditor';
import { getProgramManagementPhysicalDateBasis, resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../../lib/physicalAccomplishmentTimestamp';
import { createDisbursementsFromMonthlyFields, summarizeDisbursements } from '../../lib/disbursementUtils';
import {
    BudgetItemAdjustmentHistory,
    ensureOriginalBudgetSnapshot,
    getBudgetLineAmount,
    getBudgetLineTag,
    isBudgetLineExcludedFromTargets,
    normalizeBudgetLineStatus,
    requestAdjustmentReason,
    summarizeBudgetAdjustments,
    writeBudgetItemAdjustmentHistory
} from '../../lib/budgetLineAdjustments';
import { createStaffingExpenseId, normalizeStaffingExpenses } from '../../lib/staffingExpenseIdentity';

interface StaffingRequirementDetailProps {
    item: StaffingRequirement;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: StaffingRequirement) => void;
}

const commonInputClasses = "form-control";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value detail-value--emphasis">{value || 'N/A'}</dd>
    </div>
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if parse fails
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const normalizeMoneyInput = (value: string) => {
    const cleaned = value.replace(/[^\d.]/g, '');
    const [whole = '', ...decimalParts] = cleaned.split('.');
    const decimals = decimalParts.join('').slice(0, 2);
    return decimalParts.length > 0 ? `${whole}.${decimals}` : whole;
};

const formatMoneyInput = (value: string | number | undefined) => {
    if (value === undefined || value === null || value === '') return '';
    const normalized = normalizeMoneyInput(String(value));
    if (!normalized) return '';
    const [whole, decimals] = normalized.split('.');
    const formattedWhole = whole ? Number(whole).toLocaleString('en-US') : '';
    return decimals !== undefined ? `${formattedWhole}.${decimals}` : formattedWhole;
};

const getHiringStatusBadge = (status: StaffingRequirement['hiringStatus']) => {
    switch (status) {
        case 'Filled': return 'status-badge status-badge--completed';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Unfilled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const StaffingRequirementDetail: React.FC<StaffingRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Program Management');
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const detailsDecision = getStatusDecision({
        moduleKey: 'staffing_requirements',
        item,
        action: 'editDetails',
        hasModuleAccess: canEdit,
    });
    const accomplishmentDecision = getStatusDecision({
        moduleKey: 'staffing_requirements',
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
        const monthsToCheck: string[] = [];
        if (hasMonthChanged(formData.actualObligationDate, item.actualObligationDate) && formData.actualObligationDate) {
            monthsToCheck.push(formData.actualObligationDate);
        }
        expensesList.forEach(expense => {
            const originalExpense = originalExpensesList.find(existing => existing.id === expense.id);
            monthsToCheck.push(...getChangedRecordMonths(expense.obligations || [], originalExpense?.obligations || []));
            months.forEach((month, index) => {
                const field = `actualDisbursement${month}`;
                const currentAmount = Number((expense as any)[field]) || 0;
                const originalAmount = Number((originalExpense as any)?.[field]) || 0;
                if (currentAmount > 0 && valuesDiffer(currentAmount, originalAmount)) {
                    monthsToCheck.push(`${formData.fundYear}-${String(index + 1).padStart(2, '0')}`);
                }
            });
        });
        for (const month of monthsToCheck) {
            if (!(await validateActualMonth(month))) return false;
        }
        return true;
    };
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<StaffingRequirement>(item);
    const [isSaving, setIsSaving] = useState(false);
    const [monthLockMessage, setMonthLockMessage] = useState('');
    
    // Construct display expenses, handling legacy data where obligations array might be empty but actual fields exist
    const displayExpenses = useMemo(() => {
        let expenses = (item.expenses && item.expenses.length > 0) ? [...item.expenses] : [];

        // Legacy Fallback: If no expenses, construct a single expense from root fields
        if (expenses.length === 0 && (item.annualSalary > 0 || item.uacsCode)) {
             const legacy: StaffingExpense = {
                id: 0,
                objectType: 'MOOE',
                expenseParticular: 'Salaries & Wages',
                uacsCode: item.uacsCode || '',
                obligationDate: item.obligationDate,
                amount: item.annualSalary,
                
                // Map Targets
                disbursementJan: item.disbursementJan || 0, disbursementFeb: item.disbursementFeb || 0, disbursementMar: item.disbursementMar || 0,
                disbursementApr: item.disbursementApr || 0, disbursementMay: item.disbursementMay || 0, disbursementJun: item.disbursementJun || 0,
                disbursementJul: item.disbursementJul || 0, disbursementAug: item.disbursementAug || 0, disbursementSep: item.disbursementSep || 0,
                disbursementOct: item.disbursementOct || 0, disbursementNov: item.disbursementNov || 0, disbursementDec: item.disbursementDec || 0,

                // Map Actuals
                actualObligationAmount: item.actualObligationAmount,
                actualObligationDate: item.actualObligationDate,
                actualDisbursementAmount: item.actualDisbursementAmount,
                actualDisbursementDate: item.actualDisbursementDate,
                obligations: [], // Will be populated by mapping below

                actualDisbursementJan: item.actualDisbursementJan || 0, actualDisbursementFeb: item.actualDisbursementFeb || 0, actualDisbursementMar: item.actualDisbursementMar || 0,
                actualDisbursementApr: item.actualDisbursementApr || 0, actualDisbursementMay: item.actualDisbursementMay || 0, actualDisbursementJun: item.actualDisbursementJun || 0,
                actualDisbursementJul: item.actualDisbursementJul || 0, actualDisbursementAug: item.actualDisbursementAug || 0, actualDisbursementSep: item.actualDisbursementSep || 0,
                actualDisbursementOct: item.actualDisbursementOct || 0, actualDisbursementNov: item.actualDisbursementNov || 0, actualDisbursementDec: item.actualDisbursementDec || 0,
            };
            expenses = [legacy];
        }

        // Migrate legacy actual fields into obligations array
        return normalizeStaffingExpenses(expenses).map(exp => {
            const disbursementSummary = exp.disbursements && exp.disbursements.length > 0
                ? summarizeDisbursements(exp.disbursements, item.fundYear)
                : null;

            return ensureOriginalBudgetSnapshot({
                ...exp,
                ...(disbursementSummary ? {
                    ...disbursementSummary.monthlyFields,
                    actualDisbursementAmount: disbursementSummary.total,
                    actualDisbursementDate: disbursementSummary.latestDate || exp.actualDisbursementDate,
                } : {}),
                obligations: (exp.obligations && exp.obligations.length > 0) ? exp.obligations : (
                    (exp.actualObligationAmount > 0) ? [{
                        id: Date.now(),
                        date: exp.actualObligationDate || '',
                        amount: exp.actualObligationAmount || 0,
                        remarks: 'Legacy Record'
                    }] : []
                )
            });
        });
    }, [item]);

    // Expense Management State
    const [expensesList, setExpensesList] = useState<StaffingExpense[]>([]);
    const [originalExpensesList, setOriginalExpensesList] = useState<StaffingExpense[]>([]);
    const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<number>>(new Set());
    
    // Temp State for adding/editing expense in detail view
    const initialExpenseState = {
        id: 0,
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationDate: '',
        amount: 0,
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        isCancelled: false,
        isRealignment: false,
        isSavings: false,
        adjustmentReason: '',
    };
    const [currentExpense, setCurrentExpense] = useState(initialExpenseState);
    const [selectedParticular, setSelectedParticular] = useState('');
    const [isExpenseScheduleOpen, setIsExpenseScheduleOpen] = useState(false);
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
    const [budgetAdjustmentHistory, setBudgetAdjustmentHistory] = useState<BudgetItemAdjustmentHistory[]>([]);
    const budgetAdjustmentSummary = useMemo(() => summarizeBudgetAdjustments(expensesList), [expensesList]);

    useEffect(() => {
        let isMounted = true;
        const loadHistory = async () => {
            if (!supabase) {
                setBudgetAdjustmentHistory([]);
                return;
            }

            const { data, error } = await supabase
                .from('budget_item_adjustment_history')
                .select('*')
                .eq('source_type', 'staffing_expense')
                .eq('parent_id', item.id)
                .order('created_at', { ascending: false });

            if (!isMounted) return;
            if (error) {
                console.warn('Unable to load staffing budget adjustment history', error);
                setBudgetAdjustmentHistory([]);
                return;
            }
            setBudgetAdjustmentHistory((data || []) as BudgetItemAdjustmentHistory[]);
        };
        loadHistory();
        return () => {
            isMounted = false;
        };
    }, [item.id]);

    // Initial load and whenever the item ID changes
    useEffect(() => {
        if (!item) return;

        // Reset form data and expenses list
        setFormData(item);
        setExpensesList(displayExpenses);
        setOriginalExpensesList(displayExpenses);

        const fetchObligations = async () => {
            if (!item?.id || !supabase) return;
            
            // Fetch from centralized table first
            const { data, error } = await supabase
                .from('financial_obligations')
                .select('*')
                .eq('entity_type', 'staffing_expense')
                .eq('parent_id', item.id);

            if (!error && data && data.length > 0) {
                console.log("Fetched staffing obligations from centralized table:", data.length);
                const obligationsByItem: { [key: string]: any[] } = {};
                data.forEach(o => {
                    const itemId = o.item_id;
                    if (itemId) {
                        if (!obligationsByItem[itemId]) obligationsByItem[itemId] = [];
                        obligationsByItem[itemId].push({
                            id: o.id,
                            date: o.obligation_date,
                            amount: o.amount,
                            remarks: o.remarks
                        });
                    }
                });

                const applyFetchedObligations = (source: StaffingExpense[]) => source.map(exp => {
                        const itemId = exp.id?.toString();
                        if (itemId && obligationsByItem[itemId]) {
                            const obs = obligationsByItem[itemId];
                            const total = obs.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
                            return { ...exp, obligations: obs, actualObligationAmount: total };
                        }
                        return exp;
                    });
                setExpensesList(prev => applyFetchedObligations(prev));
                setOriginalExpensesList(prev => applyFetchedObligations(prev));
            }
        };

        fetchObligations();
    }, [item.id, supabase, displayExpenses]);


    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'form-control--invalid' : ''}`;
    };

    useEffect(() => {
        if (formData.fundYear && !currentExpense.obligationDate && !editingExpenseId) {
            setCurrentExpense(prev => ({ ...prev, obligationDate: `${formData.fundYear}-01-01` }));
        }
    }, [formData.fundYear, currentExpense.obligationDate, editingExpenseId]);

    const availableUacsCodes = useMemo(() => {
        const codes: { [key: string]: string } = {};
        const ot = currentExpense.objectType;
        
        if (selectedParticular) {
            if (uacsCodes[ot]?.[selectedParticular]) {
                Object.assign(codes, uacsCodes[ot][selectedParticular]);
            }
        } else if (uacsCodes[ot]) {
            Object.values(uacsCodes[ot]).forEach(particularCodes => {
                Object.assign(codes, particularCodes);
            });
        }
        return codes;
    }, [uacsCodes, currentExpense.objectType, selectedParticular]);

    const selectedUacsDesc = useMemo(() => {
        if (!currentExpense.uacsCode) return '';
        return availableUacsCodes[currentExpense.uacsCode] || '';
    }, [currentExpense.uacsCode, availableUacsCodes]);

    // Reset form data and hydrate expenses list (including legacy fix) when item changes
    useEffect(() => {
        if (editMode === 'none') {
            setFormData(item);
            setExpensesList(displayExpenses);
            setOriginalExpensesList(displayExpenses);
            setValidationErrors([]);
        }
    }, [editMode, item, displayExpenses]);

    // Helper to calculate total actual disbursement for an item
    const calculateActualDisbursementTotal = (expense: StaffingExpense) => {
        return months.reduce((sum, m) => sum + (Number((expense as any)[`actualDisbursement${m}`]) || 0), 0);
    };

    useEffect(() => {
        if (editMode === 'accomplishment') {
            const totalActualObligation = expensesList.reduce((acc, exp) => acc + (exp.actualObligationAmount || 0), 0);
            const totalActualDisbursement = expensesList.reduce((acc, exp) => acc + calculateActualDisbursementTotal(exp), 0);
            
            if (Math.abs(totalActualObligation - formData.actualObligationAmount) > 0.01 || 
                Math.abs(totalActualDisbursement - formData.actualDisbursementAmount) > 0.01) {
                setFormData(prev => ({ 
                    ...prev, 
                    actualObligationAmount: totalActualObligation,
                    actualDisbursementAmount: totalActualDisbursement
                }));
            }
            
            if (formData.actualObligationDate && formData.hiringStatus !== 'Filled') {
                setFormData(prev => ({ ...prev, hiringStatus: 'Filled' }));
            } else if (!formData.actualObligationDate && formData.hiringStatus === 'Filled') {
                setFormData(prev => ({ ...prev, hiringStatus: 'Proposed' }));
            }
        }
    }, [expensesList, editMode, formData.actualObligationDate, formData.hiringStatus, formData.actualObligationAmount, formData.actualDisbursementAmount]); 

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    // Expense Handlers
    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrentExpense(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    const persistExpenseAdjustmentHistory = async (action: any, beforeSnapshot: any, afterSnapshot: any, reason: string) => {
        if (!item?.id) return;
        try {
            await writeBudgetItemAdjustmentHistory({
                sourceType: 'staffing_expense',
                parentId: item.id,
                itemId: afterSnapshot?.id || beforeSnapshot?.id,
                action,
                beforeSnapshot,
                afterSnapshot,
                reason,
                currentUser,
            });
        } catch {
            // The parent staffing save remains the source of truth for nested expense updates.
        }
    };

    const handleAddExpense = async () => {
        const requiredFields = [
            { name: 'expenseParticular', label: 'Particular' },
            { name: 'uacsCode', label: 'UACS Code' },
            { name: 'obligationDate', label: 'Obligation Date' },
            { name: 'amount', label: 'Amount' }
        ];

        const missing = requiredFields.filter(f => !currentExpense[f.name as keyof typeof currentExpense]);
        if (missing.length > 0) {
            setValidationErrors(missing.map(f => f.name));
            alert(`The following financial fields are missing: ${missing.map(f => f.label).join(', ')}`);
            return;
        }
        
        if ((currentExpense.isCancelled || currentExpense.isRealignment || currentExpense.isSavings) && !currentExpense.adjustmentReason.trim()) {
            alert('A short reason is required when adding a cancelled, realignment, or savings financial item.');
            return;
        }

        const newExpenseData: StaffingExpense = ensureOriginalBudgetSnapshot(normalizeBudgetLineStatus({
            id: editingExpenseId || createStaffingExpenseId(expensesList.map(expense => expense.id)),
            ...currentExpense,
            amount: Number(currentExpense.amount),
            // @ts-ignore
            disbursementJan: Number(currentExpense.disbursementJan), disbursementFeb: Number(currentExpense.disbursementFeb), disbursementMar: Number(currentExpense.disbursementMar),
            disbursementApr: Number(currentExpense.disbursementApr), disbursementMay: Number(currentExpense.disbursementMay), disbursementJun: Number(currentExpense.disbursementJun),
            disbursementJul: Number(currentExpense.disbursementJul), disbursementAug: Number(currentExpense.disbursementAug), disbursementSep: Number(currentExpense.disbursementSep),
            disbursementOct: Number(currentExpense.disbursementOct), disbursementNov: Number(currentExpense.disbursementNov), disbursementDec: Number(currentExpense.disbursementDec)
        }));

        if (editingExpenseId) {
            const beforeExpense = expensesList.find(e => e.id === editingExpenseId);
            const afterExpense = { ...beforeExpense, ...newExpenseData, id: editingExpenseId };
            setExpensesList(prev => prev.map(e => e.id === editingExpenseId ? afterExpense : e));
            if (beforeExpense && (beforeExpense.isCancelled || beforeExpense.isRealignment || beforeExpense.isSavings || afterExpense.isCancelled || afterExpense.isRealignment || afterExpense.isSavings)) {
                await persistExpenseAdjustmentHistory(
                    afterExpense.isCancelled ? 'cancel'
                        : afterExpense.isRealignment ? 'tag_realignment'
                            : afterExpense.isSavings ? 'tag_savings'
                                : beforeExpense.isCancelled ? 'restore'
                                    : 'clear_tag',
                    beforeExpense,
                    afterExpense,
                    currentExpense.adjustmentReason || 'Updated staffing expense adjustment.'
                );
            }
            setEditingExpenseId(null);
        } else {
            setExpensesList(prev => [...prev, newExpenseData]);
            if (newExpenseData.isRealignment || newExpenseData.isSavings) {
                await persistExpenseAdjustmentHistory('create_adjustment_item', null, newExpenseData, newExpenseData.adjustmentReason || 'Created staffing expense adjustment item.');
            }
        }
        
        setCurrentExpense(initialExpenseState);
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    const handleEditExpense = (expense: StaffingExpense) => {
        const normalizedExpense = normalizeBudgetLineStatus(expense);
        setEditingExpenseId(normalizedExpense.id);
        setCurrentExpense({
            ...initialExpenseState,
            ...normalizedExpense,
            // Ensure month fields are copied
            disbursementJan: normalizedExpense.disbursementJan || 0, disbursementFeb: normalizedExpense.disbursementFeb || 0, disbursementMar: normalizedExpense.disbursementMar || 0,
            disbursementApr: normalizedExpense.disbursementApr || 0, disbursementMay: normalizedExpense.disbursementMay || 0, disbursementJun: normalizedExpense.disbursementJun || 0,
            disbursementJul: normalizedExpense.disbursementJul || 0, disbursementAug: normalizedExpense.disbursementAug || 0, disbursementSep: normalizedExpense.disbursementSep || 0,
            disbursementOct: normalizedExpense.disbursementOct || 0, disbursementNov: normalizedExpense.disbursementNov || 0, disbursementDec: normalizedExpense.disbursementDec || 0,
            isCancelled: !!normalizedExpense.isCancelled,
            isRealignment: !!normalizedExpense.isRealignment,
            isSavings: !!normalizedExpense.isSavings,
            adjustmentReason: normalizedExpense.adjustmentReason || '',
        });
        setSelectedParticular(normalizedExpense.expenseParticular);
        setIsExpenseScheduleOpen(true);
    };

    const handleRemoveExpense = (id: number) => {
        const expense = expensesList.find(e => e.id === id);
        const isSavedLine = !!(expense && (item.expenses || []).some(existing => existing.id === id));
        const hasActuals = !!expense && (((expense.obligations?.length || 0) > 0) || ((expense.disbursements?.length || 0) > 0) || Number(expense.actualObligationAmount) > 0 || Number(expense.actualDisbursementAmount) > 0);
        if (expense && (isSavedLine || hasActuals)) {
            handleExpenseTagChange(id, 'Cancelled');
            return;
        }
        setExpensesList(prev => prev.filter(e => e.id !== id));
        if (editingExpenseId === id) {
            setEditingExpenseId(null);
            setCurrentExpense(initialExpenseState);
        }
    };

    const handleExpenseTagChange = async (id: number, tag: 'Cancelled' | 'Realignment' | 'Savings' | null) => {
        const beforeExpense = expensesList.find(e => e.id === id);
        if (!beforeExpense) return;
        const reason = requestAdjustmentReason(tag ? `marking this financial item as ${tag}` : 'clearing this financial item tag');
        if (!reason) return;
        const afterExpense = {
            ...beforeExpense,
            isCancelled: tag === 'Cancelled',
            isRealignment: tag === 'Realignment',
            isSavings: tag === 'Savings',
            adjustmentReason: reason,
        };
        setExpensesList(prev => prev.map(e => e.id === id ? afterExpense : e));
        await persistExpenseAdjustmentHistory(tag === 'Cancelled' ? 'cancel' : tag === 'Realignment' ? 'tag_realignment' : tag === 'Savings' ? 'tag_savings' : beforeExpense.isCancelled ? 'restore' : 'clear_tag', beforeExpense, afterExpense, reason);
    };

    const handleCancelExpenseEdit = () => {
        setEditingExpenseId(null);
        setCurrentExpense(initialExpenseState);
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    // Accomplishment Per Expense Handler
    const handleExpenseAccomplishmentChange = (id: number, field: keyof StaffingExpense, value: any) => {
        setExpensesList(prev => prev.map(e => {
            if (e.id === id) {
                const updated = { ...e, [field]: value };
                // Also update the aggregated actualDisbursementAmount if a month field changed
                if (String(field).startsWith('actualDisbursement')) {
                    updated.actualDisbursementAmount = calculateActualDisbursementTotal(updated);
                }
                return updated;
            }
            return e;
        }));
    };

    const toggleExpenseExpand = (id: number) => {
        setExpandedExpenseIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const action = editMode === 'details' ? 'editDetails' : 'editPhysicalAccomplishment';
        const decision = editMode === 'details' ? detailsDecision : accomplishmentDecision;
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'staffing_requirements',
            item,
            itemId: item.id,
            itemName: item.personnelPosition,
            status: item.hiringStatus,
            action,
            entityType: 'staffing_requirement',
        });
        if (!allowed) return;
        if (!(await validateAccomplishmentMonthsForSave())) return;
        
        const requiredFields = [
            { name: 'operatingUnit', label: 'Operating Unit' },
            { name: 'personnelPosition', label: 'Personnel Position' },
            { name: 'fundYear', label: 'Fund Year' }
        ];

        const missing = requiredFields.filter(f => !formData[f.name as keyof typeof formData]);
        if (missing.length > 0) {
            setValidationErrors(missing.map(f => f.name));
            alert(`The following required fields are missing: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        const normalizedExpensesList = normalizeStaffingExpenses(expensesList);

        if (normalizedExpensesList.length === 0) {
            alert("At least one financial requirement item is required.");
            return;
        }
        
        // Aggregate totals from expensesList
        const aggregatedTotals = {
            annualSalary: 0,
            disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
            disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
            // Calculate Actuals Total from breakdown
            actualObligationAmount: 0,
            actualDisbursementAmount: 0,
            // Actual Monthly Aggregates for root level
            actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
            actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
        };
        
        let primaryUacs = formData.uacsCode; 
        let primaryObligationDate = formData.obligationDate;

        if (normalizedExpensesList.length > 0) {
            primaryUacs = normalizedExpensesList[0].uacsCode;
            primaryObligationDate = normalizedExpensesList[0].obligationDate;
            
            // Reset totals to sum up from list
            aggregatedTotals.annualSalary = 0; 
            months.forEach(m => { 
                // @ts-ignore
                aggregatedTotals[`disbursement${m}`] = 0; 
                // @ts-ignore
                aggregatedTotals[`actualDisbursement${m}`] = 0; 
            });

            normalizedExpensesList.forEach(exp => {
                // Update legacy fields for each expense from its obligations
                if (exp.obligations && exp.obligations.length > 0) {
                    const latestOb = [...exp.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                    exp.actualObligationAmount = exp.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                    exp.actualObligationDate = latestOb.date;
                } else {
                    exp.actualObligationAmount = 0;
                    exp.actualObligationDate = null;
                }

                if (!isBudgetLineExcludedFromTargets(exp)) {
                    aggregatedTotals.annualSalary += getBudgetLineAmount(exp);
                }
                aggregatedTotals.actualObligationAmount += (exp.actualObligationAmount || 0);
                
                // Recalculate total actual disbursement per item
                const itemActualDisbursement = calculateActualDisbursementTotal(exp);
                aggregatedTotals.actualDisbursementAmount += itemActualDisbursement;
                exp.actualDisbursementAmount = itemActualDisbursement;

                months.forEach(m => {
                    // @ts-ignore
                    aggregatedTotals[`disbursement${m}`] += isBudgetLineExcludedFromTargets(exp) ? 0 : (exp[`disbursement${m}`] || 0);
                    // @ts-ignore
                    aggregatedTotals[`actualDisbursement${m}`] += (exp[`actualDisbursement${m}`] || 0);
                });
            });
        }

        const timestamp = new Date().toISOString();
        const nextActualObligationDate = normalizedExpensesList.length === 0 ? null : (formData.actualObligationDate || null);
        const actualDateBasis = getProgramManagementPhysicalDateBasis({ ...formData, actualObligationDate: nextActualObligationDate });
        const previousActualDateBasis = getProgramManagementPhysicalDateBasis(item);
        const updatedItem: any = {
            ...formData,
            ...aggregatedTotals,
            uacsCode: primaryUacs,
            obligationDate: primaryObligationDate,
            salaryGrade: Number(formData.salaryGrade),
            fundYear: Number(formData.fundYear),
            expenses: normalizedExpensesList,
            actualAmount: 0, // Removed usage as per request, ensuring 0
            actualObligationAmount: normalizedExpensesList.length === 0 ? null : aggregatedTotals.actualObligationAmount,
            actualObligationDate: nextActualObligationDate,
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
                const { id, obligations, disbursements, ...payload } = updatedItem;
                
                console.log("Saving Staffing Requirement...", { id: item.id, payload });
                const { error: updateError } = await supabase.from('staffing_requirements').update(payload).eq('id', item.id);
                if (updateError) throw updateError;

                // Sync obligations to centralized table
                const entityType = 'staffing_expense';
                const parentId = item.id;
                
                // Delete old
                const { error: deleteError } = await supabase.from('financial_obligations')
                    .delete()
                    .eq('entity_type', entityType)
                    .eq('parent_id', parentId);
                
                if (deleteError) {
                    console.error("Error deleting old obligations:", deleteError);
                }
                
                // Insert new
                const syncPayload: any[] = [];
                normalizedExpensesList.forEach(exp => {
                    if (exp.obligations && exp.obligations.length > 0) {
                        exp.obligations.forEach(o => {
                            syncPayload.push({
                                entity_type: entityType,
                                parent_id: parentId,
                                item_id: exp.id?.toString() || null,
                                obligation_date: o.date,
                                amount: Number(o.amount) || 0,
                                remarks: o.remarks || ''
                            });
                        });
                    }
                });

                if (syncPayload.length > 0) {
                    const { error: insertError } = await supabase.from('financial_obligations').insert(syncPayload);
                    if (insertError) {
                        console.error("Critical RLS Error or Insert Error in financial_obligations:", insertError);
                        throw new Error(`Failed to sync obligations: ${insertError.message}. This might be a database permission (RLS) issue.`);
                    }
                }

                const disbursementSyncPayload: any[] = [];
                normalizedExpensesList.forEach(exp => {
                    createDisbursementsFromMonthlyFields(exp, formData.fundYear, 'Synced from staffing monthly matrix').forEach(disb => {
                        disbursementSyncPayload.push({
                            entity_type: entityType,
                            parent_id: parentId,
                            item_id: exp.id?.toString() || null,
                            disbursement_date: disb.date,
                            amount: Number(disb.amount) || 0,
                            remarks: disb.remarks || ''
                        });
                    });
                });

                const { error: disbursementDeleteError } = await supabase.from('financial_disbursements')
                    .delete()
                    .eq('entity_type', entityType)
                    .eq('parent_id', parentId);

                if (disbursementDeleteError) {
                    console.error("Error deleting old disbursements:", disbursementDeleteError);
                }

                if (disbursementSyncPayload.length > 0) {
                    const { error: disbursementInsertError } = await supabase.from('financial_disbursements').insert(disbursementSyncPayload);
                    if (disbursementInsertError) {
                        console.error("Critical RLS Error or Insert Error in financial_disbursements:", disbursementInsertError);
                        throw new Error(`Failed to sync disbursements: ${disbursementInsertError.message}. This might be a database permission (RLS) issue.`);
                    }
                }

                const metadata = getMonetaryChanges(item, updatedItem, 'Staffing');
                logAction('Updated Staffing Requirement', updatedItem.particulars || updatedItem.position, undefined, 'Staffing Requirement', String(item.id), metadata);
                
                onUpdate(updatedItem as StaffingRequirement);
                setEditMode('none');
            } catch (err: any) {
                console.error("Error saving staffing requirement:", err);
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
                    <h1 className="detail-title">Editing Details: {item.personnelPosition}</h1>
                    <button onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel Editing</button>
                </div>
                <div className="form-card">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Group 1: Profile */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Position Profile</legend>
                            <div className="program-form-grid program-form-grid--four">
                                <div><label className="form-label">Position Title <span className="form-required">*</span></label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={getInputClasses('personnelPosition')} /></div>
                                <div><label className="form-label">Component</label><select name="component" value={formData.component} onChange={handleInputChange} className={getInputClasses('component')}>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div>
                                    <label className="form-label">Hiring Status</label>
                                    <select name="hiringStatus" value={formData.hiringStatus} onChange={handleInputChange} className={getInputClasses('hiringStatus')}>
                                        <option value="Proposed">Proposed</option>
                                        <option value="Filled">Filled</option>
                                        <option value="Unfilled">Unfilled</option>
                                    </select>
                                    {formData.hiringStatus === 'Filled' && <p className="form-help form-help--success">Status set to Filled automatically based on Date Hired.</p>}
                                </div>
                                <div><label className="form-label">Employment Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')}><option value="Permanent">Permanent</option><option value="Contractual">Contractual</option><option value="COS">COS</option><option value="Job Order">Job Order</option></select></div>
                                <div><label className="form-label">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={getInputClasses('salaryGrade')} /></div>
                                <div><label className="form-label">Personnel Type</label><select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={getInputClasses('personnelType')}><option value="Technical">Technical</option><option value="Administrative">Administrative</option><option value="Support">Support</option></select></div>
                                <div><label className="form-label">Operating Unit <span className="form-required">*</span></label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={getInputClasses('operatingUnit')} disabled={!canViewAll}><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                            </div>
                        </fieldset>

                        {/* Group 2: Funding */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Funding Source</legend>
                            <div className="form-grid">
                                <div><label className="form-label">Fund Year <span className="form-required">*</span></label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} /></div>
                                <div><label className="form-label">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={getInputClasses('fundType')}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="form-label">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={getInputClasses('tier')}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                        </fieldset>

                        {/* Group 3: Financial Requirements */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Financial Requirements</legend>
                            
                            <div className="budget-item-list">
                                {expensesList.map((expense, idx) => (
                                    <div key={idx} className={`budget-item-card ${isBudgetLineExcludedFromTargets(expense) ? 'budget-item-card--excluded' : ''} ${expense.isCancelled ? 'budget-item-card--cancelled' : ''} ${expense.isRealignment ? 'budget-item-card--realignment' : ''} ${expense.isSavings ? 'budget-item-card--savings' : ''} ${editingExpenseId === expense.id ? 'budget-item-card--editing' : ''}`}>
                                        <div className="budget-item-card__summary">
                                            <p className="budget-item-card__title">
                                                {expense.expenseParticular || 'Unspecified Particular'}
                                                {getBudgetLineTag(expense) && <span className={`budget-line-badge budget-line-badge--${getBudgetLineTag(expense)?.toLowerCase()}`}>{getBudgetLineTag(expense)}</span>}
                                            </p>
                                            <p className="budget-item-card__meta">{expense.uacsCode} | Obligated: {expense.obligationDate}</p>
                                            {isBudgetLineExcludedFromTargets(expense) && <span className="budget-line-exclusion-note">{expense.adjustmentReason || 'No adjustment justification recorded.'}</span>}
                                        </div>
                                        <div className="budget-item-card__actions">
                                            <p className="budget-item-card__total">{formatCurrency(getBudgetLineAmount(expense))}</p>
                                            <div className="budget-item-card__buttons">
                                                <button type="button" onClick={() => handleEditExpense(expense)} className="table-action table-action--primary" aria-label="Edit financial item">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                </button>
                                                <button type="button" onClick={() => handleRemoveExpense(expense.id)} className="table-action table-action--danger" aria-label="Remove financial item">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {expensesList.length === 0 && <p className="detail-empty detail-empty--compact">No financial items added.</p>}
                                <div className="budget-item-list__total">
                                    Total Allocation: {formatCurrency(expensesList.reduce((acc, curr) => acc + (isBudgetLineExcludedFromTargets(curr) ? 0 : getBudgetLineAmount(curr)), 0))}
                                </div>
                            </div>

                            <div className="form-fieldset">
                                <h4 className="detail-section-title detail-section-title--ruled">
                                    {editingExpenseId ? 'Edit Financial Item' : 'Add Financial Item'}
                                </h4>
                                <div className="program-form-grid program-form-grid--four">
                                    <div><label className="form-label">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={getInputClasses('objectType')}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="form-label">Particular <span className="form-required">*</span></label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setCurrentExpense(prev => ({...prev, uacsCode: ''})); if (validationErrors.includes('expenseParticular')) setValidationErrors(prev => prev.filter(err => err !== 'expenseParticular')); }} className={getInputClasses('expenseParticular')}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="form-label">UACS Code <span className="form-required">*</span></label>
                                        <input 
                                            list="uacs-codes-list-detail"
                                            name="uacsCode" 
                                            value={currentExpense.uacsCode} 
                                            onChange={(e) => {
                                                const code = e.target.value;
                                                let part = selectedParticular;
                                                
                                                // Auto-select particular if a valid code is entered
                                                if (code && uacsCodes[currentExpense.objectType]) {
                                                    const trimmedCode = code.trim();
                                                    let foundParticular = '';

                                                    // First check if the code exists in the CURRENT selected particular (optimization)
                                                    if (selectedParticular && uacsCodes[currentExpense.objectType][selectedParticular] && uacsCodes[currentExpense.objectType][selectedParticular][trimmedCode]) {
                                                        foundParticular = selectedParticular;
                                                    } else {
                                                        // Search all particulars
                                                        for (const [particular, codes] of Object.entries(uacsCodes[currentExpense.objectType])) {
                                                            if (codes[trimmedCode]) {
                                                                foundParticular = particular;
                                                                break;
                                                            }
                                                        }
                                                    }

                                                    if (foundParticular) {
                                                        part = foundParticular;
                                                        if (foundParticular !== selectedParticular) {
                                                            setSelectedParticular(foundParticular);
                                                        }
                                                    }
                                                }
                                                
                                                setCurrentExpense(prev => ({ ...prev, uacsCode: code, expenseParticular: part }));
                                                if (validationErrors.includes('uacsCode')) {
                                                    setValidationErrors(prev => prev.filter(err => err !== 'uacsCode'));
                                                }
                                            }} 
                                            className={getInputClasses('uacsCode')} 
                                            placeholder="Search or select UACS Code"
                                        />
                                        <datalist id="uacs-codes-list-detail">
                                            {Object.entries(availableUacsCodes).map(([code, desc]) => (
                                                <option key={code} value={code}>{code} - {desc}</option>
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
                                    <div>
                                        <label className="form-label">Obligation Date <span className="form-required">*</span></label>
                                        <MonthYearPicker 
                                            value={currentExpense.obligationDate} 
                                            onChange={(val) => {
                                                setCurrentExpense(prev => ({ ...prev, obligationDate: val }));
                                                if (validationErrors.includes('obligationDate')) {
                                                    setValidationErrors(prev => prev.filter(err => err !== 'obligationDate'));
                                                }
                                            }}
                                            className={validationErrors.includes('obligationDate') ? 'form-control--invalid' : ''}
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Amount <span className="form-required">*</span></label>
                                        <input
                                            type="text"
                                            name="amount"
                                            value={formatMoneyInput(currentExpense.amount)}
                                            onChange={e => {
                                                const value = normalizeMoneyInput(e.target.value);
                                                setCurrentExpense(prev => ({ ...prev, amount: value as any }));
                                                if (validationErrors.includes('amount')) {
                                                    setValidationErrors(prev => prev.filter(err => err !== 'amount'));
                                                }
                                            }}
                                            className={getInputClasses('amount')}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="program-form-grid__full budget-line-adjustment-options">
                                        {editingExpenseId && (
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
                                </div>

                                <div className="budget-item-form-grid budget-item-form-grid--nested staffing-expense-editor">
                                    <div className="staffing-expense-schedule-panel">
                                        <div className="staffing-expense-schedule-panel__header">
                                            <button type="button" onClick={() => setIsExpenseScheduleOpen(!isExpenseScheduleOpen)} className="btn btn-secondary btn-sm">
                                                {isExpenseScheduleOpen ? 'Hide' : 'Show'} Disbursement Schedule (Target)
                                            </button>
                                        </div>
                                        {isExpenseScheduleOpen && (
                                            <div className="program-month-grid staffing-expense-schedule-grid">
                                                {months.map(month => (
                                                    <div key={`exp-${month}`} className="program-month-cell">
                                                        <label className="program-month-cell__label">{month}</label>
                                                        <input
                                                            type="text"
                                                            name={`disbursement${month}`}
                                                            // @ts-ignore
                                                            value={formatMoneyInput(currentExpense[`disbursement${month}`])}
                                                            onChange={(e) => {
                                                                const value = normalizeMoneyInput(e.target.value);
                                                                setCurrentExpense(prev => ({ ...prev, [`disbursement${month}`]: value as any }));
                                                            }}
                                                            className="form-control form-control--compact"
                                                            inputMode="decimal"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="budget-item-form-grid__actions staffing-expense-editor__actions">
                                        <button type="button" onClick={handleAddExpense} className="btn btn-primary">
                                            {editingExpenseId ? 'Update Item' : 'Add Item to List'}
                                        </button>
                                        {editingExpenseId && (
                                            <button type="button" onClick={handleCancelExpenseEdit} className="btn btn-secondary">
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>

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
                                    <div className="budget-adjustment-history">
                                        {budgetAdjustmentHistory.slice(0, 6).map(entry => (
                                            <div key={entry.id || `${entry.item_id}-${entry.created_at}`} className="budget-adjustment-history__row">
                                                <strong>{entry.action.replace(/_/g, ' ')}</strong>
                                                <span>{entry.reason}</span>
                                                <small>{entry.created_by_name || entry.created_by || 'System'} · {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'No date'}</small>
                                            </div>
                                        ))}
                                        {budgetAdjustmentHistory.length === 0 && <p className="detail-empty detail-empty--compact">No budget adjustment history recorded yet.</p>}
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <div className="detail-edit-footer">
                            <button type="button" onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Changes</button>
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
                    <h1 className="detail-title">Editing Accomplishment: {item.personnelPosition}</h1>
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
                            <legend className="form-legend">Physical Accomplishment</legend>
                            <div className="form-grid">
                                <div><label className="form-label">Date Hired</label><input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={async (event) => {
                                    if (event.target.value && !(await validateActualMonth(event.target.value))) return;
                                    handleInputChange(event);
                                }} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>

                        <div className="detail-stack">
                            <h4 className="detail-section-title">Financial Accomplishment per Expense Item</h4>
                            {expensesList.map((expense, idx) => (
                                <fieldset key={expense.id} className="form-fieldset">
                                    <legend className="form-legend">{expense.expenseParticular || 'Unspecified Particular'} ({expense.uacsCode})</legend>
                                    
                                    <div className="detail-subsection">
                                        <label className="form-label">Obligations</label>
                                        <ObligationsEditor
                                            obligations={expense.obligations || []}
                                            onChange={(newObs, total) => {
                                                handleExpenseAccomplishmentChange(expense.id, 'obligations', newObs);
                                                handleExpenseAccomplishmentChange(expense.id, 'actualObligationAmount', total);
                                            }}
                                            defaultYear={formData.fundYear?.toString()}
                                            validateMonthChange={validateActualMonth}
                                        />
                                    </div>

                                    <div className="detail-subsection detail-subsection--separated">
                                        <label className="form-label">Actual Monthly Disbursement</label>
                                        <div className="program-month-grid">
                                            {months.map(month => (
                                                <div key={`actual-${expense.id}-${month}`} className="program-month-cell">
                                                    <label className="program-month-cell__label">{month}</label>
                                                    <input type="number" 
                                                        value={(expense as any)[`actualDisbursement${month}`] || 0} 
                                                        onChange={(e) => handleExpenseAccomplishmentChange(expense.id, `actualDisbursement${month}` as keyof StaffingExpense, Number(e.target.value))} 
                                                        min="0" step="0.01" 
                                                        className="form-control form-control--compact" 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="budget-item-list__total">
                                            Item Actual Disbursement: {formatCurrency(calculateActualDisbursementTotal(expense))}
                                        </div>
                                    </div>
                                </fieldset>
                            ))}
                            {expensesList.length === 0 && <p className="detail-empty detail-empty--compact">No financial items added.</p>}
                        </div>

                        <div className="detail-metric-grid">
                            <div className="detail-metric detail-metric--inline">
                                <span className="detail-metric-label">Total Actual Obligation</span>
                                <span className="detail-metric-value">{formatCurrency(formData.actualObligationAmount || 0)}</span>
                            </div>
                            <div className="detail-metric detail-metric--inline">
                                <span className="detail-metric-label">Total Actual Disbursement</span>
                                <span className="detail-metric-value">{formatCurrency(formData.actualDisbursementAmount || 0)}</span>
                            </div>
                        </div>

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
                    <h1 className="detail-title">{item.personnelPosition}</h1>
                    <p className="detail-subtitle">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="detail-actions">
                    {(canEdit || canEditDetails) && (
                        <button onClick={async () => {
                            const allowed = await ensureDecisionAllowed(detailsDecision, {
                                moduleKey: 'staffing_requirements',
                                item,
                                itemId: item.id,
                                itemName: item.personnelPosition,
                                status: item.hiringStatus,
                                action: 'editDetails',
                                entityType: 'staffing_requirement',
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
                                moduleKey: 'staffing_requirements',
                                item,
                                itemId: item.id,
                                itemName: item.personnelPosition,
                                status: item.hiringStatus,
                                action: 'editPhysicalAccomplishment',
                                entityType: 'staffing_requirement',
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
                        <DetailItem label="Position" value={item.personnelPosition} />
                        <DetailItem label="Component" value={item.component} />
                        <DetailItem label="Status" value={<span className={getHiringStatusBadge(item.hiringStatus)}>{item.hiringStatus}</span>} />
                        <DetailItem label="Employment" value={item.status} />
                        <DetailItem label="Salary Grade" value={`SG-${item.salaryGrade}`} />
                        <DetailItem label="Type" value={item.personnelType} />
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <DetailItem label="Total Annual Requirement" value={formatCurrency(item.annualSalary)} />
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                    
                    {/* Breakdown of Expenses with Toggleable Schedule */}
                    {displayExpenses.length > 0 && (
                        <div className="detail-subsection detail-subsection--separated">
                            <h4 className="detail-section-title">Cost Breakdown</h4>
                            <ul className="program-expense-list">
                                {displayExpenses.map((exp, i) => (
                                    <li key={i} className="program-expense-card">
                                        <button type="button" className="program-expense-card__trigger" onClick={() => toggleExpenseExpand(exp.id)}>
                                            <div className="program-expense-card__summary">
                                                <span className="program-expense-card__title">{exp.expenseParticular}</span>
                                                <span className="program-expense-card__meta">{exp.uacsCode}</span>
                                            </div>
                                            <div className="program-expense-card__aside">
                                                <span className="program-expense-card__amount">{formatCurrency(exp.amount)}</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`program-expense-card__chevron ${expandedExpenseIds.has(exp.id) ? 'is-open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </button>
                                        {expandedExpenseIds.has(exp.id) && (
                                            <div className="program-expense-card__details">
                                                <div className="program-expense-card__date">
                                                    <div>
                                                        <span className="detail-kicker">Target Obligation Date</span>
                                                        <span className="program-expense-card__date-value">{formatDate(exp.obligationDate)}</span>
                                                    </div>
                                                </div>
                                                <p className="detail-kicker">Target Monthly Disbursement</p>
                                                <div className="program-month-grid">
                                                    {months.map(m => (
                                                        <div key={m} className="program-month-cell">
                                                            <span className="program-month-cell__label">{m}</span>
                                                            <span className="program-month-cell__value">{formatCurrency((exp as any)[`disbursement${m}`] || 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Accomplishment Section */}
                <div className="detail-card">
                    <h3 className="detail-card-title">Accomplishment Report</h3>
                    <div className="detail-stack">
                        
                        <div>
                            <h4 className="detail-section-title detail-section-title--ruled">Financial Performance Summary</h4>
                            <div className="detail-metric-grid">
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Total Obligation</p>
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="detail-subsection">
                                    <p className="detail-kicker">Total Disbursement</p>
                                    <DetailItem label="Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <h4 className="detail-section-title detail-section-title--ruled">Employment Details</h4>
                            <div className="detail-metric-grid">
                                <DetailItem label="Date Hired" value={formatDate(item.actualObligationDate)} />
                            </div>
                        </div>

                        {displayExpenses.length > 0 && (
                            <div className="detail-subsection">
                                <h4 className="detail-section-title detail-section-title--ruled">Per Item Actuals</h4>
                                <div className="program-actual-list">
                                    {displayExpenses.map((exp, idx) => (
                                        <div key={idx} className="program-actual-card">
                                            <div className="program-actual-card__header">
                                                <span className="program-actual-card__title">{exp.expenseParticular}</span>
                                                <div className="program-actual-card__summary">
                                                    <div>Date: <span>{formatDate(exp.actualObligationDate)}</span></div>
                                                    <div>Act. Obli: <span>{formatCurrency(exp.actualObligationAmount || 0)}</span></div>
                                                    <div className="program-actual-card__disbursement">Act. Disb: <span>{formatCurrency(calculateActualDisbursementTotal(exp))}</span></div>
                                                </div>
                                            </div>
                                            <div className="program-month-grid">
                                                {months.map(m => {
                                                    const val = (exp as any)[`actualDisbursement${m}`] || 0;
                                                    if (val === 0) return null;
                                                    return (
                                                        <div key={m} className="program-month-cell">
                                                            <span className="program-month-cell__label">{m}</span>
                                                            <span className="program-month-cell__value program-month-cell__value--success">{formatCurrency(val)}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            {calculateActualDisbursementTotal(exp) === 0 && <p className="detail-empty detail-empty--compact">No disbursement recorded</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default StaffingRequirementDetail;
