
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Edit3, ExternalLink, Eye, FileText, HardDrive, Image as ImageIcon, Loader2, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, IPO, ReferenceActivity } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { getBudgetLineAmount, getBudgetLineTag, isBudgetLineExcludedFromTargets } from '../lib/budgetLineAdjustments';
import { getActualDisbursementSummary, getActualObligationSummary } from '../lib/financialActualSummary';
import { supabase } from '../supabaseClient';
import {
    ACTIVITY_DRIVE_FILE_ACCEPT,
    ActivityDriveFile,
    canPreviewActivityDriveFile,
    deleteActivityDriveFile,
    formatFileSize,
    getActivityDriveImageUrl,
    getActivityDrivePreviewUrl,
    getGoogleDriveStatus,
    GoogleDriveStatus,
    isActivityDriveImageFile,
    isAllowedActivityDriveFile,
    listActivityDriveFiles,
    uploadActivityDriveFile
} from '../lib/googleDriveStorage';

interface ActivityDetailProps {
    activity: Activity;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
    cachedMonitoringReports?: ActivityMonitoringReport[];
    cachedMonitoringActions?: ActivityMonitoringAction[];
    onSelectIpo: (ipo: IPO) => void;
    onEdit: (mode: 'details' | 'expenses' | 'accomplishment') => void;
    onOpenMonitoringReport?: (activity: Activity, ipo: IPO, report?: ActivityMonitoringReport | null) => void;
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Activity['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--compact status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--compact status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--compact status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--compact status-badge--cancelled';
        default: return 'status-badge status-badge--compact status-badge--neutral';
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
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

type ActivityDetailSectionKey = 'monitoring' | 'gallery' | 'files';

const CollapsibleDetailCard: React.FC<{
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ title, isOpen, onToggle, children }) => (
    <section className="detail-card detail-card--collapsible">
        <button
            type="button"
            className="detail-card__toggle-header"
            onClick={onToggle}
            aria-expanded={isOpen}
        >
            <span className="detail-card-title mb-0">{title}</span>
            <ChevronDown className={`detail-card__collapse-icon ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />
        </button>
        {isOpen && <div className="detail-card__collapsible-body">{children}</div>}
    </section>
);

export const ActivityDetail: React.FC<ActivityDetailProps> = ({ activity, ipos, onBack, previousPageName, onSelectIpo, onEdit, uacsCodes, referenceActivities = [], cachedMonitoringReports = [], cachedMonitoringActions = [], onOpenMonitoringReport }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Activities');
    const { canEdit: canEditFinancial } = useUserAccess('Accomplishment - Financial');
    const { canEdit: canEditPhysical } = useUserAccess('Accomplishment - Physical');
    const { getStatusDecision, ensureDecisionAllowed } = useDcfPolicyGuard();

    const canDeleteDriveFiles = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
    const [driveFiles, setDriveFiles] = useState<ActivityDriveFile[]>([]);
    const [isDriveLoading, setIsDriveLoading] = useState(true);
    const [isDriveUploading, setIsDriveUploading] = useState(false);
    const [deletingDriveFileId, setDeletingDriveFileId] = useState<number | null>(null);
    const [driveMessage, setDriveMessage] = useState<string | null>(null);
    const [previewDriveFile, setPreviewDriveFile] = useState<ActivityDriveFile | null>(null);
    const [driveFilePendingDelete, setDriveFilePendingDelete] = useState<ActivityDriveFile | null>(null);
    const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
    const [galleryImageFailed, setGalleryImageFailed] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<ActivityDetailSectionKey, boolean>>({
        monitoring: true,
        gallery: false,
        files: false
    });
    const cachedReportsForActivity = useMemo(() =>
        cachedMonitoringReports.filter(report => Number(report.activity_id) === Number(activity.id)),
    [activity.id, cachedMonitoringReports]);

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

    const [monitoringReports, setMonitoringReports] = useState<ActivityMonitoringReport[]>(cachedReportsForActivity);
    const [latestActionsByReportId, setLatestActionsByReportId] = useState<Record<number, ActivityMonitoringAction | undefined>>({});
    const [isMonitoringLoading, setIsMonitoringLoading] = useState(false);
    const [monitoringMessage, setMonitoringMessage] = useState<string | null>(null);
    
    // Helper to get UACS Description
    const getUacsDescription = (ot: string, ep: string, code: string) => {
        if (uacsCodes[ot] && uacsCodes[ot][ep] && uacsCodes[ot][ep][code]) {
            return uacsCodes[ot][ep][code];
        }
        return '';
    };
    
    // Status Logic for Edit Button Visibility
    const isCompleted = activity.status === 'Completed';
    const isCancelled = activity.status === 'Cancelled';
    const isOngoing = activity.status === 'Ongoing';
    
    // User Role Permission Logic
    // Details & Expenses: Editable if Proposed. Read-only if Ongoing/Completed/Cancelled (unless Admin).
    const detailsDecision = getStatusDecision({
        moduleKey: 'activities',
        item: activity,
        action: 'editDetails',
        hasModuleAccess: canEdit,
    });
    const expensesDecision = getStatusDecision({
        moduleKey: 'activities',
        item: activity,
        action: 'editBudget',
        hasModuleAccess: canEdit,
    });
    const physicalAccomplishmentDecision = getStatusDecision({
        moduleKey: 'activities',
        item: activity,
        action: 'editPhysicalAccomplishment',
        hasModuleAccess: canEditPhysical,
    });
    const financialAccomplishmentDecision = getStatusDecision({
        moduleKey: 'activities',
        item: activity,
        action: 'editFinancialAccomplishment',
        hasModuleAccess: canEditFinancial,
    });
    const accomplishmentDecision = physicalAccomplishmentDecision.allowed ? physicalAccomplishmentDecision : financialAccomplishmentDecision;
    const canEditDetails = detailsDecision.allowed;
    const canEditExpenses = expensesDecision.allowed;
    
    // Accomplishment: Editable based on tracking permissions
    const canEditAccomplishment = physicalAccomplishmentDecision.allowed || financialAccomplishmentDecision.allowed;

    const handlePolicyEdit = async (mode: 'details' | 'expenses' | 'accomplishment') => {
        const decision = mode === 'details'
            ? detailsDecision
            : mode === 'expenses'
                ? expensesDecision
                : accomplishmentDecision;
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'activities',
            item: activity,
            itemId: activity.id,
            itemName: activity.name,
            status: activity.status,
            action: mode === 'details' ? 'editDetails' : mode === 'expenses' ? 'editBudget' : physicalAccomplishmentDecision.allowed ? 'editPhysicalAccomplishment' : 'editFinancialAccomplishment',
            entityType: 'activity',
        });
        if (allowed) onEdit(mode);
    };

    const toggleSection = (section: ActivityDetailSectionKey) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const totalBudget = useMemo(() => {
       return activity.expenses.reduce((acc, item) => acc + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)), 0);
    }, [activity.expenses]);
    const monitoringReference = useMemo(() => referenceActivities.find(ref =>
        ref.activity_name === 'Subproject Monitoring' &&
        ref.component === 'Program Management' &&
        ref.type === 'Activity'
    ), [referenceActivities]);

    const isMonitoringActivity = !!activity.reference_activity_id &&
        !!monitoringReference?.id &&
        String(activity.reference_activity_id) === String(monitoringReference.id);

    const participatingIpos = useMemo(() => {
        const byId = new Map<number, IPO>(ipos.map(ipo => [Number(ipo.id), ipo]));
        const byName = new Map<string, IPO>(ipos.map(ipo => [ipo.name, ipo]));
        const resolved: IPO[] = [];
        const seen = new Set<number>();

        (activity.participating_ipo_ids || []).forEach(id => {
            const ipo = byId.get(Number(id));
            if (ipo && !seen.has(ipo.id)) {
                resolved.push(ipo);
                seen.add(ipo.id);
            }
        });

        (activity.participatingIpos || []).forEach(name => {
            const ipo = byName.get(name);
            if (ipo && !seen.has(ipo.id)) {
                resolved.push(ipo);
                seen.add(ipo.id);
            }
        });

        return resolved;
    }, [activity.participatingIpos, activity.participating_ipo_ids, ipos]);

    const loadDriveFiles = useCallback(async () => {
        if (!currentUser?.id || !activity.id) return;
        setIsDriveLoading(true);
        setDriveMessage(null);
        try {
            const [status, files] = await Promise.all([
                getGoogleDriveStatus(currentUser),
                listActivityDriveFiles(currentUser, activity.id)
            ]);
            setDriveStatus(status);
            setDriveFiles(files);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to load Activity files.');
        } finally {
            setIsDriveLoading(false);
        }
    }, [activity.id, currentUser]);

    useEffect(() => {
        loadDriveFiles();
    }, [loadDriveFiles]);

    useEffect(() => {
        setMonitoringReports(cachedReportsForActivity);
        setLatestActionsByReportId(buildLatestActionMap(cachedReportsForActivity, cachedMonitoringActions));
    }, [buildLatestActionMap, cachedMonitoringActions, cachedReportsForActivity]);

    const loadMonitoringReports = useCallback(async () => {
        if (!activity.id || !isMonitoringActivity) return;
        if (!supabase) {
            setMonitoringReports(cachedReportsForActivity);
            setLatestActionsByReportId(buildLatestActionMap(cachedReportsForActivity, cachedMonitoringActions));
            setMonitoringMessage(cachedReportsForActivity.length > 0 ? 'Showing cached Monitoring Reports.' : null);
            return;
        }
        setIsMonitoringLoading(true);
        setMonitoringMessage(null);
        try {
            const { data: reports, error } = await supabase
                .from('activity_monitoring_reports')
                .select('*')
                .eq('activity_id', activity.id)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });
            if (error) throw error;

            const activeReports = (reports || []) as ActivityMonitoringReport[];
            setMonitoringReports(activeReports);

            const reportIds = activeReports.map(report => report.id);
            if (reportIds.length === 0) {
                setLatestActionsByReportId({});
                return;
            }

            const { data: actions, error: actionsError } = await supabase
                .from('activity_monitoring_actions')
                .select('*')
                .in('monitoring_report_id', reportIds)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (actionsError) throw actionsError;

            setLatestActionsByReportId(buildLatestActionMap(activeReports, (actions || []) as ActivityMonitoringAction[]));
        } catch (error: any) {
            setMonitoringReports(cachedReportsForActivity);
            setLatestActionsByReportId(buildLatestActionMap(cachedReportsForActivity, cachedMonitoringActions));
            setMonitoringMessage(cachedReportsForActivity.length > 0
                ? `Showing cached Monitoring Reports. ${error.message || 'Unable to refresh live data.'}`
                : error.message || 'Unable to load Monitoring Reports.');
        } finally {
            setIsMonitoringLoading(false);
        }
    }, [activity.id, buildLatestActionMap, cachedMonitoringActions, cachedReportsForActivity, isMonitoringActivity]);

    useEffect(() => {
        loadMonitoringReports();
    }, [loadMonitoringReports]);

    const handleDriveFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!isAllowedActivityDriveFile(file)) {
            setDriveMessage('Only PDF and image files are allowed. Please upload a PDF, PNG, JPG, WEBP, or GIF file.');
            return;
        }
        if (!canEdit) {
            setDriveMessage('You do not have permission to upload Activity files.');
            return;
        }
        if (!driveStatus?.isConnected) {
            setDriveMessage(driveStatus?.connectionMessage || 'Ask an Admin to reconnect Google Drive storage.');
            return;
        }
        if (!activity.operatingUnit) {
            setDriveMessage('This activity needs an operating unit before files can be uploaded.');
            return;
        }
        if (!activity.component) {
            setDriveMessage('This activity needs a component before files can be uploaded.');
            return;
        }

        setIsDriveUploading(true);
        setDriveMessage(null);
        try {
            const uploaded = await uploadActivityDriveFile(currentUser, activity.id, file);
            setDriveFiles(prev => [uploaded, ...prev]);
            setDriveMessage(`${uploaded.file_name} uploaded successfully.`);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to upload Activity file.');
        } finally {
            setIsDriveUploading(false);
        }
    };

    const requestDriveFileDelete = (file: ActivityDriveFile) => {
        if (!canDeleteDriveFiles) return;
        setDriveFilePendingDelete(file);
    };

    const handleDriveFileDelete = async () => {
        const file = driveFilePendingDelete;
        if (!canDeleteDriveFiles || !file) return;
        setDeletingDriveFileId(file.id);
        setDriveMessage(null);
        try {
            await deleteActivityDriveFile(currentUser, file.id);
            setDriveFiles(prev => prev.filter(item => item.id !== file.id));
            setDriveMessage(`${file.file_name} deleted.`);
            setDriveFilePendingDelete(null);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to delete Activity file.');
        } finally {
            setDeletingDriveFileId(null);
        }
    };

    const galleryFiles = useMemo(() => driveFiles.filter(isActivityDriveImageFile), [driveFiles]);
    const selectedGalleryFile = galleryIndex !== null ? galleryFiles[galleryIndex] : null;

    useEffect(() => {
        if (galleryIndex !== null && galleryIndex >= galleryFiles.length) {
            setGalleryIndex(galleryFiles.length > 0 ? galleryFiles.length - 1 : null);
        }
    }, [galleryFiles.length, galleryIndex]);

    useEffect(() => {
        setGalleryImageFailed(false);
    }, [galleryIndex]);

    return (
        <div className="detail-page animate-fadeIn">
            {previewDriveFile && (
                <div className="dashboard-modal-backdrop animate-fadeIn" onClick={() => setPreviewDriveFile(null)}>
                    <div className="dashboard-modal dashboard-modal--wide drive-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <h3>{previewDriveFile.file_name}</h3>
                            <button type="button" className="dashboard-modal__close" onClick={() => setPreviewDriveFile(null)} aria-label="Close preview">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="drive-preview-modal__body">
                            {canPreviewActivityDriveFile(previewDriveFile) ? (
                                <iframe
                                    title={previewDriveFile.file_name}
                                    src={getActivityDrivePreviewUrl(previewDriveFile)}
                                    className="drive-preview-modal__frame"
                                    allow="autoplay"
                                />
                            ) : (
                                <div className="drive-preview-modal__empty">
                                    <FileText aria-hidden="true" />
                                    <p>Preview is not available for this file.</p>
                                </div>
                            )}
                        </div>
                        <div className="drive-preview-modal__footer">
                            <p>If the preview does not load, open the file directly in Google Drive.</p>
                            {previewDriveFile.web_view_link && (
                                <a className="btn btn-primary" href={previewDriveFile.web_view_link} target="_blank" rel="noreferrer">
                                    <ExternalLink aria-hidden="true" />
                                    Open in Drive
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {driveFilePendingDelete && (
                <div className="dashboard-modal-backdrop animate-fadeIn" onClick={() => !deletingDriveFileId && setDriveFilePendingDelete(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>Delete Drive File</h3>
                                <p className="dashboard-modal__metric-subtext">This removes the file from the 4KIS file list and attempts to delete it from Google Drive.</p>
                            </div>
                            <button type="button" className="dashboard-modal__close" onClick={() => setDriveFilePendingDelete(null)} aria-label="Close delete confirmation" disabled={!!deletingDriveFileId}>
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

            {selectedGalleryFile && (
                <div className="dashboard-modal-backdrop animate-fadeIn" onClick={() => setGalleryIndex(null)}>
                    <div className="dashboard-modal dashboard-modal--wide drive-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <h3>{selectedGalleryFile.file_name}</h3>
                            <button type="button" className="dashboard-modal__close" onClick={() => setGalleryIndex(null)} aria-label="Close gallery">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="drive-preview-modal__body">
                            {!galleryImageFailed ? (
                                <img
                                    src={getActivityDriveImageUrl(selectedGalleryFile, 1400)}
                                    alt={selectedGalleryFile.file_name}
                                    className="detail-preview-image"
                                    onError={() => setGalleryImageFailed(true)}
                                />
                            ) : (
                                <div className="drive-preview-modal__empty">
                                    <ImageIcon aria-hidden="true" />
                                    <p>Image preview is not available.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">{activity.name}</h1>
                    <p className="detail-meta">
                        {activity.location} | {formatDate(activity.date)}
                        {activity.endDate && activity.endDate !== activity.date ? ` - ${formatDate(activity.endDate)}` : ''}
                    </p>
                </div>
                <div className="detail-actions">
                    {(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) && (
                        <button onClick={() => handlePolicyEdit('accomplishment')} disabled={!canEditAccomplishment} className={`btn btn-primary btn-responsive ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                            <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Edit Accomplishment</span>
                        </button>
                    )}
                    <button onClick={onBack} className="btn btn-secondary btn-responsive" title={`Back to ${previousPageName}`}>
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back to {previousPageName}</span>
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="detail-grid">
                {/* Left Column: Info & Expenses */}
                <div className="detail-main">
                    
