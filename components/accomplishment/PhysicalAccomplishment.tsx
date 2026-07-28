// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, operatingUnits, tiers, fundTypes, filterYears } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { useUserAccess } from '../mainfunctions/TableHooks';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { getDcfModuleKeyForSourceType, normalizePolicyMonth, useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../../lib/physicalAccomplishmentTimestamp';
import { getBudgetLineTag, isBudgetLineExcludedFromTargets } from '../../lib/budgetLineAdjustments';
import { resolveSubprojectCompletionRollup } from '../../lib/subprojectCompletion';
import { isMonthTargetOverdue } from '../../lib/dateStatus';
import type { DataScope } from '../../lib/scopedDataFetch';
import { ConfirmDialog, LoadingState } from '../ui/enterprise';
import { getActivityDisplayTitle } from '../../lib/entityIdentity';

interface Props {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectOfficeReq: (item: OfficeRequirement) => void;
    onSelectStaffingReq: (item: StaffingRequirement) => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

interface PhysicalItem {
    uniqueId: string;
    sourceType: 'Subproject' | 'Activity' | 'Office' | 'Staffing';
    sourceId: number;
    parentId?: string; // For grouping
    detailId?: number; // For subproject details

    // Display
    name: string; // Title, Particular, or Position
    subName?: string; // Additional info
    location?: string;
    
    // Target
    targetDateStart: string;
    targetDateEnd?: string;
    targetQty: number; // Units or Total Pax
    targetMale?: number;
    targetFemale?: number;
    unitOfMeasure: string;

    // Actual (Editable)
    actualDateStart: string;
    actualDateEnd?: string;
    actualQty: number;
    actualMale?: number;
    actualFemale?: number;
    isCompleted?: boolean;

    // Meta
    isParent: boolean;
    isLocked: boolean; 
    status: string;
    recordTag?: PhysicalTag;
    lineTag?: string | null;
    targetExcluded?: boolean;
    catchUpPlanRemarks?: string;
    dueStatus?: 'Completed' | 'Overdue' | 'On Track' | 'Not Started';
    isOverdue?: boolean;
    children?: PhysicalItem[];
}

type PhysicalTag = 'Cancelled' | 'Realignment' | 'Savings' | null;
type PhysicalSortMode = 'default' | 'target-date-asc' | 'target-date-desc' | 'due-status';

const commonInputClasses = "form-control form-control--compact";
const physicalNumberFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 });

const formatPhysicalNumber = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return '';
    return physicalNumberFormatter.format(value);
};

const parsePhysicalNumberInput = (value: string) => {
    const normalized = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getDateOnly = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
};

const getPhysicalDueStatus = (targetDate: string | undefined, completed: boolean) => {
    if (completed) return { dueStatus: 'Completed' as const, isOverdue: false };
    const dueDate = getDateOnly(targetDate);
    if (!dueDate) return { dueStatus: 'Not Started' as const, isOverdue: false };
    const isOverdue = isMonthTargetOverdue(targetDate);
    return { dueStatus: isOverdue ? 'Overdue' as const : 'On Track' as const, isOverdue };
};

const getPhysicalRecordTag = (record?: { status?: string; isRealignment?: boolean; isSavings?: boolean } | null): PhysicalTag => {
    if (!record) return null;
    if (record.status === 'Cancelled') return 'Cancelled';
    if (record.isRealignment) return 'Realignment';
    if (record.isSavings) return 'Savings';
    return null;
};

const isPhysicalRecordExcludedFromTargets = (record?: { status?: string; isRealignment?: boolean; isSavings?: boolean } | null) =>
    !!getPhysicalRecordTag(record);

const getSortableTargetDate = (item: PhysicalItem) => {
    const date = getDateOnly(item.targetDateStart);
    return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
};

const dueStatusSortOrder: Record<NonNullable<PhysicalItem['dueStatus']>, number> = {
    'Overdue': 0,
    'On Track': 1,
    'Not Started': 2,
    'Completed': 3,
};

const sortPhysicalItems = (items: PhysicalItem[], sortMode: PhysicalSortMode) => {
    const sorted = [...items];
    if (sortMode === 'default') return sorted;

    sorted.sort((a, b) => {
        if (sortMode === 'target-date-asc') {
            return getSortableTargetDate(a) - getSortableTargetDate(b) || a.name.localeCompare(b.name);
        }
        if (sortMode === 'target-date-desc') {
            return getSortableTargetDate(b) - getSortableTargetDate(a) || a.name.localeCompare(b.name);
        }
        const aStatus = dueStatusSortOrder[a.dueStatus || 'Not Started'];
        const bStatus = dueStatusSortOrder[b.dueStatus || 'Not Started'];
        return aStatus - bStatus || getSortableTargetDate(a) - getSortableTargetDate(b) || a.name.localeCompare(b.name);
    });

    return sorted;
};

