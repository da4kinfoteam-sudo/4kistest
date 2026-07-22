
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, IPO, SubprojectDetail, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import { Check, Download, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, useUserAccess } from './mainfunctions/TableHooks';
import { downloadSubprojectsReport, downloadSubprojectsTemplate, handleSubprojectsUpload } from './mainfunctions/ImportExportService';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { supabase } from '../supabaseClient';
import type { DataScope } from '../lib/scopedDataFetch';
import { DcfScopeFilterPanel, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { ConfirmDialog, DataTablePagination, SortableTableHeader } from './ui/enterprise';
import { BulkSelectionBar, ColumnFilterDialog, MajorTableToolbar, SelectionCheckbox, TruncatedTableCell } from './ui/MajorDataTable';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets } from '../lib/budgetLineAdjustments';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface SubprojectsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    onCreateSubproject: () => void; // New prop for triggering Add Mode
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
    externalFilters?: { region?: string; year?: string; search?: string; status?: string } | null;
    onClearExternalFilters?: () => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const DuplicateIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
    </svg>
);

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce(
        (total, item) => total + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)),
        0
    );
};

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundingYear', 'operatingUnit', 'fundType', 'tier']);

const Subprojects: React.FC<SubprojectsProps> = ({ 
    ipos, subprojects, setSubprojects, setIpos, onSelectIpo, onSelectSubproject, 
    onCreateSubproject, uacsCodes, particularTypes, commodityCategories, externalFilters, onClearExternalFilters,
    onDataScopeChange
}) => {
    const { currentUser } = useAuth();
    const tableStoragePrefix = `subprojects_${currentUser?.id || 'anonymous'}`;
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Subprojects');
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [subprojectToDelete, setSubprojectToDelete] = useState<Subproject | null>(null);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');
    
    // Use Shared Selection Hook
    const { 
        isSelectionMode, setIsSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<Subproject>();

    const [isUploading, setIsUploading] = useState(false);

    // Filters - Persistent State
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState(`${tableStoragePrefix}_searchTerm`, '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);
    
    // Column Filters
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>(`${tableStoragePrefix}_columnFilters`, {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);
    const [isColumnFilterOpen, setIsColumnFilterOpen] = useState(false);

    // Sorting - Persistent State
    type SortKeys = keyof Subproject | 'totalBudget' | 'actualObligated' | 'actualDisbursed' | 'completionRate' | 'commodityTarget';
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>(`${tableStoragePrefix}_sortConfig`, { key: 'startDate', direction: 'descending' });
    
    const dcfFilters = useDcfScopeFilters({
        storageKey: 'subprojects_dcf_scope',
        moduleName: 'Subprojects',
        onDataScopeChange
    });
    const applyExternalScope = dcfFilters.applyScope;

    useEffect(() => {
        const cleanedFilters = Object.fromEntries(
            Object.entries(columnFilters).filter(([key]) => !DCF_SCOPE_COLUMN_KEYS.has(key))
        );
        if (Object.keys(cleanedFilters).length !== Object.keys(columnFilters).length) {
            setColumnFilters(cleanedFilters);
            setSavedColumnFilters(cleanedFilters);
        }
    }, [columnFilters, setSavedColumnFilters]);

    // Listen to External Filters (Chatbot)
    useEffect(() => {
        if (externalFilters) {
            const newFilters: Record<string, string[]> = {};
            
            const scopeUpdates: Parameters<typeof applyExternalScope>[0] = {};
            if (externalFilters.year) scopeUpdates.selectedYear = externalFilters.year;
            if (externalFilters.region) {
                // Improved logic: Filter OUs where the mapped region name includes the filter text
                // This handles "Region 3" vs "Region III" loose matching
                const filterRegionLower = externalFilters.region.toLowerCase();
                const targetOUs = operatingUnits.filter(ou => {
                    const mappedRegion = ouToRegionMap[ou];
                    if (!mappedRegion) return false;
                    return mappedRegion.toLowerCase().includes(filterRegionLower);
                });

                if (targetOUs.length > 0) scopeUpdates.selectedOu = targetOUs[0];
            }
            if (externalFilters.status) {
                newFilters['status'] = [externalFilters.status];
            }
            if (externalFilters.search) {
                setSearchTerm(externalFilters.search);
            }
            
            // Only update if there are changes to avoid loop
            if (Object.keys(newFilters).length > 0) {
                setColumnFilters(prev => ({ ...prev, ...newFilters }));
            }
            if (Object.keys(scopeUpdates).length > 0) applyExternalScope(scopeUpdates);

            // Clear the external filters so they don't re-apply on remount
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [applyExternalScope, externalFilters, onClearExternalFilters]);

    const initiallyFilteredSubprojects = useMemo(() => {
        let filtered = subprojects.filter(s => matchesDcfScope(s as any, dcfFilters.value, 'fundingYear'));

        if (!canViewAll && currentUser) {
            filtered = filtered.filter(s => s.operatingUnit === currentUser.operatingUnit);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                (s.name?.toLowerCase() || '').includes(lower) ||
                (s.indigenousPeopleOrganization?.toLowerCase() || '').includes(lower) ||
                (s.location?.toLowerCase() || '').includes(lower) ||
                (s.operatingUnit?.toLowerCase() || '').includes(lower) ||
                (s.uid?.toLowerCase() || '').includes(lower) ||
                (s.details && s.details.some(d => 
                    (d.type?.toLowerCase() || '').includes(lower) || 
                    (d.particulars?.toLowerCase() || '').includes(lower)
                ))
            );
        }
        return filtered;
    }, [subprojects, searchTerm, currentUser, canViewAll, dcfFilters.value]);

    // 2. Extract Unique Values
    const uniqueValues = useMemo(() => {
        const getUnique = (key: keyof Subproject) => Array.from(new Set(initiallyFilteredSubprojects.map(s => String(s[key] || '')))).filter(Boolean).sort();
        return {
            name: getUnique('name'),
            status: getUnique('status'),
            operatingUnit: getUnique('operatingUnit'),
            indigenousPeopleOrganization: getUnique('indigenousPeopleOrganization'),
            packageType: getUnique('packageType'),
            fundingYear: filterYears,
            fundType: getUnique('fundType'),
            tier: getUnique('tier'),
            estimatedCompletionDate: getUnique('estimatedCompletionDate'),
            actualCompletionDate: getUnique('actualCompletionDate')
        };
    }, [initiallyFilteredSubprojects]);

    const processedSubprojects = useMemo(() => {
        let filtered = [...initiallyFilteredSubprojects];

        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String((item as any)[key] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any = '';
                let bValue: any = '';

                const getBudget = (s: Subproject) => calculateTotalBudget(s.details || []);
                const getObligated = (s: Subproject) => (s.details || []).reduce((sum, d) => sum + (d.actualObligationAmount || 0), 0);
                const getDisbursed = (s: Subproject) => (s.details || []).reduce((sum, d) => sum + (d.actualDisbursementAmount || 0), 0);
                const getRate = (s: Subproject) => {
                    const details = s.details || [];
                    const total = details.length;
                    const comp = details.filter(d => d.actualDeliveryDate).length;
                    return total > 0 ? (comp / total) * 100 : 0;
                };
                const getCommodities = (s: Subproject) => s.subprojectCommodities?.map(c => c.name || '').join(', ') || '';

                switch (sortConfig.key) {
                    case 'totalBudget':
                        aValue = getBudget(a);
                        bValue = getBudget(b);
                        break;
                    case 'actualObligated':
                        aValue = getObligated(a);
                        bValue = getObligated(b);
                        break;
                    case 'actualDisbursed':
                        aValue = getDisbursed(a);
                        bValue = getDisbursed(b);
                        break;
                    case 'completionRate':
                        aValue = getRate(a);
                        bValue = getRate(b);
                        break;
                    case 'commodityTarget':
                        aValue = getCommodities(a);
                        bValue = getCommodities(b);
                        break;
                    case 'estimatedCompletionDate':
                    case 'actualCompletionDate':
                    case 'startDate':
                        aValue = a[sortConfig.key] ? new Date(a[sortConfig.key] as string).getTime() : 0;
                        bValue = b[sortConfig.key] ? new Date(b[sortConfig.key] as string).getTime() : 0;
                        break;
                    default:
                        aValue = a[sortConfig.key as keyof Subproject] ?? '';
                        bValue = b[sortConfig.key as keyof Subproject] ?? '';
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [initiallyFilteredSubprojects, columnFilters, sortConfig]);

    useEffect(() => {
        if (!isSelectionMode) return;
        const visibleIds = new Set(processedSubprojects.map(item => item.id));
        setSelectedIds(previous => {
            const next = previous.filter(id => visibleIds.has(id));
            return next.length === previous.length ? previous : next;
        });
    }, [isSelectionMode, processedSubprojects, setSelectedIds]);

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedSubprojects 
    } = usePagination(processedSubprojects, [searchTerm, columnFilters, sortConfig]);

    const handleSort = (key: string) => {
        const typedKey = key as SortKeys;
        setSortConfig(previous => ({
            key: typedKey,
            direction: previous?.key === typedKey && previous.direction === 'ascending' ? 'descending' : 'ascending'
        }));
    };

    const handleColumnFilterChange = (columnKey: string, values: string[]) => {
        const nextScopeValue = values.length === 1 ? values[0] : 'All';
        if (columnKey === 'fundingYear') {
            dcfFilters.setSelectedYear(nextScopeValue);
            return;
        }
        if (columnKey === 'operatingUnit') {
            dcfFilters.setSelectedOu(nextScopeValue);
            return;
        }
        if (columnKey === 'fundType') {
            dcfFilters.setSelectedFundType(nextScopeValue);
            return;
        }
        if (columnKey === 'tier') {
            dcfFilters.setSelectedTier(nextScopeValue);
            return;
        }
        const newFilters = {
            ...columnFilters,
            [columnKey]: values
        };
        setColumnFilters(newFilters);
        setSavedColumnFilters(newFilters);
    };
    
    const clearColumnFilters = () => {
        setColumnFilters({});
        setSavedColumnFilters({});
    }

    const canDeleteSubprojectByPolicy = (subproject: Subproject) => getDeleteDecision({
        moduleKey: 'subprojects',
        item: subproject,
        hasModuleAccess: canEdit,
    });

    const confirmMultiDelete = async () => {
        const itemsToDelete = subprojects.filter(s => selectedIds.includes(s.id));
        const deletableItems = itemsToDelete.filter(item => canDeleteSubprojectByPolicy(item).allowed);
        const skippedCount = itemsToDelete.length - deletableItems.length;
        if (deletableItems.length === 0) {
            alert('None of the selected subprojects can be deleted under the current DCF editing policy.');
            resetSelection();
            return;
        }
        const deletableIds = deletableItems.map(item => item.id);
        const deletedNames = deletableItems.map(s => s.name).join(', ');
        logAction('Deleted Subprojects', `Bulk deleted ${deletableItems.length} subprojects: ${deletedNames}${skippedCount ? ` (${skippedCount} skipped by policy)` : ''}`);

        if (supabase) {
            try {
                // Archive each item
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'subproject',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('subprojects').delete().in('id', deletableIds);
                if (deleteError) throw deleteError;

                setSubprojects(prev => prev.filter(s => !deletableIds.includes(s.id)));
                resetSelection();
            } catch (error: any) {
                console.error("Error archiving/deleting:", error);
                alert("Failed to delete selected items: " + error.message);
            }
        } else {
            setSubprojects(prev => prev.filter(s => !deletableIds.includes(s.id)));
            resetSelection();
        }
        if (skippedCount) alert(`${skippedCount} selected subproject${skippedCount === 1 ? ' was' : 's were'} skipped by DCF editing policy.`);
    };

    const handleClone = async () => {
        const itemsToClone = subprojects.filter(s => selectedIds.includes(s.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} subprojects? This will create new entries with the same details but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const currentYear = new Date().getFullYear();

        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, history, physical_accomplishment_submitted_at, ...rest } = item;
            
            const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const newUid = `SP-${currentYear}-${sequence}${index}`;

            const clonedDetails = (item.details || []).map(d => ({
                ...d,
                id: Date.now() + Math.random(),
                actualDeliveryDate: '',
                actualNumberOfUnits: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualAmount: 0,
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                isCompleted: false
            }));

            const clonedCommodities = (item.subprojectCommodities || []).map(c => ({
                ...c,
                actualYield: 0,
                income: 0
            }));

            return {
                ...rest,
                uid: newUid,
                status: 'Proposed',
                actualCompletionDate: undefined,
                physical_accomplishment_submitted_at: null,
                catchUpPlanRemarks: '',
                newTargetCompletionDate: '',
                details: clonedDetails,
                subprojectCommodities: clonedCommodities,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
                history: [{
                    date: currentTimestamp,
                    event: 'Cloned from ' + uid,
                    user: currentUser?.fullName || 'System'
                }]
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('subprojects').insert(newItemsPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setSubprojects(prev => [...data as Subproject[], ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} subprojects.`);
            }
        } else {
            const newLocalItems = newItemsPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setSubprojects(prev => [...(newLocalItems as Subproject[]), ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} subprojects (Local).`);
        }
    };

    const handleToggleMode = (intent: 'delete' | 'clone') => {
        if (isSelectionMode && selectionIntent === intent) {
            toggleSelectionMode();
        } else if (isSelectionMode && selectionIntent !== intent) {
            setSelectionIntent(intent);
        } else {
            setSelectionIntent(intent);
            toggleSelectionMode();
        }
    };

    const handleDeleteClick = (subproject: Subproject) => {
        setSubprojectToDelete(subproject);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (subprojectToDelete) {
            const allowed = await ensureDecisionAllowed(canDeleteSubprojectByPolicy(subprojectToDelete), {
                moduleKey: 'subprojects',
                item: subprojectToDelete,
                itemId: subprojectToDelete.id,
                itemName: subprojectToDelete.name,
                status: subprojectToDelete.status,
                action: 'delete',
                entityType: 'subproject',
            });
            if (!allowed) return;
            logAction('Deleted Subproject', subprojectToDelete.name, subprojectToDelete.indigenousPeopleOrganization, 'Subproject', String(subprojectToDelete.id));
            
            if (supabase) {
                try {
                    const { error: archiveError } = await supabase.from('trash_bin').insert([{
                        entity_type: 'subproject',
                        original_id: subprojectToDelete.id,
                        data: subprojectToDelete,
                        deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                        deleted_at: new Date().toISOString()
                    }]);
                    if (archiveError) throw archiveError;

                    const { error: deleteError } = await supabase.from('subprojects').delete().eq('id', subprojectToDelete.id);
                    if (deleteError) throw deleteError;

                    setSubprojects(prev => prev.filter(s => s.id !== subprojectToDelete.id));
                } catch (error: any) {
                    console.error("Error archiving/deleting:", error);
                    alert("Failed to delete subproject: " + error.message);
                }
            } else {
                setSubprojects(prev => prev.filter(s => s.id !== subprojectToDelete.id));
            }

            setIsDeleteModalOpen(false);
            setSubprojectToDelete(null);
        }
    };

    // --- Render Helpers ---
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const formatMonthYear = (dateString?: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const getStatusBadge = (status: Subproject['status']) => {
        switch (status) {
            case 'Completed': return 'status-badge status-badge--completed';
            case 'Ongoing': return 'status-badge status-badge--ongoing';
            case 'Proposed': return 'status-badge status-badge--proposed';
            case 'Cancelled': return 'status-badge status-badge--cancelled';
            default: return 'status-badge status-badge--neutral';
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
        if (!window.confirm('Are you sure you want to approve this subproject?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('subprojects').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('subprojects').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    const columnFilterFields = [
        { key: 'name', label: 'Subproject Name', values: uniqueValues.name },
        { key: 'indigenousPeopleOrganization', label: 'IPO', values: uniqueValues.indigenousPeopleOrganization },
        { key: 'status', label: 'Status', values: uniqueValues.status }
    ];

    return (
        <div className="data-list-page">
            {isDeleteModalOpen && <ConfirmDialog title="Confirm deletion" description={<>Are you sure you want to delete “{subprojectToDelete?.name}”? This action cannot be undone.</>} confirmLabel="Delete" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} />}
            {isMultiDeleteModalOpen && <ConfirmDialog title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}?`} description="This action cannot be undone. The selected records will be permanently removed." confirmLabel="Delete" onCancel={() => setIsMultiDeleteModalOpen(false)} onConfirm={confirmMultiDelete} />}
            <ColumnFilterDialog open={isColumnFilterOpen} fields={columnFilterFields} filters={columnFilters} onApply={(filters) => { setColumnFilters(filters); setSavedColumnFilters(filters); }} onClose={() => setIsColumnFilterOpen(false)} />

            <div className="data-list-header">
                <h2 className="data-list-title">Subprojects Management</h2>
                {canEdit && <button onClick={onCreateSubproject} className="btn btn-primary"><Plus aria-hidden="true" /> Add New Subproject</button>}
            </div>
            <DcfScopeFilterPanel idPrefix="subprojects-dcf" filters={dcfFilters} />

            <div className="data-table-card major-table-card">
                <MajorTableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={(value) => { setSearchTerm(value); setSavedSearchTerm(value); }}
                    searchPlaceholder="Search subprojects..."
                    activeFilterCount={Object.keys(columnFilters).length}
                    onOpenFilters={() => setIsColumnFilterOpen(true)}
                    actions={isSelectionMode
                        ? <BulkSelectionBar intent={selectionIntent} count={selectedIds.length} onConfirm={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} onClear={() => setSelectedIds([])} onCancel={resetSelection} />
                        : <>
                        <button onClick={() => downloadSubprojectsReport(processedSubprojects)} className="btn btn-secondary"><Download aria-hidden="true" /> Export</button>
                        {canEdit && <>
                            <button onClick={downloadSubprojectsTemplate} className="btn btn-secondary"><FileSpreadsheet aria-hidden="true" /> Template</button>
                            <label htmlFor="subproject-upload" className={`btn btn-secondary ${isUploading ? 'is-disabled' : 'cursor-pointer'}`}><Upload aria-hidden="true" /> {isUploading ? 'Uploading...' : 'Import'}</label>
                            <input id="subproject-upload" type="file" className="hidden" onChange={(e) => handleSubprojectsUpload(e, subprojects, setSubprojects, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
                            <button onClick={() => handleToggleMode('clone')} className="btn btn-secondary" aria-label="Clone multiple subprojects"><DuplicateIcon /> Clone</button>
                            <button onClick={() => handleToggleMode('delete')} className="btn btn-secondary" aria-label="Delete multiple subprojects"><TrashIcon /> Delete</button>
                        </>}
                    </>}
                />

                <div className="data-table-scroll">
                    <table className="data-table">
                        <thead><tr>
                            {isSelectionMode && <th className="data-table__cell--selection"><SelectionCheckbox aria-label="Select all subprojects on this page" onChange={(e) => handleSelectAll(e, paginatedSubprojects)} checked={paginatedSubprojects.length > 0 && paginatedSubprojects.every(item => selectedIds.includes(item.id))} indeterminate={paginatedSubprojects.some(item => selectedIds.includes(item.id)) && !paginatedSubprojects.every(item => selectedIds.includes(item.id))} /></th>}
                            <SortableTableHeader label="Code" columnKey="uid" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Subproject Name" columnKey="name" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Operating Unit" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="IPO" columnKey="indigenousPeopleOrganization" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Fund Year" columnKey="fundingYear" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Commodity Target" columnKey="commodityTarget" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Budget" columnKey="totalBudget" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Completion Rate" columnKey="completionRate" sortConfig={sortConfig} onSort={handleSort} />
                            <th>Workflow Status</th>
                        </tr></thead>
                        <tbody>
                            {paginatedSubprojects.map(s => {
                                const details = s.details || [];
                                const budget = calculateTotalBudget(details);
                                const completionRate = details.length ? Math.round((details.filter(detail => detail.actualDeliveryDate).length / details.length) * 100) : 0;
                                const commodities = s.subprojectCommodities?.map(commodity => `${commodity.name} (${commodity.area} ${commodity.typeName === 'Livestock' ? 'heads' : 'ha'})`).join(', ') || 'N/A';
                                return <tr
                                    key={s.id}
                                    className={isSelectionMode ? (selectedIds.includes(s.id) ? `data-table__row--selected${selectionIntent === 'delete' ? ' data-table__row--selected-danger' : ''}` : undefined) : 'data-table__row--interactive'}
                                    tabIndex={isSelectionMode ? undefined : 0}
                                    aria-label={isSelectionMode ? undefined : `View details for ${s.name || s.uid}`}
                                    onClick={isSelectionMode ? undefined : () => onSelectSubproject(s)}
                                    onKeyDown={isSelectionMode ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectSubproject(s); } }}
                                >
                                    {isSelectionMode && <td className="data-table__cell--selection"><SelectionCheckbox aria-label={`Select ${s.name || s.uid}`} checked={selectedIds.includes(s.id)} onChange={() => handleSelectRow(s.id)} /></td>}
                                    <td className="data-table__cell--mono"><TruncatedTableCell value={s.uid || 'No code'} /></td>
                                    <td className="data-table__cell--primary"><TruncatedTableCell value={s.name || 'Unnamed Subproject'} /></td>
                                    <td><TruncatedTableCell value={s.operatingUnit} /></td>
                                    <td><TruncatedTableCell value={s.indigenousPeopleOrganization} /></td>
                                    <td>{s.fundingYear || '—'}</td><td>{s.fundType || '—'}</td><td>{s.tier || '—'}</td>
                                    <td><TruncatedTableCell value={commodities} /></td>
                                    <td className="data-table__cell--numeric">{formatCurrency(budget)}</td>
                                    <td><span className={getStatusBadge(s.status)}>{s.status || 'Unknown'}</span></td>
                                    <td>{completionRate}%</td>
                                    <td><div className="data-table__actions">{getWorkflowStatusBadge(s.workflow_status)}{s.workflow_status === 'PENDING' && canApprove(currentUser?.role) && <><button onClick={(e) => handleApprove(s.id, e)} className="action-mini action-mini--approve" aria-label={`Approve ${s.name}`}><Check aria-hidden="true" /></button><button onClick={(e) => handleReject(s.id, e)} className="action-mini action-mini--reject" aria-label={`Reject ${s.name}`}><X aria-hidden="true" /></button></>}</div></td>
                                </tr>;
                            })}
                            {paginatedSubprojects.length === 0 && <tr><td className="data-table__empty-cell" colSpan={isSelectionMode ? 13 : 12}>No subprojects match the current filters.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <DataTablePagination currentPage={currentPage} totalPages={totalPages} totalItems={processedSubprojects.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
            </div>
        </div>
    );
};

export default Subprojects;

// --- End of Subprojects.tsx ---
