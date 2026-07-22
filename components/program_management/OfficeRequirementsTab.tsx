
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { useSelection, useUserAccess, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { parseLocation } from '../LocationPicker'; 
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { Search, X, Check, Download, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { ConfirmDialog, DataTablePagination, SortableTableHeader } from '../ui/enterprise';
import { BulkSelectionBar, ColumnFilterDialog, MajorTableToolbar, SelectionCheckbox, TruncatedTableCell } from '../ui/MajorDataTable';

declare const XLSX: any;

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundYear', 'operatingUnit', 'fundType', 'tier']);

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

const getStatusBadge = (status: OfficeRequirement['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

export const parseOfficeRequirementRow = (row: any, commonData: any): OfficeRequirement => {
    return {
        ...commonData,
        equipment: row.equipment || '',
        specs: row.specs || '',
        purpose: row.purpose || '',
        numberOfUnits: Number(row.numberOfUnits) || 0,
        pricePerUnit: Number(row.pricePerUnit) || 0,
        status: row.status || 'Proposed',
        physicalDeliveryDate: row.physicalDeliveryDate || ''
    };
};

const getOfficeBudget = (item: OfficeRequirement) => (Number(item.numberOfUnits) || 0) * (Number(item.pricePerUnit) || 0);

interface OfficeRequirementsTabProps {
    items: OfficeRequirement[];
    setItems: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: OfficeRequirement) => void;
}

export const OfficeRequirementsTab: React.FC<OfficeRequirementsTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { locale } = useAuth(); // Assume it exists or just use default
    const { currentUser } = useAuth();
    const tableStoragePrefix = `programManagement_office_${currentUser?.id || 'anonymous'}`;
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Program Management');
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<OfficeRequirement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useLocalStorageState(`${tableStoragePrefix}_searchTerm`, '');
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: string; direction: 'ascending' | 'descending' }>(`${tableStoragePrefix}_sortConfig`, { key: 'id', direction: 'descending' });
    const [columnFilters, setColumnFilters] = useLocalStorageState<{ [key: string]: string[] }>(`${tableStoragePrefix}_columnFilters`, {});
    const [isColumnFilterOpen, setIsColumnFilterOpen] = useState(false);

    useEffect(() => {
        const cleanedFilters = Object.fromEntries(
            Object.entries(columnFilters).filter(([key]) => !DCF_SCOPE_COLUMN_KEYS.has(key))
        );

        if (Object.keys(cleanedFilters).length !== Object.keys(columnFilters).length) {
            setColumnFilters(cleanedFilters);
        }
    }, [columnFilters, setColumnFilters]);

    // Selection Hook
    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<OfficeRequirement>();

    // Form State for Add New
    const initialFormState = {
        id: 0,
        uid: '',
        operatingUnit: '',
        uacsCode: '',
        obligationDate: '',
        disbursementDate: '',
        physicalDeliveryDate: '',
        fundType: 'Current' as FundType,
        fundYear: new Date().getFullYear(),
        tier: 'Tier 1' as Tier,
        encodedBy: '',
        equipment: '',
        specs: '',
        purpose: '',
        numberOfUnits: 0,
        pricePerUnit: 0,
        status: 'Proposed' as 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled',
        actualDate: '',
        actualAmount: 0,
        actualObligationDate: '',
        actualDisbursementDate: '',
        actualObligationAmount: 0,
        actualDisbursementAmount: 0
    };
    const [formData, setFormData] = useState(initialFormState);
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

    // --- Effects ---
    // Initialize Form
    useEffect(() => {
        if (view === 'form') {
            setFormData({
                ...initialFormState,
                operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''),
                encodedBy: currentUser?.fullName || '',
            });
            setSelectedObjectType('MOOE');
            setSelectedParticular('');
        }
    }, [view, uacsCodes, currentUser, canViewAll]);

    // --- Derived Data ---
    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {};
        const columns: (keyof OfficeRequirement)[] = ['uid', 'operatingUnit', 'status', 'equipment', 'fundYear', 'fundType', 'tier', 'specs', 'numberOfUnits'];
        
        columns.forEach(col => {
            const unique = Array.from(new Set((items || []).map(item => String(item[col] || ''))))
                .filter(Boolean)
                .sort() as string[];
            values[col as string] = unique;
        });
        
        return values;
    }, [items]);

    const filteredItems = useMemo(() => {
        return (items || []).filter(item => {
            // Global Search
            const searchStr = `${item.uid} ${item.equipment} ${item.specs} ${item.operatingUnit}`.toLowerCase();
            if (searchTerm && !searchStr.includes(searchTerm.toLowerCase())) return false;

            // Column Filters
            for (const [key, values] of Object.entries(columnFilters)) {
                const filterValues = values as string[];
                if (filterValues.length > 0) {
                    const itemValue = String(item[key as keyof OfficeRequirement] || '');
                    if (!filterValues.includes(itemValue)) return false;
                }
            }

            return true;
        }).sort((a, b) => {
            const aValue = sortConfig.key === 'budget' ? getOfficeBudget(a) : a[sortConfig.key as keyof OfficeRequirement];
            const bValue = sortConfig.key === 'budget' ? getOfficeBudget(b) : b[sortConfig.key as keyof OfficeRequirement];

            if (aValue === bValue) return 0;
            if (aValue === undefined || aValue === null) return 1;
            if (bValue === undefined || bValue === null) return -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: any, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    useEffect(() => {
        if (!isSelectionMode) return;
        const visibleIds = new Set(filteredItems.map(item => item.id));
        setSelectedIds(previous => {
            const next = previous.filter(id => visibleIds.has(id));
            return next.length === previous.length ? previous : next;
        });
    }, [filteredItems, isSelectionMode, setSelectedIds]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'form-control--invalid' : ''}`;
    };

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
            setFormData(prev => {
                const newData = { ...prev, [name]: newYear };
                if (prev.obligationDate) {
                    const m = prev.obligationDate.split('-')[1];
                    if (m) newData.obligationDate = `${newYear}-${m}-01`;
                }
                if (prev.disbursementDate) {
                    const m = prev.disbursementDate.split('-')[1];
                    if (m) newData.disbursementDate = `${newYear}-${m}-01`;
                }
                return newData;
            });
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationErrors([]);
        
        // Validation
        const requiredFields = [
            { field: 'operatingUnit', label: 'Operating Unit' },
            { field: 'equipment', label: 'Equipment' },
            { field: 'fundYear', label: 'Fund Year' },
            { field: 'uacsCode', label: 'UACS Code' },
            { field: 'physicalDeliveryDate', label: 'Physical Delivery Month' },
            { field: 'obligationDate', label: 'Target Obligation' },
            { field: 'disbursementDate', label: 'Target Disbursement' },
            { field: 'numberOfUnits', label: 'Number of Units' },
            { field: 'pricePerUnit', label: 'Price per Unit' }
        ];

        const missingFields = requiredFields.filter(f => !formData[f.field as keyof typeof formData]);
        if (missingFields.length > 0) {
            setValidationErrors(missingFields.map(f => f.field));
            alert(`Please fill in the following required fields:\n${missingFields.map(f => `- ${f.label}`).join('\n')}`);
            return;
        }

        // Validate UACS Code
        const isValidUacs = availableUacsCodes.some(c => c.code === formData.uacsCode);
        if (!isValidUacs) {
            alert("The entered UACS Code is not valid or not found in the reference list.");
            return;
        }

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        const submissionData: any = {
            ...formData,
            numberOfUnits: Number(formData.numberOfUnits),
            pricePerUnit: Number(formData.pricePerUnit),
            fundYear: Number(formData.fundYear),
            // Accomplishment fields default to 0 for new items
            actualAmount: 0,
            actualObligationAmount: 0,
            actualDisbursementAmount: 0,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System',
            status: formData.status || 'Proposed',
            workflow_status,
            updated_at: new Date().toISOString()
        };

        delete submissionData.id;

        const year = new Date().getFullYear();
        const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        submissionData.uid = formData.uid || `OR-${year}-${sequence}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('office_requirements').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) {
                setItems(prev => [data, ...prev]);
                logAction('Created Office Requirement', data.particulars || data.equipment || data.uid, undefined, 'Office Requirement', String(data.id));
            }
        } else {
            // Offline
            const newItem = { ...submissionData, id: Date.now() };
            setItems(prev => [newItem, ...prev]);
        }
        
        setView('list');
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const decision = getDeleteDecision({
            moduleKey: 'office_requirements',
            item: itemToDelete,
            hasModuleAccess: canEdit,
        });
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'office_requirements',
            item: itemToDelete,
            itemId: itemToDelete.id,
            itemName: itemToDelete.equipment,
            status: itemToDelete.status,
            action: 'delete',
            entityType: 'office_requirement',
        });
        if (!allowed) return;

        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'office_requirement',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('office_requirements').delete().eq('id', itemToDelete.id);
                if (deleteError) throw deleteError;

                setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
            } catch (error: any) {
                console.error("Error archiving/deleting:", error);
                alert("Failed to delete: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
        }
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
    };

    const handleMultiDelete = async () => {
        const itemsToDelete = items.filter(i => selectedIds.includes(i.id));
        const deletableItems = itemsToDelete.filter(item => getDeleteDecision({
            moduleKey: 'office_requirements',
            item,
            hasModuleAccess: canEdit,
        }).allowed);
        const deletableIds = deletableItems.map(i => i.id);
        const skippedCount = itemsToDelete.length - deletableItems.length;
        
        if (deletableIds.length === 0) {
            alert("None of the selected items can be deleted based on their current status.");
            return;
        }

        if (supabase) {
            try {
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'office_requirement',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('office_requirements').delete().in('id', deletableIds);
                if (deleteError) throw deleteError;

                logAction('Deleted Office Requirements', `${deletableIds.length} items deleted`, undefined, 'Office Requirement');
                setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
            } catch (error: any) {
                console.error("Error archiving/deleting selected:", error);
                alert("Failed to delete selected: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
        }
        if (skippedCount) alert(`${skippedCount} selected office requirement${skippedCount === 1 ? ' was' : 's were'} skipped by DCF editing policy.`);
        setIsMultiDeleteModalOpen(false);
        setSelectedIds([]);
    };

    const handleClone = async () => {
        const itemsToClone = items.filter(i => selectedIds.includes(i.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} office requirements? This will create new entries with the same targets but reset accomplishments.`)) return;

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, obligations, physical_accomplishment_submitted_at, ...rest } = item;
            const newUid = `OR-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            // Reset actuals
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                physical_accomplishment_submitted_at: null,
                status: 'Proposed'
            };
            const item_workflow_status = workflow_status;

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                workflow_status: item_workflow_status,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('office_requirements').insert(newItemsPayload).select();
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
        if (!window.confirm('Are you sure you want to approve this requirement?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('office_requirements').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
                logAction('Approved Office Requirement', String(id), undefined, 'Office Requirement', String(id));
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
            const { error } = await supabase.from('office_requirements').update({ 
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

    // --- Import/Export ---
    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid,
            OU: item.operatingUnit,
            Equipment: item.equipment,
            Specs: item.specs,
            Purpose: item.purpose,
            Status: item.status,
            'Number of Units': item.numberOfUnits,
            'Price/Unit': item.pricePerUnit,
            'Total Amount': item.numberOfUnits * item.pricePerUnit,
            'Fund Type': item.fundType,
            'Fund Year': item.fundYear,
            Tier: item.tier,
            'Obligation Date': item.obligationDate,
            'Disbursement Date': item.disbursementDate
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Office Requirements");
        XLSX.writeFile(wb, "Office_Requirements_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'status', 'obligationDate', 'disbursementDate', 'uacsCode', 'equipment', 'specs', 'purpose', 'numberOfUnits', 'pricePerUnit'];
        const exampleData = [{
            operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', status: 'Proposed', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50203010-00',
            equipment: 'Laptop', specs: 'i7, 16GB RAM', purpose: 'For administrative use', numberOfUnits: 1, pricePerUnit: 50000
        }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Office_Req_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
                
                const currentTimestamp = new Date().toISOString();
                const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `OR-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';

                    return parseOfficeRequirementRow(row, {
                        uid,
                        operatingUnit: resolvedOU,
                        fundYear: fundYear,
                        fundType: row.fundType || 'Current',
                        tier: resolveTier(row.tier) || 'Tier 1',
                        obligationDate: row.obligationDate || '',
                        disbursementDate: row.disbursementDate || '',
                        uacsCode: row.uacsCode || '',
                        encodedBy: currentUser?.fullName || 'Upload',
                        status: row.status || 'Proposed',
                        workflow_status,
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    });
                });

                if (supabase) {
                    const { error } = await supabase.from('office_requirements').insert(newItems);
                    if (error) throw error;
                    const { data } = await supabase.from('office_requirements').select('*').order('id', { ascending: true });
                    if (data) setItems(data as OfficeRequirement[]);
                } else {
                    setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]);
                }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) {
                alert(`Import failed: ${err.message}`);
            } finally {
                setIsUploading(false);
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // --- Render ---
    if (view === 'form') {
        return (
            <div className="form-card animate-fadeIn">
                <div className="detail-header">
                    <h3 className="detail-title">Add Office Requirement</h3>
                    <button onClick={() => { setView('list'); }} className="btn btn-secondary">Cancel</button>
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
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div>
                                <label className="form-label">Equipment <span className="form-required">*</span></label>
                                <input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} placeholder="Enter equipment name" className={getInputClasses('equipment')} />
                            </div>
                            <div>
                                <label className="form-label">Specifications</label>
                                <input type="text" name="specs" value={formData.specs} onChange={handleInputChange} placeholder="Enter technical specifications" className={commonInputClasses} />
                            </div>
                            <div className="form-field--span-two">
                                <label className="form-label">Purpose</label>
                                <textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} placeholder="Enter purpose or justification" className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    {/* Section 2: Funding & Classification */}
                    <fieldset className="form-fieldset">
                        <legend className="form-legend">Funding & Classification</legend>
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

                            {/* Single Line for UACS related fields */}
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
                                        onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} 
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
                        </div>
                    </fieldset>

                    {/* Section 3: Target Schedule & Cost */}
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
                                <label className="form-label">Target Obligation <span className="form-required">*</span></label>
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
                                <label className="form-label">Target Disbursement <span className="form-required">*</span></label>
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
                            
                            <div>
                                <label className="form-label">Number of Units <span className="form-required">*</span></label>
                                <input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={getInputClasses('numberOfUnits')} />
                            </div>
                            <div>
                                <label className="form-label">Price per Unit <span className="form-required">*</span></label>
                                <input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={getInputClasses('pricePerUnit')} />
                            </div>
                            <div>
                                <label className="form-label">Total Amount</label>
                                <input 
                                    type="text" 
                                    value={formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))} 
                                    disabled 
                                    className={`${commonInputClasses} form-control--readonly`} 
                                />
                            </div>
                        </div>
                    </fieldset>

                    <div className="detail-edit-footer">
                        <button 
                            type="button" 
                            onClick={() => setView('list')} 
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="btn btn-primary"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    const requestSort = (key: string) => handleSort(key, sortConfig.key === key && sortConfig.direction === 'ascending' ? 'descending' : 'ascending');
    const tableFilterFields = [
        { key: 'status', label: 'Status', values: uniqueValues.status || [] },
        { key: 'equipment', label: 'Equipment', values: uniqueValues.equipment || [] },
        { key: 'specs', label: 'Specifications', values: uniqueValues.specs || [] },
        { key: 'numberOfUnits', label: 'Number of Units', values: uniqueValues.numberOfUnits || [] }
    ];

    // Compact list view
    return (
        <div className="data-table-card major-table-card animate-fadeIn">
            {isDeleteModalOpen && <ConfirmDialog title="Confirm deletion" description="Delete this record? This action cannot be undone." confirmLabel="Delete record" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} />}
            {isMultiDeleteModalOpen && <ConfirmDialog title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}?`} description="This action cannot be undone. The selected records will be permanently removed." confirmLabel="Delete" onCancel={() => setIsMultiDeleteModalOpen(false)} onConfirm={handleMultiDelete} />}
            <ColumnFilterDialog open={isColumnFilterOpen} fields={tableFilterFields} filters={columnFilters} onApply={setColumnFilters} onClose={() => setIsColumnFilterOpen(false)} />
            <MajorTableToolbar searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Search office requirements..." activeFilterCount={Object.keys(columnFilters).length} onOpenFilters={() => setIsColumnFilterOpen(true)} actions={isSelectionMode ? <BulkSelectionBar intent={selectionIntent} count={selectedIds.length} onConfirm={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} onClear={() => setSelectedIds([])} onCancel={resetSelection} /> : <>
                {canEdit && <button onClick={() => setView('form')} className="btn btn-primary"><Plus aria-hidden="true" /> Add New</button>}
                <button onClick={handleDownloadReport} className="btn btn-secondary"><Download aria-hidden="true" /> Export</button>
                {canEdit && <><button onClick={handleDownloadTemplate} className="btn btn-secondary"><FileSpreadsheet aria-hidden="true" /> Template</button><label className={`btn btn-secondary ${isUploading ? 'is-disabled' : ''}`}><Upload aria-hidden="true" /> {isUploading ? 'Uploading...' : 'Import'}<input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} /></label><button onClick={() => handleToggleMode('clone')} className="btn btn-secondary" aria-label="Clone multiple office requirements"><DuplicateIcon /> Clone</button><button onClick={() => handleToggleMode('delete')} className="btn btn-secondary" aria-label="Delete multiple office requirements"><TrashIcon /> Delete</button></>}
            </>} />
            <div className="data-table-scroll"><table className="data-table"><thead><tr>
                {isSelectionMode && <th className="data-table__cell--selection"><SelectionCheckbox aria-label="Select all office requirements on this page" onChange={(event) => handleSelectAll(event, paginatedData)} checked={paginatedData.length > 0 && paginatedData.every(item => selectedIds.includes(item.id))} indeterminate={paginatedData.some(item => selectedIds.includes(item.id)) && !paginatedData.every(item => selectedIds.includes(item.id))} /></th>}
                <SortableTableHeader label="Code" columnKey="uid" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="OU" columnKey="operatingUnit" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Status" columnKey="status" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Equipment" columnKey="equipment" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="No. of Units" columnKey="numberOfUnits" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Fund Year" columnKey="fundYear" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={requestSort} />
                <SortableTableHeader label="Budget" columnKey="budget" sortConfig={sortConfig} onSort={requestSort} />
                <th>Workflow Status</th>
            </tr></thead><tbody>
                {paginatedData.map(item => <tr key={item.id} className={isSelectionMode ? (selectedIds.includes(item.id) ? `data-table__row--selected${selectionIntent === 'delete' ? ' data-table__row--selected-danger' : ''}` : undefined) : 'data-table__row--interactive'} tabIndex={isSelectionMode ? undefined : 0} aria-label={isSelectionMode ? undefined : `View details for ${item.uid}`} onClick={isSelectionMode ? undefined : () => onSelect(item)} onKeyDown={isSelectionMode ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item); } }}>
                    {isSelectionMode && <td className="data-table__cell--selection"><SelectionCheckbox aria-label={`Select ${item.uid}`} checked={selectedIds.includes(item.id)} onChange={() => handleSelectRow(item.id)} disabled={selectionIntent === 'delete' && !getDeleteDecision({ moduleKey: 'office_requirements', item, hasModuleAccess: canEdit }).allowed} /></td>}
                    <td className="data-table__cell--mono"><TruncatedTableCell value={item.uid} /></td><td><TruncatedTableCell value={item.operatingUnit} /></td><td><span className={getStatusBadge(item.status)}>{item.status}</span></td><td className="data-table__cell--primary"><TruncatedTableCell value={item.equipment} /></td><td className="data-table__cell--numeric">{item.numberOfUnits}</td><td>{item.fundYear}</td><td>{item.fundType}</td><td>{item.tier}</td><td className="data-table__cell--numeric">{formatCurrency(getOfficeBudget(item))}</td><td>{getWorkflowStatusBadge(item.workflow_status)}</td>
                </tr>)}
                {paginatedData.length === 0 && <tr><td className="data-table__empty-cell" colSpan={isSelectionMode ? 11 : 10}>No office requirements match the current filters.</td></tr>}
            </tbody></table></div>
            <DataTablePagination currentPage={currentPage} itemsPerPage={itemsPerPage} totalItems={filteredItems.length} totalPages={totalPages} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
        </div>
    );

};
