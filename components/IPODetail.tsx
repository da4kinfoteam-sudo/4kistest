
// Author: 4K 
import React, { useState, useEffect, FormEvent, useMemo, useCallback, useRef } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    CalendarDays,
    Check,
    ChevronRight,
    Coins,
    Edit3,
    ExternalLink,
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
import { getActivityDisplayTitle } from '../lib/entityIdentity';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess, usePagination } from './mainfunctions/TableHooks';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { supabase } from '../supabaseClient';
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
import { ConfirmDialog, DataTablePagination } from './ui/enterprise';
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
    onBack: () => void;
    previousPageName: string;
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

const MonitoringPreviewLine: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
    <div className="monitoring-report-preview__line">
        <span className="monitoring-report-preview__label">{label}</span>
        <p className="monitoring-report-preview__snippet">{value?.trim() || `No ${label.toLowerCase()} recorded.`}</p>
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

const getMatchedBuyerCommodityNeeds = (partner: MarketingPartner, ipo: IPO) => {
    const ipoCommodityNames = new Set((ipo.commodities || []).map(commodity => commodity.particular.toLowerCase()));
    return (partner.commodityNeeds || []).filter(need => ipoCommodityNames.has(need.name.toLowerCase()));
};

const getMarketLinkageCommodityLabel = (link: MarketLinkage) => (
    link.commodityName ? `${link.commodityName}${link.commodityType ? ` (${link.commodityType})` : ''}` : 'Unassigned'
);

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

// Pagination Controls Component
const PaginationControls: React.FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
    onItemsPerPageChange: (val: number) => void;
    totalItems: number;
}> = ({ currentPage, totalPages, onPageChange, itemsPerPage, onItemsPerPageChange, totalItems }) => (
    <DataTablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange}
        onItemsPerPageChange={onItemsPerPageChange}
        pageSizeOptions={[5, 10, 20]}
    />
);

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

type IpoSectionModalKey = 'subprojects' | 'activities' | 'gallery' | 'galleryUpload' | 'filesUpload';

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

