import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDcfPolicy } from '../contexts/DcfPolicyContext';
import { useLogAction } from './useLogAction';
import { supabase } from '../supabaseClient';
import {
    canDeleteDcfItem,
    canEditDcfSection,
    canUseAccomplishmentMonth,
    DcfModuleKey,
    DcfPolicyAction,
    DcfPolicyDecision,
    DcfPolicyStatus,
    getDcfItemPolicyStatus,
} from '../lib/dcfPolicy';

export interface DcfPolicyGuardContext {
    moduleKey: DcfModuleKey;
    item?: any;
    itemId?: number | string;
    itemName?: string;
    status?: DcfPolicyStatus;
    action?: DcfPolicyAction;
    month?: string;
    entityType?: string;
}

export const buildDcfOverrideAuditMetadata = ({
    decision,
    context,
    reason,
    serverDate,
    userRole,
}: {
    decision: DcfPolicyDecision;
    context: DcfPolicyGuardContext;
    reason: string | null;
    serverDate: string;
    userRole?: string;
}) => {
    const normalizedMonth = normalizePolicyMonth(context.month);
    return {
        auditType: 'dcf_policy_override',
        moduleKey: context.moduleKey,
        moduleLabel: getDcfModuleLabel(context.moduleKey),
        sourceEntity: context.entityType || context.moduleKey,
        itemId: context.itemId,
        itemName: context.itemName,
        status: context.status,
        action: context.action,
        targetMonth: normalizedMonth,
        originalBlockedAction: context.action || (normalizedMonth ? 'accomplishmentPeriod' : 'dcfPolicy'),
        originalBlockedMonth: normalizedMonth,
        decisionCode: decision.code,
        decisionMessage: decision.message,
        overrideReason: reason || null,
        overrideUserRole: userRole || null,
        serverDate,
        clientTimestamp: new Date().toISOString(),
        policyVersion: 1,
    };
};

const ALLOWED_DECISION: DcfPolicyDecision = {
    allowed: true,
    code: 'allowed',
    message: 'Allowed.',
};

export const getDcfModuleKeyForSourceType = (sourceType?: string): DcfModuleKey | null => {
    switch (sourceType) {
        case 'Subproject':
            return 'subprojects';
        case 'Activity':
            return 'activities';
        case 'Office':
            return 'office_requirements';
        case 'Staffing':
            return 'staffing_requirements';
        case 'Other':
            return 'other_program_expenses';
        default:
            return null;
    }
};

const getDcfModuleName = (moduleKey: DcfModuleKey): string => {
    switch (moduleKey) {
        case 'subprojects': return 'Subprojects';
        case 'activities': return 'Activities';
        case 'office_requirements': return 'Program Management - Office Requirements';
        case 'staffing_requirements': return 'Program Management - Staffing Requirements';
        case 'other_program_expenses': return 'Program Management - Other Program Expenses';
    }
};

const getDcfTargetTable = (moduleKey: DcfModuleKey): string => {
    switch (moduleKey) {
        case 'subprojects': return 'subprojects';
        case 'activities': return 'activities';
        case 'office_requirements': return 'office_requirements';
        case 'staffing_requirements': return 'staffing_requirements';
        case 'other_program_expenses': return 'other_program_expenses';
    }
};

export const normalizePolicyMonth = (value?: string | null): string | null => {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    return match ? `${match[1]}-${match[2]}` : null;
};

export const getDcfModuleLabel = (moduleKey: DcfModuleKey): string => {
    switch (moduleKey) {
        case 'subprojects':
            return 'Subprojects';
        case 'activities':
            return 'Activities';
        case 'office_requirements':
            return 'Office Requirements';
        case 'staffing_requirements':
            return 'Staffing Requirements';
        case 'other_program_expenses':
            return 'Other Program Expenses';
        default:
            return 'DCF record';
    }
};

export const formatPolicyMonthLabel = (month?: string | null): string => {
    const normalizedMonth = normalizePolicyMonth(month);
    if (!normalizedMonth) return 'the current month';
    const [year, monthNumber] = normalizedMonth.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
};

