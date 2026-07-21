// Author: 4K
import React, { useState, useMemo } from 'react';
import { 
    Subproject, Activity, OfficeRequirement, StaffingRequirement
} from '../../constants';
import { supabase } from '../../supabaseClient';
import { useLogAction } from '../../hooks/useLogAction';
import { ConfirmDialog } from '../ui/enterprise';

interface PhysicalStatusManagementProps {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
}

const STATUS_OPTIONS_STANDARD = ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
const STATUS_OPTIONS_STAFFING = ['Proposed', 'Filled', 'Unfilled'];

// Type for tracking pending changes including original value for rollback
type PendingChange = {
    table: string;
    id: number;
    field: string;
    value: string;
    originalValue: string;
};

type ColumnFilters = {
    search: string;
    status: string;
    ou: string;
    year: string;
    tier: string;
    fundType: string;
};

type ConfirmModalState = {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    type: 'info' | 'warning' | 'danger' | 'success';
    onConfirm?: () => void | Promise<void>;
};

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
    search: '',
    status: 'All',
    ou: 'All',
    year: new Date().getFullYear().toString(),
    tier: 'Tier 1',
    fundType: 'Current',
};

const PhysicalStatusManagement: React.FC<PhysicalStatusManagementProps> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    onSelectSubproject,
    onSelectActivity
}) => {
    const { logAction } = useLogAction();

    // UI State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Subprojects', 'Activities & Trainings', 'Staffing Requirements', 'Office Requirements']));
    const [isSaving, setIsSaving] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilters>>({});
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
        isOpen: false,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        type: 'info',
    });

    // Pending Changes State
    const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});

    // Derived Years
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        const add = (y?: number) => y && years.add(y.toString());
        (subprojects || []).forEach(x => add(x.fundingYear));
        (activities || []).forEach(x => add(x.fundingYear));
        (officeReqs || []).forEach(x => add(x.fundYear));
        (staffingReqs || []).forEach(x => add(x.fundYear));
        return Array.from(years).sort().reverse();
    }, [subprojects, activities, officeReqs, staffingReqs]);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    const openConfirmModal = (config: Omit<ConfirmModalState, 'isOpen'>) => {
        setConfirmModal({ ...config, isOpen: true });
    };

    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    const updateColumnFilter = (table: string, key: keyof ColumnFilters, value: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [table]: {
                ...(prev[table] || DEFAULT_COLUMN_FILTERS),
                [key]: value,
            },
        }));
    };

    const resetColumnFilters = (table: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [table]: DEFAULT_COLUMN_FILTERS,
        }));
    };

    // Handler: Update Local State & Track Pending Change
    const handleStatusChange = (
        table: string, 
        id: number, 
        newValue: string, 
        field: string,
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        items: any[]
    ) => {
        const currentItem = items.find(i => i.id === id);
        if (!currentItem) return;

        const key = `${table}-${id}`;

        // Store original value if not already stored
        setPendingChanges(prev => {
            const existing = prev[key];
            const originalValue = existing ? existing.originalValue : currentItem[field];
            return {
                ...prev,
                [key]: { table, id, field, value: newValue, originalValue }
            };
        });

        // Optimistic Update
        setter(prev => prev.map(item => item.id === id ? { ...item, [field]: newValue } : item));
    };

    // Handler: Bulk Update (Local)
    const handleBulkLocalUpdate = (
        table: string,
        items: any[],
        newValue: string,
        field: string,
        setter: React.Dispatch<React.SetStateAction<any[]>>
    ) => {
        if (!items.length) return;
        openConfirmModal({
            title: 'Apply Status Update',
            message: `Update ${items.length} currently visible item(s) to "${newValue}"? Column filters are respected, so hidden rows will not be changed.`,
            confirmLabel: 'Apply Update',
            type: 'warning',
            onConfirm: () => {
                const idsToUpdate = items.map(i => i.id);

                setPendingChanges(prev => {
                    const updates = { ...prev };
                    items.forEach(item => {
                        const key = `${table}-${item.id}`;
                        const existing = updates[key];
                        const originalValue = existing ? existing.originalValue : item[field];
                        updates[key] = { table, id: item.id, field, value: newValue, originalValue };
                    });
                    return updates;
                });

                setter(prev => prev.map(item => idsToUpdate.includes(item.id) ? { ...item, [field]: newValue } : item));
                setNotice({ type: 'info', message: `${items.length} visible item(s) staged for update. Click Save Changes to write them to the database.` });
                closeConfirmModal();
            },
        });
    };

    const persistChanges = async (changes: PendingChange[]) => {
        setIsSaving(true);
        try {
            if (supabase) {
                const results = await Promise.all(changes.map(change =>
                    supabase
                        .from(change.table)
                        .update({ [change.field]: change.value })
                        .eq('id', change.id)
                ));

                const failed = results.find(result => result.error);
                if (failed?.error) {
                    throw failed.error;
                }
                
                logAction('DCF Management', `Batch updated ${changes.length} physical status record(s).`);
            } else {
                throw new Error('Supabase client is not available.');
            }

            setPendingChanges({});
            setNotice({ type: 'success', message: `${changes.length} change(s) saved successfully.` });
        } catch (error: any) {
            console.error("Save Error:", error);
            setNotice({ type: 'error', message: `Failed to save changes: ${error.message || 'Unknown error'}` });
        } finally {
            setIsSaving(false);
            closeConfirmModal();
        }
    };

    const revertPendingChanges = () => {
        const setters: Record<string, React.Dispatch<React.SetStateAction<any[]>>> = {
            'subprojects': setSubprojects as any,
            'activities': setActivities as any,
            'staffing_requirements': setStaffingReqs as any,
            'office_requirements': setOfficeReqs as any
        };

        const changes = Object.values(pendingChanges) as PendingChange[];
        
        const changesByTable: Record<string, PendingChange[]> = {};
        changes.forEach(c => {
            if (!changesByTable[c.table]) changesByTable[c.table] = [];
            changesByTable[c.table].push(c);
        });

        Object.entries(changesByTable).forEach(([table, list]) => {
            const setter = setters[table];
            if (setter) {
                setter(prev => prev.map(item => {
                    const change = list.find(c => c.id === item.id);
                    if (change) {
                        return { ...item, [change.field]: change.originalValue };
                    }
                    return item;
                }));
            }
        });

        setPendingChanges({});
        setNotice({ type: 'info', message: 'Unsaved changes were discarded.' });
        closeConfirmModal();
    };

    // Handler: Save to Supabase
    const saveChanges = async () => {
        const changes = Object.values(pendingChanges) as PendingChange[];
        if (changes.length === 0) return;

        openConfirmModal({
            title: 'Save Physical Status Changes',
            message: `Save ${changes.length} staged change(s) to the database? This will only save rows you edited or bulk-updated.`,
            confirmLabel: 'Save Changes',
            type: 'success',
            onConfirm: () => persistChanges(changes),
        });
    };

    const cancelChanges = () => {
        if (!Object.keys(pendingChanges).length) return;

        openConfirmModal({
            title: 'Discard Unsaved Changes',
            message: 'Discard all unsaved physical status changes and restore the previous values?',
            confirmLabel: 'Discard Changes',
            type: 'danger',
            onConfirm: revertPendingChanges,
        });
    };

    const hasChanges = Object.keys(pendingChanges).length > 0;

    const RenderGroup = ({ 
        title, 
        items, 
        table, 
        setter,
        displayField,
        statusField = 'status',
        options = STATUS_OPTIONS_STANDARD
    }: { 
        title: string, 
        items: any[], 
        table: string, 
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        displayField: string,
        statusField?: string,
        options?: string[]
    }) => {
        const isExpanded = expandedGroups.has(title);
        const filters = columnFilters[table] || DEFAULT_COLUMN_FILTERS;
        const getYear = (item: any) => (item.fundingYear || item.fundYear || '').toString();
        const getText = (item: any, field: string) => (item[field] || '').toString();
        const visibleItems = items.filter(item => {
            const searchValue = filters.search.trim().toLowerCase();
            if (searchValue) {
                const haystack = [
                    getText(item, displayField),
                    getText(item, 'operatingUnit'),
                    getText(item, statusField),
                    getText(item, 'fundType'),
                    getText(item, 'tier'),
                    getYear(item),
                ].join(' ').toLowerCase();
                if (!haystack.includes(searchValue)) return false;
            }
            if (filters.status !== 'All' && item[statusField] !== filters.status) return false;
            if (filters.ou !== 'All' && item.operatingUnit !== filters.ou) return false;
            if (filters.year !== 'All' && getYear(item) !== filters.year) return false;
            if (filters.tier !== 'All' && item.tier !== filters.tier) return false;
            if (filters.fundType !== 'All' && item.fundType !== filters.fundType) return false;
            return true;
        });

        const uniqueOptions = (field: 'operatingUnit' | 'tier' | 'fundType' | 'year') => {
            const values = items.map(item => field === 'year' ? getYear(item) : getText(item, field)).filter(Boolean);
            return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        };
        
        const handleBulkDropdown = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = e.target.value;
            e.target.value = ""; 
            if (!val) return;
            handleBulkLocalUpdate(table, visibleItems, val, statusField, setter);
        };

        return (
            <section className="physical-status-group">
                <div 
                    className={`physical-status-group__header ${isExpanded ? 'is-expanded' : ''}`}
                >
                    <button 
                        onClick={() => toggleGroup(title)}
                        className="physical-status-group__toggle"
                    >
                        <span>{title}</span>
                        <span className="status-badge status-badge--compact status-badge--neutral">{visibleItems.length} / {items.length}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`settings-accordion__chevron ${isExpanded ? 'is-open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="physical-status-group__actions">
                            <button
                                type="button"
                                onClick={() => resetColumnFilters(table)}
                                className="btn-secondary btn-compact"
                            >
                                Reset Column Filters
                            </button>
                            <label className="physical-status-group__bulk">
                                <span>Set Items to</span>
                                <select
                                    onChange={handleBulkDropdown}
                                    disabled={visibleItems.length === 0}
                                    className="form-control form-control--compact"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Select Status</option>
                                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </label>
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="data-table-scroll physical-status-group__table-scroll">
                        <table className="data-table physical-status-table">
                            <thead>
                                <tr>
                                    <th>Item Description</th><th>OU</th><th>Fund Year</th><th>Fund Type</th><th>Tier</th><th>Current Status</th>
                                </tr>
                                <tr className="data-table__filter-row">
                                    <th>
                                        <input
                                            type="search"
                                            value={filters.search}
                                            onChange={event => updateColumnFilter(table, 'search', event.target.value)}
                                            placeholder="Search items..."
                                            className="form-control form-control--compact"
                                        />
                                    </th>
                                    <th><select value={filters.ou} onChange={event => updateColumnFilter(table, 'ou', event.target.value)} className="form-control form-control--compact">
                                            <option value="All">All OUs</option>
                                            {uniqueOptions('operatingUnit').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th><select value={filters.year} onChange={event => updateColumnFilter(table, 'year', event.target.value)} className="form-control form-control--compact">
                                            <option value="All">All Years</option>
                                            {uniqueOptions('year').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th><select value={filters.fundType} onChange={event => updateColumnFilter(table, 'fundType', event.target.value)} className="form-control form-control--compact">
                                            <option value="All">All Fund Types</option>
                                            {uniqueOptions('fundType').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th><select value={filters.tier} onChange={event => updateColumnFilter(table, 'tier', event.target.value)} className="form-control form-control--compact">
                                            <option value="All">All Tiers</option>
                                            {uniqueOptions('tier').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th><select value={filters.status} onChange={event => updateColumnFilter(table, 'status', event.target.value)} className="form-control form-control--compact">
                                            <option value="All">All Statuses</option>
                                            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleItems.length === 0 ? (
                                    <tr><td colSpan={6} className="data-table__empty-cell">No records found matching filters.</td></tr>
                                ) : (
                                    visibleItems.map(item => {
                                        const isModified = !!pendingChanges[`${table}-${item.id}`];
                                        const canClick = (table === 'subprojects' || table === 'activities');
                                        return (
                                            <tr key={item.id} className={isModified ? 'data-table__row--selected' : undefined}>
                                                <td className="data-table__cell--primary">
                                                    {canClick ? (
                                                        <button 
                                                            onClick={() => {
                                                                if (table === 'subprojects') onSelectSubproject(item);
                                                                if (table === 'activities') onSelectActivity(item);
                                                            }}
                                                            className="data-table-link"
                                                        >
                                                            {item[displayField]}
                                                        </button>
                                                    ) : (
                                                        <span>{item[displayField]}</span>
                                                    )}
                                                    {isModified && <span className="status-badge status-badge--compact status-badge--pending">Modified</span>}
                                                </td>
                                                <td className="data-table__cell--primary data-table__cell--nowrap">
                                                    {item.operatingUnit}
                                                </td>
                                                <td className="data-table__cell--muted">
                                                    {getYear(item)}
                                                </td>
                                                <td className="data-table__cell--muted">
                                                    {item.fundType || '-'}
                                                </td>
                                                <td className="data-table__cell--muted">
                                                    {item.tier || '-'}
                                                </td>
                                                <td className="data-table__cell--actions data-table__cell--nowrap">
                                                    <select 
                                                        value={item[statusField]} 
                                                        onChange={(e) => handleStatusChange(table, item.id, e.target.value, statusField, setter, items)}
                                                        className={`status-select status-select--${item[statusField] === 'Completed' || item[statusField] === 'Filled' ? 'success' : item[statusField] === 'Ongoing' ? 'info' : item[statusField] === 'Cancelled' || item[statusField] === 'Unfilled' ? 'danger' : 'warning'}`}
                                                    >
                                                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        );
    }

    return (
        <div className="physical-status-management form-stack form-stack--spacious animate-fadeIn">
            {notice && (
                <div className={`notice notice--${notice.type === 'error' ? 'danger' : notice.type === 'success' ? 'info' : 'info'}`}>
                    {notice.message}
                </div>
            )}
            {/* Management Groups */}
            <div className="form-stack">
                <RenderGroup 
                    title="Subprojects" 
                    items={subprojects}
                    table="subprojects" 
                    setter={setSubprojects as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Activities & Trainings" 
                    items={activities}
                    table="activities" 
                    setter={setActivities as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Staffing Requirements" 
                    items={staffingReqs}
                    table="staffing_requirements" 
                    setter={setStaffingReqs as any} 
                    displayField="personnelPosition"
                    statusField="hiringStatus"
                    options={STATUS_OPTIONS_STAFFING}
                />
                <RenderGroup 
                    title="Office Requirements" 
                    items={officeReqs}
                    table="office_requirements" 
                    setter={setOfficeReqs as any} 
                    displayField="equipment" 
                />
            </div>

            {/* Action Bar */}
            <div className={`physical-status-savebar ${hasChanges ? 'is-visible' : ''}`}>
                <div className="status-indicator status-indicator--warning">
                    <span className="status-indicator__dot"></span>
                    <span>{Object.keys(pendingChanges).length} unsaved change(s)</span>
                </div>
                <div className="physical-status-savebar__actions">
                    <button 
                        onClick={cancelChanges} 
                        disabled={isSaving}
                        className="btn-secondary"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={saveChanges} 
                        disabled={isSaving}
                        className="btn-primary"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {confirmModal.isOpen && <ConfirmDialog title={confirmModal.title} description={confirmModal.message} confirmLabel={isSaving ? 'Saving...' : confirmModal.confirmLabel} tone={confirmModal.type === 'danger' ? 'danger' : 'primary'} onConfirm={() => confirmModal.onConfirm?.()} onCancel={closeConfirmModal} />}
        </div>
    );
};

export default PhysicalStatusManagement;
