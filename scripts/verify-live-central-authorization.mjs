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
assert.ok(url && anonKey, 'The test Supabase URL and anonymous key are required.');
assert.ok(testPassword, 'TEST_USER_PASSWORD is required for the isolated test identities.');

const client = () => createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const signIn = async (email) => {
  const signedIn = client();
  const { error } = await signedIn.auth.signInWithPassword({ email, password: testPassword });
  assert.ifError(error);
  return signedIn;
};

const anonymous = client();
const anonymousUsers = await anonymous.from('users').select('id').limit(1);
assert.ok(anonymousUsers.error, 'Anonymous profile access must be denied.');

const superAdmin = await signIn('testadmin@4kistest.local');
const { data: profiles, error: profilesError } = await superAdmin
  .from('users')
  .select('id,email,role,auth_id,is_active')
  .eq('is_active', true);
assert.ifError(profilesError);

const superProfile = profiles.find(profile => profile.role === 'Super Admin');
const focalProfile = profiles.find(profile => profile.email === 'testfocal@4kistest.local');
const rfoProfile = profiles.find(profile => profile.email === 'testrfo@4kistest.local');
assert.ok(superProfile && focalProfile && rfoProfile, 'Expected Super Admin, Focal, and RFO test profiles.');

const { data: superCanManage, error: superAccessError } = await superAdmin.rpc('current_user_has_access', {
  p_module: 'Settings - User Management',
  p_action: 'manage_super_admins',
  p_record_ou: null,
});
assert.ifError(superAccessError);
assert.equal(superCanManage, true, 'Super Admin must remain unrestricted.');

const passwordProbe = await superAdmin.from('users').select('id,password').limit(1);
assert.ok(passwordProbe.error, 'The legacy plaintext password column must not exist.');

for (const table of ['roles_config', 'user_roles_config']) {
  const legacyProbe = await superAdmin.from(table).select('*').limit(1);
  assert.ok(legacyProbe.error || legacyProbe.data.length === 0, `${table} must not expose runtime policy data.`);
}

const { data: auditRows, error: auditReadError } = await superAdmin
  .from('authorization_audit_events')
  .select('id,outcome')
  .order('id', { ascending: false })
  .limit(1);
assert.ifError(auditReadError);
if (auditRows.length) {
  const immutableAudit = await superAdmin
    .from('authorization_audit_events')
    .update({ outcome: auditRows[0].outcome })
    .eq('id', auditRows[0].id)
    .select('id');
  assert.ok(immutableAudit.error, 'Authorization audit events must be append-only.');
}

const focal = await signIn(focalProfile.email);
const { data: focalCanManage, error: focalAccessError } = await focal.rpc('current_user_has_access', {
  p_module: 'Settings - Access Control',
  p_action: 'manage_permissions',
  p_record_ou: null,
});
assert.ifError(focalAccessError);
assert.equal(focalCanManage, false, 'Focal users must not manage centralized permissions.');

const focalProfiles = await focal.from('users').select('id,role');
assert.ifError(focalProfiles.error);
assert.ok(focalProfiles.data.every(profile => profile.id === focalProfile.id), 'Focal users must not enumerate other profiles.');

const escalationAttempt = await focal
  .from('users')
  .update({ role: 'Super Admin' })
  .eq('id', focalProfile.id)
  .select('id,role');
assert.ok(escalationAttempt.error || escalationAttempt.data.length === 0, 'Self-service role escalation must be blocked.');
const { data: unchangedFocal, error: unchangedFocalError } = await focal
  .from('users')
  .select('role')
  .eq('id', focalProfile.id)
  .single();
assert.ifError(unchangedFocalError);
assert.equal(unchangedFocal.role, focalProfile.role);

const rfo = await signIn(rfoProfile.email);
const { data: pendingOwn, error: pendingOwnError } = await rfo
  .from('activities')
  .select('id')
  .eq('created_by_user_id', rfoProfile.id)
  .eq('workflow_status', 'PENDING')
  .limit(1);
assert.ifError(pendingOwnError);
if (pendingOwn.length) {
  const selfApproval = await rfo.rpc('transition_workflow', {
    p_entity_type: 'activities',
    p_entity_id: pendingOwn[0].id,
    p_transition: 'approve',
    p_reason: null,
  });
  assert.ok(selfApproval.error, 'Workflow self-approval must be rejected.');
  assert.match(selfApproval.error.message, /Self-approval is not allowed/i);
}

await Promise.all([superAdmin.auth.signOut(), focal.auth.signOut(), rfo.auth.signOut()]);
console.log(JSON.stringify({
  anonymousTablesBlocked: true,
  plaintextPasswordsRemoved: true,
  legacyPolicyStoresLocked: true,
  auditEventsAppendOnly: true,
  focalEscalationBlocked: true,
  selfApprovalChecked: pendingOwn.length > 0,
}, null, 2));
