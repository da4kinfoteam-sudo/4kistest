
// Author: 4K
import React, { useState, useMemo, useEffect } from 'react';
import { Check, Download, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity, philippineRegions, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, useUserAccess } from './mainfunctions/TableHooks';
import { downloadActivitiesReport, downloadActivitiesTemplate, handleActivitiesUpload } from './mainfunctions/ImportExportService';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { fetchAll } from '../hooks/useSupabaseTable';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import type { DataScope } from '../lib/scopedDataFetch';
import { DcfScopeFilterPanel, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';
import { ConfirmDialog, DataTablePagination, SortableTableHeader } from './ui/enterprise';
import { BulkSelectionBar, ColumnFilterDialog, MajorTableToolbar, SelectionCheckbox, TruncatedTableCell } from './ui/MajorDataTable';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets } from '../lib/budgetLineAdjustments';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

const calculateActivityBudget = (activity: Activity) => (activity.expenses || []).reduce(
    (total, expense) => total + (isBudgetLineExcludedFromTargets(expense) ? 0 : getBudgetLineAmount(expense)),
    0
);

interface ActivitiesProps {
    ipos: IPO[];
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectActivity: (activity: Activity) => void;
    onCreateActivity: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
    forcedType?: 'Training' | 'Activity';
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

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundingYear', 'operatingUnit', 'fundType', 'tier']);

const getStatusBadge = (status: Activity['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

export const ActivitiesComponent: React.FC<ActivitiesProps> = ({
    ipos, activities, setActivities, onSelectIpo, onSelectActivity,
    onCreateActivity, uacsCodes, referenceActivities = [], forcedType,
    externalFilters, onClearExternalFilters,
    onDataScopeChange
}) => {
    const { currentUser } = useAuth();
    const tableStoragePrefix = `activities_${currentUser?.id || 'anonymous'}`;
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<Activity | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Shared Hooks
    const { canEdit, canViewAll } = useUserAccess('Activities');
    const {
        isSelectionMode, selectedIds, setSelectedIds, isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode,
        handleSelectAll, handleSelectRow, resetSelection
    } = useSelection<Activity>();

    // Global Filters (Only Search retained in UI)
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState(`${tableStoragePrefix}_searchTerm`, '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);

    // Column Filters (New) - Stores an array of selected values for each column key
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>(`${tableStoragePrefix}_columnFilters`, {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);
    const [isColumnFilterOpen, setIsColumnFilterOpen] = useState(false);

    // Sorting
    type SortKeys = keyof Activity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });

    const dcfFilters = useDcfScopeFilters({
        storageKey: forcedType === 'Training'
            ? 'trainings_dcf_scope'
            : forcedType === 'Activity'
                ? 'other_activities_dcf_scope'
                : 'activities_dcf_scope',
        moduleName: 'Activities',
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

            if (Object.keys(newFilters).length > 0) {
                setColumnFilters(prev => ({ ...prev, ...newFilters }));
            }
            if (Object.keys(scopeUpdates).length > 0) applyExternalScope(scopeUpdates);

            // Clear the external filters so they don't re-apply on remount or navigation
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [applyExternalScope, externalFilters, onClearExternalFilters]);

    // 1. Initial Filtering (Search + Permissions + ForcedType)
    const initiallyFilteredActivities = useMemo(() => {
        let filtered = activities.filter(activity => matchesDcfScope(activity as any, dcfFilters.value, 'fundingYear'));

        // Permission-based OU Filtering
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(a => a.operatingUnit === currentUser.operatingUnit);
        }

        // Forced Type (e.g. Trainings Page vs Activities Page)
        if (forcedType) {
            filtered = filtered.filter(activity => activity.type === forcedType);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(lowercasedSearchTerm) ||
                t.location.toLowerCase().includes(lowercasedSearchTerm) ||
                t.description.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.type === 'Training' && t.facilitator?.toLowerCase().includes(lowercasedSearchTerm)) ||
                t.operatingUnit.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.uid && t.uid.toLowerCase().includes(lowercasedSearchTerm))
            );
        }
        return filtered;
    }, [activities, searchTerm, forcedType, currentUser, canViewAll, dcfFilters.value]);

    // 2. Extract Unique Values for Column Filters based on Initially Filtered Data
    const uniqueValues = useMemo(() => {
        const getUnique = (key: keyof Activity) => Array.from(new Set(initiallyFilteredActivities.map(a => String(a[key] || '')))).filter(Boolean).sort();
        return {
            name: getUnique('name'),
            status: getUnique('status'),
            date: getUnique('date'),
            description: getUnique('description'),
            budget: [], // Budget is numeric
            operatingUnit: getUnique('operatingUnit'),
            component: getUnique('component'),
            tier: getUnique('tier'),
            fundingYear: filterYears,
            fundType: fundTypes
        };
    }, [initiallyFilteredActivities]);

