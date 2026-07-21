// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OtherProgramExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { useSelection, useUserAccess, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState'; // Import for persistent state
import { Search, X, Check, ChevronDown, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { ConfirmDialog, DataTablePagination, FilterableTableHeader } from '../ui/enterprise';

interface OtherExpenseColumnHeaderProps {
    label: string;
    columnKey: keyof OtherProgramExpense;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const OtherExpenseColumnHeader: React.FC<OtherExpenseColumnHeaderProps> = ({ columnKey, onSort, ...props }) => (
    <FilterableTableHeader
        {...props}
        columnKey={String(columnKey)}
        onSort={(key, direction) => onSort(key as keyof OtherProgramExpense, direction)}
    />
);

declare const XLSX: any;

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
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

export const parseOtherExpenseRow = (row: any, commonData: any): OtherProgramExpense => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate totals from monthly columns if present for defaults, but prioritize row.amount
    let calculatedAmount = 0;
    months.forEach(m => { calculatedAmount += (Number(row[`disbursement${m}`]) || 0); });
    
    let calculatedActual = 0;
    months.forEach(m => { calculatedActual += (Number(row[`actualDisbursement${m}`]) || 0); });

    // Use row.amount if present (Target Obligation), otherwise fallback to calculated
    const finalAmount = Number(row.amount) || calculatedAmount || 0;
    const finalActualDisbursement = calculatedActual > 0 ? calculatedActual : (Number(row.actualDisbursementAmount) || 0);

    const result: any = {
        ...commonData,
        particulars: row.particulars || '',
        amount: finalAmount,
        obligatedAmount: Number(row.obligatedAmount) || finalAmount, // Default to amount if missing
        actualDisbursementAmount: finalActualDisbursement
    };

    months.forEach(m => {
        result[`disbursement${m}`] = Number(row[`disbursement${m}`]) || 0;
        result[`actualDisbursement${m}`] = Number(row[`actualDisbursement${m}`]) || 0;
    });

    return result as OtherProgramExpense;
};

interface OtherExpensesTabProps {
    items: OtherProgramExpense[];
    setItems: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: OtherProgramExpense) => void;
}

