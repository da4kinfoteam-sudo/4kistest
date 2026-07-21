// Author: 4K 
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User, operatingUnits, appModules, RoleConfig } from '../../constants';
import { supabase } from '../../supabaseClient';
import { Shield, Save, X as XIcon, Info, Users, UserCog } from 'lucide-react';
import { ConfirmDialog } from '../ui/enterprise';

const commonInputClasses = "form-control";
const isGuestWriteField = (role: string | undefined, field: 'can_view' | 'can_edit' | 'can_delete') => (
    role === 'Guest' && (field === 'can_edit' || field === 'can_delete')
);

const UserManagementTab: React.FC = () => {
    const { usersList, setUsersList } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [formData, setFormData] = useState<Omit<User, 'id'>>({
        username: '',
        fullName: '',
        email: '',
        role: 'User',
        operatingUnit: 'NPMO',
        password: '',
        visibility_scope: undefined,
        requires_approver: false,
        approver_id: null
    });

    const [userOverrides, setUserOverrides] = useState<any>({});
    const [roleDefaults, setRoleDefaults] = useState<RoleConfig[]>([]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    const handleAddUser = () => {
        setEditingUser(null);
        setFormError(null);
        setFormData({ 
            username: '', fullName: '', email: '', role: 'User', operatingUnit: 'NPMO', password: '', 
            visibility_scope: undefined, requires_approver: false, approver_id: null 
        });
        setIsModalOpen(true);
    };

    const handleEditUser = (user: User) => {
        setEditingUser(user);
        setFormError(null);
        setFormData({
            username: user.username || '',
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            operatingUnit: user.operatingUnit,
            password: user.password || '',
            visibility_scope: user.visibility_scope || undefined,
            requires_approver: user.requires_approver || false,
            approver_id: user.approver_id || null
        });
        setIsModalOpen(true);
    };

    const handleEditPermissions = async (user: User) => {
        setEditingUser(user);
        setUserOverrides(typeof user.permissions_override === 'object' && user.permissions_override !== null ? { ...user.permissions_override } : {});
        setIsPermissionModalOpen(true);
        
        if (supabase) {
            const { data } = await supabase.from('roles_config').select('*').eq('role', user.role);
            if (data) setRoleDefaults(data);
        }
    };

    const handleTogglePermission = (module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
        if (isGuestWriteField(editingUser?.role, field)) return;
        setUserOverrides((prev: any) => {
            const newOverrides = { ...prev };
            if (!newOverrides[module]) {
                newOverrides[module] = {};
            }
            
            const currentValue = newOverrides[module][field] !== undefined 
                ? newOverrides[module][field] 
                : (roleDefaults.find(r => r.module === module)?.[field] || false);
                
            newOverrides[module][field] = !currentValue;

            if (field === 'can_view' && !newOverrides[module].can_view) {
                newOverrides[module].can_edit = false;
                newOverrides[module].can_delete = false;
            }
            if ((field === 'can_edit' || field === 'can_delete') && newOverrides[module][field]) {
                newOverrides[module].can_view = true;
            }

            return newOverrides;
        });
    };

    const handleClearOverride = (module: string) => {
        setUserOverrides((prev: any) => {
            const newOverrides = { ...prev };
            delete newOverrides[module];
            return newOverrides;
        });
    };

    const handleSavePermissions = async () => {
        if (!editingUser || !supabase) return;
        setSaving(true);
        const sanitizedOverrides = editingUser.role === 'Guest'
            ? Object.fromEntries(Object.entries(userOverrides).map(([module, override]: [string, any]) => [
                module,
                { ...override, can_edit: false, can_delete: false }
            ]))
            : userOverrides;
        
        try {
            const { error } = await supabase
                .from('users')
                .update({ permissions_override: sanitizedOverrides })
                .eq('id', editingUser.id);

            if (error) throw error;
            
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, permissions_override: sanitizedOverrides } : u));
            setIsPermissionModalOpen(false);
            alert("User permissions successfully updated.");
        } catch (e: any) {
            console.error("Save overrides exception:", e);
            alert("Failed to save permissions: " + e.message);
        }
        setSaving(false);
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        if (supabase) {
            try {
                const { error } = await supabase.from('users').delete().eq('id', userToDelete.id);
                if (error) {
                    console.error("Error deleting user:", error);
                    alert("Failed to delete user from database.");
                    return;
                }
            } catch (e) {
                console.error("Delete exception:", e);
            }
        }
        setUsersList(prev => prev.filter(u => u.id !== userToDelete.id));
        setUserToDelete(null);
    };

    const handleSubmitUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        setSaving(true);
        
        const payloadToSave = { ...formData };
        if (!payloadToSave.password || payloadToSave.password.trim() === '') {
            delete payloadToSave.password;
        }
        
        if (editingUser) {
            if (supabase) {
                try {
                    const { error } = await supabase
                        .from('users')
                        .update(payloadToSave)
                        .eq('id', editingUser.id);

                    if (error) {
                        console.error("Error updating user:", error);
                        setFormError("Failed to update user in database. Check RLS policies.");
                        setSaving(false);
                        return;
                    }
                } catch (e: any) {
                    console.error("Update exception:", e);
                    setFormError("An error occurred: " + e.message);
                    setSaving(false);
                    return;
                }
            }
            setUsersList(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...formData } : u));
            setSaving(false);
            setIsModalOpen(false);
        } else {
            if (supabase) {
                try {
                    const { id, ...insertPayload } = payloadToSave as any;
                    const { error } = await supabase.from('users').insert([insertPayload]);
                    
                    if (error) {
                        if (error.message.includes('row-level security policy')) {
                            setFormError("RLS Permission Error: Add policy to allow INSERT on 'users' table.");
                            setSaving(false);
                            return;
                        }
                        setFormError("Failed to add user: " + error.message);
                        setSaving(false);
                        return;
                    }

                    const { data: refreshedList, error: fetchError } = await supabase
                        .from('users')
                        .select('*')
                        .order('id', { ascending: true });
                    
                    if (fetchError) console.error(fetchError);

                    if (refreshedList) {
                        setUsersList(refreshedList as User[]); 
                    } else {
                        setUsersList(prev => [...prev, { id: Date.now(), ...formData } as User]);
                    }
                    
                    setSaving(false);
                    setIsModalOpen(false);
                } catch (err: any) {
                    console.error("Error adding user:", err);
                    setFormError("Exception: " + err.message);
                    setSaving(false);
                    return;
                }
            } else {
                const newUser = { id: Date.now(), ...formData } as User;
                setUsersList(prev => [...prev, newUser]);
                setSaving(false);
                setIsModalOpen(false);
            }
        }
    };

    return (
        <div className="user-directory form-stack">
            <section className="section-heading user-directory__header">
                <div>
                    <h3 className="section-heading__title"><Users className="btn-symbol" /> System User Directory</h3>
                    <p className="section-heading__helper">Manage system identities, permissions, and security overrides.</p>
                </div>
                <button onClick={handleAddUser} className="btn-primary">+ Add New User</button>
            </section>

            <div className="data-table-card">
                <div className="data-table-scroll user-directory__table-scroll">
                    <table className="data-table user-directory__table">
                        <thead>
                            <tr>
                                <th>User Identity</th><th>Access &amp; Org</th><th>Visibility Control</th><th className="data-table__head--actions">Operations</th>
                            </tr>
                        </thead>
                        <tbody>
                            {usersList.map(user => {
                                const hasOverrides = user.permissions_override && Object.keys(user.permissions_override).length > 0;
                                return (
                                    <tr key={user.id}>
                                        <td className="data-table__cell--primary data-table__cell--nowrap">
                                            <div className="user-identity"><span className="user-identity__avatar">{user.fullName.substring(0, 1).toUpperCase()}</span><span><strong>{user.fullName}</strong><small>@{user.username}</small></span></div>
                                        </td>
                                        <td className="data-table__cell--nowrap"><strong>{user.role}</strong><span className="data-table__subline">{user.operatingUnit}</span></td>
                                        <td className="data-table__cell--nowrap"><span className={`status-badge status-badge--compact ${user.visibility_scope === 'Own OU' ? 'status-badge--pending' : 'status-badge--completed'}`}>{user.visibility_scope === 'Own OU' ? 'Restricted' : 'Universal'}</span>{hasOverrides && <span className="data-table__subline">Custom rules</span>}</td>
                                        <td className="data-table__cell--actions data-table__cell--nowrap"><div className="data-table__actions">
                                            <button onClick={() => handleEditPermissions(user)} className="table-action table-action--edit" title="Edit access overrides"><Shield className="btn-symbol" /> Access</button>
                                            <button onClick={() => handleEditUser(user)} className="table-action table-action--edit">Edit</button>
                                            <button onClick={() => setUserToDelete(user)} className="table-action table-action--delete" aria-label={`Delete ${user.fullName}`}><XIcon className="btn-symbol" /></button>
                                        </div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isPermissionModalOpen && editingUser && (
                <div className="modal-backdrop" role="presentation">
                    <section className="modal-card user-permissions-modal" role="dialog" aria-modal="true" aria-labelledby="access-overrides-title">
                        <header className="modal-card__header"><div><h3 id="access-overrides-title"><UserCog className="btn-symbol" /> Access Overrides</h3><p>{editingUser.fullName} · {editingUser.role}</p></div><button onClick={() => setIsPermissionModalOpen(false)} className="modal-card__close" aria-label="Close access overrides"><XIcon /></button></header>
                        <div className="modal-card__body">
                            <div className="notice notice--info"><Info className="btn-symbol" /><div><strong>Hierarchy logic</strong><p>Overrides defined here supersede role-level permissions for this account only.</p></div></div>
                            <div className="data-table-scroll"><table className="data-table user-permissions-table"><thead><tr><th>Target Module</th><th>Status</th><th>View</th><th>Edit</th><th>Delete</th></tr></thead><tbody>
                                {appModules.map(module => {
                                    const roleDefault = roleDefaults.find(r => r.module === module) || { can_view: false, can_edit: false, can_delete: false };
                                    const hasOverride = userOverrides[module] !== undefined;
                                    const rawEffectiveConfig = hasOverride ? userOverrides[module] : roleDefault;
                                    const effectiveConfig = editingUser.role === 'Guest' ? { ...rawEffectiveConfig, can_edit: false, can_delete: false } : rawEffectiveConfig;
                                    const Toggle = ({ field }: { field: 'can_view'|'can_edit'|'can_delete' }) => {
                                        const val = effectiveConfig[field];
                                        const isLocked = isGuestWriteField(editingUser.role, field);
                                        return <label className={`toggle-control ${isLocked ? 'is-disabled' : ''}`}><input type="checkbox" checked={val} onChange={() => !isLocked && handleTogglePermission(module, field)} disabled={isLocked} aria-label={`${field.replace('can_', '')} ${module}`} /><span className={`toggle-control__track toggle-control__track--${field.replace('can_', '')}`}><span /></span></label>;
                                    };
                                    return <tr key={module} className={hasOverride ? 'data-table__row--selected' : undefined}><td className="data-table__cell--primary data-table__cell--nowrap">{module}</td><td>{hasOverride ? <><span className="status-badge status-badge--compact status-badge--completed">Overridden</span><button onClick={() => handleClearOverride(module)} className="data-table-reset">Reset</button></> : <span className="data-table__cell--muted">Auto (Default)</span>}</td><td><Toggle field="can_view" /></td><td><Toggle field="can_edit" /></td><td><Toggle field="can_delete" /></td></tr>;
                                })}
                            </tbody></table></div>
                        </div>
                        <footer className="modal-card__footer"><button onClick={() => setIsPermissionModalOpen(false)} className="btn-secondary">Cancel</button><button onClick={handleSavePermissions} disabled={saving} className="btn-primary"><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save Configuration'}</button></footer>
                    </section>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-backdrop" role="presentation">
                    <section className="modal-card user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
                        <header className="modal-card__header"><div><h3 id="user-editor-title">{editingUser ? 'Edit User' : 'New User'}</h3><p>Configure account properties and credentials.</p></div><button type="button" onClick={() => setIsModalOpen(false)} className="modal-card__close" aria-label="Close user editor"><XIcon /></button></header>
                        <form onSubmit={handleSubmitUser} className="form-stack">
                            <div className="modal-card__body form-stack">
                                {formError && <div className="form-error">{formError}</div>}
                                <div className="form-grid">
                                    <label className="form-field form-field--full"><span className="form-label">Account Display Name</span><input type="text" required value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} className={commonInputClasses} placeholder="e.g. John Doe" /></label>
                                    <label className="form-field"><span className="form-label">Username</span><input type="text" required value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className={commonInputClasses} placeholder="jdoe" /></label>
                                    <label className="form-field"><span className="form-label">System Password</span><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className={commonInputClasses} placeholder="••••••••" /></label>
                                    <label className="form-field form-field--full"><span className="form-label">Network Email</span><input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className={commonInputClasses} placeholder="user@npmoms.com" /></label>
                                    <label className="form-field"><span className="form-label">Authorization Role</span><select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})} className={commonInputClasses}>{['Super Admin','Administrator','Management','Focal - User','RFO - User','User','Guest'].map(role => <option key={role} value={role}>{role}</option>)}</select></label>
                                    <label className="form-field"><span className="form-label">Operating Unit</span><select value={formData.operatingUnit} onChange={e => setFormData({...formData, operatingUnit: e.target.value})} className={commonInputClasses}>{operatingUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
                                    <label className="form-field form-field--full"><span className="form-label">Data Visibility Scope</span><select value={formData.visibility_scope || ''} onChange={e => setFormData({...formData, visibility_scope: (e.target.value || undefined) as any})} className={commonInputClasses}><option value="">System Default (Based on Role)</option><option value="All OUs">All OUs (Universal Access)</option><option value="Own OU">Own OU (Restricted to Selected OU)</option></select><span className="form-help">Override the role-level visibility setting for this user when necessary.</span></label>
                                </div>
                                <label className="form-check user-editor__workflow"><span><strong>Workflow Bridge</strong><small>Require approvals for high-level events</small></span><input type="checkbox" checked={formData.requires_approver || false} onChange={e => setFormData({ ...formData, requires_approver: e.target.checked, approver_id: e.target.checked ? formData.approver_id : null })} /></label>
                                {formData.requires_approver && <label className="form-field"><span className="form-label">Assigned Approver</span><select value={formData.approver_id || ''} onChange={e => setFormData({...formData, approver_id: e.target.value ? parseInt(e.target.value) : null})} className={commonInputClasses}><option value="">No specific parent</option>{usersList.filter(u => u.id !== editingUser?.id).map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>}
                            </div>
                            <footer className="modal-card__footer"><button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Discard</button><button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save User'}</button></footer>
                        </form>
                    </section>
                </div>
            )}

            {userToDelete && <ConfirmDialog title="Delete user?" description={`Delete ${userToDelete.fullName}? This cannot be undone.`} confirmLabel="Delete User" tone="danger" onConfirm={handleDeleteUser} onCancel={() => setUserToDelete(null)} />}
        </div>
    );
};

export default UserManagementTab;
// --- End of UserManagementTab.tsx ---
