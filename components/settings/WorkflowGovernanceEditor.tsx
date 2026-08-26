import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Save } from 'lucide-react';
import { workflowPermissionModules } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import type { UserPermissionRule } from '../../lib/accessControl';
import { supabase } from '../../supabaseClient';

const WorkflowGovernanceEditor: React.FC = () => {
    const { currentUser, usersList, roleRules, hasAccess, getAccessDecision } = useAuth();
    const [defaultAdministratorId, setDefaultAdministratorId] = useState<number | null>(null);
    const [legacyEnabled, setLegacyEnabled] = useState(false);
    const [legacyModules, setLegacyModules] = useState<string[]>([...workflowPermissionModules]);
    const [legacyOwner, setLegacyOwner] = useState('');
    const [legacyCutoff, setLegacyCutoff] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [assignments, setAssignments] = useState<Array<{ submitter_user_id: number; approver_user_id: number; module: string; active: boolean }>>([]);
    const [pendingCounts, setPendingCounts] = useState<Record<number, number>>({});
    const [allUserRules, setAllUserRules] = useState<UserPermissionRule[]>([]);

    const canManage = hasAccess('Settings - Workflow', 'manage_approver_assignments');
    const actorIsSuper = getAccessDecision('Settings - Workflow', 'manage_approver_assignments').source === 'super_admin_invariant';
    const approvers = useMemo(() => usersList.filter(user => user.is_active !== false
        && (user.role === 'Super Admin' || workflowPermissionModules.some(module => {
            const override = allUserRules.find(rule => rule.user_id === user.id && rule.module === module && rule.action === 'approve');
            if (override) return override.effect === 'allow';
            return roleRules.some(rule => rule.role === user.role && rule.module === module && rule.action === 'approve' && rule.allowed);
        }))), [allUserRules, roleRules, usersList]);
    const migrationUsers = useMemo(() => usersList.filter(user => user.is_active !== false && user.role === 'User'), [usersList]);
    const migrationRows = useMemo(() => migrationUsers.map(user => {
        const userAssignments = assignments.filter(assignment => assignment.submitter_user_id === user.id && assignment.active);
        const assignedNames = [...new Set(userAssignments.map(assignment => usersList.find(candidate => candidate.id === assignment.approver_user_id)?.fullName || 'Unknown'))];
        const pending = pendingCounts[user.id] || 0;
        return {
            user,
            assignedApprover: assignedNames.length ? assignedNames.join(', ') : 'None',
            pending,
            recommendedRole: user.operatingUnit === 'NPMO' ? 'Focal - User' : 'RFO - User',
            status: pending > 0 ? 'Workflow records pending' : userAssignments.length ? 'Assigned; no pending records' : 'Needs approver assignment',
        };
    }), [assignments, migrationUsers, pendingCounts, usersList]);

    useEffect(() => {
        if (!supabase || !canManage) return;
        void Promise.all([
            supabase.from('workflow_settings').select('default_administrator_id').eq('singleton', true).single(),
            supabase.from('authorization_policy').select('legacy_user_auto_approve_enabled,legacy_user_auto_approve_modules,legacy_user_auto_approve_owner,legacy_user_auto_approve_cutoff').eq('singleton', true).single(),
            supabase.from('authorization_user_rules').select('user_id,module,action,effect'),
        ]).then(([workflow, policy, userRules]) => {
            if (workflow.error || policy.error || userRules.error) {
                setError(workflow.error?.message || policy.error?.message || userRules.error?.message || 'Unable to load workflow governance.');
                return;
            }
            setDefaultAdministratorId(workflow.data?.default_administrator_id || null);
            setLegacyEnabled(Boolean(policy.data?.legacy_user_auto_approve_enabled));
            setLegacyModules(Array.isArray(policy.data?.legacy_user_auto_approve_modules) ? policy.data.legacy_user_auto_approve_modules : [...workflowPermissionModules]);
            setLegacyOwner(policy.data?.legacy_user_auto_approve_owner || '');
            setLegacyCutoff(policy.data?.legacy_user_auto_approve_cutoff || '');
            setAllUserRules((userRules.data || []) as UserPermissionRule[]);
        });
        void (async () => {
            const assignmentResult = await supabase.from('workflow_assignments').select('submitter_user_id,approver_user_id,module,active');
            if (!assignmentResult.error) setAssignments((assignmentResult.data || []) as Array<{ submitter_user_id: number; approver_user_id: number; module: string; active: boolean }>);
            const tableByModule: Record<string, string> = {
                Subprojects: 'subprojects', Activities: 'activities',
                'Program Management - Office Requirements': 'office_requirements',
                'Program Management - Staffing Requirements': 'staffing_requirements',
                'Program Management - Other Program Expenses': 'other_program_expenses',
            };
            const results = await Promise.all(workflowPermissionModules.map(module => supabase.from(tableByModule[module]).select('created_by_user_id').eq('workflow_status', 'PENDING')));
            const counts: Record<number, number> = {};
            results.forEach(result => (result.data || []).forEach((row: any) => {
                if (row.created_by_user_id) counts[row.created_by_user_id] = (counts[row.created_by_user_id] || 0) + 1;
            }));
            setPendingCounts(counts);
        })();
    }, [canManage]);

    const save = async () => {
        if (!supabase || !currentUser || !canManage) return;
        if (legacyEnabled && !actorIsSuper) {
            setError('Only Super Admin may enable the temporary legacy User auto-approval exception.');
            return;
        }
        if (legacyEnabled && (!legacyOwner.trim() || !legacyCutoff)) {
            setError('Temporary User auto-approval requires both an accountable owner and a cutoff date. Until configured, User submissions follow the ordinary approval workflow.');
            return;
        }
        if (legacyEnabled && legacyModules.length === 0) {
            setError('Select at least one workflow module for the temporary User auto-approval exception.');
            return;
        }
        setSaving(true);
        setError(null);
        const [workflow, policy] = await Promise.all([
            supabase.from('workflow_settings').update({ default_administrator_id: defaultAdministratorId, updated_at: new Date().toISOString(), updated_by: currentUser.id }).eq('singleton', true),
            supabase.from('authorization_policy').update({ legacy_user_auto_approve_enabled: legacyEnabled, legacy_user_auto_approve_modules: legacyEnabled ? legacyModules : [], legacy_user_auto_approve_owner: legacyEnabled ? legacyOwner.trim() : null, legacy_user_auto_approve_cutoff: legacyEnabled ? legacyCutoff : null, updated_at: new Date().toISOString(), updated_by: currentUser.id }).eq('singleton', true),
        ]);
        if (workflow.error || policy.error) setError(workflow.error?.message || policy.error?.message || 'Unable to save workflow governance.');
        else setMessage('Workflow governance saved.');
        setSaving(false);
    };

    const exportMigrationReport = () => {
        const header = ['User', 'Email', 'Operating Unit', 'Assigned Approver', 'Outstanding Pending Workflows', 'Recommended Target Role', 'Migration Status'];
        const rows = migrationRows.map(row => [row.user.fullName || row.user.username, row.user.email, row.user.operatingUnit, row.assignedApprover, String(row.pending), row.recommendedRole, row.status]);
        const csv = [header, ...rows].map(values => values.map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'legacy-user-workflow-migration-report.csv';
        anchor.click();
        URL.revokeObjectURL(url);
    };

    if (!canManage) return null;
    return <section className="settings-accordion"><header className="settings-accordion__header settings-accordion__header--warning"><div className="settings-accordion__toggle"><AlertTriangle className="btn-symbol" /><span><strong>Workflow and Approver Governance</strong><small>Configure the fallback approver and the explicitly temporary legacy User exception.</small></span></div><div className="settings-accordion__actions"><button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save Workflow Settings'}</button></div></header><div className="settings-accordion__content form-stack">
        {message && <div className="notice notice--success">{message}</div>}{error && <div className="notice notice--danger">{error}</div>}
        <div className="form-grid"><label className="form-field"><span className="form-label">Default Administrator</span><select className="form-control" value={defaultAdministratorId || ''} onChange={event => setDefaultAdministratorId(event.target.value ? Number(event.target.value) : null)}><option value="">No fallback</option>{approvers.map(user => <option key={user.id} value={user.id}>{user.fullName} · {user.role}</option>)}</select></label><label className="setting-choice"><span><strong>Temporary User auto-approval</strong><small>Applicable role: User. Super Admin follows its protected invariant. Provide owner and cutoff before enabling.</small></span><input type="checkbox" checked={legacyEnabled} disabled={!actorIsSuper || !legacyOwner.trim() || !legacyCutoff} onChange={event => setLegacyEnabled(event.target.checked)} /></label><label className="form-field"><span className="form-label">Accountable Owner</span><input className="form-control" value={legacyOwner} disabled={!actorIsSuper} onChange={event => setLegacyOwner(event.target.value)} /></label><label className="form-field"><span className="form-label">Cutoff Date</span><input type="date" className="form-control" value={legacyCutoff} disabled={!actorIsSuper} onChange={event => setLegacyCutoff(event.target.value)} /></label><fieldset className="form-field form-field--full"><legend className="form-label">Applicable Modules</legend><div className="checkbox-grid">{workflowPermissionModules.map(module => <label className="form-check" key={module}><input type="checkbox" checked={legacyModules.includes(module)} disabled={!actorIsSuper} onChange={event => setLegacyModules(previous => event.target.checked ? [...new Set([...previous, module])] : previous.filter(item => item !== module))} /><span>{module}</span></label>)}</div></fieldset></div>
        <div className="notice notice--info"><strong>Migration progress</strong><span>{migrationUsers.length} active User account{migrationUsers.length === 1 ? '' : 's'} remain to be migrated. The report below identifies their OU, assignment, pending workflows, and recommended target role.</span><button type="button" className="btn-secondary" onClick={exportMigrationReport} disabled={!migrationRows.length}><Download className="btn-symbol" /> Export report</button></div>
        <div className="data-table-card"><div className="data-table-scroll"><table className="data-table"><thead><tr><th>Legacy User</th><th>Operating Unit</th><th>Assigned Approver</th><th>Pending Workflows</th><th>Recommended Role</th><th>Migration Status</th></tr></thead><tbody>{migrationRows.length ? migrationRows.map(row => <tr key={row.user.id}><td className="data-table__cell--primary"><strong>{row.user.fullName || row.user.username}</strong><span className="data-table__subline">{row.user.email}</span></td><td>{row.user.operatingUnit}</td><td>{row.assignedApprover}</td><td>{row.pending}</td><td>{row.recommendedRole}</td><td><span className={`status-badge ${row.pending || row.assignedApprover === 'None' ? 'status-badge--warning' : 'status-badge--completed'}`}>{row.status}</span></td></tr>) : <tr><td colSpan={6}>No active legacy User accounts remain.</td></tr>}</tbody></table></div></div>
        {legacyEnabled && (!legacyOwner.trim() || !legacyCutoff) && <div className="notice notice--warning">Temporary User auto-approval is not active until a Super Admin supplies both an accountable owner and a cutoff date. No date is inferred.</div>}
        <div className="notice notice--warning">Users without a valid active assignment route to the configured default administrator. Self-approval remains prohibited except the protected Super Admin automatic path.</div>
    </div></section>;
};

export default WorkflowGovernanceEditor;