const PhysicalAccomplishment: React.FC<Props> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    onSelectSubproject, onSelectActivity,
    onSelectOfficeReq, onSelectStaffingReq,
    onDataScopeChange
}) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = useUserAccess('Accomplishment - Physical');
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const defaultYear = new Date().getFullYear();

    // Filters (Persistent)
    const [selectedYear, setSelectedYear] = useLocalStorageState<number | null>('phys_selectedYear', defaultYear);
    const [selectedOu, setSelectedOu] = useLocalStorageState<string>('phys_selectedOu', 'All');
    const [selectedTier, setSelectedTier] = useLocalStorageState<string>('phys_selectedTier', 'Tier 1');
    const [selectedFundType, setSelectedFundType] = useLocalStorageState<string>('phys_selectedFundType', 'Current');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [focusedNumberInputs, setFocusedNumberInputs] = useState<Set<string>>(new Set());
    const [sortMode, setSortMode] = useLocalStorageState<PhysicalSortMode>('phys_sortMode', 'default');

    // Local Data State
    const [items, setItems] = useState<PhysicalItem[]>([]);
    const [originalItems, setOriginalItems] = useState<PhysicalItem[]>([]);
    const [changedItems, setChangedItems] = useState<Map<string, Partial<PhysicalItem>>>(new Map());
    
    // Save State
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
    const [monthLockMessage, setMonthLockMessage] = useState('');
    
    // Expansion State
    const [expandedGroups, setExpandedGroups] = useLocalStorageState<string[]>('phys_expandedGroups', ['Subprojects', 'Activities', 'Program Management']);
    const [expandedSubgroups, setExpandedSubgroups] = useLocalStorageState<string[]>('phys_expandedSubgroups', ['Staffing Requirements', 'Office Requirements']);
    const [expandedParents, setExpandedParents] = useLocalStorageState<string[]>('phys_expandedParents', []);

    const getPolicySubjectForPhysicalItem = (item: PhysicalItem) => (
        item.sourceType === 'Staffing'
            ? { hiringStatus: item.status || 'Proposed' }
            : { status: item.status || 'Proposed' }
    );

    const getPhysicalStatusDecision = (item: PhysicalItem) => {
        const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
        if (!moduleKey) {
            return { allowed: false, code: 'blocked_by_status' as const, message: 'Unknown DCF source type.' };
        }
        return getStatusDecision({
            moduleKey,
            item: getPolicySubjectForPhysicalItem(item),
            action: 'editPhysicalAccomplishment',
            hasModuleAccess: canEdit,
        });
    };

    const ensurePhysicalItemAllowed = async (item: PhysicalItem) => {
        const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
        if (!moduleKey) {
            alert('Unknown DCF source type.');
            return false;
        }
        return ensureDecisionAllowed(getPhysicalStatusDecision(item), {
            moduleKey,
            item: getPolicySubjectForPhysicalItem(item),
            itemId: item.sourceId,
            itemName: item.name,
            status: item.status as any,
            action: 'editPhysicalAccomplishment',
            entityType: item.sourceType.toLowerCase(),
        });
    };

    const validatePhysicalActualMonth = async (item: PhysicalItem, month: string) => {
        if (!month) return true;
        const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
        if (!moduleKey) {
            alert('Unknown DCF source type.');
            return false;
        }
        if (!(await ensurePhysicalItemAllowed(item))) return false;
        const monthDecision = getMonthDecision(month);
        if (isMonthSelectionAllowed(monthDecision)) {
            setMonthLockMessage('');
            return true;
        }
        setMonthLockMessage(getMonthLockMessage(monthDecision));
        return false;
    };

    const validatePhysicalItemForSave = async (item: PhysicalItem) => {
        if (!(await ensurePhysicalItemAllowed(item))) return false;
        const originalItem = originalItems.find(original => original.uniqueId === item.uniqueId);
        const dates = [
            normalizePolicyMonth(item.actualDateStart) !== normalizePolicyMonth(originalItem?.actualDateStart) ? item.actualDateStart : '',
            normalizePolicyMonth(item.actualDateEnd) !== normalizePolicyMonth(originalItem?.actualDateEnd) ? item.actualDateEnd : '',
        ].filter(Boolean);
        for (const date of dates) {
            if (!(await validatePhysicalActualMonth(item, date))) return false;
        }
        if (item.children) {
            for (const child of item.children) {
                if (changedItems.has(child.uniqueId) && !(await validatePhysicalItemForSave(child))) return false;
            }
        }
        return true;
    };

    // Init defaults and OU lock
    useEffect(() => {
        if (!selectedYear) {
            setSelectedYear(defaultYear);
        }
        if (!canViewAll && currentUser?.operatingUnit) {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser, canViewAll, defaultYear, selectedYear, setSelectedOu, setSelectedYear]);

    useEffect(() => {
        onDataScopeChange?.({
            year: selectedYear || defaultYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
            canViewAllOus: canViewAll,
            requestedBy: currentUser?.id ?? null
        });
    }, [canViewAll, currentUser?.id, defaultYear, onDataScopeChange, selectedFundType, selectedOu, selectedTier, selectedYear]);

    const availableYears = useMemo(() => {
        const years = new Set<string>(filterYears);
        [
            ...subprojects.map(item => item.fundingYear),
            ...activities.map(item => item.fundingYear),
            ...staffingReqs.map(item => item.fundYear),
            ...officeReqs.map(item => item.fundYear),
            defaultYear
        ].forEach(year => {
            if (year) years.add(year.toString());
        });
        return Array.from(years).sort((a, b) => Number(b) - Number(a));
    }, [activities, defaultYear, officeReqs, staffingReqs, subprojects]);

    const matchesSelectedFilters = (item: any) => {
        const y = item.fundingYear || item.fundYear;
        if (y !== (selectedYear || defaultYear)) return false;
        if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
        return true;
    };

    const physicalSummaryCards = useMemo(() => {
        const getPercent = (accomplished: number, target: number) => target > 0 ? Math.round((accomplished / target) * 100) : 0;
        const buildCard = (label: string, target: number, accomplished: number) => {
            const percent = getPercent(accomplished, target);
            return {
                label,
                target,
                accomplished,
                percent,
                status: target === 0 ? 'No target records' : percent >= 100 ? 'Completed' : percent >= 60 ? 'In progress' : 'Needs update',
                tone: target === 0 ? 'neutral' : percent >= 100 ? 'success' : percent >= 60 ? 'warning' : 'danger'
            };
        };

        const scopedSubprojects = (subprojects || []).filter(item => matchesSelectedFilters(item) && !isPhysicalRecordExcludedFromTargets(item));
        const scopedActivities = (activities || []).filter(item => matchesSelectedFilters(item) && !isPhysicalRecordExcludedFromTargets(item));
        const scopedStaffing = (staffingReqs || []).filter(item => matchesSelectedFilters(item) && !isPhysicalRecordExcludedFromTargets(item));
        const scopedOffice = (officeReqs || []).filter(item => matchesSelectedFilters(item) && !isPhysicalRecordExcludedFromTargets(item));

        return [
            buildCard('Subprojects', scopedSubprojects.length, scopedSubprojects.filter(item => !!item.actualCompletionDate || item.status === 'Completed').length),
            buildCard('Activities', scopedActivities.length, scopedActivities.filter(item => !!item.actualDate || item.status === 'Completed').length),
            buildCard('Staffing Requirement', scopedStaffing.length, scopedStaffing.filter(item => !!item.actualObligationDate || item.hiringStatus === 'Filled').length),
            buildCard('Office Requirement', scopedOffice.length, scopedOffice.filter(item => !!item.actualObligationDate || item.status === 'Completed').length)
        ];
    }, [activities, defaultYear, officeReqs, selectedFundType, selectedOu, selectedTier, selectedYear, staffingReqs, subprojects]);

    // --- 1. Load Data ---
    useEffect(() => {
        if (!selectedYear) return;
        setIsLoading(true);

        const timer = setTimeout(() => {
            const loadedItems: PhysicalItem[] = [];

            // A. Subprojects (Parent + Children)
            (subprojects || []).filter(matchesSelectedFilters).forEach(sp => {
                const parentId = `sp-${sp.id}`;
                const parentRecordTag = getPhysicalRecordTag(sp);
                const parentTargetExcluded = isPhysicalRecordExcludedFromTargets(sp);
                const parentDue = getPhysicalDueStatus(sp.estimatedCompletionDate, !!sp.actualCompletionDate || sp.status === 'Completed');
                const children: PhysicalItem[] = (sp.details || []).map(d => {
                    const isCompleted = d.isCompleted === true || (!!d.actualDeliveryDate && d.isCompleted === undefined);
                    return {
                        uniqueId: `${parentId}-d-${d.id}`,
                        sourceType: 'Subproject' as const,
                        sourceId: sp.id,
                        parentId: parentId,
                        detailId: d.id,
                        name: d.particulars,
                        targetDateStart: d.deliveryDate,
                        targetQty: d.numberOfUnits,
                        unitOfMeasure: d.unitOfMeasure,
                        actualDateStart: d.actualDeliveryDate || '',
                        actualQty: d.actualNumberOfUnits || 0,
                        isCompleted,
                        isParent: false,
                        isLocked: false, // Individual items editable
                        status: sp.status,
                        recordTag: parentRecordTag,
                        lineTag: getBudgetLineTag(d),
                        targetExcluded: parentTargetExcluded || isBudgetLineExcludedFromTargets(d),
                        ...getPhysicalDueStatus(d.deliveryDate, isCompleted)
                    };
                });

                loadedItems.push({
                    uniqueId: parentId,
                    sourceType: 'Subproject',
                    sourceId: sp.id,
                    name: sp.name,
                    location: sp.location,
                    targetDateStart: sp.estimatedCompletionDate,
                    targetQty: 0,
                    unitOfMeasure: 'Project',
                    actualDateStart: sp.actualCompletionDate || '',
                    actualQty: 0,
                    isParent: true,
                    isLocked: false,
                    status: sp.status,
                    recordTag: parentRecordTag,
                    targetExcluded: parentTargetExcluded,
                    catchUpPlanRemarks: sp.catchUpPlanRemarks || '',
                    dueStatus: parentDue.dueStatus,
                    isOverdue: parentDue.isOverdue,
                    children: children
                });
            });

            // B. Activities (Flat)
            (activities || []).filter(matchesSelectedFilters).forEach(act => {
                const recordTag = getPhysicalRecordTag(act);
                const targetExcluded = isPhysicalRecordExcludedFromTargets(act);
                const activityDue = getPhysicalDueStatus(act.endDate || act.date, !!act.actualDate || act.status === 'Completed');
                loadedItems.push({
                    uniqueId: `act-${act.id}`,
                    sourceType: 'Activity',
                    sourceId: act.id,
                    name: getActivityDisplayTitle(act),
                    subName: act.type,
                    targetDateStart: act.date,
                    targetDateEnd: act.endDate !== act.date ? act.endDate : undefined,
                    targetQty: (act.participantsMale || 0) + (act.participantsFemale || 0),
                    targetMale: act.participantsMale,
                    targetFemale: act.participantsFemale,
                    unitOfMeasure: 'Pax',
                    actualDateStart: act.actualDate || '',
                    actualQty: (act.actualParticipantsMale || 0) + (act.actualParticipantsFemale || 0),
                    actualMale: act.actualParticipantsMale || 0,
                    actualFemale: act.actualParticipantsFemale || 0,
                    isParent: false,
                    isLocked: false,
                    status: act.status,
                    recordTag,
                    targetExcluded,
                    catchUpPlanRemarks: act.catchUpPlanRemarks || '',
                    dueStatus: activityDue.dueStatus,
                    isOverdue: activityDue.isOverdue
                });
            });

            // C. Staffing (Grouped by Position)
            const staffingGroups: { [key: string]: StaffingRequirement[] } = {};
            (staffingReqs || []).filter(matchesSelectedFilters).forEach(s => {
                if (!staffingGroups[s.personnelPosition]) staffingGroups[s.personnelPosition] = [];
                staffingGroups[s.personnelPosition].push(s);
            });

            Object.entries(staffingGroups).forEach(([position, groupItems], idx) => {
                const parentId = `staff-group-${idx}`;
                const children: PhysicalItem[] = groupItems.map(s => ({
                    uniqueId: `staff-${s.id}`,
                    sourceType: 'Staffing',
                    sourceId: s.id,
                    parentId: parentId,
                    name: `${s.personnelPosition} (${s.operatingUnit})`,
                    targetDateStart: s.obligationDate,
                    targetQty: 1,
                    unitOfMeasure: 'Personnel',
                    actualDateStart: s.actualObligationDate || '', // Date Hired
                    actualQty: s.actualObligationDate ? 1 : 0,
                    isParent: false,
                    isLocked: false,
                    status: s.status,
                    recordTag: getPhysicalRecordTag(s),
                    targetExcluded: isPhysicalRecordExcludedFromTargets(s),
                    dueStatus: s.actualObligationDate || s.hiringStatus === 'Filled' ? 'Completed' : 'On Track'
                }));

                loadedItems.push({
                    uniqueId: parentId,
                    sourceType: 'Staffing',
                    sourceId: 0, // Virtual ID
                    name: position,
                    targetDateStart: '',
                    targetQty: children.filter(child => !child.targetExcluded).length,
                    unitOfMeasure: 'Personnel',
                    actualDateStart: '',
                    actualQty: children.filter(c => c.actualDateStart).length,
                    isParent: true,
                    isLocked: true, 
                    status: groupItems[0]?.status || 'Proposed', // Assuming same status for group
                    dueStatus: children.every(child => child.actualDateStart) ? 'Completed' : 'On Track',
                    children: children
                });
            });

            // D. Office Requirements (Flat)
            (officeReqs || []).filter(matchesSelectedFilters).forEach(off => {
                const recordTag = getPhysicalRecordTag(off);
                const targetExcluded = isPhysicalRecordExcludedFromTargets(off);
                loadedItems.push({
                    uniqueId: `office-${off.id}`,
                    sourceType: 'Office',
                    sourceId: off.id,
                    name: off.equipment,
                    targetDateStart: off.obligationDate,
                    targetQty: off.numberOfUnits,
                    unitOfMeasure: 'Units',
                    actualDateStart: off.actualObligationDate || '', // Use obligation date as delivery proxy
                    actualQty: off.actualObligationDate ? off.numberOfUnits : 0, 
                    isParent: false,
                    isLocked: false,
                    status: off.status,
                    recordTag,
                    targetExcluded,
                    dueStatus: off.actualObligationDate || off.status === 'Completed' ? 'Completed' : 'On Track'
                });
            });

            setItems(loadedItems);
            setOriginalItems(JSON.parse(JSON.stringify(loadedItems)));
            setChangedItems(new Map());
            setIsLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, activities, staffingReqs, officeReqs]);

    // --- 2. Grouping for Display ---
    const groupedDisplay = useMemo(() => {
        return {
            'Subprojects': sortPhysicalItems(items.filter(i => i.sourceType === 'Subproject'), sortMode),
            'Activities': sortPhysicalItems(items.filter(i => i.sourceType === 'Activity'), sortMode),
            'Staffing Requirements': sortPhysicalItems(items.filter(i => i.sourceType === 'Staffing'), sortMode),
            'Office Requirements': sortPhysicalItems(items.filter(i => i.sourceType === 'Office'), sortMode),
            'Program Management': sortPhysicalItems([
                ...items.filter(i => i.sourceType === 'Staffing'),
                ...items.filter(i => i.sourceType === 'Office')
            ], sortMode)
        };
    }, [items, sortMode]);

    // --- 3. Handlers ---

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
    };

    const toggleSubgroup = (group: string) => {
        setExpandedSubgroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
    };

    const toggleParent = (id: string) => {
        setExpandedParents(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    };

    const handleTitleClick = (item: PhysicalItem) => {
        if (item.sourceType === 'Subproject') {
            const s = subprojects.find(x => x.id === item.sourceId);
            if (s) onSelectSubproject(s);
        } else if (item.sourceType === 'Activity') {
            const a = activities.find(x => x.id === item.sourceId);
            if (a) onSelectActivity(a);
        } else if (item.sourceType === 'Office') {
            const o = officeReqs.find(x => x.id === item.sourceId);
            if (o) onSelectOfficeReq(o);
        } else if (item.sourceType === 'Staffing' && !item.isParent) {
            const s = staffingReqs.find(x => x.id === item.sourceId);
            if (s) onSelectStaffingReq(s);
        }
    };

    const findOriginalItem = (uniqueId: string, nodes: PhysicalItem[] = originalItems): PhysicalItem | undefined => {
        for (const node of nodes) {
            if (node.uniqueId === uniqueId) return node;
            if (node.children) {
                const child = findOriginalItem(uniqueId, node.children);
                if (child) return child;
            }
        }
        return undefined;
    };

    const hasSubprojectDetailActualChange = (before: Subproject['details'], after: Subproject['details']) => {
        if (before.length !== after.length) return true;
        return after.some(detail => {
            const original = before.find(item => item.id === detail.id);
            if (!original) return true;
            return valuesDiffer(original.actualDeliveryDate, detail.actualDeliveryDate)
                || valuesDiffer(original.actualNumberOfUnits, detail.actualNumberOfUnits)
                || valuesDiffer(original.isCompleted, detail.isCompleted);
        });
    };

    // Update Local State
    const updateLocalItem = (uniqueId: string, updates: Partial<PhysicalItem>) => {
        setItems(prev => {
            const newItems = [...prev];
            
            // Recursive updater to handle children in local state
            const updateNode = (nodes: PhysicalItem[]): boolean => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].uniqueId === uniqueId) {
                        nodes[i] = { ...nodes[i], ...updates };
                        return true;
                    }
                    if (nodes[i].children) {
                        if (updateNode(nodes[i].children!)) return true;
                    }
                }
                return false;
            };
            
            updateNode(newItems);
            return newItems;
        });

        setChangedItems(prev => {
            const newMap = new Map(prev);
            const existing = newMap.get(uniqueId) || {};
            newMap.set(uniqueId, Object.assign({}, existing, updates));
            return newMap;
        });
    };

    // Save Logic
    const saveItemToDB = async (item: PhysicalItem) => {
        if (!canEdit) return;

        try {
            const submittedAt = new Date().toISOString();

            if (item.sourceType === 'Subproject') {
                if (item.isParent) {
                    // Save parent status/date AND children cascading
                    const sp = subprojects.find(s => s.id === item.sourceId);
                    if (!sp) throw new Error("Subproject not found");

                    // Update all details if children modified in local state (they are nested in item.children)
                    const updatedDetails = sp.details.map(d => {
                        const childState = item.children?.find(c => c.detailId === d.id);
                        if (childState) {
                            const hasActualDeliveryDate = !!childState.actualDateStart;
                            return {
                                ...d,
                                actualDeliveryDate: childState.actualDateStart,
                                actualNumberOfUnits: childState.actualQty,
                                isCompleted: hasActualDeliveryDate,
                                deliveryDate: childState.targetDateStart,
                                numberOfUnits: childState.targetQty
                            };
                        }
                        return d;
                    });
                    const completionRollup = resolveSubprojectCompletionRollup(updatedDetails);
                    const normalizedUpdatedDetails = completionRollup.details;
                    const newStatus = sp.status === 'Cancelled' ? 'Cancelled' : completionRollup.status;
                    const newActualCompletionDate = newStatus === 'Completed' ? completionRollup.actualCompletionDate : null;
                    const originalItem = findOriginalItem(item.uniqueId);
                    const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                        hasPhysicalAccomplishment: !!newActualCompletionDate,
                        hasChanged: valuesDiffer(originalItem?.actualDateStart, newActualCompletionDate)
                            || valuesDiffer(originalItem?.catchUpPlanRemarks, item.catchUpPlanRemarks)
                            || valuesDiffer(sp.status, newStatus)
                            || hasSubprojectDetailActualChange(sp.details, normalizedUpdatedDetails),
                        previousSubmittedAt: sp.physical_accomplishment_submitted_at,
                        submittedAt
                    });

                    if (supabase) {
                        await supabase.from('subprojects').update({
                            actualCompletionDate: newActualCompletionDate,
                            estimatedCompletionDate: item.targetDateStart || null,
                            catchUpPlanRemarks: item.catchUpPlanRemarks || null,
                            status: newStatus,
                            details: normalizedUpdatedDetails,
                            physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                            updated_at: submittedAt
                        }).eq('id', sp.id);
                    }

                    // Update Context
                    setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, actualCompletionDate: newActualCompletionDate || undefined, estimatedCompletionDate: item.targetDateStart, catchUpPlanRemarks: item.catchUpPlanRemarks || '', status: newStatus, details: normalizedUpdatedDetails, physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt, updated_at: submittedAt } : s));

                } else {
                    // Save Individual Child Row
                    const parentItem = items.find(p => p.uniqueId === item.parentId);
                    if (!parentItem) throw new Error("Parent not found");
                    const sp = subprojects.find(s => s.id === parentItem.sourceId);
                    if (!sp) throw new Error("Subproject not found");

                    const updatedDetails = sp.details.map(d => {
                        if (d.id === item.detailId) {
                            const hasActualDeliveryDate = !!item.actualDateStart;
                            return { 
                                ...d, 
                                actualDeliveryDate: item.actualDateStart, 
                                actualNumberOfUnits: item.actualQty,
                                isCompleted: hasActualDeliveryDate,
                                deliveryDate: item.targetDateStart,
                                numberOfUnits: item.targetQty
                            };
                        }
                        return d;
                    });
                    const completionRollup = resolveSubprojectCompletionRollup(updatedDetails);
                    const normalizedUpdatedDetails = completionRollup.details;
                    const newStatus = sp.status === 'Cancelled' ? 'Cancelled' : completionRollup.status;
                    const newActualCompletionDate = newStatus === 'Completed' ? completionRollup.actualCompletionDate : null;
                    const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                        hasPhysicalAccomplishment: !!newActualCompletionDate,
                        hasChanged: hasSubprojectDetailActualChange(sp.details, normalizedUpdatedDetails)
                            || valuesDiffer(sp.actualCompletionDate, newActualCompletionDate)
                            || valuesDiffer(sp.status, newStatus),
                        previousSubmittedAt: sp.physical_accomplishment_submitted_at,
                        submittedAt
                    });

                    if (supabase) {
                        await supabase.from('subprojects').update({
                            details: normalizedUpdatedDetails,
                            status: newStatus,
                            actualCompletionDate: newActualCompletionDate,
                            physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                            updated_at: submittedAt
                        }).eq('id', sp.id);
                    }
                    setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, details: normalizedUpdatedDetails, status: newStatus, actualCompletionDate: newActualCompletionDate || undefined, physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt, updated_at: submittedAt } : s));
                }

            } else if (item.sourceType === 'Activity') {
                const act = activities.find(a => a.id === item.sourceId);
                if (!act) throw new Error("Activity not found");

                const newStatus: Activity['status'] = item.actualDateStart ? 'Completed' : 'Ongoing';
                const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                    hasPhysicalAccomplishment: !!item.actualDateStart,
                    hasChanged: valuesDiffer(act.actualDate, item.actualDateStart)
                        || valuesDiffer(act.actualEndDate, item.actualDateEnd)
                        || valuesDiffer(act.actualParticipantsMale, item.actualMale)
                        || valuesDiffer(act.actualParticipantsFemale, item.actualFemale)
                        || valuesDiffer(act.catchUpPlanRemarks, item.catchUpPlanRemarks),
                    previousSubmittedAt: act.physical_accomplishment_submitted_at,
                    submittedAt
                });
                const payload = {
                    actualDate: item.actualDateStart,
                    actualEndDate: item.actualDateEnd || item.actualDateStart || null,
                    actualParticipantsMale: item.actualMale,
                    actualParticipantsFemale: item.actualFemale,
                    catchUpPlanRemarks: item.catchUpPlanRemarks || null,
                    date: item.targetDateStart,
                    endDate: item.targetDateEnd || item.targetDateStart,
                    participantsMale: item.targetMale,
                    participantsFemale: item.targetFemale,
                    status: newStatus,
                    physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                    updated_at: submittedAt
                };

                if (supabase) {
                    await supabase.from('activities').update(payload).eq('id', act.id);
                }
                setActivities(prev => prev.map(a => a.id === act.id ? { ...a, ...payload } : a));

            } else if (item.sourceType === 'Staffing') {
                 const existing = staffingReqs.find(s => s.id === item.sourceId);
                 const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                    hasPhysicalAccomplishment: !!item.actualDateStart,
                    hasChanged: valuesDiffer(existing?.actualObligationDate, item.actualDateStart),
                    previousSubmittedAt: existing?.physical_accomplishment_submitted_at,
                    submittedAt
                 });
                 // Update Date Hired and Target Date
                 const payload = { 
                     actualObligationDate: item.actualDateStart,
                     obligationDate: item.targetDateStart,
                     physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                     updated_at: submittedAt
                  };
                 if (supabase) {
                    await supabase.from('staffing_requirements').update(payload).eq('id', item.sourceId);
                 }
                 setStaffingReqs(prev => prev.map(s => s.id === item.sourceId ? { ...s, ...payload } : s));

            } else if (item.sourceType === 'Office') {
                const existing = officeReqs.find(o => o.id === item.sourceId);
                const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                    hasPhysicalAccomplishment: !!item.actualDateStart,
                    hasChanged: valuesDiffer(existing?.actualObligationDate, item.actualDateStart),
                    previousSubmittedAt: existing?.physical_accomplishment_submitted_at,
                    submittedAt
                });
                // Update Actual Date and Target Date
                const payload = { 
                    actualObligationDate: item.actualDateStart,
                    obligationDate: item.targetDateStart,
                    numberOfUnits: item.targetQty,
                    physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                    updated_at: submittedAt
                }; 
                if (supabase) {
                    await supabase.from('office_requirements').update(payload).eq('id', item.sourceId);
                }
                setOfficeReqs(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
            }

            updateLocalItem(item.uniqueId, { isLocked: false });

        } catch (error: any) {
            console.error("Save error:", error);
            throw error;
        }
    };

    const handleSaveAllClick = () => {
        setIsSaveConfirmOpen(true);
    };

    const confirmSaveAll = async () => {
        setIsSaveConfirmOpen(false);
        setIsSavingAll(true);
        try {
            // Find all items that have changes
            const itemsToSave: PhysicalItem[] = [];
            
            const findChangedItems = (nodes: PhysicalItem[]) => {
                nodes.forEach(node => {
                    if (changedItems.has(node.uniqueId)) {
                        itemsToSave.push(node);
                    }
                    if (node.children) {
                        findChangedItems(node.children);
                    }
                });
            };
            
            findChangedItems(items);

            for (const item of itemsToSave) {
                if (!(await validatePhysicalItemForSave(item))) {
                    setIsSavingAll(false);
                    return;
                }
            }
            await Promise.all(itemsToSave.map(item => saveItemToDB(item)));
            
            setChangedItems(new Map());
            setOriginalItems(JSON.parse(JSON.stringify(items)));
            
            setSaveSuccessMessage('All changes saved successfully!');
            setTimeout(() => setSaveSuccessMessage(''), 3000);
        } catch (error: any) {
            console.error("Save all error:", error);
            alert("Failed to save some items: " + error.message);
        } finally {
            setIsSavingAll(false);
        }
    };

    const undoLocalItem = (uniqueId: string) => {
        const originalItem = originalItems.find(i => i.uniqueId === uniqueId) || 
                             originalItems.flatMap(i => i.children || []).find(c => c.uniqueId === uniqueId);
        if (originalItem) {
            setItems(prev => {
                const newItems = [...prev];
                const updateNode = (nodes: PhysicalItem[]): boolean => {
                    for (let i = 0; i < nodes.length; i++) {
                        if (nodes[i].uniqueId === uniqueId) {
                            nodes[i] = { ...originalItem };
                            return true;
                        }
                        if (nodes[i].children) {
                            if (updateNode(nodes[i].children!)) return true;
                        }
                    }
                    return false;
                };
                updateNode(newItems);
                return newItems;
            });
            
            setChangedItems(prev => {
                const newMap = new Map(prev);
                newMap.delete(uniqueId);
                return newMap;
            });
        }
    };

    // --- Render Helpers ---
    const renderDateInput = (value: string, onChange: (val: string) => void | Promise<void>, disabled: boolean) => (
        <input 
            type="date" 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            disabled={disabled}
            className={commonInputClasses}
        />
    );

    const renderNumberInput = (value: number, onChange: (val: number) => void, disabled: boolean) => (
        <input 
            type="number" 
            value={value || ''} 
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)} 
            disabled={disabled}
            className={`${commonInputClasses} form-control--numeric`}
        />
    );

    const renderActualNumberInput = (inputId: string, value: number, onChange: (val: number) => void, disabled: boolean) => {
        const isFocused = focusedNumberInputs.has(inputId);
        return (
            <input
                type="text"
                inputMode="decimal"
                value={isFocused ? (value || '').toString() : formatPhysicalNumber(value)}
                onFocus={() => setFocusedNumberInputs(prev => new Set(prev).add(inputId))}
                onBlur={() => setFocusedNumberInputs(prev => {
                    const next = new Set(prev);
                    next.delete(inputId);
                    return next;
                })}
                onChange={(e) => onChange(parsePhysicalNumberInput(e.target.value))}
                disabled={disabled}
                className={`${commonInputClasses} form-control--numeric`}
            />
        );
    };

    const renderDueBadge = (item: PhysicalItem) => {
        const status = item.dueStatus || 'On Track';
        return (
            <span className={`physical-accomplishment-due-badge physical-accomplishment-due-badge--${status.toLowerCase().replace(/\s+/g, '-')}`}>
                {status}
            </span>
        );
    };

    const renderCatchUpPlan = (item: PhysicalItem, disabled: boolean) => {
        if (!item.isOverdue && !item.catchUpPlanRemarks) {
            return <span className="physical-accomplishment-empty-cell">-</span>;
        }
        if ((item.sourceType === 'Subproject' && item.isParent) || item.sourceType === 'Activity') {
            return (
                <textarea
                    value={item.catchUpPlanRemarks || ''}
                    onChange={(e) => updateLocalItem(item.uniqueId, { catchUpPlanRemarks: e.target.value })}
                    disabled={disabled}
                    rows={2}
                    className="physical-accomplishment-catchup-input"
                    placeholder={item.isOverdue ? 'Enter justification or catch-up plan...' : 'No catch-up plan recorded.'}
                />
            );
        }
        return item.catchUpPlanRemarks
            ? <span className="physical-accomplishment-catchup-text">{item.catchUpPlanRemarks}</span>
            : <span className="physical-accomplishment-empty-cell">-</span>;
    };

    const renderPhysicalTagBadge = (tag?: string | null) => {
        if (!tag) return null;
        return <span className={`budget-line-badge physical-accomplishment-tag budget-line-badge--${tag.toLowerCase()}`}>{tag}</span>;
    };

    const getPhysicalTagClass = (item: PhysicalItem) => {
        const tag = item.recordTag || item.lineTag;
        return tag ? `physical-accomplishment-row--${tag.toLowerCase()}` : '';
    };

    const getCompletionRate = (item: PhysicalItem) => {
        if (item.targetExcluded) return 0;
        if (item.sourceType === 'Activity') {
            return item.actualDateStart ? 100 : 0;
        }
        if (!item.targetQty) return 0;
        return Math.min(100, Math.round((item.actualQty / item.targetQty) * 100));
    };

    const canEditTarget = (item: PhysicalItem) => {
        if (!canEdit) return false;
        if (currentUser?.role === 'Administrator') return true;
        if (currentUser?.role === 'User' && item.status === 'Proposed') return true;
        return false;
    };

    const renderTargetUnits = (item: PhysicalItem, isTargetEditable: boolean) => {
        const targetClass = item.targetExcluded ? 'physical-accomplishment-target-excluded' : '';
        const canEditVisibleTarget = isTargetEditable && !item.targetExcluded;
        if (item.sourceType === 'Activity') {
            return canEditVisibleTarget ? (
                <div className="physical-accomplishment-gender-inputs">
                    <input type="number" placeholder="M" value={item.targetMale || ''} onChange={(e) => updateLocalItem(item.uniqueId, { targetMale: parseFloat(e.target.value) || 0, targetQty: (parseFloat(e.target.value) || 0) + (item.targetFemale || 0) })} className={`${commonInputClasses} w-12`} />
                    <input type="number" placeholder="F" value={item.targetFemale || ''} onChange={(e) => updateLocalItem(item.uniqueId, { targetFemale: parseFloat(e.target.value) || 0, targetQty: (item.targetMale || 0) + (parseFloat(e.target.value) || 0) })} className={`${commonInputClasses} w-12`} />
                </div>
            ) : (
                <div className={`physical-accomplishment-target-summary ${targetClass}`}>
                    <span>{item.targetQty} Pax</span>
                    <span className="physical-accomplishment-demographic-note">M:{item.targetMale} F:{item.targetFemale}</span>
                </div>
            );
        }

        if (item.isParent && item.sourceType === 'Subproject') {
            return <span className="physical-accomplishment-empty-cell">-</span>;
        }

        return canEditVisibleTarget && !item.isParent ? (
            renderNumberInput(item.targetQty, (val) => updateLocalItem(item.uniqueId, { targetQty: val }), false)
        ) : (
            <span className={targetClass}>{item.targetQty} {item.unitOfMeasure}</span>
        );
    };

    const renderPhysicalItemRows = (groupItems: PhysicalItem[]) => sortPhysicalItems(groupItems, sortMode).map(item => {
        const isParentExpanded = item.isParent && expandedParents.includes(item.uniqueId);
        const completionRate = getCompletionRate(item);
        const itemPhysicalDecision = getPhysicalStatusDecision(item);
        const canEditPhysicalItem = canEdit && itemPhysicalDecision.allowed;
        const isLocked = !canEditPhysicalItem;
        const isDerivedSubprojectParentActual = item.sourceType === 'Subproject' && item.isParent;
        const isTargetEditable = canEditTarget(item);
        const canEditVisibleTarget = isTargetEditable && !item.targetExcluded;
        const isChanged = changedItems.has(item.uniqueId);
        const itemRowClass = [
            'physical-accomplishment-row',
            item.isParent ? 'physical-accomplishment-row--parent' : '',
            item.isOverdue ? 'physical-accomplishment-row--overdue' : '',
            item.targetExcluded ? 'physical-accomplishment-row--target-excluded' : '',
            getPhysicalTagClass(item),
            isChanged ? 'physical-accomplishment-row--changed' : ''
        ].filter(Boolean).join(' ');

        return (
            <React.Fragment key={item.uniqueId}>
                <tr className={itemRowClass}>
                    <td className="physical-accomplishment-sticky-col physical-accomplishment-sticky-particulars px-4 py-2">
                        <div className="physical-accomplishment-title-cell">
                            {item.isParent && (
                                <button onClick={() => toggleParent(item.uniqueId)} className="fac-expand-toggle fac-expand-toggle--small" aria-label={isParentExpanded ? 'Collapse row' : 'Expand row'}>
                                    {isParentExpanded ? '-' : '+'}
                                </button>
                            )}
                            <div className="min-w-0">
                                <button onClick={() => handleTitleClick(item)} className="physical-accomplishment-title-action">
                                    {item.name}
                                </button>
                                {renderPhysicalTagBadge(item.recordTag)}
                                {renderPhysicalTagBadge(item.lineTag)}
                                {item.subName && <div className="physical-accomplishment-subtitle">{item.subName}</div>}
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                        {canEditVisibleTarget && !(item.sourceType === 'Staffing' && item.isParent) ? (
                            <div className="space-y-1">
                                {renderDateInput(item.targetDateStart || '', (val) => updateLocalItem(item.uniqueId, { targetDateStart: val }), false)}
                                {item.sourceType === 'Activity' && (
                                    renderDateInput(item.targetDateEnd || item.targetDateStart || '', (val) => updateLocalItem(item.uniqueId, { targetDateEnd: val }), false)
                                )}
                            </div>
                        ) : (
                            <>
                                {item.targetDateStart || '-'}
                                {item.targetDateEnd ? ` to ${item.targetDateEnd}` : ''}
                            </>
                        )}
                    </td>
                    <td className="px-4 py-2 text-center">
                        {renderTargetUnits(item, isTargetEditable)}
                    </td>
                    <td className="pac-col-actual px-4 py-2">
                        {!(item.sourceType === 'Staffing' && item.isParent) && (
                            <div className="space-y-1">
                                {renderDateInput(item.actualDateStart, async (val) => {
                                    if (val && !(await validatePhysicalActualMonth(item, val))) return;
                                    updateLocalItem(item.uniqueId, { actualDateStart: val });
                                }, isLocked || isDerivedSubprojectParentActual)}
                                {item.sourceType === 'Activity' && item.targetDateEnd && (
                                    renderDateInput(item.actualDateEnd || item.actualDateStart, async (val) => {
                                        if (val && !(await validatePhysicalActualMonth(item, val))) return;
                                        updateLocalItem(item.uniqueId, { actualDateEnd: val });
                                    }, isLocked)
                                )}
                            </div>
                        )}
                    </td>
                    <td className="pac-col-actual px-4 py-2 text-center">
                        {item.sourceType === 'Activity' ? (
                            <div className="physical-accomplishment-gender-inputs">
                                {renderActualNumberInput(`${item.uniqueId}-actual-male`, item.actualMale || 0, (val) => updateLocalItem(item.uniqueId, { actualMale: val, actualQty: val + (item.actualFemale || 0) }), isLocked)}
                                {renderActualNumberInput(`${item.uniqueId}-actual-female`, item.actualFemale || 0, (val) => updateLocalItem(item.uniqueId, { actualFemale: val, actualQty: (item.actualMale || 0) + val }), isLocked)}
                            </div>
                        ) : (
                            item.isParent && item.sourceType === 'Subproject' ? '-'
                            : (item.sourceType === 'Staffing' && item.isParent ? <span className=" ">{item.actualQty} / {item.targetQty}</span>
                                : renderActualNumberInput(`${item.uniqueId}-actual-qty`, item.actualQty, (val) => updateLocalItem(item.uniqueId, { actualQty: val }), isLocked))
                        )}
                    </td>
                    <td className="px-4 py-2 text-center physical-accomplishment-completion">
                        {item.isParent ? '-' : item.targetExcluded ? <span className="physical-accomplishment-empty-cell">Excluded</span> : `${completionRate}%`}
                    </td>
                    <td className="px-4 py-2 text-center ">
                        {renderDueBadge(item)}
                    </td>
                    <td className="px-4 py-2 ">
                        {renderCatchUpPlan(item, isLocked)}
                    </td>
                    <td className="px-4 py-2 text-right">
                        {isChanged && (
                            <button onClick={() => undoLocalItem(item.uniqueId)} className="table-action table-action--danger" title="Undo Changes">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </button>
                        )}
                    </td>
                </tr>

                {item.isParent && isParentExpanded && item.children && renderPhysicalItemRows(item.children)}
            </React.Fragment>
        );
    });

    return (
        <div className="data-list-page">
            <div className="data-list-header">
                <div>
                    <h2 className="data-list-title">Physical Accomplishment Collection Form</h2>
                </div>
                <div className="page-filter-toggle">
                    <span className="page-filter-summary">
                        {[selectedOu === 'All' ? 'All OUs' : selectedOu, selectedTier, selectedFundType, selectedYear || defaultYear].join(' / ')}
                    </span>
                    <button
                        type="button"
                        className={`btn btn-secondary page-filter-button ${filtersOpen ? 'is-open' : ''}`}
                        onClick={() => setFiltersOpen(prev => !prev)}
                        aria-expanded={filtersOpen}
                        aria-controls="physical-accomplishment-filter-panel"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                        <span>Filters</span>
                        <ChevronDown aria-hidden="true" className="page-filter-button__chevron" />
                    </button>
                </div>
            </div>

            <div
                id="physical-accomplishment-filter-panel"
                className={`report-filter-panel dashboard-filter-panel page-filter-panel ${filtersOpen ? 'is-open' : ''}`}
                hidden={!filtersOpen}
            >
                <div className="report-filter-grid">
                    <div className="report-filter">
                        <label htmlFor="physical-ou-filter" className="form-label">OU</label>
                        <select
                            id="physical-ou-filter"
                            value={selectedOu}
                            onChange={(event) => setSelectedOu(event.target.value)}
                            disabled={!canViewAll}
                            className="form-control"
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="physical-tier-filter" className="form-label">Tier</label>
                        <select
                            id="physical-tier-filter"
                            value={selectedTier}
                            onChange={(event) => setSelectedTier(event.target.value)}
                            className="form-control"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="physical-fund-type-filter" className="form-label">Fund Type</label>
                        <select
                            id="physical-fund-type-filter"
                            value={selectedFundType}
                            onChange={(event) => setSelectedFundType(event.target.value)}
                            className="form-control"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(fundType => (
                                <option key={fundType} value={fundType}>{fundType}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="physical-year-filter" className="form-label">Year</label>
                        <select
                            id="physical-year-filter"
                            value={(selectedYear || defaultYear).toString()}
                            onChange={(event) => setSelectedYear(Number(event.target.value))}
                            className="form-control"
                        >
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading physical data..." />
            ) : (
                <div className="data-table-card">
                <section className="financial-accomplishment-summary-grid physical-accomplishment-summary-grid" aria-label="Physical accomplishment summary">
                    {physicalSummaryCards.map(card => (
                        <div key={card.label} className={`financial-accomplishment-summary-card physical-accomplishment-summary-card physical-accomplishment-summary-card--${card.tone}`}>
                            <div className="financial-accomplishment-summary-card__header">
                                <span>{card.label}</span>
                            </div>
                            <strong>{card.accomplished} / {card.target}</strong>
                            <small>{card.percent}% accomplished - {card.status}</small>
                        </div>
                    ))}
                </section>
                <div className="physical-accomplishment-table-toolbar">
                    <label htmlFor="physical-table-sort" className="physical-accomplishment-table-toolbar__label">Sort rows</label>
                    <select
                        id="physical-table-sort"
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as PhysicalSortMode)}
                        className="form-control physical-accomplishment-sort-select"
                    >
                        <option value="default">Default</option>
                        <option value="target-date-asc">Target Date: Earliest</option>
                        <option value="target-date-desc">Target Date: Latest</option>
                        <option value="due-status">Due Status</option>
                    </select>
                </div>
                <div className="data-table-scroll financial-accomplishment-table-scroll physical-accomplishment-table-scroll custom-scrollbar">
                    <table className="data-table physical-accomplishment-table">
                        <colgroup>
                            <col className="pac-width-particulars" />
                            <col className="pac-width-date" />
                            <col className="pac-width-units" />
                            <col className="pac-width-date" />
                            <col className="pac-width-units" />
                            <col className="pac-width-completion" />
                            <col className="pac-width-status" />
                            <col className="pac-width-catchup" />
                            <col className="pac-width-action" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="physical-accomplishment-sticky-col physical-accomplishment-sticky-particulars physical-accomplishment-sticky-head px-4 py-3 text-center align-middle">Particulars / Activity</th>
                                <th className="px-4 py-3 text-center">Target Date</th>
                                <th className="px-4 py-3 text-center">Target Units</th>
                                <th className="pac-col-actual px-4 py-3 text-center">Actual Date</th>
                                <th className="pac-col-actual px-4 py-3 text-center">Actual Units</th>
                                <th className="px-4 py-3 text-center">% Completion</th>
                                <th className="px-4 py-3 text-center">Due Status</th>
                                <th className="px-4 py-3 text-center">Justification / Catch-up Plan</th>
                                <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(['Subprojects', 'Activities', 'Program Management'] as const).map(groupKey => {
                                const groupItems: PhysicalItem[] = groupedDisplay[groupKey] || [];
                                if (groupItems.length === 0) return null;
                                const isGroupExpanded = expandedGroups.includes(groupKey);
                                const isProgramManagement = groupKey === 'Program Management';
                                const programSubgroups = ['Staffing Requirements', 'Office Requirements'] as const;

                                return (
                                    <React.Fragment key={groupKey}>
                                        <tr className="physical-accomplishment-row physical-accomplishment-row--group">
                                            <td className="physical-accomplishment-sticky-col physical-accomplishment-sticky-particulars px-4 py-3">
                                                <button onClick={() => toggleGroup(groupKey)} className="physical-accomplishment-drill-button">
                                                    <span className="fac-expand-toggle" aria-hidden="true">{isGroupExpanded ? '-' : '+'}</span>
                                                    <span>{groupKey}</span>
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-center physical-accomplishment-empty-cell">-</td>
                                            <td className="px-4 py-3 text-center">{groupItems.length} record{groupItems.length === 1 ? '' : 's'}</td>
                                            <td className="pac-col-actual px-4 py-3 text-center">-</td>
                                            <td className="pac-col-actual px-4 py-3 text-center ">-</td>
                                            <td className="px-4 py-3 text-center ">-</td>
                                            <td className="px-4 py-3 text-center ">-</td>
                                            <td className="px-4 py-3 text-center ">-</td>
                                            <td className="px-4 py-3 text-right ">-</td>
                                        </tr>

                                        {isGroupExpanded && !isProgramManagement && renderPhysicalItemRows(groupItems)}
                                        {isGroupExpanded && isProgramManagement && programSubgroups.map(subgroupKey => {
                                            const subgroupItems = groupedDisplay[subgroupKey] || [];
                                            if (subgroupItems.length === 0) return null;
                                            const isSubgroupExpanded = expandedSubgroups.includes(subgroupKey);

                                            return (
                                                <React.Fragment key={subgroupKey}>
                                                    <tr className="physical-accomplishment-row physical-accomplishment-row--subgroup">
                                                        <td className="physical-accomplishment-sticky-col physical-accomplishment-sticky-particulars px-4 py-3">
                                                            <button onClick={() => toggleSubgroup(subgroupKey)} className="physical-accomplishment-drill-button">
                                                                <span className="fac-expand-toggle" aria-hidden="true">{isSubgroupExpanded ? '-' : '+'}</span>
                                                                <span>{subgroupKey}</span>
                                                            </button>
                                                        </td>
                                                        <td className="px-4 py-3 text-center physical-accomplishment-empty-cell">-</td>
                                                        <td className="px-4 py-3 text-center">{subgroupItems.length} record{subgroupItems.length === 1 ? '' : 's'}</td>
                                                        <td className="pac-col-actual px-4 py-3 text-center">-</td>
                                                        <td className="pac-col-actual px-4 py-3 text-center ">-</td>
                                                        <td className="px-4 py-3 text-center ">-</td>
                                                        <td className="px-4 py-3 text-center ">-</td>
                                                        <td className="px-4 py-3 text-center ">-</td>
                                                        <td className="px-4 py-3 text-right ">-</td>
                                                    </tr>
                                                    {isSubgroupExpanded && renderPhysicalItemRows(subgroupItems)}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                            {items.length === 0 && <tr><td colSpan={9} className="data-table__empty-cell">No data available for the selected filters.</td></tr>}
                        </tbody>
                    </table>
                </div>
                </div>
            )}

            {/* Global Save Bar */}
            {changedItems.size > 0 && (
                <div className="financial-savebar">
                    <div className="financial-savebar__status">
                        <span className="status-badge status-badge--approved">
                            {changedItems.size} unsaved change{changedItems.size > 1 ? 's' : ''}
                        </span>
                        <span className="financial-savebar__copy">
                            Please save your changes before leaving this page.
                        </span>
                    </div>
                    <button
                        onClick={handleSaveAllClick}
                        className="btn btn-primary"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        Save All Changes
                    </button>
                </div>
            )}

            {/* Save Confirmation Modal */}
            {isSaveConfirmOpen && (
                <ConfirmDialog
                    title="Confirm Save"
                    description={`Are you sure you want to save ${changedItems.size} change${changedItems.size > 1 ? 's' : ''}?`}
                    confirmLabel={isSavingAll ? 'Saving…' : 'Confirm Save'}
                    onConfirm={confirmSaveAll}
                    onCancel={() => setIsSaveConfirmOpen(false)}
                />
            )}

            {/* Success Toast */}
            {saveSuccessMessage && (
                <div className="app-toast app-toast--success animate-fadeIn">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {saveSuccessMessage}
                </div>
            )}
            {monthLockMessage && (
                <div className="app-toast app-toast--warning animate-fadeIn" role="status">
                    {monthLockMessage}
                </div>
            )}
        </div>
    );
};

export default PhysicalAccomplishment;

