import React, { useMemo, useState } from 'react';
import { Info, KeyRound, Save, Shield, UserCheck, UserCog, UserMinus, Users, X } from 'lucide-react';
import { appModules, operatingUnits, type User, type UserRole, type VisibilityScope } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { ACCESS_ACTIONS, PROTECTED_READ_ONLY_ROLES, type AccessAction, type AccessEffect } from '../../lib/accessControl';
import { invokeUserAdmin } from '../../lib/userAdmin';
import { supabase } from '../../supabaseClient';
import { ConfirmDialog } from '../ui/enterprise';

type UserForm = {
    username: string;
    fullName: string;
    email: string;
    role: UserRole;
    operatingUnit: string;
    visibility_scope?: VisibilityScope;
    requires_approver: boolean;
    approver_id: number | null;
};

const blankForm = (): UserForm => ({
    username: '', fullName: '', email: '', role: 'User', operatingUnit: 'NPMO',
    visibility_scope: 'Own OU', requires_approver: false, approver_id: null,
});

const UserManagementTab: React.FC = () => {
    const {
        currentUser, usersList, roleRules, hasAccess, refreshUsersList, refreshPermissions,
    } = useAuth();
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [form, setForm] = useState<UserForm>(blankForm);
    const [showEditor, setShowEditor] = useState(false);
    const [showOverrides, setShowOverrides] = useState(false);
    const [selectedModule, setSelectedModule] = useState(appModules[0]);
    const [overrides, setOverrides] = useState<Record<string, AccessEffect | 'inherit'>>({});
    const [moduleScopes, setModuleScopes] = useState<Record<string, VisibilityScope>>({});
    const [pendingAction, setPendingAction] = useState<{ user: User; action: 'deactivate' | 'reactivate' } | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canManageUsers = hasAccess('Settings - User Management', 'manage_users');
    const canManageOverrides = hasAccess('Settings - Access Control', 'manage_user_overrides');
    const canManageScopes = hasAccess('Settings - Data Scope', 'manage_user_scopes');
    const canManageSuper = hasAccess('Settings - User Management', 'manage_super_admins');
    const actorIsSuper = currentUser?.role === 'Super Admin';

    const allowedRoles = useMemo<UserRole[]>(() => (
        actorIsSuper
            ? ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest']
            : ['Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest']
    ), [actorIsSuper]);

    const openCreate = () => {
        setEditingUser(null);
        setForm(blankForm());
        setError(null);
        setShowEditor(true);
    };

    const openEdit = (user: User) => {
        setEditingUser(user);
        setForm({
            username: user.username || '', fullName: user.fullName || '', email: user.email || '', role: user.role,
            operatingUnit: user.operatingUnit || 'NPMO', visibility_scope: user.visibility_scope || 'Own OU',
            requires_approver: Boolean(user.requires_approver), approver_id: user.approver_id || null,
        });
        setError(null);
        setShowEditor(true);
    };

    const openOverrides = async (user: User) => {
        if (!supabase) return;
        setEditingUser(user);
        setSelectedModule(appModules[0]);
        setError(null);
        const [rulesResult, scopesResult] = await Promise.all([
            supabase.from('authorization_user_rules').select('module,action,effect').eq('user_id', user.id),
            supabase.from('authorization_user_scopes').select('module,visibility_scope').eq('user_id', user.id),
        ]);
        if (rulesResult.error || scopesResult.error) {
            setError(rulesResult.error?.message || scopesResult.error?.message || 'Unable to load user policy.');
            return;
        }
        setOverrides(Object.fromEntries((rulesResult.data || []).map(rule => [`${rule.module}::${rule.action}`, rule.effect as AccessEffect])));
        setModuleScopes(Object.fromEntries((scopesResult.data || []).map(rule => [rule.module, rule.visibility_scope as VisibilityScope])));
        setShowOverrides(true);
    };

    const saveUser = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const result = editingUser
                ? await invokeUserAdmin({ action: 'update', userId: editingUser.id, profile: form })
                : await invokeUserAdmin({ action: 'invite', profile: form });
            setMessage(result.message);
            setShowEditor(false);
            await refreshUsersList();
        } catch (saveError: any) {
            setError(saveError.message || 'Unable to save user.');
        } finally {
            setSaving(false);
        }
    };

    const saveOverrides = async () => {
        if (!supabase || !editingUser) return;
        setSaving(true);
        setError(null);
        try {
            const rows = Object.entries(overrides)
                .filter(([, effect]) => effect !== 'inherit')
                .map(([key, effect]) => {
                    const [module, action] = key.split('::');
                    return { user_id: editingUser.id, module, action, effect, updated_by: currentUser?.id || null };
                });
            const scopeRows = canManageScopes ? appModules.map(module => ({
                    user_id: editingUser.id,
                    module,
                    visibility_scope: moduleScopes[module] || editingUser.visibility_scope || 'Own OU',
                    updated_by: currentUser?.id || null,
                })) : [];
            const { error: replaceError } = await supabase.rpc('replace_user_authorization', {
                p_user_id: editingUser.id,
                p_rules: rows,
                p_scopes: scopeRows,
            });
            if (replaceError) throw replaceError;
            setMessage('User overrides saved.');
            setShowOverrides(false);
            if (editingUser.id === currentUser?.id) await refreshPermissions();
        } catch (saveError: any) {
            setError(saveError.message || 'Unable to save overrides.');
        } finally {
            setSaving(false);
        }
    };

    const changeAccountState = async () => {
        if (!pendingAction) return;
        setSaving(true);
        setError(null);
        try {
            const result = await invokeUserAdmin({ action: pendingAction.action, userId: pendingAction.user.id });
            setMessage(result.message);
            setPendingAction(null);
            await refreshUsersList();
        } catch (stateError: any) {
            setError(stateError.message || 'Unable to update account state.');
        } finally {
            setSaving(false);
        }
    };

    const sendReset = async (user: User) => {
        setError(null);
        try {
            const result = await invokeUserAdmin({ action: 'send_reset', userId: user.id });
            setMessage(result.message);
        } catch (resetError: any) {
            setError(resetError.message || 'Unable to send reset.');
        }
    };

    if (!canManageUsers) return <div className="notice notice--danger">You do not have permission to manage users.</div>;

    return (
        <div className="user-directory form-stack">
            <section className="section-heading user-directory__header">
                <div><h3 className="section-heading__title"><Users className="btn-symbol" /> System User Directory</h3><p className="section-heading__helper">Provider-backed identities, account state, assignments, and centralized overrides.</p></div>
                <button type="button" onClick={openCreate} className="btn-primary">+ Invite User</button>
            </section>
            {message && <div className="notice notice--success">{message}</div>}
            {error && <div className="notice notice--danger">{error}</div>}
            <div className="notice notice--info"><Info className="btn-symbol" /><div><strong>Protected hierarchy</strong><p>Only Super Admin can manage Super Admin accounts. Administrators cannot edit themselves or grant authority they do not possess. Accounts are deactivated, not deleted.</p></div></div>
            <div className="data-table-card"><div className="data-table-scroll user-directory__table-scroll"><table className="data-table user-directory__table"><thead><tr><th>User Identity</th><th>Role &amp; OU</th><th>Account</th><th>Operations</th></tr></thead><tbody>
                {usersList.map(user => {
                    const protectedTarget = user.role === 'Super Admin' && !canManageSuper;
                    const selfTarget = user.id === currentUser?.id;
                    return <tr key={user.id}><td className="data-table__cell--primary"><div className="user-identity"><span className="user-identity__avatar">{(user.fullName || user.username).slice(0, 1).toUpperCase()}</span><span><strong>{user.fullName}</strong><small>@{user.username} · {user.email}</small></span></div></td><td><strong>{user.role}</strong><span className="data-table__subline">{user.operatingUnit} · {user.visibility_scope || 'Inherited scope'}</span></td><td><span className={`status-badge ${user.is_active === false ? 'status-badge--cancelled' : 'status-badge--completed'}`}>{user.is_active === false ? 'Inactive' : 'Active'}</span>{user.password_reset_required && <span className="data-table__subline">Password setup required</span>}</td><td><div className="data-table__actions">
                        <button type="button" className="table-action table-action--edit" disabled={protectedTarget || selfTarget} onClick={() => openEdit(user)}>Edit</button>
                        {canManageOverrides && <button type="button" className="table-action table-action--edit" disabled={protectedTarget} onClick={() => void openOverrides(user)}><Shield className="btn-symbol" /> Access</button>}
                        <button type="button" className="table-action" onClick={() => void sendReset(user)}><KeyRound className="btn-symbol" /> Reset</button>
                        <button type="button" className={user.is_active === false ? 'table-action table-action--edit' : 'table-action table-action--delete'} disabled={protectedTarget || selfTarget} onClick={() => setPendingAction({ user, action: user.is_active === false ? 'reactivate' : 'deactivate' })}>{user.is_active === false ? <UserCheck className="btn-symbol" /> : <UserMinus className="btn-symbol" />}{user.is_active === false ? 'Reactivate' : 'Deactivate'}</button>
                    </div></td></tr>;
                })}
            </tbody></table></div></div>

            {showEditor && <div className="modal-backdrop" role="presentation"><section className="modal-card user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="user-editor-title"><header className="modal-card__header"><div><h3 id="user-editor-title">{editingUser ? 'Edit User' : 'Invite User'}</h3><p>Authentication credentials are managed by Supabase Auth.</p></div><button type="button" onClick={() => setShowEditor(false)} className="modal-card__close" aria-label="Close"><X /></button></header><form onSubmit={saveUser}><div className="modal-card__body form-stack">{error && <div className="notice notice--danger">{error}</div>}<div className="form-grid">
                <label className="form-field form-field--full"><span className="form-label">Display Name</span><input className="form-control" required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} /></label>
                <label className="form-field"><span className="form-label">Username</span><input className="form-control" required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label>
                <label className="form-field"><span className="form-label">Email</span><input className="form-control" type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
                <label className="form-field"><span className="form-label">Role</span><select className="form-control" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}>{allowedRoles.map(role => <option key={role}>{role}</option>)}</select></label>
                <label className="form-field"><span className="form-label">Operating Unit</span><select className="form-control" value={form.operatingUnit} onChange={event => setForm({ ...form, operatingUnit: event.target.value })}>{operatingUnits.map(unit => <option key={unit}>{unit}</option>)}</select></label>
                <label className="form-field"><span className="form-label">Default Data Scope</span><select className="form-control" value={form.visibility_scope} onChange={event => setForm({ ...form, visibility_scope: event.target.value as VisibilityScope })}><option>Own OU</option><option>All OUs</option></select></label>
                <label className="form-check form-field--full"><span><strong>Require workflow approval</strong><small>Use the assigned approver for workflow-enabled records.</small></span><input type="checkbox" checked={form.requires_approver} onChange={event => setForm({ ...form, requires_approver: event.target.checked, approver_id: event.target.checked ? form.approver_id : null })} /></label>
                {form.requires_approver && <label className="form-field form-field--full"><span className="form-label">Assigned Approver</span><select className="form-control" value={form.approver_id || ''} onChange={event => setForm({ ...form, approver_id: event.target.value ? Number(event.target.value) : null })}><option value="">Administrator fallback</option>{usersList.filter(user => user.id !== editingUser?.id && user.is_active !== false && (user.role === 'Super Admin' || ['Subprojects', 'Activities', 'Program Management'].some(module => roleRules.some(rule => rule.role === user.role && rule.module === module && rule.action === 'approve' && rule.allowed)))).map(user => <option key={user.id} value={user.id}>{user.fullName} · {user.role}</option>)}</select></label>}
            </div></div><footer className="modal-card__footer"><button type="button" className="btn-secondary" onClick={() => setShowEditor(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}><Save className="btn-symbol" />{saving ? 'Saving…' : editingUser ? 'Save User' : 'Send Invitation'}</button></footer></form></section></div>}

            {showOverrides && editingUser && <div className="modal-backdrop" role="presentation"><section className="modal-card user-permissions-modal" role="dialog" aria-modal="true" aria-labelledby="override-title"><header className="modal-card__header"><div><h3 id="override-title"><UserCog className="btn-symbol" /> User Overrides</h3><p>{editingUser.fullName} · Inherit, Allow, or Deny</p></div><button type="button" onClick={() => setShowOverrides(false)} className="modal-card__close" aria-label="Close"><X /></button></header><div className="modal-card__body form-stack"><div className="form-grid"><label className="form-field"><span className="form-label">Module</span><select className="form-control" value={selectedModule} onChange={event => setSelectedModule(event.target.value)}>{appModules.map(module => <option key={module}>{module}</option>)}</select></label><label className="form-field"><span className="form-label">Module Data Scope</span><select className="form-control" value={editingUser.role === 'Super Admin' ? 'All OUs' : (moduleScopes[selectedModule] || editingUser.visibility_scope || 'Own OU')} disabled={!canManageScopes || editingUser.role === 'Super Admin'} onChange={event => setModuleScopes(previous => ({ ...previous, [selectedModule]: event.target.value as VisibilityScope }))}><option>Own OU</option><option>All OUs</option></select></label></div><div className="data-table-scroll"><table className="data-table"><thead><tr><th>Capability</th><th>Role Default</th><th>User Rule</th><th>Effective</th></tr></thead><tbody>
                {ACCESS_ACTIONS.map(action => {
                    const key = `${selectedModule}::${action}`;
                    const roleDefault = roleRules.find(rule => rule.role === editingUser.role && rule.module === selectedModule && rule.action === action)?.allowed || false;
                    const selected = overrides[key] || 'inherit';
                    const protectedDenied = PROTECTED_READ_ONLY_ROLES.has(editingUser.role) && !['view', 'export', 'view_files', 'view_monitoring'].includes(action);
                    const effective = protectedDenied ? false : selected === 'inherit' ? roleDefault : selected === 'allow';
                    return <tr key={action}><td className="data-table__cell--primary">{action.replaceAll('_', ' ')}</td><td>{roleDefault ? 'Allow' : 'Deny'}</td><td><select className="form-control form-control--compact" value={selected} disabled={editingUser.role === 'Super Admin' || protectedDenied} onChange={event => setOverrides(previous => ({ ...previous, [key]: event.target.value as AccessEffect | 'inherit' }))}><option value="inherit">Inherit</option><option value="allow">Allow</option><option value="deny">Deny</option></select></td><td><span className={`status-badge ${effective ? 'status-badge--completed' : 'status-badge--cancelled'}`}>{effective ? 'Allowed' : 'Denied'}</span>{protectedDenied && <span className="data-table__subline">Protected ceiling</span>}</td></tr>;
                })}
            </tbody></table></div></div><footer className="modal-card__footer"><button type="button" className="btn-secondary" onClick={() => setShowOverrides(false)}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={() => void saveOverrides()}><Save className="btn-symbol" />{saving ? 'Saving…' : 'Save Overrides'}</button></footer></section></div>}

            {pendingAction && <ConfirmDialog title={`${pendingAction.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} user?`} description={`${pendingAction.action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${pendingAction.user.fullName}? Historical ownership and audit records will be preserved.`} confirmLabel={pendingAction.action === 'deactivate' ? 'Deactivate User' : 'Reactivate User'} tone={pendingAction.action === 'deactivate' ? 'danger' : 'default'} onConfirm={() => void changeAccountState()} onCancel={() => setPendingAction(null)} />}
        </div>
    );
};

export default UserManagementTab;
