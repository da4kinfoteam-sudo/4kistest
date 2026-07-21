
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
import { DcfScopeFilterPanel, DcfScopeFilterToggle, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { ConfirmDialog, DataTablePagination, FilterableTableHeader } from './ui/enterprise';

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
    return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
};

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundingYear', 'operatingUnit', 'fundType', 'tier']);

const Subprojects: React.FC<SubprojectsProps> = ({ 
    ipos, subprojects, setSubprojects, setIpos, onSelectIpo, onSelectSubproject, 
    onCreateSubproject, uacsCodes, particularTypes, commodityCategories, externalFilters, onClearExternalFilters,
    onDataScopeChange
}) => {
    const { currentUser } = useAuth();
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
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState('subprojects_searchTerm', '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);
    
    // Column Filters
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>('subprojects_columnFilters', {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);

    // Sorting - Persistent State
    type SortKeys = keyof Subproject | 'totalBudget' | 'actualObligated' | 'actualDisbursed' | 'completionRate' | 'commodityTarget';
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>('subprojects_sortConfig', { key: 'startDate', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const dcfFilters = useDcfScopeFilters({
        storageKey: 'subprojects_dcf_scope',
        moduleName: 'Subprojects',
        onDataScopeChange
    });

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
            
            if (externalFilters.year) {
                newFilters['fundingYear'] = [externalFilters.year];
            }
            if (externalFilters.region) {
                // Improved logic: Filter OUs where the mapped region name includes the filter text
                // This handles "Region 3" vs "Region III" loose matching
                const filterRegionLower = externalFilters.region.toLowerCase();
                const targetOUs = operatingUnits.filter(ou => {
                    const mappedRegion = ouToRegionMap[ou];
                    if (!mappedRegion) return false;
                    return mappedRegion.toLowerCase().includes(filterRegionLower);
                });

                if (targetOUs.length > 0) {
                    newFilters['operatingUnit'] = targetOUs;
                }
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

            // Clear the external filters so they don't re-apply on remount
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [externalFilters, onClearExternalFilters]);

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

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedSubprojects 
    } = usePagination(processedSubprojects, [searchTerm, columnFilters, sortConfig]);

    const handleSort = (key: SortKeys, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
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

    const getScopeColumnFilter = (key: 'fundingYear' | 'operatingUnit' | 'fundType' | 'tier') => {
        const value = key === 'fundingYear'
            ? dcfFilters.selectedYear
            : key === 'operatingUnit'
                ? dcfFilters.selectedOu
                : key === 'fundType'
                    ? dcfFilters.selectedFundType
                    : dcfFilters.selectedTier;
        return value === 'All' ? [] : [value];
    };

    const handleToggleRow = (id: number) => {
        setExpandedRowId(prev => (prev === id ? null : id));
    };

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

    return (
        <div className="data-list-page">
            {isDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm deletion"
                    description={<>Are you sure you want to delete “{subprojectToDelete?.name}”? This action cannot be undone.</>}
                    confirmLabel="Delete"
                    onCancel={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                />
            )}

            {isMultiDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm bulk deletion"
                    description={<>Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected subprojects? This action cannot be undone.</>}
                    confirmLabel="Delete all selected"
                    onCancel={() => setIsMultiDeleteModalOpen(false)}
                    onConfirm={confirmMultiDelete}
                />
            )}

            <div className="data-list-header">
                <h2 className="data-list-title">Subprojects Management</h2>
                <div className="data-list-actions">
                    <DcfScopeFilterToggle idPrefix="subprojects-dcf" filters={dcfFilters} />
                    {canEdit && (
                        <button onClick={onCreateSubproject} className="btn btn-primary btn-responsive" title="Add New Subproject">
                            <Plus className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Add New Subproject</span>
                        </button>
                    )}
                </div>
            </div>
            <DcfScopeFilterPanel idPrefix="subprojects-dcf" filters={dcfFilters} />
            <div className="data-table-card">
                <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                    <div className="data-toolbar-group">
                        <input
                            type="text"
                            placeholder="Search Subproject..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSavedSearchTerm(e.target.value);
                            }}
                            className={`data-table-search w-full md:w-64 ${commonInputClasses} mt-0`}
                        />
                        {Object.keys(columnFilters).length > 0 && (
                            <button onClick={clearColumnFilters} className="data-table-reset">
                                Reset Filters
                            </button>
                        )}
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
                        <button onClick={() => downloadSubprojectsReport(processedSubprojects)} className="btn btn-primary btn-responsive" title="Download Report">
                            <Download className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Download Report</span>
                        </button>
                        {canEdit && (
                            <>
                                <button onClick={downloadSubprojectsTemplate} className="btn btn-secondary btn-responsive" title="Download Template">
                                    <FileSpreadsheet className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">Template</span>
                                </button>
                                <label htmlFor="subproject-upload" className={`btn btn-primary btn-responsive ${isUploading ? 'is-disabled' : 'cursor-pointer'}`} title={isUploading ? 'Uploading...' : 'Upload'}>
                                    <Upload className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">{isUploading ? 'Uploading...' : 'Upload'}</span>
                                </label>
                                <input id="subproject-upload" type="file" className="hidden" onChange={(e) => handleSubprojectsUpload(e, subprojects, setSubprojects, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
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
                                <th scope="col" className="data-table__sticky-left" aria-label="Expand row"></th>
                                <FilterableTableHeader label="Name" columnKey="name" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['name'] || []} onFilterChange={(v) => handleColumnFilterChange('name', v)} uniqueValues={uniqueValues.name} />
                                <FilterableTableHeader label="OU" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('operatingUnit')} onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)} uniqueValues={uniqueValues.operatingUnit} />
                                <FilterableTableHeader label="IPO" columnKey="indigenousPeopleOrganization" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['indigenousPeopleOrganization'] || []} onFilterChange={(v) => handleColumnFilterChange('indigenousPeopleOrganization', v)} uniqueValues={uniqueValues.indigenousPeopleOrganization} />
                                <FilterableTableHeader label="Fund Year" columnKey="fundingYear" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('fundingYear')} onFilterChange={(v) => handleColumnFilterChange('fundingYear', v)} uniqueValues={uniqueValues.fundingYear} />
                                <FilterableTableHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('fundType')} onFilterChange={(v) => handleColumnFilterChange('fundType', v)} uniqueValues={uniqueValues.fundType} />
                                <FilterableTableHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('tier')} onFilterChange={(v) => handleColumnFilterChange('tier', v)} uniqueValues={uniqueValues.tier} />
                                <FilterableTableHeader label="Project Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['status'] || []} onFilterChange={(v) => handleColumnFilterChange('status', v)} uniqueValues={uniqueValues.status} />
                                <FilterableTableHeader label="Commodity target" columnKey="commodityTarget" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <FilterableTableHeader label="Budget" columnKey="totalBudget" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <FilterableTableHeader label="Completion rate" columnKey="completionRate" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <th scope="col">Workflow Status</th>
                                <th scope="col" className="data-table__head--actions data-table__sticky-right">
                                    {isSelectionMode ? (
                                        <div className="data-table__select-all">
                                            <span>Select all</span>
                                            <input type="checkbox" onChange={(e) => handleSelectAll(e, paginatedSubprojects)} checked={paginatedSubprojects.length > 0 && paginatedSubprojects.every(s => selectedIds.includes(s.id))} className="form-checkbox" />
                                        </div>
                                    ) : ("Actions")}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedSubprojects.map((s) => {
                                const details = s.details || [];
                                const budget = calculateTotalBudget(details);
                                const actualObligated = details.reduce((sum, d) => sum + (d.actualObligationAmount || 0), 0);
                                const actualDisbursed = details.reduce((sum, d) => sum + (d.actualDisbursementAmount || 0), 0);
                                const totalItems = details.length;
                                const completedItems = details.filter(d => d.actualDeliveryDate).length;
                                const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                                const commodities = s.subprojectCommodities && s.subprojectCommodities.length > 0 ? s.subprojectCommodities.map(c => `${c.name} (${c.area} ${c.typeName === 'Livestock' ? 'heads' : 'ha'})`).join(', ') : 'N/A';

                                return (
                                <React.Fragment key={s.id}>
                                    <tr onClick={() => handleToggleRow(s.id)} className="data-table__row--interactive">
                                        <td className="data-table__sticky-left data-table__cell--soft"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === s.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="data-table__cell--primary data-table__cell--wrap">
                                            <button onClick={(e) => {e.stopPropagation(); onSelectSubproject(s);}} className="table-link">
                                                {s.name || 'Unnamed Subproject'}
                                            </button>
                                            <span className="data-table__subline">{s.uid || 'No UID'}</span>
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{s.operatingUnit || 'N/A'}</td>
                                        <td className="data-table__cell--muted data-table__cell--wrap">{s.indigenousPeopleOrganization || 'N/A'}</td>
                                         <td className="data-table__cell--muted data-table__cell--nowrap">{s.fundingYear || 'N/A'}</td>
                                         <td className="data-table__cell--muted data-table__cell--nowrap">{s.fundType || 'N/A'}</td>
                                         <td className="data-table__cell--muted data-table__cell--nowrap">{s.tier || 'N/A'}</td>
                                         <td className="data-table__cell--nowrap"><span className={getStatusBadge(s.status)}>{s.status || 'Unknown'}</span></td>
                                        <td className="data-table__cell--muted data-table__cell--wrap">{commodities}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{formatCurrency(budget)}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">
                                            <div className="data-table-progress-inline">
                                                <span className="data-table-progress__value">{completionRate}%</span>
                                                <div className="data-table-progress data-table-progress--compact">
                                                    <div className={`data-table-progress__bar ${completionRate === 100 ? 'data-table-progress__bar--complete' : ''}`} style={{ width: `${completionRate}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="data-table__cell--nowrap">
                                            <div className="flex flex-col gap-1 items-start">
                                                {getWorkflowStatusBadge(s.workflow_status)}
                                                {s.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                                    <div className="flex gap-1 mt-1">
                                                        <button 
                                                            onClick={(e) => handleApprove(s.id, e)} 
                                                            className="action-mini action-mini--approve"
                                                            title="Approve"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => handleReject(s.id, e)} 
                                                            className="action-mini action-mini--reject"
                                                            title="Reject"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="data-table__cell--actions data-table__cell--nowrap data-table__sticky-right">
                                            {canEdit ? (
                                                <div className="data-table__actions">
                                                    {isSelectionMode && (
                                                        <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(s.id); }} onClick={(e) => e.stopPropagation()} className="form-checkbox" />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); onSelectSubproject(s); }} className="table-action table-action--primary">Details</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(s); }} className="table-action table-action--danger">Delete</button>
                                                </div>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); onSelectSubproject(s); }} className="table-action table-action--primary">View Details</button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRowId === s.id && (
                                        <tr className="data-table__detail-row">
                                            <td colSpan={11} className="data-table__detail-cell">
                                                <div className="data-table-detail-grid data-table-detail-grid--three">
                                                    <div className="data-table-detail-stack">
                                                        <section className="data-table-detail-section">
                                                            <h4 className="data-table-detail-title">Project Details</h4>
                                                            <div className="data-table-detail-text data-table-detail-stack">
                                                                <p><strong>Location:</strong> <span>{s.location || 'N/A'}</span></p>
                                                                <p><strong>Package:</strong> <span>{s.packageType || 'N/A'}</span></p>
                                                                <p><strong>Status:</strong> <span className={getStatusBadge(s.status)}>{s.status || 'Unknown'}</span></p>
                                                                <p><strong>Encoded by:</strong> <span>{s.encodedBy || 'N/A'}</span></p>
                                                            </div>
                                                        </section>
                                                        <section className="data-table-detail-panel data-table-detail-panel--accent">
                                                            <h4 className="data-table-detail-title">Timeline</h4>
                                                            <div className="data-table-detail-text data-table-detail-stack">
                                                                <p><strong>Start Date:</strong> {formatDate(s.startDate)}</p>
                                                                <p><strong>Target Completion:</strong> {formatDate(s.estimatedCompletionDate)}</p>
                                                                <p><strong>Actual Completion:</strong> {formatDate(s.actualCompletionDate)}</p>
                                                            </div>
                                                        </section>
                                                        {s.remarks && (
                                                            <section className="data-table-detail-section">
                                                                <h4 className="data-table-detail-title">Remarks</h4>
                                                                <p className="data-table-detail-empty">{s.remarks}</p>
                                                            </section>
                                                        )}
                                                    </div>
                                                    
                                                    <section className="data-table-detail-panel">
                                                        <h4 className="data-table-detail-title">Budget & Particulars</h4>
                                                        {details.length > 0 ? (
                                                            <ul className="data-table-detail-list">
                                                                {details.map(detail => (
                                                                    <li key={detail.id} className="data-table-detail-list__item">
                                                                        <div>
                                                                            <strong>{detail.particulars || 'Unnamed Item'}</strong>
                                                                            <span className="data-table-detail-caption">{detail.uacsCode || 'No UACS'} | {detail.numberOfUnits || 0} {detail.unitOfMeasure || 'units'}</span>
                                                                            <span className="data-table-detail-caption">Obl: {formatMonthYear(detail.obligationMonth)} | Disb: {formatMonthYear(detail.disbursementMonth)}</span>
                                                                        </div>
                                                                        <strong>{formatCurrency((detail.pricePerUnit || 0) * (detail.numberOfUnits || 0))}</strong>
                                                                    </li>
                                                                ))}
                                                                <li className="data-table-detail-list__total"><span>Total</span><span>{formatCurrency(calculateTotalBudget(details))}</span></li>
                                                            </ul>
                                                        ) : ( <p className="data-table-detail-empty">No budget items listed.</p> )}
                                                        
                                                        <div className="data-table-detail-meta">
                                                            <p><strong>Funding Year:</strong> <span>{s.fundingYear ?? 'N/A'}</span></p>
                                                            <p><strong>Fund Type:</strong> <span>{s.fundType ?? 'N/A'}</span></p>
                                                            <p><strong>Tier:</strong> <span>{s.tier ?? 'N/A'}</span></p>
                                                        </div>
                                                    </section>

                                                    <section className="data-table-detail-panel">
                                                        <h4 className="data-table-detail-title">Accomplishment Brief</h4>
                                                        <div className="data-table-detail-stack">
                                                            <div className="data-table-detail-metric">
                                                                <span>Physical Completion</span>
                                                                <strong>{completionRate}%</strong>
                                                            </div>
                                                            <div className="data-table-progress">
                                                                <div className={`data-table-progress__bar ${completionRate === 100 ? 'data-table-progress__bar--complete' : ''}`} style={{ width: `${completionRate}%` }}></div>
                                                            </div>
                                                            <div className="data-table-detail-divider">
                                                                <div className="data-table-detail-metric"><span>Actual Obligated</span><strong>{formatCurrency(actualObligated)}</strong></div>
                                                                <div className="data-table-detail-metric"><span>Actual Disbursed</span><strong>{formatCurrency(actualDisbursed)}</strong></div>
                                                            </div>
                                                            {s.subprojectCommodities && s.subprojectCommodities.length > 0 && (
                                                                <div className="data-table-detail-divider">
                                                                    <p className="data-table-detail-title">Impact</p>
                                                                    {s.subprojectCommodities.map((c, i) => (
                                                                        <div key={i} className="data-table-detail-metric"><span>{c.name || 'Unknown'}</span><strong>{c.actualYield ? c.actualYield : '-'} {c.typeName === 'Livestock' ? 'heads' : 'yield'} (Actual)</strong></div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </section>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );})}
                        </tbody>
                    </table>
                </div>
                 
                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={processedSubprojects.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                />
            </div>
        </div>
    );
};

export default Subprojects;

// --- End of Subprojects.tsx ---
