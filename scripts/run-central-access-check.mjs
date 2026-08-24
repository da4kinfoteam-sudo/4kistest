import assert from 'node:assert/strict';
import { resolveAccessDecision } from '../lib/accessControl.ts';
import {
  canEditDcfSection,
  canUseAccomplishmentMonth,
  normalizeDcfPolicySettings,
} from '../lib/dcfPolicy.ts';

const user = (role, overrides = {}) => ({
  id: 10,
  username: 'access-test',
  fullName: 'Access Test',
  email: 'access@example.test',
  role,
  operatingUnit: 'CAR',
  visibility_scope: 'Own OU',
  is_active: true,
  ...overrides,
});
const rule = (role, action, allowed, visibility_scope = 'Own OU') => ({ role, module: 'Subprojects', action, allowed, visibility_scope });

const superDecision = resolveAccessDecision({
  user: user('Super Admin'), module: 'Subprojects', action: 'delete', roleRules: [], userRules: [], userScopes: [], recordOperatingUnit: 'NPMO',
});
assert.equal(superDecision.allowed, true);
assert.equal(superDecision.source, 'super_admin_invariant');
assert.equal(superDecision.scope, 'All');

const managementMutation = resolveAccessDecision({
  user: user('Management'), module: 'Subprojects', action: 'edit', roleRules: [rule('Management', 'view', true), rule('Management', 'edit', true)], userRules: [{ user_id: 10, module: 'Subprojects', action: 'edit', effect: 'allow' }], userScopes: [],
});
assert.equal(managementMutation.allowed, false);
assert.equal(managementMutation.source, 'protected_read_only_ceiling');

const explicitDeny = resolveAccessDecision({
  user: user('Focal - User'), module: 'Subprojects', action: 'edit', roleRules: [rule('Focal - User', 'view', true), rule('Focal - User', 'edit', true)], userRules: [{ user_id: 10, module: 'Subprojects', action: 'edit', effect: 'deny' }], userScopes: [],
});
assert.equal(explicitDeny.allowed, false);
assert.equal(explicitDeny.source, 'user_override');

const outsideScope = resolveAccessDecision({
  user: user('Focal - User'), module: 'Subprojects', action: 'view', roleRules: [rule('Focal - User', 'view', true)], userRules: [], userScopes: [], recordOperatingUnit: 'NPMO',
});
assert.equal(outsideScope.allowed, false);
assert.equal(outsideScope.source, 'scope_denied');

const missingView = resolveAccessDecision({
  user: user('RFO - User'), module: 'Subprojects', action: 'edit', roleRules: [rule('RFO - User', 'edit', true)], userRules: [], userScopes: [],
});
assert.equal(missingView.allowed, false);
assert.equal(missingView.source, 'missing_policy');

const policy = normalizeDcfPolicySettings(undefined);
assert.equal(canEditDcfSection({ user: user('Focal - User'), hasModuleAccess: true, policy, moduleKey: 'subprojects', status: 'Completed', action: 'editFinancialAccomplishment' }).allowed, true);
assert.equal(canEditDcfSection({ user: user('Focal - User'), hasModuleAccess: true, policy, moduleKey: 'subprojects', status: 'Completed', action: 'editPhysicalAccomplishment' }).allowed, false);
assert.equal(canEditDcfSection({ user: user('Management'), hasModuleAccess: true, policy, moduleKey: 'subprojects', status: 'Completed', action: 'editFinancialAccomplishment' }).allowed, false);

assert.equal(canUseAccomplishmentMonth({ user: user('Focal - User'), policy, targetMonth: '2026-07', serverDate: '2026-08-05', canOverride: false }).allowed, true);
assert.equal(canUseAccomplishmentMonth({ user: user('Focal - User'), policy, targetMonth: '2026-07', serverDate: '2026-08-06', canOverride: false }).allowed, false);
assert.equal(canUseAccomplishmentMonth({ user: user('Administrator'), policy, targetMonth: '2025-12', serverDate: '2026-08-24', canOverride: true }).requiresOverrideReason, true);
assert.equal(canUseAccomplishmentMonth({ user: user('Super Admin'), policy, targetMonth: '2030-01', serverDate: '2026-08-24', canOverride: true }).requiresOverrideReason, undefined);

console.log('Central access, scope, DCF completion, and period-lock checks passed.');
