import type { User, UserRole } from '../constants';

export const DCF_POLICY_SETTINGS_KEY = 'dcf_editing_policy';

export type DcfModuleKey = 'subprojects' | 'activities' | 'office_requirements' | 'staffing_requirements' | 'other_program_expenses';
export type DcfPolicyAction = 'editDetails' | 'editBudget' | 'editPhysicalAccomplishment' | 'editFinancialAccomplishment' | 'delete';
export type StandardDcfStatus = 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
export type StaffingDcfStatus = 'Proposed' | 'Filled' | 'Unfilled';
export type DcfPolicyStatus = StandardDcfStatus | StaffingDcfStatus;
export type DcfPolicyDecisionCode = 'allowed' | 'allowed_by_override' | 'blocked_by_permission' | 'blocked_by_status' | 'blocked_by_month_lock';

export interface DcfPolicyDecision {
    allowed: boolean;
    code: DcfPolicyDecisionCode;
    message: string;
    requiresOverrideReason?: boolean;
}

export interface DcfMonthLockSettings {
    enabled: boolean;
    dateSource: 'server';
    graceDays: number;
    blockPastMonthsAfterGrace: boolean;
    blockFutureMonths: boolean;
    overrideRoles: UserRole[];
    requireOverrideReason: boolean;
}

export type DcfStatusActionRules = Partial<Record<DcfPolicyAction, boolean>>;
export type DcfModulePolicyRules = Partial<Record<DcfPolicyStatus, DcfStatusActionRules>>;
export type DcfRolePolicyRules = Partial<Record<DcfModuleKey, DcfModulePolicyRules>>;

export interface DcfPolicySettings {
    version: 1;
    roleRules: Partial<Record<UserRole, DcfRolePolicyRules>>;
    monthLock: DcfMonthLockSettings;
}

export const DCF_POLICY_ROLES: UserRole[] = ['Super Admin', 'Administrator', 'Management', 'Focal - User', 'RFO - User', 'User', 'Guest'];

export const DCF_MODULES: Array<{ key: DcfModuleKey; label: string; moduleName: string; statuses: DcfPolicyStatus[] }> = [
    { key: 'subprojects', label: 'Subprojects', moduleName: 'Subprojects', statuses: ['Proposed', 'Ongoing', 'Completed', 'Cancelled'] },
    { key: 'activities', label: 'Activities / Trainings', moduleName: 'Activities', statuses: ['Proposed', 'Ongoing', 'Completed', 'Cancelled'] },
    { key: 'office_requirements', label: 'Office Requirements', moduleName: 'Program Management - Office Requirements', statuses: ['Proposed', 'Ongoing', 'Completed', 'Cancelled'] },
    { key: 'staffing_requirements', label: 'Staffing Requirements', moduleName: 'Program Management - Staffing Requirements', statuses: ['Proposed', 'Filled', 'Unfilled'] },
    { key: 'other_program_expenses', label: 'Other Program Expenses', moduleName: 'Program Management - Other Program Expenses', statuses: ['Proposed', 'Ongoing', 'Completed', 'Cancelled'] },
];

export const DCF_POLICY_ACTIONS: Array<{ key: DcfPolicyAction; label: string; shortLabel: string }> = [
    { key: 'editDetails', label: 'Edit Details', shortLabel: 'Details' },
    { key: 'editBudget', label: 'Edit Budget / Expenses', shortLabel: 'Budget' },
    { key: 'editPhysicalAccomplishment', label: 'Edit Physical Accomplishment', shortLabel: 'Physical' },
    { key: 'editFinancialAccomplishment', label: 'Edit Financial Accomplishment', shortLabel: 'Financial' },
    { key: 'delete', label: 'Delete', shortLabel: 'Delete' },
];

const ADMIN_ACTIONS: Record<DcfPolicyAction, boolean> = {
    editDetails: true,
    editBudget: true,
    editPhysicalAccomplishment: true,
    editFinancialAccomplishment: true,
    delete: true,
};

const GUEST_ACTIONS: Record<DcfPolicyAction, boolean> = {
    editDetails: false,
    editBudget: false,
    editPhysicalAccomplishment: false,
    editFinancialAccomplishment: false,
    delete: false,
};

const PROPOSED_RULES: Record<DcfPolicyAction, boolean> = {
    editDetails: true,
    editBudget: true,
    editPhysicalAccomplishment: false,
    editFinancialAccomplishment: false,
    delete: true,
};

const ONGOING_RULES: Record<DcfPolicyAction, boolean> = {
    editDetails: false,
    editBudget: false,
    editPhysicalAccomplishment: true,
    editFinancialAccomplishment: true,
    delete: false,
};

const LOCKED_RULES: Record<DcfPolicyAction, boolean> = {
    editDetails: false,
    editBudget: false,
    editPhysicalAccomplishment: false,
    editFinancialAccomplishment: false,
    delete: false,
};