export const useDcfPolicyGuard = () => {
    const { currentUser, hasAccess } = useAuth();
    const { policy, serverDate, loading, error } = useDcfPolicy();
    const { logAction } = useLogAction();

    const getStatusDecision = useCallback(({
        moduleKey,
        item,
        status,
        action,
        hasModuleAccess,
    }: {
        moduleKey: DcfModuleKey;
        item?: any;
        status?: DcfPolicyStatus;
        action: DcfPolicyAction;
        hasModuleAccess: boolean;
    }): DcfPolicyDecision => {
        if (loading || error) {
            return { allowed: false, code: 'blocked_by_status', message: error ? 'DCF editing policy is unavailable; writes are blocked until User Settings restores it.' : 'DCF editing policy is still loading.' };
        }
        const resolvedStatus = status || getDcfItemPolicyStatus(moduleKey, item || {});
        const moduleName = getDcfModuleName(moduleKey);
        const centralizedAccess = action === 'editPhysicalAccomplishment'
            ? hasAccess(moduleName, 'edit_physical_actual') && hasAccess('Accomplishment - Physical', 'edit_physical_actual')
            : action === 'editFinancialAccomplishment'
                ? hasAccess(moduleName, 'edit_financial_actual') && hasAccess('Accomplishment - Financial', 'edit_financial_actual')
                : action === 'delete'
                    ? hasAccess(moduleName, 'delete')
                    : hasAccess(moduleName, 'edit');
        const decision = canEditDcfSection({
            user: currentUser,
            hasModuleAccess: hasModuleAccess && centralizedAccess,
            policy,
            moduleKey,
            status: resolvedStatus,
            action,
        });
        if (!decision.allowed && decision.code === 'blocked_by_status' && currentUser?.role !== 'Super Admin') {
            const overrideAction = action === 'editPhysicalAccomplishment' ? 'override_physical_lock' : action === 'editFinancialAccomplishment' ? 'override_financial_lock' : null;
            const overrideModule = overrideAction ? hasAccess(moduleName, overrideAction) : false;
            const overrideAccomplishment = action === 'editPhysicalAccomplishment'
                ? hasAccess('Accomplishment - Physical', 'override_period')
                : action === 'editFinancialAccomplishment'
                    ? hasAccess('Accomplishment - Financial', 'override_period')
                    : false;
            if (hasModuleAccess && hasAccess(moduleName, 'view') && (overrideModule || overrideAccomplishment)) {
                return {
                    allowed: true,
                    code: 'allowed_by_override',
                    message: `Allowed by configured ${action === 'editPhysicalAccomplishment' ? 'physical' : 'financial'} DCF override.`,
                    requiresOverrideReason: true,
                };
            }
        }
        return decision;
    }, [currentUser, error, hasAccess, loading, policy]);

    const getDeleteDecision = useCallback(({
        moduleKey,
        item,
        status,
        hasModuleAccess,
    }: {
        moduleKey: DcfModuleKey;
        item?: any;
        status?: DcfPolicyStatus;
        hasModuleAccess: boolean;
    }): DcfPolicyDecision => {
        if (loading || error) {
            return { allowed: false, code: 'blocked_by_status', message: error ? 'DCF editing policy is unavailable; deletes are blocked until User Settings restores it.' : 'DCF editing policy is still loading.' };
        }
        const resolvedStatus = status || getDcfItemPolicyStatus(moduleKey, item || {});
        const moduleName = getDcfModuleName(moduleKey);
        return canDeleteDcfItem({
            user: currentUser,
            hasModuleAccess: hasModuleAccess && hasAccess(moduleName, 'delete'),
            policy,
            moduleKey,
            status: resolvedStatus,
        });
    }, [currentUser, error, hasAccess, loading, policy]);

    const getMonthDecision = useCallback((month?: string | null, accomplishment: 'physical' | 'financial' = 'financial'): DcfPolicyDecision => {
        const normalizedMonth = normalizePolicyMonth(month);
        if (!normalizedMonth) return ALLOWED_DECISION;
        if (loading || error) {
            return { allowed: false, code: 'blocked_by_month_lock', message: error ? 'DCF period-lock policy is unavailable; period writes are blocked until User Settings restores it.' : 'DCF period-lock policy is still loading.' };
        }
        return canUseAccomplishmentMonth({
            user: currentUser,
            policy,
            targetMonth: normalizedMonth,
            serverDate,
            canOverride: hasAccess(accomplishment === 'physical' ? 'Accomplishment - Physical' : 'Accomplishment - Financial', 'override_period'),
        });
    }, [currentUser, error, hasAccess, loading, policy, serverDate]);

    const getCurrentAccomplishmentMonthLabel = useCallback((): string => (
        formatPolicyMonthLabel(serverDate)
    ), [serverDate]);

    const isMonthSelectionAllowed = useCallback((decision: DcfPolicyDecision): boolean => (
        decision.allowed && decision.code !== 'allowed_by_override'
    ), []);

    const getMonthLockMessage = useCallback((decision?: DcfPolicyDecision): string => {
        if (decision?.code === 'blocked_by_permission') {
            return decision.message;
        }
        return `Only the current accomplishment month is open. Please select ${getCurrentAccomplishmentMonthLabel()}.`;
    }, [getCurrentAccomplishmentMonthLabel]);

    const requestOverrideReason = useCallback((decision: DcfPolicyDecision, context: DcfPolicyGuardContext): string | null => {
        if (decision.code !== 'allowed_by_override' || !decision.requiresOverrideReason) {
            return null;
        }

        const label = context.month
            ? `${getDcfModuleLabel(context.moduleKey)} ${context.action || 'period'} override for ${context.month}`
            : `${getDcfModuleLabel(context.moduleKey)} ${context.action || 'policy'} override`;
        const reason = window.prompt(`${label}\n\n${decision.message}\n\nEnter override reason:`);
        if (!reason || !reason.trim()) {
            return '';
        }
        return reason.trim();
    }, []);

    const logOverride = useCallback(async (decision: DcfPolicyDecision, context: DcfPolicyGuardContext, reason: string | null) => {
        if (decision.code !== 'allowed_by_override') return;
        if (!supabase) throw new Error('Supabase is not configured for DCF override authorization.');
        const moduleName = getDcfModuleName(context.moduleKey);
        const overrideAction = context.action === 'editPhysicalAccomplishment'
            ? 'edit_physical_actual'
            : context.action === 'editFinancialAccomplishment'
                ? 'edit_financial_actual'
                : 'edit_financial_actual';
        const { error: grantError } = await supabase.rpc('request_dcf_override', {
            p_module: moduleName,
            p_action: overrideAction,
            p_target_type: getDcfTargetTable(context.moduleKey),
            p_target_id: context.itemId !== undefined ? String(context.itemId) : null,
            p_target_month: normalizePolicyMonth(context.month),
            p_operating_unit: context.item?.operatingUnit || null,
            p_reason: reason,
        });
        if (grantError) throw grantError;
        await logAction(
            'DCF Policy Override',
            `${getDcfModuleLabel(context.moduleKey)} override used${context.itemName ? ` for ${context.itemName}` : ''}.`,
            undefined,
            context.entityType || context.moduleKey,
            context.itemId !== undefined ? String(context.itemId) : undefined,
            buildDcfOverrideAuditMetadata({
                decision,
                context,
                reason,
                serverDate,
                userRole: currentUser?.role,
            })
        );
        const auditModule = context.action === 'editPhysicalAccomplishment'
            ? 'Accomplishment - Physical'
            : 'Accomplishment - Financial';
        const { error: auditError } = await supabase.rpc('log_authorization_event', {
            p_module: auditModule,
            p_action: 'override_period',
            p_target_type: context.entityType || context.moduleKey,
            p_target_id: context.itemId !== undefined ? String(context.itemId) : null,
            p_operating_unit: context.item?.operatingUnit || null,
            p_before_state: null,
            p_after_state: { month: context.month, serverDate },
            p_reason: reason,
            p_outcome: 'allowed',
            p_metadata: { source: 'dcf_period_override', policyDecision: decision.code },
        });
        if (auditError) throw auditError;
    }, [currentUser?.role, logAction, serverDate]);

    const ensureDecisionAllowed = useCallback(async (decision: DcfPolicyDecision, context: DcfPolicyGuardContext): Promise<boolean> => {
        if (!decision.allowed) {
            window.alert(decision.message);
            return false;
        }

        const reason = requestOverrideReason(decision, context);
        if (reason === '') {
            window.alert('Override reason is required.');
            return false;
        }
        await logOverride(decision, context, reason);
        return true;
    }, [logOverride, requestOverrideReason]);

    return {
        policy,
        serverDate,
        loading,
        error,
        getStatusDecision,
        getDeleteDecision,
        getMonthDecision,
        getCurrentAccomplishmentMonthLabel,
        getMonthLockMessage,
        isMonthSelectionAllowed,
        ensureDecisionAllowed,
    };
};
