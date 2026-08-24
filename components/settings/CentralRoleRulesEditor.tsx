import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Save, ShieldCheck } from 'lucide-react';
import { appModules, UserRole } from '../../constants';
import { ACCESS_ACTIONS, AccessAction, getProtectedRoleCeiling } from '../../lib/accessControl';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

type Rule = {
    role: UserRole;
    module: string;
    action: AccessAction;
    allowed: boolean;
    visibility_scope: 'All OUs' | 'Own OU';
};

const ROLES: UserRole[] = ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest'];

const actionLabel = (action: string) => action.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const CentralRoleRulesEditor: React.FC = () => {
    const { currentUser, refreshPermissions } = useAuth();
    const [rules, setRules] = useState<Rule[]>([]);
    const [pending, setPending] = useState<Rule[]>([]);
    const [selectedModule, setSelectedModule] = useState(appModules[0] || 'Home');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const loadRules = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        const { data, error: loadError } = await supabase
            .from('authorization_role_rules')
            .select('role,module,action,allowed,visibility_scope')
            .order('role')
            .order('module')
            .order('action');
        if (loadError) setError(loadError.message);
        const loaded = (data || []) as Rule[];
        setRules(loaded);
        setPending(loaded);
        setLoading(false);
    };

    useEffect(() => { void loadRules(); }, []);

    const currentRules = useMemo(() => pending.filter(rule => rule.module === selectedModule), [pending, selectedModule]);
    const hasChanges = JSON.stringify(rules) !== JSON.stringify(pending);

    const findRule = (role: UserRole, action: AccessAction) => currentRules.find(rule => rule.role === role && rule.action === action);

    const updateRule = (role: UserRole, action: AccessAction, allowed: boolean) => {
        const ceiling = getProtectedRoleCeiling(role, action);
        if (role === 'Super Admin' || ceiling === false) return;
        setSaved(false);
        setPending(previous => previous.map(rule => {
            if (rule.role !== role || rule.module !== selectedModule) return rule;
            if (rule.action === action) return { ...rule, allowed };
            if (allowed && action !== 'view' && rule.action === 'view') return { ...rule, allowed: true };
            if (!allowed && action === 'view') return { ...rule, allowed: false };
            return rule;
        }));
    };

    const updateScope = (role: UserRole, scope: Rule['visibility_scope']) => {
        if (role === 'Super Admin') return;
        setPending(previous => previous.map(rule => rule.role === role && rule.module === selectedModule
            ? { ...rule, visibility_scope: scope }
            : rule));
    };

    const save = async () => {
        if (!supabase || !currentUser) return;
        setSaving(true);
        setError(null);
        const normalized = pending.map(rule => ({
            ...rule,
            allowed: rule.role === 'Super Admin'
                ? true
                : (getProtectedRoleCeiling(rule.role, rule.action) === false ? false : rule.allowed),
            visibility_scope: rule.role === 'Super Admin' ? 'All OUs' : rule.visibility_scope,
            updated_by: currentUser.id,
            updated_at: new Date().toISOString(),
        }));
        const { error: saveError } = await supabase
            .from('authorization_role_rules')
            .upsert(normalized, { onConflict: 'role,module,action' });
        if (saveError) {
            setError(saveError.message);
        } else {
            setRules(normalized);
            setPending(normalized);
            setSaved(true);
            await refreshPermissions();
        }
        setSaving(false);
    };

    if (loading) return <div className="ui-state">Loading centralized role policy...</div>;

    return (
        <section className="settings-accordion">
            <header className="settings-accordion__header settings-accordion__header--accent">
                <div className="settings-accordion__toggle"><ShieldCheck className="btn-symbol" /><span><strong>Centralized Role Capabilities</strong><small>Every page action inherits from this matrix unless a user-specific override applies.</small></span></div>
                <div className="settings-accordion__actions">
                    {saved && <span className="status-indicator status-indicator--success"><Check className="btn-symbol" /> Policy saved</span>}
                    <button type="button" className="btn-secondary" disabled={!hasChanges || saving} onClick={() => setPending(rules)}>Cancel Changes</button>
                    <button type="button" className="btn-primary" disabled={!hasChanges || saving} onClick={save}><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save Policy'}</button>
                </div>
            </header>
            <div className="settings-accordion__content form-stack">
                {error && <div className="notice notice--danger"><AlertTriangle className="btn-symbol" /><div><strong>Authorization policy error</strong><p>{error}</p></div></div>}
                <label className="form-field"><span className="form-label">Page or module</span><select className="form-control" value={selectedModule} onChange={event => setSelectedModule(event.target.value)}>{appModules.map(module => <option key={module} value={module}>{module}</option>)}</select></label>
                <div className="data-table-scroll role-permissions-scroll"><table className="data-table role-permissions-table"><thead><tr><th className="data-table__sticky-left">Role</th><th>Data Scope</th>{ACCESS_ACTIONS.map(action => <th key={action}>{actionLabel(action)}</th>)}</tr></thead><tbody>
                    {ROLES.map(role => <tr key={role}><td className="data-table__sticky-left data-table__cell--primary">{role}</td><td><select className="form-control form-control--compact" value={findRule(role, 'view')?.visibility_scope || (role === 'Super Admin' ? 'All OUs' : 'Own OU')} disabled={role === 'Super Admin'} onChange={event => updateScope(role, event.target.value as Rule['visibility_scope'])}><option>Own OU</option><option>All OUs</option></select></td>
                        {ACCESS_ACTIONS.map(action => { const rule = findRule(role, action); const ceiling = getProtectedRoleCeiling(role, action); const disabled = role === 'Super Admin' || ceiling === false; const checked = role === 'Super Admin' ? true : ceiling === false ? false : !!rule?.allowed; return <td key={action}><label className={`toggle-control ${disabled ? 'is-disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => updateRule(role, action, event.target.checked)} aria-label={`${role} ${selectedModule} ${action}`} /><span className="toggle-control__track"><span /></span></label></td>; })}
                    </tr>)}
                </tbody></table></div>
                <div className="notice notice--info"><div><strong>Effective hierarchy</strong><p>Super Admin is immutable allow-all. Management and Guest are immutable read-only. A specific user deny wins; all other user overrides supersede ordinary role defaults. Page view, record scope, and the requested action must all allow access.</p></div></div>
            </div>
        </section>
    );
};

export default CentralRoleRulesEditor;
