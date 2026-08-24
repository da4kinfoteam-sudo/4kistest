import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const dryRun = process.argv.includes('--dry-run');
if (!url || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: profiles, error: profileError } = await admin
  .from('users')
  .select('id,email,username,fullName,role,operatingUnit,password,auth_id,is_active')
  .order('id');
if (profileError) throw profileError;

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  authUsers.push(...data.users);
  if (data.users.length < 1000) break;
}
const authByEmail = new Map(authUsers.map(user => [user.email?.toLowerCase(), user]));

let linked = 0;
let created = 0;
for (const profile of profiles || []) {
  if (profile.is_active === false) continue;
  const email = String(profile.email || '').trim().toLowerCase();
  const password = String(profile.password || '');
  if (!email || !email.includes('@')) throw new Error(`Application user ${profile.id} has no valid email.`);
  if (!profile.auth_id && password.length < 6) throw new Error(`Application user ${profile.id} needs a password reset before Auth migration.`);

  let authUser = profile.auth_id ? authUsers.find(user => user.id === profile.auth_id) : authByEmail.get(email);
  if (!authUser && !dryRun) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: profile.fullName,
        username: profile.username,
        application_user_id: profile.id,
      },
    });
    if (error) throw error;
    authUser = data.user;
    created += 1;
  }

  if (!dryRun && authUser) {
    const { error } = await admin.from('users').update({
      auth_id: authUser.id,
      password_reset_required: false,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id);
    if (error) throw error;
    linked += 1;
  }
}

const activeProfiles = (profiles || []).filter(profile => profile.is_active !== false);
const hasSuper = activeProfiles.some(profile => profile.role === 'Super Admin');
let bootstrappedSuperId = null;
let fallbackAdministratorId = activeProfiles.find(profile => profile.role === 'Administrator')?.id || null;
if (!hasSuper) {
  const bootstrap = activeProfiles.find(profile => profile.role === 'Administrator');
  if (!bootstrap) throw new Error('No active Administrator is available to bootstrap the protected Super Admin role.');
  bootstrappedSuperId = bootstrap.id;
  if (!dryRun) {
    const { error } = await admin.from('users').update({ role: 'Super Admin', permission_version: 2, updated_at: new Date().toISOString() }).eq('id', bootstrap.id);
    if (error) throw error;

    const remainingAdministrator = activeProfiles.find(profile => profile.role === 'Administrator' && profile.id !== bootstrap.id);
    if (remainingAdministrator) {
      fallbackAdministratorId = remainingAdministrator.id;
    } else {
      const fallbackEmail = 'testadministrator@4kistest.example';
      const existingFallback = authByEmail.get(fallbackEmail);
      let fallbackAuth = existingFallback;
      if (!fallbackAuth) {
        const { data, error: createError } = await admin.auth.admin.createUser({
          email: fallbackEmail,
          password: String(bootstrap.password),
          email_confirm: true,
          user_metadata: {
            full_name: '4kistest Delegated Administrator',
            username: 'testadministrator',
            role: 'Administrator',
            operatingUnit: 'NPMO',
          },
        });
        if (createError) throw createError;
        fallbackAuth = data.user;
      }
      const { data: fallbackProfile, error: fallbackError } = await admin.from('users').update({
        role: 'Administrator',
        visibility_scope: 'All OUs',
        is_active: true,
        password_reset_required: false,
      }).eq('auth_id', fallbackAuth.id).select('id').single();
      if (fallbackError) throw fallbackError;
      fallbackAdministratorId = fallbackProfile.id;
    }
    const { error: workflowError } = await admin.from('workflow_settings').update({ default_administrator_id: fallbackAdministratorId }).eq('singleton', true);
    if (workflowError) throw workflowError;
  }
}

if (!dryRun) {
  const { count, error } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true).is('auth_id', null);
  if (error) throw error;
  if (count) throw new Error(`${count} active application account(s) remain unlinked.`);
}

console.log(JSON.stringify({
  dryRun,
  activeProfiles: activeProfiles.length,
  existingAuthUsers: authUsers.length,
  created,
  linked,
  bootstrappedSuperId,
  fallbackAdministratorId,
}, null, 2));
