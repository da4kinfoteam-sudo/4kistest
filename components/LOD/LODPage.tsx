// Author: 4K
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Settings2, Upload, X } from 'lucide-react';
import { IPO, LodAssessment, operatingUnits, ouToRegionMap, philippineRegions } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { DataTablePagination, KpiCard, LoadingState, SortableTableHeader } from '../ui/enterprise';
import { ColumnFilterDialog, MajorTableToolbar, TableColumnFilters, TruncatedTableCell } from '../ui/MajorDataTable';
import { getLodEffectiveState, LodEffectiveStateKind } from '../../lib/lodScoring';
import { notifyLodDataChanged, subscribeToLodDataChanges } from '../../lib/lodDataSync';
import { buildLodAdminStateRows, LodAdminOverrideSelection, LodOverrideSource } from '../../lib/lodOverrides';

interface LODPageProps {
    onSelectIpo: (ipo: IPO, year?: number) => void;
}

interface LodListFilters {
    search: string;
    ou: string;
    region: string;
    year: number;
    effectiveState: string;
    sortKey: string;
    sortDirection: 'ascending' | 'descending';
    page: number;
    pageSize: number;
}

interface ImportResultRow {
    ipoId: number | null;
    year: number | null;
    status: 'Applied' | 'Rejected';
    message: string;
}

interface LodControllerSettings {
    year: number;
    bulkSelection: boolean;
    inlineEditing: boolean;
    defaultReason: string;
}

interface LodOverrideDialogState {
    ipoIds: number[];
    source: LodOverrideSource;
    selection: LodAdminOverrideSelection | '';
    reason: string;
}

type SortConfig = { key: string; direction: 'ascending' | 'descending' } | null;

const DEFAULT_FILTERS: LodListFilters = {
    search: '',
    ou: '',
    region: '',
    year: new Date().getFullYear(),
    effectiveState: '',
    sortKey: 'name',
    sortDirection: 'ascending',
    page: 1,
    pageSize: 10,
};

const STATE_FILTERS = [
    'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5',
    'Incomplete', 'For Assessment', 'Dropped',
];

const STATE_SORT_ORDER: Record<LodEffectiveStateKind, number> = {
    dropped: 0,
    'for-assessment': 1,
    incomplete: 2,
    'carried-over': 3,
    computed: 4,
    manual: 5,
};

const regionToOu = new Map(Object.entries(ouToRegionMap).map(([ou, region]) => [region, ou]));
const LOD_ASSESSMENT_PAGE_SIZE = 500;
const LOD_IPO_ID_BATCH_SIZE = 100;
const LOD_ASSESSMENT_LIST_FIELDS = 'id,ipo_id,year,total_score,computed_level,manual_level,manual_override_reason,is_carried_over,is_dropped,is_complete,answered_question_count,required_question_count,questionnaire_version_id,carried_over_from_assessment_id,carried_over_from_year,carried_over_level,carried_over_total_score,assessed_by,assessor_name,updated_at';

const getLodListYears = (selectedYear: number) =>
    Array.from({ length: 4 }, (_, index) => selectedYear - index);

const fetchPagedLodAssessments = async (
    selectedYear: number,
    visibleIpoIds?: number[],
): Promise<LodAssessment[]> => {
    if (!supabase) throw new Error('LOD data is unavailable because the database connection is not ready.');

    const years = getLodListYears(selectedYear);
    const minimumYear = Math.min(...years);
    const maximumYear = Math.max(...years);
    const assessmentsById = new Map<number, LodAssessment>();
    const ipoBatches = visibleIpoIds
        ? Array.from({ length: Math.ceil(visibleIpoIds.length / LOD_IPO_ID_BATCH_SIZE) }, (_, index) =>
            visibleIpoIds.slice(index * LOD_IPO_ID_BATCH_SIZE, (index + 1) * LOD_IPO_ID_BATCH_SIZE))
        : [null];

    for (const ipoBatch of ipoBatches) {
        let offset = 0;
        while (true) {
            let query = supabase.from('lod_assessments')
                .select(LOD_ASSESSMENT_LIST_FIELDS)
                .gte('year', minimumYear)
                .lte('year', maximumYear)
                .order('id', { ascending: true })
                .range(offset, offset + LOD_ASSESSMENT_PAGE_SIZE - 1);
            if (ipoBatch) query = query.in('ipo_id', ipoBatch);

            const result = await query;
            if (result.error) throw result.error;

            const page = (result.data || []) as LodAssessment[];
            page.forEach(assessment => assessmentsById.set(Number(assessment.id), assessment));
            if (page.length < LOD_ASSESSMENT_PAGE_SIZE) break;
            offset += LOD_ASSESSMENT_PAGE_SIZE;
        }
    }

    return Array.from(assessmentsById.values()).sort((left, right) => Number(left.id) - Number(right.id));
};

const parseImportedLevel = (value: unknown) => {
    if (value === '' || value === null || value === undefined) return null;
    const match = String(value).match(/[1-5]/);
    return match ? Number(match[0]) : null;
};

