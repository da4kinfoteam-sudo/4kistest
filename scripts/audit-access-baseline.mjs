import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const envText = await fs.readFile('.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map(line => line.match(/^([^#=]+)=(.*)$/)).filter(Boolean).map(match => [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const [usersResult, rolesResult, dcfResult] = await Promise.all([
  supabase.from('users').select('id,username,fullName,email,role,operatingUnit,visibility_scope,requires_approver,approver_id,permissions_override').order('id'),
  supabase.from('roles_config').select('role,module,can_view,can_edit,can_delete,visibility_scope').order('role').order('module'),
  supabase.from('dcf_policy_settings').select('settings_key,settings').maybeSingle(),
]);

for (const result of [usersResult, rolesResult, dcfResult]) {
  if (result.error) throw result.error;
}

console.log(JSON.stringify({
  users: usersResult.data,
  roleConfigCount: rolesResult.data?.length || 0,
  configuredRoles: [...new Set((rolesResult.data || []).map(row => row.role))],
  configuredModules: [...new Set((rolesResult.data || []).map(row => row.module))],
  hasDcfPolicy: Boolean(dcfResult.data),
}, null, 2));