    // 3. Apply Column Filters & Sort
    const processedActivities = useMemo(() => {
        let filtered = [...initiallyFilteredActivities];

        // Apply Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String((item as any)[key] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Apply Sorting
        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalParticipants') {
                    aValue = a.participantsMale + a.participantsFemale;
                    bValue = b.participantsMale + b.participantsFemale;
                } else if (sortConfig.key === 'budget') {
                    aValue = calculateActivityBudget(a);
                    bValue = calculateActivityBudget(b);
                } else {
                    aValue = a[sortConfig.key as keyof Activity] || '';
                    bValue = b[sortConfig.key as keyof Activity] || '';
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [initiallyFilteredActivities, columnFilters, sortConfig]);

    useEffect(() => {
        if (!isSelectionMode) return;
        const visibleIds = new Set(processedActivities.map(item => item.id));
        setSelectedIds(previous => {
            const next = previous.filter(id => visibleIds.has(id));
            return next.length === previous.length ? previous : next;
        });
    }, [isSelectionMode, processedActivities, setSelectedIds]);

    // Use Shared Pagination Hook
    const {
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedActivities
    } = usePagination(processedActivities, [searchTerm, forcedType, sortConfig, columnFilters]);

    // Sorting Handler
    const handleSort = (key: string) => {
        const typedKey = key as SortKeys;
        setSortConfig(previous => ({
            key: typedKey,
            direction: previous?.key === typedKey && previous.direction === 'ascending' ? 'descending' : 'ascending'
        }));
    };

    // Filter Change Handler
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

    // Clear Column Filters
    const clearColumnFilters = () => {
        setColumnFilters({});
        setSavedColumnFilters({});
    }

    const canDeleteActivityByPolicy = (activity: Activity) => getDeleteDecision({
        moduleKey: 'activities',
        item: activity,
        hasModuleAccess: canEdit,
    });

    // ... (Deletion, Cloning, formatDate handlers remain the same)
    const confirmMultiDelete = async () => {
        if (selectedIds.length > 0) {
            const itemsToDelete = activities.filter(a => selectedIds.includes(a.id));
            const deletableItems = itemsToDelete.filter(item => canDeleteActivityByPolicy(item).allowed);
            const skippedCount = itemsToDelete.length - deletableItems.length;
            if (deletableItems.length === 0) {
                alert('None of the selected activities can be deleted under the current DCF editing policy.');
                resetSelection();
                return;
            }
            const deletableIds = deletableItems.map(item => item.id);
            const deletedItems = deletableItems.map(a => a.name).join(', ');
            logAction('Deleted Activities', `Bulk deleted ${deletableItems.length} items: ${deletedItems}${skippedCount ? ` (${skippedCount} skipped by policy)` : ''}`);

            if (supabase) {
                try {
                    // Archive each item
                    const archivePayload = deletableItems.map(item => ({
                        entity_type: 'activity',
                        original_id: item.id,
                        data: item,
                        deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                        deleted_at: new Date().toISOString()
                    }));

                    const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                    if (archiveError) throw archiveError;

                    const { error: deleteError } = await supabase.from('activities').delete().in('id', deletableIds);
                    if (deleteError) throw deleteError;

                    setActivities(prev => prev.filter(a => !deletableIds.includes(a.id)));
                } catch (error: any) {
                    console.error("Error archiving/deleting:", error);
                    alert("Failed to delete selected items: " + error.message);
                }
            } else {
                setActivities(prev => prev.filter(a => !deletableIds.includes(a.id)));
            }
            if (skippedCount) alert(`${skippedCount} selected activit${skippedCount === 1 ? 'y was' : 'ies were'} skipped by DCF editing policy.`);
        }
        resetSelection();
    };

    const handleClone = async () => {
        const itemsToClone = activities.filter(a => selectedIds.includes(a.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} activities? This will create new entries with the same details but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const currentYear = new Date().getFullYear();

        const newActivitiesPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, history, participating_ipo_ids, physical_accomplishment_submitted_at, ...rest } = item;

            const prefix = item.type === 'Training' ? 'TRN' : 'ACT';
            const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const newUid = `${prefix}-${currentYear}-${sequence}${index}`;

            const clonedExpenses = item.expenses.map(exp => ({
                ...exp,
                id: Date.now() + Math.random(),
                actualObligationAmount: 0,
                actualObligationDate: null as unknown as string,
                actualDisbursementAmount: 0,
                actualDisbursementDate: null as unknown as string,
                actualAmount: 0
            }));

            return {
                ...rest,
                uid: newUid,
                status: 'Proposed',
                actualDate: null as unknown as string,
                actualEndDate: null as unknown as string,
                physical_accomplishment_submitted_at: null,
                actualParticipantsMale: 0,
                actualParticipantsFemale: 0,
                catchUpPlanRemarks: '',
                newTargetDate: null as unknown as string,
                expenses: clonedExpenses,
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
            const { data, error } = await supabase.from('activities').insert(newActivitiesPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setActivities(prev => [...data as Activity[], ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} activities.`);
            }
        } else {
            const newLocalItems = newActivitiesPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setActivities(prev => [...(newLocalItems as Activity[]), ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} activities (Local).`);
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

    const handleDeleteClick = (activity: Activity) => {
        setItemToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            const allowed = await ensureDecisionAllowed(canDeleteActivityByPolicy(itemToDelete), {
                moduleKey: 'activities',
                item: itemToDelete,
                itemId: itemToDelete.id,
                itemName: itemToDelete.name,
                status: itemToDelete.status,
                action: 'delete',
                entityType: 'activity',
            });
            if (!allowed) return;
            logAction(`Deleted ${itemToDelete.type}`, itemToDelete.name, itemToDelete.participatingIpos.join(', '), itemToDelete.type, String(itemToDelete.id));

             for (const ipoName of itemToDelete.participatingIpos) {
                const ipo = ipos.find(i => i.name === ipoName);
                if (ipo) {
                    await addIpoHistory(ipo.id, `${itemToDelete.type} Deleted: ${itemToDelete.name}`);
                }
            }

            if (supabase) {
                try {
                    const { error: archiveError } = await supabase.from('trash_bin').insert([{
                        entity_type: 'activity',
                        original_id: itemToDelete.id,
                        data: itemToDelete,
                        deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                        deleted_at: new Date().toISOString()
                    }]);
                    if (archiveError) throw archiveError;

                    const { error: deleteError } = await supabase.from('activities').delete().eq('id', itemToDelete.id);
                    if (deleteError) throw deleteError;

                    setActivities(prev => prev.filter(p => p.id !== itemToDelete.id));
                } catch (error: any) {
                    console.error("Error archiving/deleting activity:", error);
                    alert("Failed to delete activity: " + error.message);
                }
            } else {
                setActivities(prev => prev.filter(p => p.id !== itemToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
        if (!window.confirm('Are you sure you want to approve this activity?')) return;

        if (supabase) {
            const { error } = await supabase.from('activities').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setActivities(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setActivities(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('activities').update({
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setActivities(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setActivities(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    const columnFilterFields = [
        { key: 'name', label: 'Activity Name', values: uniqueValues.name },
        { key: 'component', label: 'Component', values: uniqueValues.component },
        { key: 'status', label: 'Status', values: uniqueValues.status },
        { key: 'date', label: 'Date', values: uniqueValues.date }
    ];

    const activityPageTitle = forcedType === 'Training' ? 'Trainings Management' : forcedType === 'Activity' ? 'Activities Management' : 'Activities Management';
    const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

    return (
        <div className="data-list-page activities-major-table-page">
            {isDeleteModalOpen && <ConfirmDialog title="Confirm deletion" description="Are you sure you want to delete this activity?" confirmLabel="Delete" onCancel={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} />}
            {isMultiDeleteModalOpen && <ConfirmDialog title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}?`} description="This action cannot be undone. The selected records will be permanently removed." confirmLabel="Delete" onCancel={() => setIsMultiDeleteModalOpen(false)} onConfirm={confirmMultiDelete} />}
            <ColumnFilterDialog open={isColumnFilterOpen} fields={columnFilterFields} filters={columnFilters} onApply={(filters) => { setColumnFilters(filters); setSavedColumnFilters(filters); }} onClose={() => setIsColumnFilterOpen(false)} />

            <div className="data-list-header">
                <h2 className="data-list-title">{activityPageTitle}</h2>
                {canEdit && <button onClick={onCreateActivity} className="btn btn-primary"><Plus aria-hidden="true" /> Add New Activity</button>}
            </div>
            <DcfScopeFilterPanel idPrefix="activities-dcf" filters={dcfFilters} />
            <div className="data-table-card major-table-card">
                <MajorTableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={(value) => { setSearchTerm(value); setSavedSearchTerm(value); }}
                    searchPlaceholder="Search activities..."
                    activeFilterCount={Object.keys(columnFilters).length}
                    onOpenFilters={() => setIsColumnFilterOpen(true)}
                    actions={isSelectionMode
                        ? <BulkSelectionBar intent={selectionIntent} count={selectedIds.length} onConfirm={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} onClear={() => setSelectedIds([])} onCancel={resetSelection} />
                        : <>
                        <button onClick={() => downloadActivitiesReport(processedActivities)} className="btn btn-secondary"><Download aria-hidden="true" /> Export</button>
                        {canEdit && <>
                            <button onClick={downloadActivitiesTemplate} className="btn btn-secondary"><FileSpreadsheet aria-hidden="true" /> Template</button>
                            <label htmlFor="activity-upload-major" className={`btn btn-secondary ${isUploading ? 'is-disabled' : 'cursor-pointer'}`}><Upload aria-hidden="true" /> {isUploading ? 'Uploading...' : 'Import'}</label>
                            <input id="activity-upload-major" type="file" className="hidden" onChange={(event) => handleActivitiesUpload(event, activities, setActivities, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx,.xls" disabled={isUploading} />
                            <button onClick={() => handleToggleMode('clone')} className="btn btn-secondary" aria-label="Clone multiple activities"><DuplicateIcon /> Clone</button>
                            <button onClick={() => handleToggleMode('delete')} className="btn btn-secondary" aria-label="Delete multiple activities"><TrashIcon /> Delete</button>
                        </>}
                    </>}
                />
                <div className="data-table-scroll">
                    <table className="data-table">
                        <thead><tr>
                            {isSelectionMode && <th className="data-table__cell--selection"><SelectionCheckbox aria-label="Select all activities on this page" onChange={(event) => handleSelectAll(event, paginatedActivities)} checked={paginatedActivities.length > 0 && paginatedActivities.every(item => selectedIds.includes(item.id))} indeterminate={paginatedActivities.some(item => selectedIds.includes(item.id)) && !paginatedActivities.every(item => selectedIds.includes(item.id))} /></th>}
                            <SortableTableHeader label="Code" columnKey="uid" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Activity Name" columnKey="name" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Operating Unit" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} />
                            <th>IPO</th>
                            <SortableTableHeader label="Fund Year" columnKey="fundingYear" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Budget" columnKey="budget" sortConfig={sortConfig} onSort={handleSort} />
                            <SortableTableHeader label="Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} />
                            <th>Workflow Status</th>
                        </tr></thead>
                        <tbody>
                            {paginatedActivities.map(activity => {
                                const totalBudget = calculateActivityBudget(activity);
                                const participatingIpos = activity.participatingIpos || [];
                                const ipoPreview = participatingIpos.length > 0
                                    ? `${participatingIpos[0]}${participatingIpos.length > 1 ? ` +${participatingIpos.length - 1}` : ''}`
                                    : '—';
                                return <tr
                                    key={activity.id}
                                    className={isSelectionMode ? (selectedIds.includes(activity.id) ? `data-table__row--selected${selectionIntent === 'delete' ? ' data-table__row--selected-danger' : ''}` : undefined) : 'data-table__row--interactive'}
                                    tabIndex={isSelectionMode ? undefined : 0}
                                    aria-label={isSelectionMode ? undefined : `View details for ${activity.name}`}
                                    onClick={isSelectionMode ? undefined : () => onSelectActivity(activity)}
                                    onKeyDown={isSelectionMode ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectActivity(activity); } }}
                                >
                                    {isSelectionMode && <td className="data-table__cell--selection"><SelectionCheckbox aria-label={`Select ${activity.name}`} checked={selectedIds.includes(activity.id)} onChange={() => handleSelectRow(activity.id)} /></td>}
                                    <td className="data-table__cell--mono"><TruncatedTableCell value={activity.uid || 'No code'} /></td>
                                    <td className="data-table__cell--primary"><TruncatedTableCell value={activity.name} /></td>
                                    <td><TruncatedTableCell value={activity.operatingUnit} /></td>
                                    <td><TruncatedTableCell value={ipoPreview} fullText={participatingIpos.join(', ') || 'No participating IPO'} /></td>
                                    <td>{activity.fundingYear || '—'}</td><td>{activity.fundType || '—'}</td><td>{activity.tier || '—'}</td>
                                    <td className="data-table__cell--numeric">{currency.format(totalBudget)}</td>
                                    <td><span className={getStatusBadge(activity.status)}>{activity.status || 'Unknown'}</span></td>
                                    <td><div className="data-table__actions">{getWorkflowStatusBadge(activity.workflow_status)}{activity.workflow_status === 'PENDING' && canApprove(currentUser?.role) && <><button onClick={(event) => handleApprove(activity.id, event)} className="action-mini action-mini--approve" aria-label={`Approve ${activity.name}`}><Check aria-hidden="true" /></button><button onClick={(event) => handleReject(activity.id, event)} className="action-mini action-mini--reject" aria-label={`Reject ${activity.name}`}><X aria-hidden="true" /></button></>}</div></td>
                                </tr>;
                            })}
                            {paginatedActivities.length === 0 && <tr><td className="data-table__empty-cell" colSpan={isSelectionMode ? 11 : 10}>No activities match the current filters.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <DataTablePagination currentPage={currentPage} totalPages={totalPages} totalItems={processedActivities.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
            </div>
        </div>
    );

};