const COMPLETED_RULES: Record<DcfPolicyAction, boolean> = {
    editDetails: false,
    editBudget: false,
    editPhysicalAccomplishment: false,
    editFinancialAccomplishment: true,
    delete: false,
};

const buildRoleRules = (role: UserRole): DcfRolePolicyRules => {
    const roleRules: DcfRolePolicyRules = {};
    DCF_MODULES.forEach(module => {
        const statusRules: DcfModulePolicyRules = {};
        module.statuses.forEach(status => {
            if (role === 'Super Admin' || role === 'Administrator') {
                statusRules[status] = { ...ADMIN_ACTIONS };
            } else if (role === 'Management' || role === 'Guest') {
                statusRules[status] = { ...GUEST_ACTIONS };
            } else if (status === 'Proposed') {
                statusRules[status] = { ...PROPOSED_RULES };
            } else if (status === 'Ongoing') {
                statusRules[status] = { ...ONGOING_RULES };
            } else if (status === 'Completed' || status === 'Filled') {
                statusRules[status] = { ...COMPLETED_RULES };
            } else {
                statusRules[status] = { ...LOCKED_RULES };
            }
        });
        roleRules[module.key] = statusRules;
    });
    return roleRules;
};

const buildDefaultRoleRules = (): DcfPolicySettings['roleRules'] => {
    const rules: DcfPolicySettings['roleRules'] = {};
    DCF_POLICY_ROLES.forEach(role => {
        rules[role] = buildRoleRules(role);
    });
    return rules;
};

export const DEFAULT_DCF_POLICY_SETTINGS: DcfPolicySettings = {
    version: 1,
    roleRules: buildDefaultRoleRules(),
    monthLock: {
        enabled: true,
        dateSource: 'server',
        graceDays: 5,
        blockPastMonthsAfterGrace: true,
        blockFutureMonths: true,
        overrideRoles: ['Super Admin', 'Administrator'],
        requireOverrideReason: true,
    },
};

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export const normalizeDcfPolicySettings = (settings: unknown): DcfPolicySettings => {
    const raw = isObject(settings) ? settings as Partial<DcfPolicySettings> : {};
    const normalized: DcfPolicySettings = {
        version: 1,
        roleRules: buildDefaultRoleRules(),
        monthLock: {
            ...DEFAULT_DCF_POLICY_SETTINGS.monthLock,
            ...(isObject(raw.monthLock) ? raw.monthLock : {}),
        },
    };

    DCF_POLICY_ROLES.forEach(role => {
        const rawRoleRules = isObject(raw.roleRules?.[role]) ? raw.roleRules?.[role] : {};
        DCF_MODULES.forEach(module => {
            const rawModuleRules = isObject(rawRoleRules?.[module.key]) ? rawRoleRules?.[module.key] : {};
            module.statuses.forEach(status => {
                const defaultStatusRules = normalized.roleRules[role]?.[module.key]?.[status] || {};
                const rawStatusRules = isObject(rawModuleRules?.[status]) ? rawModuleRules?.[status] as DcfStatusActionRules : {};
                normalized.roleRules[role] = {
                    ...(normalized.roleRules[role] || {}),
                    [module.key]: {
                        ...(normalized.roleRules[role]?.[module.key] || {}),
                        [status]: {
                            ...defaultStatusRules,
                            ...rawStatusRules,
                            ...((status === 'Completed' || status === 'Filled') && !['Management', 'Guest'].includes(role)
                                ? { editFinancialAccomplishment: true }
                                : {}),
                            ...(['Management', 'Guest'].includes(role) ? GUEST_ACTIONS : {}),
                        },
                    },
                };
            });
        });
    });

    const graceDays = Number(normalized.monthLock.graceDays);
    normalized.monthLock.graceDays = Number.isFinite(graceDays) ? Math.max(0, Math.floor(graceDays)) : DEFAULT_DCF_POLICY_SETTINGS.monthLock.graceDays;
    normalized.monthLock.overrideRoles = Array.isArray(normalized.monthLock.overrideRoles)
        ? normalized.monthLock.overrideRoles.filter((role): role is UserRole => DCF_POLICY_ROLES.includes(role as UserRole))
        : DEFAULT_DCF_POLICY_SETTINGS.monthLock.overrideRoles;
    normalized.monthLock.dateSource = 'server';

    return normalized;
};

export const getDcfItemPolicyStatus = (moduleKey: DcfModuleKey, item: any): DcfPolicyStatus => {
    if (moduleKey === 'staffing_requirements') {
        return (item?.hiringStatus || 'Proposed') as StaffingDcfStatus;
    }
    return (item?.status || 'Proposed') as StandardDcfStatus;
};

export const getDcfRuleValue = (
    policy: DcfPolicySettings,
    role: UserRole,
    moduleKey: DcfModuleKey,
    status: DcfPolicyStatus,
    action: DcfPolicyAction
): boolean => {
    return !!policy.roleRules[role]?.[moduleKey]?.[status]?.[action];
};

