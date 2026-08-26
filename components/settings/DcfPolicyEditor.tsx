import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDcfPolicy } from '../../contexts/DcfPolicyContext';
import {
    DCF_MODULES, DCF_POLICY_ACTIONS, DCF_POLICY_ROLES, DCF_POLICY_SETTINGS_KEY,
    DcfModuleKey, DcfPolicyAction, DcfPolicySettings, DcfPolicyStatus,
    getDcfRuleValue, getDcfTransitionValue, normalizeDcfPolicySettings, setDcfRuleValue, setDcfTransitionValue,
} from '../../lib/dcfPolicy';
import { UserRole } from '../../constants';
import { supabase } from '../../supabaseClient';

const DcfPolicyEditor: React.FC = () => {
    const { currentUser, hasAccess } = useAuth();
    const { policy, serverDate, error: loadError, refreshPolicy } = useDcfPolicy();
    const [pending, setPending] = useState(policy);
    const [moduleKey, setModuleKey] = useState<DcfModuleKey>('subprojects');
    const [role, setRole] = useState<UserRole>('User');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const canManage = hasAccess('Settings - DCF and Status', 'manage_settings');

    useEffect(() => setPending(policy), [policy]);
    const moduleMeta = DCF_MODULES.find(module => module.key === moduleKey) || DCF_MODULES[0];
    const protectedRole = ['Super Admin', 'Management', 'Guest'].includes(role);

    const toggle = (status: DcfPolicyStatus, action: DcfPolicyAction) => {
        if (protectedRole) return;
        setPending(previous => setDcfRuleValue(previous, role, moduleKey, status, action, !getDcfRuleValue(previous, role, moduleKey, status, action)));
    };
    const toggleTransition = (from: DcfPolicyStatus, to: DcfPolicyStatus) => {
        if (from === to) return;
        setPending(previous => setDcfTransitionValue(previous, moduleKey, from, to, !getDcfTransitionValue(previous, moduleKey, from, to)));
    };
    const updateMonthLock = <K extends keyof DcfPolicySettings['monthLock']>(key: K, value: DcfPolicySettings['monthLock'][K]) => setPending(previous => normalizeDcfPolicySettings({ ...previous, monthLock: { ...previous.monthLock, [key]: value } }));

    const save = async () => {
        if (!supabase || !currentUser || !canManage) return;
        setSaving(true); setError(null);
        const normalized = normalizeDcfPolicySettings(pending);
        const { error: saveError } = await supabase.from('dcf_policy_settings').upsert({ settings_key: DCF_POLICY_SETTINGS_KEY, settings: normalized, updated_by: currentUser.id, updated_by_name: currentUser.fullName || currentUser.username }, { onConflict: 'settings_key' });
        if (saveError) setError(saveError.message);
        else { await refreshPolicy(); setMessage('DCF and accomplishment-period policy saved.'); }
        setSaving(false);
    };

    if (!canManage) return null;
    return <section className="settings-accordion"><header className="settings-accordion__header settings-accordion__header--accent"><div className="settings-accordion__toggle"><span><strong>DCF, Status, Physical and Financial Controls</strong><small>Status rules and accomplishment periods apply after centralized page/action permission.</small></span></div><div className="settings-accordion__actions"><button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save DCF Policy'}</button></div></header><div className="settings-accordion__content form-stack">
        {(error || loadError) && <div className="notice notice--danger"><AlertTriangle className="btn-symbol" />{error || loadError}</div>}{message && <div className="notice notice--success">{message}</div>}
        <div className="form-grid"><label className="form-field"><span className="form-label">Module</span><select className="form-control" value={moduleKey} onChange={event => setModuleKey(event.target.value as DcfModuleKey)}>{DCF_MODULES.map(module => <option key={module.key} value={module.key}>{module.label}</option>)}</select></label><label className="form-field"><span className="form-label">Role</span><select className="form-control" value={role} onChange={event => setRole(event.target.value as UserRole)}>{DCF_POLICY_ROLES.map(item => <option key={item}>{item}</option>)}</select></label></div>
        <div className="data-table-scroll"><table className="data-table"><thead><tr><th>Status</th>{DCF_POLICY_ACTIONS.map(action => <th key={action.key}>{action.shortLabel}</th>)}</tr></thead><tbody>{moduleMeta.statuses.map(status => <tr key={status}><td className="data-table__cell--primary">{status}</td>{DCF_POLICY_ACTIONS.map(action => <td key={action.key}><label className={`toggle-control ${protectedRole ? 'is-disabled' : ''}`}><input type="checkbox" checked={getDcfRuleValue(pending, role, moduleKey, status, action.key)} disabled={protectedRole} onChange={() => toggle(status, action.key)} aria-label={`${role} ${moduleMeta.label} ${status} ${action.label}`} /><span className="toggle-control__track"><span /></span></label></td>)}</tr>)}</tbody></table></div>
        <div className="form-stack"><div><strong>Status transition matrix</strong><p className="form-help">Valid transitions are shared by the UI and backend. Every transition requires Manage Status; Cancelled and Unfilled require a reason for non-Super users.</p></div><div className="data-table-scroll"><table className="data-table"><thead><tr><th>From \ To</th>{moduleMeta.statuses.map(status => <th key={status}>{status}</th>)}</tr></thead><tbody>{moduleMeta.statuses.map(from => <tr key={from}><td className="data-table__cell--primary">{from}</td>{moduleMeta.statuses.map(to => <td key={to}>{from === to ? <span aria-label="Same status">—</span> : <label className="toggle-control"><input type="checkbox" checked={getDcfTransitionValue(pending, moduleKey, from, to)} onChange={() => toggleTransition(from, to)} aria-label={`${moduleMeta.label}: ${from} to ${to}`} /><span className="toggle-control__track"><span /></span></label>}</td>)}</tr>)}</tbody></table></div></div>
        <div className="notice notice--info">Completed/Filled records keep financial actual entry available while physical, target, and detail edits remain independently governed. Management and Guest remain read-only; Super Admin remains unrestricted.</div>
        <div className="form-grid"><label className="setting-choice"><span><strong>Enable accomplishment month lock</strong><small>Server date: {serverDate}</small></span><input type="checkbox" checked={pending.monthLock.enabled} onChange={event => updateMonthLock('enabled', event.target.checked)} /></label><label className="form-field"><span className="form-label">Previous-month grace days</span><input type="number" min={0} className="form-control" value={pending.monthLock.graceDays} onChange={event => updateMonthLock('graceDays', Math.max(0, Number(event.target.value) || 0))} /></label><label className="setting-choice"><span><strong>Administrator override reason required</strong><small>Super Admin is exempt; administrator overrides remain audited.</small></span><input type="checkbox" checked={pending.monthLock.requireOverrideReason} onChange={event => updateMonthLock('requireOverrideReason', event.target.checked)} /></label></div>
    </div></section>;
};

export default DcfPolicyEditor;
