// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    AlertTriangle,
    ArrowLeft,
    BookOpen,
    Briefcase,
    Building2,
    ChevronDown,
    ChevronRight,
    Download,
    GraduationCap,
    Landmark,
    Search,
    Users,
} from 'lucide-react';
import { Subproject, IPO, Training, OtherActivity, OfficeRequirement, StaffingRequirement, operatingUnits, ouToRegionMap } from '../../constants';
import { isMonthTargetOverdue } from '../../lib/dateStatus';
import { getActivityDisplayTitle, getActivityIpoIds, getSubprojectIpoId } from '../../lib/entityIdentity';
import { parseLocation } from '../LocationPicker';
import { ModalItem } from './DashboardComponents';

declare const PptxGenJS: any;
declare const JSZip: any;

interface PhysicalDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        ipos: IPO[];
    };
    setModalData: (data: { title: string; items: ModalItem[] } | null) => void;
    selectedYear: string;
    selectedOu?: string;
    isAllOuView?: boolean;
    onSelectIpo?: (ipo: IPO) => void;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectActivity?: (activity: Training | OtherActivity) => void;
    setExternalFilters?: (filters: any) => void;
    navigateTo?: (page: string) => void;
}

type ViewMode = 'Annual' | 'Monthly';
type DetailView = 'national' | 'provinces' | 'trend' | 'alerts' | 'submissions';
type ModalType = 'ipos' | 'subprojects' | 'trainings' | 'ads' | 'provinces';
type MetricId = 'ipos' | 'subprojects' | 'iposWithSubprojects' | 'trainings' | 'iposTrained' | 'ads';
type TrendIndicatorId = 'physicalPercentage' | 'ipos' | 'subprojects' | 'trainings' | 'ads';
type SummarySortKey = 'name' | 'ipos' | 'subprojects' | 'trainings' | 'rate' | 'status';
type SortDirection = 'asc' | 'desc';

type ModalItemWithOu = ModalItem & {
    operatingUnit?: string;
    targetDate?: string;
    actualDate?: string;
    isCompleted?: boolean;
    isOverdue?: boolean;
    isUnresolved?: boolean;
    isUnresolvedPlaceholder?: boolean;
    unresolvedIpoReferences?: string[];
};

type MetricScope = {
    target: number;
    actual: number;
    targets: ModalItemWithOu[];
    accomplishments: ModalItemWithOu[];
};

type Metric = {
    id: MetricId;
    label: string;
    variant: string;
    modalType: ModalType;
    icon: React.ReactNode;
    annual: MetricScope;
    monthly: MetricScope;
    quarterly: MetricScope;
    cumulative: MetricScope;
};

type ProvincePerformance = {
    key: string;
    ou: string;
    province: string;
    targetIpos: number;
    actualIpos: number;
    targetSubprojects: number;
    actualSubprojects: number;
    targetTrainings: number;
    actualTrainings: number;
    rate: number;
};

type RecentSubmission = {
    id: string;
    name: string;
    type: string;
    component: string;
    operatingUnit: string;
    editedAt: string;
    completionDate: string;
};

type CumulativeTrendRow = {
    month: string;
    monthShort: string;
    target: number;
    actual: number;
    rate: number;
};

const trendIndicatorOptions: Array<{ id: TrendIndicatorId; label: string }> = [
    { id: 'physicalPercentage', label: 'Physical Percentage' },
    { id: 'ipos', label: 'IPOs Assisted' },
    { id: 'subprojects', label: 'Subprojects' },
    { id: 'trainings', label: 'Trainings' },
    { id: 'ads', label: 'ADs Assisted' },
];

const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const shortMonthNames = monthNames.map(month => month.slice(0, 3));

const OU_DISPLAY_ORDER = [
    'NPMO',
    'RPMO CAR',
    'RPMO 1',
    'RPMO 2',
    'RPMO 3',
    'RPMO 4A',
    'RPMO 4B',
    'RPMO 5',
    'RPMO 6',
    'RPMO 7',
    'RPMO NIR',
    'RPMO 8',
    'RPMO 9',
    'RPMO 10',
    'RPMO 11',
    'RPMO 12',
    'RPMO 13',
];

const getOuSortIndex = (ou?: string) => {
    if (!ou) return 9999;
    const preferredIndex = OU_DISPLAY_ORDER.indexOf(ou);
    if (preferredIndex >= 0) return preferredIndex;
    const canonicalIndex = operatingUnits.indexOf(ou);
    return canonicalIndex >= 0 ? 1000 + canonicalIndex : 9999;
};

const compareOuThenName = (a?: string, b?: string, aName = '', bName = '') => {
    const orderDiff = getOuSortIndex(a) - getOuSortIndex(b);
    if (orderDiff !== 0) return orderDiff;
    return (a || '').localeCompare(b || '') || aName.localeCompare(bName);
};

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return formatDate(dateString.slice(0, 10));
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const sanitizeFileSegment = (value: string) => (
    value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'All'
);

const parseDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(`${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
};

const getDateYear = (dateString?: string) => parseDate(dateString)?.getFullYear().toString();
const getDateMonth = (dateString?: string) => {
    const parsed = parseDate(dateString);
    return parsed ? parsed.getMonth() : -1;
};

const getActivityTargetDate = (activity: Training | OtherActivity) => activity.endDate || activity.date;

const getQuarterBounds = (monthIndex: number) => {
    const start = Math.floor(Math.max(0, Math.min(11, monthIndex)) / 3) * 3;
    return { start, end: start + 2, label: `Q${Math.floor(start / 3) + 1}` };
};

const isDateInMonthRange = (dateString: string | undefined, startMonth: number, endMonth: number) => {
    const month = getDateMonth(dateString);
    return month >= startMonth && month <= endMonth;
};

const toDataUri = async (url: string) => {
    try {
        const response = await fetch(url);
        if (!response.ok) return '';
        const blob = await response.blob();
        return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
        });
    } catch {
        return '';
    }
};

const getSelectedAsOfCutoff = (selectedYear: string, asOfMonth: number) => {
    const safeMonth = Math.max(0, Math.min(11, asOfMonth));
    const selectedYearNumber = Number(selectedYear);
    return {
        month: safeMonth,
        label: monthNames[safeMonth],
        cutoffDate: Number.isFinite(selectedYearNumber)
            ? new Date(selectedYearNumber, safeMonth + 1, 0, 23, 59, 59, 999)
            : null as Date | null,
    };
};

const isDueByCutoff = (dateString: string | undefined, cutoff: ReturnType<typeof getSelectedAsOfCutoff>) => {
    if (!dateString) return false;
    if (!cutoff.cutoffDate) {
        const month = getDateMonth(dateString);
        return month >= 0 && month <= cutoff.month;
    }
    const parsed = parseDate(dateString);
    return !!parsed && parsed.getTime() <= cutoff.cutoffDate.getTime();
};

const matchesSelectedYear = (dateString: string | undefined, selectedYear: string) => {
    if (selectedYear === 'All') return true;
    return getDateYear(dateString) === selectedYear;
};

const isTargetRecord = (record: { status?: string; isRealignment?: boolean; isSavings?: boolean }) =>
    record.status !== 'Cancelled' && !record.isRealignment && !record.isSavings;

const isCompletedSubproject = (subproject: Subproject) =>
    subproject.status === 'Completed' && !!subproject.actualCompletionDate;

const isCompletedTraining = (training: Training) =>
    training.status !== 'Cancelled' && !!training.actualDate;

const percent = (actual: number, target: number) => target > 0 ? Math.round((actual / target) * 100) : 0;

const getStatus = (actual: number, target: number, options: { notYetDue?: boolean } = {}) => {
    if (target === 0) {
        if (options.notYetDue) return { label: 'Not Yet Due', tone: 'neutral' };
        return { label: actual > 0 ? 'Recorded' : 'No target', tone: 'neutral' };
    }
    const value = percent(actual, target);
    if (value >= 80) return { label: 'On Track', tone: 'good' };
    if (value >= 50) return { label: 'Needs Attention', tone: 'warning' };
    return { label: 'Critical', tone: 'danger' };
};

const getProvinceForIpo = (ipo?: IPO) => parseLocation(ipo?.location || '').province || 'Unspecified Province';

const sanitizeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Report';

const PhysicalMetricCard: React.FC<{
    metric: Metric;
    viewMode: ViewMode;
    asOfMonth: number;
    cumulativeLabel: string;
    expanded: boolean;
    onToggleExpand: () => void;
    onOpen: () => void;
}> = ({ metric, viewMode, asOfMonth, cumulativeLabel, expanded, onToggleExpand, onOpen }) => {
    const active = viewMode === 'Annual' ? metric.annual : metric.monthly;
    const statusScope = viewMode === 'Annual' ? metric.cumulative : metric.monthly;
    const status = getStatus(statusScope.actual, statusScope.target, {
        notYetDue: viewMode === 'Annual' && metric.annual.target > 0 && statusScope.target === 0,
    });
    return (
        <article
            className={`physical-dashboard-kpi physical-dashboard-kpi--${metric.variant} physical-dashboard-kpi--${status.tone}`}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen();
                }
            }}
        >
            <div className="physical-dashboard-kpi__header">
                <span className="physical-dashboard-kpi__icon" aria-hidden="true">{metric.icon}</span>
                <button
                    type="button"
                    className="physical-dashboard-kpi__expand"
                    aria-label={expanded ? `Collapse ${metric.label} detail` : `Expand ${metric.label} detail`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleExpand();
                    }}
                >
                    <ChevronDown className={expanded ? 'is-open' : ''} aria-hidden="true" />
                </button>
            </div>
            <div className="physical-dashboard-kpi__body">
                <h4>{metric.label}</h4>
                <strong>{active.actual.toLocaleString()} / {active.target.toLocaleString()}</strong>
                <span>{percent(active.actual, active.target)}%</span>
            </div>
            <div className="physical-dashboard-kpi__status">
                <i aria-hidden="true" />
                <span>{status.label}</span>
            </div>
            {expanded && (
                <div className="physical-dashboard-kpi__detail" onClick={event => event.stopPropagation()}>
                    <div>
                        <span>Annual</span>
                        <strong>{metric.annual.actual.toLocaleString()} / {metric.annual.target.toLocaleString()}</strong>
                        <small>{percent(metric.annual.actual, metric.annual.target)}%</small>
                    </div>
                    <div>
                        <span>{monthNames[asOfMonth]}</span>
                        <strong>{metric.monthly.actual.toLocaleString()} / {metric.monthly.target.toLocaleString()}</strong>
                        <small>{percent(metric.monthly.actual, metric.monthly.target)}%</small>
                    </div>
                    <div>
                        <span>Cumulative as of {cumulativeLabel}</span>
                        <strong>{metric.cumulative.actual.toLocaleString()} / {metric.cumulative.target.toLocaleString()}</strong>
                        <small>{getStatus(metric.cumulative.actual, metric.cumulative.target, {
                            notYetDue: metric.annual.target > 0 && metric.cumulative.target === 0,
                        }).label}</small>
                    </div>
                </div>
            )}
        </article>
    );
};

const SectionHeader: React.FC<{
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    meta?: string;
}> = ({ title, actionLabel, onAction, meta }) => (
    <div className="physical-dashboard-section-header">
        <div>
            <h3>{title}</h3>
            {meta && <span>{meta}</span>}
        </div>
        {actionLabel && onAction && (
            <button type="button" className="btn btn-secondary btn-responsive" onClick={onAction}>
                <span className="btn-text">{actionLabel}</span>
                <ChevronRight className="btn-symbol" aria-hidden="true" />
            </button>
        )}
    </div>
);

const ProgressPill: React.FC<{ actual: number; target: number }> = ({ actual, target }) => {
    const value = percent(actual, target);
    return (
        <div className="physical-dashboard-progress">
            <span>{value}%</span>
            <i><b style={{ width: `${Math.min(value, 100)}%` }} /></i>
        </div>
    );
};

const StatusText: React.FC<{ actual: number; target: number }> = ({ actual, target }) => {
    const status = getStatus(actual, target);
    return <span className={`physical-dashboard-status-text physical-dashboard-status-text--${status.tone}`}>{status.label}</span>;
};

const DashboardPagination: React.FC<{
    totalItems: number;
    currentPage: number;
    itemsPerPage: number;
    itemLabel: string;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (size: number) => void;
}> = ({ totalItems, currentPage, itemsPerPage, itemLabel, onPageChange, onItemsPerPageChange }) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const firstItem = totalItems === 0 ? 0 : ((safePage - 1) * itemsPerPage) + 1;
    const lastItem = Math.min(totalItems, safePage * itemsPerPage);

    return (
        <div className="data-table-pagination physical-dashboard-pagination">
            <div className="data-table-pagination__page-size">
                <span>Show</span>
                <select
                    value={itemsPerPage}
                    onChange={event => onItemsPerPageChange(Number(event.target.value))}
                    aria-label={`Rows per page for ${itemLabel}`}
                >
                    {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
                <span className="data-table-pagination__entries-label">per page</span>
            </div>
            <div className="data-table-pagination__status">
                <span className="data-table-pagination__range">
                    Showing {firstItem} to {lastItem} of {totalItems} {itemLabel}
                </span>
                <span className="data-table-pagination__compact-range">
                    {firstItem}-{lastItem} of {totalItems}
                </span>
            </div>
            <div className="data-table-pagination__controls">
                <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
                    Previous
                </button>
                <span>{safePage} / {totalPages}</span>
                <button type="button" onClick={() => onPageChange(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}>
                    Next
                </button>
            </div>
        </div>
    );
};

const PhysicalDashboard: React.FC<PhysicalDashboardProps> = ({
    data,
    selectedYear,
    selectedOu = 'All',
    isAllOuView,
    onSelectIpo,
    onSelectSubproject,
    onSelectActivity,
    setExternalFilters,
    navigateTo,
}) => {
    const currentMonth = new Date().getMonth();
    const [viewMode, setViewMode] = useState<ViewMode>('Annual');
    const [asOfMonth, setAsOfMonth] = useState(currentMonth);
    const [trendIndicator, setTrendIndicator] = useState<TrendIndicatorId>('physicalPercentage');
    const [expandedCards, setExpandedCards] = useState<Set<MetricId>>(new Set());
    const [expandedOus, setExpandedOus] = useState<Set<string>>(new Set());
    const [detailView, setDetailView] = useState<DetailView | null>(null);
    const [detailSearch, setDetailSearch] = useState('');
    const [detailPage, setDetailPage] = useState(1);
    const [detailItemsPerPage, setDetailItemsPerPage] = useState(10);
    const [submissionPage, setSubmissionPage] = useState(1);
    const [submissionItemsPerPage, setSubmissionItemsPerPage] = useState(10);
    const [summaryPage, setSummaryPage] = useState(1);
    const [summaryItemsPerPage, setSummaryItemsPerPage] = useState(10);
    const [summarySort, setSummarySort] = useState<{ key: SummarySortKey; direction: SortDirection } | null>(null);
    const [isPowerPointExporting, setIsPowerPointExporting] = useState(false);
    const [powerPointExportMessage, setPowerPointExportMessage] = useState<string | null>(null);
    const [localModal, setLocalModal] = useState<{
        title: string;
        type: ModalType;
        targets: ModalItemWithOu[];
        accomplishments: ModalItemWithOu[];
    } | null>(null);
    const [modalTab, setModalTab] = useState<'targets' | 'accomplishments'>('accomplishments');

    useEffect(() => {
        setDetailPage(1);
    }, [detailView, detailSearch, detailItemsPerPage]);

    useEffect(() => {
        setSubmissionPage(1);
    }, [submissionItemsPerPage, selectedOu, selectedYear]);

    const regionToOuMap = useMemo(() => {
        const map: Record<string, string> = {};
        Object.entries(ouToRegionMap).forEach(([ou, region]) => {
            map[region] = ou;
        });
        return map;
    }, []);

    const analytics = useMemo(() => {
        const ipoMap = new Map<string, IPO>((data.ipos || []).map(ipo => [ipo.name, ipo]));
        const ipoById = new Map<number, IPO>((data.ipos || []).map(ipo => [Number(ipo.id), ipo]));
        const targetSubprojects = (data.subprojects || []).filter(isTargetRecord);
        const targetTrainings = (data.trainings || []).filter(isTargetRecord);
        const actualSubprojects = (data.subprojects || []).filter(sp =>
            isCompletedSubproject(sp) && matchesSelectedYear(sp.actualCompletionDate, selectedYear)
        );
        const actualTrainings = (data.trainings || []).filter(training =>
            isCompletedTraining(training) && matchesSelectedYear(training.actualDate, selectedYear)
        );
        const cumulativeCutoff = getSelectedAsOfCutoff(selectedYear, asOfMonth);
        const quarterBounds = getQuarterBounds(asOfMonth);

        const monthTargetSubprojects = targetSubprojects.filter(sp => getDateMonth(sp.estimatedCompletionDate) === asOfMonth);
        const monthTargetTrainings = targetTrainings.filter(training => getDateMonth(getActivityTargetDate(training)) === asOfMonth);
        const monthActualSubprojects = actualSubprojects.filter(sp => getDateMonth(sp.actualCompletionDate) === asOfMonth);
        const monthActualTrainings = actualTrainings.filter(training => getDateMonth(training.actualDate) === asOfMonth);
        const quarterTargetSubprojects = targetSubprojects.filter(sp => isDateInMonthRange(sp.estimatedCompletionDate, quarterBounds.start, quarterBounds.end));
        const quarterTargetTrainings = targetTrainings.filter(training => isDateInMonthRange(getActivityTargetDate(training), quarterBounds.start, quarterBounds.end));
        const quarterActualSubprojects = actualSubprojects.filter(sp => isDateInMonthRange(sp.actualCompletionDate, quarterBounds.start, quarterBounds.end));
        const quarterActualTrainings = actualTrainings.filter(training => isDateInMonthRange(training.actualDate, quarterBounds.start, quarterBounds.end));
        const cumulativeTargetSubprojects = targetSubprojects.filter(sp => isDueByCutoff(sp.estimatedCompletionDate, cumulativeCutoff));
        const cumulativeTargetTrainings = targetTrainings.filter(training => isDueByCutoff(getActivityTargetDate(training), cumulativeCutoff));
        const cumulativeActualSubprojects = actualSubprojects.filter(sp => isDueByCutoff(sp.actualCompletionDate, cumulativeCutoff));
        const cumulativeActualTrainings = actualTrainings.filter(training => isDueByCutoff(training.actualDate, cumulativeCutoff));

        const getIpoSetFromSubprojects = (items: Subproject[]): Set<number> =>
            new Set(items.map(sp => getSubprojectIpoId(sp, data.ipos)).filter((id): id is number => !!id).map(Number));
        const getIpoSetFromTrainings = (items: Training[]): Set<number> =>
            new Set(items.flatMap(training => getActivityIpoIds(training, data.ipos)));
        const unionSets = (...sets: Set<number>[]): Set<number> => {
            const merged = new Set<number>();
            sets.forEach(set => set.forEach(value => merged.add(value)));
            return merged;
        };

        const getLinkedTargetsForIpo = (ipoId: number, subprojects: Subproject[], trainings: Training[]) => [
            ...subprojects.filter(sp => Number(getSubprojectIpoId(sp, data.ipos)) === ipoId),
            ...trainings.filter(training => getActivityIpoIds(training, data.ipos).includes(ipoId)),
        ];

        const isLinkedTargetIncomplete = (item: Subproject | Training) => {
            if ('indigenousPeopleOrganization' in item) return !isCompletedSubproject(item);
            return !isCompletedTraining(item);
        };

        const getLinkedTargetDate = (item: Subproject | Training) =>
            'indigenousPeopleOrganization' in item ? item.estimatedCompletionDate : getActivityTargetDate(item);

        const getUnresolvedIpoReferences = (names: Array<string | undefined>) =>
            Array.from(new Set(names.filter((name): name is string => !!name && !ipoMap.has(name))));

        const formatLinkedSource = (item: Subproject | Training) => {
            const sourceType = 'indigenousPeopleOrganization' in item ? 'Subproject' : 'Training';
            return `${sourceType}: ${item.name} (ID: ${item.id}, OU: ${item.operatingUnit || 'Unknown OU'})`;
        };

        const getLinkedSourceOu = (items: Array<Subproject | Training>) => {
            const sourceOus = Array.from(new Set(items.map(item => item.operatingUnit || 'Unknown OU')));
            if (sourceOus.length === 1) return sourceOus[0];
            return sourceOus.length > 1 ? 'Multiple OUs' : 'Unknown OU';
        };

        const areAllLinkedTargetsOverdueAndIncomplete = (items: Array<Subproject | Training>) => {
            const overdueItems = items.filter(item => isMonthTargetOverdue(getLinkedTargetDate(item)));
            return overdueItems.length > 0 && overdueItems.every(isLinkedTargetIncomplete);
        };

        const makeIpoItems = (
            names: Set<number>,
            options: {
                completedNames?: Set<number>;
                targetSubprojects?: Subproject[];
                targetTrainings?: Training[];
            } = {}
        ) => Array.from(names)
            .map(ipoId => {
                const ipo = ipoById.get(ipoId);
                const linkedTargets = getLinkedTargetsForIpo(
                    ipoId,
                    options.targetSubprojects || [],
                    options.targetTrainings || []
                );
                const isCompleted = options.completedNames?.has(ipoId) || false;
                if (!ipo) {
                    return {
                        id: `unresolved-ipo:${ipoId}`,
                        name: `Unresolved IPO ID: ${ipoId}`,
                        details: linkedTargets.length > 0
                            ? `Linked records: ${linkedTargets.map(formatLinkedSource).join('; ')}`
                            : 'No linked source record was found in this view.',
                        operatingUnit: getLinkedSourceOu(linkedTargets),
                        isCompleted,
                        isOverdue: !isCompleted && areAllLinkedTargetsOverdueAndIncomplete(linkedTargets),
                        isUnresolved: true,
                        isUnresolvedPlaceholder: true,
                        unresolvedIpoReferences: [String(ipoId)],
                    };
                }
                return {
                    id: ipo.id,
                    name: ipo.name,
                    details: ipo.location,
                    operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU',
                    isCompleted,
                    isOverdue: !isCompleted && areAllLinkedTargetsOverdueAndIncomplete(linkedTargets),
                };
            })
            .sort((a, b) => compareOuThenName(a.operatingUnit, b.operatingUnit, a.name, b.name));

        const makeSubprojectItems = (items: Subproject[], completedIds?: Set<number>) => items
            .map(sp => {
                const isCompleted = completedIds?.has(sp.id) ?? isCompletedSubproject(sp);
                const unresolvedIpoReferences = getUnresolvedIpoReferences([sp.indigenousPeopleOrganization]);
                const unresolvedDetails = unresolvedIpoReferences.length > 0
                    ? ` | Unresolved IPO reference: ${unresolvedIpoReferences.join(', ')}`
                    : '';
                return {
                    id: sp.id,
                    name: sp.name,
                    details: `${sp.indigenousPeopleOrganization} | Target: ${formatDate(sp.estimatedCompletionDate)} | Completed: ${formatDate(sp.actualCompletionDate)}${unresolvedDetails}`,
                    operatingUnit: sp.operatingUnit,
                    targetDate: sp.estimatedCompletionDate,
                    actualDate: sp.actualCompletionDate,
                    isCompleted,
                    isOverdue: !isCompleted && isMonthTargetOverdue(sp.estimatedCompletionDate),
                    isUnresolved: unresolvedIpoReferences.length > 0,
                    unresolvedIpoReferences,
                };
            })
            .sort((a, b) => compareOuThenName(a.operatingUnit, b.operatingUnit, a.name, b.name));

        const makeTrainingItems = (items: Training[], completedIds?: Set<number>) => items
            .map(training => {
                const targetDate = getActivityTargetDate(training);
                const isCompleted = completedIds?.has(training.id) ?? isCompletedTraining(training);
                const unresolvedIpoReferences = getUnresolvedIpoReferences(training.participatingIpos || []);
                const unresolvedDetails = unresolvedIpoReferences.length > 0
                    ? ` | Unresolved IPO reference${unresolvedIpoReferences.length > 1 ? 's' : ''}: ${unresolvedIpoReferences.join(', ')}`
                    : '';
                return {
                    id: training.id,
                    name: getActivityDisplayTitle(training),
                    details: `${training.component} | Target: ${formatDate(targetDate)} | Conducted: ${formatDate(training.actualDate)}${unresolvedDetails}`,
                    operatingUnit: training.operatingUnit,
                    targetDate,
                    actualDate: training.actualDate,
                    isCompleted,
                    isOverdue: !isCompleted && isMonthTargetOverdue(targetDate),
                    isUnresolved: unresolvedIpoReferences.length > 0,
                    unresolvedIpoReferences,
                };
            })
            .sort((a, b) => compareOuThenName(a.operatingUnit, b.operatingUnit, a.name, b.name));

        const makeAdScope = (
            ipoNames: Set<number>,
            options: {
                completedIpoNames?: Set<number>;
                targetSubprojects?: Subproject[];
                targetTrainings?: Training[];
            } = {}
        ) => {
            const completedAdNos = new Set<string>();
            options.completedIpoNames?.forEach(ipoId => {
                const ipo = ipoById.get(ipoId);
                if (ipo?.ancestralDomainNo) completedAdNos.add(ipo.ancestralDomainNo);
            });
            const adMap = new Map<string, { ipoNames: string[]; ou: string; linkedTargets: Array<Subproject | Training> }>();
            ipoNames.forEach(ipoId => {
                const ipo = ipoById.get(ipoId);
                if (!ipo?.ancestralDomainNo) return;
                if (!adMap.has(ipo.ancestralDomainNo)) {
                    adMap.set(ipo.ancestralDomainNo, {
                        ipoNames: [],
                        ou: regionToOuMap[ipo.region] || 'Unknown OU',
                        linkedTargets: [],
                    });
                }
                const adItem = adMap.get(ipo.ancestralDomainNo)!;
                adItem.ipoNames.push(ipo.name);
                adItem.linkedTargets.push(...getLinkedTargetsForIpo(
                    ipoId,
                    options.targetSubprojects || [],
                    options.targetTrainings || []
                ));
            });
            return Array.from(adMap.entries())
                .map(([adNo, item]) => {
                    const isCompleted = completedAdNos.has(adNo);
                    return {
                        id: adNo,
                        name: `AD No: ${adNo}`,
                        details: item.ipoNames.join(', '),
                        operatingUnit: item.ou,
                        isCompleted,
                        isOverdue: !isCompleted && areAllLinkedTargetsOverdueAndIncomplete(item.linkedTargets),
                    };
                })
                .sort((a, b) => compareOuThenName(a.operatingUnit, b.operatingUnit, a.name, b.name));
        };

        const makeMetricScope = (
            target: number,
            actual: number,
            targets: ModalItemWithOu[],
            accomplishments: ModalItemWithOu[]
        ): MetricScope => ({ target, actual, targets, accomplishments });

        const annualTargetIposWithSp = getIpoSetFromSubprojects(targetSubprojects);
        const annualActualIposWithSp = getIpoSetFromSubprojects(actualSubprojects);
        const annualTargetIposTrained = getIpoSetFromTrainings(targetTrainings);
        const annualActualIposTrained = getIpoSetFromTrainings(actualTrainings);
        const annualTargetIpos = unionSets(annualTargetIposWithSp, annualTargetIposTrained);
        const annualActualIpos = unionSets(annualActualIposWithSp, annualActualIposTrained);

        const cumulativeTargetIposWithSp = getIpoSetFromSubprojects(cumulativeTargetSubprojects);
        const cumulativeActualIposWithSp = getIpoSetFromSubprojects(cumulativeActualSubprojects);
        const cumulativeTargetIposTrained = getIpoSetFromTrainings(cumulativeTargetTrainings);
        const cumulativeActualIposTrained = getIpoSetFromTrainings(cumulativeActualTrainings);
        const cumulativeTargetIpos = unionSets(cumulativeTargetIposWithSp, cumulativeTargetIposTrained);
        const cumulativeActualIpos = unionSets(cumulativeActualIposWithSp, cumulativeActualIposTrained);

        const monthlyTargetIposWithSp = getIpoSetFromSubprojects(monthTargetSubprojects);
        const monthlyActualIposWithSp = getIpoSetFromSubprojects(monthActualSubprojects);
        const monthlyTargetIposTrained = getIpoSetFromTrainings(monthTargetTrainings);
        const monthlyActualIposTrained = getIpoSetFromTrainings(monthActualTrainings);
        const monthlyTargetIpos = unionSets(monthlyTargetIposWithSp, monthlyTargetIposTrained);
        const monthlyActualIpos = unionSets(monthlyActualIposWithSp, monthlyActualIposTrained);

        const quarterlyTargetIposWithSp = getIpoSetFromSubprojects(quarterTargetSubprojects);
        const quarterlyActualIposWithSp = getIpoSetFromSubprojects(quarterActualSubprojects);
        const quarterlyTargetIposTrained = getIpoSetFromTrainings(quarterTargetTrainings);
        const quarterlyActualIposTrained = getIpoSetFromTrainings(quarterActualTrainings);
        const quarterlyTargetIpos = unionSets(quarterlyTargetIposWithSp, quarterlyTargetIposTrained);
        const quarterlyActualIpos = unionSets(quarterlyActualIposWithSp, quarterlyActualIposTrained);

        const annualActualSubprojectIds = new Set<number>(actualSubprojects.map(sp => sp.id));
        const monthlyActualSubprojectIds = new Set<number>(monthActualSubprojects.map(sp => sp.id));
        const quarterlyActualSubprojectIds = new Set<number>(quarterActualSubprojects.map(sp => sp.id));
        const cumulativeActualSubprojectIds = new Set<number>(cumulativeActualSubprojects.map(sp => sp.id));
        const annualActualTrainingIds = new Set<number>(actualTrainings.map(training => training.id));
        const monthlyActualTrainingIds = new Set<number>(monthActualTrainings.map(training => training.id));
        const quarterlyActualTrainingIds = new Set<number>(quarterActualTrainings.map(training => training.id));
        const cumulativeActualTrainingIds = new Set<number>(cumulativeActualTrainings.map(training => training.id));

        const metrics: Metric[] = [
            {
                id: 'ipos',
                label: 'IPOs Assisted',
                variant: 'teal',
                modalType: 'ipos',
                icon: <Users />,
                annual: makeMetricScope(
                    annualTargetIpos.size,
                    annualActualIpos.size,
                    makeIpoItems(annualTargetIpos, { completedNames: annualActualIpos, targetSubprojects, targetTrainings }),
                    makeIpoItems(annualActualIpos, { targetSubprojects: actualSubprojects, targetTrainings: actualTrainings })
                ),
                monthly: makeMetricScope(
                    monthlyTargetIpos.size,
                    monthlyActualIpos.size,
                    makeIpoItems(monthlyTargetIpos, { completedNames: monthlyActualIpos, targetSubprojects: monthTargetSubprojects, targetTrainings: monthTargetTrainings }),
                    makeIpoItems(monthlyActualIpos, { targetSubprojects: monthActualSubprojects, targetTrainings: monthActualTrainings })
                ),
                quarterly: makeMetricScope(
                    quarterlyTargetIpos.size,
                    quarterlyActualIpos.size,
                    makeIpoItems(quarterlyTargetIpos, { completedNames: quarterlyActualIpos, targetSubprojects: quarterTargetSubprojects, targetTrainings: quarterTargetTrainings }),
                    makeIpoItems(quarterlyActualIpos, { targetSubprojects: quarterActualSubprojects, targetTrainings: quarterActualTrainings })
                ),
                cumulative: makeMetricScope(
                    cumulativeTargetIpos.size,
                    cumulativeActualIpos.size,
                    makeIpoItems(cumulativeTargetIpos, { completedNames: cumulativeActualIpos, targetSubprojects: cumulativeTargetSubprojects, targetTrainings: cumulativeTargetTrainings }),
                    makeIpoItems(cumulativeActualIpos, { targetSubprojects: cumulativeActualSubprojects, targetTrainings: cumulativeActualTrainings })
                ),
            },
            {
                id: 'subprojects',
                label: 'Subprojects',
                variant: 'orange',
                modalType: 'subprojects',
                icon: <Briefcase />,
                annual: makeMetricScope(targetSubprojects.length, actualSubprojects.length, makeSubprojectItems(targetSubprojects, annualActualSubprojectIds), makeSubprojectItems(actualSubprojects)),
                monthly: makeMetricScope(monthTargetSubprojects.length, monthActualSubprojects.length, makeSubprojectItems(monthTargetSubprojects, monthlyActualSubprojectIds), makeSubprojectItems(monthActualSubprojects)),
                quarterly: makeMetricScope(quarterTargetSubprojects.length, quarterActualSubprojects.length, makeSubprojectItems(quarterTargetSubprojects, quarterlyActualSubprojectIds), makeSubprojectItems(quarterActualSubprojects)),
                cumulative: makeMetricScope(cumulativeTargetSubprojects.length, cumulativeActualSubprojects.length, makeSubprojectItems(cumulativeTargetSubprojects, cumulativeActualSubprojectIds), makeSubprojectItems(cumulativeActualSubprojects)),
            },
            {
                id: 'iposWithSubprojects',
                label: 'IPOs with Subprojects',
                variant: 'blue',
                modalType: 'ipos',
                icon: <Building2 />,
                annual: makeMetricScope(
                    annualTargetIposWithSp.size,
                    annualActualIposWithSp.size,
                    makeIpoItems(annualTargetIposWithSp, { completedNames: annualActualIposWithSp, targetSubprojects }),
                    makeIpoItems(annualActualIposWithSp, { targetSubprojects: actualSubprojects })
                ),
                monthly: makeMetricScope(
                    monthlyTargetIposWithSp.size,
                    monthlyActualIposWithSp.size,
                    makeIpoItems(monthlyTargetIposWithSp, { completedNames: monthlyActualIposWithSp, targetSubprojects: monthTargetSubprojects }),
                    makeIpoItems(monthlyActualIposWithSp, { targetSubprojects: monthActualSubprojects })
                ),
                quarterly: makeMetricScope(
                    quarterlyTargetIposWithSp.size,
                    quarterlyActualIposWithSp.size,
                    makeIpoItems(quarterlyTargetIposWithSp, { completedNames: quarterlyActualIposWithSp, targetSubprojects: quarterTargetSubprojects }),
                    makeIpoItems(quarterlyActualIposWithSp, { targetSubprojects: quarterActualSubprojects })
                ),
                cumulative: makeMetricScope(
                    cumulativeTargetIposWithSp.size,
                    cumulativeActualIposWithSp.size,
                    makeIpoItems(cumulativeTargetIposWithSp, { completedNames: cumulativeActualIposWithSp, targetSubprojects: cumulativeTargetSubprojects }),
                    makeIpoItems(cumulativeActualIposWithSp, { targetSubprojects: cumulativeActualSubprojects })
                ),
            },
            {
                id: 'trainings',
                label: 'Trainings Conducted',
                variant: 'violet',
                modalType: 'trainings',
                icon: <BookOpen />,
                annual: makeMetricScope(targetTrainings.length, actualTrainings.length, makeTrainingItems(targetTrainings, annualActualTrainingIds), makeTrainingItems(actualTrainings)),
                monthly: makeMetricScope(monthTargetTrainings.length, monthActualTrainings.length, makeTrainingItems(monthTargetTrainings, monthlyActualTrainingIds), makeTrainingItems(monthActualTrainings)),
                quarterly: makeMetricScope(quarterTargetTrainings.length, quarterActualTrainings.length, makeTrainingItems(quarterTargetTrainings, quarterlyActualTrainingIds), makeTrainingItems(quarterActualTrainings)),
                cumulative: makeMetricScope(cumulativeTargetTrainings.length, cumulativeActualTrainings.length, makeTrainingItems(cumulativeTargetTrainings, cumulativeActualTrainingIds), makeTrainingItems(cumulativeActualTrainings)),
            },
            {
                id: 'iposTrained',
                label: 'IPOs with Trainings',
                variant: 'cyan',
                modalType: 'ipos',
                icon: <GraduationCap />,
                annual: makeMetricScope(
                    annualTargetIposTrained.size,
                    annualActualIposTrained.size,
                    makeIpoItems(annualTargetIposTrained, { completedNames: annualActualIposTrained, targetTrainings }),
                    makeIpoItems(annualActualIposTrained, { targetTrainings: actualTrainings })
                ),
                monthly: makeMetricScope(
                    monthlyTargetIposTrained.size,
                    monthlyActualIposTrained.size,
                    makeIpoItems(monthlyTargetIposTrained, { completedNames: monthlyActualIposTrained, targetTrainings: monthTargetTrainings }),
                    makeIpoItems(monthlyActualIposTrained, { targetTrainings: monthActualTrainings })
                ),
                quarterly: makeMetricScope(
                    quarterlyTargetIposTrained.size,
                    quarterlyActualIposTrained.size,
                    makeIpoItems(quarterlyTargetIposTrained, { completedNames: quarterlyActualIposTrained, targetTrainings: quarterTargetTrainings }),
                    makeIpoItems(quarterlyActualIposTrained, { targetTrainings: quarterActualTrainings })
                ),
                cumulative: makeMetricScope(
                    cumulativeTargetIposTrained.size,
                    cumulativeActualIposTrained.size,
                    makeIpoItems(cumulativeTargetIposTrained, { completedNames: cumulativeActualIposTrained, targetTrainings: cumulativeTargetTrainings }),
                    makeIpoItems(cumulativeActualIposTrained, { targetTrainings: cumulativeActualTrainings })
                ),
            },
            {
                id: 'ads',
                label: 'Ancestral Domains Assisted',
                variant: 'green',
                modalType: 'ads',
                icon: <Landmark />,
                annual: makeMetricScope(
                    makeAdScope(annualTargetIpos).length,
                    makeAdScope(annualActualIpos).length,
                    makeAdScope(annualTargetIpos, { completedIpoNames: annualActualIpos, targetSubprojects, targetTrainings }),
                    makeAdScope(annualActualIpos)
                ),
                monthly: makeMetricScope(
                    makeAdScope(monthlyTargetIpos).length,
                    makeAdScope(monthlyActualIpos).length,
                    makeAdScope(monthlyTargetIpos, { completedIpoNames: monthlyActualIpos, targetSubprojects: monthTargetSubprojects, targetTrainings: monthTargetTrainings }),
                    makeAdScope(monthlyActualIpos)
                ),
                quarterly: makeMetricScope(
                    makeAdScope(quarterlyTargetIpos).length,
                    makeAdScope(quarterlyActualIpos).length,
                    makeAdScope(quarterlyTargetIpos, { completedIpoNames: quarterlyActualIpos, targetSubprojects: quarterTargetSubprojects, targetTrainings: quarterTargetTrainings }),
                    makeAdScope(quarterlyActualIpos)
                ),
                cumulative: makeMetricScope(
                    makeAdScope(cumulativeTargetIpos).length,
                    makeAdScope(cumulativeActualIpos).length,
                    makeAdScope(cumulativeTargetIpos, { completedIpoNames: cumulativeActualIpos, targetSubprojects: cumulativeTargetSubprojects, targetTrainings: cumulativeTargetTrainings }),
                    makeAdScope(cumulativeActualIpos)
                ),
            },
        ];

        const monthSeries = monthNames.map((month, index) => {
            const monthTargets = [
                targetSubprojects.filter(sp => getDateMonth(sp.estimatedCompletionDate) === index).length,
                targetTrainings.filter(training => getDateMonth(getActivityTargetDate(training)) === index).length,
            ].reduce((sum, value) => sum + value, 0);
            const monthActuals = [
                actualSubprojects.filter(sp => getDateMonth(sp.actualCompletionDate) === index).length,
                actualTrainings.filter(training => getDateMonth(training.actualDate) === index).length,
            ].reduce((sum, value) => sum + value, 0);
            return { month, monthShort: shortMonthNames[index], target: monthTargets, actual: monthActuals };
        });

        const cumulativeTrendSeries = monthNames.map((month, index) => {
            const targetSubprojectsToMonth = targetSubprojects.filter(sp => {
                const monthIndex = getDateMonth(sp.estimatedCompletionDate);
                return monthIndex >= 0 && monthIndex <= index;
            });
            const targetTrainingsToMonth = targetTrainings.filter(training => {
                const monthIndex = getDateMonth(getActivityTargetDate(training));
                return monthIndex >= 0 && monthIndex <= index;
            });
            const actualSubprojectsToMonth = actualSubprojects.filter(sp => {
                const monthIndex = getDateMonth(sp.actualCompletionDate);
                return monthIndex >= 0 && monthIndex <= index;
            });
            const actualTrainingsToMonth = actualTrainings.filter(training => {
                const monthIndex = getDateMonth(training.actualDate);
                return monthIndex >= 0 && monthIndex <= index;
            });

            const targetIposToMonth = unionSets(
                getIpoSetFromSubprojects(targetSubprojectsToMonth),
                getIpoSetFromTrainings(targetTrainingsToMonth)
            );
            const actualIposToMonth = unionSets(
                getIpoSetFromSubprojects(actualSubprojectsToMonth),
                getIpoSetFromTrainings(actualTrainingsToMonth)
            );
            const targetAdCount = makeAdScope(targetIposToMonth).length;
            const actualAdCount = makeAdScope(actualIposToMonth).length;
            const physicalTargetCount = targetSubprojectsToMonth.length + targetTrainingsToMonth.length;
            const physicalActualCount = actualSubprojectsToMonth.length + actualTrainingsToMonth.length;
            const physicalRate = percent(physicalActualCount, physicalTargetCount);

            return {
                month,
                monthShort: shortMonthNames[index],
                physicalPercentage: {
                    month,
                    monthShort: shortMonthNames[index],
                    target: physicalTargetCount > 0 ? 100 : 0,
                    actual: physicalRate,
                    rate: physicalRate,
                },
                ipos: {
                    month,
                    monthShort: shortMonthNames[index],
                    target: targetIposToMonth.size,
                    actual: actualIposToMonth.size,
                    rate: percent(actualIposToMonth.size, targetIposToMonth.size),
                },
                subprojects: {
                    month,
                    monthShort: shortMonthNames[index],
                    target: targetSubprojectsToMonth.length,
                    actual: actualSubprojectsToMonth.length,
                    rate: percent(actualSubprojectsToMonth.length, targetSubprojectsToMonth.length),
                },
                trainings: {
                    month,
                    monthShort: shortMonthNames[index],
                    target: targetTrainingsToMonth.length,
                    actual: actualTrainingsToMonth.length,
                    rate: percent(actualTrainingsToMonth.length, targetTrainingsToMonth.length),
                },
                ads: {
                    month,
                    monthShort: shortMonthNames[index],
                    target: targetAdCount,
                    actual: actualAdCount,
                    rate: percent(actualAdCount, targetAdCount),
                },
            };
        });

        type MutableProvince = {
            ou: string;
            province: string;
            targetIpos: Set<number>;
            actualIpos: Set<number>;
            targetSubprojects: Set<number>;
            actualSubprojects: Set<number>;
            targetTrainings: Set<number>;
            actualTrainings: Set<number>;
        };

        const provinceMap = new Map<string, MutableProvince>();
        const ouMap = new Map<string, MutableProvince>();
        const ensureOu = (ou: string) => {
            const normalizedOu = ou || 'Unknown OU';
            if (!ouMap.has(normalizedOu)) {
                ouMap.set(normalizedOu, {
                    ou: normalizedOu,
                    province: 'All Provinces',
                    targetIpos: new Set(),
                    actualIpos: new Set(),
                    targetSubprojects: new Set(),
                    actualSubprojects: new Set(),
                    targetTrainings: new Set(),
                    actualTrainings: new Set(),
                });
            }
            return ouMap.get(normalizedOu)!;
        };
        operatingUnits.forEach(ou => ensureOu(ou));

        const ensureProvince = (ou: string, province: string) => {
            const key = `${ou || 'Unknown OU'}|${province || 'Unspecified Province'}`;
            if (!provinceMap.has(key)) {
                provinceMap.set(key, {
                    ou: ou || 'Unknown OU',
                    province: province || 'Unspecified Province',
                    targetIpos: new Set(),
                    actualIpos: new Set(),
                    targetSubprojects: new Set(),
                    actualSubprojects: new Set(),
                    targetTrainings: new Set(),
                    actualTrainings: new Set(),
                });
            }
            return provinceMap.get(key)!;
        };

        targetSubprojects.forEach(sp => {
            const ipoId = getSubprojectIpoId(sp, data.ipos);
            const ipo = ipoId ? ipoById.get(Number(ipoId)) : undefined;
            const row = ensureProvince(sp.operatingUnit, getProvinceForIpo(ipo));
            row.targetSubprojects.add(sp.id);
            if (ipoId) row.targetIpos.add(Number(ipoId));

            const ouRow = ensureOu(sp.operatingUnit);
            ouRow.targetSubprojects.add(sp.id);
            if (ipoId) ouRow.targetIpos.add(Number(ipoId));
        });
        actualSubprojects.forEach(sp => {
            const ipoId = getSubprojectIpoId(sp, data.ipos);
            const ipo = ipoId ? ipoById.get(Number(ipoId)) : undefined;
            const row = ensureProvince(sp.operatingUnit, getProvinceForIpo(ipo));
            row.actualSubprojects.add(sp.id);
            if (ipoId) row.actualIpos.add(Number(ipoId));

            const ouRow = ensureOu(sp.operatingUnit);
            ouRow.actualSubprojects.add(sp.id);
            if (ipoId) ouRow.actualIpos.add(Number(ipoId));
        });
        targetTrainings.forEach(training => {
            const ouRow = ensureOu(training.operatingUnit);
            ouRow.targetTrainings.add(training.id);
            getActivityIpoIds(training, data.ipos).forEach(ipoId => {
                const ipo = ipoById.get(ipoId);
                const row = ensureProvince(training.operatingUnit, getProvinceForIpo(ipo));
                row.targetTrainings.add(training.id);
                row.targetIpos.add(ipoId);
                ouRow.targetIpos.add(ipoId);
            });
        });
        actualTrainings.forEach(training => {
            const ouRow = ensureOu(training.operatingUnit);
            ouRow.actualTrainings.add(training.id);
            getActivityIpoIds(training, data.ipos).forEach(ipoId => {
                const ipo = ipoById.get(ipoId);
                const row = ensureProvince(training.operatingUnit, getProvinceForIpo(ipo));
                row.actualTrainings.add(training.id);
                row.actualIpos.add(ipoId);
                ouRow.actualIpos.add(ipoId);
            });
        });

        const provinceRows: ProvincePerformance[] = Array.from(provinceMap.entries())
            .map(([key, row]) => {
                const targetTotal = row.targetIpos.size + row.targetSubprojects.size + row.targetTrainings.size;
                const actualTotal = row.actualIpos.size + row.actualSubprojects.size + row.actualTrainings.size;
                return {
                    key,
                    ou: row.ou,
                    province: row.province,
                    targetIpos: row.targetIpos.size,
                    actualIpos: row.actualIpos.size,
                    targetSubprojects: row.targetSubprojects.size,
                    actualSubprojects: row.actualSubprojects.size,
                    targetTrainings: row.targetTrainings.size,
                    actualTrainings: row.actualTrainings.size,
                    rate: percent(actualTotal, targetTotal),
                };
            })
            .sort((a, b) => getOuSortIndex(a.ou) - getOuSortIndex(b.ou) || b.rate - a.rate || a.province.localeCompare(b.province));

        const ouRows: ProvincePerformance[] = Array.from(ouMap.entries())
            .map(([key, row]) => {
                const targetTotal = row.targetIpos.size + row.targetSubprojects.size + row.targetTrainings.size;
                const actualTotal = row.actualIpos.size + row.actualSubprojects.size + row.actualTrainings.size;
                return {
                    key,
                    ou: row.ou,
                    province: row.province,
                    targetIpos: row.targetIpos.size,
                    actualIpos: row.actualIpos.size,
                    targetSubprojects: row.targetSubprojects.size,
                    actualSubprojects: row.actualSubprojects.size,
                    targetTrainings: row.targetTrainings.size,
                    actualTrainings: row.actualTrainings.size,
                    rate: percent(actualTotal, targetTotal),
                };
            })
            .sort((a, b) => getOuSortIndex(a.ou) - getOuSortIndex(b.ou) || a.ou.localeCompare(b.ou));

        const alerts = [
            ...provinceRows
                .filter(row => row.rate < 50 && (row.targetIpos + row.targetSubprojects + row.targetTrainings) > 0)
                .slice(0, 4)
                .map(row => ({
                    title: `${row.province} is below 50% overall accomplishment.`,
                    details: `${row.ou} | ${row.rate}% accomplishment rate`,
                    tone: 'danger',
            })),
            ...metrics
                .filter(metric => metric.cumulative.target > 0 && percent(metric.cumulative.actual, metric.cumulative.target) < 50)
                .slice(0, 2)
                .map(metric => ({
                    title: `${metric.label} needs attention.`,
                    details: `${metric.cumulative.actual.toLocaleString()} of ${metric.cumulative.target.toLocaleString()} targets due by ${cumulativeCutoff.label} accomplished`,
                    tone: 'warning',
                })),
        ];

        const getSubmissionEditTimestamp = (item: { physical_accomplishment_submitted_at?: string | null; updated_at?: string }, completionDate?: string) => {
            if (!completionDate) return '';
            return item.physical_accomplishment_submitted_at || item.updated_at || '';
        };

        const activitySubmissions: RecentSubmission[] = [...(data.trainings || []), ...(data.otherActivities || [])]
            .filter(activity => activity.status !== 'Cancelled' && !!activity.actualDate)
            .map(activity => ({
                id: `activity-${activity.id}`,
                name: getActivityDisplayTitle(activity),
                type: activity.type === 'Training' ? 'Training' : 'Activity',
                component: activity.component || 'Activity',
                operatingUnit: activity.operatingUnit || 'Unknown OU',
                editedAt: getSubmissionEditTimestamp(activity, activity.actualDate),
                completionDate: activity.actualDate || '',
            }));

        const submissions: RecentSubmission[] = [
            ...actualSubprojects.map(sp => ({
                id: `subproject-${sp.id}`,
                name: sp.name,
                type: 'Subproject',
                component: sp.packageType || 'Subproject',
                operatingUnit: sp.operatingUnit || 'Unknown OU',
                editedAt: getSubmissionEditTimestamp(sp, sp.actualCompletionDate),
                completionDate: sp.actualCompletionDate || '',
            })),
            ...activitySubmissions,
            ...(data.staffingReqs || [])
                .filter(staff => staff.hiringStatus !== 'Unfilled' && !!(staff.actualDate || staff.actualObligationDate))
                .map(staff => {
                    const completionDate = staff.actualDate || staff.actualObligationDate || '';
                    return {
                        id: `staffing-${staff.id}`,
                        name: staff.personnelPosition,
                        type: 'Staff Requirement',
                        component: staff.component || 'Program Management / Staffing',
                        operatingUnit: staff.operatingUnit || 'Unknown OU',
                        editedAt: getSubmissionEditTimestamp(staff, completionDate),
                        completionDate,
                    };
                }),
            ...(data.officeReqs || [])
                .filter(office => office.status !== 'Cancelled' && !!(office.actualDate || office.actualObligationDate))
                .map(office => {
                    const completionDate = office.actualDate || office.actualObligationDate || '';
                    return {
                        id: `office-${office.id}`,
                        name: office.equipment,
                        type: 'Office Requirement',
                        component: 'Program Management / Office Requirement',
                        operatingUnit: office.operatingUnit || 'Unknown OU',
                        editedAt: getSubmissionEditTimestamp(office, completionDate),
                        completionDate,
                    };
                }),
        ].filter(item => item.editedAt && item.completionDate)
            .sort((a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime());

        return {
            metrics,
            metricMap: new Map(metrics.map(metric => [metric.id, metric])),
            cumulativeCutoff,
            monthSeries,
            cumulativeTrendSeries,
            provinceRows,
            ouRows,
            alerts,
            submissions,
        };
    }, [asOfMonth, data.ipos, data.officeReqs, data.otherActivities, data.staffingReqs, data.subprojects, data.trainings, regionToOuMap, selectedYear]);

    const activeScope = (metric: Metric) => viewMode === 'Annual' ? metric.annual : metric.monthly;
    const statusScope = (metric: Metric) => viewMode === 'Annual' ? metric.cumulative : metric.monthly;
    const metricStatus = (metric: Metric) => {
        const scope = statusScope(metric);
        return getStatus(scope.actual, scope.target, {
            notYetDue: viewMode === 'Annual' && metric.annual.target > 0 && scope.target === 0,
        });
    };
    const allOuMode = isAllOuView ?? selectedOu === 'All';

    useEffect(() => {
        setSummaryPage(1);
    }, [allOuMode, summaryItemsPerPage, summarySort, selectedOu, selectedYear]);

    const getSummaryActualTotal = (row: ProvincePerformance) => row.actualIpos + row.actualSubprojects + row.actualTrainings;
    const getSummaryTargetTotal = (row: ProvincePerformance) => row.targetIpos + row.targetSubprojects + row.targetTrainings;
    const getSummaryStatusLabel = (row: ProvincePerformance) => getStatus(getSummaryActualTotal(row), getSummaryTargetTotal(row)).label;
    const summaryBaseRows = allOuMode ? analytics.ouRows : analytics.provinceRows;
    const sortedSummaryRows = useMemo(() => {
        if (!summarySort) return summaryBaseRows;
        const directionMultiplier = summarySort.direction === 'asc' ? 1 : -1;
        const compareMetric = (
            aActual: number,
            aTarget: number,
            bActual: number,
            bTarget: number
        ) => (aActual - bActual) || (aTarget - bTarget);

        return [...summaryBaseRows].sort((a, b) => {
            let comparison = 0;
            if (summarySort.key === 'name') {
                comparison = allOuMode
                    ? compareOuThenName(a.ou, b.ou)
                    : a.province.localeCompare(b.province) || compareOuThenName(a.ou, b.ou);
            } else if (summarySort.key === 'ipos') {
                comparison = compareMetric(a.actualIpos, a.targetIpos, b.actualIpos, b.targetIpos);
            } else if (summarySort.key === 'subprojects') {
                comparison = compareMetric(a.actualSubprojects, a.targetSubprojects, b.actualSubprojects, b.targetSubprojects);
            } else if (summarySort.key === 'trainings') {
                comparison = compareMetric(a.actualTrainings, a.targetTrainings, b.actualTrainings, b.targetTrainings);
            } else if (summarySort.key === 'rate') {
                comparison = a.rate - b.rate;
            } else if (summarySort.key === 'status') {
                comparison = getSummaryStatusLabel(a).localeCompare(getSummaryStatusLabel(b));
            }
            return (comparison * directionMultiplier) || compareOuThenName(a.ou, b.ou, a.province, b.province);
        });
    }, [allOuMode, summaryBaseRows, summarySort]);
    const summaryTotalPages = Math.max(1, Math.ceil(sortedSummaryRows.length / summaryItemsPerPage));
    const safeSummaryPage = Math.min(summaryPage, summaryTotalPages);
    const paginatedSummaryRows = sortedSummaryRows.slice(
        (safeSummaryPage - 1) * summaryItemsPerPage,
        safeSummaryPage * summaryItemsPerPage
    );
    const toggleSummarySort = (key: SummarySortKey) => {
        setSummarySort(prev => {
            if (!prev || prev.key !== key) {
                return {
                    key,
                    direction: key === 'name' || key === 'status' ? 'asc' : 'desc',
                };
            }
            return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        });
    };
    const renderSummarySortHeader = (key: SummarySortKey, label: string) => {
        const isActive = summarySort?.key === key;
        return (
            <button
                type="button"
                className={`physical-dashboard-sort-button ${isActive ? 'is-active' : ''}`}
                onClick={() => toggleSummarySort(key)}
                aria-label={`Sort by ${label}`}
            >
                <span>{label}</span>
                <small aria-hidden="true">{isActive ? (summarySort.direction === 'asc' ? 'Asc' : 'Desc') : 'Sort'}</small>
            </button>
        );
    };

    const openMetricModal = (metric: Metric) => {
        const scope = activeScope(metric);
        setLocalModal({
            title: `${metric.label} ${viewMode === 'Monthly' ? `- ${monthNames[asOfMonth]}` : ''}`,
            type: metric.modalType,
            targets: scope.targets,
            accomplishments: scope.accomplishments,
        });
        setModalTab('accomplishments');
    };

    const handleDownloadModalExcel = () => {
        if (!localModal) return;
        const wb = XLSX.utils.book_new();
        const toRows = (items: ModalItemWithOu[]) => items.map(item => ({
            OU: item.operatingUnit || '',
            Name: item.name,
            Details: item.details || '',
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(localModal.targets)), 'Targets');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(localModal.accomplishments)), 'Accomplishments');
        XLSX.writeFile(wb, `${localModal.title.replace(/\s+/g, '_')}.xlsx`);
    };

    const handleItemClick = (item: ModalItemWithOu) => {
        if (item.isUnresolvedPlaceholder) return;
        if (localModal?.type === 'ipos') {
            const ipo = (data.ipos || []).find(i => i.id === item.id);
            if (ipo && onSelectIpo) onSelectIpo(ipo);
        } else if (localModal?.type === 'subprojects') {
            const sp = (data.subprojects || []).find(p => p.id === item.id);
            if (sp && onSelectSubproject) onSelectSubproject(sp);
        } else if (localModal?.type === 'trainings') {
            const training = (data.trainings || []).find(t => t.id === item.id);
            if (training && onSelectActivity) onSelectActivity(training);
        } else if (localModal?.type === 'ads' && setExternalFilters && navigateTo) {
            setExternalFilters({ search: item.id as string });
            navigateTo('/ipo');
        }
    };

    const openDetailView = (view: DetailView) => {
        setDetailView(view);
        setDetailSearch('');
    };

    const activeTrendRows = analytics.cumulativeTrendSeries.map(row => row[trendIndicator]) as CumulativeTrendRow[];
    const activeTrendLabel = trendIndicatorOptions.find(option => option.id === trendIndicator)?.label || 'Physical Percentage';
    const hasPhysicalExportData = useMemo(() => (
        analytics.metrics.some(metric =>
            metric.annual.target > 0 ||
            metric.annual.actual > 0 ||
            metric.monthly.target > 0 ||
            metric.monthly.actual > 0 ||
            metric.quarterly.target > 0 ||
            metric.quarterly.actual > 0 ||
            metric.cumulative.target > 0 ||
            metric.cumulative.actual > 0
        ) ||
        analytics.ouRows.some(row => getSummaryTargetTotal(row) > 0 || getSummaryActualTotal(row) > 0) ||
        analytics.provinceRows.some(row => getSummaryTargetTotal(row) > 0 || getSummaryActualTotal(row) > 0)
    ), [analytics.metrics, analytics.ouRows, analytics.provinceRows]);

    const getDetailRows = () => {
        if (detailView === 'national') {
            return analytics.metrics.map(metric => {
                const scope = activeScope(metric);
                const basis = statusScope(metric);
                return {
                    Indicator: metric.label,
                    Target: scope.target,
                    Accomplishment: scope.actual,
                    Rate: `${percent(scope.actual, scope.target)}%`,
                    'Status Basis': viewMode === 'Annual'
                        ? `${basis.actual} / ${basis.target} cumulative as of ${analytics.cumulativeCutoff.label}`
                        : `${basis.actual} / ${basis.target} for ${monthNames[asOfMonth]}`,
                    Status: metricStatus(metric).label,
                };
            });
        }
        if (detailView === 'provinces') {
            const rows = allOuMode ? analytics.ouRows : analytics.provinceRows;
            return rows.map(row => ({
                OU: row.ou,
                ...(allOuMode ? {} : { Province: row.province }),
                'IPOs Target': row.targetIpos,
                'IPOs Accomplished': row.actualIpos,
                'Subprojects Target': row.targetSubprojects,
                'Subprojects Accomplished': row.actualSubprojects,
                'Trainings Target': row.targetTrainings,
                'Trainings Accomplished': row.actualTrainings,
                'Total Target': row.targetIpos + row.targetSubprojects + row.targetTrainings,
                'Total Accomplishment': row.actualIpos + row.actualSubprojects + row.actualTrainings,
                Rate: `${row.rate}%`,
                Status: getStatus(row.actualIpos + row.actualSubprojects + row.actualTrainings, row.targetIpos + row.targetSubprojects + row.targetTrainings).label,
            }));
        }
        if (detailView === 'trend') {
            return activeTrendRows.map(row => ({
                Month: row.month,
                'Cumulative Target': row.target,
                'Cumulative Accomplishment': row.actual,
                Rate: `${row.rate}%`,
            }));
        }
        if (detailView === 'alerts') {
            return analytics.alerts.map(row => ({
                Alert: row.title,
                Details: row.details,
                Type: row.tone,
            }));
        }
        if (detailView === 'submissions') {
            return analytics.submissions.map(row => ({
                'Item Name': row.name,
                Type: row.type,
                Component: row.component,
                OU: row.operatingUnit,
                Edited: formatDateTime(row.editedAt),
                'Completion Date': formatDate(row.completionDate),
            }));
        }
        return [];
    };

    const detailRows = getDetailRows();
    const filteredDetailRows = detailRows.filter(row =>
        !detailSearch.trim() || Object.values(row).some(value =>
            String(value ?? '').toLowerCase().includes(detailSearch.trim().toLowerCase())
        )
    );
    const detailTotalPages = Math.max(1, Math.ceil(filteredDetailRows.length / detailItemsPerPage));
    const safeDetailPage = Math.min(detailPage, detailTotalPages);
    const paginatedDetailRows = filteredDetailRows.slice(
        (safeDetailPage - 1) * detailItemsPerPage,
        safeDetailPage * detailItemsPerPage
    );

    const submissionTotalPages = Math.max(1, Math.ceil(analytics.submissions.length / submissionItemsPerPage));
    const safeSubmissionPage = Math.min(submissionPage, submissionTotalPages);
    const paginatedSubmissions = analytics.submissions.slice(
        (safeSubmissionPage - 1) * submissionItemsPerPage,
        safeSubmissionPage * submissionItemsPerPage
    );

    const downloadDetailView = () => {
        if (!detailView) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredDetailRows), sanitizeSheetName(detailView));
        XLSX.writeFile(wb, `Physical_Dashboard_${detailView}_${selectedYear}.xlsx`);
    };

    const handleExportPowerPoint = async () => {
        if (isPowerPointExporting) return;
        if (typeof PptxGenJS === 'undefined') {
            setPowerPointExportMessage('PowerPoint export library is still loading. Please try again in a moment.');
            return;
        }
        if (!hasPhysicalExportData) {
            setPowerPointExportMessage('No physical dashboard data is available for the current filter selection.');
            return;
        }
        setIsPowerPointExporting(true);
        setPowerPointExportMessage(null);
        try {
            const exportMetrics = analytics.metrics.map(metric => ({
                metric,
                active: activeScope(metric),
            }));
            const exportTrendRows = activeTrendRows.map(row => ({ ...row }));
            const exportSummaryRows = (allOuMode ? analytics.ouRows : analytics.provinceRows).map(row => ({ ...row }));
            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_WIDE';
            pptx.author = '4K Information System';
            pptx.subject = 'Physical Accomplishment Dashboard';
            pptx.title = 'Physical Accomplishment Dashboard';
            pptx.company = 'Department of Agriculture - 4K Program';
            pptx.lang = 'en-US';
            pptx.theme = {
                headFontFace: 'Aptos Display',
                bodyFontFace: 'Aptos',
                lang: 'en-US',
            };

            const logoData = await toDataUri('/assets/4klogo.png');
            const green = '0F8A4B';
            const deepGreen = '0B5F3A';
            const accentGold = 'E9A23B';
            const darkText = '0F172A';
            const mutedText = '64748B';
            const grayFill = 'F1F5F9';
            const borderColor = 'CBD5E1';
            const slideW = 13.333;
            const slideH = 7.5;
            const scopeLabel = selectedOu === 'All' ? 'All OUs' : selectedOu;
            const quarter = getQuarterBounds(asOfMonth);
            const quarterLabel = `${quarter.label} (${monthNames[quarter.start]}-${monthNames[quarter.end]})`;
            const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const addHeader = (slide: any, title: string, subtitle?: string) => {
                slide.background = { color: 'FFFFFF' };
                slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: slideW, h: 0.62, fill: { color: green }, line: { color: green, transparency: 100 } });
                if (logoData) {
                    slide.addImage({ data: logoData, x: 0.28, y: 0.09, w: 0.42, h: 0.42 });
                }
                slide.addText(title, { x: 0.82, y: 0.12, w: 8.6, h: 0.34, fontSize: 17, bold: true, color: 'FFFFFF', margin: 0 });
                slide.addText(generatedDate, { x: 10.05, y: 0.17, w: 2.9, h: 0.25, fontSize: 9, color: 'FFFFFF', align: 'right', margin: 0 });
                if (subtitle) {
                    slide.addText(subtitle, { x: 0.5, y: 0.8, w: 12.2, h: 0.25, fontSize: 10.5, color: mutedText, margin: 0 });
                }
            };
            const addFooter = (slide: any) => {
                slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: slideH - 0.36, w: 12.3, h: 0.01, fill: { color: borderColor, transparency: 35 }, line: { color: borderColor, transparency: 100 } });
                slide.addText('4K Information System', { x: 0.5, y: slideH - 0.27, w: 4, h: 0.15, fontSize: 7, color: mutedText, margin: 0 });
            };
            const addLabel = (slide: any, text: string, x: number, y: number, w: number, h: number, options: Record<string, unknown> = {}) => {
                slide.addText(text, {
                    x,
                    y,
                    w,
                    h,
                    margin: 0.03,
                    fit: 'shrink',
                    breakLine: false,
                    fontFace: 'Aptos',
                    color: darkText,
                    fontSize: 11,
                    ...options,
                });
            };
            const addMetricTile = (
                slide: any,
                title: string,
                value: string,
                subtitle: string,
                x: number,
                y: number,
                w: number,
                h: number,
                color = green
            ) => {
                slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 15 } });
                slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.08, h, fill: { color }, line: { color, transparency: 100 } });
                addLabel(slide, title.toUpperCase(), x + 0.18, y + 0.13, w - 0.28, 0.18, { fontSize: 7.5, bold: true, color: mutedText });
                addLabel(slide, value, x + 0.18, y + 0.36, w - 0.28, 0.35, { fontSize: 17, bold: true, color: darkText });
                addLabel(slide, subtitle, x + 0.18, y + 0.78, w - 0.28, 0.18, { fontSize: 8.5, color: mutedText });
            };
            const addSimpleTable = (
                slide: any,
                rows: Array<Array<string | number>>,
                x: number,
                y: number,
                w: number,
                rowH: number,
                colWidths: number[],
                options: { headerFill?: string; fontSize?: number; maxRows?: number; numericColumns?: number[] } = {}
            ) => {
                const maxRows = options.maxRows || rows.length;
                rows.slice(0, maxRows).forEach((row, rowIndex) => {
                    let cursorX = x;
                    const fillColor = rowIndex === 0 ? (options.headerFill || green) : (rowIndex % 2 === 0 ? 'FFFFFF' : 'F8FAFC');
                    row.forEach((value, colIndex) => {
                        const cw = colWidths[colIndex] || ((w / row.length));
                        const isHeader = rowIndex === 0;
                        const isNumeric = options.numericColumns?.includes(colIndex);
                        slide.addShape(pptx.ShapeType.rect, {
                            x: cursorX,
                            y: y + (rowIndex * rowH),
                            w: cw,
                            h: rowH,
                            fill: { color: fillColor },
                            line: { color: borderColor, transparency: 25 },
                        });
                        addLabel(slide, String(value), cursorX + 0.04, y + (rowIndex * rowH) + 0.04, cw - 0.08, rowH - 0.08, {
                            fontSize: isHeader ? Math.max((options.fontSize || 9) - 1, 7) : (options.fontSize || 9),
                            bold: isHeader || colIndex === 0,
                            color: isHeader ? 'FFFFFF' : darkText,
                            align: isNumeric ? 'right' : 'left',
                        });
                        cursorX += cw;
                    });
                });
            };
            const addTrendSegment = (
                slide: any,
                start: { x: number; y: number },
                end: { x: number; y: number },
                color: string
            ) => {
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const length = Math.sqrt((dx * dx) + (dy * dy));
                if (length < 0.01) return;
                const thickness = 0.025;
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                slide.addShape(pptx.ShapeType.rect, {
                    x: ((start.x + end.x) / 2) - (length / 2),
                    y: ((start.y + end.y) / 2) - (thickness / 2),
                    w: length,
                    h: thickness,
                    rotate: angle,
                    fill: { color },
                    line: { color, transparency: 100 },
                });
            };
            const sanitizePowerPointBlob = async (blob: Blob) => {
                if (typeof JSZip === 'undefined') return blob;
                const zip = await JSZip.loadAsync(blob);
                const contentTypesFile = zip.file('[Content_Types].xml');
                if (!contentTypesFile) return blob;

                const contentTypesXml = await contentTypesFile.async('string');
                const parser = new DOMParser();
                const documentXml = parser.parseFromString(contentTypesXml, 'application/xml');
                if (documentXml.getElementsByTagName('parsererror').length > 0) return blob;

                const overrides = Array.from(documentXml.getElementsByTagNameNS(
                    'http://schemas.openxmlformats.org/package/2006/content-types',
                    'Override'
                )) as Element[];
                let changed = false;

                overrides.forEach(override => {
                    const partName = override.getAttribute('PartName') || '';
                    const zipPath = partName.replace(/^\//, '');
                    if (zipPath && !zip.file(zipPath) && partName.startsWith('/ppt/slideMasters/slideMaster')) {
                        override.parentNode?.removeChild(override);
                        changed = true;
                    }
                });

                if (!changed) return blob;

                zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(documentXml));
                return zip.generateAsync({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                });
            };
            const downloadBlob = (blob: Blob, fileName: string) => {
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = fileName;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
            };
            const formatScopeCell = (scope: MetricScope) => {
                const rate = percent(scope.actual, scope.target);
                const status = getStatus(scope.actual, scope.target).label;
                return `${scope.actual.toLocaleString()} / ${scope.target.toLocaleString()} (${rate}%) ${status}`;
            };
            const formatScopeCount = (scope: MetricScope) => `${scope.actual.toLocaleString()} / ${scope.target.toLocaleString()}`;
            const addHorizontalBars = (
                slide: any,
                rows: Array<{ label: string; target: number; actual: number; rate?: number }>,
                x: number,
                y: number,
                w: number,
                rowH: number
            ) => {
                const maxValue = Math.max(1, ...rows.flatMap(row => [row.target, row.actual]));
                rows.forEach((row, index) => {
                    const rowY = y + (index * rowH);
                    const targetW = (row.target / maxValue) * w;
                    const actualW = (row.actual / maxValue) * w;
                    addLabel(slide, row.label, x, rowY, 2.25, 0.22, { fontSize: 9.5, bold: true });
                    addLabel(slide, `${row.actual.toLocaleString()} / ${row.target.toLocaleString()}${typeof row.rate === 'number' ? ` (${row.rate}%)` : ''}`, x + 10.2, rowY, 1.7, 0.22, { fontSize: 9, bold: true, align: 'right' });
                    slide.addShape(pptx.ShapeType.roundRect, { x: x + 2.35, y: rowY + 0.03, w, h: 0.12, rectRadius: 0.03, fill: { color: 'E2E8F0' }, line: { color: 'E2E8F0', transparency: 100 } });
                    slide.addShape(pptx.ShapeType.roundRect, { x: x + 2.35, y: rowY + 0.03, w: Math.max(targetW, 0.02), h: 0.12, rectRadius: 0.03, fill: { color: '94A3B8' }, line: { color: '94A3B8', transparency: 100 } });
                    slide.addShape(pptx.ShapeType.roundRect, { x: x + 2.35, y: rowY + 0.23, w, h: 0.12, rectRadius: 0.03, fill: { color: 'E8F7EE' }, line: { color: 'E8F7EE', transparency: 100 } });
                    slide.addShape(pptx.ShapeType.roundRect, { x: x + 2.35, y: rowY + 0.23, w: Math.max(actualW, 0.02), h: 0.12, rectRadius: 0.03, fill: { color: green }, line: { color: green, transparency: 100 } });
                });
            };

            const titleSlide = pptx.addSlide();
            titleSlide.background = { color: 'FFFFFF' };
            titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: slideW, h: 0.95, fill: { color: green }, line: { color: green, transparency: 100 } });
            titleSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.95, w: slideW, h: 0.07, fill: { color: accentGold }, line: { color: accentGold, transparency: 100 } });
            if (logoData) titleSlide.addImage({ data: logoData, x: 0.65, y: 1.48, w: 1.18, h: 1.18 });
            addLabel(titleSlide, 'Physical Accomplishment Dashboard', 2.05, 1.45, 9.8, 0.48, { fontSize: 28, bold: true, color: darkText });
            addLabel(titleSlide, '4K Program Implementation Briefing', 2.05, 1.95, 8.5, 0.28, { fontSize: 15, color: green, bold: true });
            addSimpleTable(titleSlide, [
                ['Fund Year', selectedYear],
                ['Scope', scopeLabel],
                ['View Mode', viewMode],
                ['As of Month', monthNames[asOfMonth]],
                ['Quarter Scope', quarterLabel],
                ['Generated', generatedDate],
            ], 2.05, 2.75, 5.4, 0.34, [1.65, 3.75], { headerFill: grayFill, fontSize: 11, maxRows: 6 });
            exportMetrics.slice(0, 3).forEach((row, index) => {
                addMetricTile(titleSlide, row.metric.label, formatScopeCount(row.active), `${percent(row.active.actual, row.active.target)}% ${getStatus(row.active.actual, row.active.target).label}`, 8.05, 2.3 + (index * 1.05), 3.95, 0.88, index === 1 ? accentGold : green);
            });
            addFooter(titleSlide);

            const executiveSlide = pptx.addSlide();
            addHeader(executiveSlide, 'Executive Summary', `${scopeLabel} | Fund Year ${selectedYear} | As of ${monthNames[asOfMonth]}`);
            const executiveRows = [
                ['Indicator', 'Annual', monthNames[asOfMonth], quarter.label, `Cumulative ${monthNames[asOfMonth]}`],
                ...exportMetrics.map(({ metric }) => [
                    metric.label,
                    formatScopeCell(metric.annual),
                    formatScopeCell(metric.monthly),
                    formatScopeCell(metric.quarterly),
                    formatScopeCell(metric.cumulative),
                ]),
            ];
            addSimpleTable(executiveSlide, executiveRows, 0.42, 1.18, 12.5, 0.48, [2.45, 2.35, 2.25, 2.25, 3.2], { fontSize: 9.2, numericColumns: [1, 2, 3, 4] });
            addFooter(executiveSlide);

            const nationalSlide = pptx.addSlide();
            addHeader(nationalSlide, 'National Target vs Accomplishment', `${viewMode} view | ${scopeLabel} | Fund Year ${selectedYear}`);
            addLabel(nationalSlide, 'Target', 8.45, 1.03, 0.7, 0.2, { fontSize: 9, color: mutedText, bold: true });
            nationalSlide.addShape(pptx.ShapeType.roundRect, { x: 9.1, y: 1.08, w: 0.35, h: 0.08, rectRadius: 0.02, fill: { color: '94A3B8' }, line: { color: '94A3B8', transparency: 100 } });
            addLabel(nationalSlide, 'Accomplishment', 9.65, 1.03, 1.35, 0.2, { fontSize: 9, color: mutedText, bold: true });
            nationalSlide.addShape(pptx.ShapeType.roundRect, { x: 11.0, y: 1.08, w: 0.35, h: 0.08, rectRadius: 0.02, fill: { color: green }, line: { color: green, transparency: 100 } });
            addHorizontalBars(
                nationalSlide,
                exportMetrics.map(row => ({
                    label: row.metric.label,
                    target: row.active.target,
                    actual: row.active.actual,
                    rate: percent(row.active.actual, row.active.target),
                })),
                0.55,
                1.45,
                6.8,
                0.72
            );
            addSimpleTable(nationalSlide, [
                ['Indicator', 'Target', 'Actual', 'Rate'],
                ...exportMetrics.map(row => [
                    row.metric.label,
                    row.active.target.toLocaleString(),
                    row.active.actual.toLocaleString(),
                    `${percent(row.active.actual, row.active.target)}%`,
                ]),
            ], 8.25, 1.45, 4.6, 0.42, [1.85, 0.85, 0.85, 0.75], { headerFill: deepGreen, fontSize: 9.3, numericColumns: [1, 2, 3] });
            addFooter(nationalSlide);

            const trendSlide = pptx.addSlide();
            addHeader(trendSlide, 'Cumulative Trend', `${activeTrendLabel} | Jan-Dec ${selectedYear}`);
            const trendMaxValue = trendIndicator === 'physicalPercentage'
                ? 100
                : Math.max(1, ...exportTrendRows.flatMap(row => [row.target, row.actual]));
            const chartX = 0.55;
            const chartY = 1.35;
            const chartW = 7.45;
            const chartH = 4.75;
            const slotW = chartW / exportTrendRows.length;
            trendSlide.addShape(pptx.ShapeType.rect, { x: chartX, y: chartY, w: chartW, h: chartH, fill: { color: 'FFFFFF' }, line: { color: borderColor, transparency: 10 } });
            [0, 0.25, 0.5, 0.75, 1].forEach(step => {
                const y = chartY + chartH - (chartH * step);
                trendSlide.addShape(pptx.ShapeType.rect, { x: chartX, y, w: chartW, h: 0.006, fill: { color: 'E2E8F0' }, line: { color: 'E2E8F0', transparency: 100 } });
            });
            const targetPoints: Array<{ x: number; y: number }> = [];
            const actualPoints: Array<{ x: number; y: number }> = [];
            exportTrendRows.forEach((row, index) => {
                const baseX = chartX + (index * slotW) + (slotW * 0.18);
                const targetH = (Math.min(row.target, trendMaxValue) / trendMaxValue) * (chartH - 0.25);
                const actualH = (Math.min(row.actual, trendMaxValue) / trendMaxValue) * (chartH - 0.25);
                trendSlide.addShape(pptx.ShapeType.rect, { x: baseX, y: chartY + chartH - targetH, w: slotW * 0.22, h: Math.max(targetH, 0.01), fill: { color: 'CBD5E1' }, line: { color: 'CBD5E1', transparency: 100 } });
                trendSlide.addShape(pptx.ShapeType.rect, { x: baseX + (slotW * 0.26), y: chartY + chartH - actualH, w: slotW * 0.22, h: Math.max(actualH, 0.01), fill: { color: '86EFAC' }, line: { color: '86EFAC', transparency: 100 } });
                const pointX = chartX + (index * slotW) + (slotW * 0.5);
                targetPoints.push({ x: pointX, y: chartY + chartH - targetH });
                actualPoints.push({ x: pointX, y: chartY + chartH - actualH });
                addLabel(trendSlide, row.monthShort, chartX + (index * slotW), chartY + chartH + 0.08, slotW, 0.16, { fontSize: 7.5, align: 'center', color: mutedText });
            });
            const drawLine = (points: Array<{ x: number; y: number }>, color: string) => {
                points.forEach((point, index) => {
                    if (index > 0) {
                        const previous = points[index - 1];
                        addTrendSegment(trendSlide, previous, point, color);
                    }
                    trendSlide.addShape(pptx.ShapeType.ellipse, { x: point.x - 0.045, y: point.y - 0.045, w: 0.09, h: 0.09, fill: { color }, line: { color } });
                });
            };
            drawLine(targetPoints, mutedText);
            drawLine(actualPoints, green);
            addLabel(trendSlide, 'Target bars/line', 0.65, 6.38, 1.3, 0.16, { fontSize: 8.2, color: mutedText, bold: true });
            addLabel(trendSlide, 'Actual bars/line', 2.0, 6.38, 1.3, 0.16, { fontSize: 8.2, color: green, bold: true });
            addSimpleTable(trendSlide, [
                ['Month', 'Target', 'Actual', 'Rate'],
                ...exportTrendRows.map(row => [
                    row.monthShort,
                    row.target.toLocaleString(),
                    row.actual.toLocaleString(),
                    `${row.rate}%`,
                ]),
            ], 8.35, 1.05, 4.45, 0.36, [0.82, 1.12, 1.12, 0.9], { headerFill: deepGreen, fontSize: 8.8, numericColumns: [1, 2, 3] });
            addFooter(trendSlide);

            const summarySlide = pptx.addSlide();
            addHeader(summarySlide, allOuMode ? 'OU Performance Summary' : 'Province Performance Summary', `${scopeLabel} | Fund Year ${selectedYear}`);
            const tableRows: Array<Array<string | number>> = [
                [allOuMode ? 'OU' : 'Province', 'IPOs', 'Subprojects', 'Trainings', 'Total', 'Rate', 'Status'],
                ...exportSummaryRows.map(row => {
                    const targetTotal = getSummaryTargetTotal(row);
                    const actualTotal = getSummaryActualTotal(row);
                    return [
                        allOuMode ? row.ou : row.province,
                        `${row.actualIpos} / ${row.targetIpos}`,
                        `${row.actualSubprojects} / ${row.targetSubprojects}`,
                        `${row.actualTrainings} / ${row.targetTrainings}`,
                        `${actualTotal} / ${targetTotal}`,
                        `${row.rate}%`,
                        getSummaryStatusLabel(row),
                    ];
                }),
            ];
            addSimpleTable(summarySlide, tableRows, 0.35, 1.05, 12.65, 0.3, [2.45, 1.45, 1.65, 1.5, 1.55, 0.95, 1.55], { fontSize: 8.2, maxRows: 18, numericColumns: [1, 2, 3, 4, 5] });
            if (tableRows.length > 18) {
                summarySlide.addText(`Showing first 17 of ${exportSummaryRows.length} rows. Use the dashboard table for the full list.`, {
                    x: 0.45,
                    y: 6.95,
                    w: 8.2,
                    h: 0.18,
                    fontSize: 7,
                    color: mutedText,
                    margin: 0,
                });
            }
            addFooter(summarySlide);

            const fileName = `4K_Physical_Accomplishment_Dashboard_${sanitizeFileSegment(selectedYear)}_${sanitizeFileSegment(scopeLabel)}_${new Date().toISOString().split('T')[0]}.pptx`;
            const rawPowerPointBlob = await pptx.write({ outputType: 'blob' });
            const sanitizedPowerPointBlob = await sanitizePowerPointBlob(rawPowerPointBlob);
            downloadBlob(sanitizedPowerPointBlob, fileName);
            setPowerPointExportMessage('PowerPoint file generated successfully.');
        } catch (error) {
            console.error('PowerPoint export failed:', error);
            setPowerPointExportMessage('PowerPoint export failed. Please refresh the dashboard and try again.');
        } finally {
            setIsPowerPointExporting(false);
        }
    };

    const chartMax = Math.max(1, ...analytics.metrics.map(metric => activeScope(metric).target));
    const trendMax = trendIndicator === 'physicalPercentage'
        ? 100
        : Math.max(1, ...activeTrendRows.flatMap(row => [row.target, row.actual]));
    const trendChartTop = 8;
    const trendChartBottom = 92;
    const trendSlotWidth = 100 / activeTrendRows.length;
    const trendY = (value: number) => trendChartBottom - ((Math.min(value, trendMax) / trendMax) * (trendChartBottom - trendChartTop));
    const trendBar = (value: number) => {
        const y = trendY(value);
        return { y, height: Math.max(0, trendChartBottom - y) };
    };
    const trendPoints = (key: 'target' | 'actual') => activeTrendRows.map((row, index) => {
        const x = (index + 0.5) * trendSlotWidth;
        const y = trendY(row[key]);
        return `${x},${y}`;
    }).join(' ');

    if (detailView) {
        const titleMap: Record<DetailView, string> = {
            national: 'National Target vs Accomplishment',
            provinces: allOuMode ? 'OU Performance Summary' : 'Province Performance Summary',
            trend: 'Cumulative Accomplishment Trend',
            alerts: 'Key Insights and Alerts',
            submissions: 'Recent Data Submissions',
        };
        const headers = Object.keys(filteredDetailRows[0] || detailRows[0] || { Notice: 'No records' });
        return (
            <div className="physical-dashboard dashboard-view">
                <section className="report-card physical-dashboard-detail-card">
                    <div className="report-card__header physical-dashboard-detail-card__header">
                        <div>
                            <button type="button" className="physical-dashboard-back-button" onClick={() => setDetailView(null)}>
                                <ArrowLeft aria-hidden="true" />
                                <span>Back to dashboard</span>
                            </button>
                            <h3 className="report-card__title">{titleMap[detailView]}</h3>
                        </div>
                        <button type="button" className="btn btn-primary btn-responsive" onClick={downloadDetailView}>
                            <Download className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Download XLSX</span>
                        </button>
                    </div>
                    <div className="data-table-toolbar physical-dashboard-detail-toolbar">
                        <div className="data-table-search-wrap">
                            <Search aria-hidden="true" />
                            <input
                                className="data-table-search"
                                type="search"
                                value={detailSearch}
                                onChange={event => setDetailSearch(event.target.value)}
                                placeholder="Search this report..."
                            />
                        </div>
                    </div>
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table physical-dashboard-detail-table">
                            <thead>
                                <tr>
                                    {headers.map(header => <th key={header}>{header}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDetailRows.length > 0 ? paginatedDetailRows.map((row, index) => (
                                    <tr key={index}>
                                        {headers.map(header => <td key={header}>{String((row as any)[header] ?? '')}</td>)}
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={headers.length} className="data-table__empty-cell">
                                            No records found for the selected filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <DashboardPagination
                        totalItems={filteredDetailRows.length}
                        currentPage={safeDetailPage}
                        itemsPerPage={detailItemsPerPage}
                        itemLabel="records"
                        onPageChange={setDetailPage}
                        onItemsPerPageChange={setDetailItemsPerPage}
                    />
                </section>
            </div>
        );
    }

    return (
        <div className="physical-dashboard dashboard-view">
            <section className="physical-dashboard-hero report-card">
                <div>
                    <h2 className="dashboard-module-title">Physical Accomplishment Dashboard</h2>
                </div>
                <div className="physical-dashboard-controls">
                    <button
                        type="button"
                        className="btn btn-primary btn-responsive physical-dashboard-ppt-button"
                        onClick={handleExportPowerPoint}
                        disabled={isPowerPointExporting || !hasPhysicalExportData}
                    >
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">{isPowerPointExporting ? 'Generating...' : 'Generate PowerPoint'}</span>
                    </button>
                    {powerPointExportMessage && (
                        <span className="physical-dashboard-ppt-message" role="status">
                            {powerPointExportMessage}
                        </span>
                    )}
                    <label>
                        <span>View</span>
                        <select value={viewMode} onChange={event => setViewMode(event.target.value as ViewMode)} className="form-control">
                            <option value="Annual">Annual</option>
                            <option value="Monthly">Monthly</option>
                        </select>
                    </label>
                    <label>
                        <span>As of</span>
                        <select value={asOfMonth} onChange={event => setAsOfMonth(Number(event.target.value))} className="form-control">
                            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="physical-executive-summary">
                <div className="physical-dashboard-kpi-grid">
                    {analytics.metrics.map(metric => (
                        <PhysicalMetricCard
                            key={metric.id}
                            metric={metric}
                            viewMode={viewMode}
                            asOfMonth={asOfMonth}
                            cumulativeLabel={analytics.cumulativeCutoff.label}
                            expanded={expandedCards.has(metric.id)}
                            onToggleExpand={() => {
                                setExpandedCards(prev => {
                                    const next = new Set(prev);
                                    if (next.has(metric.id)) next.delete(metric.id);
                                    else next.add(metric.id);
                                    return next;
                                });
                            }}
                            onOpen={() => openMetricModal(metric)}
                        />
                    ))}
                </div>
            </section>

            <section className="physical-dashboard-main-grid">
                <article className="report-card physical-dashboard-chart-card">
                    <SectionHeader
                        title="National Target vs Accomplishment"
                        meta={viewMode}
                    />
                    <div className="physical-dashboard-horizontal-chart">
                        {analytics.metrics.slice(0, 6).map(metric => {
                            const scope = activeScope(metric);
                            return (
                                <div key={metric.id} className="physical-dashboard-horizontal-row">
                                    <span>{metric.label}</span>
                                    <div className="physical-dashboard-horizontal-bars">
                                        <div className="physical-dashboard-horizontal-bar">
                                            <i><b className="physical-dashboard-horizontal-row__target" style={{ width: `${Math.max(scope.target > 0 ? 4 : 0, (scope.target / chartMax) * 100)}%` }} /></i>
                                        </div>
                                        <div className="physical-dashboard-horizontal-bar">
                                            <i><b className="physical-dashboard-horizontal-row__actual" style={{ width: `${Math.max(scope.actual > 0 ? 4 : 0, (scope.actual / chartMax) * 100)}%` }} /></i>
                                        </div>
                                    </div>
                                    <strong>{scope.actual.toLocaleString()} / {scope.target.toLocaleString()}</strong>
                                </div>
                            );
                        })}
                    </div>
                    <div className="physical-dashboard-legend">
                        <span><i className="physical-dashboard-legend__target" /> Target</span>
                        <span><i className="physical-dashboard-legend__actual" /> Accomplishment</span>
                    </div>
                </article>

                <article className="report-card physical-dashboard-province-card">
                    <div className="physical-dashboard-section-header physical-dashboard-province-header">
                        <div>
                            <h3>{allOuMode ? 'OU / Province Performance Summary' : 'Province Performance Summary'}</h3>
                        </div>
                        <div className="physical-dashboard-section-actions">
                            {summarySort && (
                                <button type="button" className="btn btn-secondary btn-responsive" onClick={() => setSummarySort(null)}>
                                    <span className="btn-text">Reset Sort</span>
                                </button>
                            )}
                            <button type="button" className="btn btn-secondary btn-responsive" onClick={() => openDetailView('provinces')}>
                                <span className="btn-text">{allOuMode ? 'View All OUs' : 'View All Provinces'}</span>
                                <ChevronRight className="btn-symbol" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table physical-dashboard-province-table">
                            <thead>
                                <tr>
                                    <th>{renderSummarySortHeader('name', allOuMode ? 'OU / Province' : 'Province')}</th>
                                    <th>{renderSummarySortHeader('ipos', 'IPOs')}</th>
                                    <th>{renderSummarySortHeader('subprojects', 'Subprojects')}</th>
                                    <th>{renderSummarySortHeader('trainings', 'Trainings')}</th>
                                    <th>{renderSummarySortHeader('rate', 'Rate')}</th>
                                    <th>{renderSummarySortHeader('status', 'Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allOuMode ? paginatedSummaryRows.map(row => {
                                    const isExpanded = expandedOus.has(row.ou);
                                    const childRows = analytics.provinceRows.filter(province => province.ou === row.ou);
                                    return (
                                        <React.Fragment key={row.ou}>
                                            <tr className="physical-dashboard-ou-row">
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="physical-dashboard-row-toggle"
                                                        onClick={() => setExpandedOus(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(row.ou)) next.delete(row.ou);
                                                            else next.add(row.ou);
                                                            return next;
                                                        })}
                                                    >
                                                        <ChevronRight className={isExpanded ? 'is-open' : ''} aria-hidden="true" />
                                                        <strong>{row.ou}</strong>
                                                    </button>
                                                </td>
                                                <td>{row.actualIpos} / {row.targetIpos}</td>
                                                <td>{row.actualSubprojects} / {row.targetSubprojects}</td>
                                                <td>{row.actualTrainings} / {row.targetTrainings}</td>
                                                <td><ProgressPill actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                                <td><StatusText actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                            </tr>
                                            {isExpanded && childRows.map(child => (
                                                <tr key={child.key} className="physical-dashboard-province-child-row">
                                                    <td>{child.province}</td>
                                                    <td>{child.actualIpos} / {child.targetIpos}</td>
                                                    <td>{child.actualSubprojects} / {child.targetSubprojects}</td>
                                                    <td>{child.actualTrainings} / {child.targetTrainings}</td>
                                                    <td><ProgressPill actual={child.actualIpos + child.actualSubprojects + child.actualTrainings} target={child.targetIpos + child.targetSubprojects + child.targetTrainings} /></td>
                                                    <td><StatusText actual={child.actualIpos + child.actualSubprojects + child.actualTrainings} target={child.targetIpos + child.targetSubprojects + child.targetTrainings} /></td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                }) : paginatedSummaryRows.map(row => (
                                    <tr key={row.key}>
                                        <td><strong>{row.province}</strong></td>
                                        <td>{row.actualIpos} / {row.targetIpos}</td>
                                        <td>{row.actualSubprojects} / {row.targetSubprojects}</td>
                                        <td>{row.actualTrainings} / {row.targetTrainings}</td>
                                        <td><ProgressPill actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                        <td><StatusText actual={row.actualIpos + row.actualSubprojects + row.actualTrainings} target={row.targetIpos + row.targetSubprojects + row.targetTrainings} /></td>
                                    </tr>
                                ))}
                                {summaryBaseRows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="data-table__empty-cell">No province data available.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <DashboardPagination
                        totalItems={sortedSummaryRows.length}
                        currentPage={safeSummaryPage}
                        itemsPerPage={summaryItemsPerPage}
                        itemLabel={allOuMode ? 'OUs' : 'provinces'}
                        onPageChange={setSummaryPage}
                        onItemsPerPageChange={setSummaryItemsPerPage}
                    />
                </article>
            </section>

            <section className="physical-dashboard-main-grid physical-dashboard-main-grid--lower">
                <article className="report-card physical-dashboard-trend-card">
                    <div className="physical-dashboard-section-header physical-dashboard-trend-header">
                        <div>
                            <h3>Cumulative Accomplishment Trend</h3>
                            <span>{activeTrendLabel} | Jan-Dec {selectedYear}</span>
                        </div>
                        <label className="physical-dashboard-trend-selector">
                            <span>Indicator</span>
                            <select
                                value={trendIndicator}
                                onChange={event => setTrendIndicator(event.target.value as TrendIndicatorId)}
                                className="form-control"
                            >
                                {trendIndicatorOptions.map(option => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <div className="physical-dashboard-line-chart">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Cumulative ${activeTrendLabel} target and accomplishment trend`}>
                            <title>{`Cumulative ${activeTrendLabel} trend for ${selectedYear}`}</title>
                            {activeTrendRows.map((row, index) => {
                                const targetBar = trendBar(row.target);
                                const actualBar = trendBar(row.actual);
                                const targetWidth = trendSlotWidth * 0.58;
                                const actualWidth = trendSlotWidth * 0.32;
                                const slotLeft = index * trendSlotWidth;
                                return (
                                    <g key={row.month}>
                                        <rect
                                            className="physical-dashboard-line-chart__target-bar"
                                            x={slotLeft + (trendSlotWidth - targetWidth) / 2}
                                            y={targetBar.y}
                                            width={targetWidth}
                                            height={targetBar.height}
                                        />
                                        <rect
                                            className="physical-dashboard-line-chart__actual-bar"
                                            x={slotLeft + (trendSlotWidth - actualWidth) / 2}
                                            y={actualBar.y}
                                            width={actualWidth}
                                            height={actualBar.height}
                                        />
                                    </g>
                                );
                            })}
                            <polyline points={trendPoints('target')} className="physical-dashboard-line-chart__target" />
                            <polyline points={trendPoints('actual')} className="physical-dashboard-line-chart__actual" />
                        </svg>
                        <div className="physical-dashboard-line-chart__labels">
                            {shortMonthNames.map(month => <span key={month}>{month}</span>)}
                        </div>
                    </div>
                    <div className="physical-dashboard-legend">
                        <span><i className="physical-dashboard-legend__target-bar" /> Target bar</span>
                        <span><i className="physical-dashboard-legend__actual-bar" /> Actual bar</span>
                        <span><i className="physical-dashboard-legend__target-line" /> Target trend</span>
                        <span><i className="physical-dashboard-legend__actual-line" /> Actual trend</span>
                    </div>
                </article>

                <article className="report-card physical-dashboard-alert-card">
                    <SectionHeader title="Key Insights & Alerts" actionLabel="View All Alerts" onAction={() => openDetailView('alerts')} />
                    <div className="physical-dashboard-alert-list">
                        {(analytics.alerts.length > 0 ? analytics.alerts.slice(0, 4) : [{ title: 'No critical alerts for the selected filters.', details: 'Physical accomplishments are within available target context.', tone: 'good' }]).map((alert, index) => (
                            <div key={index} className={`physical-dashboard-alert physical-dashboard-alert--${alert.tone}`}>
                                <AlertTriangle aria-hidden="true" />
                                <div>
                                    <strong>{alert.title}</strong>
                                    <span>{alert.details}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="physical-dashboard-footer-grid physical-dashboard-footer-grid--submissions">
                <article className="report-card physical-dashboard-list-card physical-dashboard-list-card--wide">
                    <SectionHeader title="Recent Data Submissions" actionLabel="View All Submissions" onAction={() => openDetailView('submissions')} />
                    <div className="data-table-scroll custom-scrollbar physical-dashboard-submissions-table-wrap">
                        <table className="data-table physical-dashboard-submissions-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Type</th>
                                    <th>Component</th>
                                    <th>OU</th>
                                    <th>Completion Date</th>
                                    <th>Submitted / Edited</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedSubmissions.length > 0 ? paginatedSubmissions.map(row => (
                                    <tr key={row.id}>
                                        <td><strong>{row.name}</strong></td>
                                        <td>{row.type}</td>
                                        <td>{row.component}</td>
                                        <td>{row.operatingUnit}</td>
                                        <td>{formatDate(row.completionDate)}</td>
                                        <td>{formatDateTime(row.editedAt)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="data-table__empty-cell">
                                            No recent submissions available.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <DashboardPagination
                        totalItems={analytics.submissions.length}
                        currentPage={safeSubmissionPage}
                        itemsPerPage={submissionItemsPerPage}
                        itemLabel="submissions"
                        onPageChange={setSubmissionPage}
                        onItemsPerPageChange={setSubmissionItemsPerPage}
                    />
                </article>
            </section>

            {localModal && (
                <div className="dashboard-modal-backdrop" onClick={() => setLocalModal(null)}>
                    <div className="dashboard-modal dashboard-modal--wide" onClick={event => event.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div className="physical-dashboard-modal-title">
                                <h3>{localModal.title}</h3>
                                <p className="dashboard-modal__metric-subtext">{viewMode} | Year: {selectedYear}</p>
                            </div>
                            <div className="dashboard-modal__actions">
                                <button type="button" onClick={handleDownloadModalExcel} className="btn btn-primary btn-responsive">
                                    <Download className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">Excel</span>
                                </button>
                                <button type="button" onClick={() => setLocalModal(null)} className="dashboard-modal__close" aria-label="Close modal">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="data-tabs dashboard-modal-tabs">
                            <button type="button" onClick={() => setModalTab('targets')} className={`data-tab ${modalTab === 'targets' ? 'is-active' : ''}`}>
                                Targets ({localModal.targets.length})
                            </button>
                            <button type="button" onClick={() => setModalTab('accomplishments')} className={`data-tab ${modalTab === 'accomplishments' ? 'is-active' : ''}`}>
                                Accomplishments ({localModal.accomplishments.length})
                            </button>
                        </div>
                        <div className="dashboard-modal__body custom-scrollbar">
                            {(modalTab === 'targets' ? localModal.targets : localModal.accomplishments).length > 0 ? (
                                <div className="dashboard-modal__stack">
                                    {Object.entries((modalTab === 'targets' ? localModal.targets : localModal.accomplishments).reduce((acc, item) => {
                                        const ou = item.operatingUnit || 'Unknown OU';
                                        if (!acc[ou]) acc[ou] = [];
                                        acc[ou].push(item);
                                        return acc;
                                    }, {} as Record<string, ModalItemWithOu[]>))
                                        .sort(([a], [b]) => getOuSortIndex(a) - getOuSortIndex(b) || a.localeCompare(b))
                                        .map(([ou, groupedItems]) => {
                                        const items = groupedItems as ModalItemWithOu[];
                                        return (
                                            <div key={ou} className="dashboard-modal-group">
                                                <div className="dashboard-modal-group__heading">
                                                    <span>{ou}</span>
                                                    <div />
                                                </div>
                                                <ul className="dashboard-modal__stack">
                                                    {items.map((item, index) => (
                                                        <li
                                                            key={`${item.id}-${index}`}
                                                            className={[
                                                                'dashboard-modal__event',
                                                                localModal.type !== 'provinces' && !item.isUnresolvedPlaceholder ? 'dashboard-modal__event--clickable' : '',
                                                                item.isUnresolved ? 'physical-dashboard-modal-event--unresolved' : '',
                                                                !item.isUnresolved && modalTab === 'targets' && item.isCompleted ? 'physical-dashboard-modal-event--completed' : '',
                                                                !item.isUnresolved && modalTab === 'targets' && !item.isCompleted && item.isOverdue ? 'physical-dashboard-modal-event--overdue' : '',
                                                            ].filter(Boolean).join(' ')}
                                                            onClick={() => localModal.type !== 'provinces' && !item.isUnresolvedPlaceholder && handleItemClick(item)}
                                                        >
                                                            {item.isUnresolved && <span className="physical-dashboard-modal-event__warning">Unresolved IPO reference</span>}
                                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="dashboard-modal__empty">
                                    <p>No records found for this view.</p>
                                </div>
                            )}
                        </div>
                        <div className="dashboard-modal__footer-note">
                            {localModal.type === 'provinces' ? 'Province entries are summary records.' : 'Tip: Click on an item to view its profile.'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicalDashboard;