export const setDcfRuleValue = (
    policy: DcfPolicySettings,
    role: UserRole,
    moduleKey: DcfModuleKey,
    status: DcfPolicyStatus,
    action: DcfPolicyAction,
    value: boolean
): DcfPolicySettings => normalizeDcfPolicySettings({
    ...policy,
    roleRules: {
        ...policy.roleRules,
        [role]: {
            ...(policy.roleRules[role] || {}),
            [moduleKey]: {
                ...(policy.roleRules[role]?.[moduleKey] || {}),
                [status]: {
                    ...(policy.roleRules[role]?.[moduleKey]?.[status] || {}),
                    [action]: role === 'Guest' ? false : value,
                },
            },
        },
    },
});

export const canEditDcfSection = ({
    user,
    hasModuleAccess,
    policy,
    moduleKey,
    status,
    action,
}: {
    user: Pick<User, 'role'> | null | undefined;
    hasModuleAccess: boolean;
    policy: DcfPolicySettings;
    moduleKey: DcfModuleKey;
    status: DcfPolicyStatus;
    action: DcfPolicyAction;
}): DcfPolicyDecision => {
    if (!user) {
        return { allowed: false, code: 'blocked_by_permission', message: 'No signed-in user.' };
    }

    if (user.role === 'Super Admin') {
        return {
            allowed: true,
            code: 'allowed',
            message: 'Allowed by the protected Super Admin invariant.',
        };
    }

    if (!hasModuleAccess) {
        return { allowed: false, code: 'blocked_by_permission', message: 'Blocked by module permission.' };
    }

    const allowedByStatus = getDcfRuleValue(policy, user.role, moduleKey, status, action);
    if (!allowedByStatus) {
        return { allowed: false, code: 'blocked_by_status', message: `Blocked for ${status} records by DCF editing policy.` };
    }

    return { allowed: true, code: 'allowed', message: 'Allowed by module permission and DCF editing policy.' };
};

export const canDeleteDcfItem = (args: Omit<Parameters<typeof canEditDcfSection>[0], 'action'>): DcfPolicyDecision => (
    canEditDcfSection({ ...args, action: 'delete' })
);

const parseYearMonth = (value: string): { year: number; month: number; day: number | null } | null => {
    const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || month < 1 || month > 12) return null;
    const day = match[3] ? Number(match[3]) : null;
    if (day !== null && (!Number.isFinite(day) || day < 1 || day > 31)) return null;
    return { year, month, day };
};

const monthIndex = (year: number, month: number) => year * 12 + month;

export const canUseAccomplishmentMonth = ({
    user,
    policy,
    targetMonth,
    serverDate,
    canOverride,
}: {
    user: Pick<User, 'role'> | null | undefined;
    policy: DcfPolicySettings;
    targetMonth: string;
    serverDate: string;
    canOverride?: boolean;
}): DcfPolicyDecision => {
    if (!policy.monthLock.enabled) {
        return { allowed: true, code: 'allowed', message: 'Accomplishment period locking is disabled.' };
    }

    if (!user) {
        return { allowed: false, code: 'blocked_by_permission', message: 'No signed-in user.' };
    }

    const isSuperAdmin = user.role === 'Super Admin';
    const isOverrideRole = canOverride ?? policy.monthLock.overrideRoles.includes(user.role);
    const target = parseYearMonth(targetMonth);
    const current = parseYearMonth(serverDate);
    if (!target || !current) {
        return { allowed: false, code: 'blocked_by_month_lock', message: 'Invalid accomplishment month.' };
    }

    const targetIndex = monthIndex(target.year, target.month);
    const currentIndex = monthIndex(current.year, current.month);
    if (targetIndex === currentIndex) {
        return { allowed: true, code: 'allowed', message: 'Current month is open for accomplishment entry.' };
    }

    if (isSuperAdmin) {
        return {
            allowed: true,
            code: 'allowed',
            message: 'Allowed by the protected Super Admin invariant.',
        };
    }

    if (isOverrideRole) {
        return {
            allowed: true,
            code: 'allowed_by_override',
            message: 'Allowed by administrator period-lock override.',
            requiresOverrideReason: policy.monthLock.requireOverrideReason,
        };
    }

    if (targetIndex === currentIndex - 1 && current.day !== null && current.day <= policy.monthLock.graceDays) {
        return { allowed: true, code: 'allowed', message: 'Previous month remains open during the configured grace period.' };
    }

    if (targetIndex < currentIndex && policy.monthLock.blockPastMonthsAfterGrace) {
        return { allowed: false, code: 'blocked_by_month_lock', message: 'Only the current accomplishment month is open.' };
    }

    if (targetIndex > currentIndex && policy.monthLock.blockFutureMonths) {
        return { allowed: false, code: 'blocked_by_month_lock', message: 'Only the current accomplishment month is open.' };
    }

    return { allowed: true, code: 'allowed', message: 'Accomplishment month is allowed by period policy.' };
};
