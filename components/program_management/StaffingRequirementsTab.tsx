
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { StaffingRequirement, StaffingExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType, otherActivityComponents, ActivityComponentType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { useSelection, useUserAccess, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { Search, X, Check, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { createStaffingExpenseId } from '../../lib/staffingExpenseIdentity';
import { useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { ConfirmDialog, DataTablePagination, FilterableTableHeader } from '../ui/enterprise';

declare const XLSX: any;

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const DuplicateIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
    </svg>
);

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundYear', 'operatingUnit', 'fundType', 'tier']);

const getHiringStatusBadge = (status: StaffingRequirement['hiringStatus']) => {
    switch (status) {
        case 'Filled': return 'status-badge status-badge--completed';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Unfilled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

export const parseStaffingRequirementRow = (row: any, commonData: any): StaffingRequirement => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let calculatedAnnual = 0;
    months.forEach(m => { calculatedAnnual += (Number(row[`disbursement${m}`]) || 0); });
    const finalAnnualSalary = calculatedAnnual > 0 ? calculatedAnnual : (Number(row.annualSalary) || 0);

    const result: any = {
        ...commonData,
        personnelPosition: row.personnelPosition || '',
        component: row.component || 'Program Management',
        status: row.status || 'Contractual',
        salaryGrade: Number(row.salaryGrade) || 1,
        annualSalary: finalAnnualSalary,
        personnelType: row.personnelType || 'Technical',
        expenses: row.expenses || [],
        hiringStatus: row.hiringStatus || 'Proposed'
    };

    months.forEach(m => {
        result[`disbursement${m}`] = Number(row[`disbursement${m}`]) || 0;
        result[`actualDisbursement${m}`] = Number(row[`actualDisbursement${m}`]) || 0;
    });

    return result as StaffingRequirement;
};

interface StaffingRequirementsTabProps {
    items: StaffingRequirement[];
    setItems: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: StaffingRequirement) => void;
}

interface StaffingRequirementColumnHeaderProps {
    label: string;
    columnKey: keyof StaffingRequirement;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const StaffingRequirementColumnHeader: React.FC<StaffingRequirementColumnHeaderProps> = ({ columnKey, onSort, ...props }) => (
    <FilterableTableHeader
        {...props}
        columnKey={String(columnKey)}
        onSort={(key, direction) => onSort(key as keyof StaffingRequirement, direction)}
    />
);

export const StaffingRequirementsTab: React.FC<StaffingRequirementsTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Program Management');
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<StaffingRequirement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'form-control--invalid' : ''}`;
    };

    // Filters - Persistent
    const [columnFilters, setColumnFilters] = useLocalStorageState<{ [key: string]: string[] }>('programManagement_staffing_columnFilters', {});

    useEffect(() => {
        const cleanedFilters = Object.fromEntries(
            Object.entries(columnFilters).filter(([key]) => !DCF_SCOPE_COLUMN_KEYS.has(key))
        );

        if (Object.keys(cleanedFilters).length !== Object.keys(columnFilters).length) {
            setColumnFilters(cleanedFilters);
        }
    }, [columnFilters, setColumnFilters]);

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useLocalStorageState('programManagement_staffing_searchTerm', '');
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: string; direction: 'ascending' | 'descending' }>('programManagement_staffing_sortConfig', { key: 'id', direction: 'descending' });

    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<StaffingRequirement>();

    // Form State
    const initialFormState = {
        id: 0, uid: '', operatingUnit: '', uacsCode: '', obligationDate: '', disbursementDate: '', fundType: 'Current' as FundType, fundYear: new Date().getFullYear(), tier: 'Tier 1' as Tier, encodedBy: '',
        personnelPosition: '', component: 'Program Management' as ActivityComponentType, status: 'Contractual', salaryGrade: 1, annualSalary: 0, personnelType: 'Technical',
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        actualDate: '', actualAmount: 0, actualObligationDate: '', actualDisbursementDate: '', actualObligationAmount: 0, actualDisbursementAmount: 0,
        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
        actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0,
        hiringStatus: 'Proposed' as 'Proposed' | 'Filled' | 'Unfilled'
    };
    
    const [formData, setFormData] = useState(initialFormState);
    const [expensesList, setExpensesList] = useState<StaffingExpense[]>([]);
    
    // Temp State for adding expense
    const initialExpenseState = {
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationDate: '',
        amount: 0,
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0
    };
    const [currentExpense, setCurrentExpense] = useState(initialExpenseState);
    const [selectedParticular, setSelectedParticular] = useState('');
    const [isExpenseScheduleOpen, setIsExpenseScheduleOpen] = useState(false);

    useEffect(() => {
        if (formData.fundYear && !currentExpense.obligationDate) {
            setCurrentExpense(prev => ({ ...prev, obligationDate: `${formData.fundYear}-01-01` }));
        }
    }, [formData.fundYear, currentExpense.obligationDate]);

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

    useEffect(() => {
        // Removed ouFilter dependency
    }, [currentUser, canViewAll]);

    // Initialize Form
    useEffect(() => {
        if (view === 'form') {
            setFormData({ ...initialFormState, operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''), encodedBy: currentUser?.fullName || '' });
            setExpensesList([]);
            setCurrentExpense(initialExpenseState);
            setSelectedParticular('');
        }
    }, [view, uacsCodes, currentUser, canViewAll]);

    const availableYears = useMemo(() => {
        const years = new Set<string>(); 
        items.forEach(i => {
            if (i.fundYear) years.add(i.fundYear.toString());
        }); 
        return Array.from(years).sort().reverse();
    }, [items]);

    const filteredItems = useMemo(() => {
        let filtered = items;

        // Global Search (UID or Position)
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                (item.uid || '').toLowerCase().includes(lowSearch) || 
                (item.personnelPosition || '').toLowerCase().includes(lowSearch)
            );
        }

        // Permissions Filter
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(item => item.operatingUnit === currentUser.operatingUnit);
        }

        // Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String(item[key as keyof StaffingRequirement] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Sorting
        return [...filtered].sort((a, b) => {
            const aValue = a[sortConfig.key as keyof StaffingRequirement];
            const bValue = b[sortConfig.key as keyof StaffingRequirement];

            if (aValue === bValue) return 0;
            
            // Handle null/undefined
            if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, canViewAll, currentUser, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: any, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    const handleColumnFilterChange = (column: string, values: string[]) => {
        setColumnFilters(prev => ({ ...prev, [column]: values }));
    };

    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {
            uid: [],
            operatingUnit: [],
            hiringStatus: [],
            personnelPosition: [],
            personnelType: [],
            fundYear: [],
            fundType: []
        };

        items.forEach(item => {
            Object.keys(values).forEach(key => {
                const val = String(item[key as keyof StaffingRequirement] || '');
                if (!values[key].includes(val)) {
                    values[key].push(val);
                }
            });
        });

        Object.keys(values).forEach(key => {
            values[key].sort();
        });

        return values;
    }, [items]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrentExpense(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    const handleAddExpense = () => {
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

        const newExpense: StaffingExpense = {
            id: createStaffingExpenseId(expensesList.map(expense => expense.id)),
            ...currentExpense,
            amount: Number(currentExpense.amount),
            // @ts-ignore dynamic month assignment
            disbursementJan: Number(currentExpense.disbursementJan), disbursementFeb: Number(currentExpense.disbursementFeb), disbursementMar: Number(currentExpense.disbursementMar),
            disbursementApr: Number(currentExpense.disbursementApr), disbursementMay: Number(currentExpense.disbursementMay), disbursementJun: Number(currentExpense.disbursementJun),
            disbursementJul: Number(currentExpense.disbursementJul), disbursementAug: Number(currentExpense.disbursementAug), disbursementSep: Number(currentExpense.disbursementSep),
            disbursementOct: Number(currentExpense.disbursementOct), disbursementNov: Number(currentExpense.disbursementNov), disbursementDec: Number(currentExpense.disbursementDec)
        };
        setExpensesList(prev => [...prev, newExpense]);
        setCurrentExpense({
            ...initialExpenseState,
            obligationDate: formData.fundYear ? `${formData.fundYear}-01-01` : ''
        });
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    const handleRemoveExpense = (id: number) => {
        setExpensesList(prev => prev.filter(e => e.id !== id));
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
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

        if (expensesList.length === 0) {
            alert("At least one financial requirement item is required.");
            return;
        }
        
        // Aggregate totals from expensesList
        const aggregatedTotals = {
            annualSalary: 0,
            disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
            disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0
        };
        
        let primaryUacs = '';
        let primaryObligationDate = '';

        expensesList.forEach((exp, idx) => {
            if (idx === 0) {
                primaryUacs = exp.uacsCode;
                primaryObligationDate = exp.obligationDate;
            }
            aggregatedTotals.annualSalary += exp.amount;
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            months.forEach(m => {
                // @ts-ignore
                aggregatedTotals[`disbursement${m}`] += (exp[`disbursement${m}`] || 0);
            });
        });

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        const submissionData: any = {
            ...formData,
            ...aggregatedTotals,
            uacsCode: primaryUacs, // Use first expense as main reference
            obligationDate: primaryObligationDate,
            salaryGrade: Number(formData.salaryGrade),
            fundYear: Number(formData.fundYear),
            expenses: expensesList, // Store detailed list
            actualAmount: 0, actualObligationAmount: 0, actualDisbursementAmount: 0,
            hiringStatus: formData.hiringStatus || 'Proposed',
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System', 
            workflow_status,
            updated_at: new Date().toISOString()
        };

        delete submissionData.id;

        submissionData.uid = formData.uid || `SR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('staffing_requirements').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) {
                setItems(prev => [data, ...prev]);
                logAction('Created Staffing Requirement', data.personnelPosition || data.uid, undefined, 'Staffing Requirement', String(data.id));
            }
        } else {
            const newItem = { ...submissionData, id: Date.now() } as StaffingRequirement;
            setItems(prev => [newItem, ...prev]);
        }
        setView('list');
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const decision = getDeleteDecision({
            moduleKey: 'staffing_requirements',
            item: itemToDelete,
            hasModuleAccess: canEdit,
        });
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'staffing_requirements',
            item: itemToDelete,
            itemId: itemToDelete.id,
            itemName: itemToDelete.personnelPosition,
            status: itemToDelete.hiringStatus,
            action: 'delete',
            entityType: 'staffing_requirement',
        });
        if (!allowed) return;
        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'staffing_requirement',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('staffing_requirements').delete().eq('id', itemToDelete.id);
                if (deleteError) throw deleteError;

                logAction('Deleted Staffing Requirement', itemToDelete.personnelPosition || itemToDelete.uid, undefined, 'Staffing Requirement', String(itemToDelete.id));
                setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
            } catch (error: any) {
                console.error("Error archiving/deleting:", error);
                alert("Failed to delete: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
        }
        setIsDeleteModalOpen(false); setItemToDelete(null);
    };

    const handleMultiDelete = async () => {
        if (selectedIds.length === 0) return;
        const itemsToDelete = items.filter(i => selectedIds.includes(i.id));
        const deletableItems = itemsToDelete.filter(item => getDeleteDecision({
            moduleKey: 'staffing_requirements',
            item,
            hasModuleAccess: canEdit,
        }).allowed);
        const skippedCount = itemsToDelete.length - deletableItems.length;
        if (deletableItems.length === 0) {
            alert('None of the selected staffing requirements can be deleted under the current DCF editing policy.');
            setIsMultiDeleteModalOpen(false);
            setSelectedIds([]);
            return;
        }
        const deletableIds = deletableItems.map(item => item.id);

        if (supabase) {
            try {
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'staffing_requirement',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('staffing_requirements').delete().in('id', deletableIds);
                if (deleteError) throw deleteError;

                setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
            } catch (error: any) {
                console.error("Error archiving/deleting selected:", error);
                alert("Failed to delete selected: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
        }
        if (skippedCount) alert(`${skippedCount} selected staffing requirement${skippedCount === 1 ? ' was' : 's were'} skipped by DCF editing policy.`);
        setIsMultiDeleteModalOpen(false); setSelectedIds([]);
    };

    const handleClone = async () => {
        const itemsToClone = items.filter(i => selectedIds.includes(i.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} staffing requirements? This will create new entries with the same targets but reset accomplishments.`)) return;

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, obligations, physical_accomplishment_submitted_at, ...rest } = item;
            const newUid = `SR-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            const clonedExpenseIds: number[] = [];
            // Deep copy and reset expenses actuals
            const clonedExpenses = (item.expenses || []).map(exp => ({
                ...exp,
                id: (() => {
                    const id = createStaffingExpenseId(clonedExpenseIds);
                    clonedExpenseIds.push(id);
                    return id;
                })(),
                actualObligationAmount: 0,
                actualObligationDate: '',
                actualDisbursementAmount: 0,
                actualDisbursementDate: '',
                // Reset monthly actuals
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
            }));

            // Reset root actuals
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0,
                physical_accomplishment_submitted_at: null,
                hiringStatus: 'Proposed'
            };

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                expenses: clonedExpenses,
                workflow_status,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('staffing_requirements').insert(newItemsPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setItems(prev => [...data, ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} items.`);
            }
        } else {
            const newLocalItems = newItemsPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setItems(prev => [...newLocalItems, ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} items (Local).`);
        }
    };

    const handleToggleMode = (intent: 'delete' | 'clone') => {
        if (isSelectionMode && selectionIntent === intent) {
            toggleSelectionMode(); // Toggle off
        } else if (isSelectionMode && selectionIntent !== intent) {
            setSelectionIntent(intent); // Switch intent
        } else {
            setSelectionIntent(intent);
            toggleSelectionMode(); // Toggle on
        }
    };

    // Import/Export
    const getWorkflowStatusBadge = (status?: string) => {
        let classes = 'status-badge status-badge--compact status-badge--neutral';
        switch (status) {
            case 'APPROVED': classes = 'status-badge status-badge--compact status-badge--approved'; break;
            case 'PENDING': classes = 'status-badge status-badge--compact status-badge--pending'; break;
            case 'REJECTED': classes = 'status-badge status-badge--compact status-badge--rejected'; break;
            case 'DRAFT': classes = 'status-badge status-badge--compact status-badge--draft'; break;
        }
        return <span className={classes}>{status || 'DRAFT'}</span>;
    };

    const canApprove = (role?: string) => {
        return ['Super Admin', 'Administrator', 'Focal - User', 'Management'].includes(role || '');
    };

    const handleApprove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to approve this staffing requirement?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('staffing_requirements').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
                logAction('Approved Staffing Requirement', String(id), undefined, 'Staffing Requirement', String(id));
            }
        } else {
            setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('staffing_requirements').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid, OU: item.operatingUnit, Position: item.personnelPosition, HiringStatus: item.hiringStatus, EmploymentStatus: item.status, 'Salary Grade': item.salaryGrade, 'Annual Salary': item.annualSalary, Type: item.personnelType, 'Fund Type': item.fundType, 'Fund Year': item.fundYear, Tier: item.tier, 'Obligation Date': item.obligationDate
        }));
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Staffing Requirements"); XLSX.writeFile(wb, "Staffing_Requirements_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const monthHeaders = ['disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr', 'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug', 'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'];
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'uacsCode', 'personnelPosition', 'status', 'salaryGrade', 'personnelType', 'amount', 'hiringStatus', ...monthHeaders];
        const exampleData = [{ operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', uacsCode: '50100000-00', personnelPosition: 'PDO II', status: 'Contractual', salaryGrade: 15, personnelType: 'Technical', amount: 540000, hiringStatus: 'Proposed', disbursementJan: 45000, disbursementFeb: 45000, disbursementMar: 45000, disbursementApr: 45000, disbursementMay: 45000, disbursementJun: 45000, disbursementJul: 45000, disbursementAug: 45000, disbursementSep: 45000, disbursementOct: 45000, disbursementNov: 45000, disbursementDec: 45000 }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Staffing_Req_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result; const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                const currentTimestamp = new Date().toISOString();
                const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
                
                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `SR-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';
                    
                    // Create base object
                    const parsed = parseStaffingRequirementRow(row, {
                        uid, 
                        operatingUnit: resolvedOU, 
                        fundYear: fundYear, 
                        fundType: row.fundType || 'Current', 
                        tier: resolveTier(row.tier) || 'Tier 1', 
                        obligationDate: row.obligationDate || '', 
                        disbursementDate: '', 
                        uacsCode: row.uacsCode || '', 
                        encodedBy: currentUser?.fullName || 'Upload', 
                        workflow_status,
                        created_at: currentTimestamp, 
                        updated_at: currentTimestamp
                    });

                    // Construct default expense object from flat row data for legacy support
                    const annualSalary = Number(row.amount || row.annualSalary) || 0;
                    const expense: StaffingExpense = {
                        id: createStaffingExpenseId([index]),
                        objectType: 'MOOE', // Default
                        expenseParticular: 'Salaries & Wages',
                        uacsCode: row.uacsCode || '',
                        obligationDate: row.obligationDate || '',
                        amount: annualSalary,
                        // Map monthly values from row
                        disbursementJan: Number(row.disbursementJan) || 0, disbursementFeb: Number(row.disbursementFeb) || 0, disbursementMar: Number(row.disbursementMar) || 0,
                        disbursementApr: Number(row.disbursementApr) || 0, disbursementMay: Number(row.disbursementMay) || 0, disbursementJun: Number(row.disbursementJun) || 0,
                        disbursementJul: Number(row.disbursementJul) || 0, disbursementAug: Number(row.disbursementAug) || 0, disbursementSep: Number(row.disbursementSep) || 0,
                        disbursementOct: Number(row.disbursementOct) || 0, disbursementNov: Number(row.disbursementNov) || 0, disbursementDec: Number(row.disbursementDec) || 0,
                        
                        // Initialize actuals
                        actualObligationAmount: 0, actualObligationDate: '', actualDisbursementAmount: 0, actualDisbursementDate: '',
                        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                        actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                        actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
                    };

                    parsed.expenses = [expense];
                    parsed.annualSalary = annualSalary; // Ensure root salary matches

                    return parsed;
                });
                
                if (supabase) {
                    const { error } = await supabase.from('staffing_requirements').insert(newItems); if (error) throw error;
                    const { data } = await supabase.from('staffing_requirements').select('*').order('id', { ascending: true }); if (data) setItems(data as StaffingRequirement[]);
                } else { setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]); }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) { alert(`Import failed: ${err.message}`); } finally { setIsUploading(false); if(e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'form') {
        const monthFields = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return (
            <div className="form-card animate-fadeIn">
                <div className="detail-header">
                    <h3 className="detail-title">Add Staffing Requirement</h3>
                    <button onClick={() => { setView('list'); }} className="btn btn-secondary">Cancel</button>
                </div>
                <form onSubmit={handleFormSubmit} className="detail-stack">
                    {/* Group 1: Profile */}
                    <fieldset className="form-fieldset">
                        <legend className="form-legend">Position Profile</legend>
                        <div className="form-grid">
                            <div><label className="form-label">Position Title <span className="form-required">*</span></label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={getInputClasses('personnelPosition')} /></div>
                            <div>
                                <label className="form-label">Component</label>
                                <select name="component" value={formData.component} onChange={handleInputChange} className={getInputClasses('component')}>
                                    {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Hiring Status</label>
                                <select name="hiringStatus" value={formData.hiringStatus} onChange={handleInputChange} className={`${commonInputClasses} form-control--readonly`} disabled>
                                    <option value="Proposed">Proposed</option>
                                    <option value="Filled">Filled</option>
                                    <option value="Unfilled">Unfilled</option>
                                </select>
                            </div>
                            <div><label className="form-label">Employment Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')}><option value="Permanent">Permanent</option><option value="Contractual">Contractual</option><option value="COS">COS</option><option value="Job Order">Job Order</option></select></div>
                            <div><label className="form-label">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={getInputClasses('salaryGrade')} /></div>
                            <div><label className="form-label">Personnel Type</label><select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={getInputClasses('personnelType')}><option value="Technical">Technical</option><option value="Administrative">Administrative</option><option value="Support">Support</option></select></div>
                            <div>
                                <label className="form-label">Operating Unit <span className="form-required">*</span></label>
                                <select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} disabled={!canViewAll && !!currentUser} className={`${getInputClasses('operatingUnit')} `}><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select>
                            </div>
                        </div>
                    </fieldset>

                    {/* Group 2: Funding */}
                    <fieldset className="form-fieldset">
                        <legend className="form-legend">Funding Source</legend>
                        <div className="program-form-grid program-form-grid--four">
                            <div><label className="form-label">Fund Year <span className="form-required">*</span></label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} /></div>
                            <div><label className="form-label">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={getInputClasses('fundType')}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                            <div><label className="form-label">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={getInputClasses('tier')}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div className="form-check-group">
                                <label className="form-check">
                                    <input type="checkbox" checked={formData.isRealignment || false} onChange={e => setFormData(prev => ({ ...prev, isRealignment: e.target.checked, isSavings: e.target.checked ? false : prev.isSavings }))} />
                                    <span>Realignment</span>
                                </label>
                                <label className="form-check">
                                    <input type="checkbox" checked={formData.isSavings || false} onChange={e => setFormData(prev => ({ ...prev, isSavings: e.target.checked, isRealignment: e.target.checked ? false : prev.isRealignment }))} />
                                    <span>Savings</span>
                                </label>
                            </div>
                        </div>
                    </fieldset>

                    {/* Group 3: Financial Requirements (Multiple Objects) */}
                    <fieldset className="form-fieldset">
                        <legend className="form-legend">Financial Requirements</legend>
                        
                        {/* Expense List */}
                        <div className="budget-item-list">
                            {expensesList.map((expense, idx) => (
                                <div key={idx} className="budget-item-card">
                                    <div className="budget-item-card__summary">
                                        <p className="budget-item-card__title">{expense.expenseParticular || 'Unspecified Particular'}</p>
                                        <p className="budget-item-card__meta">{expense.uacsCode} | Obligated: {expense.obligationDate}</p>
                                    </div>
                                    <div className="budget-item-card__actions">
                                        <p className="budget-item-card__total">{formatCurrency(expense.amount)}</p>
                                        <button type="button" onClick={() => handleRemoveExpense(expense.id)} className="table-action table-action--danger" aria-label="Remove financial item">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {expensesList.length === 0 && <p className="detail-empty detail-empty--compact">No financial items added.</p>}
                            <div className="budget-item-list__total">
                                Total Annual Requirement: {formatCurrency(expensesList.reduce((acc, curr) => acc + curr.amount, 0))}
                            </div>
                        </div>

                        {/* Add Expense Form Area */}
                        <div className="form-fieldset">
                            <h4 className="detail-section-title detail-section-title--ruled">Add Financial Item</h4>
                            <div className="program-form-grid program-form-grid--four">
                                <div><label className="form-label">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={getInputClasses('objectType')}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="form-label">Particular <span className="form-required">*</span></label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setCurrentExpense(prev => ({...prev, uacsCode: ''})); if (validationErrors.includes('expenseParticular')) setValidationErrors(prev => prev.filter(err => err !== 'expenseParticular')); }} className={getInputClasses('expenseParticular')}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div>
                                    <label className="form-label">UACS Code <span className="form-required">*</span></label>
                                    <input 
                                        list="uacs-codes-list"
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
                                    <datalist id="uacs-codes-list">
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
                            </div>
                            
                            <div className="form-grid">
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
                                <div><label className="form-label">Amount <span className="form-required">*</span></label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={getInputClasses('amount')} min="0" /></div>
                            </div>
                            
                            <div className="mb-3">
                                <button type="button" onClick={() => setIsExpenseScheduleOpen(!isExpenseScheduleOpen)} className="btn btn-secondary btn-sm">
                                    {isExpenseScheduleOpen ? 'Hide' : 'Show'} Disbursement Schedule
                                </button>
                                {isExpenseScheduleOpen && (
                                    <div className="program-month-grid">
                                        {monthFields.map(month => (
                                            <div key={`exp-${month}`} className="program-month-cell">
                                                <label className="program-month-cell__label">{month}</label>
                                                <input type="number" name={`disbursement${month}`} 
                                                // @ts-ignore
                                                value={currentExpense[`disbursement${month}`]} onChange={handleExpenseChange} className="form-control form-control--compact" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button type="button" onClick={handleAddExpense} className="btn btn-primary">Add Item to List</button>
                        </div>
                    </fieldset>
                    
                    <div className="detail-edit-footer">
                        <button type="button" onClick={() => { setView('list'); }} className="btn btn-secondary">Cancel</button>
                        <button type="submit" className="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        );
    }

    // List View
    return (
        <div className="data-table-card animate-fadeIn">            {isDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm deletion"
                    description="Delete this record? This action cannot be undone."
                    confirmLabel="Delete record"
                    onCancel={() => setIsDeleteModalOpen(false)}
                    onConfirm={handleDelete}
                />
            )}            {isMultiDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm bulk deletion"
                    description={`Delete ${selectedIds.length} selected record${selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.`}
                    confirmLabel="Delete selected"
                    onCancel={() => setIsMultiDeleteModalOpen(false)}
                    onConfirm={handleMultiDelete}
                />
            )}

            <div className="data-table-toolbar">
            <div className="data-toolbar-row">
                <div className="data-toolbar-group">
                    <div className="data-toolbar-searchbox">
                        <span className="data-toolbar-searchbox__icon">
                            <Search aria-hidden="true" />
                        </span>
                        <input 
                            type="text" 
                            placeholder="Search Staffing Requirements..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="data-table-search data-toolbar-searchbox__input"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="data-toolbar-searchbox__clear"
                            >
                                <X aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="data-toolbar-group data-toolbar-group--actions">
                    {isSelectionMode && selectedIds.length > 0 && (
                        <button 
                            onClick={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} 
                            className={`btn ${selectionIntent === 'delete' ? 'btn-danger' : 'btn-info'}`}
                        >
                            {selectionIntent === 'delete' ? `Delete Selected (${selectedIds.length})` : `Clone Selected (${selectedIds.length})`}
                        </button>
                    )}
                    {canEdit && (
                        <button 
                            onClick={() => { setView('form'); }} 
                            className="btn btn-primary btn-responsive"
                            title="Add New"
                        >
                            <Plus className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Add New</span>
                        </button>
                    )}
                    <button onClick={handleDownloadReport} className="btn btn-primary btn-responsive" title="Download Report">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download Report</span>
                    </button>
                    {canEdit && (
                        <>
                            <button onClick={handleDownloadTemplate} className="btn btn-secondary btn-responsive" title="Download Template">
                                <FileSpreadsheet className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Template</span>
                            </button>
                            <label className={`btn btn-primary btn-responsive ${isUploading ? 'is-disabled' : ''}`} title={isUploading ? 'Uploading...' : 'Upload XLSX'}>
                                <Upload className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">{isUploading ? 'Uploading...' : 'Upload XLSX'}</span>
                                <input type="file" className="file-input-hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                            <button 
                                onClick={() => handleToggleMode('clone')} 
                                className={`btn btn-secondary btn-icon ${isSelectionMode && selectionIntent === 'clone' ? 'is-active-clone' : ''}`} 
                                title="Toggle Clone Mode"
                            >
                                <DuplicateIcon />
                            </button>
                            <button 
                                onClick={() => handleToggleMode('delete')} 
                                className={`btn btn-secondary btn-icon ${isSelectionMode && selectionIntent === 'delete' ? 'is-active-danger' : ''}`} 
                                title="Toggle Multi-Delete Mode"
                            >
                                <TrashIcon />
                            </button>
                        </>
                    )}
                </div>
            </div>
            </div>

            <div className="data-table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            <StaffingRequirementColumnHeader 
                                label="UID" 
                                columnKey="uid" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.uid || []} 
                                onFilterChange={(val) => handleColumnFilterChange('uid', val)} 
                                uniqueValues={uniqueValues.uid} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="OU" 
                                columnKey="operatingUnit" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.operatingUnit || []} 
                                onFilterChange={(val) => handleColumnFilterChange('operatingUnit', val)} 
                                uniqueValues={uniqueValues.operatingUnit} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Status" 
                                columnKey="hiringStatus" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.hiringStatus || []} 
                                onFilterChange={(val) => handleColumnFilterChange('hiringStatus', val)} 
                                uniqueValues={uniqueValues.hiringStatus} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Position" 
                                columnKey="personnelPosition" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.personnelPosition || []} 
                                onFilterChange={(val) => handleColumnFilterChange('personnelPosition', val)} 
                                uniqueValues={uniqueValues.personnelPosition} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Type" 
                                columnKey="personnelType" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.personnelType || []} 
                                onFilterChange={(val) => handleColumnFilterChange('personnelType', val)} 
                                uniqueValues={uniqueValues.personnelType} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Annual Salary" 
                                columnKey="annualSalary" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={[]} 
                                onFilterChange={() => {}} 
                                uniqueValues={[]} 
                                isNumeric
                            />
                            <StaffingRequirementColumnHeader 
                                label="Fund Year" 
                                columnKey="fundYear" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.fundYear || []} 
                                onFilterChange={(val) => handleColumnFilterChange('fundYear', val)} 
                                uniqueValues={uniqueValues.fundYear} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Fund Type" 
                                columnKey="fundType" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.fundType || []} 
                                onFilterChange={(val) => handleColumnFilterChange('fundType', val)} 
                                uniqueValues={uniqueValues.fundType} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Tier" 
                                columnKey="tier" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.tier || []} 
                                onFilterChange={(val) => handleColumnFilterChange('tier', val)} 
                                uniqueValues={uniqueValues.tier} 
                            />
                            <th className="data-table__head--status">Workflow Status</th>
                            <th className="data-table__head--actions data-table__sticky-right">
                                {isSelectionMode ? "Select" : "Actions"}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((item) => (
                            <tr key={item.id} >
                                <td className="data-table__cell--muted data-table__cell--nowrap data-table__cell--mono">{item.uid}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">{item.operatingUnit}</td>
                                <td className="data-table__cell--nowrap"><span className={getHiringStatusBadge(item.hiringStatus)}>{item.hiringStatus}</span></td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">
                                    {item.personnelPosition}
                                    <div className="data-table__subline">SG-{item.salaryGrade}</div>
                                </td>
                                <td className="data-table__cell--muted data-table__cell--nowrap">{item.personnelType}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap data-table__cell--numeric">{formatCurrency(item.annualSalary)}</td>
                                <td className="data-table__cell--muted data-table__cell--nowrap">{item.fundYear}</td>
                                <td className="data-table__cell--muted data-table__cell--nowrap">{item.fundType}</td>
                                <td className="data-table__cell--muted data-table__cell--nowrap">{item.tier}</td>
                                <td className="data-table__cell--nowrap">
                                    <div className="data-table-workflow">
                                        {getWorkflowStatusBadge(item.workflow_status)}
                                        {item.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                            <div className="data-table-workflow__actions">
                                                <button 
                                                    onClick={(e) => handleApprove(item.id, e)} 
                                                    className="action-mini action-mini--approve"
                                                    title="Approve"
                                                >
                                                    <Check className="btn-symbol" />
                                                </button>
                                                <button 
                                                    onClick={(e) => handleReject(item.id, e)} 
                                                    className="action-mini action-mini--reject"
                                                    title="Reject"
                                                >
                                                    <X className="btn-symbol" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                    <td className="data-table__cell--actions data-table__cell--nowrap data-table__sticky-right">
                                        {isSelectionMode ? (
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.includes(item.id)} 
                                                onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} 
                                                className="form-checkbox"
                                            />
                                        ) : (
                                            <div className="data-table__actions">
                                                {canEdit ? (
                                                    <>
                                                        <button onClick={() => onSelect(item)} className="table-action table-action--primary">Details</button>
                                                        <button 
                                                            onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} 
                                                            className="table-action table-action--danger"
                                                        >
                                                            Delete
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button onClick={() => onSelect(item)} className="table-action table-action--primary">View Details</button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>            <DataTablePagination
                currentPage={currentPage}
                itemsPerPage={itemsPerPage}
                totalItems={filteredItems.length}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                pageSizeOptions={[10, 20, 50, 100]}
                aria-label="Program management pagination"
            />
        </div>
    );
};