const parseImportedBoolean = (value: unknown) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['yes', 'true', '1', 'dropped'].includes(normalized);
};

const parseAdminOverrideSelection = (value: string): LodAdminOverrideSelection | '' => {
    if (value === 'carry-over' || value === 'dropped') return value;
    const level = Number(value);
    return Number.isInteger(level) && level >= 1 && level <= 5 ? level : '';
};

const LODPage: React.FC<LODPageProps> = ({ onSelectIpo }) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const { canManage } = useUserAccess('Level of Development');
    const { logAction } = useLogAction();
    const visibilityScope = getVisibilityScope('Level of Development');
    const ownRegion = currentUser?.operatingUnit ? ouToRegionMap[currentUser.operatingUnit] : '';
    const storageKey = `lod-list-state:${currentUser?.id ?? 'anonymous'}`;
    const [filters, setFilters] = useLocalStorageState<LodListFilters>(storageKey, DEFAULT_FILTERS);
    const [ipos, setIpos] = useState<IPO[]>([]);
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [importReport, setImportReport] = useState<ImportResultRow[] | null>(null);
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    const [isControllerOpen, setIsControllerOpen] = useState(false);
    const [controllerSettings, setControllerSettings] = useState<LodControllerSettings>({
        year: filters.year,
        bulkSelection: false,
        inlineEditing: false,
        defaultReason: '',
    });
    const [controllerDraft, setControllerDraft] = useState<LodControllerSettings>(controllerSettings);
    const [selectedIpoIds, setSelectedIpoIds] = useState<Set<number>>(new Set());
    const [inlineEditingIpoId, setInlineEditingIpoId] = useState<number | null>(null);
    const [overrideDialog, setOverrideDialog] = useState<LodOverrideDialogState | null>(null);
    const [overrideSaving, setOverrideSaving] = useState(false);
    const [overrideFeedback, setOverrideFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pageSelectionRef = useRef<HTMLInputElement>(null);
    const loadSequence = useRef(0);
    const verifiedAssessmentsRef = useRef<Map<string, LodAssessment>>(new Map());

    const updateFilters = (patch: Partial<LodListFilters>, resetPage = false) => {
        setFilters(previous => ({ ...previous, ...patch, ...(resetPage ? { page: 1 } : {}) }));
    };

    const fetchLodData = async () => {
        const sequence = ++loadSequence.current;
        setLoading(true);
        setLoadError('');
        if (!supabase || !currentUser) {
            setLoadError('LOD data is unavailable because the database or user session is not ready.');
            setLoading(false);
            return;
        }
        try {
            let ipoQuery = supabase.from('ipos').select('id,name,location,region').order('name', { ascending: true });
            if (visibilityScope === 'Own OU') {
                if (!ownRegion) throw new Error('Your operating unit is not mapped to an IPO region.');
                ipoQuery = ipoQuery.eq('region', ownRegion);
            }
            const ipoResult = await ipoQuery;
            if (ipoResult.error) throw ipoResult.error;
            const visibleIpos = (ipoResult.data || []) as IPO[];
            const visibleIds = new Set(visibleIpos.map(ipo => Number(ipo.id)));
            const displayYearSet = new Set(getLodListYears(filters.year));
            const fetchedAssessments = visibleIds.size === 0
                ? []
                : (await fetchPagedLodAssessments(
                    filters.year,
                    visibilityScope === 'Own OU' ? Array.from(visibleIds) : undefined,
                ))
                    .filter(assessment => visibleIds.has(Number(assessment.ipo_id)));
            if (sequence !== loadSequence.current) return;

            const completeResult = new Map(fetchedAssessments.map(assessment => [
                `${Number(assessment.ipo_id)}:${Number(assessment.year)}`,
                assessment,
            ]));
            verifiedAssessmentsRef.current.forEach((verified, key) => {
                const remainsInScope = visibleIds.has(Number(verified.ipo_id))
                    && displayYearSet.has(Number(verified.year));
                if (!remainsInScope) {
                    verifiedAssessmentsRef.current.delete(key);
                    return;
                }
                const fetched = completeResult.get(key);
                const fetchedTimestamp = fetched?.updated_at ? new Date(fetched.updated_at).getTime() : 0;
                const verifiedTimestamp = verified.updated_at ? new Date(verified.updated_at).getTime() : 0;
                if (fetched && fetchedTimestamp >= verifiedTimestamp) {
                    verifiedAssessmentsRef.current.delete(key);
                } else {
                    completeResult.set(key, verified);
                }
            });
            setIpos(visibleIpos);
            setAssessments(Array.from(completeResult.values()));
        } catch (error: any) {
            if (sequence !== loadSequence.current) return;
            console.error('LOD list load error:', error);
            setLoadError(error?.message || 'Unable to load Level of Development records.');
        } finally {
            if (sequence === loadSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        fetchLodData();
        const unsubscribe = subscribeToLodDataChanges(detail => {
            const visibleYears = getLodListYears(filters.year);
            if (!detail.year || visibleYears.includes(Number(detail.year))) fetchLodData();
        });
        const refreshOnFocus = () => fetchLodData();
        window.addEventListener('focus', refreshOnFocus);
        return () => {
            unsubscribe();
            window.removeEventListener('focus', refreshOnFocus);
        };
    }, [currentUser?.id, visibilityScope, ownRegion, filters.year]);

    useEffect(() => {
        if (visibilityScope === 'Own OU' && filters.ou !== currentUser?.operatingUnit) {
            updateFilters({ ou: currentUser?.operatingUnit || '', region: ownRegion }, true);
        }
    }, [visibilityScope, currentUser?.operatingUnit, ownRegion]);

    useEffect(() => {
        setControllerSettings(previous => ({ ...previous, year: filters.year }));
    }, [filters.year]);

    const years = useMemo(() => {
        const values = new Set<number>([new Date().getFullYear(), filters.year]);
        assessments.forEach(assessment => values.add(Number(assessment.year)));
        return Array.from(values).filter(Number.isFinite).sort((left, right) => right - left);
    }, [assessments, filters.year]);

    const displayYears = useMemo(() => getLodListYears(filters.year), [filters.year]);
    const assessmentsByIpoYear = useMemo(() => {
        const map = new Map<string, LodAssessment>();
        assessments.forEach(assessment => map.set(`${Number(assessment.ipo_id)}:${Number(assessment.year)}`, assessment));
        return map;
    }, [assessments]);
    const getAssessment = (ipoId: number, year: number) => assessmentsByIpoYear.get(`${ipoId}:${year}`) || null;

    const selectedYearStates = useMemo(() => ipos.map(ipo => ({
        ipo,
        state: getLodEffectiveState(getAssessment(ipo.id, filters.year)),
    })), [ipos, assessmentsByIpoYear, filters.year]);

    const kpis = useMemo(() => ({
        total: selectedYearStates.length,
        assessed: selectedYearStates.filter(item => ['manual', 'computed', 'carried-over'].includes(item.state.kind)).length,
        incomplete: selectedYearStates.filter(item => item.state.kind === 'incomplete').length,
        forAssessment: selectedYearStates.filter(item => item.state.kind === 'for-assessment').length,
    }), [selectedYearStates]);

    const processedIpos = useMemo(() => {
        const query = filters.search.trim().toLowerCase();
        let result = ipos.filter(ipo => {
            const ou = regionToOu.get(ipo.region) || '';
            const state = getLodEffectiveState(getAssessment(ipo.id, filters.year));
            if (visibilityScope === 'Own OU' && ipo.region !== ownRegion) return false;
            if (filters.ou && ou !== filters.ou) return false;
            if (filters.region && ipo.region !== filters.region) return false;
            if (filters.effectiveState && state.label !== filters.effectiveState) return false;
            if (query && ![ipo.name, ipo.location, ipo.region, ou].some(value => String(value || '').toLowerCase().includes(query))) return false;
            return true;
        });

        const sortConfig: SortConfig = filters.sortKey
            ? { key: filters.sortKey, direction: filters.sortDirection }
            : null;
        if (sortConfig) {
            result = result.slice().sort((left, right) => {
                let leftValue: string | number = '';
                let rightValue: string | number = '';
                if (sortConfig.key === 'name') {
                    leftValue = left.name;
                    rightValue = right.name;
                } else if (sortConfig.key === 'region') {
                    leftValue = left.region;
                    rightValue = right.region;
                } else if (sortConfig.key.startsWith('year:')) {
                    const year = Number(sortConfig.key.split(':')[1]);
                    const leftState = getLodEffectiveState(getAssessment(left.id, year));
                    const rightState = getLodEffectiveState(getAssessment(right.id, year));
                    leftValue = leftState.level ?? STATE_SORT_ORDER[leftState.kind];
                    rightValue = rightState.level ?? STATE_SORT_ORDER[rightState.kind];
                }
                const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
                    ? leftValue - rightValue
                    : String(leftValue).localeCompare(String(rightValue));
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return result;
    }, [ipos, assessmentsByIpoYear, filters, visibilityScope, ownRegion]);

    const totalPages = Math.max(1, Math.ceil(processedIpos.length / filters.pageSize));
    const currentPage = Math.min(Math.max(filters.page, 1), totalPages);
    const paginatedIpos = processedIpos.slice((currentPage - 1) * filters.pageSize, currentPage * filters.pageSize);
    const selectedOnPage = paginatedIpos.filter(ipo => selectedIpoIds.has(Number(ipo.id))).length;

    useEffect(() => {
        if (filters.page !== currentPage) updateFilters({ page: currentPage });
    }, [currentPage, filters.page]);

    useEffect(() => {
        setSelectedIpoIds(new Set());
        setInlineEditingIpoId(null);
    }, [controllerSettings.year, filters.search, filters.ou, filters.region, filters.effectiveState, filters.year, filters.pageSize]);

    useEffect(() => {
        if (!pageSelectionRef.current) return;
        pageSelectionRef.current.indeterminate = selectedOnPage > 0 && selectedOnPage < paginatedIpos.length;
    }, [selectedOnPage, paginatedIpos.length]);

    useEffect(() => {
        if (isSuperAdmin) return;
        setControllerSettings(previous => ({ ...previous, bulkSelection: false, inlineEditing: false }));
        setSelectedIpoIds(new Set());
        setInlineEditingIpoId(null);
    }, [isSuperAdmin]);

    const requestSort = (key: string) => updateFilters({
        sortKey: key,
        sortDirection: filters.sortKey === key && filters.sortDirection === 'ascending' ? 'descending' : 'ascending',
    });

    const openController = () => {
        const next = {
            ...controllerSettings,
            year: filters.year,
        };
        setControllerDraft(next);
        setIsControllerOpen(true);
    };

    const saveController = () => {
        setControllerSettings(controllerDraft);
        if (!controllerDraft.bulkSelection) setSelectedIpoIds(new Set());
        if (!controllerDraft.inlineEditing) setInlineEditingIpoId(null);
        setIsControllerOpen(false);
    };

    const toggleIpoSelection = (ipoId: number) => {
        setSelectedIpoIds(previous => {
            const next = new Set(previous);
            if (next.has(ipoId)) next.delete(ipoId);
            else next.add(ipoId);
            return next;
        });
    };

    const toggleCurrentPageSelection = () => {
        const selectPage = selectedOnPage !== paginatedIpos.length;
        setSelectedIpoIds(previous => {
            const next = new Set(previous);
            paginatedIpos.forEach(ipo => selectPage ? next.add(Number(ipo.id)) : next.delete(Number(ipo.id)));
            return next;
        });
    };

    const openOverrideDialog = (ipoIds: number[], source: LodOverrideSource, selection: LodAdminOverrideSelection | '' = '') => {
        if (!isSuperAdmin || ipoIds.length === 0) return;
        setOverrideFeedback(null);
        setOverrideDialog({ ipoIds, source, selection, reason: controllerSettings.defaultReason });
    };

    const applyManualOverrides = async () => {
        if (!isSuperAdmin || !overrideDialog || !supabase || !currentUser) return;
        setOverrideSaving(true);
        setOverrideFeedback(null);
        try {
            const rows = buildLodAdminStateRows(overrideDialog.ipoIds.map(ipoId => ({
                ipoId,
                year: controllerSettings.year,
                selection: overrideDialog.selection as LodAdminOverrideSelection,
                reason: overrideDialog.reason,
            })));
            const result = await supabase.rpc('save_lod_manual_overrides', {
                p_rows: rows,
                p_actor_id: currentUser.id,
                p_actor_name: currentUser.fullName || currentUser.email,
                p_source: overrideDialog.source,
            });
            if (result.error) throw result.error;
            const verification = await supabase.from('lod_assessments')
                .select('id,ipo_id,year,total_score,computed_level,manual_level,manual_override_reason,is_carried_over,is_dropped,is_complete,answered_question_count,required_question_count,questionnaire_version_id,carried_over_from_assessment_id,carried_over_from_year,carried_over_level,carried_over_total_score,assessed_by,assessor_name,updated_at')
                .eq('year', controllerSettings.year)
                .in('ipo_id', overrideDialog.ipoIds);
            if (verification.error) throw verification.error;
            const verifiedRows = (verification.data || []) as LodAssessment[];
            if (verifiedRows.length !== rows.length) {
                throw new Error(`Only ${verifiedRows.length} of ${rows.length} saved LOD records could be verified.`);
            }
            rows.forEach(row => {
                const persisted = verifiedRows.find(item => Number(item.ipo_id) === row.ipo_id && Number(item.year) === row.year);
                if (!persisted) throw new Error(`The saved LOD for IPO ${row.ipo_id} and ${row.year} could not be verified.`);
                const state = getLodEffectiveState(persisted);
                if (row.action === 'manual' && (state.kind !== 'manual' || state.level !== row.manual_level)) {
                    throw new Error(`The Level ${row.manual_level} override for IPO ${row.ipo_id} was not persisted.`);
                }
                if (row.action === 'carry-over' && state.kind !== 'carried-over') {
                    throw new Error(`The carry-over state for IPO ${row.ipo_id} was not persisted.`);
                }
                if (row.action === 'dropped' && state.kind !== 'dropped') {
                    throw new Error(`The dropped state for IPO ${row.ipo_id} was not persisted.`);
                }
            });
            setAssessments(previous => {
                const merged = new Map(previous.map(item => [`${Number(item.ipo_id)}:${Number(item.year)}`, item]));
                verifiedRows.forEach(item => {
                    const key = `${Number(item.ipo_id)}:${Number(item.year)}`;
                    verifiedAssessmentsRef.current.set(key, item);
                    merged.set(key, item);
                });
                return Array.from(merged.values());
            });
            notifyLodDataChanged({ year: controllerSettings.year, reason: 'override' });
            setSelectedIpoIds(new Set());
            setInlineEditingIpoId(null);
            setOverrideDialog(null);
            setOverrideFeedback({
                type: 'success',
                message: `${verifiedRows.length} ${verifiedRows.length === 1 ? 'LOD change was' : 'LOD changes were'} saved for ${controllerSettings.year}.`,
            });
        } catch (error: any) {
            setOverrideFeedback({ type: 'error', message: error?.message || 'The LOD override transaction failed. No changes were applied.' });
        } finally {
            setOverrideSaving(false);
        }
    };

    const handleApplyFilters = (values: TableColumnFilters) => {
        const requestedOu = values.ou?.[0] || '';
        const nextOu = visibilityScope === 'Own OU' ? currentUser?.operatingUnit || '' : requestedOu;
        updateFilters({
            ou: nextOu,
            region: visibilityScope === 'Own OU' ? ownRegion : values.region?.[0] || '',
            year: Number(values.year?.[0] || filters.year),
            effectiveState: values.effectiveState?.[0] || '',
        }, true);
    };

    const dialogFilters: TableColumnFilters = {
        ...(filters.ou ? { ou: [filters.ou] } : {}),
        ...(filters.region ? { region: [filters.region] } : {}),
        year: [String(filters.year)],
        ...(filters.effectiveState ? { effectiveState: [filters.effectiveState] } : {}),
    };
    const filterFields = [
        ...(visibilityScope === 'All' ? [{ key: 'ou', label: 'Operating Unit', values: operatingUnits }] : []),
        { key: 'region', label: 'Region', values: visibilityScope === 'Own OU' ? [ownRegion].filter(Boolean) : philippineRegions },
        { key: 'year', label: 'Assessment Year', values: years.map(String) },
        { key: 'effectiveState', label: 'Effective State', values: STATE_FILTERS },
    ];
    const activeFilterCount = [filters.ou, filters.region, filters.effectiveState, filters.year !== new Date().getFullYear() ? String(filters.year) : ''].filter(Boolean).length;

    const handleExport = () => {
        if (!canManage) return;
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            setLoadError('Excel library not loaded. Please refresh the page.');
            return;
        }
        const exportYears = years.slice().sort((left, right) => left - right);
        const rows = processedIpos.map(ipo => {
            const row: Record<string, string | number> = { ID: ipo.id, 'IPO Name': ipo.name, Region: ipo.region };
            exportYears.forEach(year => {
                const assessment = getAssessment(ipo.id, year);
                row[`${year} Display`] = getLodEffectiveState(assessment).label;
                row[`${year} Manual Override`] = assessment?.manual_level ?? '';
                row[`${year} Dropped`] = assessment?.is_dropped ? 'Yes' : 'No';
            });
            return row;
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'LOD Import and Summary');
        XLSX.writeFile(workbook, `LOD_Assessments_${filters.year}.xlsx`);
        logAction('Exported LOD Data', `Count: ${processedIpos.length}; Year: ${filters.year}`);
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!canManage || !supabase) return;
        const file = event.target.files?.[0];
        const XLSX = (window as any).XLSX;
        if (!file || !XLSX) return;
        setLoading(true);
        setLoadError('');
        try {
            const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
            const headerRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, blankrows: false }) as unknown[][];
            const headers = (headerRows[0] || []).map(String);
            const detectedYears = Array.from(new Set(headers.map(header => header.match(/^(\d{4})(?:\s+(?:Display|Manual Override|Dropped))?$/)?.[1]).filter(Boolean).map(Number)));
            const visibleIpoIds = new Set(ipos.map(ipo => Number(ipo.id)));
            const payload: Array<{ ipo_id: number; year: number; manual_level: number | null; manual_override_reason: string | null; is_dropped: boolean }> = [];
            const validation: ImportResultRow[] = [];
            const seen = new Set<string>();

            rows.forEach((row, rowIndex) => {
                const ipoId = Number(row.ID);
                if (!Number.isInteger(ipoId) || !visibleIpoIds.has(ipoId)) {
                    validation.push({ ipoId: Number.isFinite(ipoId) ? ipoId : null, year: null, status: 'Rejected', message: `Row ${rowIndex + 2}: IPO ID is invalid or outside your LOD visibility scope.` });
                    return;
                }
                detectedYears.forEach(year => {
                    const manualHeader = `${year} Manual Override`;
                    const droppedHeader = `${year} Dropped`;
                    const hasAdminColumns = headers.includes(manualHeader) || headers.includes(droppedHeader);
                    const manualLevel = parseImportedLevel(hasAdminColumns ? row[manualHeader] : row[String(year)]);
                    const dropped = headers.includes(droppedHeader) ? parseImportedBoolean(row[droppedHeader]) : Boolean(getAssessment(ipoId, year)?.is_dropped);
                    if (!getAssessment(ipoId, year) && manualLevel === null && !dropped) return;
                    const key = `${ipoId}:${year}`;
                    if (seen.has(key)) {
                        validation.push({ ipoId, year, status: 'Rejected', message: `Duplicate IPO/year entry at row ${rowIndex + 2}.` });
                        return;
                    }
                    seen.add(key);
                    payload.push({
                        ipo_id: ipoId,
                        year,
                        manual_level: manualLevel,
                        manual_override_reason: manualLevel === null ? null : `Imported by ${currentUser?.fullName || currentUser?.email || 'LOD manager'}`,
                        is_dropped: dropped,
                    });
                });
            });

            if (rows.length === 0) validation.push({ ipoId: null, year: null, status: 'Rejected', message: 'The workbook has no data rows.' });
            if (detectedYears.length === 0) validation.push({ ipoId: null, year: null, status: 'Rejected', message: 'No assessment-year columns were found.' });
            if (rows.length > 0 && detectedYears.length > 0 && payload.length === 0) validation.push({ ipoId: null, year: null, status: 'Rejected', message: 'The workbook contains no override or dropped-state changes to apply.' });
            if (validation.length > 0) {
                setImportReport(validation);
                setLoadError('The workbook was not applied. Correct every rejected row and import it again.');
                return;
            }

            const result = await supabase.rpc('bulk_save_lod_admin_states', {
                p_rows: payload,
                p_assessed_by: currentUser?.id ?? null,
                p_assessor_name: currentUser?.fullName || currentUser?.email || null,
            });
            if (result.error) throw result.error;
            setImportReport(payload.map(row => ({ ipoId: row.ipo_id, year: row.year, status: 'Applied', message: 'Validated and saved.' })));
            await fetchLodData();
            notifyLodDataChanged({ reason: 'import' });
            logAction('Imported LOD Data', `Rows: ${payload.length}`);
        } catch (error: any) {
            console.error('LOD import error:', error);
            setLoadError(error?.message || 'Unable to import the LOD workbook. No rows were applied.');
            setImportReport([{ ipoId: null, year: null, status: 'Rejected', message: error?.message || 'The import transaction failed.' }]);
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="data-list-page lod-list-page">
            <ColumnFilterDialog
                open={isFilterOpen}
                title="Filter Level of Development"
                fields={filterFields}
                filters={dialogFilters}
                onApply={handleApplyFilters}
                onClose={() => setIsFilterOpen(false)}
            />

            <header className="data-list-header lod-list-header">
                <h2 className="data-list-title">Level of Development</h2>
                {canManage && (
                    <div className="data-list-header__actions">
                        <button type="button" onClick={handleExport} className="btn btn-secondary"><Download aria-hidden="true" /> Export / Template</button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-primary"><Upload aria-hidden="true" /> Import</button>
                        <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImport} />
                    </div>
                )}
            </header>

            <section className="lod-list-kpis" aria-label={`LOD summary for ${filters.year}`}>
                <KpiCard label="Total IPOs" value={kpis.total} supporting="Enrolled in LOD cycle" />
                <KpiCard label={`Assessed (${filters.year})`} value={kpis.assessed} supporting={kpis.total ? `${Math.round((kpis.assessed / kpis.total) * 100)}% of enrolled` : 'No IPO data'} />
                <KpiCard label="Incomplete" value={kpis.incomplete} supporting="Questionnaire unfinished" />
                <KpiCard label="For Assessment" value={kpis.forAssessment} supporting="Not yet started" />
            </section>

            <div className="data-table-card major-table-card lod-list-table-card">
                <MajorTableToolbar
                    searchTerm={filters.search}
                    onSearchChange={value => updateFilters({ search: value }, true)}
                    searchPlaceholder="Search IPOs by name or region..."
                    activeFilterCount={activeFilterCount}
                    onOpenFilters={() => setIsFilterOpen(true)}
                    filterActions={isSuperAdmin ? (
                        <button type="button" className="btn btn-secondary" onClick={openController}>
                            <Settings2 aria-hidden="true" /> Super Admin Controls
                        </button>
                    ) : undefined}
                />

                {loadError && <div className="notice notice--error" role="alert"><p>{loadError}</p></div>}
                {overrideFeedback && (
                    <div className={`notice notice--${overrideFeedback.type}`} role="status">
                        <p>{overrideFeedback.message}</p>
                    </div>
                )}
                {isSuperAdmin && controllerSettings.bulkSelection && selectedIpoIds.size > 0 && (
                    <div className="lod-bulk-action-bar" role="region" aria-label="LOD bulk actions">
                        <span><strong>{selectedIpoIds.size}</strong> selected</span>
                        <div>
                            <button type="button" className="btn btn-secondary" onClick={() => setSelectedIpoIds(new Set())}>Clear selection</button>
                            <button type="button" className="btn btn-primary" onClick={() => openOverrideDialog(Array.from(selectedIpoIds), 'lod_list_bulk')}>Set LOD</button>
                        </div>
                    </div>
                )}
                {loading ? (
                    <LoadingState title="Loading assessments" message="Preparing Level of Development records." />
                ) : (
                    <>
                        <div className="data-table-scroll">
                            <table className="data-table lod-major-table">
                                <thead><tr>
                                    {isSuperAdmin && controllerSettings.bulkSelection && (
                                        <th className="lod-selection-column">
                                            <input
                                                ref={pageSelectionRef}
                                                type="checkbox"
                                                className="form-checkbox"
                                                checked={paginatedIpos.length > 0 && selectedOnPage === paginatedIpos.length}
                                                onChange={toggleCurrentPageSelection}
                                                aria-label="Select IPOs on this page"
                                            />
                                        </th>
                                    )}
                                    <SortableTableHeader label="IPO Name" columnKey="name" sortConfig={{ key: filters.sortKey, direction: filters.sortDirection }} onSort={requestSort} />
                                    <SortableTableHeader label="Region" columnKey="region" sortConfig={{ key: filters.sortKey, direction: filters.sortDirection }} onSort={requestSort} />
                                    {displayYears.map(year => <SortableTableHeader key={year} label={String(year)} columnKey={`year:${year}`} sortConfig={{ key: filters.sortKey, direction: filters.sortDirection }} onSort={requestSort} className="data-table__numeric" />)}
                                </tr></thead>
                                <tbody>
                                    {paginatedIpos.map(ipo => (
                                        <tr key={ipo.id} className="data-table__row--interactive" onClick={() => onSelectIpo(ipo, filters.year)}>
                                            {isSuperAdmin && controllerSettings.bulkSelection && (
                                                <td className="lod-selection-column" onClick={event => event.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="form-checkbox"
                                                        checked={selectedIpoIds.has(Number(ipo.id))}
                                                        onChange={() => toggleIpoSelection(Number(ipo.id))}
                                                        aria-label={`Select ${ipo.name}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="data-table__cell--primary"><TruncatedTableCell value={ipo.name} /></td>
                                            <td><TruncatedTableCell value={ipo.region} /></td>
                                            {displayYears.map(year => {
                                                const state = getLodEffectiveState(getAssessment(ipo.id, year));
                                                const canInlineEdit = isSuperAdmin && controllerSettings.inlineEditing && controllerSettings.year === year;
                                                return (
                                                    <td key={year} className="data-table__numeric" onClick={event => event.stopPropagation()}>
                                                        {canInlineEdit && inlineEditingIpoId === Number(ipo.id) ? (
                                                            <select
                                                                autoFocus
                                                                className="form-control lod-inline-level-select"
                                                                value={state.kind === 'dropped' ? 'dropped' : state.kind === 'carried-over' ? 'carry-over' : state.level ?? ''}
                                                                onBlur={() => setInlineEditingIpoId(null)}
                                                                onChange={event => {
                                                                    const selection = parseAdminOverrideSelection(event.target.value);
                                                                    setInlineEditingIpoId(null);
                                                                    if (selection !== '') openOverrideDialog([Number(ipo.id)], 'lod_list_inline', selection);
                                                                }}
                                                                aria-label={`Set ${ipo.name} LOD for ${year}`}
                                                            >
                                                                <option value="">Select state</option>
                                                                {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>Level {level}</option>)}
                                                                <option value="carry-over">Carry Over</option>
                                                                <option value="dropped">Dropped</option>
                                                            </select>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className={`lod-assessment-link ${canInlineEdit ? 'is-inline-editable' : ''}`}
                                                                onClick={() => canInlineEdit ? setInlineEditingIpoId(Number(ipo.id)) : onSelectIpo(ipo, year)}
                                                                aria-label={canInlineEdit ? `Edit ${ipo.name} LOD for ${year}` : `Open ${ipo.name} assessment for ${year}`}
                                                            >
                                                                {state.label}
                                                            </button>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {paginatedIpos.length === 0 && <tr><td className="data-table__empty-cell" colSpan={displayYears.length + 2 + (isSuperAdmin && controllerSettings.bulkSelection ? 1 : 0)}>No IPOs match the current LOD filters.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={processedIpos.length}
                            itemsPerPage={filters.pageSize}
                            onPageChange={page => updateFilters({ page })}
                            onItemsPerPageChange={pageSize => updateFilters({ pageSize }, true)}
                            pageSizeOptions={[10, 20, 50, 100]}
                        />
                    </>
                )}
            </div>

            {isControllerOpen && isSuperAdmin && (
                <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsControllerOpen(false)}>
                    <section className="modal-card lod-controller-modal" role="dialog" aria-modal="true" aria-labelledby="lod-controller-title" onMouseDown={event => event.stopPropagation()}>
                        <header className="modal-card__header">
                            <div><h3 id="lod-controller-title">Super Admin Controls</h3><p>Configure manual LOD editing for this table.</p></div>
                            <button type="button" className="modal-card__close" onClick={() => setIsControllerOpen(false)} aria-label="Close Super Admin controls"><X aria-hidden="true" /></button>
                        </header>
                        <div className="modal-card__body lod-controller-form">
                            <label className="form-field">
                                <span className="form-label">Override year</span>
                                <select className="form-control" value={controllerDraft.year} onChange={event => setControllerDraft(previous => ({ ...previous, year: Number(event.target.value) }))}>
                                    {displayYears.map(year => <option key={year} value={year}>{year}</option>)}
                                </select>
                            </label>
                            <label className="lod-controller-toggle">
                                <span><strong>Enable bulk selection</strong><small>Select IPOs and apply one manual level.</small></span>
                                <input type="checkbox" className="form-checkbox" checked={controllerDraft.bulkSelection} onChange={event => setControllerDraft(previous => ({ ...previous, bulkSelection: event.target.checked }))} />
                            </label>
                            <label className="lod-controller-toggle">
                                <span><strong>Enable inline LOD editing</strong><small>Click a value in the override-year column.</small></span>
                                <input type="checkbox" className="form-checkbox" checked={controllerDraft.inlineEditing} onChange={event => setControllerDraft(previous => ({ ...previous, inlineEditing: event.target.checked }))} />
                            </label>
                            <label className="form-field">
                                <span className="form-label">Default override reason <small>(optional)</small></span>
                                <input className="form-control" type="text" value={controllerDraft.defaultReason} onChange={event => setControllerDraft(previous => ({ ...previous, defaultReason: event.target.value }))} placeholder="Enter a reason to prefill confirmations" />
                            </label>
                            <p className="lod-controller-note">All changes made through these controls are saved as manual overrides.</p>
                        </div>
                        <footer className="modal-card__footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setIsControllerOpen(false)}>Cancel</button>
                            <button type="button" className="btn btn-primary" onClick={saveController}><Check aria-hidden="true" /> Apply controls</button>
                        </footer>
                    </section>
                </div>
            )}

            {overrideDialog && isSuperAdmin && (
                <div className="modal-backdrop" role="presentation" onMouseDown={() => !overrideSaving && setOverrideDialog(null)}>
                    <section className="modal-card lod-override-modal" role="dialog" aria-modal="true" aria-labelledby="lod-override-title" onMouseDown={event => event.stopPropagation()}>
                        <header className="modal-card__header">
                            <div><h3 id="lod-override-title">Apply LOD Administrative State</h3><p>{overrideDialog.ipoIds.length} {overrideDialog.ipoIds.length === 1 ? 'IPO' : 'IPOs'} selected for {controllerSettings.year}</p></div>
                            <button type="button" className="modal-card__close" disabled={overrideSaving} onClick={() => setOverrideDialog(null)} aria-label="Close override confirmation"><X aria-hidden="true" /></button>
                        </header>
                        <div className="modal-card__body lod-override-form">
                            <label className="form-field">
                                <span className="form-label">New LOD state</span>
                                <select className="form-control" value={overrideDialog.selection} onChange={event => setOverrideDialog(previous => previous ? ({ ...previous, selection: parseAdminOverrideSelection(event.target.value) }) : previous)}>
                                    <option value="">Select state</option>
                                    {[1, 2, 3, 4, 5].map(level => <option key={level} value={level}>Level {level}</option>)}
                                    <option value="carry-over">Carry Over</option>
                                    <option value="dropped">Dropped</option>
                                </select>
                            </label>
                            <label className="form-field">
                                <span className="form-label">Override reason</span>
                                <textarea className="form-control" rows={3} value={overrideDialog.reason} onChange={event => setOverrideDialog(previous => previous ? ({ ...previous, reason: event.target.value }) : previous)} placeholder="Required for the audit record" />
                            </label>
                        </div>
                        <footer className="modal-card__footer">
                            <button type="button" className="btn btn-secondary" disabled={overrideSaving} onClick={() => setOverrideDialog(null)}>Cancel</button>
                            <button type="button" className="btn btn-primary" disabled={overrideSaving || overrideDialog.selection === '' || !overrideDialog.reason.trim()} onClick={applyManualOverrides}>
                                {overrideSaving ? 'Applying...' : 'Apply Override'}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {importReport && (
                <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportReport(null)}>
                    <section className="modal-card lod-import-report" role="dialog" aria-modal="true" aria-labelledby="lod-import-report-title" onMouseDown={event => event.stopPropagation()}>
                        <header className="modal-card__header"><h3 id="lod-import-report-title">LOD Import Results</h3><button type="button" className="modal-card__close" onClick={() => setImportReport(null)} aria-label="Close import results"><X aria-hidden="true" /></button></header>
                        <div className="modal-card__body"><div className="data-table-scroll"><table className="data-table"><thead><tr><th>IPO ID</th><th>Year</th><th>Status</th><th>Result</th></tr></thead><tbody>{importReport.map((row, index) => <tr key={`${row.ipoId}:${row.year}:${index}`}><td>{row.ipoId ?? 'N/A'}</td><td>{row.year ?? 'N/A'}</td><td className={row.status === 'Applied' ? 'text-success' : 'text-danger'}>{row.status}</td><td>{row.message}</td></tr>)}</tbody></table></div></div>
                        <footer className="modal-card__footer"><button type="button" className="btn btn-primary" onClick={() => setImportReport(null)}>Close</button></footer>
                    </section>
                </div>
            )}
        </div>
    );
};

export default LODPage;
