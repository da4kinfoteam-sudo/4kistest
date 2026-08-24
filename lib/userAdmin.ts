import { supabase } from '../supabaseClient';
import type { User, UserRole, VisibilityScope } from '../constants';

export type UserAdminRequest =
  | { action: 'invite'; profile: { email: string; username: string; fullName: string; role: UserRole; operatingUnit: string; visibility_scope?: VisibilityScope; requires_approver?: boolean; approver_id?: number | null } }
  | { action: 'update'; userId: number; profile: { email: string; username: string; fullName: string; role: UserRole; operatingUnit: string; visibility_scope?: VisibilityScope; requires_approver?: boolean; approver_id?: number | null } }
  | { action: 'deactivate' | 'reactivate' | 'send_reset'; userId: number };

export async function invokeUserAdmin(request: UserAdminRequest): Promise<{ user?: User; message: string }> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('user-admin', { body: request });
  if (error) throw new Error(error.message || 'User administration request failed.');
  if (data?.error) throw new Error(data.error);
  return data;
}
