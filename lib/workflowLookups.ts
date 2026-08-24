import type { IPO } from '../constants';
import { ouToRegionMap } from '../constants';
import { sampleIPOs } from '../sampleIPOs';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 500;

export interface WorkflowLookupScope {
    canViewAllOperatingUnits: boolean;
    operatingUnit?: string | null;
    region?: string | null;
}

export type WorkflowEntityTable =
    | 'subprojects'
    | 'activities'
    | 'office_requirements'
    | 'staffing_requirements'
    | 'other_program_expenses'
    | 'ipos'
    | 'marketing_partners';

/**
 * Loads IPO choices independently from page-result filters.
 * Supabase RLS is not enabled in this environment, so the in-app OU constraint is
 * applied to every lookup query before records are returned to a workflow.
 */
export const fetchWorkflowIpos = async ({ canViewAllOperatingUnits, operatingUnit }: WorkflowLookupScope): Promise<IPO[]> => {
    if (!supabase) {
        if (canViewAllOperatingUnits) return sampleIPOs;
        const region = operatingUnit ? ouToRegionMap[operatingUnit] : undefined;
        return region ? sampleIPOs.filter(ipo => ipo.region === region) : [];
    }

    const region = !canViewAllOperatingUnits && operatingUnit ? ouToRegionMap[operatingUnit] : undefined;
    if (!canViewAllOperatingUnits && !region) return [];

    const records: IPO[] = [];
    let from = 0;
    while (true) {
        let query = supabase
            .from('ipos')
            .select('*')
            .order('name', { ascending: true });
        if (region) query = query.eq('region', region);
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as IPO[];
        records.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return records;
};

export const fetchWorkflowEntityById = async <T extends { id: number }>(
    tableName: WorkflowEntityTable,
    id: number,
    { canViewAllOperatingUnits, operatingUnit, region }: WorkflowLookupScope
): Promise<T | null> => {
    if (!supabase) return null;
    const usesRegionScope = tableName === 'ipos' || tableName === 'marketing_partners';
    if (!canViewAllOperatingUnits && !(usesRegionScope ? region : operatingUnit)) return null;

    let query = supabase.from(tableName).select('*').eq('id', id);
    // This is the authorization boundary for direct record resolution while RLS is disabled.
    if (!canViewAllOperatingUnits) {
        query = usesRegionScope
            ? query.eq('region', region)
            : query.eq('operatingUnit', operatingUnit);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as T | null) || null;
};
