import { supabase } from '../supabaseClient';
import type { WorkflowStatus } from '../constants';

export type WorkflowEntityType = 'subprojects' | 'activities' | 'office_requirements' | 'staffing_requirements' | 'other_program_expenses';
export type WorkflowTransition = 'submit' | 'resubmit' | 'withdraw' | 'approve' | 'reject';

export async function transitionWorkflow(entityType: WorkflowEntityType, entityId: number, transition: WorkflowTransition, reason?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('transition_workflow', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_transition: transition,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data as { workflow_status: WorkflowStatus; revision_number: number };
}

export async function beginWorkflowRevision(entityType: WorkflowEntityType, entityId: number, reason?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('begin_workflow_revision', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data as { workflow_status: WorkflowStatus; revision_number: number };
}

export async function transitionItemStatus(entityType: WorkflowEntityType, entityId: number, newStatus: string, reason?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('transition_item_status', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_new_status: newStatus,
    p_reason: reason || null,
  });
  if (error) throw error;
  return data as { status: string };
}

export const isWorkflowEditable = (status: WorkflowStatus | undefined, isSubmitter: boolean, isSuperAdmin: boolean) => {
  if (isSuperAdmin) return true;
  const normalized = status || 'DRAFT';
  if (normalized === 'PENDING') return false;
  if (normalized === 'DRAFT' || normalized === 'REJECTED') return isSubmitter;
  return normalized === 'APPROVED';
};
