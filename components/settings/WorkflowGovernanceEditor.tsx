import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { workflowPermissionModules } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

const WorkflowGovernanceEditor: React.FC = () => {
    const { currentUser, usersList, roleRules, hasAccess } = useAuth();
    const [defaultAdministratorId, setDefaultAdministratorId] = useState<number | null>(null);
    const [legacyEnabled, setLegacyEnabled] = useState(true);
    const [legacyModules, setLegacyModules] = useState<string[]>([...workflowPermissionModules]);
    const [legacyOwner, setLegacyOwner] = useState('');
    const [legacyCutoff, setLegacyCutoff] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canManage = hasAccess('Settings - Workflow', 'manage_approver_assignments');
    const approvers = useMemo(() => usersList.filter(user => user.is_active !== false
        && user.role === 'Administrator'
        && workflowPermissionModules.every(module => roleRules.some(rule =>
            rule.role === user.role && rule.module === module && rule.action === 'approve' && rule.allowed
        ))), [roleRules, usersList]);
    const migrationUsers = useMemo(() => usersList.filter(user => user.is_active !== false && user.role === 'User'), [usersList]);

    useEffect(() => {
        if (!supabase || !canManage) return;
        void Promise.all([
            supabase.from('workflow_settings').select('default_administrator_id').eq('singleton', true).single(),
            supabase.from('authorization_policy').select('legacy_user_auto_approve_enabled,legacy_user_auto_approve_modules,legacy_user_auto_approve_owner,legacy_user_auto_approve_cutoff').eq('singleton', true).single(),
        ]).then(([workflow, policy]) => {
            if (workflow.error || policy.error) {
                setError(workflow.error?.message || policy.error?.message || 'Unable to load workflow governance.');
                return;
            }
            setDefaultAdministratorId(workflow.data?.default_administrator_id || null);
            setLegacyEnabled(Boolean(policy.data?.legacy_user_auto_approve_enabled));
            setLegacyModules(Array.isArray(policy.data?.legacy_user_auto_approve_modules) ? policy.data.legacy_user_auto_approve_modules : [...workflowPermissionModules]);
            setLegacyOwner(policy.data?.legacy_user_auto_approve_owner || '');
            setLegacyCutoff(policy.data?.legacy_user_auto_approve_cutoff || '');
        });
    }, [canManage]);

    const save = async () => {
        if (!supabase || !currentUser || !canManage) return;
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

    if (!canManage) return null;
    return <section className="settings-accordion"><header className="settings-accordion__header settings-accordion__header--warning"><div className="settings-accordion__toggle"><AlertTriangle className="btn-symbol" /><span><strong>Workflow and Approver Governance</strong><small>Configure the fallback approver and the explicitly temporary legacy User exception.</small></span></div><div className="settings-accordion__actions"><button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save Workflow Settings'}</button></div></header><div className="settings-accordion__content form-stack">
        {message && <div className="notice notice--success">{message}</div>}{error && <div className="notice notice--danger">{error}</div>}
        <div className="form-grid"><label className="form-field"><span className="form-label">Default Administrator</span><select className="form-control" value={defaultAdministratorId || ''} onChange={event => setDefaultAdministratorId(event.target.value ? Number(event.target.value) : null)}><option value="">No fallback</option>{approvers.map(user => <option key={user.id} value={user.id}>{user.fullName} · {user.role}</option>)}</select></label><label className="setting-choice"><span><strong>Temporary User auto-approval</strong><small>Applicable role: User. Super Admin follows its protected invariant.</small></span><input type="checkbox" checked={legacyEnabled} onChange={event => setLegacyEnabled(event.target.checked)} /></label>{legacyEnabled && <><label className="form-field"><span className="form-label">Accountable Owner</span><input className="form-control" value={legacyOwner} onChange={event => setLegacyOwner(event.target.value)} /></label><label className="form-field"><span className="form-label">Cutoff Date</span><input type="date" className="form-control" value={legacyCutoff} onChange={event => setLegacyCutoff(event.target.value)} /></label><fieldset className="form-field form-field--full"><legend className="form-label">Applicable Modules</legend><div className="checkbox-grid">{workflowPermissionModules.map(module => <label className="form-check" key={module}><input type="checkbox" checked={legacyModules.includes(module)} onChange={event => setLegacyModules(previous => event.target.checked ? [...new Set([...previous, module])] : previous.filter(item => item !== module))} /><span>{module}</span></label>)}</div></fieldset></>}</div>
        <div className="notice notice--info"><strong>Migration progress</strong><span>{migrationUsers.length} active User account{migrationUsers.length === 1 ? '' : 's'} remain to be migrated to RFO - User.</span></div>
        {legacyEnabled && (!legacyOwner.trim() || !legacyCutoff) && <div className="notice notice--warning">Temporary User auto-approval is not active until a Super Admin supplies both an accountable owner and a cutoff date. No date is inferred.</div>}
        <div className="notice notice--warning">Users without a valid active assignment route to the configured default administrator. Self-approval remains prohibited except the protected Super Admin automatic path.</div>
    </div></section>;
};

export default WorkflowGovernanceEditor;
