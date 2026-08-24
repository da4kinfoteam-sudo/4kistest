import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const testPassword = process.env.TEST_USER_PASSWORD?.trim();
if (!url || !anonKey || !serviceRoleKey) throw new Error('Supabase URL, anon key, and service-role key are required.');
if (!testPassword) throw new Error('TEST_USER_PASSWORD is required to verify migrated test identities.');

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const { data: profiles, error } = await service
  .from('users')
  .select('id,email,auth_id,role,is_active')
  .eq('is_active', true)
  .order('id');
if (error) throw error;

const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const anonymousUsers = await anonymous.from('users').select('id').limit(1);
if (!anonymousUsers.error) throw new Error('Anonymous users table access is still available.');

const verified = [];
for (const profile of profiles || []) {
  if (!profile.auth_id) throw new Error(`Profile ${profile.id} is not ready for verification.`);
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: signInError } = await client.auth.signInWithPassword({ email: profile.email, password: testPassword });
  if (signInError || auth.user?.id !== profile.auth_id) throw signInError || new Error(`Auth identity mismatch for profile ${profile.id}.`);
  const { data: ownProfile, error: ownError } = await client.from('users').select('id,role,is_active').eq('auth_id', auth.user.id).single();
  if (ownError || ownProfile?.id !== profile.id || ownProfile.is_active === false) throw ownError || new Error(`Profile lookup failed for ${profile.id}.`);
  const { data: canViewProfile, error: accessError } = await client.rpc('current_user_has_access', { p_module: 'Profile', p_action: 'view', p_record_ou: null });
  if (accessError || !canViewProfile) throw accessError || new Error(`Profile authorization failed for ${profile.id}.`);
  if (profile.role === 'Super Admin') {
    const { data: canManageSuper, error: superError } = await client.rpc('current_user_has_access', { p_module: 'Settings - User Management', p_action: 'manage_super_admins', p_record_ou: null });
    if (superError || !canManageSuper) throw superError || new Error('Super Admin invariant failed.');
  }
  verified.push({ id: profile.id, role: profile.role });
  await client.auth.signOut();
}

const legacyPasswordColumn = await service.from('users').select('id,password').limit(1);
if (!legacyPasswordColumn.error) throw new Error('Legacy plaintext password column still exists.');

console.log(JSON.stringify({ anonymousTablesBlocked: true, plaintextPasswordsRemoved: true, verified }, null, 2));