                    {/* Activity Details Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="detail-card-title mb-0">Activity Details</h3>
                            {(canEdit || canEditDetails) && (
                                <button onClick={() => handlePolicyEdit('details')} disabled={!canEditDetails} className={`table-action table-action--primary ${!canEditDetails ? 'is-disabled' : ''}`} title={canEditDetails ? 'Edit Details' : detailsDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Details
                                </button>
                            )}
                        </div>
                        <dl className="detail-dl">
                            <DetailItem label="Status" value={<span className={getStatusBadge(activity.status)}>{activity.status}</span>} />
                            <DetailItem label="Operating Unit" value={activity.operatingUnit} />
                            <DetailItem label="UID" value={activity.uid} />
                            <DetailItem label="Type" value={activity.type} />
                            <DetailItem label="Date" value={
                                <>
                                    {formatDate(activity.date)}
                                    {activity.endDate && activity.endDate !== activity.date ? ` to ${formatDate(activity.endDate)}` : ''}
                                </>
                            } />
                            <DetailItem label="Component" value={activity.component} />
                            <DetailItem label="Funding Year" value={activity.fundingYear} />
                            <DetailItem label="Tier" value={activity.tier} />
                            {activity.type === 'Training' && <DetailItem label="Facilitator" value={activity.facilitator} />}
                            <div className="detail-item detail-item--wide">
                                <dt className="detail-label">Description</dt>
                                <dd className="detail-note">{activity.description || 'No description provided.'}</dd>
                            </div>
                            
                            {/* Target Participants integrated here */}
                            <div className="detail-item detail-item--wide">
                                <h4 className="detail-section-title">Target Participants</h4>
                                <div className="detail-metric-grid mb-0">
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Male</span>
                                        <span className="detail-metric-value">{activity.participantsMale}</span>
                                    </div>
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Female</span>
                                        <span className="detail-metric-value">{activity.participantsFemale}</span>
                                    </div>
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Total</span>
                                        <span className="detail-metric-value">{activity.participantsMale + activity.participantsFemale}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-item detail-item--wide">
                                <dt className="detail-label mb-2">Participating IPOs</dt>
                                {activity.participatingIpos.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {activity.participatingIpos.map((ipoName, idx) => {
                                            const ipo = ipos.find(i => i.name === ipoName);
                                            return (
                                                <li key={idx}>
                                                    <button 
                                                        onClick={() => ipo && onSelectIpo(ipo)}
                                                        disabled={!ipo}
                                                        className={`detail-pill-button ${ipo ? 'detail-pill-button--active' : 'detail-pill-button--disabled'}`}
                                                        title={ipo ? 'View IPO Profile' : 'IPO details not found'}
                                                    >
                                                        <span className="detail-pill-button__dot"></span>
                                                        <span>{ipoName}</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="detail-empty">No participating IPOs selected.</p>
                                )}
                            </div>
                        </dl>
                    </div>

                    {/* Expenses Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Expenses & Budget</h3>
                            {(canEdit || canEditExpenses) && (
                                <button onClick={() => handlePolicyEdit('expenses')} disabled={!canEditExpenses} className={`table-action table-action--primary ${!canEditExpenses ? 'is-disabled' : ''}`} title={canEditExpenses ? 'Edit Expenses' : expensesDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Expenses
                                </button>
                            )}
                        </div>
                        <div className="data-table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Particulars</th>
                                        <th>Status</th>
                                        <th>UACS Code</th>
                                        <th>Obligation</th>
                                        <th>Disbursement</th>
                                        <th className="data-table__numeric">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.expenses.length > 0 ? (
                                        activity.expenses.map(exp => (
                                            <tr key={exp.id} className={`${isBudgetLineExcludedFromTargets(exp) ? 'budget-item-card--excluded' : ''} ${exp.isCancelled ? 'budget-item-card--cancelled' : ''} ${exp.isRealignment ? 'budget-item-card--realignment' : ''} ${exp.isSavings ? 'budget-item-card--savings' : ''}`}>
                                                <td className="data-table__primary">
                                                    {exp.expenseParticular}
                                                </td>
                                                <td>
                                                    {getBudgetLineTag(exp) ? (
                                                        <span className={`budget-line-badge budget-line-badge--${getBudgetLineTag(exp)?.toLowerCase()}`}>
                                                            {getBudgetLineTag(exp)}
                                                        </span>
                                                    ) : (
                                                        <span className="detail-empty">-</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {exp.uacsCode}
                                                    {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                                        <span className="detail-list-copy block">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                                    )}
                                                </td>
                                                <td>{formatMonthYear(exp.obligationMonth)}</td>
                                                <td>{formatMonthYear(exp.disbursementMonth)}</td>
                                                <td className="data-table__numeric">{formatCurrency(getBudgetLineAmount(exp))}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={6} className="text-center italic">No expenses recorded.</td></tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={5} className="data-table__numeric data-table__total-label">Active Target Budget</td>
                                        <td className="data-table__numeric data-table__total-value">{formatCurrency(totalBudget)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Accomplishment Report</h3>
                            {(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) && (
                                <button onClick={() => handlePolicyEdit('accomplishment')} disabled={!canEditAccomplishment} className={`table-action table-action--primary ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                                    <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="space-y-6">
                            
                            {/* Summary Cards */}
                            <div className="detail-metric-grid">
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Date Conducted</span>
                                    <div className="detail-metric-value">
                                        {formatDate(activity.actualDate)}
                                        {activity.actualEndDate && activity.actualEndDate !== activity.actualDate ? ` - ${formatDate(activity.actualEndDate)}` : ''}
                                    </div>
                                </div>
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Participants</span>
                                    <div className="detail-metric-value">
                                        {(activity.actualParticipantsMale || 0) + (activity.actualParticipantsFemale || 0)} 
                                        <span className="detail-metric-label ml-2">
                                            (M: {activity.actualParticipantsMale || 0}, F: {activity.actualParticipantsFemale || 0})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Accomplishment Table */}
                            <div>
                                <h4 className="detail-section-title">Financial Performance (Actual)</h4>
                                {activity.expenses.length > 0 ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Item</th>
                                                    <th>Actual Obligation Date</th>
                                                    <th>Actual Disbursement Date</th>
                                                    <th className="text-right">Actual Obligated Amount</th>
                                                    <th className="text-right">Actual Disbursed Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.expenses.map(exp => {
                                                    const obligationSummary = getActualObligationSummary(exp);
                                                    const disbursementSummary = getActualDisbursementSummary(exp);

                                                    return (
                                                        <tr key={exp.id}>
                                                            <td className="data-table__primary">{exp.expenseParticular}</td>
                                                            <td>{formatMonthYear(obligationSummary.date)}</td>
                                                            <td>{formatMonthYear(disbursementSummary.date)}</td>
                                                            <td className="data-table__numeric data-table__positive">
                                                                {obligationSummary.amount > 0 ? formatCurrency(obligationSummary.amount) : '-'}
                                                            </td>
                                                            <td className="data-table__numeric data-table__positive">
                                                                {disbursementSummary.amount > 0 ? formatCurrency(disbursementSummary.amount) : '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No expense items to report on.</p>
                                )}
                            </div>

                            {/* Gender and Inclusivity (Read-Only) */}
                            <div>
                                <h4 className="detail-section-title">Gender and Inclusivity</h4>
                                <div className="detail-dl">
                                    <DetailItem label="PWD" value={activity.actualPWD} />
                                    <DetailItem label="Muslim" value={activity.actualMuslim} />
                                    <DetailItem label="LGBTQ+" value={activity.actualLGBTQ} />
                                    <DetailItem label="Solo Parents" value={activity.actualSoloParent} />
                                    <DetailItem label="Senior" value={activity.actualSenior} />
                                    <DetailItem label="Youth" value={activity.actualYouth} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {isMonitoringActivity && (
                        <CollapsibleDetailCard title="Monitoring Reports" isOpen={expandedSections.monitoring} onToggle={() => toggleSection('monitoring')}>
                            {monitoringMessage && <p className="drive-file-card__message" role="status">{monitoringMessage}</p>}
                            {isMonitoringLoading ? (
                                <div className="drive-file-card__loading">
                                    <Loader2 className="animate-spin" aria-hidden="true" />
                                    <span>Loading Monitoring Reports...</span>
                                </div>
                            ) : participatingIpos.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    {participatingIpos.map(ipo => {
                                        const report = monitoringReports.find(item => Number(item.ipo_id) === Number(ipo.id));
                                        const latestAction = report ? latestActionsByReportId[report.id] : undefined;
                                        return (
                                            <article key={ipo.id} className="detail-list-item">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0">
                                                        <button
                                                            type="button"
                                                            className="detail-list-title table-link text-left"
                                                            onClick={() => onSelectIpo(ipo)}
                                                        >
                                                            {ipo.name}
                                                        </button>
                                                        <p className="detail-list-copy">{ipo.region || 'No region recorded'}</p>
                                                    </div>
                                                    <span className={`status-badge status-badge--compact ${report?.status === 'Completed' ? 'status-badge--completed' : report?.status === 'Ongoing' ? 'status-badge--ongoing' : 'status-badge--pending'}`}>
                                                        {report?.status || 'Pending'}
                                                    </span>
                                                </div>
                                                {report ? (
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
                                                ) : (
                                                    <p className="detail-empty mt-3">No report has been created for this IPO yet.</p>
                                                )}
                                                <div className="mt-3 flex justify-end">
                                                    <button
                                                        type="button"
                                                        className="table-action table-action--primary"
                                                        onClick={() => onOpenMonitoringReport?.(activity, ipo, report || null)}
                                                    >
                                                        {report ? <Eye aria-hidden="true" /> : <Plus aria-hidden="true" />}
                                                        {report ? 'View Report' : 'Create Report'}
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="detail-empty">No participating IPOs are linked to this monitoring activity.</p>
                            )}
                        </CollapsibleDetailCard>
                    )}

                    <CollapsibleDetailCard title="Gallery" isOpen={expandedSections.gallery} onToggle={() => toggleSection('gallery')}>
                        {galleryFiles.length > 0 ? (
                            <div className="ipo-gallery-grid">
                                {galleryFiles.map((file, index) => (
                                    <button
                                        key={file.id}
                                        type="button"
                                        className="ipo-gallery-tile"
                                        onClick={() => setGalleryIndex(index)}
                                        title={`Preview ${file.file_name}`}
                                    >
                                        <img
                                            src={getActivityDriveImageUrl(file, 420)}
                                            alt={file.file_name}
                                            loading="lazy"
                                            onError={(event) => {
                                                event.currentTarget.style.display = 'none';
                                            }}
                                        />
                                        <span className="ipo-gallery-tile__fallback">
                                            <ImageIcon aria-hidden="true" />
                                        </span>
                                        <span className="ipo-gallery-tile__caption">{file.file_name}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="detail-empty">No image files have been uploaded for this activity yet.</p>
                        )}
                    </CollapsibleDetailCard>

                    <CollapsibleDetailCard title="Activity Files" isOpen={expandedSections.files} onToggle={() => toggleSection('files')}>
                        <div className="drive-file-card__header">
                            <div>
                                <p className="drive-file-card__copy">PDF and image documentation is stored by upload year under this activity's Google Drive folder.</p>
                            </div>
                            <span className={`status-badge ${driveStatus?.isConnected ? 'status-badge--completed' : driveStatus?.tokenStatus === 'expired' ? 'status-badge--cancelled' : 'status-badge--neutral'}`}>
                                <HardDrive aria-hidden="true" />
                                {driveStatus?.isConnected ? 'Drive connected' : driveStatus?.tokenStatus === 'expired' ? 'Reconnect required' : 'Drive not connected'}
                            </span>
                        </div>

                        {driveMessage && <p className="drive-file-card__message" role="status">{driveMessage}</p>}

                        <div className="drive-file-card__toolbar">
                            <label
                                htmlFor={`activity-drive-upload-${activity.id}`}
                                className={`btn btn-primary ${(!canEdit || !driveStatus?.isConnected || isDriveUploading) ? 'is-disabled' : 'cursor-pointer'}`}
                                title={!driveStatus?.isConnected ? 'Ask an Admin to reconnect Google Drive storage' : 'Upload Activity file'}
                            >
                                {isDriveUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                                {isDriveUploading ? 'Uploading...' : 'Upload File'}
                            </label>
                            <input
                                id={`activity-drive-upload-${activity.id}`}
                                type="file"
                                className="hidden"
                                accept={ACTIVITY_DRIVE_FILE_ACCEPT}
                                onChange={handleDriveFileUpload}
                                disabled={!canEdit || !driveStatus?.isConnected || isDriveUploading}
                            />
                            <button type="button" className="btn btn-secondary" onClick={loadDriveFiles} disabled={isDriveLoading || isDriveUploading}>
                                {isDriveLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <HardDrive aria-hidden="true" />}
                                Refresh
                            </button>
                        </div>

                        {isDriveLoading ? (
                            <div className="drive-file-card__loading">
                                <Loader2 className="animate-spin" aria-hidden="true" />
                                <span>Loading Activity files...</span>
                            </div>
                        ) : driveFiles.length > 0 ? (
                            <ul className="detail-list">
                                {driveFiles.map(file => (
                                    <li key={file.id} className="detail-list-item drive-file-card__item">
                                        <div className="drive-file-card__file">
                                            <FileText aria-hidden="true" />
                                            <div className="min-w-0">
                                                <p className="detail-list-title">{file.file_name}</p>
                                                <p className="detail-list-copy">
                                                    {formatFileSize(file.file_size)} - Uploaded by {file.uploaded_by_name || 'Unknown user'} - {formatDate(file.uploaded_at)}
                                                    {file.folder_year ? ` - ${file.folder_year}` : ''}
                                                </p>
                                                <p className="detail-list-copy">
                                                    Activities / {file.folder_year || 'Year'} / {file.operating_unit || 'Operating Unit'} / {file.component || 'Component'} / {file.activity_name || 'Activity'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="drive-file-card__actions">
                                            {canPreviewActivityDriveFile(file) && (
                                                <button
                                                    type="button"
                                                    className="table-action table-action--primary"
                                                    onClick={() => setPreviewDriveFile(file)}
                                                >
                                                    <Eye aria-hidden="true" />
                                                    Preview
                                                </button>
                                            )}
                                            {file.web_view_link && (
                                                <a className="table-action table-action--primary" href={file.web_view_link} target="_blank" rel="noreferrer">
                                                    <ExternalLink aria-hidden="true" />
                                                    Open
                                                </a>
                                            )}
                                            {canDeleteDriveFiles && (
                                                <button
                                                    type="button"
                                                    className="table-action table-action--danger"
                                                    onClick={() => requestDriveFileDelete(file)}
                                                    disabled={deletingDriveFileId === file.id}
                                                >
                                                    {deletingDriveFileId === file.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No files have been uploaded for this activity yet.</p>
                        )}
                    </CollapsibleDetailCard>
                </div>

                {/* Right Column: History */}
                <div className="detail-aside">
                    <div className="detail-card">
                        <h3 className="detail-card-title">History</h3>
                        {activity.history && activity.history.length > 0 ? (
                            <div className="detail-timeline">
                                <ul className="detail-timeline__list">
                                    {activity.history.map((entry, index) => (
                                        <li key={index} className="detail-timeline__item">
                                            <span className="detail-timeline__marker"></span>
                                            <time className="detail-timeline__time">{formatDate(entry.date)}</time>
                                            <p className="detail-list-name">{entry.event}</p>
                                            <p className="detail-timeline__byline">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="detail-empty">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
