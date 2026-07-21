import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useDcfPolicy } from '../../contexts/DcfPolicyContext';
import { RoleConfig, appModules, UserRole } from '../../constants';
import { Save, AlertTriangle, Info, Check, ChevronDown, RotateCcw, ShieldCheck } from 'lucide-react';
import {
    canEditDcfSection,
    canUseAccomplishmentMonth,
    DCF_MODULES,
    DCF_POLICY_ACTIONS,
    DCF_POLICY_ROLES,
    DCF_POLICY_SETTINGS_KEY,
    DEFAULT_DCF_POLICY_SETTINGS,
    DcfModuleKey,
    DcfPolicyAction,
    DcfPolicySettings,
    DcfPolicyStatus,
    getDcfRuleValue,
    normalizeDcfPolicySettings,
    setDcfRuleValue,
} from '../../lib/dcfPolicy';

const allRoles: UserRole[] = ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest'];
const isGuestWriteField = (role: string, field: 'can_view' | 'can_edit' | 'can_delete') => (
    role === 'Guest' && (field === 'can_edit' || field === 'can_delete')
);

const policyEqual = (a: DcfPolicySettings, b: DcfPolicySettings) => JSON.stringify(a) === JSON.stringify(b);

const UserControlCenterTab: React.FC = () => {
    const [configs, setConfigs] = useState<RoleConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);

    // Initial state matching
    const [pendingConfigs, setPendingConfigs] = useState<RoleConfig[]>([]);

    const [success, setSuccess] = useState<boolean>(false);

    const { currentUser, refreshPermissions } = useAuth();
    const { policy: activeDcfPolicy, serverDate, loading: dcfPolicyLoading, error: dcfPolicyLoadError, refreshPolicy } = useDcfPolicy();
    const [roleControlOpen, setRoleControlOpen] = useState(true);
    const [dcfRulesOpen, setDcfRulesOpen] = useState(false);
    const [monthLockOpen, setMonthLockOpen] = useState(false);
    const [pendingDcfPolicy, setPendingDcfPolicy] = useState<DcfPolicySettings>(DEFAULT_DCF_POLICY_SETTINGS);
    const [savingDcfPolicy, setSavingDcfPolicy] = useState(false);
    const [dcfPolicyMessage, setDcfPolicyMessage] = useState<string | null>(null);
    const [dcfPolicyError, setDcfPolicyError] = useState<string | null>(null);
    const [selectedDcfRole, setSelectedDcfRole] = useState<UserRole>('User');
    const [selectedDcfModule, setSelectedDcfModule] = useState<DcfModuleKey>('subprojects');
    const [previewStatus, setPreviewStatus] = useState<DcfPolicyStatus>('Proposed');
    const [previewAction, setPreviewAction] = useState<DcfPolicyAction>('editDetails');
    const [previewMonth, setPreviewMonth] = useState(() => new Date().toISOString().slice(0, 7));

    useEffect(() => {
        fetchConfigs();
    }, []);

    useEffect(() => {
        setPendingDcfPolicy(activeDcfPolicy);
    }, [activeDcfPolicy]);

    useEffect(() => {
        if (serverDate) {
            setPreviewMonth(serverDate.slice(0, 7));
        }
    }, [serverDate]);

    useEffect(() => {
        const moduleMeta = DCF_MODULES.find(module => module.key === selectedDcfModule);
        if (moduleMeta && !moduleMeta.statuses.includes(previewStatus)) {
            setPreviewStatus(moduleMeta.statuses[0]);
        }
    }, [selectedDcfModule, previewStatus]);

    const fetchConfigs = async () => {
        if (!supabase) {
            setError("Supabase connection is not established. Please check your configuration.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.from('roles_config').select('*');
            if (error) {
                setError(error.message);
            } else if (data) {
                // Seed any missing configurations
                const fullSet: RoleConfig[] = [];
                allRoles.forEach(role => {
                    appModules.forEach(module => {
                        const existing = data.find(c => c.role === role && c.module === module);
                        if (existing) {
                            fullSet.push({
                                ...existing,
                                can_edit: role === 'Guest' ? false : existing.can_edit,
                                can_delete: role === 'Guest' ? false : existing.can_delete,
                                visibility_scope: existing.visibility_scope || (['Super Admin', 'Administrator', 'Management'].includes(role) ? 'All OUs' : 'Own OU')
                            });
                        } else {
                            // Defaults based on role
                            fullSet.push({
                                role: role as string,
                                module,
                                can_view: true,
                                can_edit: ['Super Admin', 'Administrator'].includes(role),
                                can_delete: ['Super Admin', 'Administrator'].includes(role),
                                visibility_scope: ['Super Admin', 'Administrator', 'Management'].includes(role) ? 'All OUs' : 'Own OU'
                            });
                        }
                    });
                });
                setConfigs(fullSet);
                setPendingConfigs(fullSet);
            }
        } catch (err: any) {
            setError(err.message || "An unknown error occurred while fetching role configurations.");
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = (role: string, module: string, field: 'can_view' | 'can_edit' | 'can_delete') => {
        if (isGuestWriteField(role, field)) return;
        setSuccess(false);
        setPendingConfigs(prev => prev.map(c => {
            if (c.role === role && c.module === module) {
                const newConfig = { ...c, [field]: !c[field] };
                // Logic: cannot edit or delete if cannot view
                if (field === 'can_view' && !newConfig.can_view) {
                    newConfig.can_edit = false;
                    newConfig.can_delete = false;
                }
                // Logic: Cannot view = false if trying to edit/delete
                if ((field === 'can_edit' || field === 'can_delete') && newConfig[field]) {
                    newConfig.can_view = true;
                }
                return newConfig;
            }
            return c;
        }));
    };

    const handleVisibilityToggle = (role: string) => {
        setSuccess(false);
        setPendingConfigs(prev => {
            // Find current scope for the role (should be same for all modules of this role)
            const currentConfig = prev.find(c => c.role === role);
            if (!currentConfig) return prev;
            
            const newScope = currentConfig.visibility_scope === 'All OUs' ? 'Own OU' : 'All OUs';
            
            return prev.map(c => {
                if (c.role === role) {
                    return { ...c, visibility_scope: newScope };
                }
                return c;
            });
        });
    };

    const runWhiteScreenCheck = (): string | null => {
        // Mock-Mode Validation block
        for (const role of allRoles) {
            const roleConfigs = pendingConfigs.filter(c => c.role === role);
            if (roleConfigs.length > 0) {
                const hasAnyView = roleConfigs.some(c => c.can_view);
                if (!hasAnyView) {
                    return `Role "${role}" has absolutely zero access to the application. This will result in a white-screen or immediate lockout upon login. Please grant at least one view permission.`;
                }
            }
        }
        
        // Safety Profile for Super Admin User Control Center Edit logic
        // We ensure Super Admins at least have full rights to everything.
        const superAdminDeficits = pendingConfigs.filter(c => c.role === 'Super Admin' && (!c.can_view || !c.can_edit || !c.can_delete));
        if (superAdminDeficits.length > 0) {
            return `Warning: You are attempting to remove permissions from the 'Super Admin' role. Super Admins must always have full access to prevent system lockout.`;
        }

        return null; // Passes all checks
    };

    const handleSave = async () => {
        if (!supabase) return;

        const validationWarning = runWhiteScreenCheck();
        if (validationWarning) {
            setWarning(validationWarning);
            return;
        }

        setWarning(null);
        setSaving(true);
        setError(null);
        setSuccess(false);

        // Filter and Clean data for upsert
        // CRITICAL: We omit 'id' entirely so that the database handles it via the 'onConflict' logic 
        // using the (role, module) unique constraint. This prevents "null value violates not-null" errors
        // during bulk upserts if IDs are mixed or missing.
        const recordsToSave = pendingConfigs.map(c => ({
            role: c.role,
            module: c.module,
            can_view: !!c.can_view,
            can_edit: c.role === 'Guest' ? false : !!c.can_edit,
            can_delete: c.role === 'Guest' ? false : !!c.can_delete,
            visibility_scope: c.visibility_scope || 'Own OU'
        }));

        const { error } = await supabase.from('roles_config').upsert(
            recordsToSave,
            { onConflict: 'role,module' }
        );

        if (error) {
            setError(error.message);
        } else {
            setConfigs(JSON.parse(JSON.stringify(pendingConfigs)));
            setSuccess(true);
            await refreshPermissions();
            setTimeout(() => setSuccess(false), 5000);
        }
        setSaving(false);
    };

    const getPendingRoleAccess = (role: UserRole, module: string, field: 'can_edit' | 'can_delete') => {
        if (['Super Admin', 'Administrator'].includes(role)) return true;
        if (role === 'Guest') return false;
        const roleConfig = pendingConfigs.find(c => c.role === role && c.module === module);
        return !!roleConfig?.[field];
    };

    const getPreviewModuleAccess = (role: UserRole, moduleKey: DcfModuleKey, action: DcfPolicyAction) => {
        const moduleMeta = DCF_MODULES.find(module => module.key === moduleKey);
        const moduleName = moduleMeta?.moduleName || 'Subprojects';
        if (action === 'delete') return getPendingRoleAccess(role, moduleName, 'can_delete');
        if (action === 'editPhysicalAccomplishment') {
            return getPendingRoleAccess(role, moduleName, 'can_edit') || getPendingRoleAccess(role, 'Accomplishment - Physical', 'can_edit');
        }
        if (action === 'editFinancialAccomplishment') {
            return getPendingRoleAccess(role, moduleName, 'can_edit') || getPendingRoleAccess(role, 'Accomplishment - Financial', 'can_edit');
        }
        return getPendingRoleAccess(role, moduleName, 'can_edit');
    };

    const handleDcfRuleToggle = (role: UserRole, moduleKey: DcfModuleKey, status: DcfPolicyStatus, action: DcfPolicyAction) => {
        if (role === 'Super Admin' || role === 'Guest') return;
        setDcfPolicyMessage(null);
        setDcfPolicyError(null);
        const currentValue = getDcfRuleValue(pendingDcfPolicy, role, moduleKey, status, action);
        setPendingDcfPolicy(prev => setDcfRuleValue(prev, role, moduleKey, status, action, !currentValue));
    };

    const updateMonthLock = <K extends keyof DcfPolicySettings['monthLock']>(field: K, value: DcfPolicySettings['monthLock'][K]) => {
        setDcfPolicyMessage(null);
        setDcfPolicyError(null);
        setPendingDcfPolicy(prev => normalizeDcfPolicySettings({
            ...prev,
            monthLock: {
                ...prev.monthLock,
                [field]: value,
            },
        }));
    };

    const handleSaveDcfPolicy = async () => {
        if (!supabase) return;
        setSavingDcfPolicy(true);
        setDcfPolicyMessage(null);
        setDcfPolicyError(null);
        const normalized = normalizeDcfPolicySettings(pendingDcfPolicy);

        try {
            const { error } = await supabase.from('dcf_policy_settings').upsert({
                settings_key: DCF_POLICY_SETTINGS_KEY,
                settings: normalized,
                updated_by: currentUser?.id || null,
                updated_by_name: currentUser?.fullName || currentUser?.username || null,
            }, { onConflict: 'settings_key' });

            if (error) throw error;
            setPendingDcfPolicy(normalized);
            await refreshPolicy();
            setDcfPolicyMessage('DCF policy saved.');
            setTimeout(() => setDcfPolicyMessage(null), 5000);
        } catch (err: any) {
            console.error('Unable to save DCF policy:', err);
            setDcfPolicyError(err.message || 'Unable to save DCF policy.');
        } finally {
            setSavingDcfPolicy(false);
        }
    };

    const selectedModuleMeta = DCF_MODULES.find(module => module.key === selectedDcfModule) || DCF_MODULES[0];
    const statusPreview = canEditDcfSection({
        user: { role: selectedDcfRole } as any,
        hasModuleAccess: getPreviewModuleAccess(selectedDcfRole, selectedDcfModule, previewAction),
        policy: pendingDcfPolicy,
        moduleKey: selectedDcfModule,
        status: previewStatus,
        action: previewAction,
    });
    const isAccomplishmentAction = previewAction === 'editPhysicalAccomplishment' || previewAction === 'editFinancialAccomplishment';
    const monthPreview = isAccomplishmentAction
        ? canUseAccomplishmentMonth({
            user: { role: selectedDcfRole } as any,
            policy: pendingDcfPolicy,
            targetMonth: previewMonth,
            serverDate,
        })
        : null;
    const effectivePreview = !statusPreview.allowed
        ? statusPreview
        : (monthPreview && !monthPreview.allowed ? monthPreview : (monthPreview?.code === 'allowed_by_override' ? monthPreview : statusPreview));

    const hasChanges = JSON.stringify(configs) !== JSON.stringify(pendingConfigs);
    const hasDcfPolicyChanges = !policyEqual(normalizeDcfPolicySettings(activeDcfPolicy), normalizeDcfPolicySettings(pendingDcfPolicy));

    if (loading) return <div className="ui-state">Loading control center...</div>;

    const renderToggle = (checked: boolean, disabled: boolean, label: string, onChange: () => void, tone = 'view') => (
        <label className={`toggle-control ${disabled ? 'is-disabled' : ''}`}>
            <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
            <span className={`toggle-control__track toggle-control__track--${tone}`}><span /></span>
        </label>
    );

    return (
        <div className="access-control form-stack form-stack--spacious">
            <section className="settings-accordion">
                <header className="settings-accordion__header">
                    <button type="button" onClick={() => setRoleControlOpen(prev => !prev)} className="settings-accordion__toggle" aria-expanded={roleControlOpen}>
                        <ChevronDown className={`settings-accordion__chevron ${roleControlOpen ? 'is-open' : ''}`} />
                        <span><strong>Role-Level UX Control</strong><small>Manage global view, edit, and delete permissions for each role.</small></span>
                    </button>
                    <div className="settings-accordion__actions">{success && <span className="status-indicator status-indicator--success"><Check className="btn-symbol" /> Changes saved</span>}<button onClick={handleSave} disabled={saving || !hasChanges} className="btn-primary"><Save className="btn-symbol" />{saving ? 'Saving...' : 'Save Configuration'}</button></div>
                </header>
                {error && <div className="notice notice--danger"><AlertTriangle className="btn-symbol" /><div><strong>Database Error</strong><p>{error}</p></div></div>}
                {warning && <div className="notice notice--warning"><AlertTriangle className="btn-symbol" /><div><strong>Virtual Check Failed</strong><p>{warning}</p></div></div>}
                {roleControlOpen && <div className="settings-accordion__content">
                    <div className="data-table-scroll role-permissions-scroll"><table className="data-table role-permissions-table"><thead><tr><th className="data-table__sticky-left">User Roles</th><th>OU Visibility</th>{appModules.map(module => <th key={module}>{module}</th>)}</tr></thead><tbody>
                        {allRoles.map(role => <tr key={role}><td className="data-table__sticky-left data-table__cell--primary">{role}</td><td>{(() => { const roleConfig = pendingConfigs.find(c => c.role === role); const isSuperAdmin = role === 'Super Admin'; const scope = roleConfig?.visibility_scope || 'Own OU'; return <div className="role-scope"><button onClick={() => !isSuperAdmin && handleVisibilityToggle(role)} disabled={isSuperAdmin} className={`status-badge ${scope === 'All OUs' ? 'status-badge--completed' : 'status-badge--neutral'}`}>{scope}</button><small>{scope === 'All OUs' ? 'Can view everything' : 'Restricted to own OU'}</small></div>; })()}</td>
                            {appModules.map(module => { const config = pendingConfigs.find(c => c.role === role && c.module === module); if (!config) return <td key={module} />; const isSuperAdmin = role === 'Super Admin'; const displayConfig = role === 'Guest' ? {...config,can_edit:false,can_delete:false}:config; return <td key={module}><div className="permission-toggle-stack"><span>View {renderToggle(displayConfig.can_view,isSuperAdmin,`${role} ${module} view`,()=>!isSuperAdmin&&handleToggle(role,module,'can_view'))}</span><span>Edit {renderToggle(displayConfig.can_edit,isSuperAdmin||isGuestWriteField(role,'can_edit'),`${role} ${module} edit`,()=>!isSuperAdmin&&!isGuestWriteField(role,'can_edit')&&handleToggle(role,module,'can_edit'),'edit')}</span><span>Delete {renderToggle(displayConfig.can_delete,isSuperAdmin||isGuestWriteField(role,'can_delete'),`${role} ${module} delete`,()=>!isSuperAdmin&&!isGuestWriteField(role,'can_delete')&&handleToggle(role,module,'can_delete'),'delete')}</span></div></td>; })}
                        </tr>)}
                    </tbody></table></div>
                    <div className="notice notice--info"><Info className="btn-symbol" /><div><strong>How role control works</strong><p>Changes affect all users with that role. Super Admin always retains full access, while user-specific overrides supersede these defaults.</p></div></div>
                </div>}
            </section>

            <section className="settings-accordion">
                <header className="settings-accordion__header settings-accordion__header--accent"><button type="button" onClick={() => setDcfRulesOpen(prev => !prev)} className="settings-accordion__toggle" aria-expanded={dcfRulesOpen}><ChevronDown className={`settings-accordion__chevron ${dcfRulesOpen ? 'is-open' : ''}`} /><span><strong>DCF Editing Rules</strong><small>Configure status-based edit, accomplishment, and delete rules.</small></span></button><div className="settings-accordion__actions">{dcfPolicyMessage && <span className="status-indicator status-indicator--success">{dcfPolicyMessage}</span>}<button type="button" className="btn-secondary" onClick={() => setPendingDcfPolicy(activeDcfPolicy)} disabled={!hasDcfPolicyChanges||savingDcfPolicy}>Cancel Changes</button><button type="button" className="btn-secondary" onClick={() => setPendingDcfPolicy(DEFAULT_DCF_POLICY_SETTINGS)} disabled={savingDcfPolicy}><RotateCcw className="btn-symbol" />Reset Defaults</button><button type="button" className="btn-primary" onClick={handleSaveDcfPolicy} disabled={!hasDcfPolicyChanges||savingDcfPolicy}><Save className="btn-symbol" />{savingDcfPolicy?'Saving...':'Save DCF Policy'}</button></div></header>
                {(dcfPolicyLoadError||dcfPolicyError)&&<div className="notice notice--danger"><AlertTriangle className="btn-symbol" /><div><strong>DCF Policy Notice</strong><p>{dcfPolicyError||dcfPolicyLoadError}</p></div></div>}
                {dcfRulesOpen&&<div className="settings-accordion__content form-stack">
                    <div className="dcf-rules-layout"><aside className="form-stack"><label className="form-field"><span className="form-label">Module</span><select value={selectedDcfModule} onChange={event=>setSelectedDcfModule(event.target.value as DcfModuleKey)} className="form-control">{DCF_MODULES.map(module=><option key={module.key} value={module.key}>{module.label}</option>)}</select></label><div className="notice notice--info"><div><strong>Two-gate policy</strong><p>Module permissions apply first. Status and period rules then determine allowed actions.</p></div></div></aside>
                        <div className="data-table-scroll"><table className="data-table dcf-rules-table"><thead><tr><th className="data-table__sticky-left">Role / Status</th>{DCF_POLICY_ACTIONS.map(action=><th key={action.key}>{action.shortLabel}</th>)}</tr></thead><tbody>{DCF_POLICY_ROLES.map(role=><React.Fragment key={role}><tr className="data-table__group-row"><td colSpan={DCF_POLICY_ACTIONS.length+1}>{role}{role==='Super Admin'&&<small> · always protected</small>}</td></tr>{selectedModuleMeta.statuses.map(status=><tr key={`${role}-${status}`}><td className="data-table__sticky-left data-table__cell--primary">{status}</td>{DCF_POLICY_ACTIONS.map(action=>{const checked=getDcfRuleValue(pendingDcfPolicy,role,selectedDcfModule,status,action.key);const disabled=role==='Super Admin'||role==='Guest';return <td key={action.key}>{renderToggle(checked,disabled,`${role} ${status} ${action.label}`,()=>handleDcfRuleToggle(role,selectedDcfModule,status,action.key))}</td>;})}</tr>)}</React.Fragment>)}</tbody></table></div>
                    </div>
                    <section className="policy-preview"><header><ShieldCheck className="btn-symbol" /><strong>Policy Preview</strong><small>Server date: {dcfPolicyLoading?'Loading...':serverDate}</small></header><div className="policy-preview__controls"><select value={selectedDcfRole} onChange={event=>setSelectedDcfRole(event.target.value as UserRole)} className="form-control">{DCF_POLICY_ROLES.map(role=><option key={role} value={role}>{role}</option>)}</select><select value={selectedDcfModule} onChange={event=>setSelectedDcfModule(event.target.value as DcfModuleKey)} className="form-control">{DCF_MODULES.map(module=><option key={module.key} value={module.key}>{module.label}</option>)}</select><select value={previewStatus} onChange={event=>setPreviewStatus(event.target.value as DcfPolicyStatus)} className="form-control">{selectedModuleMeta.statuses.map(status=><option key={status} value={status}>{status}</option>)}</select><select value={previewAction} onChange={event=>setPreviewAction(event.target.value as DcfPolicyAction)} className="form-control">{DCF_POLICY_ACTIONS.map(action=><option key={action.key} value={action.key}>{action.label}</option>)}</select><input type="month" value={previewMonth} onChange={event=>setPreviewMonth(event.target.value)} className="form-control" /></div><div className={`policy-preview__result ${effectivePreview.allowed?'is-allowed':'is-blocked'}`}><strong>{effectivePreview.allowed?'Allowed':'Blocked'}:</strong> {effectivePreview.message}{effectivePreview.requiresOverrideReason&&<span> (override reason required)</span>}</div></section>
                </div>}
            </section>

            <section className="settings-accordion"><header className="settings-accordion__header settings-accordion__header--warning"><button type="button" onClick={()=>setMonthLockOpen(prev=>!prev)} className="settings-accordion__toggle" aria-expanded={monthLockOpen}><ChevronDown className={`settings-accordion__chevron ${monthLockOpen?'is-open':''}`} /><span><strong>Accomplishment Period Locking</strong><small>Control the monthly window for physical and financial accomplishment entries.</small></span></button></header>{monthLockOpen&&<div className="settings-accordion__content month-lock-grid"><label className="setting-choice"><span><strong>Enable month lock</strong><small>Restrict ordinary users to open periods.</small></span><input type="checkbox" checked={pendingDcfPolicy.monthLock.enabled} onChange={event=>updateMonthLock('enabled',event.target.checked)} className="form-checkbox" /></label><label className="setting-choice"><span><strong>Previous-month grace days</strong></span><input type="number" min={0} value={pendingDcfPolicy.monthLock.graceDays} onChange={event=>updateMonthLock('graceDays',Number(event.target.value)||0)} className="form-control form-control--compact" /></label><label className="setting-choice"><span><strong>Require override reason</strong><small>Applies to Super Admin/Admin period overrides.</small></span><input type="checkbox" checked={pendingDcfPolicy.monthLock.requireOverrideReason} onChange={event=>updateMonthLock('requireOverrideReason',event.target.checked)} className="form-checkbox" /></label><div className="month-lock-grid__facts">{[['Date Source','Server date, Asia/Manila'],['Past Months','Blocked after grace period'],['Future Months','Blocked for ordinary users']].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><div className="notice notice--warning">Override roles are fixed to <strong>{pendingDcfPolicy.monthLock.overrideRoles.join(', ')}</strong>. Required override reasons are recorded in the user activity log.</div></div>}</section>
        </div>
    );
};

export default UserControlCenterTab;
