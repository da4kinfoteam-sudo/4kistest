
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
import { DcfScopeFilterPanel, DcfScopeFilterToggle, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';
import { ConfirmDialog, DataTablePagination, FilterableTableHeader } from './ui/enterprise';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

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
        isSelectionMode, selectedIds, isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode,
        handleSelectAll, handleSelectRow, resetSelection
    } = useSelection<Activity>();

    // Global Filters (Only Search retained in UI)
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState('activities_searchTerm', '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);

    // Column Filters (New) - Stores an array of selected values for each column key
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>('activities_columnFilters', {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);

    // Sorting
    type SortKeys = keyof Activity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });

    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const dcfFilters = useDcfScopeFilters({
        storageKey: forcedType === 'Training'
            ? 'trainings_dcf_scope'
            : forcedType === 'Activity'
                ? 'other_activities_dcf_scope'
                : 'activities_dcf_scope',
        moduleName: 'Activities',
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

            if (Object.keys(newFilters).length > 0) {
                setColumnFilters(prev => ({ ...prev, ...newFilters }));
            }

            // Clear the external filters so they don't re-apply on remount or navigation
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [externalFilters, onClearExternalFilters]);

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
                    aValue = a.expenses.reduce((sum, e) => sum + e.amount, 0);
                    bValue = b.expenses.reduce((sum, e) => sum + e.amount, 0);
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

    // Use Shared Pagination Hook
    const {
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedActivities
    } = usePagination(processedActivities, [searchTerm, forcedType, sortConfig, columnFilters]);

    // Sorting Handler
    const handleSort = (key: SortKeys, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
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

    const handleToggleRow = (activityId: number) => {
        setExpandedRowId(prevId => (prevId === activityId ? null : activityId));
    };

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

    return (
        <div className="data-list-page">
            {isDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm deletion"
                    description="Are you sure you want to delete this activity?"
                    confirmLabel="Delete"
                    onCancel={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                />
            )}

            {isMultiDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm bulk deletion"
                    description={<>Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected activities? This action cannot be undone.</>}
                    confirmLabel="Delete all selected"
                    onCancel={() => setIsMultiDeleteModalOpen(false)}
                    onConfirm={confirmMultiDelete}
                />
            )}

            <div className="data-list-header">
                <h2 className="data-list-title">Activities Management</h2>
                <div className="data-list-actions">
                    <DcfScopeFilterToggle idPrefix="activities-dcf" filters={dcfFilters} />
                    {canEdit && (
                        <button onClick={onCreateActivity} className="btn btn-primary btn-responsive" title="Add New Activity">
                            <Plus className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Add New Activity</span>
                        </button>
                    )}
                </div>
            </div>
            <DcfScopeFilterPanel idPrefix="activities-dcf" filters={dcfFilters} />
            <div className="data-table-card">
                 <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                        <div className="data-toolbar-group">
                            <input
                                type="text"
                                placeholder="Search Activity..."
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
                            <button onClick={() => downloadActivitiesReport(processedActivities)} className="btn btn-primary btn-responsive" title="Download Report">
                                <Download className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Download Report</span>
                            </button>
                            {canEdit && (
                                <>
                                    <button onClick={downloadActivitiesTemplate} className="btn btn-secondary btn-responsive" title="Download Template">
                                        <FileSpreadsheet className="btn-symbol" aria-hidden="true" />
                                        <span className="btn-text">Template</span>
                                    </button>
                                    <label htmlFor="activity-upload" className={`btn btn-primary btn-responsive ${isUploading ? 'is-disabled' : 'cursor-pointer'}`} title={isUploading ? 'Uploading...' : 'Upload'}>
                                        <Upload className="btn-symbol" aria-hidden="true" />
                                        <span className="btn-text">{isUploading ? 'Uploading...' : 'Upload'}</span>
                                    </label>
                                    <input id="activity-upload" type="file" className="hidden" onChange={(e) => handleActivitiesUpload(e, activities, setActivities, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
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
                                <FilterableTableHeader
                                    label="Name"
                                    columnKey="name"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={columnFilters['name'] || []}
                                    onFilterChange={(v) => handleColumnFilterChange('name', v)}
                                    uniqueValues={uniqueValues.name}
                                />
                                <FilterableTableHeader
                                    label="OU"
                                    columnKey="operatingUnit"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={getScopeColumnFilter('operatingUnit')}
                                    onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)}
                                    uniqueValues={uniqueValues.operatingUnit}
                                />
                                <FilterableTableHeader
                                    label="Component"
                                    columnKey="component"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={columnFilters['component'] || []}
                                    onFilterChange={(v) => handleColumnFilterChange('component', v)}
                                    uniqueValues={uniqueValues.component}
                                />
                                <FilterableTableHeader
                                    label="Fund Year"
                                    columnKey="fundingYear"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={getScopeColumnFilter('fundingYear')}
                                    onFilterChange={(v) => handleColumnFilterChange('fundingYear', v)}
                                    uniqueValues={uniqueValues.fundingYear}
                                />
                                <FilterableTableHeader
                                    label="Fund Type"
                                    columnKey="fundType"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={getScopeColumnFilter('fundType')}
                                    onFilterChange={(v) => handleColumnFilterChange('fundType', v)}
                                    uniqueValues={uniqueValues.fundType}
                                />
                                <FilterableTableHeader
                                    label="Tier"
                                    columnKey="tier"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={getScopeColumnFilter('tier')}
                                    onFilterChange={(v) => handleColumnFilterChange('tier', v)}
                                    uniqueValues={uniqueValues.tier}
                                />
                                <FilterableTableHeader
                                    label="Project Status"
                                    columnKey="status"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={columnFilters['status'] || []}
                                    onFilterChange={(v) => handleColumnFilterChange('status', v)}
                                    uniqueValues={uniqueValues.status}
                                />
                                <FilterableTableHeader
                                    label="Date"
                                    columnKey="date"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={columnFilters['date'] || []}
                                    onFilterChange={(v) => handleColumnFilterChange('date', v)}
                                    uniqueValues={uniqueValues.date}
                                />
                                <FilterableTableHeader
                                    label="Description"
                                    columnKey="description"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={columnFilters['description'] || []}
                                    onFilterChange={(v) => handleColumnFilterChange('description', v)}
                                    uniqueValues={uniqueValues.description}
                                />
                                <FilterableTableHeader
                                    label="Budget"
                                    columnKey="budget"
                                    sortConfig={sortConfig}
                                    onSort={handleSort}
                                    filters={[]}
                                    onFilterChange={() => {}}
                                    uniqueValues={[]}
                                    isNumeric={true}
                                />
                                <th scope="col">Workflow Status</th>
                                <th scope="col" className="data-table__head--actions data-table__sticky-right">
                                    {isSelectionMode ? (
                                        <div className="data-table__select-all">
                                            <span>Select all</span>
                                            <input
                                                type="checkbox"
                                                onChange={(e) => handleSelectAll(e, paginatedActivities)}
                                                checked={paginatedActivities.length > 0 && paginatedActivities.every(a => selectedIds.includes(a.id))}
                                                className="form-checkbox"
                                            />
                                        </div>
                                    ) : (
                                        "Actions"
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedActivities.map((activity) => {
                                const totalActivityBudget = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
                                const totalParticipants = activity.participantsMale + activity.participantsFemale;

                                return (
                                <React.Fragment key={activity.id}>
                                    <tr onClick={() => handleToggleRow(activity.id)} className="data-table__row--interactive">
                                        <td className="data-table__sticky-left data-table__cell--soft"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === activity.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="data-table__cell--primary data-table__cell--wrap">
                                            <button onClick={(e) => { e.stopPropagation(); onSelectActivity(activity); }} className="table-link">
                                                {activity.name}
                                            </button>
                                            {activity.uid && <span className="data-table__subline">{activity.uid}</span>}
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{activity.operatingUnit}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{activity.component}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{activity.fundingYear || 'N/A'}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{activity.fundType || 'N/A'}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{activity.tier || 'N/A'}</td>
                                        <td className="data-table__cell--nowrap"><span className={getStatusBadge(activity.status)}>{activity.status}</span></td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">
                                            {new Date(activity.date).toLocaleDateString()}
                                            {activity.endDate && activity.endDate !== activity.date ? ` - ${new Date(activity.endDate).toLocaleDateString()}` : ''}
                                        </td>
                                        <td className="data-table__cell--muted data-table__cell--truncate" title={activity.description}>{activity.description}</td>
                                        <td className="data-table__cell--muted data-table__cell--nowrap">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalActivityBudget)}</td>
                                        <td className="data-table__cell--nowrap">
                                            <div className="flex flex-col gap-1 items-start">
                                                {getWorkflowStatusBadge(activity.workflow_status)}
                                                {activity.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                                    <div className="flex gap-1 mt-1">
                                                        <button
                                                            onClick={(e) => handleApprove(activity.id, e)}
                                                            className="action-mini action-mini--approve"
                                                            title="Approve"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleReject(activity.id, e)}
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
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(activity.id)}
                                                            onChange={(e) => { e.stopPropagation(); handleSelectRow(activity.id); }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="form-checkbox"
                                                        />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); onSelectActivity(activity); }} className="table-action table-action--primary">Profile</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(activity); }} className="table-action table-action--danger">Delete</button>
                                                </div>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); onSelectActivity(activity); }} className="table-action table-action--primary">View Profile</button>
                                            )}
                                        </td>
                                    </tr>
                                     {expandedRowId === activity.id && (
                                        <tr className="data-table__detail-row">
                                            <td colSpan={12} className="data-table__detail-cell">
                                                <div className="data-table-detail-grid">
                                                    <div className="data-table-detail-stack">
                                                        <section className="data-table-detail-section">
                                                            <h4 className="data-table-detail-title">Details</h4>
                                                            <p className="data-table-detail-text"><strong>Type:</strong> <span className={`status-badge ${activity.type === 'Training' ? 'status-badge--completed' : 'status-badge--info'}`}>{activity.type}</span></p>
                                                            <p className="data-table-detail-text"><strong>Component:</strong> {activity.component}</p>
                                                            {activity.description && (
                                                                <div className="data-table-detail-section">
                                                                    <p className="data-table-detail-text"><strong>Description:</strong></p>
                                                                    <p className="data-table-detail-empty">{activity.description}</p>
                                                                </div>
                                                            )}
                                                            {activity.type === 'Training' && activity.facilitator && <p className="data-table-detail-text">Facilitator: {activity.facilitator}</p>}
                                                            <p className="data-table-detail-text">Encoded by: {activity.encodedBy}</p>
                                                        </section>
                                                        <section className="data-table-detail-section">
                                                            <h4 className="data-table-detail-title">Target Participants</h4>
                                                            <div className="data-table-detail-text">
                                                                <p>Male: {activity.participantsMale}</p>
                                                                <p>Female: {activity.participantsFemale}</p>
                                                                <p><strong>Total: {totalParticipants}</strong></p>
                                                            </div>
                                                        </section>
                                                        {activity.participatingIpos.length > 0 && (
                                                            <section className="data-table-detail-section">
                                                                <h4 className="data-table-detail-title">Participating IPOs</h4>
                                                                <div className="data-table-detail-pills">
                                                                    {activity.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button key={ipoName} onClick={(e) => { e.stopPropagation(); if (ipo) onSelectIpo(ipo); }} className="data-table-detail-pill" disabled={!ipo} title={ipo ? `View details for ${ipoName}` : `${ipoName} (details not found)`}>
                                                                                {ipoName}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </section>
                                                        )}
                                                    </div>
                                                    <section className="data-table-detail-panel">
                                                        <h4 className="data-table-detail-title">Budget & Funding</h4>
                                                         {activity.expenses.length > 0 ? (
                                                             <ul className="data-table-detail-list">
                                                                {activity.expenses.map(exp => (
                                                                    <li key={exp.id} className="data-table-detail-list__item"><span>{exp.expenseParticular} ({exp.uacsCode})</span><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(exp.amount)}</strong></li>
                                                                ))}
                                                                <li className="data-table-detail-list__total"><span>Total</span><span>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalActivityBudget)}</span></li>
                                                            </ul>
                                                        ) : (<p className="data-table-detail-empty">No budget items listed.</p>)}
                                                        <div className="data-table-detail-meta">
                                                             <p><strong>Funding Year:</strong> {activity.fundingYear ?? 'N/A'} </p>
                                                            <p><strong>Fund Type:</strong> {activity.fundType ?? 'N/A'}</p>
                                                            <p><strong>Tier:</strong> {activity.tier ?? 'N/A'}</p>
                                                        </div>
                                                    </section>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )})}
                        </tbody>
                    </table>
                </div>
                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={processedActivities.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                />
            </div>
        </div>
    );
};
