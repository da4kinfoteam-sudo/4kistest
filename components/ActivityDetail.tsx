
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Banknote,
    CalendarDays,
    CheckCircle2,
    Edit3,
    Eye,
    Landmark,
    Loader2,
    MapPin,
    Plus,
    RefreshCw,
    Trash2,
    UserCheck,
    Users,
    UploadCloud,
    Wallet,
    X
} from 'lucide-react';
import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, IPO, ReferenceActivity } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { getBudgetLineAmount, getBudgetLineTag, isBudgetLineExcludedFromTargets } from '../lib/budgetLineAdjustments';
import { getActualDisbursementSummary, getActualObligationSummary } from '../lib/financialActualSummary';
import { supabase } from '../supabaseClient';
import {
    ActivityDriveFile,
    deleteActivityDriveFile,
    formatFileSize,
    getActivityDriveImageUrl,
    getGoogleDriveStatus,
    GoogleDriveStatus,
    listActivityDriveFiles,
    uploadActivityDriveFile,
    updateActivityDriveFileMetadata,
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
import {
    RecordBackLink,
    RecordDetailAside,
    RecordDetailGrid,
    RecordDetailMain,
    RecordDetailPage,
    RecordHeader,
    RecordKpiCard,
    RecordKpiGrid,
    RecordPanel,
    formatRecordMetricCurrency,
    formatRecordMetricNumber
} from './ui/RecordDetailLayout';
import { getActivityDisplayTitle, resolveActivityIpos } from '../lib/entityIdentity';

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
    const [deletingDriveFileId, setDeletingDriveFileId] = useState<number | null>(null);
    const [driveMessage, setDriveMessage] = useState<string | null>(null);
    const [driveFilePendingDelete, setDriveFilePendingDelete] = useState<ActivityDriveFile | null>(null);
    const [uploadModal, setUploadModal] = useState<'gallery' | 'files' | null>(null);
    const [galleryView, setGalleryView] = useState<GalleryViewMode>('thumbnail');
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
            itemName: getActivityDisplayTitle(activity, referenceActivities, ipos),
            status: activity.status,
            action: mode === 'details' ? 'editDetails' : mode === 'expenses' ? 'editBudget' : physicalAccomplishmentDecision.allowed ? 'editPhysicalAccomplishment' : 'editFinancialAccomplishment',
            entityType: 'activity',
        });
        if (allowed) onEdit(mode);
    };

    const totalBudget = useMemo(() => {
       return activity.expenses.reduce((acc, item) => acc + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)), 0);
    }, [activity.expenses]);
    const totalObligated = useMemo(
        () => activity.expenses.reduce((total, expense) => total + getActualObligationSummary(expense).amount, 0),
        [activity.expenses]
    );
    const totalDisbursed = useMemo(
        () => activity.expenses.reduce((total, expense) => total + getActualDisbursementSummary(expense).amount, 0),
        [activity.expenses]
    );
    const targetParticipantCount = (activity.participantsMale || 0) + (activity.participantsFemale || 0);
    const actualParticipantCount = (activity.actualParticipantsMale || 0) + (activity.actualParticipantsFemale || 0);
    const monitoringReference = useMemo(() => referenceActivities.find(ref =>
        ref.activity_name === 'Subproject Monitoring' &&
        ref.component === 'Program Management' &&
        ref.type === 'Activity'
    ), [referenceActivities]);

    const isMonitoringActivity = !!activity.reference_activity_id &&
        !!monitoringReference?.id &&
        String(activity.reference_activity_id) === String(monitoringReference.id);

    const participatingIpos = useMemo(
        () => resolveActivityIpos(activity, ipos),
        [activity, ipos]
    );

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

    const uploadDriveFile = async (file: File, uploadSection: DriveUploadSection) => {
        if (!canEdit) {
            throw new Error('You do not have permission to upload Activity files.');
        }
        if (!driveStatus?.isConnected) {
            throw new Error(driveStatus?.connectionMessage || 'Ask an Admin to reconnect Google Drive storage.');
        }
        if (!activity.operatingUnit) {
            throw new Error('This activity needs an operating unit before files can be uploaded.');
        }
        if (!activity.component) {
            throw new Error('This activity needs a component before files can be uploaded.');
        }
        return uploadActivityDriveFile(currentUser, activity.id, file, uploadSection);
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

    const galleryFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'gallery'), [driveFiles]);
    const documentFiles = useMemo(() => driveFiles.filter(file => getPersistedDriveUploadSection(file) === 'files'), [driveFiles]);

    return (
        <RecordDetailPage className="activity-record-detail-page animate-fadeIn">
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
            {uploadModal && (
                <DriveUploadModal
                    section={uploadModal}
                    title={uploadModal === 'gallery' ? 'Upload Gallery Images' : 'Add Activity Files'}
                    description={uploadModal === 'gallery'
                        ? 'Add field photos to the Activity Gallery.'
                        : 'Upload supporting documents. These files do not appear in the Gallery.'}
                    canUpload={canEdit}
                    isConnected={!!driveStatus?.isConnected}
                    uploadFile={uploadDriveFile}
                    onUploaded={file => setDriveFiles(current => [file, ...current])}
                    onBatchComplete={(message) => setDriveMessage(message)}
                    onClose={() => setUploadModal(null)}
                />
            )}

            <RecordBackLink onClick={onBack}>Back to {previousPageName}</RecordBackLink>

            <RecordHeader
                title={getActivityDisplayTitle(activity, referenceActivities, ipos)}
                metadata={
                    <>
                        <span className="ipo-detail-record-id">{activity.uid || `ACT-${activity.id}`}</span>
                        <span className={getStatusBadge(activity.status)}>{activity.status}</span>
                        <span><MapPin aria-hidden="true" />{activity.location || 'Location not recorded'}</span>
                        <span>
                            <CalendarDays aria-hidden="true" />
                            {formatDate(activity.date)}
                            {activity.endDate && activity.endDate !== activity.date ? ` to ${formatDate(activity.endDate)}` : ''}
                        </span>
                    </>
                }
                actions={(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) ? (
                        <button onClick={() => handlePolicyEdit('accomplishment')} disabled={!canEditAccomplishment} className={`btn btn-primary btn-responsive ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                            <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Edit Accomplishment</span>
                        </button>
                    ) : null}
            />

            <RecordKpiGrid aria-label="Activity overview statistics">
                <RecordKpiCard label="Target Budget" value={formatRecordMetricCurrency(totalBudget)} title={formatCurrency(totalBudget)} note="Active target budget" icon={<Wallet />} />
                <RecordKpiCard label="Obligated" value={formatRecordMetricCurrency(totalObligated)} title={formatCurrency(totalObligated)} note={`${totalBudget > 0 ? Math.round((totalObligated / totalBudget) * 100) : 0}% of target`} icon={<Landmark />} />
                <RecordKpiCard label="Disbursed" value={formatRecordMetricCurrency(totalDisbursed)} title={formatCurrency(totalDisbursed)} note={`${totalBudget > 0 ? Math.round((totalDisbursed / totalBudget) * 100) : 0}% of target`} icon={<Banknote />} />
                <RecordKpiCard label="Target Participants" value={formatRecordMetricNumber(targetParticipantCount)} title={targetParticipantCount.toLocaleString()} note={`M: ${activity.participantsMale || 0} · F: ${activity.participantsFemale || 0}`} icon={<Users />} />
                <RecordKpiCard label="Actual Participants" value={formatRecordMetricNumber(actualParticipantCount)} title={actualParticipantCount.toLocaleString()} note={`M: ${activity.actualParticipantsMale || 0} · F: ${activity.actualParticipantsFemale || 0}`} icon={<UserCheck />} />
                <RecordKpiCard label="Participating IPOs" value={formatRecordMetricNumber(participatingIpos.length)} title={participatingIpos.length.toLocaleString()} note="Linked organizations" icon={<Users />} />
            </RecordKpiGrid>

            {/* Content Grid */}
            <RecordDetailGrid>
                {/* Left Column: Info & Expenses */}
                <RecordDetailMain>
                    
                    {/* Activity Details Section */}
                    <RecordPanel
                        title="Activity Details"
                        description="Schedule, classification, and implementation details"
                        actions={(canEdit || canEditDetails) ? (
                                <button onClick={() => handlePolicyEdit('details')} disabled={!canEditDetails} className={`table-action table-action--primary ${!canEditDetails ? 'is-disabled' : ''}`} title={canEditDetails ? 'Edit Details' : detailsDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Details
                                </button>
                            ) : null}
                    >
                        <dl className="detail-dl record-detail-dl--three">
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
                        </dl>
                    </RecordPanel>

                    <RecordPanel title="Target Participants" description="Planned attendance by demographic">
                        <div className="detail-metric-grid">
                            <div className="detail-metric detail-metric--inline">
                                <span className="detail-metric-label">Male</span>
                                <span className="detail-metric-value">{activity.participantsMale || 0}</span>
                            </div>
                            <div className="detail-metric detail-metric--inline">
                                <span className="detail-metric-label">Female</span>
                                <span className="detail-metric-value">{activity.participantsFemale || 0}</span>
                            </div>
                            <div className="detail-metric detail-metric--inline">
                                <span className="detail-metric-label">Total</span>
                                <span className="detail-metric-value">{targetParticipantCount}</span>
                            </div>
                        </div>
                    </RecordPanel>

                    <RecordPanel title="Participating IPOs" description="Organizations attending this activity">
                        {participatingIpos.length > 0 ? (
                            <ul className="detail-list">
                                {participatingIpos.map(ipo => (
                                    <li key={ipo.id} className="detail-list-item">
                                        <button
                                            type="button"
                                            onClick={() => onSelectIpo(ipo)}
                                            className="detail-list-title table-link text-left"
                                        >
                                            {ipo.name}
                                        </button>
                                        <p className="detail-list-copy">{ipo.region || 'Region not recorded'}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No participating IPOs selected.</p>
                        )}
                    </RecordPanel>

                    {/* Expenses Section */}
                    <RecordPanel
                        title="Expenses & Budget"
                        description="Planned expense lines and financial schedule"
                        actions={(canEdit || canEditExpenses) ? (
                                <button onClick={() => handlePolicyEdit('expenses')} disabled={!canEditExpenses} className={`table-action table-action--primary ${!canEditExpenses ? 'is-disabled' : ''}`} title={canEditExpenses ? 'Edit Expenses' : expensesDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Expenses
                                </button>
                            ) : null}
                    >
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
                    </RecordPanel>

                    {/* NEW: Accomplishment Report Section */}
                    <RecordPanel
                        title="Accomplishment Report"
                        description="Physical, financial, and participant accomplishment"
                        actions={(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) ? (
                                <button onClick={() => handlePolicyEdit('accomplishment')} disabled={!canEditAccomplishment} className={`table-action table-action--primary ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                                    <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                                    Edit Accomplishment
                                </button>
                            ) : null}
                    >
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
                    </RecordPanel>

                    {isMonitoringActivity && (
                        <RecordPanel title="Monitoring Reports" description="Latest field validation by participating IPO">
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
                        </RecordPanel>
                    )}

                    <RecordPanel
                        title="Gallery"
                        description="Field photos and activity documentation"
                        actions={
                            <>
                                <GalleryViewToggle view={galleryView} onChange={setGalleryView} />
                                <button type="button" className="btn btn-secondary btn-compact" onClick={loadDriveFiles}>
                                    <RefreshCw aria-hidden="true" />
                                    Refresh
                                </button>
                                {canEdit && (
                                    <button type="button" className="btn btn-secondary btn-compact" onClick={() => setUploadModal('gallery')}>
                                        <UploadCloud aria-hidden="true" />
                                        Upload
                                    </button>
                                )}
                            </>
                        }
                    >
                        <EntityGallery
                            storageKey="activity"
                            files={galleryFiles}
                            isLoading={isDriveLoading}
                            canEdit={canEdit}
                            canDelete={canDeleteDriveFiles}
                            isConnected={!!driveStatus?.isConnected}
                            getImageUrl={getActivityDriveImageUrl}
                            uploadFile={uploadDriveFile}
                            updateMetadata={(file, name, imageCaption) => updateActivityDriveFileMetadata(currentUser, file.id, name, imageCaption)}
                            onFileAdded={file => setDriveFiles(current => [file, ...current])}
                            onFileUpdated={file => setDriveFiles(current => current.map(item => item.id === file.id ? file : item))}
                            onRequestDelete={requestDriveFileDelete}
                            onRefresh={loadDriveFiles}
                            onMessage={(message) => setDriveMessage(message)}
                            showUploader={false}
                            showToolbar={false}
                            view={galleryView}
                            onViewChange={setGalleryView}
                        />
                    </RecordPanel>

                    <RecordPanel
                        title="Activity Files"
                        description="Supporting documents, separate from the Gallery"
                        actions={canEdit ? (
                            <button type="button" className="btn btn-secondary btn-compact" onClick={() => setUploadModal('files')}>
                                <UploadCloud aria-hidden="true" />
                                Add Files
                            </button>
                        ) : null}
                    >
                        {driveMessage && <p className="drive-file-card__message" role="status">{driveMessage}</p>}
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
                            onMessage={(message) => setDriveMessage(message)}
                            showUploader={false}
                            showToolbar={false}
                        />
                    </RecordPanel>
                </RecordDetailMain>

                {/* Right Column: History */}
                <RecordDetailAside>
                    <RecordPanel title="Summary">
                        <dl className="ipo-summary-list">
                            <div><dt>Component</dt><dd>{activity.component || 'N/A'}</dd></div>
                            <div><dt>Fund Year</dt><dd>{activity.fundingYear || 'N/A'}</dd></div>
                            <div><dt>Tier</dt><dd>{activity.tier || 'N/A'}</dd></div>
                            <div><dt>Target Budget</dt><dd>{formatCurrency(totalBudget)}</dd></div>
                            <div><dt>Participating IPOs</dt><dd>{participatingIpos.length}</dd></div>
                        </dl>
                    </RecordPanel>

                    <RecordPanel title="Attendance Snapshot" description="Target vs actual">
                        <div className="ipo-membership-overview">
                            <div className="ipo-membership-stat">
                                <span>Target</span>
                                <strong>{targetParticipantCount.toLocaleString()}</strong>
                            </div>
                            <div className="ipo-membership-stat">
                                <span>Actual</span>
                                <strong>{actualParticipantCount.toLocaleString()}</strong>
                            </div>
                        </div>
                        <div className="ipo-membership-progress">
                            <div>
                                <span>Attendance rate</span>
                                <strong>{targetParticipantCount > 0 ? Math.round((actualParticipantCount / targetParticipantCount) * 100) : 0}%</strong>
                            </div>
                            <span className="ipo-progress" aria-hidden="true">
                                <span style={{ width: `${targetParticipantCount > 0 ? Math.min(100, (actualParticipantCount / targetParticipantCount) * 100) : 0}%` }} />
                            </span>
                        </div>
                    </RecordPanel>

                    <RecordPanel title="History" description="Recent activity">
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
                    </RecordPanel>
                </RecordDetailAside>
            </RecordDetailGrid>
        </RecordDetailPage>
    );
};