export const OtherExpensesTab: React.FC<OtherExpensesTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Program Management');
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingItem, setEditingItem] = useState<OtherProgramExpense | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showErrorAlert, setShowErrorAlert] = useState(false);
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');
    const [uacsDescription, setUacsDescription] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<OtherProgramExpense | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useLocalStorageState('programManagement_other_searchTerm', '');
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: string; direction: 'ascending' | 'descending' }>('programManagement_other_sortConfig', { key: 'id', direction: 'descending' });
    const [columnFilters, setColumnFilters] = useLocalStorageState<{ [key: string]: string[] }>('programManagement_other_columnFilters', {});

    useEffect(() => {
        const cleanedFilters = Object.fromEntries(
            Object.entries(columnFilters).filter(([key]) => !DCF_SCOPE_COLUMN_KEYS.has(key))
        );

        if (Object.keys(cleanedFilters).length !== Object.keys(columnFilters).length) {
            setColumnFilters(cleanedFilters);
        }
    }, [columnFilters, setColumnFilters]);

    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<OtherProgramExpense>();

    // Form State
    const initialFormState: OtherProgramExpense = {
        id: 0, uid: '', operatingUnit: '', uacsCode: '', obligationDate: '', disbursementDate: '', fundType: 'Current' as FundType, fundYear: new Date().getFullYear(), tier: 'Tier 1' as Tier, encodedBy: '',
        particulars: '', amount: 0, obligatedAmount: 0, status: 'Proposed',
        actualDate: '', actualAmount: 0, actualObligationDate: '', actualDisbursementDate: '', actualObligationAmount: 0, actualDisbursementAmount: 0,
        // Target Schedule
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        // Actual Schedule (Init to 0)
        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
        actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
    };
    const [formData, setFormData] = useState<OtherProgramExpense>(initialFormState);

    const getInputClasses = (fieldName: string) => {
        const baseClasses = "form-control";
        if (validationErrors.includes(fieldName)) {
            return `${baseClasses} form-control--invalid`;
        }
        return baseClasses;
    };

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

    useEffect(() => {
        // Removed ouFilter dependency
    }, [currentUser, canViewAll]);

    useEffect(() => {
        if (view === 'form') {
            if (editingItem) {
                // Should technically not be reachable via Add New but keeping logic robust
                setFormData({ ...initialFormState, ...editingItem });
                let foundType: ObjectType = 'MOOE'; let foundParticular = '';
                outerLoop: for (const type of objectTypes) { if(uacsCodes[type]) { for (const part in uacsCodes[type]) { if (uacsCodes[type][part].hasOwnProperty(editingItem.uacsCode)) { foundType = type; foundParticular = part; break outerLoop; } } } }
                setSelectedObjectType(foundType); setSelectedParticular(foundParticular);
            } else {
                setFormData({ ...initialFormState, operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''), encodedBy: currentUser?.fullName || '' });
                setSelectedObjectType('MOOE'); setSelectedParticular('');
            }
        }
    }, [view, editingItem, uacsCodes, currentUser, canViewAll]);

    // Auto-calc totals from target schedules only
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const targetDisbursementTotal = months.reduce((sum, m) => sum + (Number((formData as any)[`disbursement${m}`]) || 0), 0);

    const availableYears = useMemo(() => {
        const years = new Set<string>(); 
        items.forEach(i => {
            if(i.fundYear) years.add(i.fundYear.toString());
        }); 
        return Array.from(years).sort().reverse();
    }, [items]);

    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {
            uid: [],
            operatingUnit: [],
            status: [],
            uacsCode: [],
            particulars: [],
            fundYear: [],
            fundType: []
        };

        items.forEach(item => {
            Object.keys(values).forEach(key => {
                const val = String(item[key as keyof OtherProgramExpense] || '');
                if (val && !values[key].includes(val)) {
                    values[key].push(val);
                }
            });
        });

        Object.keys(values).forEach(key => values[key].sort());
        return values;
    }, [items]);

    const filteredItems = useMemo(() => {
        let filtered = items;

        // Global Search (UID or UACs code or Particulars)
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                (item.uid || '').toLowerCase().includes(lowSearch) || 
                (item.uacsCode || '').toLowerCase().includes(lowSearch) ||
                (item.particulars || '').toLowerCase().includes(lowSearch)
            );
        }

        // Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String(item[key as keyof OtherProgramExpense] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Sorting
        return [...filtered].sort((a, b) => {
            const aValue = a[sortConfig.key as keyof OtherProgramExpense];
            const bValue = b[sortConfig.key as keyof OtherProgramExpense];

            if (aValue === bValue) return 0;
            
            // Handle null/undefined
            if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: keyof OtherProgramExpense, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    const handleColumnFilterChange = (column: string, values: string[]) => {
        setColumnFilters(prev => ({ ...prev, [column]: values }));
    };

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

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
            setFormData(prev => {
                const newData = { ...prev, [name]: value };
                // Sync Obligated Amount with Target Allocation (amount)
                if (name === 'amount') {
                    newData.obligatedAmount = Number(value);
                }
                return newData;
            });
        }
    };

    useEffect(() => {
        if (view === 'form' && !editingItem) {
            const currentYear = new Date().getFullYear();
            setFormData(prev => ({
                ...prev,
                fundYear: currentYear,
                obligationDate: `${currentYear}-01-01`
            }));
        }
    }, [view, editingItem]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const requiredFields = [
            { key: 'operatingUnit', label: 'Operating Unit' },
            { key: 'status', label: 'Status' },
            { key: 'uacsCode', label: 'UACS Code' },
            { key: 'particulars', label: 'Particular' },
            { key: 'obligationDate', label: 'Obligation Date' },
            { key: 'amount', label: 'Target Allocation Amount' }
        ];

        const disbursementFields = [
            'disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr',
            'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug',
            'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'
        ];

        const errors: string[] = [];
        const missingLabels: string[] = [];

        requiredFields.forEach(field => {
            if (!formData[field.key as keyof OtherProgramExpense]) {
                errors.push(field.key);
                missingLabels.push(field.label);
            }
        });

        disbursementFields.forEach(field => {
            if (formData[field as keyof OtherProgramExpense] === undefined || formData[field as keyof OtherProgramExpense] === null) {
                errors.push(field);
                if (!missingLabels.includes('Monthly Disbursements')) {
                    missingLabels.push('Monthly Disbursements');
                }
            }
        });

        if (errors.length > 0) {
            setValidationErrors(errors);
            alert(`Please fill in the following required fields:\n- ${missingLabels.join('\n- ')}`);
            return;
        }

        setValidationErrors([]);

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        const submissionData: any = {
            ...formData,
            amount: Number(formData.amount), 
            obligatedAmount: Number(formData.amount), // Set obligatedAmount equal to amount (allocation)
            fundYear: Number(formData.fundYear),
            // Default 0 for new accomplishments
            actualAmount: 0, actualObligationAmount: 0, actualDisbursementAmount: 0,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System', 
            workflow_status,
            updated_at: new Date().toISOString()
        };

        // Ensure monthly fields are numbers (Target)
        months.forEach(m => {
            // @ts-ignore
            submissionData[`disbursement${m}`] = Number(formData[`disbursement${m}`]);
            // @ts-ignore
            submissionData[`actualDisbursement${m}`] = 0; // Initialize actuals to 0
        });

        // Always remove ID from payload
        delete submissionData.id;
        delete submissionData.physicalDeliveryDate;

        submissionData.uid = formData.uid || `OE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('other_program_expenses').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) {
                setItems(prev => [data, ...prev]);
                logAction('Created Other Program Expense', data.particulars || data.uid, undefined, 'Other Program Expense', String(data.id));
            }
        } else {
            const newItem = { ...submissionData, id: Date.now() } as OtherProgramExpense;
            setItems(prev => [newItem, ...prev]);
        }
        setView('list'); setEditingItem(null);
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const decision = getDeleteDecision({
            moduleKey: 'other_program_expenses',
            item: itemToDelete,
            hasModuleAccess: canEdit,
        });
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'other_program_expenses',
            item: itemToDelete,
            itemId: itemToDelete.id,
            itemName: itemToDelete.particulars,
            status: itemToDelete.status,
            action: 'delete',
            entityType: 'other_program_expense',
        });
        if (!allowed) return;
        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'other_program_expense',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('other_program_expenses').delete().eq('id', itemToDelete.id);
                if (deleteError) throw deleteError;

                logAction('Deleted Other Program Expense', itemToDelete.particulars || itemToDelete.uid, undefined, 'Other Program Expense', String(itemToDelete.id));
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
            moduleKey: 'other_program_expenses',
            item,
            hasModuleAccess: canEdit,
        }).allowed);
        const skippedCount = itemsToDelete.length - deletableItems.length;
        if (deletableItems.length === 0) {
            alert('None of the selected program expenses can be deleted under the current DCF editing policy.');
            setIsMultiDeleteModalOpen(false);
            setSelectedIds([]);
            return;
        }
        const deletableIds = deletableItems.map(item => item.id);

        if (supabase) {
            try {
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'other_program_expense',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('other_program_expenses').delete().in('id', deletableIds);
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
        if (skippedCount) alert(`${skippedCount} selected program expense${skippedCount === 1 ? ' was' : 's were'} skipped by DCF editing policy.`);
        setIsMultiDeleteModalOpen(false); setSelectedIds([]);
    };

    const handleClone = async () => {
        const itemsToClone = items.filter(i => selectedIds.includes(i.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} items?`)) return;

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, physicalDeliveryDate, obligations, ...rest } = item;
            // Generate new UID
            const newUid = `OE-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            // Reset actuals for new clone
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
            };

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                workflow_status,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('other_program_expenses').insert(newItemsPayload).select();
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
        if (!window.confirm('Are you sure you want to approve this expense?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('other_program_expenses').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
                logAction('Approved Other Program Expense', String(id), undefined, 'Other Program Expense', String(id));
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
            const { error } = await supabase.from('other_program_expenses').update({ 
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
            UID: item.uid, OU: item.operatingUnit, Particulars: item.particulars, Amount: item.amount, 'Obligated Amount': item.obligatedAmount, 'Fund Type': item.fundType, 'Fund Year': item.fundYear, Tier: item.tier, 'Obligation Date': item.obligationDate, 'Disbursement Date': item.disbursementDate
        }));
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Other Expenses"); XLSX.writeFile(wb, "Other_Expenses_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const monthHeaders = ['disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr', 'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug', 'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'];
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'amount', 'obligatedAmount', 'uacsCode', 'particulars', ...monthHeaders];
        const exampleData = [{ operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', amount: 20000, obligatedAmount: 10000, uacsCode: '50299990-99', particulars: 'Miscellaneous Expenses', disbursementJan: 10000, disbursementFeb: 5000 }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Other_Exp_Template.xlsx");
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
                    const uid = `OE-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';

                    return parseOtherExpenseRow(row, {
                        uid, 
                        operatingUnit: resolvedOU, 
                        fundYear: fundYear, 
                        fundType: row.fundType || 'Current', 
                        tier: resolveTier(row.tier) || 'Tier 1', 
                        obligationDate: row.obligationDate || '', 
                        uacsCode: row.uacsCode || '', 
                        encodedBy: currentUser?.fullName || 'Upload', 
                        workflow_status,
                        created_at: currentTimestamp, 
                        updated_at: currentTimestamp
                    });
                });
                if (supabase) {
                    const { error } = await supabase.from('other_program_expenses').insert(newItems); if (error) throw error;
                    const { data } = await supabase.from('other_program_expenses').select('*').order('id', { ascending: true }); if (data) setItems(data as OtherProgramExpense[]);
                } else { setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]); }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) { alert(`Import failed: ${err.message}`); } finally { setIsUploading(false); if(e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'form') {
        return (
            <div className="form-card animate-fadeIn">
                <div className="detail-header">
                    <h3 className="detail-title">
                        {editingItem ? 'Edit Other Expense' : 'Add New Other Expense'}
                    </h3>
                    <button onClick={() => { setView('list'); setEditingItem(null); setValidationErrors([]); }} className="btn btn-secondary">Cancel</button>
                </div>
                <form onSubmit={handleFormSubmit} className="detail-stack">
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
                                    disabled={!canViewAll && !!currentUser} 
                                    className={`${getInputClasses('operatingUnit')} `}
                                >
                                    <option value="">Select OU</option>
                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Status <span className="form-required">*</span></label>
                                <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
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
                        <div className="detail-stack">
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

                            {/* UACS Row */}
                            <div className="program-form-grid program-form-grid--four form-grid--align-end">
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
                                            // Find first code for this particular
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
                                <div className="form-control-wrap">
                                    <label className="form-label">UACS Code <span className="form-required">*</span></label>
                                    <div className="form-control-wrap">
                                        <input 
                                            type="text" 
                                            name="uacsCode" 
                                            value={formData.uacsCode} 
                                            onChange={handleInputChange} 
                                            list="uacs-codes-list"
                                            className={`${getInputClasses('uacsCode')} pr-10`} 
                                        />
                                        <div className="form-control-end-icon">
                                            <svg className="form-control-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <datalist id="uacs-codes-list">
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
                                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                                        <div key={month} className="program-month-cell">
                                            <label className="program-month-cell__label">{month}</label>
                                            <input 
                                                type="number" 
                                                name={`disbursement${month}`} 
                                                value={formData[`disbursement${month}` as keyof OtherProgramExpense] || 0} 
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
        );
    }

    // List View
    return (
        <div className="data-table-card">            {isDeleteModalOpen && (
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
                            placeholder="Search Other Expenses..." 
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
                            onClick={() => { setEditingItem(null); setView('form'); }} 
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
                            <OtherExpenseColumnHeader label="UID" columnKey="uid" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['uid'] || []} onFilterChange={(v) => handleColumnFilterChange('uid', v)} uniqueValues={uniqueValues['uid']} />
                            <OtherExpenseColumnHeader label="OU" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['operatingUnit'] || []} onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)} uniqueValues={uniqueValues['operatingUnit']} />
                            <OtherExpenseColumnHeader label="Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['status'] || []} onFilterChange={(v) => handleColumnFilterChange('status', v)} uniqueValues={uniqueValues['status']} />
                            <OtherExpenseColumnHeader label="UACS Code" columnKey="uacsCode" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['uacsCode'] || []} onFilterChange={(v) => handleColumnFilterChange('uacsCode', v)} uniqueValues={uniqueValues['uacsCode']} />
                            <OtherExpenseColumnHeader label="Particulars" columnKey="particulars" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['particulars'] || []} onFilterChange={(v) => handleColumnFilterChange('particulars', v)} uniqueValues={uniqueValues['particulars']} />
                            <OtherExpenseColumnHeader label="Amount" columnKey="amount" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['amount'] || []} onFilterChange={(v) => handleColumnFilterChange('amount', v)} uniqueValues={[]} isNumeric />
                            <OtherExpenseColumnHeader label="Fund Year" columnKey="fundYear" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['fundYear'] || []} onFilterChange={(v) => handleColumnFilterChange('fundYear', v)} uniqueValues={uniqueValues['fundYear']} />
                            <OtherExpenseColumnHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['fundType'] || []} onFilterChange={(v) => handleColumnFilterChange('fundType', v)} uniqueValues={uniqueValues['fundType']} />
                            <OtherExpenseColumnHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['tier'] || []} onFilterChange={(v) => handleColumnFilterChange('tier', v)} uniqueValues={uniqueValues['tier']} />
                            <th className="data-table__head--status">Workflow Status</th>
                            <th className="data-table__head--actions data-table__sticky-right">{isSelectionMode ? "Select" : "Actions"}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((item) => (
                            <tr key={item.id} >
                                <td className="data-table__cell--muted data-table__cell--nowrap data-table__cell--mono">{item.uid}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">{item.operatingUnit}</td>
                                <td className="data-table__cell--nowrap">
                                    <span className={`status-badge ${
                                        item.status === 'Completed' ? 'status-badge--completed' :
                                        item.status === 'Ongoing' ? 'status-badge--ongoing' :
                                        item.status === 'Cancelled' ? 'status-badge--cancelled' :
                                        'status-badge--proposed'
                                    }`}>
                                        {item.status}
                                    </span>
                                </td>
                                <td className="data-table__cell--primary data-table__cell--nowrap data-table__cell--mono">
                                    {item.uacsCode}
                                </td>
                                <td className="data-table__cell--primary"><div className="data-table__cell--truncate" title={item.particulars}>{item.particulars}</div></td>
                                <td className="data-table__cell--primary data-table__cell--nowrap data-table__cell--numeric">{formatCurrency(item.amount)}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">{item.fundYear}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">{item.fundType}</td>
                                <td className="data-table__cell--primary data-table__cell--nowrap">{item.tier}</td>
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