const IPODetail: React.FC<IPODetailProps> = ({ ipo, subprojects, trainings, monitoringActivities = [], cachedMonitoringReports = [], cachedMonitoringActions = [], linkedDcfLoading = false, linkedDcfError = null, marketingPartners, onBack, previousPageName, onUpdateIpo, onSelectSubproject, onSelectActivity, onOpenMonitoringReport, onSelectLodYear, onSelectMarketingPartner, particularTypes, commodityCategories }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('IPO Management');
    const canDeleteDriveFiles = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [isEditing, setIsEditing] = useState(false);
    const [editedIpo, setEditedIpo] = useState<IPO>(ipo);
    const [baseRegion, setBaseRegion] = useState(''); // Track base region from dropdown
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [lodAssessments, setLodAssessments] = useState<LodAssessment[]>([]);
    const [expandedMarketLinkageId, setExpandedMarketLinkageId] = useState<string | number | null>(null);
    
    // History Hook
    const { history, addIpoHistory, refreshHistory } = useIpoHistory(ipo.id);
    const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
    const [driveFiles, setDriveFiles] = useState<IpoDriveFile[]>([]);
    const [isDriveLoading, setIsDriveLoading] = useState(true);
    const [deletingDriveFileId, setDeletingDriveFileId] = useState<number | null>(null);
    const [driveFilePendingDelete, setDriveFilePendingDelete] = useState<IpoDriveFile | null>(null);
    const [driveToast, setDriveToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [sectionModal, setSectionModal] = useState<IpoSectionModalKey | null>(null);
    const [galleryView, setGalleryView] = useState<GalleryViewMode>(() => {
        const saved = window.localStorage.getItem('4kis-gallery-view:ipo');
        return saved === 'list' || saved === 'carousel' ? saved : 'thumbnail';
    });
    const [monitoringReports, setMonitoringReports] = useState<ActivityMonitoringReport[]>([]);
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
            .filter(report => Number(report.ipo_id) === Number(ipo.id))
            .filter(report => monitoringActivityById.has(Number(report.activity_id))),
    [cachedMonitoringReports, ipo.id, monitoringActivityById]);

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
        setLatestMonitoringActions(buildLatestActionMap(cachedReportsForIpo, cachedMonitoringActions));
    }, [buildLatestActionMap, cachedMonitoringActions, cachedReportsForIpo]);

    const loadMonitoringReports = useCallback(async () => {
        if (!ipo.id) return;
        if (!supabase) {
            setMonitoringReports(cachedReportsForIpo);
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

            const visibleReports = ((reports || []) as ActivityMonitoringReport[])
                .filter(report => monitoringActivityById.has(Number(report.activity_id)));
            setMonitoringReports(visibleReports);

            const reportIds = visibleReports.map(report => report.id);
            if (reportIds.length === 0) {
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

            setLatestMonitoringActions(buildLatestActionMap(visibleReports, (actions || []) as ActivityMonitoringAction[]));
        } catch (error: any) {
            setMonitoringReports(cachedReportsForIpo);
            setLatestMonitoringActions(buildLatestActionMap(cachedReportsForIpo, cachedMonitoringActions));
            setMonitoringMessage(cachedReportsForIpo.length > 0
                ? `Showing cached Monitoring Reports. ${error.message || 'Unable to refresh live data.'}`
                : error.message || 'Unable to load Monitoring Reports.');
        } finally {
            setIsMonitoringLoading(false);
        }
    }, [buildLatestActionMap, cachedMonitoringActions, cachedReportsForIpo, ipo.id, monitoringActivityById]);

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

    // --- Subproject Filters & Pagination ---
    const [spYearFilter, setSpYearFilter] = useState(currentFundYear);
    const [spStatusFilter, setSpStatusFilter] = useState('All');
    
    const filteredSubprojects = useMemo(() => {
        return subprojects.filter(sp => {
            if (spYearFilter !== 'All' && sp.fundingYear?.toString() !== spYearFilter) return false;
            if (spStatusFilter !== 'All' && sp.status !== spStatusFilter) return false;
            return true;
        }).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }, [subprojects, spYearFilter, spStatusFilter]);

    const spPagination = usePagination(filteredSubprojects, [spYearFilter, spStatusFilter]);
    
    // Set default items per page to 5 for Subprojects
    useEffect(() => {
        spPagination.setItemsPerPage(5);
    }, []);

    // --- Training Filters & Pagination ---
    const [trYearFilter, setTrYearFilter] = useState(currentFundYear);
    const [trStatusFilter, setTrStatusFilter] = useState('All');

    const filteredTrainings = useMemo(() => {
        return trainings.filter(t => {
            if (trYearFilter !== 'All' && t.fundingYear?.toString() !== trYearFilter) return false;
            if (trStatusFilter !== 'All' && t.status !== trStatusFilter) return false;
            return true;
        }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [trainings, trYearFilter, trStatusFilter]);

    const trPagination = usePagination(filteredTrainings, [trYearFilter, trStatusFilter]);

    // Set default items per page to 5 for Trainings
    useEffect(() => {
        trPagination.setItemsPerPage(5);
    }, []);

    // --- Market Linkages Logic ---
    const ipoLinkages = useMemo(() => {
        return getIpoMarketSalesRows(marketingPartners, ipo);
    }, [marketingPartners, ipo.name]);

    const ipoMarketSalesSummary = useMemo(() => summarizeIpoMarketSales(ipoLinkages), [ipoLinkages]);

    const mlPagination = usePagination(ipoLinkages);
    // Set default items per page to 5 for Linkages
    useEffect(() => {
        mlPagination.setItemsPerPage(5);
    }, []);

    // --- History Pagination ---
    const histPagination = usePagination(history);
     useEffect(() => {
        histPagination.setItemsPerPage(5);
    }, []);

    const galleryFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'gallery'), [driveFiles]);
    const documentFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'files'), [driveFiles]);
    const currentFundYearSubprojects = useMemo(
        () => [...(subprojects || [])]
            .filter(project => project.fundingYear?.toString() === currentFundYear)
            .sort((a, b) => new Date(b.startDate || b.created_at || 0).getTime() - new Date(a.startDate || a.created_at || 0).getTime()),
        [currentFundYear, subprojects]
    );
    const subprojectPreview = useMemo(() => currentFundYearSubprojects.slice(0, 4), [currentFundYearSubprojects]);
    const currentFundYearActivities = useMemo(
        () => [...(trainings || [])]
            .filter(activity => activity.fundingYear?.toString() === currentFundYear)
            .sort((a, b) => new Date(b.date || b.created_at || 0).getTime() - new Date(a.date || a.created_at || 0).getTime()),
        [currentFundYear, trainings]
    );
    const trainingPreview = useMemo(() => currentFundYearActivities.slice(0, 4), [currentFundYearActivities]);
    const closeSectionModal = useCallback(() => setSectionModal(null), []);
    const selectSubprojectFromModal = (subproject: Subproject) => {
        setSectionModal(null);
        onSelectSubproject(subproject);
    };
    const selectActivityFromModal = (activity: Activity) => {
        setSectionModal(null);
        onSelectActivity(activity);
    };

    // Unique Years for Filters
    const spYears = useMemo(() => Array.from(new Set((subprojects || []).map(s => s.fundingYear))).filter(Boolean).sort().reverse(), [subprojects]);
    const trYears = useMemo(() => Array.from(new Set((trainings || []).map(t => t.fundingYear))).filter(Boolean).sort().reverse(), [trainings]);

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
            setCurrentCommodity({
                type: value,
                particular: '',
                value: '',
                yield: '',
                isScad: false,
                marketingPercentage: '',
                foodSecurityPercentage: '',
                averageIncome: ''
            });
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
        const newCommodity: Commodity = {
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
            yield: isAnimal ? undefined : parseFloat(currentCommodity.yield),
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
    const filterSelectClasses = "form-control data-table-select data-table-select--compact";


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
            {sectionModal === 'subprojects' && (
                <IpoSectionModal
                    title="Linked Subprojects"
                    description={ipo.name}
                    count={filteredSubprojects.length}
                    onClose={closeSectionModal}
                >
                    <div className="ipo-section-modal__toolbar">
                        <div>
                            <p className="detail-kicker">Filter linked records</p>
                            <p className="detail-list-copy">Filters apply only to this IPO's accessible Subprojects.</p>
                        </div>
                        <div className="ipo-section-modal__filters">
                            <label>
                                <span>Fund Year</span>
                                <select
                                    value={spYearFilter}
                                    onChange={event => setSpYearFilter(event.target.value)}
                                    className={filterSelectClasses}
                                >
                                    <option value="All">All Years</option>
                                    {!spYears.some(year => String(year) === currentFundYear) && (
                                        <option value={currentFundYear}>{currentFundYear}</option>
                                    )}
                                    {spYears.map(year => <option key={year} value={year}>{year}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Status</span>
                                <select
                                    value={spStatusFilter}
                                    onChange={event => setSpStatusFilter(event.target.value)}
                                    className={filterSelectClasses}
                                >
                                    <option value="All">All Statuses</option>
                                    <option value="Proposed">Proposed</option>
                                    <option value="Ongoing">Ongoing</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    {linkedDcfLoading && (
                        <div className="ipo-linked-dcf-status" role="status">
                            <Loader2 className="animate-spin" aria-hidden="true" />
                            <span>Refreshing linked Subprojects...</span>
                        </div>
                    )}
                    {linkedDcfError && (
                        <div className="ipo-linked-dcf-status ipo-linked-dcf-status--warning" role="status">
                            <AlertCircle aria-hidden="true" />
                            <span>{linkedDcfError}</span>
                        </div>
                    )}

                    {spPagination.paginatedData.length > 0 ? (
                        <>
                            <ul className="detail-list ipo-section-modal__list">
                                {spPagination.paginatedData.map(project => (
                                    <li key={project.id} className="detail-list-item">
                                        <div className="ipo-subproject-preview__main">
                                            <div className="min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => selectSubprojectFromModal(project)}
                                                    className="detail-list-title table-link text-left"
                                                >
                                                    {project.name}
                                                </button>
                                                <p className="detail-list-copy">{project.location || 'Location not recorded'}</p>
                                            </div>
                                            <span className={getStatusBadge(project.status)}>{project.status}</span>
                                        </div>
                                        <div className="detail-list-meta">
                                            <span title={formatCurrency(calculateTotalBudget(project.details))}>
                                                <span className="detail-list-meta__label">Budget:</span> {formatCurrency(calculateTotalBudget(project.details))}
                                            </span>
                                            <span><span className="detail-list-meta__label">Fund Year:</span> {project.fundingYear || 'N/A'}</span>
                                            <span><span className="detail-list-meta__label">Timeline:</span> {formatDate(project.startDate)} to {formatDate(project.estimatedCompletionDate)}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <PaginationControls
                                currentPage={spPagination.currentPage}
                                totalPages={spPagination.totalPages}
                                onPageChange={spPagination.setCurrentPage}
                                itemsPerPage={spPagination.itemsPerPage}
                                onItemsPerPageChange={spPagination.setItemsPerPage}
                                totalItems={filteredSubprojects.length}
                            />
                        </>
                    ) : (
                        <p className="detail-empty">No subprojects match the current filters.</p>
                    )}
                </IpoSectionModal>
            )}
            {sectionModal === 'activities' && (
                <IpoSectionModal
                    title="Linked Activities"
                    description={ipo.name}
                    count={filteredTrainings.length}
                    onClose={closeSectionModal}
                >
                    <div className="ipo-section-modal__toolbar">
                        <div>
                            <p className="detail-kicker">Filter linked records</p>
                            <p className="detail-list-copy">Filters apply only to this IPO&apos;s accessible Activities.</p>
                        </div>
                        <div className="ipo-section-modal__filters">
                            <label>
                                <span>Fund Year</span>
                                <select
                                    value={trYearFilter}
                                    onChange={event => setTrYearFilter(event.target.value)}
                                    className={filterSelectClasses}
                                >
                                    <option value="All">All Years</option>
                                    {!trYears.some(year => String(year) === currentFundYear) && (
                                        <option value={currentFundYear}>{currentFundYear}</option>
                                    )}
                                    {trYears.map(year => <option key={year} value={year}>{year}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Status</span>
                                <select
                                    value={trStatusFilter}
                                    onChange={event => setTrStatusFilter(event.target.value)}
                                    className={filterSelectClasses}
                                >
                                    <option value="All">All Statuses</option>
                                    <option value="Proposed">Proposed</option>
                                    <option value="Ongoing">Ongoing</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    {linkedDcfLoading && (
                        <div className="ipo-linked-dcf-status" role="status">
                            <Loader2 className="animate-spin" aria-hidden="true" />
                            <span>Refreshing linked Activities...</span>
                        </div>
                    )}
                    {linkedDcfError && (
                        <div className="ipo-linked-dcf-status ipo-linked-dcf-status--warning" role="status">
                            <AlertCircle aria-hidden="true" />
                            <span>{linkedDcfError}</span>
                        </div>
                    )}

                    {trPagination.paginatedData.length > 0 ? (
                        <>
                            <ul className="detail-list ipo-section-modal__list">
                                {trPagination.paginatedData.map(activity => (
                                    <li key={activity.id} className="detail-list-item">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => selectActivityFromModal(activity)}
                                                    className="detail-list-title table-link text-left"
                                                >
                                                    {activity.name}
                                                </button>
                                                <p className="detail-list-copy">{activity.component || 'Component not recorded'}</p>
                                            </div>
                                            <span className={getTrainingStatusBadge(activity.status)}>{activity.status}</span>
                                        </div>
                                        <div className="detail-list-meta">
                                            <span><span className="detail-list-meta__label">Fund Year:</span> {activity.fundingYear || 'N/A'}</span>
                                            <span><span className="detail-list-meta__label">Date:</span> {formatDate(activity.date)}</span>
                                            <span><span className="detail-list-meta__label">Location:</span> {activity.location || 'Not recorded'}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <PaginationControls
                                currentPage={trPagination.currentPage}
                                totalPages={trPagination.totalPages}
                                onPageChange={trPagination.setCurrentPage}
                                itemsPerPage={trPagination.itemsPerPage}
                                onItemsPerPageChange={trPagination.setItemsPerPage}
                                totalItems={filteredTrainings.length}
                            />
                        </>
                    ) : (
                        <p className="detail-empty">No activities match the current filters.</p>
                    )}
                </IpoSectionModal>
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
            <button type="button" onClick={onBack} className="record-detail-back-link">
                <ArrowLeft aria-hidden="true" />
                Back to {previousPageName}
            </button>

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
                    <IpoDetailPanel title="Level of Development" description="Annual maturity scoring based on the IPO's recorded assessments">
                        {lodAssessments.length > 0 ? (
                            <div className="ipo-lod-grid">
                                {lodAssessments.map(assessment => {
                                    const isCurrentYear = assessment.year === new Date().getFullYear();
                                    const level = assessment.manual_level || assessment.computed_level || 'N/A';
                                    return (
                                        <button
                                            key={assessment.id}
                                            type="button"
                                            onClick={() => onSelectLodYear?.(ipo, assessment.year)}
                                            className={`detail-metric detail-metric--button ${isCurrentYear ? 'is-current' : ''}`}
                                            title={`Open ${assessment.year} LOD assessment`}
                                        >
                                            <span className="detail-metric-label">{assessment.year}</span>
                                            <span className="detail-metric-value">Level {level}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="detail-empty">No assessments available.</p>
                        )}
                    </IpoDetailPanel>

                    <IpoDetailPanel title="Commodities" description="Registered production lines, coverage, and livelihood indicators">
                        {ipo.commodities && ipo.commodities.length > 0 ? (
                            <div className="data-table-scroll record-detail-table-scroll">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Commodity</th>
                                            <th>Type</th>
                                            <th className="data-table__numeric">Coverage</th>
                                            <th className="data-table__numeric">Avg. Yield</th>
                                            <th className="data-table__numeric">Marketing</th>
                                            <th className="data-table__numeric">Food Security</th>
                                            <th className="data-table__numeric">Avg. Income</th>
                                            <th>SCAD</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ipo.commodities.map((commodity, index) => (
                                            <tr key={`${commodity.particular}-${index}`}>
                                                <td className="data-table__primary">{commodity.particular}</td>
                                                <td>{commodity.type}</td>
                                                <td className="data-table__numeric">
                                                    {formatFullNumber(commodity.value)} {commodity.type === 'Livestock' ? 'heads' : 'ha'}
                                                </td>
                                                <td className="data-table__numeric">
                                                    {commodity.yield ? `${formatFullNumber(commodity.yield)} kg/ha` : 'N/A'}
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
                        description={`Most recent FY ${currentFundYear} records`}
                        footer={subprojects.length > 0 ? (
                            <>
                                <span>Showing {subprojectPreview.length} of {currentFundYearSubprojects.length.toLocaleString()} FY {currentFundYear} records</span>
                                <button type="button" className="ipo-detail-view-all" onClick={() => setSectionModal('subprojects')}>
                                    View all Subprojects
                                    <ChevronRight aria-hidden="true" />
                                </button>
                            </>
                        ) : null}
                    >
                        {subprojectPreview.length > 0 ? (
                            <>
                                <ul className="detail-list">
                                    {subprojectPreview.map(project => (
                                        <li key={project.id} className="detail-list-item ipo-subproject-preview__item">
                                            <div className="ipo-subproject-preview__main">
                                                <div className="min-w-0">
                                                    <div className="ipo-subproject-preview__eyebrow">
                                                        <span>{project.uid || `SP-${project.id}`}</span>
                                                        <span className={getStatusBadge(project.status)}>{project.status}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectSubproject(project)}
                                                        className="detail-list-title table-link text-left"
                                                    >
                                                        {project.name}
                                                    </button>
                                                    <p className="detail-list-copy ipo-subproject-preview__meta">
                                                        <MapPin aria-hidden="true" />
                                                        {project.location || 'Location not recorded'}
                                                        <span aria-hidden="true">·</span>
                                                        <CalendarDays aria-hidden="true" />
                                                        {formatDate(project.startDate)} to {formatDate(project.estimatedCompletionDate)}
                                                    </p>
                                                </div>
                                                <div className="ipo-subproject-preview__performance">
                                                    <span>Physical <strong>{getSubprojectPhysicalRate(project)}%</strong></span>
                                                    <span className="ipo-progress" aria-hidden="true">
                                                        <span style={{ width: `${getSubprojectPhysicalRate(project)}%` }} />
                                                    </span>
                                                    <strong title={formatCurrency(calculateTotalBudget(project.details))}>
                                                        {formatCompactCurrency(calculateTotalBudget(project.details))}
                                                    </strong>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="detail-empty">No FY {currentFundYear} subprojects are linked to this IPO.</p>
                        )}
                    </IpoDetailPanel>

                    <IpoDetailPanel
                        title="Activities"
                        description={`Most recent FY ${currentFundYear} linked activities`}
                        footer={trainings.length > 0 ? (
                            <>
                                <span>Showing {trainingPreview.length} of {currentFundYearActivities.length.toLocaleString()} FY {currentFundYear} records</span>
                                <button type="button" className="ipo-detail-view-all" onClick={() => setSectionModal('activities')}>
                                    View all Activities
                                    <ChevronRight aria-hidden="true" />
                                </button>
                            </>
                        ) : null}
                    >

                        {trainingPreview.length > 0 ? (
                            <>
                                <ul className="detail-list">
                                    {trainingPreview.map(t => (
                                        <li key={t.id} className="detail-list-item">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <button 
                                                        onClick={() => onSelectActivity(t)}
                                                        className="detail-list-title text-left focus:outline-none focus:underline"
                                                    >
                                                        {getActivityDisplayTitle(t, [], [ipo])}
                                                    </button>
                                                    <p className="detail-list-copy">{t.component}</p>
                                                </div>
                                                <div className="flex flex-shrink-0 flex-col items-start gap-1 sm:items-end">
                                                    <span className={getTrainingStatusBadge(t.status)}>{t.status}</span>
                                                    <p className="detail-list-meta">{formatDate(t.date)}</p>
                                                </div>
                                            </div>
                                            <p className="detail-list-copy mt-2 line-clamp-2">{t.description}</p>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="detail-empty">No FY {currentFundYear} activities are linked to this IPO.</p>
                        )}
                    </IpoDetailPanel>
                    
                    <div className="ipo-detail-split-panels">
                    <IpoDetailPanel title="Monitoring Reports" description="Latest field validation">
                        {monitoringMessage && <p className="drive-file-card__message" role="status">{monitoringMessage}</p>}
                        {isMonitoringLoading ? (
                            <div className="drive-file-card__loading">
                                <Loader2 className="animate-spin" aria-hidden="true" />
                                <span>Loading Monitoring Reports...</span>
                            </div>
                        ) : monitoringReports.length > 0 ? (
                            <ul className="detail-list">
                                {monitoringReports.map(report => {
                                    const activity = monitoringActivityById.get(Number(report.activity_id));
                                    const latestAction = latestMonitoringActions[report.id];
                                    if (!activity) return null;
                                    return (
                                        <li key={report.id} className="detail-list-item">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <button
                                                        type="button"
                                                        className="detail-list-title table-link text-left"
                                                        onClick={() => onOpenMonitoringReport?.(activity, ipo, report)}
                                                    >
                                                        {getActivityDisplayTitle(activity, [], [ipo])}
                                                    </button>
                                                    <p className="detail-list-copy">{activity.component} - {formatDate(activity.date)}</p>
                                                </div>
                                                <span className={`status-badge status-badge--compact ${report.status === 'Completed' ? 'status-badge--completed' : report.status === 'Ongoing' ? 'status-badge--ongoing' : 'status-badge--pending'}`}>
                                                    {report.status}
                                                </span>
                                            </div>
                                            <div className="monitoring-report-preview">
                                                <div className="monitoring-report-preview__meta">
                                                    <span>Updated {formatDate(report.updated_at)}</span>
                                                    <span>{report.reported_by_name || 'Reporter not recorded'}</span>
                                                </div>
                                                <MonitoringPreviewLine label="Findings" value={report.findings} />
                                                <MonitoringPreviewLine label="Issues" value={report.issues} />
                                                <MonitoringPreviewLine label="Recommendations" value={report.recommendations} />
                                                <MonitoringPreviewLine label="Latest action" value={latestAction?.action_taken} />
                                            </div>
                                            <div className="mt-3 flex justify-end">
                                                <button
                                                    type="button"
                                                    className="table-action table-action--primary"
                                                    onClick={() => onOpenMonitoringReport?.(activity, ipo, report)}
                                                >
                                                    <ExternalLink aria-hidden="true" />
                                                    View Report
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="detail-empty">No monitoring reports are linked to this IPO yet.</p>
                        )}
                    </IpoDetailPanel>

                    {/* Market Linkages Card (New) */}
                    <IpoDetailPanel title="Market Linkages" description="Buyers and offtakers">
                        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <OverviewMetric
                                label="Linked Markets"
                                value={formatFullNumber(ipoMarketSalesSummary.linkedMarketCount)}
                            />
                            <OverviewMetric
                                label="Total Quantity Sold"
                                value={formatMarketQuantityTotals(ipoMarketSalesSummary.totalQuantityByUnit)}
                                fullValue={formatMarketQuantityTotals(ipoMarketSalesSummary.totalQuantityByUnit)}
                            />
                            <OverviewMetric
                                label="Total Sales from Market Linkage"
                                value={formatCompactCurrency(ipoMarketSalesSummary.totalSales)}
                                fullValue={formatCurrency(ipoMarketSalesSummary.totalSales)}
                            />
                        </div>
                        {mlPagination.paginatedData.length > 0 ? (
                            <>
                                <div className="grid grid-cols-1 gap-4">
                                    {mlPagination.paginatedData.map((item, idx) => {
                                        const matchedBuyerNeeds = getMatchedBuyerCommodityNeeds(item.partner, ipo);
                                        const selectedCommodityNeed = (item.partner.commodityNeeds || []).find(need =>
                                            String(need.id) === String(item.link.commodityNeedId)
                                        ) || (item.partner.commodityNeeds || []).find(need =>
                                            need.name === item.link.commodityName && need.type === item.link.commodityType
                                        );
                                        const linkageKey = item.link.id || `${item.partner.id}-${idx}`;
                                        const isExpanded = expandedMarketLinkageId === linkageKey;
                                        return (
                                        <div
                                            key={linkageKey}
                                            className="detail-list-item ipo-market-link"
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={isExpanded}
                                            onClick={() => setExpandedMarketLinkageId(prev => prev === linkageKey ? null : linkageKey)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setExpandedMarketLinkageId(prev => prev === linkageKey ? null : linkageKey);
                                                }
                                            }}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSelectMarketingPartner?.(item.partner);
                                                        }}
                                                        className="detail-list-title table-link text-left focus:outline-none focus:underline"
                                                        title="Open buyer profile"
                                                    >
                                                        {item.partner.companyName}
                                                    </button>
                                                    <p className="ipo-market-link__meta">
                                                        <span className="ipo-market-link__label">Agreement:</span> {formatFullNumber(item.quantity)} {item.unitOfMeasure} ({item.link.agreedQuantityTimeframe}) @ {formatCurrency(item.pricePerUnit)}/{item.unitOfMeasure}
                                                    </p>
                                                    <p className="ipo-market-link__meta">
                                                        <span className="ipo-market-link__label">Commodity Sold:</span>{' '}
                                                        <span className={item.link.commodityName ? '' : 'ipo-market-link__missing'}>
                                                            {getMarketLinkageCommodityLabel(item.link)}
                                                        </span>
                                                    </p>
                                                </div>
                                                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                                                    <span className={`status-badge status-badge--compact ${item.link.negotiationStatus === 'Contract Signed' ? 'status-badge--completed' : 'status-badge--pending'}`}>
                                                        {item.link.negotiationStatus}
                                                    </span>
                                                    <span className="ipo-market-link__sales">
                                                        {formatCurrency(item.salesValue)}
                                                    </span>
                                                    <span className="ipo-market-link__toggle">{isExpanded ? 'Collapse' : 'Expand'}</span>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="ipo-market-link__details">
                                                    <div className="ipo-market-link__facts">
                                                        <p><span className="ipo-market-link__label">Sales Value:</span> {formatCurrency(item.salesValue)}</p>
                                                        <p><span className="ipo-market-link__label">Commodity Sold:</span> <span className={item.link.commodityName ? '' : 'ipo-market-link__missing'}>{getMarketLinkageCommodityLabel(item.link)}</span></p>
                                                        <p><span className="ipo-market-link__label">Type:</span> {item.link.agreementType}</p>
                                                        <p><span className="ipo-market-link__label">Date:</span> {item.link.agreementDate ? new Date(item.link.agreementDate).toLocaleDateString() : 'N/A'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="detail-kicker">Commodity Bought by Buyer</p>
                                                        {item.link.commodityName ? (
                                                            <div className="ipo-market-link__needs">
                                                                {selectedCommodityNeed ? (
                                                                    <div className="market-need-card">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <span className="market-need-card__title">{selectedCommodityNeed.name}</span>
                                                                            <span className="status-badge status-badge--compact status-badge--neutral">{selectedCommodityNeed.type}</span>
                                                                        </div>
                                                                        <p className="market-need-card__copy"><span className="market-need-card__label">Source:</span> {selectedCommodityNeed.sourceProvince || 'Any Province'}, {selectedCommodityNeed.sourceRegion || 'Any Region'}</p>
                                                                        <p className="market-need-card__copy"><span className="market-need-card__label">Annual Need:</span> {formatFullNumber(getCommodityNeedAnnualVolume(selectedCommodityNeed))} Kg/Yr</p>
                                                                        <p className="market-need-card__copy"><span className="market-need-card__label">Quality:</span> {selectedCommodityNeed.qualityStandard || 'Not specified'}</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="market-need-card">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <span className="market-need-card__title">{item.link.commodityName}</span>
                                                                            <span className="status-badge status-badge--compact status-badge--neutral">{item.link.commodityType || 'Unspecified'}</span>
                                                                        </div>
                                                                        <p className="market-need-card__copy">Saved from linkage commodity snapshot.</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : matchedBuyerNeeds.length > 0 ? (
                                                            <div className="ipo-market-link__needs">
                                                                {matchedBuyerNeeds.map(need => {
                                                                    const annualVolume = getCommodityNeedAnnualVolume(need);
                                                                    return (
                                                                        <div key={need.id} className="market-need-card">
                                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                <span className="market-need-card__title">{need.name}</span>
                                                                                <span className="status-badge status-badge--compact status-badge--neutral">{need.type}</span>
                                                                            </div>
                                                                            <p className="market-need-card__copy"><span className="market-need-card__label">Source:</span> {need.sourceProvince || 'Any Province'}, {need.sourceRegion || 'Any Region'}</p>
                                                                            <p className="market-need-card__copy"><span className="market-need-card__label">Annual Need:</span> {formatFullNumber(annualVolume)} Kg/Yr</p>
                                                                            <p className="market-need-card__copy"><span className="market-need-card__label">Quality:</span> {need.qualityStandard || 'Not specified'}</p>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="detail-empty">No matching commodity requirement is listed for this IPO.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                                <PaginationControls 
                                    currentPage={mlPagination.currentPage}
                                    totalPages={mlPagination.totalPages}
                                    onPageChange={mlPagination.setCurrentPage}
                                    itemsPerPage={mlPagination.itemsPerPage}
                                    onItemsPerPageChange={mlPagination.setItemsPerPage}
                                    totalItems={ipoLinkages.length}
                                />
                            </>
                        ) : (
                            <p className="detail-empty">No marketing linkages established yet.</p>
                        )}
                    </IpoDetailPanel>
                    </div>

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
                </RecordDetailMain>

                {/* Right Column */}
                <RecordDetailAside>
                    {/* Profile Card */}
                    <IpoDetailPanel
                        title="IPO Profile"
                        description="Registration and identification"
                        actions={canEdit ? (
                            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setIsEditing(true)}>
                                <Pencil aria-hidden="true" />
                                Edit
                            </button>
                        ) : null}
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
                        actions={canEdit ? (
                            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setIsEditing(true)}>
                                <Pencil aria-hidden="true" />
                                Edit
                            </button>
                        ) : null}
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

                    <IpoDetailPanel title="Summary">
                        <dl className="ipo-summary-list">
                            <div><dt>Total budget</dt><dd>{formatCompactCurrency(overviewStats.totalAllocation)}</dd></div>
                            <div><dt>Subprojects</dt><dd>{formatFullNumber(subprojects.length)}</dd></div>
                            <div><dt>Trainings</dt><dd>{formatFullNumber(trainings.length)}</dd></div>
                            <div><dt>Fund Year</dt><dd>{summaryScope.fundingYear}</dd></div>
                            <div><dt>Fund Type</dt><dd>{summaryScope.fundType}</dd></div>
                        </dl>
                    </IpoDetailPanel>

                    <IpoDetailPanel title="History" description="Recent activity">
                        {histPagination.paginatedData.length > 0 ? (
                            <>
                                <div className="detail-timeline">
                                    <ul className="detail-timeline__list">
                                        {histPagination.paginatedData.map((entry, index) => (
                                            <li key={index} className="detail-timeline__item">
                                                <span className="detail-timeline__marker" aria-hidden="true" />
                                                <time className="detail-timeline__time">{formatDate(entry.date)}</time>
                                                <p className="detail-list-title">{entry.event}</p>
                                                <p className="detail-timeline__byline">by {entry.user}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <PaginationControls
                                    currentPage={histPagination.currentPage}
                                    totalPages={histPagination.totalPages}
                                    onPageChange={histPagination.setCurrentPage}
                                    itemsPerPage={histPagination.itemsPerPage}
                                    onItemsPerPageChange={histPagination.setItemsPerPage}
                                    totalItems={history.length}
                                />
                            </>
                        ) : (
                            <p className="detail-empty">No historical data available for this IPO.</p>
                        )}
                    </IpoDetailPanel>
                </RecordDetailAside>
            </RecordDetailGrid>
        </RecordDetailPage>
    );
};

export default IPODetail;
