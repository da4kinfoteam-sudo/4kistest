import type { User, UserRole, VisibilityScope } from '../constants';

export const ACCESS_EFFECTS = ['allow', 'deny'] as const;
export type AccessEffect = typeof ACCESS_EFFECTS[number];

export const ACCESS_ACTIONS = [
  'view', 'create', 'edit', 'delete', 'import', 'clone', 'export', 'approve',
  'manage_status', 'view_monitoring', 'manage_monitoring', 'add_monitoring_action',
  'delete_monitoring_action', 'view_files', 'upload_files', 'delete_files',
  'edit_physical_target', 'edit_physical_actual', 'edit_financial_actual',
  'delete_financial_actual', 'override_physical_lock', 'override_financial_lock',
  'override_period', 'manage_users', 'manage_roles', 'manage_permissions',
  'manage_approver_assignments', 'manage_user_scopes', 'manage_user_overrides',
  'manage_super_admins', 'manage_settings', 'edit_assessment', 'set_manual_level',
  'manage_controller', 'inline_edit', 'bulk_action',
] as const;

export type AccessAction = typeof ACCESS_ACTIONS[number];

export const READ_ONLY_ACTIONS = new Set<AccessAction>(['view', 'export', 'view_files', 'view_monitoring']);
export const PROTECTED_READ_ONLY_ROLES = new Set<UserRole>(['Management', 'Guest']);

export const getProtectedRoleCeiling = (role: UserRole | string, action: AccessAction): boolean | null => {
  if (role === 'Super Admin') return true;
  if (PROTECTED_READ_ONLY_ROLES.has(role as UserRole) && !READ_ONLY_ACTIONS.has(action)) return false;
  return null;
};

export interface RolePermissionRule {
  role: UserRole | string;
  module: string;
  action: AccessAction;
  allowed: boolean;
  visibility_scope?: VisibilityScope | null;
}

export interface UserPermissionRule {
  user_id: number;
  module: string;
  action: AccessAction;
  effect: AccessEffect;
}

export interface UserScopeRule {
  user_id: number;
  module: string;
  visibility_scope: VisibilityScope;
}

export type AccessDecisionSource =
  | 'unauthenticated'
  | 'inactive_account'
  | 'super_admin_invariant'
  | 'protected_read_only_ceiling'
  | 'user_override'
  | 'role_default'
  | 'missing_policy'
  | 'scope_denied';

export interface AccessDecision {
  allowed: boolean;
  source: AccessDecisionSource;
  reason: string;
  module: string;
  action: AccessAction;
  scope: 'All' | 'Own OU';
  policyVersion: number;
}

export interface ResolveAccessInput {
  user: User | null;
  module: string;
  action: AccessAction;
  roleRules: RolePermissionRule[];
  userRules: UserPermissionRule[];
  userScopes: UserScopeRule[];
  policyVersion?: number;
  recordOperatingUnit?: string | null;
}

const scopeFor = (
  user: User,
  module: string,
  roleRules: RolePermissionRule[],
  userScopes: UserScopeRule[],
): 'All' | 'Own OU' => {
  if (user.role === 'Super Admin') return 'All';
  const userScope = userScopes.find(rule => rule.user_id === user.id && rule.module === module)?.visibility_scope;
  if (userScope) return userScope === 'All OUs' ? 'All' : 'Own OU';
  if (user.visibility_scope) return user.visibility_scope === 'All OUs' ? 'All' : 'Own OU';
  const roleScope = roleRules.find(rule => rule.role === user.role && rule.module === module)?.visibility_scope;
  return roleScope === 'All OUs' ? 'All' : 'Own OU';
};

export const resolveAccessDecision = ({
  user,
  module,
  action,
  roleRules,
  userRules,
  userScopes,
  policyVersion = 0,
  recordOperatingUnit,
}: ResolveAccessInput): AccessDecision => {
  const base = { module, action, policyVersion };
  if (!user) {
    return { ...base, allowed: false, source: 'unauthenticated', reason: 'A valid authenticated session is required.', scope: 'Own OU' };
  }
  if (user.is_active === false) {
    return { ...base, allowed: false, source: 'inactive_account', reason: 'This account is inactive.', scope: 'Own OU' };
  }

  if (user.role === 'Super Admin') {
    return { ...base, allowed: true, source: 'super_admin_invariant', reason: 'Protected Super Admin allow-all invariant.', scope: 'All' };
  }

  const scope = scopeFor(user, module, roleRules, userScopes);
  if (PROTECTED_READ_ONLY_ROLES.has(user.role) && !READ_ONLY_ACTIONS.has(action)) {
    return { ...base, allowed: false, source: 'protected_read_only_ceiling', reason: `${user.role} is a protected read-only role.`, scope };
  }

  if (action !== 'view') {
    const viewOverride = userRules.find(rule => rule.user_id === user.id && rule.module === module && rule.action === 'view');
    const viewRoleRule = roleRules.find(rule => rule.role === user.role && rule.module === module && rule.action === 'view');
    const canView = viewOverride ? viewOverride.effect === 'allow' : !!viewRoleRule?.allowed;
    if (!canView) {
      return {
        ...base,
        allowed: false,
        source: viewOverride ? 'user_override' : (viewRoleRule ? 'role_default' : 'missing_policy'),
        reason: viewOverride?.effect === 'deny' ? 'Explicit user view deny overrides all ordinary actions.' : 'Page view access is required for this action.',
        scope,
      };
    }
  }

  const override = userRules.find(rule => rule.user_id === user.id && rule.module === module && rule.action === action);
  const roleRule = roleRules.find(rule => rule.role === user.role && rule.module === module && rule.action === action);
  let allowed = false;
  let source: AccessDecisionSource = 'missing_policy';
  let reason = `No ${module}.${action} policy is configured; access fails closed.`;

  if (override) {
    allowed = override.effect === 'allow';
    source = 'user_override';
    reason = `Explicit user ${override.effect} override.`;
  } else if (roleRule) {
    allowed = roleRule.allowed;
    source = 'role_default';
    reason = `Inherited ${roleRule.allowed ? 'allow' : 'deny'} from ${user.role}.`;
  }

  if (allowed && scope === 'Own OU' && recordOperatingUnit && recordOperatingUnit !== user.operatingUnit) {
    return { ...base, allowed: false, source: 'scope_denied', reason: `Record is outside ${user.operatingUnit}.`, scope };
  }

  return { ...base, allowed, source, reason, scope };
};

export const legacyActionMap: Record<'view' | 'edit' | 'delete' | 'manage', AccessAction> = {
  view: 'view',
  edit: 'edit',
  delete: 'delete',
  manage: 'manage_settings',
};

export const isMaterialWorkflowAction = (action: AccessAction) => [
  'edit', 'delete', 'import', 'clone', 'manage_status', 'edit_physical_target', 'edit_physical_actual',
].includes(action);
