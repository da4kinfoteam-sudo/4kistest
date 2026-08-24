
// Author: 4K 
import React, { useState, useEffect, FormEvent, useMemo, useCallback, useRef } from 'react';
import {
    AlertCircle,
    CalendarDays,
    Check,
    Coins,
    Edit3,
    ExternalLink,
    Filter,
    Layers,
    Loader2,
    MapPin,
    Pencil,
    Plus,
    RefreshCw,
    Ruler,
    Sprout,
    Store,
    Trash2,
    TrendingUp,
    UploadCloud,
    Wallet,
    X
} from 'lucide-react';
import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, IPO, Subproject, Training, Commodity, CommodityNeed, referenceCommodityTypes, MarketingPartner, MarketLinkage, LodAssessment } from '../constants';
import { formatMarketQuantityTotals, getIpoMarketSalesRows, summarizeIpoMarketSales } from '../lib/marketSalesAggregation';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { supabase } from '../supabaseClient';
import { getLodEffectiveState } from '../lib/lodScoring';
import { subscribeToLodDataChanges } from '../lib/lodDataSync';
import { commodityCapacityToFormValue, getCommodityCapacityValues } from '../lib/commodityProfile';
import {
    deleteIpoDriveFile,
    formatFileSize,
    getGoogleDriveStatus,
    getIpoDriveImageUrl,
    GoogleDriveStatus,
    IpoDriveFile,
    listIpoDriveFiles,
    uploadIpoDriveFile,
    updateIpoDriveFileMetadata,
    DriveUploadSection
} from '../lib/googleDriveStorage';
import {
    DriveUploadModal,
    EntityFilesList,
    EntityGallery,
    GalleryViewMode,
    GalleryViewToggle,
    getPersistedDriveUploadSection
} from './ui/DriveMediaSections';
import { ConfirmDialog } from './ui/enterprise';
import { ColumnFilterDialog, TableColumnFilters, TableFilterField, TruncatedTableCell } from './ui/MajorDataTable';
import {
    RecordDetailAside,
    RecordDetailGrid,
    RecordDetailMain,
    RecordDetailPage,
    RecordKpiCard,
    RecordKpiGrid,
    RecordPanel
} from './ui/RecordDetailLayout';


interface IPODetailProps {
    ipo: IPO;
    subprojects: Subproject[];
    trainings: Training[];
    monitoringActivities?: Activity[];
    cachedMonitoringReports?: ActivityMonitoringReport[];
    cachedMonitoringActions?: ActivityMonitoringAction[];
    linkedDcfLoading?: boolean;
    linkedDcfError?: string | null;
    marketingPartners: MarketingPartner[];
    onUpdateIpo: (updatedIpo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training) => void;
    onOpenMonitoringReport?: (activity: Activity, ipo: IPO, report?: ActivityMonitoringReport | null) => void;
    onSelectLodYear?: (ipo: IPO, year: number) => void;
    onSelectMarketingPartner?: (partner: MarketingPartner) => void;
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
}

const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    
    // Check if it's a full ISO string (likely from history logs or timestamps)
    if (dateString.includes('T')) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    
    // Handle YYYY-MM-DD standard date strings (force UTC to avoid off-by-one errors)
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};


const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(toSafeNumber(amount));
}

const toSafeNumber = (value: number | string | null | undefined) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatFullNumber = (value: number | string | null | undefined) => {
    return toSafeNumber(value).toLocaleString();
};

const formatCompactNumber = (amount: number | string | null | undefined, maximumFractionDigits = 1) => {
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits
    }).format(toSafeNumber(amount));
};

const formatCompactCurrency = (amount: number | string | null | undefined) => {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        notation: 'compact',
        maximumFractionDigits: 1
    }).format(toSafeNumber(amount));
};

const getStatusBadge = (status: Subproject['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const getTrainingStatusBadge = (status: string) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const getSubprojectPhysicalRate = (subproject: Subproject) => {
    const deliverables = subproject.details || [];
    if (deliverables.length === 0) {
        return subproject.status === 'Completed' ? 100 : 0;
    }

    const completed = deliverables.filter(item => item.isCompleted || !!item.actualDeliveryDate).length;
    return Math.round((completed / deliverables.length) * 100);
};

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode; half?: boolean }> = ({ label, value, half }) => (
    <div className={`detail-item ${half ? '' : 'detail-item--wide'}`}>
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value">{value || 'N/A'}</dd>
    </div>
);

const OverviewMetric: React.FC<{
    label: string;
    value: string;
    fullValue?: string;
    note?: string;
    icon?: React.ReactNode;
}> = ({ label, value, fullValue, note, icon }) => (
    <RecordKpiCard label={label} value={value} title={fullValue || value} note={note} icon={icon} />
);

const MembershipRow: React.FC<{ label: string; value?: number | string | null }> = ({ label, value }) => {
    const numericValue = toSafeNumber(value);
    const fullValue = formatFullNumber(numericValue);
    const displayValue = Math.abs(numericValue) >= 100000 ? formatCompactNumber(numericValue) : fullValue;

    return (
        <div className="detail-item">
            <dt className="detail-label">{label}</dt>
            <dd className="detail-value detail-value--emphasis" title={fullValue}>{displayValue}</dd>
        </div>
    );
};

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];
const MARKET_VOLUME_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getCommodityNeedAnnualVolume = (need: CommodityNeed) => {
    return MARKET_VOLUME_MONTHS.reduce((sum, month) => sum + toSafeNumber((need as any)[`volume${month}`]), 0);
};

const getMarketLinkageCommodityLabel = (link: MarketLinkage) => (
    link.commodityName ? `${link.commodityName}${link.commodityType ? ` (${link.commodityType})` : ''}` : 'Unassigned'
);

const getLodAssessmentSource = (assessment: LodAssessment) => {
    if (assessment.is_dropped) return 'Dropped';
    if (assessment.is_complete) return 'Computed assessment';
    if (assessment.is_carried_over) return assessment.carried_over_from_year
        ? `Carry-over from ${assessment.carried_over_from_year}`
        : 'Carry-over';
    if (assessment.manual_level != null) return 'Manual override';
    return 'Questionnaire in progress';
};

const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
    if (!startDate) return 'N/A';
    const formattedStart = formatDate(startDate);
    return endDate && endDate !== startDate ? `${formattedStart} to ${formatDate(endDate)}` : formattedStart;
};

// Helper for Region Normalization
const normalizeRegionName = (inputRegion: string) => {
    const map: { [key: string]: string } = {
        'Ilocos Region': 'Region I (Ilocos Region)',
        'Cagayan Valley': 'Region II (Cagayan Valley)',
        'Central Luzon': 'Region III (Central Luzon)',
        'CALABARZON': 'Region IV-A (CALABARZON)',
        'MIMAROPA': 'MIMAROPA Region',
        'MIMAROPA Region': 'MIMAROPA Region',
        'Bicol Region': 'Region V (Bicol Region)',
        'Western Visayas': 'Region VI (Western Visayas)',
        'Central Visayas': 'Region VII (Central Visayas)',
        'Eastern Visayas': 'Region VIII (Eastern Visayas)',
        'Zamboanga Peninsula': 'Region IX (Zamboanga Peninsula)',
        'Northern Mindanao': 'Region X (Northern Mindanao)',
        'Davao Region': 'Region XI (Davao Region)',
        'SOCCSKSARGEN': 'Region XII (SOCCSKSARGEN)',
        'Caraga': 'Region XIII (Caraga)',
        'NCR': 'National Capital Region (NCR)',
        'National Capital Region': 'National Capital Region (NCR)',
        'CAR': 'Cordillera Administrative Region (CAR)',
        'Cordillera Administrative Region': 'Cordillera Administrative Region (CAR)',
        'BARMM': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
        'Bangsamoro Autonomous Region in Muslim Mindanao': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)'
    };
    return map[inputRegion] || inputRegion;
};

const IpoDetailPanel: React.FC<{
    title: string;
    description?: string;
    actions?: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, description, actions, footer, className = '', children }) => (
    <RecordPanel title={title} description={description} actions={actions} footer={footer} className={className}>
        {children}
    </RecordPanel>
);

type IpoSectionModalKey = 'gallery' | 'galleryUpload' | 'filesUpload' | 'monitoringReport' | 'marketLinkage';
type IpoTableKey = 'subprojects' | 'activities' | 'monitoring' | 'market' | 'history';

const IpoTableFilterButton: React.FC<{
    label: string;
    count: number;
    onClick: () => void;
}> = ({ label, count, onClick }) => (
    <button
        type="button"
        className={`btn btn-secondary btn-compact major-table-filter-button${count > 0 ? ' is-active' : ''}`}
        onClick={onClick}
        aria-label={`Filter ${label}`}
        title={`Filter ${label}`}
    >
        <Filter aria-hidden="true" />
        <span className="ipo-detail-filter-label">Filter</span>
        {count > 0 && <span className="major-table-filter-button__count" aria-label={`${count} active filters`}>{count}</span>}
    </button>
);

const IpoTableCount: React.FC<{ filtered: number; total: number }> = ({ filtered, total }) => (
    <span className="ipo-detail-table-count">Showing {filtered.toLocaleString()} of {total.toLocaleString()} records</span>
);

