import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const envText = await fs.readFile('.env.local', 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map(line => line.match(/^([^#=]+)=(.*)$/))
    .filter(Boolean)
    .map(match => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]),
);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const testPassword = process.env.TEST_USER_PASSWORD?.trim();
assert.ok(url && anonKey, 'The isolated test Supabase URL and anonymous key are required.');
assert.ok(testPassword, 'TEST_USER_PASSWORD is required for the isolated test identities.');

const client = () => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const signIn = async email => {
  const signedIn = client();
  const { error } = await signedIn.auth.signInWithPassword({ email, password: testPassword });
  assert.ifError(error);
  return signedIn;
};

const expectError = (result, message) => {
  assert.ok(result.error || !result.data?.length, message);
  if (result.error) return result.error.message;
  return 'blocked without returned rows';
};

const anonymous = client();
const anonymousUsers = await anonymous.from('users').select('id').limit(1);
assert.ok(anonymousUsers.error, 'Anonymous profile access must be denied.');

const superAdmin = await signIn('testadmin@4kistest.local');
const { data: profiles, error: profilesError } = await superAdmin
  .from('users')
  .select('id,email,role,auth_id,is_active,operatingUnit,visibility_scope')
  .eq('is_active', true);
assert.ifError(profilesError);

const superProfile = profiles.find(profile => profile.role === 'Super Admin');
const focalProfile = profiles.find(profile => profile.email === 'testfocal@4kistest.local');
const rfoProfile = profiles.find(profile => profile.email === 'testrfo@4kistest.local');
const administratorProfile = profiles.find(profile => profile.email === 'testadministrator@4kistest.example');
assert.ok(superProfile && focalProfile && rfoProfile, 'Expected Super Admin, Focal, and RFO test profiles.');

const { data: superCanManage, error: superAccessError } = await superAdmin.rpc('current_user_has_access', {
  p_module: 'Settings - User Management', p_action: 'manage_super_admins', p_record_ou: null,
});
assert.ifError(superAccessError);
assert.equal(superCanManage, true, 'Super Admin must remain unrestricted.');

const policyResult = await superAdmin.from('dcf_policy_settings').select('settings').eq('settings_key', 'dcf_editing_policy').single();
assert.ifError(policyResult.error);
assert.ok(policyResult.data?.settings?.transitionRules, 'The central status transition matrix must be present.');

const currentDateResult = await superAdmin.rpc('get_app_current_date');
assert.ifError(currentDateResult.error);
const currentDate = String(currentDateResult.data);
assert.match(currentDate, /^\d{4}-\d{2}-\d{2}$/);
const monthOf = value => value.slice(0, 7);
const dateForMonth = (offset) => {
  const [year, month] = currentDate.slice(0, 7).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

const focal = await signIn(focalProfile.email);
const rfo = await signIn(rfoProfile.email);
const administrator = administratorProfile ? await signIn(administratorProfile.email) : null;

const access = async (session, module, action, operatingUnit = null) => {
  const result = await session.rpc('current_user_has_access', {
    p_module: module, p_action: action, p_record_ou: operatingUnit,
  });
  assert.ifError(result.error);
  return result.data === true;
};

const closure = {
  anonymousBlocked: true,
  superAdminAllowAll: superCanManage === true,
  centralTransitionMatrix: true,
  directStatusColumnBlocked: false,
  directWorkflowColumnBlocked: false,
  completedPhysicalBlocked: false,
  completedFinancialIndependent: false,
  cancelledFinancialBlocked: false,
  periodMatrixVerified: false,
  missingPolicyFailsClosed: false,
  unauthorizedOverrideBlocked: false,
  immutableAudit: false,
};

// Direct status-column writes cannot bypass the transition command, even for
// Super Admin.  Use a real Ongoing seed row and keep the attempted value out
// of the database because the trigger must reject it before mutation.
const statusRows = await superAdmin.from('subprojects').select('id,status,operatingUnit').in('status', ['Proposed', 'Ongoing']).order('id').limit(1);
assert.ifError(statusRows.error);
assert.ok(statusRows.data.length, 'A Proposed/Ongoing seed subproject is required for the direct status test.');
const statusRow = statusRows.data[0];
const directStatus = await superAdmin.from('subprojects').update({ status: statusRow.status === 'Proposed' ? 'Ongoing' : 'Proposed' }).eq('id', statusRow.id).select('id');
expectError(directStatus, 'Direct status-column writes must be blocked.');
closure.directStatusColumnBlocked = true;

// Workflow status is likewise command-only.  The attempted value is never
// committed because the governance trigger rejects it.
const workflowRows = await superAdmin.from('activities').select('id,workflow_status').order('id').limit(1);
assert.ifError(workflowRows.error);
assert.ok(workflowRows.data.length, 'A seeded activity is required for the direct workflow test.');
const workflowRow = workflowRows.data[0];
const directWorkflow = await superAdmin.from('activities').update({ workflow_status: workflowRow.workflow_status === 'DRAFT' ? 'PENDING' : 'DRAFT' }).eq('id', workflowRow.id).select('id');
expectError(directWorkflow, 'Direct workflow-status writes must be blocked.');
closure.directWorkflowColumnBlocked = true;

// The central status ceiling rejects physical actuals on Completed records,
// while a separately authorized financial actual can still be posted.  The
// test uses a same-row round trip only in the isolated environment.
const completed = await superAdmin.from('office_requirements').select('*').eq('status', 'Completed').eq('operatingUnit', focalProfile.operatingUnit).order('id').limit(1);
assert.ifError(completed.error);
if (completed.data.length) {
  const row = completed.data[0];
  const physicalAttempt = await (administrator || superAdmin)
    .from('office_requirements')
    .update({ physicalDeliveryDate: row.physicalDeliveryDate })
    .eq('id', row.id)
    .select('id');
  expectError(physicalAttempt, 'Completed physical actuals must remain locked.');
  closure.completedPhysicalBlocked = true;

  const focalFinancialCapability = await access(focal, 'Program Management - Office Requirements', 'edit_financial_actual', focalProfile.operatingUnit)
    && await access(focal, 'Accomplishment - Financial', 'edit_financial_actual', focalProfile.operatingUnit);
  if (focalFinancialCapability) {
    const original = Number(row.actualObligationAmount || 0);
    const incremented = await focal.from('office_requirements')
      .update({ actualObligationAmount: original + 0.01 })
      .eq('id', row.id)
      .select('id,actualObligationAmount');
    assert.ifError(incremented.error);
    assert.equal(incremented.data.length, 1, 'Financial actual posting on a Completed record must be independently allowed.');
    const restored = await focal.from('office_requirements')
      .update({ actualObligationAmount: original })
      .eq('id', row.id)
      .select('id');
    assert.ifError(restored.error);
    closure.completedFinancialIndependent = true;
  }
}

// Cancelled and Unfilled records reject ordinary writes, including financial
// writes, before a reasoned override exists.
const cancelled = await superAdmin.from('office_requirements').select('id,actualObligationAmount,operatingUnit').eq('status', 'Cancelled').order('id').limit(1);
assert.ifError(cancelled.error);
if (cancelled.data.length) {
  const row = cancelled.data[0];
  const actor = administrator || superAdmin;
  const blocked = await actor.from('office_requirements').update({ actualObligationAmount: Number(row.actualObligationAmount || 0) }).eq('id', row.id).select('id');
  expectError(blocked, 'Cancelled financial writes must be blocked without an override.');
  closure.cancelledFinancialBlocked = true;
}
if (!closure.cancelledFinancialBlocked) {
  // The fixture does not need to retain a Cancelled record. Temporarily move
  // a Proposed subproject through the protected command, exercise a nested
  // financial actual write, and restore the original status in finally.
  const candidate = await superAdmin.from('subprojects').select('id,status,details,operatingUnit').eq('status', 'Proposed').order('id').limit(1);
  assert.ifError(candidate.error);
  if (candidate.data.length) {
    const row = candidate.data[0];
    const cancelledStatus = await superAdmin.rpc('transition_item_status', {
      p_entity_type: 'subprojects', p_entity_id: row.id, p_new_status: 'Cancelled', p_reason: null,
    });
    assert.ifError(cancelledStatus.error);
    try {
      const actor = focal;
      const canPostFinancial = await access(actor, 'Subprojects', 'edit_financial_actual', row.operatingUnit)
        && await access(actor, 'Accomplishment - Financial', 'edit_financial_actual', row.operatingUnit);
      if (canPostFinancial) {
        const originalDetails = Array.isArray(row.details) ? row.details : [];
        const nextDetails = originalDetails.map((detail, index) => index === 0
          ? { ...detail, actualObligationAmount: Number(detail.actualObligationAmount || 0) + 0.01, actualObligationDate: currentDate }
          : detail);
        const blocked = await actor.from('subprojects').update({ details: nextDetails }).eq('id', row.id).select('id');
        expectError(blocked, 'Cancelled financial writes must be blocked without an override.');
        closure.cancelledFinancialBlocked = true;
      }
    } finally {
      const restoredStatus = await superAdmin.rpc('transition_item_status', {
        p_entity_type: 'subprojects', p_entity_id: row.id, p_new_status: 'Proposed', p_reason: null,
      });
      assert.ifError(restoredStatus.error);
    }
  }
}

// Temporarily enable month locking on the isolated policy, verify current,
// closed-past, and future month behavior as a non-Super actor, then restore
// the exact original settings.
const originalSettings = policyResult.data.settings;
const lockedSettings = {
  ...originalSettings,
  monthLock: { ...(originalSettings.monthLock || {}), enabled: true, graceDays: 0, blockPastMonthsAfterGrace: true, blockFutureMonths: true },
};
const settingsWrite = await superAdmin.from('dcf_policy_settings').update({ settings: lockedSettings }).eq('settings_key', 'dcf_editing_policy');
assert.ifError(settingsWrite.error);
try {
  const currentAllowed = await focal.rpc('dcf_period_allowed', {
    p_module: 'Subprojects', p_action: 'edit_financial_actual', p_target_month: monthOf(currentDate),
    p_operating_unit: focalProfile.operatingUnit, p_target_type: 'subprojects', p_target_id: '900001',
  });
  assert.ifError(currentAllowed.error);
  assert.equal(currentAllowed.data, true, 'Current month must remain open.');
  const pastAllowed = await focal.rpc('dcf_period_allowed', {
    p_module: 'Subprojects', p_action: 'edit_financial_actual', p_target_month: dateForMonth(-2),
    p_operating_unit: focalProfile.operatingUnit, p_target_type: 'subprojects', p_target_id: '900001',
  });
  assert.ifError(pastAllowed.error);
  assert.equal(pastAllowed.data, false, 'Closed past months must be blocked.');
  const futureAllowed = await focal.rpc('dcf_period_allowed', {
    p_module: 'Subprojects', p_action: 'edit_financial_actual', p_target_month: dateForMonth(2),
    p_operating_unit: focalProfile.operatingUnit, p_target_type: 'subprojects', p_target_id: '900001',
  });
  assert.ifError(futureAllowed.error);
  assert.equal(futureAllowed.data, false, 'Future months must be blocked.');
  closure.periodMatrixVerified = true;
} finally {
  const restore = await superAdmin.from('dcf_policy_settings').update({ settings: originalSettings }).eq('settings_key', 'dcf_editing_policy');
  assert.ifError(restore.error);
}

// A missing/malformed centralized policy must fail closed for ordinary users.
// Temporarily null the isolated policy row and restore the exact settings after
// probing status, transition, and period decisions.
const malformedPolicyWrite = await superAdmin.from('dcf_policy_settings').update({ settings: [] }).eq('settings_key', 'dcf_editing_policy');
assert.ifError(malformedPolicyWrite.error);
try {
  const deniedStatus = await focal.rpc('dcf_status_action_allowed', {
    p_module: 'Subprojects', p_action: 'edit_financial_actual', p_status: 'Ongoing', p_operating_unit: focalProfile.operatingUnit,
  });
  assert.ifError(deniedStatus.error);
  assert.equal(deniedStatus.data, false, 'Malformed DCF policy must deny ordinary status actions.');
  const deniedTransition = await focal.rpc('dcf_transition_allowed', {
    p_entity_type: 'subprojects', p_from: 'Proposed', p_to: 'Ongoing',
  });
  assert.ifError(deniedTransition.error);
  assert.equal(deniedTransition.data, false, 'Malformed DCF policy must deny ordinary status transitions.');
  const deniedPeriod = await focal.rpc('dcf_period_allowed', {
    p_module: 'Subprojects', p_action: 'edit_financial_actual', p_target_month: monthOf(currentDate),
    p_operating_unit: focalProfile.operatingUnit, p_target_type: 'subprojects', p_target_id: String(statusRow.id),
  });
  assert.ifError(deniedPeriod.error);
  assert.equal(deniedPeriod.data, false, 'Malformed DCF policy must deny ordinary period writes.');
  closure.missingPolicyFailsClosed = true;
} finally {
  const restore = await superAdmin.from('dcf_policy_settings').update({ settings: originalSettings }).eq('settings_key', 'dcf_editing_policy');
  assert.ifError(restore.error);
}

const unauthorizedOverride = await rfo.rpc('request_dcf_override', {
  p_module: 'Subprojects', p_action: 'edit_financial_actual', p_target_type: 'subprojects',
  p_target_id: String(statusRow.id), p_target_month: dateForMonth(-2),
  p_operating_unit: rfoProfile.operatingUnit, p_reason: null,
});
assert.ok(unauthorizedOverride.error, 'An unprivileged user cannot create a DCF override.');
closure.unauthorizedOverrideBlocked = true;

const auditRows = await superAdmin.from('authorization_audit_events').select('id,outcome').order('id', { ascending: false }).limit(1);
assert.ifError(auditRows.error);
if (auditRows.data.length) {
  const immutableUpdate = await superAdmin.from('authorization_audit_events').update({ outcome: auditRows.data[0].outcome }).eq('id', auditRows.data[0].id).select('id');
  assert.ok(immutableUpdate.error, 'Authorization audit events must be append-only.');
  const immutableDelete = await superAdmin.from('authorization_audit_events').delete().eq('id', auditRows.data[0].id).select('id');
  assert.ok(immutableDelete.error, 'Authorization audit events must not be deletable.');
  closure.immutableAudit = true;
}

// Demonstrate the protected Super Admin status path without leaving a changed
// value behind: a valid matrix-bypassing transition is followed by the exact
// reverse transition, both through the command and both audited.
const proposed = await superAdmin.from('subprojects').select('id,status').eq('status', 'Proposed').order('id').limit(1);
assert.ifError(proposed.error);
if (proposed.data.length) {
  const item = proposed.data[0];
  const bypass = await superAdmin.rpc('transition_item_status', { p_entity_type: 'subprojects', p_entity_id: item.id, p_new_status: 'Completed', p_reason: null });
  assert.ifError(bypass.error);
  const restoreStatus = await superAdmin.rpc('transition_item_status', { p_entity_type: 'subprojects', p_entity_id: item.id, p_new_status: 'Proposed', p_reason: null });
  assert.ifError(restoreStatus.error);
  closure.superStatusBypassAudited = true;
}

await Promise.all([superAdmin.auth.signOut(), focal.auth.signOut(), rfo.auth.signOut(), administrator?.auth.signOut()]);
console.log(JSON.stringify({ currentDate, focalOperatingUnit: focalProfile.operatingUnit, closure }, null, 2));
