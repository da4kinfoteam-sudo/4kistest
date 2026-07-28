import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, ActivityMonitoringStatus, IPO } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { supabase } from '../supabaseClient';
import { getActivityDisplayTitle } from '../lib/entityIdentity';

interface ActivityMonitoringReportDetailProps {
    activity: Activity;
    ipo: IPO;
    initialReport?: ActivityMonitoringReport | null;
    initialActions?: ActivityMonitoringAction[];
    onBack: () => void;
}

const statusOptions: ActivityMonitoringStatus[] = ['Pending', 'Ongoing', 'Completed'];

const formatDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const displayUserName = (user: ReturnType<typeof useAuth>['currentUser']) =>
    user?.fullName || user?.username || 'System';

type ReportTextField = 'findings' | 'issues' | 'recommendations';
type ReportEditableField = ReportTextField | 'status';

const createEditingState = (activeField?: ReportEditableField): Record<ReportEditableField, boolean> => ({
    status: activeField === 'status',
    findings: activeField === 'findings',
    issues: activeField === 'issues',
    recommendations: activeField === 'recommendations',
});

const createSavingState = (activeField?: ReportEditableField): Record<ReportEditableField, boolean> => ({
    status: activeField === 'status',
    findings: activeField === 'findings',
    issues: activeField === 'issues',
    recommendations: activeField === 'recommendations',
});

const fieldLabels: Record<ReportEditableField, string> = {
    status: 'Status',
    findings: 'Findings',
    issues: 'Issues',
    recommendations: 'Recommendations',
};

const AutoGrowTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ value, onChange, ...props }) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const minimumHeight = Number(textarea.dataset.minHeightPx || 128);
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight, minimumHeight)}px`;
    }, [value]);

    return (
        <textarea
            {...props}
            ref={textareaRef}
            value={value}
            onChange={onChange}
        />
    );
};

const ActivityMonitoringReportDetail: React.FC<ActivityMonitoringReportDetailProps> = ({
    activity,
    ipo,
    initialReport,
    initialActions = [],
    onBack
}) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Activities');
    const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [report, setReport] = useState<ActivityMonitoringReport | null>(initialReport || null);
    const [status, setStatus] = useState<ActivityMonitoringStatus>(initialReport?.status || 'Pending');
    const [findings, setFindings] = useState(initialReport?.findings || '');
    const [issues, setIssues] = useState(initialReport?.issues || '');
    const [recommendations, setRecommendations] = useState(initialReport?.recommendations || '');
    const [actions, setActions] = useState<ActivityMonitoringAction[]>(initialActions);
    const [newAction, setNewAction] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [fieldMessages, setFieldMessages] = useState<Partial<Record<ReportEditableField, string>>>({});
    const [editingFields, setEditingFields] = useState<Record<ReportEditableField, boolean>>(createEditingState());
    const [savingFields, setSavingFields] = useState<Record<ReportEditableField, boolean>>(createSavingState());
    const [isLoading, setIsLoading] = useState(true);
    const [isAddingAction, setIsAddingAction] = useState(false);

    const canEditReport = canEdit || isAdmin;

    useEffect(() => {
        setActions(initialActions);
    }, [initialActions]);

    const syncReportValues = useCallback((activeReport: ActivityMonitoringReport | null) => {
        setStatus(activeReport?.status || 'Pending');
        setFindings(activeReport?.findings || '');
        setIssues(activeReport?.issues || '');
        setRecommendations(activeReport?.recommendations || '');
    }, []);

    const loadReport = useCallback(async () => {
        if (!activity.id || !ipo.id) return;
        if (!supabase) {
            setActions(initialActions);
            setMessage(initialReport ? 'Showing cached Monitoring Report.' : null);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setMessage(null);
        try {
            let activeReport = report;
            if (!activeReport) {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .select('*')
                    .eq('activity_id', activity.id)
                    .eq('ipo_id', ipo.id)
                    .is('deleted_at', null)
                    .maybeSingle();
                if (error) throw error;
                activeReport = data as ActivityMonitoringReport | null;
                setReport(activeReport);
                syncReportValues(activeReport);
            }

            if (!activeReport?.id) {
                setActions([]);
                return;
            }

            const { data: actionRows, error: actionError } = await supabase
                .from('activity_monitoring_actions')
                .select('*')
                .eq('monitoring_report_id', activeReport.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (actionError) throw actionError;
            setActions((actionRows || []) as ActivityMonitoringAction[]);
        } catch (error: any) {
            setActions(initialActions);
            setMessage(initialReport
                ? `Showing cached Monitoring Report. ${error.message || 'Unable to refresh live data.'}`
                : error.message || 'Unable to load monitoring report.');
        } finally {
            setIsLoading(false);
        }
    }, [activity.id, initialActions, initialReport, ipo.id, report, syncReportValues]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const baseReportPayload = useMemo(() => ({
        activity_id: activity.id,
        ipo_id: ipo.id,
        reported_by: currentUser?.id || null,
        reported_by_name: displayUserName(currentUser),
        updated_at: new Date().toISOString()
    }), [activity.id, currentUser, ipo.id]);

    const setFieldEditing = (field: ReportEditableField, value: boolean) => {
        setEditingFields(prev => ({ ...prev, [field]: value }));
        setFieldMessages(prev => ({ ...prev, [field]: undefined }));
    };

    const resetFieldDraft = (field: ReportEditableField) => {
        if (field === 'status') setStatus(report?.status || 'Pending');
        if (field === 'findings') setFindings(report?.findings || '');
        if (field === 'issues') setIssues(report?.issues || '');
        if (field === 'recommendations') setRecommendations(report?.recommendations || '');
        setFieldEditing(field, false);
    };

    const saveReportPatch = async (field: ReportEditableField, patch: Partial<ActivityMonitoringReport>) => {
        if (!supabase || !canEditReport) return;
        setSavingFields(createSavingState(field));
        setMessage(null);
        setFieldMessages(prev => ({ ...prev, [field]: undefined }));
        try {
            const payload = {
                ...baseReportPayload,
                status: report?.status || status || 'Pending',
                ...patch,
                updated_at: new Date().toISOString(),
            };

            if (report?.id) {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .update(payload)
                    .eq('id', report.id)
                    .select('*')
                    .single();
                if (error) throw error;
                setReport(data as ActivityMonitoringReport);
                syncReportValues(data as ActivityMonitoringReport);
            } else {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .insert({
                        ...payload,
                        created_at: new Date().toISOString()
                    })
                    .select('*')
                    .single();
                if (error) throw error;
                setReport(data as ActivityMonitoringReport);
                syncReportValues(data as ActivityMonitoringReport);
            }
            setFieldEditing(field, false);
            setFieldMessages(prev => ({ ...prev, [field]: `${fieldLabels[field]} saved.` }));
        } catch (error: any) {
            setFieldMessages(prev => ({ ...prev, [field]: error.message || `Unable to save ${fieldLabels[field].toLowerCase()}.` }));
        } finally {
            setSavingFields(createSavingState());
        }
    };

    const handleSaveStatus = () => saveReportPatch('status', { status });

    const handleSaveTextField = (field: ReportTextField, value: string) => {
        saveReportPatch(field, { [field]: value.trim() || null } as Partial<ActivityMonitoringReport>);
    };

    const renderFieldActions = (field: ReportEditableField, onSave: () => void) => {
        if (!canEditReport) return null;
        if (editingFields[field]) {
            return (
                <div className="monitoring-report-field__actions">
                    <button
                        type="button"
                        className="table-action"
                        onClick={() => resetFieldDraft(field)}
                        disabled={savingFields[field]}
                    >
                        <X aria-hidden="true" />
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="table-action table-action--primary"
                        onClick={onSave}
                        disabled={savingFields[field]}
                    >
                        {savingFields[field] ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                        {savingFields[field] ? 'Saving...' : 'Save'}
                    </button>
                </div>
            );
        }
        return (
            <button type="button" className="table-action table-action--primary" onClick={() => setFieldEditing(field, true)}>
                <Edit3 aria-hidden="true" />
                {report ? 'Edit' : 'Add'}
            </button>
        );
    };

    const renderTextField = (field: ReportTextField, value: string, setValue: (value: string) => void) => (
        <section className="monitoring-report-field">
            <div className="monitoring-report-field__header">
                <h4>{fieldLabels[field]}</h4>
                {renderFieldActions(field, () => handleSaveTextField(field, value))}
            </div>
            {editingFields[field] ? (
                <AutoGrowTextarea
                    value={value}
                    onChange={event => setValue(event.target.value)}
                    className="form-control monitoring-report-textarea"
                    placeholder={`Add ${fieldLabels[field].toLowerCase()}...`}
                />
            ) : (
                <p className="monitoring-report-readonly">
                    {value || `No ${fieldLabels[field].toLowerCase()} recorded.`}
                </p>
            )}
            {fieldMessages[field] && <p className="monitoring-report-field__message" role="status">{fieldMessages[field]}</p>}
        </section>
    );

    const handleAddAction = async () => {
        if (!supabase || !canEditReport || !newAction.trim()) return;
        if (!report?.id) {
            setMessage('Save the monitoring report before adding action updates.');
            return;
        }
        setIsAddingAction(true);
        setMessage(null);
        try {
            const { data, error } = await supabase
                .from('activity_monitoring_actions')
                .insert({
                    monitoring_report_id: report.id,
                    action_taken: newAction.trim(),
                    created_by: currentUser?.id || null,
                    created_by_name: displayUserName(currentUser),
                    created_at: new Date().toISOString()
                })
                .select('*')
                .single();
            if (error) throw error;
            setActions(prev => [data as ActivityMonitoringAction, ...prev]);
            setNewAction('');
            setMessage('Action update added.');
        } catch (error: any) {
            setMessage(error.message || 'Unable to add action update.');
        } finally {
            setIsAddingAction(false);
        }
    };

    const handleEditAction = async (action: ActivityMonitoringAction) => {
        if (!supabase || !isAdmin) return;
        const nextValue = window.prompt('Update action taken:', action.action_taken);
        if (nextValue === null || !nextValue.trim()) return;
        try {
            const editedAt = new Date().toISOString();
            const { data, error } = await supabase
                .from('activity_monitoring_actions')
                .update({
                    action_taken: nextValue.trim(),
                    edited_by: currentUser?.id || null,
                    edited_by_name: displayUserName(currentUser),
                    edited_at: editedAt,
                    updated_at: editedAt
                })
                .eq('id', action.id)
                .select('*')
                .single();
            if (error) throw error;
            setActions(prev => prev.map(item => item.id === action.id ? data as ActivityMonitoringAction : item));
        } catch (error: any) {
            setMessage(error.message || 'Unable to edit action update.');
        }
    };

    const handleDeleteAction = async (action: ActivityMonitoringAction) => {
        if (!supabase || !isAdmin) return;
        if (!confirm('Delete this action update?')) return;
        try {
            const deletedAt = new Date().toISOString();
            const { error } = await supabase
                .from('activity_monitoring_actions')
                .update({
                    deleted_at: deletedAt,
                    deleted_by: currentUser?.id || null,
                    deleted_by_name: displayUserName(currentUser)
                })
                .eq('id', action.id);
            if (error) throw error;
            setActions(prev => prev.filter(item => item.id !== action.id));
        } catch (error: any) {
            setMessage(error.message || 'Unable to delete action update.');
        }
    };

    return (
        <div className="detail-page animate-fadeIn">
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">Monitoring Report</h1>
                    <p className="detail-meta">{getActivityDisplayTitle(activity, [], [ipo])} | {ipo.name}</p>
                </div>
                <div className="detail-actions">
                    <button type="button" onClick={onBack} className="btn btn-secondary btn-responsive">
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back</span>
                    </button>
                </div>
            </header>

            <div className="detail-grid">
                <main className="detail-main">
                    <section className="detail-card">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="detail-card-title mb-0">Report Details</h3>
                            <span className={`status-badge status-badge--compact ${status === 'Completed' ? 'status-badge--completed' : status === 'Ongoing' ? 'status-badge--ongoing' : 'status-badge--pending'}`}>
                                {status}
                            </span>
                        </div>

                        {message && <p className="drive-file-card__message" role="status">{message}</p>}
                        {isLoading ? (
                            <div className="drive-file-card__loading">
                                <Loader2 className="animate-spin" aria-hidden="true" />
                                <span>Loading monitoring report...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <section className="monitoring-report-field">
                                    <div className="monitoring-report-field__header">
                                        <h4>Status</h4>
                                        {renderFieldActions('status', handleSaveStatus)}
                                    </div>
                                    {editingFields.status ? (
                                        <select value={status} onChange={event => setStatus(event.target.value as ActivityMonitoringStatus)} className="form-control">
                                            {statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                        </select>
                                    ) : (
                                        <p className="monitoring-report-readonly monitoring-report-readonly--compact">{status}</p>
                                    )}
                                    {fieldMessages.status && <p className="monitoring-report-field__message" role="status">{fieldMessages.status}</p>}
                                </section>
                                {renderTextField('findings', findings, setFindings)}
                                {renderTextField('issues', issues, setIssues)}
                                {renderTextField('recommendations', recommendations, setRecommendations)}
                            </div>
                        )}
                    </section>
                </main>

                <aside className="detail-aside">
                    <section className="detail-card">
                        <h3 className="detail-card-title">Action Timeline</h3>
                        {canEditReport && (
                            <div className="space-y-3 mb-4">
                                <AutoGrowTextarea
                                    value={newAction}
                                    onChange={event => setNewAction(event.target.value)}
                                    className="form-control monitoring-report-textarea monitoring-report-textarea--compact"
                                    data-min-height-px="80"
                                    placeholder="Add action taken..."
                                />
                                <button type="button" className="btn btn-primary w-full" onClick={handleAddAction} disabled={isAddingAction || !newAction.trim()}>
                                    {isAddingAction ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                                    Add Action
                                </button>
                            </div>
                        )}

                        {actions.length > 0 ? (
                            <ul className="detail-list">
                                {actions.map(action => (
                                    <li key={action.id} className="detail-list-item">
                                        <p className="detail-list-title">{action.action_taken}</p>
                                        <p className="detail-list-copy">
                                            {formatDateTime(action.created_at)} by {action.created_by_name || 'Unknown user'}
                                            {action.edited_at ? ` - edited ${formatDateTime(action.edited_at)}` : ''}
                                        </p>
                                        {isAdmin && (
                                            <div className="drive-file-card__actions mt-2">
                                                <button type="button" className="table-action table-action--primary" onClick={() => handleEditAction(action)}>
                                                    <Edit3 aria-hidden="true" />
                                                    Edit
                                                </button>
                                                <button type="button" className="table-action table-action--danger" onClick={() => handleDeleteAction(action)}>
                                                    <Trash2 aria-hidden="true" />
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No action updates yet.</p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default ActivityMonitoringReportDetail;
