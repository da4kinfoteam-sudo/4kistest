import { createClient } from 'npm:@supabase/supabase-js@2.39.0';
import { extractBearerToken } from '../_shared/userAdminAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const env = (name: string) => Deno.env.get(name)?.trim() || '';

const safeErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message.trim() : '';
  const normalized = message.toLowerCase();
  if (!message) return 'User administration request failed. Please try again.';

  if (/rate limit|too many requests/.test(normalized)) {
    return 'Invitation email sending is temporarily rate-limited. Please try again later.';
  }
  if (/already registered|already exists|duplicate/.test(normalized)) {
    return 'A user with this email or username already exists.';
  }
  if (/invalid.*email|email.*invalid/.test(normalized)) return 'Enter a valid email address.';
  if (/smtp|mailer|email provider|failed to send.*email|send.*invitation.*email/.test(normalized)) {
    return 'The invitation email could not be sent. Please try again later or contact an administrator.';
  }
  if (/workflow assignment|workflow.*synchron/.test(normalized)) {
    return 'Workflow assignment synchronization failed. Please review the user before retrying.';
  }
  if (/authorization audit|audit.*(entry|event|log)/.test(normalized)) {
    return 'The authorization audit entry could not be written. Please contact an administrator.';
  }
  if (/application profile|profile.*synchron|public\.users|user profile/.test(normalized)) {
    return 'The application user profile could not be synchronized. Please contact an administrator.';
  }

  const safeMessages = [
    'You cannot grant ',
    'Unsupported user administration action.',
    'User not found.',
    'Only Super Admin may ',
    'Administrators cannot ',
    'The last active Super Admin cannot ',
    'Authentication required.',
    'Invalid or expired session.',
    'Active application profile required.',
    'You do not have permission to manage users.',
  ];
  if (safeMessages.some(prefix => message.startsWith(prefix))) return message.slice(0, 500);
  return 'User administration request failed. Please try again.';
};

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const authHeader = request.headers.get('Authorization') || '';
    const accessToken = extractBearerToken(authHeader);
    if (!accessToken) return json({ error: 'Authentication required.' }, 401);
    const url = env('SUPABASE_URL');
    const anonKey = env('SUPABASE_ANON_KEY');
    const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRoleKey) throw new Error('User administration environment is incomplete.');

    const actorClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: 'Invalid or expired session.' }, 401);
    const { data: actor, error: actorError } = await admin.from('users').select('id,auth_id,role,is_active').eq('auth_id', authData.user.id).single();
    if (actorError || !actor?.is_active) return json({ error: 'Active application profile required.' }, 403);

    const { data: decision, error: decisionError } = await admin.rpc('resolve_access_for_user', {
      p_user_id: actor.id,
      p_module: 'Settings - User Management',
      p_action: 'manage_users',
      p_record_ou: null,
    });
    if (decisionError || !decision?.[0]?.allowed) return json({ error: 'You do not have permission to manage users.' }, 403);

    const body = await request.json();
    const action = String(body.action || '');
    const targetId = Number(body.userId);
    const { data: target } = Number.isFinite(targetId)
      ? await admin.from('users').select('*').eq('id', targetId).maybeSingle()
      : { data: null };

    const actorIsSuper = actor.role === 'Super Admin';
    if (target?.role === 'Super Admin' && !actorIsSuper) return json({ error: 'Only Super Admin may manage Super Admin accounts.' }, 403);
    if (target?.id === actor.id && action !== 'send_reset') return json({ error: 'Administrators cannot modify or deactivate their own account.' }, 403);

    const assertCanGrantRole = async (role: string, existingUserId?: number) => {
      if (actorIsSuper) return;
      const { data: grants, error } = await admin.from('authorization_role_rules').select('module,action').eq('role', role).eq('allowed', true);
      if (error) throw error;
      const { data: overrides } = existingUserId
        ? await admin.from('authorization_user_rules').select('module,action').eq('user_id', existingUserId).eq('effect', 'allow')
        : { data: [] };
      const requested = [...(grants || []), ...(overrides || [])].filter((grant, index, values) => values.findIndex(value => value.module === grant.module && value.action === grant.action) === index);
      for (const grant of requested) {
        const { data: actorDecision, error: accessError } = await admin.rpc('resolve_access_for_user', {
          p_user_id: actor.id, p_module: grant.module, p_action: grant.action, p_record_ou: null,
        });
        if (accessError) throw accessError;
        if (!actorDecision?.[0]?.allowed) throw new Error(`You cannot grant ${grant.module}.${grant.action}, which you do not hold.`);
      }
    };

    const syncWorkflowAssignments = async (profileUserId: number, profile: any) => {
      const modules = [
        'Subprojects',
        'Activities',
        'Program Management - Office Requirements',
        'Program Management - Staffing Requirements',
        'Program Management - Other Program Expenses',
      ];
      if (!profile.requires_approver || !profile.approver_id) {
        const { error } = await admin.from('workflow_assignments').update({ active: false, updated_at: new Date().toISOString() }).eq('submitter_user_id', profileUserId).in('module', modules);
        if (error) throw error;
        return;
      }
      const rows: any[] = [];
      for (const module of modules) {
        const { data: decision, error: decisionError } = await admin.rpc('resolve_access_for_user', {
          p_user_id: Number(profile.approver_id),
          p_module: module,
          p_action: 'approve',
          p_record_ou: profile.operatingUnit || null,
        });
        if (decisionError) throw decisionError;
        if (decision?.[0]?.allowed) {
          rows.push({ submitter_user_id: profileUserId, approver_user_id: Number(profile.approver_id), module, active: true, created_by: actor.id, updated_at: new Date().toISOString() });
        } else {
          const { error: deactivateError } = await admin.from('workflow_assignments')
            .update({ active: false, updated_at: new Date().toISOString() })
            .eq('submitter_user_id', profileUserId).eq('module', module);
          if (deactivateError) throw deactivateError;
        }
      }
      if (rows.length) {
        const { error } = await admin.from('workflow_assignments').upsert(rows, { onConflict: 'submitter_user_id,module' });
        if (error) throw error;
      }
    };

    const audit = async (eventAction: string, targetUserId: number | null, beforeState: unknown, afterState: unknown) => {
      const { data: policy } = await admin.from('authorization_policy').select('policy_version').eq('singleton', true).single();
      const { error: auditError } = await admin.from('authorization_audit_events').insert({
        actor_user_id: actor.id, actor_auth_id: actor.auth_id, actor_role: actor.role,
        module: 'Settings - User Management', action: eventAction, target_type: 'user',
        target_id: targetUserId ? String(targetUserId) : null, before_state: beforeState,
        after_state: afterState, policy_version: policy?.policy_version || 0, outcome: 'allowed',
      });
      if (auditError) throw auditError;
    };

    if (action === 'invite') {
      const profile = body.profile || {};
      const email = String(profile.email || '').trim().toLowerCase();
      const username = String(profile.username || '').trim();
      const fullName = String(profile.fullName || '').trim();
      if (!email || !username || !fullName || !profile.role || !profile.operatingUnit) {
        return json({ error: 'Display name, username, email, role, and operating unit are required.' }, 400);
      }
      if (profile.role === 'Super Admin' && !actorIsSuper) return json({ error: 'Only Super Admin may create another Super Admin.' }, 403);
      await assertCanGrantRole(profile.role);
      const { data: existingProfile, error: existingProfileError } = await admin.from('users').select('id').ilike('email', email).maybeSingle();
      if (existingProfileError) throw new Error('Unable to validate the existing application profile.');
      if (existingProfile) return json({ error: 'A user with this email already exists.' }, 409);
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, username, role: profile.role, operatingUnit: profile.operatingUnit },
        redirectTo: env('SITE_URL') || undefined,
      });
      if (error) throw error;
      const { data: saved, error: saveError } = await admin.from('users').update({
        username,
        'fullName': fullName,
        role: profile.role,
        'operatingUnit': profile.operatingUnit,
        visibility_scope: profile.visibility_scope || 'Own OU',
        requires_approver: Boolean(profile.requires_approver),
        approver_id: profile.requires_approver ? profile.approver_id || null : null,
        is_active: true,
        password_reset_required: true,
      }).eq('auth_id', invited.user.id).select('*').single();
      if (saveError) throw new Error('Application profile synchronization failed.');
      await syncWorkflowAssignments(saved.id, profile);
      await audit('manage_users', saved.id, null, { role: saved.role, operatingUnit: saved.operatingUnit, active: saved.is_active });
      return json({ user: saved, message: 'Invitation sent.' });
    }

    if (!target) return json({ error: 'User not found.' }, 404);

    if (action === 'update') {
      const profile = body.profile || {};
      if (profile.role === 'Super Admin' && !actorIsSuper) return json({ error: 'Only Super Admin may assign the Super Admin role.' }, 403);
      await assertCanGrantRole(profile.role, target.id);
      if (!actorIsSuper && actor.role === 'Administrator' && profile.role === 'Administrator' && target.role !== 'Administrator') {
        return json({ error: 'Administrator cannot grant peer administrative authority.' }, 403);
      }
      if (target.auth_id && profile.email && profile.email !== target.email) {
        const { error } = await admin.auth.admin.updateUserById(target.auth_id, { email: profile.email });
        if (error) throw error;
      }
      const { data: saved, error } = await admin.from('users').update({
        email: profile.email,
        username: profile.username,
        'fullName': profile.fullName,
        role: profile.role,
        'operatingUnit': profile.operatingUnit,
        visibility_scope: profile.visibility_scope || 'Own OU',
        requires_approver: Boolean(profile.requires_approver),
        approver_id: profile.requires_approver ? profile.approver_id || null : null,
        permission_version: Number(target.permission_version || 1) + 1,
      }).eq('id', target.id).select('*').single();
      if (error) throw error;
      await syncWorkflowAssignments(saved.id, profile);
      await audit('manage_users', saved.id, { role: target.role, operatingUnit: target.operatingUnit, active: target.is_active }, { role: saved.role, operatingUnit: saved.operatingUnit, active: saved.is_active });
      return json({ user: saved, message: 'User updated.' });
    }

    if (action === 'deactivate') {
      if (target.role === 'Super Admin') {
        const { count } = await admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'Super Admin').eq('is_active', true);
        if ((count || 0) <= 1) return json({ error: 'The last active Super Admin cannot be deactivated.' }, 409);
      }
      if (target.auth_id) await admin.auth.admin.updateUserById(target.auth_id, { ban_duration: '876000h' });
      const { data: saved, error } = await admin.from('users').update({ is_active: false, deactivated_at: new Date().toISOString(), approver_id: null, permission_version: Number(target.permission_version || 1) + 1 }).eq('id', target.id).select('*').single();
      if (error) throw error;
      await admin.from('workflow_assignments').update({ active: false }).or(`submitter_user_id.eq.${target.id},approver_user_id.eq.${target.id}`);
      await audit('manage_users', saved.id, { active: true }, { active: false });
      return json({ user: saved, message: 'User deactivated.' });
    }

    if (action === 'reactivate') {
      if (target.auth_id) await admin.auth.admin.updateUserById(target.auth_id, { ban_duration: 'none' });
      const { data: saved, error } = await admin.from('users').update({ is_active: true, deactivated_at: null, permission_version: Number(target.permission_version || 1) + 1 }).eq('id', target.id).select('*').single();
      if (error) throw error;
      await audit('manage_users', saved.id, { active: false }, { active: true });
      return json({ user: saved, message: 'User reactivated.' });
    }

    if (action === 'send_reset') {
      const { error } = await actorClient.auth.resetPasswordForEmail(target.email, { redirectTo: env('SITE_URL') || undefined });
      if (error) throw error;
      return json({ message: 'Password reset sent.' });
    }

    return json({ error: 'Unsupported user administration action.' }, 400);
  } catch (error) {
    return json({ error: safeErrorMessage(error) }, 400);
  }
});