const IpoSectionModal: React.FC<{
    title: string;
    description: string;
    count?: number;
    compact?: boolean;
    onClose: () => void;
    children: React.ReactNode;
}> = ({ title, description, count, compact = false, onClose, children }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = (Array.from(dialogRef.current.querySelectorAll(
                'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )) as HTMLElement[]).filter(element => !element.hasAttribute('hidden'));
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousBodyOverflow;
            previouslyFocused?.focus();
        };
    }, [onClose]);

    return (
        <div
            className="dashboard-modal-backdrop ipo-section-modal-backdrop"
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                className={`dashboard-modal dashboard-modal--wide ipo-section-modal${compact ? ' ipo-section-modal--compact' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="ipo-section-modal-title"
                onMouseDown={event => event.stopPropagation()}
            >
                <div className="dashboard-modal__header ipo-section-modal__header">
                    <div>
                        <h3 id="ipo-section-modal-title">{title}</h3>
                        <p className="dashboard-modal__metric-subtext">
                            {description}
                            {typeof count === 'number' && (
                                <> · {count.toLocaleString()} {count === 1 ? 'item' : 'items'}</>
                            )}
                        </p>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="dashboard-modal__close"
                        onClick={onClose}
                        aria-label={`Close ${title}`}
                    >
                        <X aria-hidden="true" />
                    </button>
                </div>
                <div className="dashboard-modal__body custom-scrollbar ipo-section-modal__body">
                    {children}
                </div>
            </div>
        </div>
    );
};

const IPODetail: React.FC<IPODetailProps> = ({ ipo, subprojects, trainings, monitoringActivities = [], cachedMonitoringReports = [], cachedMonitoringActions = [], linkedDcfLoading = false, linkedDcfError = null, marketingPartners, onUpdateIpo, onSelectSubproject, onSelectActivity, onOpenMonitoringReport, onSelectLodYear, onSelectMarketingPartner, particularTypes, commodityCategories }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('IPO Management');
    const canDeleteDriveFiles = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [isEditing, setIsEditing] = useState(false);
    const [editedIpo, setEditedIpo] = useState<IPO>(ipo);
    const [baseRegion, setBaseRegion] = useState(''); // Track base region from dropdown
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [lodAssessments, setLodAssessments] = useState<LodAssessment[]>([]);
    // History Hook
    const { history, addIpoHistory, refreshHistory } = useIpoHistory(ipo.id);
    const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
    const [driveFiles, setDriveFiles] = useState<IpoDriveFile[]>([]);
    const [isDriveLoading, setIsDriveLoading] = useState(true);
    const [deletingDriveFileId, setDeletingDriveFileId] = useState<number | null>(null);
    const [driveFilePendingDelete, setDriveFilePendingDelete] = useState<IpoDriveFile | null>(null);
    const [driveToast, setDriveToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [sectionModal, setSectionModal] = useState<IpoSectionModalKey | null>(null);
    const [selectedMonitoringReport, setSelectedMonitoringReport] = useState<ActivityMonitoringReport | null>(null);
    const [selectedMarketLinkage, setSelectedMarketLinkage] = useState<ReturnType<typeof getIpoMarketSalesRows>[number] | null>(null);
    const [openTableFilter, setOpenTableFilter] = useState<IpoTableKey | null>(null);
    const [tableFilters, setTableFilters] = useState<Record<IpoTableKey, TableColumnFilters>>({
        subprojects: {}, activities: {}, monitoring: {}, market: {}, history: {}
    });
    const [galleryView, setGalleryView] = useState<GalleryViewMode>(() => {
        const saved = window.localStorage.getItem('4kis-gallery-view:ipo');
        return saved === 'list' || saved === 'carousel' ? saved : 'thumbnail';
    });
    const [monitoringReports, setMonitoringReports] = useState<ActivityMonitoringReport[]>([]);
    const [monitoringActions, setMonitoringActions] = useState<ActivityMonitoringAction[]>([]);
    const [latestMonitoringActions, setLatestMonitoringActions] = useState<Record<number, ActivityMonitoringAction | undefined>>({});
    const [isMonitoringLoading, setIsMonitoringLoading] = useState(false);
    const [monitoringMessage, setMonitoringMessage] = useState<string | null>(null);
    
    // Commodity State
    const [currentCommodity, setCurrentCommodity] = useState({
        type: '',
        particular: '',
        value: '',
        yield: '',
        isScad: false,
        potentialExpansionArea: '',
        numberOfFarmers: '',
        numberOfTrees: '',
        marketingPercentage: '',
        foodSecurityPercentage: '',
        averageIncome: ''
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);


    useEffect(() => {
        const fetchLOD = async () => {
            if (!supabase || !ipo.id) return;
            const { data, error } = await supabase
                .from('lod_assessments')
                .select('*')
                .eq('ipo_id', ipo.id)
                .order('year', { ascending: false });
            
            if (error) {
                console.error("Error fetching LOD assessments:", error);
            } else {
                setLodAssessments(data || []);
            }
        };
        fetchLOD();
        const unsubscribe = subscribeToLodDataChanges(detail => {
            if (!detail.ipoId || Number(detail.ipoId) === Number(ipo.id)) fetchLOD();
        });
        return unsubscribe;
    }, [ipo.id]);

    const showDriveToast = (type: 'success' | 'error', message: string) => {
        setDriveToast({ type, message });
    };

    useEffect(() => {
        if (!driveToast) return;
        const timeout = window.setTimeout(() => setDriveToast(null), 4200);
        return () => window.clearTimeout(timeout);
    }, [driveToast]);

    const monitoringActivityById = useMemo(() => {
        return new Map(monitoringActivities.map(activity => [Number(activity.id), activity]));
    }, [monitoringActivities]);

    const cachedReportsForIpo = useMemo(() =>
        cachedMonitoringReports
            .filter(report => Number(report.ipo_id) === Number(ipo.id)),
    [cachedMonitoringReports, ipo.id]);

    const buildLatestActionMap = useCallback((reports: ActivityMonitoringReport[], actions: ActivityMonitoringAction[]) => {
        const reportIds = new Set(reports.map(report => Number(report.id)));
        const latestMap: Record<number, ActivityMonitoringAction | undefined> = {};
        actions
            .filter(action => reportIds.has(Number(action.monitoring_report_id)))
            .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
            .forEach(action => {
                if (!latestMap[action.monitoring_report_id]) {
                    latestMap[action.monitoring_report_id] = action;
                }
            });
        return latestMap;
    }, []);

    useEffect(() => {
        setMonitoringReports(cachedReportsForIpo);
        setMonitoringActions(cachedMonitoringActions);
        setLatestMonitoringActions(buildLatestActionMap(cachedReportsForIpo, cachedMonitoringActions));
    }, [buildLatestActionMap, cachedMonitoringActions, cachedReportsForIpo]);

    const loadMonitoringReports = useCallback(async () => {
        if (!ipo.id) return;
        if (!supabase) {
            setMonitoringReports(cachedReportsForIpo);
            setMonitoringActions(cachedMonitoringActions);
            setLatestMonitoringActions(buildLatestActionMap(cachedReportsForIpo, cachedMonitoringActions));
            setMonitoringMessage(cachedReportsForIpo.length > 0 ? 'Showing cached Monitoring Reports.' : null);
            return;
        }
        setIsMonitoringLoading(true);
        setMonitoringMessage(null);
        try {
            const { data: reports, error } = await supabase
                .from('activity_monitoring_reports')
                .select('*')
                .eq('ipo_id', ipo.id)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });
            if (error) throw error;

            const visibleReports = (reports || []) as ActivityMonitoringReport[];
            setMonitoringReports(visibleReports);

            const reportIds = visibleReports.map(report => report.id);
            if (reportIds.length === 0) {
                setMonitoringActions([]);
                setLatestMonitoringActions({});
                return;
            }

            const { data: actions, error: actionError } = await supabase
                .from('activity_monitoring_actions')
                .select('*')
                .in('monitoring_report_id', reportIds)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (actionError) throw actionError;

            const visibleActions = (actions || []) as ActivityMonitoringAction[];
            setMonitoringActions(visibleActions);
            setLatestMonitoringActions(buildLatestActionMap(visibleReports, visibleActions));
        } catch (error: any) {
            setMonitoringReports(cachedReportsForIpo);
            setMonitoringActions(cachedMonitoringActions);
            setLatestMonitoringActions(buildLatestActionMap(cachedReportsForIpo, cachedMonitoringActions));
            setMonitoringMessage(cachedReportsForIpo.length > 0
                ? `Showing cached Monitoring Reports. ${error.message || 'Unable to refresh live data.'}`
                : error.message || 'Unable to load Monitoring Reports.');
        } finally {
            setIsMonitoringLoading(false);
        }
    }, [buildLatestActionMap, cachedMonitoringActions, cachedReportsForIpo, ipo.id]);

    useEffect(() => {
        loadMonitoringReports();
    }, [loadMonitoringReports]);

    const loadDriveFiles = async () => {
        if (!ipo.id) return;
        setIsDriveLoading(true);
        try {
            const [status, files] = await Promise.all([
                getGoogleDriveStatus(currentUser),
                listIpoDriveFiles(currentUser, ipo.id)
            ]);
            setDriveStatus(status);
            setDriveFiles(files);
        } catch (error: any) {
            const message = error.message || 'Unable to load IPO files.';
            showDriveToast('error', message);
        } finally {
            setIsDriveLoading(false);
        }
    };

    useEffect(() => {
        loadDriveFiles();
    }, [ipo.id, currentUser?.id]);

    const uploadDriveFile = async (file: File, uploadSection: DriveUploadSection) => {
        if (!canEdit) {
            throw new Error('You do not have permission to upload IPO files.');
        }
        if (!driveStatus?.isConnected) {
            throw new Error(driveStatus?.connectionMessage || 'Ask an Admin to reconnect Google Drive storage.');
        }
        const uploaded = await uploadIpoDriveFile(currentUser, ipo.id, file, uploadSection);
        refreshHistory();
        return uploaded;
    };

    const requestDriveFileDelete = (file: IpoDriveFile) => {
        if (!canDeleteDriveFiles) return;
        setSectionModal(null);
        setDriveFilePendingDelete(file);
    };

    const handleDriveFileDelete = async () => {
        const file = driveFilePendingDelete;
        if (!canDeleteDriveFiles || !file) return;
        setDeletingDriveFileId(file.id);
        try {
            await deleteIpoDriveFile(currentUser, file.id);
            setDriveFiles(prev => prev.filter(item => item.id !== file.id));
            showDriveToast('success', `${file.file_name} deleted.`);
            setDriveFilePendingDelete(null);
            refreshHistory();
        } catch (error: any) {
            showDriveToast('error', error.message || 'Unable to delete IPO file.');
        } finally {
            setDeletingDriveFileId(null);
        }
    };

    const currentFundYear = String(new Date().getFullYear());
    const ipoLinkages = useMemo(() => {
        return getIpoMarketSalesRows(marketingPartners, ipo.name);
    }, [marketingPartners, ipo.name]);
    const ipoMarketSalesSummary = useMemo(() => summarizeIpoMarketSales(ipoLinkages), [ipoLinkages]);

    const galleryFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'gallery'), [driveFiles]);
    const documentFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'files'), [driveFiles]);

    const closeSectionModal = useCallback(() => {
        setSectionModal(null);
        setSelectedMonitoringReport(null);
        setSelectedMarketLinkage(null);
    }, []);

    const activeFilterCount = useCallback((table: IpoTableKey) => (
        Object.values(tableFilters[table]).filter(values => Array.isArray(values) && values.length > 0).length
    ), [tableFilters]);

    const filterMatches = (table: IpoTableKey, key: string, value: unknown) => {
        const selected = tableFilters[table][key] || [];
        return selected.length === 0 || selected.includes(String(value ?? ''));
    };

    const filteredSubprojects = useMemo(() => {
        const rows = subprojects.filter(project => {
            const rate = getSubprojectPhysicalRate(project);
            const completionBand = rate === 0 ? '0%' : rate < 50 ? '1-49%' : rate < 100 ? '50-99%' : '100%';
            return filterMatches('subprojects', 'fundingYear', project.fundingYear)
                && filterMatches('subprojects', 'status', project.status)
                && filterMatches('subprojects', 'location', project.location || 'Not recorded')
                && filterMatches('subprojects', 'completion', completionBand);
        });
        return rows.sort((left, right) => {
            const leftCurrent = String(left.fundingYear) === currentFundYear ? 1 : 0;
            const rightCurrent = String(right.fundingYear) === currentFundYear ? 1 : 0;
            if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
            return new Date(right.startDate || right.created_at || 0).getTime() - new Date(left.startDate || left.created_at || 0).getTime();
        });
    }, [currentFundYear, subprojects, tableFilters.subprojects]);

    const filteredActivities = useMemo(() => {
        const rows = trainings.filter(activity => (
            filterMatches('activities', 'fundingYear', activity.fundingYear)
            && filterMatches('activities', 'status', activity.status)
            && filterMatches('activities', 'component', activity.component || 'Not recorded')
            && filterMatches('activities', 'type', activity.type || 'Not recorded')
        ));
        return rows.sort((left, right) => {
            const leftCurrent = String(left.fundingYear) === currentFundYear ? 1 : 0;
            const rightCurrent = String(right.fundingYear) === currentFundYear ? 1 : 0;
            if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
            return new Date(right.date || right.created_at || 0).getTime() - new Date(left.date || left.created_at || 0).getTime();
        });
    }, [currentFundYear, tableFilters.activities, trainings]);

    const filteredMonitoringReports = useMemo(() => {
        const rows = monitoringReports.filter(report => {
            const activity = monitoringActivityById.get(Number(report.activity_id));
            return filterMatches('monitoring', 'status', report.status)
                && filterMatches('monitoring', 'fundingYear', activity?.fundingYear || 'Not recorded')
                && filterMatches('monitoring', 'component', activity?.component || 'Not recorded')
                && filterMatches('monitoring', 'reporter', report.reported_by_name || 'Not recorded');
        });
        return rows.sort((left, right) => new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime());
    }, [monitoringActivityById, monitoringReports, tableFilters.monitoring]);

    const filteredMarketLinkages = useMemo(() => {
        const rows = ipoLinkages.filter(item => (
            filterMatches('market', 'buyer', item.partner.companyName)
            && filterMatches('market', 'commodity', item.link.commodityName || 'Unassigned')
            && filterMatches('market', 'agreementType', item.link.agreementType || 'Not recorded')
            && filterMatches('market', 'status', item.link.negotiationStatus || 'Not recorded')
            && filterMatches('market', 'year', item.link.agreementDate ? new Date(item.link.agreementDate).getFullYear() : 'Not recorded')
        ));
        return rows.sort((left, right) => new Date(right.link.agreementDate || 0).getTime() - new Date(left.link.agreementDate || 0).getTime());
    }, [ipoLinkages, tableFilters.market]);

    const filteredHistory = useMemo(() => {
        const rows = history.filter(entry => (
            filterMatches('history', 'year', entry.date ? new Date(entry.date).getFullYear() : 'Not recorded')
            && filterMatches('history', 'event', entry.event)
            && filterMatches('history', 'user', entry.user)
        ));
        return rows.sort((left, right) => new Date(right.date || right.created_at || 0).getTime() - new Date(left.date || left.created_at || 0).getTime());
    }, [history, tableFilters.history]);

    const tableFilterFields = useMemo<Record<IpoTableKey, TableFilterField[]>>(() => ({
        subprojects: [
            { key: 'fundingYear', label: 'Fund Year', values: Array.from(new Set(subprojects.map(item => String(item.fundingYear || '')))).filter(Boolean).sort().reverse() },
            { key: 'status', label: 'Status', values: Array.from(new Set(subprojects.map(item => item.status))).filter(Boolean).sort() },
            { key: 'location', label: 'Location', values: Array.from(new Set(subprojects.map(item => item.location || 'Not recorded'))).sort() },
            { key: 'completion', label: 'Completion', values: ['0%', '1-49%', '50-99%', '100%'] }
        ],
        activities: [
            { key: 'fundingYear', label: 'Fund Year', values: Array.from(new Set(trainings.map(item => String(item.fundingYear || '')))).filter(Boolean).sort().reverse() },
            { key: 'status', label: 'Status', values: Array.from(new Set(trainings.map(item => item.status))).filter(Boolean).sort() },
            { key: 'component', label: 'Component', values: Array.from(new Set(trainings.map(item => item.component || 'Not recorded'))).sort() },
            { key: 'type', label: 'Activity Type', values: Array.from(new Set(trainings.map(item => item.type || 'Not recorded'))).sort() }
        ],
        monitoring: [
            { key: 'status', label: 'Status', values: Array.from(new Set(monitoringReports.map(item => item.status))).sort() },
            { key: 'fundingYear', label: 'Fund Year', values: Array.from(new Set(monitoringReports.map(item => String(monitoringActivityById.get(Number(item.activity_id))?.fundingYear || 'Not recorded')))).sort().reverse() },
            { key: 'component', label: 'Component', values: Array.from(new Set(monitoringReports.map(item => monitoringActivityById.get(Number(item.activity_id))?.component || 'Not recorded'))).sort() },
            { key: 'reporter', label: 'Reporter', values: Array.from(new Set(monitoringReports.map(item => item.reported_by_name || 'Not recorded'))).sort() }
        ],
        market: [
            { key: 'buyer', label: 'Buyer', values: Array.from(new Set(ipoLinkages.map(item => item.partner.companyName))).sort() },
            { key: 'commodity', label: 'Commodity', values: Array.from(new Set(ipoLinkages.map(item => item.link.commodityName || 'Unassigned'))).sort() },
            { key: 'agreementType', label: 'Agreement Type', values: Array.from(new Set(ipoLinkages.map(item => item.link.agreementType || 'Not recorded'))).sort() },
            { key: 'status', label: 'Status', values: Array.from(new Set(ipoLinkages.map(item => item.link.negotiationStatus || 'Not recorded'))).sort() },
            { key: 'year', label: 'Agreement Year', values: Array.from(new Set(ipoLinkages.map(item => item.link.agreementDate ? String(new Date(item.link.agreementDate).getFullYear()) : 'Not recorded'))).sort().reverse() }
        ],
        history: [
            { key: 'year', label: 'Year', values: Array.from(new Set(history.map(item => item.date ? String(new Date(item.date).getFullYear()) : 'Not recorded'))).sort().reverse() },
            { key: 'event', label: 'Event', values: Array.from(new Set(history.map(item => item.event))).sort() },
            { key: 'user', label: 'User', values: Array.from(new Set(history.map(item => item.user))).sort() }
        ]
    }), [history, ipoLinkages, monitoringActivityById, monitoringReports, subprojects, trainings]);

    // Calculate Statistics for Overview
    const overviewStats = useMemo(() => {
        // 1. Completed Counts
        const completedSubprojects = (subprojects || []).filter(s => s.status === 'Completed');
        const completedTrainings = (trainings || []).filter(t => !!t.actualDate); // Assuming actualDate implies completion

        // 2. Investment Calculation
        const subprojectInvestment = completedSubprojects.reduce((sum, sp) => {
            return sum + (sp.details || []).reduce((dSum, d) => dSum + (toSafeNumber(d.pricePerUnit) * toSafeNumber(d.numberOfUnits)), 0);
        }, 0);

        const trainingInvestment = completedTrainings.reduce((sum, t) => {
            return sum + (t.expenses || []).reduce((eSum, e) => eSum + toSafeNumber(e.amount), 0);
        }, 0);

        const totalInvestment = subprojectInvestment + trainingInvestment;

        // 4. Total Allocation (regardless of status)
        const subprojectAllocation = (subprojects || []).reduce((sum, sp) => {
            return sum + (sp.details || []).reduce((dSum, d) => dSum + (toSafeNumber(d.pricePerUnit) * toSafeNumber(d.numberOfUnits)), 0);
        }, 0);

        const trainingAllocation = (trainings || []).reduce((sum, t) => {
            return sum + (t.expenses || []).reduce((eSum, e) => eSum + toSafeNumber(e.amount), 0);
        }, 0);

        const totalAllocation = subprojectAllocation + trainingAllocation;

        // 5. Total Area (Crops only)
        const totalArea = (ipo.commodities || [])?.reduce((sum, c) => {
            if (c.type !== 'Livestock') {
                return sum + toSafeNumber(c.value);
            }
            return sum;
        }, 0) || 0;

        // 3. Income Calculation
        const reportedIncomes = (ipo.commodities || [])
            .map(commodity => toSafeNumber(commodity.averageIncome))
            .filter(income => income > 0);
        const totalIncome = reportedIncomes.reduce((sum, income) => sum + income, 0);
        const averageIncome = reportedIncomes.length > 0 ? totalIncome / reportedIncomes.length : 0;

        return {
            completedSPCount: completedSubprojects.length,
            completedTRCount: completedTrainings.length,
            totalInvestment,
            totalAllocation,
            totalArea,
            totalIncome,
            averageIncome
        };
    }, [subprojects, trainings, ipo.commodities]);

    const summaryScope = useMemo(() => {
        const linkedRecords = [...(subprojects || []), ...(trainings || [])];
        const fundingYears = Array.from(new Set(linkedRecords.map(item => item.fundingYear).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
        const fundTypes = Array.from(new Set(linkedRecords.map(item => item.fundType).filter(Boolean)));

        return {
            fundingYear: fundingYears.length === 0 ? 'N/A' : fundingYears.length === 1 ? `FY ${fundingYears[0]}` : `${fundingYears.length} fund years`,
            fundType: fundTypes.length === 0 ? 'N/A' : fundTypes.length === 1 ? String(fundTypes[0]) : `${fundTypes.length} fund types`
        };
    }, [subprojects, trainings]);
    
    useEffect(() => {
        // Reset form state if the viewed IPO changes or when exiting edit mode
        const isOther = !registeringBodyOptions.includes(ipo.registeringBody);
        const registrationBodyValue = isOther ? 'Others' : ipo.registeringBody;
        
        setEditedIpo({
            ...ipo,
            registeringBody: registrationBodyValue,
            registrationDate: ipo.registrationDate || '' // Ensure string for input
        });
        setBaseRegion(ipo.region); // Initialize base region with current IPO region

        if (isOther) {
            setOtherRegisteringBody(ipo.registeringBody);
        } else {
            setOtherRegisteringBody('');
        }
    }, [ipo, isEditing]);


    const handleCancelEdit = () => {
        setIsEditing(false);
        handleCancelCommodityEdit();
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setIsConfirmModalOpen(true);
    };

    const handleConfirmSave = async () => {
        const finalRegisteringBody = editedIpo.registeringBody === 'Others' ? otherRegisteringBody : editedIpo.registeringBody;
        
        const submissionData = { 
            ...editedIpo, 
            registeringBody: finalRegisteringBody,
            registrationDate: editedIpo.registrationDate || null,
            updated_at: new Date().toISOString()
        };

        // Determine changes for history logging
        const changes: string[] = [];
        if (JSON.stringify(ipo.commodities) !== JSON.stringify(submissionData.commodities)) {
            changes.push("Updated Commodities");
        }
        if (ipo.levelOfDevelopment !== submissionData.levelOfDevelopment) {
            changes.push(`Updated LOD from ${ipo.levelOfDevelopment} to ${submissionData.levelOfDevelopment}`);
        }
        if (
            ipo.totalMembers !== submissionData.totalMembers ||
            ipo.totalIpMembers !== submissionData.totalIpMembers ||
            ipo.totalMaleMembers !== submissionData.totalMaleMembers ||
            ipo.totalFemaleMembers !== submissionData.totalFemaleMembers
        ) {
            changes.push("Updated Membership Details");
        }
        if (ipo.name !== submissionData.name) {
             changes.push(`Renamed IPO from ${ipo.name} to ${submissionData.name}`);
        }
        // General updates catch-all if specific logic missed but object changed
        if (changes.length === 0 && JSON.stringify(ipo) !== JSON.stringify(submissionData)) {
            changes.push("Updated IPO Profile");
        }

        if (supabase) {
            try {
                const { error } = await supabase
                    .from('ipos')
                    .update(submissionData)
                    .eq('id', ipo.id);
                
                if (error) throw error;

                // Log History
                for (const change of changes) {
                    await addIpoHistory(ipo.id, change);
                }

                // Call Parent Update to refresh UI
                onUpdateIpo(submissionData);

            } catch (error: any) {
                console.error("Error updating IPO:", error);
                alert("Failed to update IPO: " + error.message);
                return; // Stop if error
            }
        } else {
             // Offline handling
             onUpdateIpo(submissionData);
        }

        setIsConfirmModalOpen(false);
        setIsEditing(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setEditedIpo(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'levelOfDevelopment' || name.startsWith('total')) {
            setEditedIpo(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
        } else {
            setEditedIpo(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleLocationChange = (locationString: string) => {
        const { province } = parseLocation(locationString);
        let region = editedIpo.region;
        
        // NIR Exception Logic
        if (province) {
            const p = province.toLowerCase();
            if (p.includes('negros occidental') || p.includes('negros oriental') || p.includes('siquijor')) {
                region = 'Negros Island Region (NIR)';
            } else if (baseRegion) {
                // If switching away from NIR province, revert to the base region selected in dropdown
                region = baseRegion;
            }
        }

        setEditedIpo(prev => ({
            ...prev,
            location: locationString,
            region: region
        }));
    };
    
    const handleRegionChange = (region: string) => {
        const normalized = normalizeRegionName(region);
        setBaseRegion(normalized); // Store user's selected region
        setEditedIpo(prev => ({
            ...prev,
            region: normalized,
        }));
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrentCommodity(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'type') {
            setCurrentCommodity(previous => ({
                type: value,
                particular: '',
                value: '',
                yield: '',
                isScad: false,
                potentialExpansionArea: '',
                numberOfFarmers: previous.numberOfFarmers,
                numberOfTrees: '',
                marketingPercentage: '',
                foodSecurityPercentage: '',
                averageIncome: ''
            }));
        } else {
            if (name === 'marketingPercentage' || name === 'foodSecurityPercentage') {
                const numValue = parseFloat(value);
                if (value !== '' && (isNaN(numValue) || numValue < 0)) return; // Prevent negative inputs

                const newValue = value === '' ? 0 : numValue;
                const otherKey = name === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                // Cast to access property dynamically
                const otherValue = parseFloat(String((currentCommodity as any)[otherKey]) || '0');

                if (newValue + otherValue > 100) {
                    return; // Prevent total exceeding 100%
                }
            }
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.type === 'Livestock';
        if (!currentCommodity.type || !currentCommodity.particular || !currentCommodity.value || (!isAnimal && !currentCommodity.yield)) {
            alert(`Please fill out all commodity fields including ${isAnimal ? 'Number of Heads' : 'Area and Yield'}.`);
            return;
        }
        let capacityFields: Pick<Commodity, 'potentialExpansionArea' | 'numberOfFarmers' | 'numberOfTrees'>;
        try {
            capacityFields = getCommodityCapacityValues(currentCommodity.type, currentCommodity);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Invalid commodity capacity value.');
            return;
        }
        const existingCommodity = editingCommodityIndex !== null ? editedIpo.commodities[editingCommodityIndex] : undefined;
        const newCommodity: Commodity = {
            ...existingCommodity,
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
            yield: isAnimal ? undefined : parseFloat(currentCommodity.yield),
            ...capacityFields,
            isScad: currentCommodity.isScad,
            marketingPercentage: currentCommodity.marketingPercentage ? parseFloat(currentCommodity.marketingPercentage) : undefined,
            foodSecurityPercentage: currentCommodity.foodSecurityPercentage ? parseFloat(currentCommodity.foodSecurityPercentage) : undefined,
            averageIncome: currentCommodity.averageIncome ? parseFloat(currentCommodity.averageIncome) : undefined,
        };

        if (editingCommodityIndex !== null) {
            // Edit Mode
            const updatedCommodities = [...editedIpo.commodities];
            updatedCommodities[editingCommodityIndex] = newCommodity;
            const hasScad = updatedCommodities.some(c => c.isScad);
            setEditedIpo(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
            setEditingCommodityIndex(null);
        } else {
            // Add Mode
            const updatedCommodities = [...editedIpo.commodities, newCommodity];
            const hasScad = updatedCommodities.some(c => c.isScad);
            setEditedIpo(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
        }

        setCurrentCommodity({
            type: '', particular: '', value: '', yield: '', isScad: false,
            potentialExpansionArea: '', numberOfFarmers: '', numberOfTrees: '',
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: ''
        });
    };

    const handleEditCommodity = (index: number) => {
        const commodity = editedIpo.commodities[index];
        setCurrentCommodity({
            type: commodity.type,
            particular: commodity.particular,
            value: String(commodity.value),
            yield: commodity.yield ? String(commodity.yield) : '',
            isScad: commodity.isScad || false,
            potentialExpansionArea: commodityCapacityToFormValue(commodity.potentialExpansionArea),
            numberOfFarmers: commodityCapacityToFormValue(commodity.numberOfFarmers),
            numberOfTrees: commodityCapacityToFormValue(commodity.numberOfTrees),
            marketingPercentage: commodity.marketingPercentage ? String(commodity.marketingPercentage) : '',
            foodSecurityPercentage: commodity.foodSecurityPercentage ? String(commodity.foodSecurityPercentage) : '',
            averageIncome: commodity.averageIncome ? String(commodity.averageIncome) : ''
        });
        setEditingCommodityIndex(index);
    };

    const handleCancelCommodityEdit = () => {
        setEditingCommodityIndex(null);
        setCurrentCommodity({
            type: '', particular: '', value: '', yield: '', isScad: false,
            potentialExpansionArea: '', numberOfFarmers: '', numberOfTrees: '',
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: ''
        });
    };

    const handleRemoveCommodity = (indexToRemove: number) => {
        const updatedCommodities = editedIpo.commodities.filter((_, index) => index !== indexToRemove);
        const hasScad = updatedCommodities.some(c => c.isScad);
        setEditedIpo(prev => ({
            ...prev,
            commodities: updatedCommodities,
            isWithScad: hasScad
        }));
        if (editingCommodityIndex === indexToRemove) {
            handleCancelCommodityEdit();
        }
    };

    const calculateTotalBudget = (details?: Subproject['details'] | null) => {
        return (details || []).reduce((total, item) => total + (toSafeNumber(item.pricePerUnit) * toSafeNumber(item.numberOfUnits)), 0);
    }
    
    const commonInputClasses = "form-control";
    if (isEditing) {
        return (
             <div className="form-page">
                 {isConfirmModalOpen && (
                    <ConfirmDialog
                        title="Confirm Changes"
                        description="Are you sure you want to save these changes?"
                        confirmLabel="Confirm"
                        tone="primary"
                        onCancel={() => setIsConfirmModalOpen(false)}
                        onConfirm={handleConfirmSave}
                    />
                )}
                <header className="detail-header">
                    <div className="detail-heading">
                        <h1 className="detail-title">Editing: {ipo.name}</h1>
                    </div>
                </header>
                 <form onSubmit={handleSubmit} className="form-card form-page">
                    <fieldset className="form-section">
                        <legend>IPO Profile</legend>
                        <div className="form-grid">
                            <div className="form-field--full">
                                <label htmlFor="name" className="form-label">IPO Name</label>
                                <input type="text" name="name" id="name" value={editedIpo.name} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                             <div className="form-field--full">
                                <label htmlFor="indigenousCulturalCommunity" className="form-label">Indigenous Cultural Community (ICC)</label>
                                <input type="text" name="indigenousCulturalCommunity" id="indigenousCulturalCommunity" value={editedIpo.indigenousCulturalCommunity} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            
                            <div className="form-field--full">
                                <label htmlFor="location" className="form-label">IPO Location</label>
                                <LocationPicker 
                                    value={editedIpo.location} 
                                    onChange={handleLocationChange} 
                                    onRegionChange={handleRegionChange} 
                                    required 
                                />
                            </div>
                            <div className="form-field--full">
                                <label htmlFor="ancestralDomainNo" className="form-label">Ancestral Domain No.</label>
                                <input type="text" name="ancestralDomainNo" id="ancestralDomainNo" value={editedIpo.ancestralDomainNo} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                             <div>
                                <label htmlFor="registeringBody" className="form-label">Registering Body</label>
                                <select name="registeringBody" id="registeringBody" value={editedIpo.registeringBody} onChange={handleInputChange} className={commonInputClasses}>
                                    {registeringBodyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    <option value="Others">Others</option>
                                </select>
                             </div>
                             {editedIpo.registeringBody === 'Others' && (
                                <div>
                                    <label htmlFor="otherRegisteringBody" className="form-label">Please Specify</label>
                                    <input type="text" name="otherRegisteringBody" id="otherRegisteringBody" value={otherRegisteringBody} onChange={(e) => setOtherRegisteringBody(e.target.value)} required className={commonInputClasses} />
                                </div>
                             )}
                              <div>
                                <label htmlFor="registrationDate" className="form-label">Registration Date</label>
                                <input type="date" name="registrationDate" id="registrationDate" value={editedIpo.registrationDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                             <div>
                                <label htmlFor="contactPerson" className="form-label">Contact Person</label>
                                <input type="text" name="contactPerson" id="contactPerson" value={editedIpo.contactPerson} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="contactNumber" className="form-label">Contact Number</label>
                                <input type="text" name="contactNumber" id="contactNumber" value={editedIpo.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                            <div className="form-field--full form-check-group">
                                 <label htmlFor="isWomenLed" className="form-check">
                                    <input type="checkbox" name="isWomenLed" id="isWomenLed" checked={editedIpo.isWomenLed} onChange={handleInputChange} />
                                    <span>Women-led</span>
                                </label>
                                <label htmlFor="isWithinGida" className="form-check">
                                    <input type="checkbox" name="isWithinGida" id="isWithinGida" checked={editedIpo.isWithinGida} onChange={handleInputChange} />
                                    <span>Within GIDA area</span>
                                </label>
                                <label htmlFor="isWithinElcac" className="form-check">
                                    <input type="checkbox" name="isWithinElcac" id="isWithinElcac" checked={editedIpo.isWithinElcac} onChange={handleInputChange} />
                                    <span>Within ELCAC area</span>
                                </label>
                                <label className="form-check is-disabled">
                                    <input type="checkbox" name="isWithScad" checked={editedIpo.isWithScad} disabled />
                                    <span>With SCAD</span>
                                </label>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className="form-section">
                        <legend>Commodities</legend>
                        <div className="space-y-2 mb-4">
                            {editedIpo.commodities.map((commodity, index) => (
                                <div key={index} className={`form-repeat-card ${editingCommodityIndex === index ? 'is-editing' : ''}`}>
                                    <div className="flex min-w-0 flex-col">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="form-repeat-card__title break-words">{commodity.particular}</span>
                                            <span className="form-repeat-card__type"> ({commodity.type}) — </span>
                                            <span>
                                                {formatFullNumber(commodity.value)} {commodity.type === 'Livestock' ? 'heads' : 'hectares'}
                                                {commodity.yield ? ` | Yield: ${formatFullNumber(commodity.yield)} kg/ha` : ''}
                                            </span>
                                            {commodity.isScad && <span className="status-badge status-badge--cyan status-badge--compact">SCAD</span>}
                                        </div>
                                        <div className="form-repeat-card__meta form-repeat-card__meta--inline">
                                            {commodity.type === 'Crop' && commodity.potentialExpansionArea !== undefined && <span>Expansion: {formatFullNumber(commodity.potentialExpansionArea)} ha</span>}
                                            {commodity.numberOfFarmers !== undefined && <span>Farmers: {formatFullNumber(commodity.numberOfFarmers)}</span>}
                                            {commodity.type === 'Crop' && commodity.numberOfTrees !== undefined && <span>Trees: {formatFullNumber(commodity.numberOfTrees)}</span>}
                                            {(commodity.marketingPercentage || 0) > 0 && <span>Marketing: {formatFullNumber(commodity.marketingPercentage)}%</span>}
                                            {(commodity.foodSecurityPercentage || 0) > 0 && <span>Food Security: {formatFullNumber(commodity.foodSecurityPercentage)}%</span>}
                                            {(commodity.averageIncome || 0) > 0 && <span title={formatCurrency(commodity.averageIncome || 0)}>Income: {formatCurrency(commodity.averageIncome || 0)}</span>}
                                        </div>
                                    </div>
                                    <div className="form-repeat-card__actions">
                                        <button type="button" onClick={() => handleEditCommodity(index)} className="table-action table-action--primary" title="Edit commodity">
                                            <Pencil className="btn-symbol" aria-hidden="true" />
                                        </button>
                                        <button type="button" onClick={() => handleRemoveCommodity(index)} className="table-action table-action--danger" title="Remove commodity">
                                            <Trash2 className="btn-symbol" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                             <div>
                                <label className="form-label">Type</label>
                                <select name="type" value={currentCommodity.type} onChange={handleCommodityChange} className={commonInputClasses}>
                                    <option value="">Select Type</option>
                                    {referenceCommodityTypes.map(type => ( <option key={type} value={type}>{type}</option> ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="form-label">Particular</label>
                                <select name="particular" value={currentCommodity.particular} onChange={handleCommodityChange} disabled={!currentCommodity.type} className={commonInputClasses}>
                                    <option value="">Select Particular</option>
                                    {currentCommodity.type && commodityCategories[currentCommodity.type] && commodityCategories[currentCommodity.type].map(item => ( <option key={item} value={item}>{item}</option> ))}
                                </select>
                            </div>
                             <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="form-label">{currentCommodity.type === 'Livestock' ? 'Number of Heads' : 'Area (Hectares)'}</label>
                                    <input type="number" name="value" value={currentCommodity.value} onChange={handleCommodityChange} min="0" step="any" className={commonInputClasses} />
                                </div>
                                {currentCommodity.type !== 'Livestock' && (
                                    <div className="flex-1">
                                        <label className="form-label">Avg Yield</label>
                                        <input type="number" name="yield" value={currentCommodity.yield} onChange={handleCommodityChange} min="0" step="any" className={commonInputClasses} />
                                    </div>
                                )}
                            </div>
                        </div>
                        {currentCommodity.type && (
                            <div className="commodity-capacity-fields form-divider">
                                {currentCommodity.type === 'Crop' && (
                                    <div>
                                        <label className="form-label">Potential Expansion Area (ha)</label>
                                        <input type="number" name="potentialExpansionArea" value={currentCommodity.potentialExpansionArea} onChange={handleCommodityChange} min="0" step="any" className={commonInputClasses} />
                                    </div>
                                )}
                                <div>
                                    <label className="form-label">Number of Farmers</label>
                                    <input type="number" name="numberOfFarmers" value={currentCommodity.numberOfFarmers} onChange={handleCommodityChange} min="0" step="1" className={commonInputClasses} />
                                </div>
                                {currentCommodity.type === 'Crop' && (
                                    <div>
                                        <label className="form-label">Number of Trees</label>
                                        <input type="number" name="numberOfTrees" value={currentCommodity.numberOfTrees} onChange={handleCommodityChange} min="0" step="1" className={commonInputClasses} />
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="commodity-edit-metrics commodity-edit-metrics--allocation">
                            <div>
                                <label className="form-label">Marketing %</label>
                                <input type="number" name="marketingPercentage" value={currentCommodity.marketingPercentage} onChange={handleCommodityChange} min="0" max="100" className={commonInputClasses} placeholder="0-100" />
                            </div>
                            <div>
                                <label className="form-label">Food Security %</label>
                                <input type="number" name="foodSecurityPercentage" value={currentCommodity.foodSecurityPercentage} onChange={handleCommodityChange} min="0" max="100" className={commonInputClasses} placeholder="0-100" />
                            </div>
                            <div>
                                {Number(currentCommodity.marketingPercentage) > 0 && (
                                    <div className="animate-fadeIn">
                                        <label className="form-label">Average Income (PHP)</label>
                                        <input type="number" name="averageIncome" value={currentCommodity.averageIncome} onChange={handleCommodityChange} min="0" className={commonInputClasses} placeholder="0.00" />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end items-end h-full">
                                {editingCommodityIndex !== null ? (
                                    <div className="flex gap-1 w-full">
                                        <button type="button" onClick={handleAddCommodity} className="btn btn-primary flex-grow"><Check className="btn-symbol" aria-hidden="true" />Update</button>
                                        <button type="button" onClick={handleCancelCommodityEdit} className="btn btn-secondary"><X className="btn-symbol" aria-hidden="true" />Cancel</button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={handleAddCommodity} className="btn btn-primary btn-icon" title="Add commodity"><Plus className="btn-symbol" aria-hidden="true" /></button>
                                )}
                            </div>
                        </div>
                        <div className="mt-2">
                            <label className="form-check">
                                <input type="checkbox" name="isScad" checked={currentCommodity.isScad} onChange={handleCommodityChange} />
                                <span>SCAD commodity</span>
                            </label>
                        </div>
                    </fieldset>
                    

                    <fieldset className="form-section">
                        <legend>Membership Information</legend>
                        <div className="form-grid">
                            <div>
                                <label htmlFor="totalMembers" className="form-label">Total Members</label>
                                <input type="number" name="totalMembers" id="totalMembers" value={editedIpo.totalMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalIpMembers" className="form-label">Total IP Members</label>
                                <input type="number" name="totalIpMembers" id="totalIpMembers" value={editedIpo.totalIpMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="total4PsMembers" className="form-label">Total 4Ps Beneficiaries</label>
                                <input type="number" name="total4PsMembers" id="total4PsMembers" value={editedIpo.total4PsMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalMaleMembers" className="form-label">Male Members</label>
                                <input type="number" name="totalMaleMembers" id="totalMaleMembers" value={editedIpo.totalMaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalFemaleMembers" className="form-label">Female Members</label>
                                <input type="number" name="totalFemaleMembers" id="totalFemaleMembers" value={editedIpo.totalFemaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="form-label">&nbsp;</label>
                                <span className="detail-value">Total: {(editedIpo.totalMaleMembers || 0) + (editedIpo.totalFemaleMembers || 0)}</span>
                            </div>
                            <div>
                                <label htmlFor="totalYouthMembers" className="form-label">Youth Members</label>
                                <input type="number" name="totalYouthMembers" id="totalYouthMembers" value={editedIpo.totalYouthMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalSeniorMembers" className="form-label">Senior Citizen Members</label>
                                <input type="number" name="totalSeniorMembers" id="totalSeniorMembers" value={editedIpo.totalSeniorMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    <div className="form-footer">
                        <button type="button" onClick={handleCancelEdit} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            Save Changes
                        </button>
                    </div>
                 </form>
            </div>
        )
    }

    // ... (rest of view mode)
    return (
        <RecordDetailPage className="ipo-detail-page ipo-record-detail-page">
            {driveToast && (
                <div className={`ipo-drive-toast ipo-drive-toast--${driveToast.type}`} role="status" aria-live="polite">
                    {driveToast.type === 'success' ? <Check aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                    <span>{driveToast.message}</span>
                    <button type="button" onClick={() => setDriveToast(null)} aria-label="Dismiss message">
                        <X aria-hidden="true" />
                    </button>
                </div>
            )}
            {openTableFilter && (
                <ColumnFilterDialog
                    open
                    title={`Filter ${openTableFilter === 'market' ? 'Market Linkages' : openTableFilter === 'monitoring' ? 'Monitoring Reports' : openTableFilter.charAt(0).toUpperCase() + openTableFilter.slice(1)}`}
                    fields={tableFilterFields[openTableFilter]}
                    filters={tableFilters[openTableFilter]}
                    onApply={filters => {
                        setTableFilters(previous => ({ ...previous, [openTableFilter]: filters }));
                        setOpenTableFilter(null);
                    }}
                    onClose={() => setOpenTableFilter(null)}
                />
            )}
            {driveFilePendingDelete && (
                <div className="dashboard-modal-backdrop" onClick={() => !deletingDriveFileId && setDriveFilePendingDelete(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>Delete Drive File</h3>
                                <p className="dashboard-modal__metric-subtext">This removes the file from the 4KIS file list and attempts to delete it from Google Drive.</p>
                            </div>
                            <button type="button" onClick={() => setDriveFilePendingDelete(null)} className="dashboard-modal__close" aria-label="Close delete confirmation" disabled={!!deletingDriveFileId}>
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="dashboard-modal__body">
                            <div className="dashboard-modal__event">
                                <p className="dashboard-modal__metric-label">File</p>
                                <p className="dashboard-modal__metric-value">{driveFilePendingDelete.file_name}</p>
                                <p className="dashboard-modal__metric-subtext">{formatFileSize(driveFilePendingDelete.file_size)} - Uploaded by {driveFilePendingDelete.uploaded_by_name || 'Unknown user'}</p>
                            </div>
                        </div>
                        <div className="dashboard-modal__actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDriveFilePendingDelete(null)} disabled={!!deletingDriveFileId}>Cancel</button>
                            <button type="button" className="btn btn-danger" onClick={handleDriveFileDelete} disabled={!!deletingDriveFileId}>
                                {deletingDriveFileId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                                Delete File
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {sectionModal === 'gallery' && (
                <IpoSectionModal
                    title="IPO Gallery"
                    description={ipo.name}
                    count={galleryFiles.length}
                    onClose={closeSectionModal}
                >
                    <EntityGallery
                        storageKey="ipo"
                        files={galleryFiles}
                        isLoading={isDriveLoading}
                        canEdit={canEdit}
                        canDelete={canDeleteDriveFiles}
                        isConnected={!!driveStatus?.isConnected}
                        getImageUrl={getIpoDriveImageUrl}
                        uploadFile={uploadDriveFile}
                        updateMetadata={(file, name, imageCaption) => updateIpoDriveFileMetadata(currentUser, file.id, name, imageCaption)}
                        onFileAdded={file => setDriveFiles(current => [file, ...current])}
                        onFileUpdated={file => setDriveFiles(current => current.map(item => item.id === file.id ? file : item))}
                        onRequestDelete={requestDriveFileDelete}
                        onRefresh={loadDriveFiles}
                        onMessage={(message, hasErrors) => showDriveToast(hasErrors ? 'error' : 'success', message)}
                        showUploader={false}
                        view={galleryView}
                        onViewChange={setGalleryView}
                    />
                </IpoSectionModal>
            )}
            {sectionModal === 'galleryUpload' && (
                <DriveUploadModal
                    section="gallery"
                    title="Upload Gallery Images"
                    description="Add field photos to the IPO Gallery. Images remain separate from IPO Files."
                    canUpload={canEdit}
                    isConnected={!!driveStatus?.isConnected}
                    uploadFile={uploadDriveFile}
                    onUploaded={file => setDriveFiles(current => [file, ...current])}
                    onBatchComplete={(message, hasErrors) => showDriveToast(hasErrors ? 'error' : 'success', message)}
                    onClose={closeSectionModal}
                />
            )}
            {sectionModal === 'filesUpload' && (
                <DriveUploadModal
                    section="files"
                    title="Add IPO Files"
                    description="Upload supporting documents and images to IPO Files. These files do not appear in the Gallery."
                    canUpload={canEdit}
                    isConnected={!!driveStatus?.isConnected}
                    uploadFile={uploadDriveFile}
                    onUploaded={file => setDriveFiles(current => [file, ...current])}
                    onBatchComplete={(message, hasErrors) => showDriveToast(hasErrors ? 'error' : 'success', message)}
                    onClose={closeSectionModal}
                />
            )}
            {sectionModal === 'monitoringReport' && selectedMonitoringReport && (() => {
                const activity = monitoringActivityById.get(Number(selectedMonitoringReport.activity_id));
                const reportActions = monitoringActions
                    .filter(action => Number(action.monitoring_report_id) === Number(selectedMonitoringReport.id) && !action.deleted_at)
                    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
                return (
                    <IpoSectionModal
                        title="Monitoring Report"
                        description={activity?.name || `Activity ${selectedMonitoringReport.activity_id}`}
                        onClose={closeSectionModal}
                    >
                        <div className="ipo-monitoring-modal">
                            <dl className="ipo-monitoring-modal__meta">
                                <DetailItem label="IPO" value={ipo.name} half />
                                <DetailItem label="Activity" value={activity?.name || `Activity ${selectedMonitoringReport.activity_id}`} half />
                                <DetailItem label="Component" value={activity?.component || 'Not recorded'} half />
                                <DetailItem label="Activity Date" value={formatDate(activity?.date)} half />
                                <DetailItem label="Status" value={selectedMonitoringReport.status} half />
                                <DetailItem label="Updated" value={formatDate(selectedMonitoringReport.updated_at)} half />
                                <DetailItem label="Reporter" value={selectedMonitoringReport.reported_by_name || 'Not recorded'} />
                            </dl>
                            {[
                                ['Findings', selectedMonitoringReport.findings],
                                ['Issues', selectedMonitoringReport.issues],
                                ['Recommendations', selectedMonitoringReport.recommendations]
                            ].map(([label, value]) => (
                                <section key={label} className="ipo-monitoring-modal__field">
                                    <h4>{label}</h4>
                                    <p>{value || 'No information recorded.'}</p>
                                </section>
                            ))}
                            <section className="ipo-monitoring-modal__field">
                                <h4>Latest Action</h4>
                                <p>{reportActions[0]?.action_taken || 'No action recorded.'}</p>
                            </section>
                            <section className="ipo-monitoring-modal__field">
                                <h4>Action Timeline</h4>
                                {reportActions.length > 0 ? (
                                    <ol className="ipo-monitoring-modal__timeline">
                                        {reportActions.map(action => (
                                            <li key={action.id}>
                                                <span>{formatDate(action.created_at)}</span>
                                                <strong>{action.action_taken}</strong>
                                                <small>by {action.created_by_name || 'Unknown user'}</small>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p>No actions recorded.</p>
                                )}
                            </section>
                            {activity && onOpenMonitoringReport && (
                                <div className="dashboard-modal__actions ipo-monitoring-modal__actions">
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => {
                                            closeSectionModal();
                                            onOpenMonitoringReport(activity, ipo, selectedMonitoringReport);
                                        }}
                                    >
                                        <ExternalLink aria-hidden="true" />
                                        Open Full Report
                                    </button>
                                </div>
                            )}
                        </div>
                    </IpoSectionModal>
                );
            })()}
            {sectionModal === 'marketLinkage' && selectedMarketLinkage && (() => {
                const selectedCommodityNeed = (selectedMarketLinkage.partner.commodityNeeds || []).find(need =>
                    String(need.id) === String(selectedMarketLinkage.link.commodityNeedId)
                ) || (selectedMarketLinkage.partner.commodityNeeds || []).find(need =>
                    need.name === selectedMarketLinkage.link.commodityName && need.type === selectedMarketLinkage.link.commodityType
                );
                return (
                    <IpoSectionModal
                        title="Market Linkage"
                        description={selectedMarketLinkage.partner.companyName}
                        compact
                        onClose={closeSectionModal}
                    >
                        <dl className="ipo-market-modal__details">
                            <DetailItem label="Buyer" value={selectedMarketLinkage.partner.companyName} />
                            <DetailItem label="Commodity" value={getMarketLinkageCommodityLabel(selectedMarketLinkage.link)} half />
                            <DetailItem label="Agreement Type" value={selectedMarketLinkage.link.agreementType} half />
                            <DetailItem label="Agreement Date" value={formatDate(selectedMarketLinkage.link.agreementDate)} half />
                            <DetailItem label="Status" value={selectedMarketLinkage.link.negotiationStatus} half />
                            <DetailItem label="Quantity" value={`${formatFullNumber(selectedMarketLinkage.quantity)} ${selectedMarketLinkage.unitOfMeasure}`} half />
                            <DetailItem label="Price" value={`${formatCurrency(selectedMarketLinkage.pricePerUnit)} / ${selectedMarketLinkage.unitOfMeasure}`} half />
                            <DetailItem label="Sales Value" value={formatCurrency(selectedMarketLinkage.salesValue)} />
                            {selectedCommodityNeed && (
                                <DetailItem
                                    label="Buyer Requirement"
                                    value={`${formatFullNumber(getCommodityNeedAnnualVolume(selectedCommodityNeed))} Kg/year · ${selectedCommodityNeed.qualityStandard || 'Quality not specified'}`}
                                />
                            )}
                        </dl>
                        {onSelectMarketingPartner && (
                            <div className="dashboard-modal__actions">
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => {
                                        closeSectionModal();
                                        onSelectMarketingPartner(selectedMarketLinkage.partner);
                                    }}
                                >
                                    <ExternalLink aria-hidden="true" />
                                    Open Buyer Profile
                                </button>
                            </div>
                        )}
                    </IpoSectionModal>
                );
            })()}
            <header className="record-detail-header">
                <div className="record-detail-header__main">
                    <h1 className="record-detail-header__title">{ipo.name}</h1>
                    <div className="record-detail-header__meta">
                        <span className="ipo-detail-record-id">IPO-{ipo.id}</span>
                        <span><MapPin aria-hidden="true" />{ipo.region}{ipo.location ? ` · ${ipo.location}` : ''}</span>
                        <span><CalendarDays aria-hidden="true" />Registered {formatDate(ipo.registrationDate)}</span>
                    </div>
                </div>
                <div className="record-detail-header__actions">
                    {canEdit && (
                        <button onClick={() => setIsEditing(true)} className="btn btn-secondary">
                            <Edit3 className="btn-symbol" aria-hidden="true" />
                            Edit IPO
                        </button>
                    )}
                </div>
            </header>

            <RecordKpiGrid aria-label="IPO overview statistics">
                <OverviewMetric
                    label="Total Investment"
                    value={formatCompactCurrency(overviewStats.totalInvestment)}
                    fullValue={formatCurrency(overviewStats.totalInvestment)}
                    note="Cumulative"
                    icon={<Wallet aria-hidden="true" />}
                />
                <OverviewMetric
                    label="Total Allocation"
                    value={formatCompactCurrency(overviewStats.totalAllocation)}
                    fullValue={formatCurrency(overviewStats.totalAllocation)}
                    note={`${subprojects.length + trainings.length} linked records`}
                    icon={<Coins aria-hidden="true" />}
                />
                <OverviewMetric
                    label="Linked Markets"
                    value={formatCompactNumber(ipoMarketSalesSummary.linkedMarketCount)}
                    fullValue={ipoMarketSalesSummary.linkedMarketCount.toLocaleString()}
                    note={ipoMarketSalesSummary.linkedMarketCount > 0 ? `${formatCompactCurrency(ipoMarketSalesSummary.totalSales)} recorded sales` : 'No linkages yet'}
                    icon={<Store aria-hidden="true" />}
                />
                <OverviewMetric
                    label="Total Area (Agri)"
                    value={`${formatCompactNumber(overviewStats.totalArea)} ha`}
                    fullValue={`${overviewStats.totalArea.toLocaleString()} ha`}
                    note="Across crop commodities"
                    icon={<Ruler aria-hidden="true" />}
                />
                <OverviewMetric
                    label="Avg. Annual Income"
                    value={overviewStats.averageIncome > 0 ? formatCompactCurrency(overviewStats.averageIncome) : '—'}
                    fullValue={overviewStats.averageIncome > 0 ? formatCurrency(overviewStats.averageIncome) : 'No income reported'}
                    note={overviewStats.averageIncome > 0 ? 'Per reported commodity' : 'Not reported'}
                    icon={<TrendingUp aria-hidden="true" />}
                />
                <OverviewMetric
                    label="Subprojects"
                    value={formatCompactNumber(subprojects.length)}
                    fullValue={subprojects.length.toLocaleString()}
                    note={`${overviewStats.completedSPCount.toLocaleString()} completed`}
                    icon={<Layers aria-hidden="true" />}
                />
            </RecordKpiGrid>

            <RecordDetailGrid>
                <RecordDetailMain>
                    <IpoDetailPanel
                        title="Level of Development"
                        description="Annual maturity scoring based on the IPO's recorded assessments"
                        className="ipo-table-panel ipo-lod-panel"
                        footer={<IpoTableCount filtered={lodAssessments.length} total={lodAssessments.length} />}
                    >
                        {lodAssessments.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--lod">
                                    <colgroup>
                                        <col className="ipo-table-col--lod-year" />
                                        <col className="ipo-table-col--lod-level" />
                                        <col className="ipo-table-col--lod-score" />
                                        <col className="ipo-table-col--lod-answered" />
                                        <col className="ipo-table-col--lod-source" />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th>Year</th>
                                            <th>Level</th>
                                            <th className="data-table__numeric">Score</th>
                                            <th className="data-table__numeric">Answered</th>
                                            <th>Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lodAssessments.map(assessment => {
                                            const isCurrentYear = assessment.year === new Date().getFullYear();
                                            const state = getLodEffectiveState(assessment);
                                            const openAssessment = () => onSelectLodYear?.(ipo, assessment.year);
                                            return (
                                                <tr
                                                    key={assessment.id}
                                                    className="ipo-detail-table-row--clickable"
                                                    onClick={openAssessment}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            openAssessment();
                                                        }
                                                    }}
                                                    role="link"
                                                    tabIndex={0}
                                                    title={`Open ${assessment.year} LOD assessment`}
                                                >
                                                    <td className="data-table__primary">{assessment.year}{isCurrentYear ? ' (Current)' : ''}</td>
                                                    <td>{state.label}</td>
                                                    <td className="data-table__numeric">{formatFullNumber(assessment.total_score)}</td>
                                                    <td className="data-table__numeric">{assessment.answered_question_count ?? 0} / {assessment.required_question_count ?? 0}</td>
                                                    <td><TruncatedTableCell value={getLodAssessmentSource(assessment)} /></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="detail-empty">No assessments available.</p>
                        )}
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="Commodities"
                        description="Registered production lines, coverage, and livelihood indicators"
                        className="ipo-table-panel ipo-commodities-panel"
                        footer={<IpoTableCount filtered={ipo.commodities?.length || 0} total={ipo.commodities?.length || 0} />}
                    >
                        {ipo.commodities && ipo.commodities.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--commodities">
                                    <colgroup>
                                        <col className="ipo-table-col--commodity-name" />
                                        <col className="ipo-table-col--commodity-type" />
                                        <col className="ipo-table-col--coverage" />
                                        <col className="ipo-table-col--yield" />
                                        <col className="ipo-table-col--expansion-area" />
                                        <col className="ipo-table-col--farmers" />
                                        <col className="ipo-table-col--trees" />
                                        <col className="ipo-table-col--marketing" />
                                        <col className="ipo-table-col--food-security" />
                                        <col className="ipo-table-col--income" />
                                        <col className="ipo-table-col--scad" />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th>Commodity</th>
                                            <th>Type</th>
                                            <th className="data-table__numeric">Coverage</th>
                                            <th className="data-table__numeric">Avg. Yield</th>
                                            <th className="data-table__numeric">Potential Expansion Area</th>
                                            <th className="data-table__numeric">Number of Farmers</th>
                                            <th className="data-table__numeric">Number of Trees</th>
                                            <th className="data-table__numeric">Marketing</th>
                                            <th className="data-table__numeric">Food Security</th>
                                            <th className="data-table__numeric">Avg. Income</th>
                                            <th>SCAD</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ipo.commodities.map((commodity, index) => (
                                            <tr key={`${commodity.particular}-${index}`}>
                                                <td className="data-table__primary"><TruncatedTableCell value={commodity.particular} /></td>
                                                <td><TruncatedTableCell value={commodity.type} /></td>
                                                <td className="data-table__numeric" title={`${formatFullNumber(commodity.value)} ${commodity.type === 'Livestock' ? 'heads' : 'ha'}`}>
                                                    {formatFullNumber(commodity.value)} {commodity.type === 'Livestock' ? 'heads' : 'ha'}
                                                </td>
                                                <td className="data-table__numeric" title={commodity.yield ? `${formatFullNumber(commodity.yield)} kg/ha` : 'N/A'}>
                                                    {commodity.yield ? `${formatFullNumber(commodity.yield)} kg/ha` : 'N/A'}
                                                </td>
                                                <td className="data-table__numeric" title={commodity.type === 'Crop' && commodity.potentialExpansionArea !== undefined ? `${formatFullNumber(commodity.potentialExpansionArea)} ha` : undefined}>
                                                    {commodity.type === 'Crop' && commodity.potentialExpansionArea !== undefined ? `${formatFullNumber(commodity.potentialExpansionArea)} ha` : ''}
                                                </td>
                                                <td className="data-table__numeric" title={commodity.numberOfFarmers !== undefined ? formatFullNumber(commodity.numberOfFarmers) : undefined}>
                                                    {commodity.numberOfFarmers !== undefined ? formatFullNumber(commodity.numberOfFarmers) : ''}
                                                </td>
                                                <td className="data-table__numeric" title={commodity.type === 'Crop' && commodity.numberOfTrees !== undefined ? formatFullNumber(commodity.numberOfTrees) : undefined}>
                                                    {commodity.type === 'Crop' && commodity.numberOfTrees !== undefined ? formatFullNumber(commodity.numberOfTrees) : ''}
                                                </td>
                                                <td className="data-table__numeric">{formatFullNumber(commodity.marketingPercentage || 0)}%</td>
                                                <td className="data-table__numeric">{formatFullNumber(commodity.foodSecurityPercentage || 0)}%</td>
                                                <td className="data-table__numeric" title={formatCurrency(commodity.averageIncome || 0)}>
                                                    {formatCompactCurrency(commodity.averageIncome || 0)}
                                                </td>
                                                <td>{commodity.isScad ? 'Yes' : 'No'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">No commodities listed.</p>}
                    </IpoDetailPanel>

                    {(linkedDcfLoading || linkedDcfError) && (
                        <div className={`ipo-linked-dcf-status ${linkedDcfError ? 'ipo-linked-dcf-status--warning' : ''}`} role="status">
                            {linkedDcfLoading ? (
                                <>
                                    <Loader2 className="animate-spin" aria-hidden="true" />
                                    <span>Loading all linked Subprojects, Trainings, and Monitoring Reports for this IPO...</span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle aria-hidden="true" />
                                    <span>{linkedDcfError}</span>
                                </>
                            )}
                        </div>
                    )}


                    <IpoDetailPanel
                        title="Subprojects"
                        description="All linked subprojects"
                        className="ipo-table-panel"
                        actions={<IpoTableFilterButton label="Subprojects" count={activeFilterCount('subprojects')} onClick={() => setOpenTableFilter('subprojects')} />}
                        footer={<IpoTableCount filtered={filteredSubprojects.length} total={subprojects.length} />}
                    >
                        {filteredSubprojects.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--subprojects">
                                    <colgroup>
                                        <col className="ipo-table-col--code" />
                                        <col className="ipo-table-col--name" />
                                        <col className="ipo-table-col--year" />
                                        <col className="ipo-table-col--status" />
                                        <col className="ipo-table-col--location" />
                                        <col className="ipo-table-col--date" />
                                        <col className="ipo-table-col--date" />
                                        <col className="ipo-table-col--physical" />
                                        <col className="ipo-table-col--budget" />
                                    </colgroup>
                                    <thead><tr>
                                        <th>Code</th>
                                        <th>Subproject</th>
                                        <th>FY</th>
                                        <th>Status</th>
                                        <th>Location</th>
                                        <th>Target Completion</th>
                                        <th>Actual Completion</th>
                                        <th className="data-table__numeric">Physical</th>
                                        <th className="data-table__numeric">Budget</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredSubprojects.map(project => (
                                            <tr key={project.id}>
                                                <td><TruncatedTableCell value={project.uid || project.id} /></td>
                                                <td className="data-table__primary"><button type="button" className="table-link" title={project.name} onClick={() => onSelectSubproject(project)}>{project.name}</button></td>
                                                <td title={String(project.fundingYear || 'N/A')}>{project.fundingYear || 'N/A'}</td>
                                                <td><span className={getStatusBadge(project.status)}>{project.status}</span></td>
                                                <td><TruncatedTableCell value={project.location || 'Not recorded'} /></td>
                                                <td title={formatDate(project.estimatedCompletionDate)}>{formatDate(project.estimatedCompletionDate)}</td>
                                                <td title={formatDate(project.actualCompletionDate)}>{formatDate(project.actualCompletionDate)}</td>
                                                <td className="data-table__numeric" title={`${getSubprojectPhysicalRate(project)}%`}>{getSubprojectPhysicalRate(project)}%</td>
                                                <td className="data-table__numeric" title={formatCurrency(calculateTotalBudget(project.details))}>{formatCompactCurrency(calculateTotalBudget(project.details))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">No subprojects match the active filters.</p>}
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="Activities"
                        description="All linked trainings and activities"
                        className="ipo-table-panel"
                        actions={<IpoTableFilterButton label="Activities" count={activeFilterCount('activities')} onClick={() => setOpenTableFilter('activities')} />}
                        footer={<IpoTableCount filtered={filteredActivities.length} total={trainings.length} />}
                    >
                        {filteredActivities.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--activities">
                                    <colgroup>
                                        <col className="ipo-table-col--code" />
                                        <col className="ipo-table-col--name" />
                                        <col className="ipo-table-col--component" />
                                        <col className="ipo-table-col--type" />
                                        <col className="ipo-table-col--year" />
                                        <col className="ipo-table-col--status" />
                                        <col className="ipo-table-col--date-range" />
                                        <col className="ipo-table-col--date-range" />
                                        <col className="ipo-table-col--location" />
                                    </colgroup>
                                    <thead><tr>
                                        <th>Code</th>
                                        <th>Activity Name</th>
                                        <th>Component</th>
                                        <th>Type</th>
                                        <th>FY</th>
                                        <th>Status</th>
                                        <th>Schedule</th>
                                        <th>Actual Conduct Date</th>
                                        <th>Location</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredActivities.map(activity => {
                                            const schedule = formatDateRange(activity.date, activity.endDate);
                                            const actualConductDate = formatDateRange(activity.actualDate, activity.actualEndDate);
                                            return (
                                            <tr key={activity.id}>
                                                <td><TruncatedTableCell value={activity.uid || activity.id} /></td>
                                                <td className="data-table__primary"><button type="button" className="table-link" title={activity.name} onClick={() => onSelectActivity(activity)}>{activity.name}</button></td>
                                                <td><TruncatedTableCell value={activity.component || 'Not recorded'} /></td>
                                                <td title={activity.type}>{activity.type}</td>
                                                <td title={String(activity.fundingYear || 'N/A')}>{activity.fundingYear || 'N/A'}</td>
                                                <td><span className={getTrainingStatusBadge(activity.status)}>{activity.status}</span></td>
                                                <td title={schedule}>{schedule}</td>
                                                <td title={actualConductDate}>{actualConductDate}</td>
                                                <td><TruncatedTableCell value={activity.location || 'Not recorded'} /></td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">No activities match the active filters.</p>}
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="Monitoring Reports"
                        description="Reports linked to this IPO"
                        className="ipo-table-panel"
                        actions={<IpoTableFilterButton label="Monitoring Reports" count={activeFilterCount('monitoring')} onClick={() => setOpenTableFilter('monitoring')} />}
                        footer={<IpoTableCount filtered={filteredMonitoringReports.length} total={monitoringReports.length} />}
                    >
                        {isMonitoringLoading ? <p className="detail-empty">Loading monitoring reports...</p> : filteredMonitoringReports.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--monitoring">
                                    <colgroup>
                                        <col className="ipo-table-col--monitoring-activity" />
                                        <col className="ipo-table-col--component" />
                                        <col className="ipo-table-col--activity-date" />
                                        <col className="ipo-table-col--status" />
                                        <col className="ipo-table-col--updated" />
                                        <col className="ipo-table-col--reporter" />
                                        <col className="ipo-table-col--latest-action" />
                                    </colgroup>
                                    <thead><tr>
                                        <th>Activity</th>
                                        <th>Component</th>
                                        <th>Activity Date</th>
                                        <th>Status</th>
                                        <th>Updated</th>
                                        <th>Reporter</th>
                                        <th>Latest Action</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredMonitoringReports.map(report => {
                                            const activity = monitoringActivityById.get(Number(report.activity_id));
                                            const latestAction = latestMonitoringActions[report.id];
                                            return (
                                                <tr key={report.id} className="ipo-monitoring-row" tabIndex={0} role="button" title="Open monitoring report"
                                                    onClick={() => { setSelectedMonitoringReport(report); setSectionModal('monitoringReport'); }}
                                                    onKeyDown={event => {
                                                        if (event.key === 'Enter' || event.key === ' ') {
                                                            event.preventDefault();
                                                            setSelectedMonitoringReport(report);
                                                            setSectionModal('monitoringReport');
                                                        }
                                                    }}
                                                >
                                                    <td className="data-table__primary"><TruncatedTableCell value={activity?.name || 'Activity ' + report.activity_id} /></td>
                                                    <td><TruncatedTableCell value={activity?.component || 'Not recorded'} /></td>
                                                    <td title={formatDate(activity?.date)}>{formatDate(activity?.date)}</td>
                                                    <td title={report.status}>{report.status}</td>
                                                    <td title={formatDate(report.updated_at)}>{formatDate(report.updated_at)}</td>
                                                    <td><TruncatedTableCell value={report.reported_by_name || 'Not recorded'} /></td>
                                                    <td><TruncatedTableCell value={latestAction?.action_taken || 'No action recorded'} /></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">{monitoringMessage || 'No monitoring reports are linked to this IPO.'}</p>}
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="Market Linkages"
                        description="Buyers and offtakers"
                        className="ipo-table-panel ipo-market-panel"
                        actions={<IpoTableFilterButton label="Market Linkages" count={activeFilterCount('market')} onClick={() => setOpenTableFilter('market')} />}
                        footer={<IpoTableCount filtered={filteredMarketLinkages.length} total={ipoLinkages.length} />}
                    >
                        <div className="ipo-market-summary">
                            <OverviewMetric label="Linked Markets" value={formatFullNumber(ipoMarketSalesSummary.linkedMarketCount)} />
                            <OverviewMetric label="Total Quantity Sold" value={formatMarketQuantityTotals(ipoMarketSalesSummary.totalQuantityByUnit)} fullValue={formatMarketQuantityTotals(ipoMarketSalesSummary.totalQuantityByUnit)} />
                            <OverviewMetric label="Total Sales" value={formatCompactCurrency(ipoMarketSalesSummary.totalSales)} fullValue={formatCurrency(ipoMarketSalesSummary.totalSales)} />
                        </div>
                        {filteredMarketLinkages.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--market">
                                    <colgroup>
                                        <col className="ipo-table-col--buyer" />
                                        <col className="ipo-table-col--commodity" />
                                        <col className="ipo-table-col--agreement" />
                                        <col className="ipo-table-col--market-date" />
                                        <col className="ipo-table-col--quantity" />
                                        <col className="ipo-table-col--price" />
                                        <col className="ipo-table-col--sales" />
                                        <col className="ipo-table-col--market-status" />
                                        <col className="ipo-table-col--view" />
                                    </colgroup>
                                    <thead><tr>
                                        <th>Buyer</th>
                                        <th>Commodity</th>
                                        <th>Agreement</th>
                                        <th>Date</th>
                                        <th className="data-table__numeric">Quantity</th>
                                        <th className="data-table__numeric">Price</th>
                                        <th className="data-table__numeric">Sales</th>
                                        <th>Status</th>
                                        <th>View</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredMarketLinkages.map(item => (
                                            <tr key={[item.partner.id, item.link.id].join('-')}>
                                                <td className="data-table__primary"><button type="button" className="table-link" title={item.partner.companyName} onClick={() => onSelectMarketingPartner?.(item.partner)}>{item.partner.companyName}</button></td>
                                                <td><TruncatedTableCell value={getMarketLinkageCommodityLabel(item.link)} /></td>
                                                <td title={item.link.agreementType}>{item.link.agreementType}</td>
                                                <td title={formatDate(item.link.agreementDate)}>{formatDate(item.link.agreementDate)}</td>
                                                <td className="data-table__numeric" title={`${formatFullNumber(item.quantity)} ${item.unitOfMeasure}`}>{formatFullNumber(item.quantity)} {item.unitOfMeasure}</td>
                                                <td className="data-table__numeric" title={formatCurrency(item.pricePerUnit)}>{formatCurrency(item.pricePerUnit)}</td>
                                                <td className="data-table__numeric" title={formatCurrency(item.salesValue)}>{formatCurrency(item.salesValue)}</td>
                                                <td title={item.link.negotiationStatus}>{item.link.negotiationStatus}</td>
                                                <td>
                                                    <button type="button" className="table-link ipo-market-view-link" title="View market linkage" aria-label={'View ' + item.partner.companyName + ' market linkage'}
                                                        onClick={() => { setSelectedMarketLinkage(item); setSectionModal('marketLinkage'); }}>
                                                        View linkage
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">No marketing linkages match the active filters.</p>}
                    </IpoDetailPanel>

                    {/* Gallery Card */}
                    <IpoDetailPanel
                        title="Gallery"
                        description="Field photos and community activity"
                        actions={(
                            <>
                                <GalleryViewToggle view={galleryView} onChange={setGalleryView} />
                                <button type="button" className="btn btn-secondary btn-compact" onClick={loadDriveFiles} disabled={isDriveLoading}>
                                    <RefreshCw className={isDriveLoading ? 'animate-spin' : ''} aria-hidden="true" />
                                    Refresh
                                </button>
                                {canEdit && (
                                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => setSectionModal('galleryUpload')}>
                                        <UploadCloud aria-hidden="true" />
                                        Upload
                                    </button>
                                )}
                            </>
                        )}
                    >
                        <EntityGallery
                            storageKey="ipo"
                            files={galleryFiles}
                            isLoading={isDriveLoading}
                            canEdit={canEdit}
                            canDelete={canDeleteDriveFiles}
                            isConnected={!!driveStatus?.isConnected}
                            getImageUrl={getIpoDriveImageUrl}
                            uploadFile={uploadDriveFile}
                            updateMetadata={(file, name, imageCaption) => updateIpoDriveFileMetadata(currentUser, file.id, name, imageCaption)}
                            onFileAdded={file => setDriveFiles(current => [file, ...current])}
                            onFileUpdated={file => setDriveFiles(current => current.map(item => item.id === file.id ? file : item))}
                            onRequestDelete={requestDriveFileDelete}
                            onRefresh={loadDriveFiles}
                            onMessage={(message, hasErrors) => showDriveToast(hasErrors ? 'error' : 'success', message)}
                            showUploader={false}
                            showToolbar={false}
                            view={galleryView}
                            onViewChange={setGalleryView}
                            itemLimit={8}
                            onViewAll={galleryFiles.length > 8 ? () => setSectionModal('gallery') : undefined}
                        />
                    </IpoDetailPanel>

                    {/* IPO Files Card */}
                    <IpoDetailPanel
                        title="IPO Files"
                        description="Supporting documents, separate from the Gallery"
                        actions={(
                            <>
                                <button type="button" className="btn btn-secondary btn-compact" onClick={loadDriveFiles} disabled={isDriveLoading}>
                                    <RefreshCw aria-hidden="true" />
                                    Refresh
                                </button>
                                {canEdit && (
                                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => setSectionModal('filesUpload')}>
                                        <UploadCloud aria-hidden="true" />
                                        Add files
                                    </button>
                                )}
                            </>
                        )}
                    >
                        <EntityFilesList
                            files={documentFiles}
                            isLoading={isDriveLoading}
                            canEdit={canEdit}
                            canDelete={canDeleteDriveFiles}
                            isConnected={!!driveStatus?.isConnected}
                            uploadFile={uploadDriveFile}
                            onFileAdded={file => setDriveFiles(current => [file, ...current])}
                            onRequestDelete={requestDriveFileDelete}
                            onRefresh={loadDriveFiles}
                            onMessage={(message, hasErrors) => showDriveToast(hasErrors ? 'error' : 'success', message)}
                            showUploader={false}
                            showToolbar={false}
                        />
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="History"
                        description="Recorded changes and activity"
                        className="ipo-history-panel ipo-table-panel"
                        actions={<IpoTableFilterButton label="History" count={activeFilterCount('history')} onClick={() => setOpenTableFilter('history')} />}
                        footer={<IpoTableCount filtered={filteredHistory.length} total={history.length} />}
                    >
                        {filteredHistory.length > 0 ? (
                            <div className="ipo-detail-table-scroll custom-scrollbar">
                                <table className="data-table ipo-detail-data-table ipo-detail-data-table--history">
                                    <colgroup>
                                        <col className="ipo-table-col--history-date" />
                                        <col className="ipo-table-col--history-event" />
                                        <col className="ipo-table-col--history-user" />
                                    </colgroup>
                                    <thead><tr>
                                        <th>Date</th>
                                        <th>Event</th>
                                        <th>User</th>
                                    </tr></thead>
                                    <tbody>
                                        {filteredHistory.map((entry, index) => (
                                            <tr key={entry.id || [entry.date, entry.event, index].join('-')}>
                                                <td title={formatDate(entry.date)}>{formatDate(entry.date)}</td>
                                                <td className="data-table__primary"><TruncatedTableCell value={entry.event} /></td>
                                                <td><TruncatedTableCell value={entry.user} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="detail-empty">No historical data matches the active filters.</p>}
                    </IpoDetailPanel>
                </RecordDetailMain>

                {/* Right Column */}
                <RecordDetailAside>
                    {/* Profile Card */}
                    <IpoDetailPanel
                        title="IPO Profile"
                        description="Registration and identification"
                        className="ipo-profile-panel"
                    >
                        <dl className="detail-dl">
                            <DetailItem label="Indigenous Cultural Community" value={ipo.indigenousCulturalCommunity} />
                            <DetailItem label="Ancestral Domain No." value={ipo.ancestralDomainNo} />
                            <DetailItem label="Registering Body" value={ipo.registeringBody} half />
                            <DetailItem label="Registration Date" value={formatDate(ipo.registrationDate)} half />
                            <DetailItem label="Contact Person" value={ipo.contactPerson} half />
                            <DetailItem label="Contact Number" value={ipo.contactNumber} half />
                            <DetailItem label="Flags" value={
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {ipo.isWomenLed && <span className="status-badge status-badge--pink">Women-Led</span>}
                                    {ipo.isWithinGida && <span className="status-badge status-badge--purple">Within GIDA</span>}
                                    {ipo.isWithinElcac && <span className="status-badge status-badge--orange">Within ELCAC</span>}
                                    {ipo.isWithScad && <span className="status-badge status-badge--cyan">With SCAD</span>}
                                </div>
                            } />
                        </dl>
                    </IpoDetailPanel>

                    {/* Membership Information Card */}
                    <IpoDetailPanel
                        title="Membership Information"
                        description="Demographics snapshot"
                    >
                        <div className="ipo-membership-overview">
                            <div className="ipo-membership-stat">
                                <span>Total Members</span>
                                <strong>{formatFullNumber(ipo.totalMembers)}</strong>
                            </div>
                            <div className="ipo-membership-stat">
                                <span>IP Members</span>
                                <strong>{formatFullNumber(ipo.totalIpMembers)}</strong>
                            </div>
                        </div>
                        <dl className="detail-dl ipo-membership-details">
                            <MembershipRow label="Male" value={ipo.totalMaleMembers} />
                            <MembershipRow label="Female" value={ipo.totalFemaleMembers} />
                            <MembershipRow label="Youth" value={ipo.totalYouthMembers} />
                            <MembershipRow label="Senior Citizens" value={ipo.totalSeniorMembers} />
                        </dl>
                        <div className="ipo-membership-progress">
                            <div>
                                <span>4Ps Beneficiaries</span>
                                <strong>{formatFullNumber(ipo.total4PsMembers)} / {formatFullNumber(ipo.totalMembers)}</strong>
                            </div>
                            <span className="ipo-progress" aria-hidden="true">
                                <span style={{ width: `${ipo.totalMembers > 0 ? Math.min(100, (ipo.total4PsMembers / ipo.totalMembers) * 100) : 0}%` }} />
                            </span>
                        </div>
                    </IpoDetailPanel>

                    <IpoDetailPanel title="Summary" className="ipo-summary-panel">
                        <dl className="ipo-summary-list">
                            <div><dt>Total budget</dt><dd>{formatCompactCurrency(overviewStats.totalAllocation)}</dd></div>
                            <div><dt>Subprojects</dt><dd>{formatFullNumber(subprojects.length)}</dd></div>
                            <div><dt>Trainings</dt><dd>{formatFullNumber(trainings.length)}</dd></div>
                            <div><dt>Fund Year</dt><dd>{summaryScope.fundingYear}</dd></div>
                            <div><dt>Fund Type</dt><dd>{summaryScope.fundType}</dd></div>
                        </dl>
                    </IpoDetailPanel>

                </RecordDetailAside>
            </RecordDetailGrid>

        </RecordDetailPage>
    );
};

export default IPODetail;
