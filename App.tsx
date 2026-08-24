
// Author: 4K 
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DashboardsPage from './components/DashboardsPage';
import Subprojects from './components/Subprojects';
import { ActivitiesComponent } from './components/Activities';
import IPOs from './components/IPO';
import References, { ReferenceUacs, ReferenceParticular } from './components/References';
import Reports, { ReportTab, ReportsPageState } from './components/Reports';
import SubprojectDetail from './components/SubprojectDetail';
import SubprojectEdit from './components/SubprojectEdit';
import IPODetail from './components/IPODetail';
import { ActivityDetail } from './components/ActivityDetail';
import ActivityMonitoringReportDetail from './components/ActivityMonitoringReportDetail';
import ActivityEdit from './components/ActivityEdit';
import Settings from './components/Settings';
import Login from './components/Login';
import ProgramManagement from './components/ProgramManagement';
import OfficeRequirementDetail from './components/program_management/OfficeRequirementDetail';
import StaffingRequirementDetail from './components/program_management/StaffingRequirementDetail';
import OtherExpenseDetail from './components/program_management/OtherExpenseDetail';
import FinancialAccomplishment from './components/accomplishment/FinancialAccomplishment'; 
import PhysicalAccomplishment from './components/accomplishment/PhysicalAccomplishment'; // Import new component
// Resources Folder Components
import MarketingDatabase from './components/resources/MarketingDatabase';
import MarketProfileDetail from './components/resources/MarketProfileDetail';
import MarketProfileEdit from './components/resources/MarketProfileEdit';
import MarketLinkageEdit from './components/resources/MarketLinkageEdit';
import MarketLinkageDetail from './components/resources/MarketLinkageDetail';
import CommodityMappingPage from './components/resources/CommodityMappingPage';
import LODPage from './components/LOD/LODPage';
import LODDetailsRoute from './components/LOD/LODDetailsRoute';
import GadPimmePage from './components/GAD/GadPimmePage';
import GadPimmeDetailsRoute from './components/GAD/GadPimmeDetailsRoute';
import { buildGadPimmeDetailPath } from './lib/gadPimmeAccess';
import { requestAppNavigation } from './lib/navigationGuards';
import AIChatbot from './components/AIChatbot'; // Import Chatbot
import { EmptyState, ErrorState, LoadingState } from './components/ui/enterprise';

import useLocalStorageState from './hooks/useLocalStorageState';
import { useSupabaseTable } from './hooks/useSupabaseTable'; 
import { supabase } from './supabaseClient'; // Import supabase client
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DcfPolicyProvider } from './contexts/DcfPolicyContext';
import { useDcfPolicyGuard } from './hooks/useDcfPolicyGuard';
import { DataScope, getDataScopeKey, loadScopedAppData } from './lib/scopedDataFetch';
import { clearUserCache, getScopeCacheMeta, readScopedCache, writeScopedCache } from './lib/localScopedCache';
import { normalizeStaffingExpenses } from './lib/staffingExpenseIdentity';
import {
    FINANCIAL_OBLIGATIONS_CHANGED_EVENT,
    type FinancialObligationChange,
} from './lib/financialObligationSync';
import { emptyIpoLinkedDcfRecords, fetchIpoLinkedDcfRecords, IpoLinkedDcfRecords } from './lib/ipoLinkedDcfRecords';
import { fetchWorkflowEntityById, fetchWorkflowIpos } from './lib/workflowLookups';
import {
    getCanonicalModuleRoute,
    getDashboardSourceView,
    getNavigationPageTitle,
    getReportSourceView,
    getReportTabFromSourceView,
    isDashboardPagePath,
    isProgramManagementPagePath,
    isReferencePagePath,
    resolveAppBreadcrumbs,
    resolveAppReturnContext,
    resolveDashboardPage,
    resolveProgramManagementPage,
    resolveReferencePage,
} from './lib/appNavigation';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings,
    Deadline, PlanningSchedule, ReferenceActivity, MarketingPartner, GidaArea, ElcacArea, RefCommodity, RefLivestock, RefEquipment,
    RefInput, RefInfrastructure, RefTrainingReference, ActivityMonitoringAction, ActivityMonitoringReport, operatingUnits, ouToRegionMap
} from './constants';
import {
    sampleActivities, sampleMarketingPartners, sampleOfficeRequirements, sampleOtherProgramExpenses, sampleReferenceUacsList,
    sampleReferenceParticularList, sampleStaffingRequirements, sampleSubprojects, sampleRefCommodities,
    sampleRefLivestock, sampleRefEquipment, sampleRefInputs, sampleRefInfrastructure, sampleRefTrainings,
    sampleGidaAreas, sampleElcacAreas
} from './samples';
import { sampleIPOs } from './sampleIPOs';
import {
    applyTheme,
    getSavedThemePreference,
    getSystemThemePreference,
    resolveThemeMode,
    resolveThemePreference,
    saveThemePreference,
    THEME_STORAGE_KEY,
    ThemeMode,
    ThemePreference
} from './lib/theme';

const parseAppRoute = (fullPath: string) => {
    const normalized = fullPath || '/';
    const [pathPart, queryPart = ''] = normalized.split('?');
    return {
        path: pathPart || '/',
        params: new URLSearchParams(queryPart),
    };
};

const getRouteId = (params: URLSearchParams): number | null => {
    const rawId = params.get('id');
    if (!rawId) return null;
    const id = Number(rawId);
    return Number.isFinite(id) ? id : null;
};

const findByRouteId = <T extends { id: number }>(items: T[], id: number | null): T | undefined => {
    if (id === null) return undefined;
    return items.find(item => item.id === id);
};

const buildDetailPath = (path: string, id?: number | string | null) => {
    if (id === undefined || id === null || id === '') return path;
    return `${path}?id=${encodeURIComponent(String(id))}`;
};

const appendPathParams = (
    path: string,
    values: Array<[string, string | number | null | undefined]>,
) => {
    const [basePath, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    values.forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') params.delete(key);
        else params.set(key, String(value));
    });
    const serialized = params.toString();
    return serialized ? `${basePath}?${serialized}` : basePath;
};

const AccessDenied: React.FC<{ onBackToHome: () => void }> = ({ onBackToHome }) => (
    <ErrorState
        title="403 · Access denied"
        message="Your current role does not have permission to view this page or module."
        action={<button onClick={onBackToHome} className="btn btn-primary">Return to Dashboard</button>}
    />
);

const DetailRouteFallback: React.FC<{
    title: string;
    message: string;
    actionLabel: string;
    onAction: () => void;
}> = ({ title, message, actionLabel, onAction }) => (
    <EmptyState
        title={title}
        message={message}
        action={<button type="button" onClick={onAction} className="btn btn-primary">{actionLabel}</button>}
    />
);

interface NavigationOptions {
    resetReports?: boolean;
}

const createDefaultReportsPageState = (ownOu?: string | null, isLockedToOwnOu = false): ReportsPageState => {
    const currentYear = new Date().getFullYear().toString();
    return {
        activeTab: 'WFP',
        selectedYear: currentYear,
        selectedReportingYear: currentYear,
        selectedOu: isLockedToOwnOu ? (ownOu || 'All') : 'All',
        selectedOus: isLockedToOwnOu ? (ownOu ? [ownOu] : []) : operatingUnits,
        selectedTier: 'Tier 1',
        selectedFundType: 'Current',
        bar1SelectedAsOfDate: '',
        monthlySelectedMonth: new Date().getMonth(),
        detailedSelectedQuarter: 'All',
        financialAuditSearchTerm: '',
        financialAuditSeverityFilter: 'All',
        financialAuditReportFilter: 'All',
        financialAuditSourceFilter: 'All',
        financialAuditIssueTypeFilter: 'All',
        financialAuditAsOfMonth: new Date().getMonth(),
    };
};

const AppContent: React.FC = () => {
    const { currentUser, hasAccess, getVisibilityScope, isAuthReady, refreshUser, refreshUsersList, refreshPermissions } = useAuth();
    const { getStatusDecision } = useDcfPolicyGuard();
    // Initialize Sidebar state based on screen width (Open on Desktop by default)
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => resolveThemePreference());
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveThemeMode(resolveThemePreference()));
    const [currentPage, setCurrentPage] = useState('/');
    const currentRoute = useMemo(() => parseAppRoute(currentPage), [currentPage]);
    const routePath = currentRoute.path;
    const routeParams = currentRoute.params;
    const isDarkMode = themeMode === 'dark';
    const reportsVisibilityScope = getVisibilityScope('Reports');
    const isReportsLockedToOwnOu = reportsVisibilityScope === 'Own OU';
    const [reportsPageState, setReportsPageState] = useState<ReportsPageState>(() =>
        createDefaultReportsPageState(currentUser?.operatingUnit, isReportsLockedToOwnOu)
    );

    // Global Filter State (Triggered by AI or External links)
    const [externalFilters, setExternalFilters] = useState<{ 
        region?: string; 
        year?: string; 
        search?: string;
        status?: string;
        ancestralDomainNo?: string;
    } | null>(null);

    // Callback to clear external filters after they are consumed by a component
    const clearExternalFilters = () => {
        setExternalFilters(null);
    };

    // --- DATA STATE MANAGEMENT ---
    
    // Subprojects, IPOs, Activities use the sync hook
    const scopedTableOptions = { autoFetch: false };
    const [subprojects, setSubprojects, subprojectsSync] = useSupabaseTable<Subproject>('subprojects', sampleSubprojects, scopedTableOptions);
    const [ipos, setIpos, iposSync] = useSupabaseTable<IPO>('ipos', sampleIPOs, scopedTableOptions);
    const [activityWorkflowIpos, setActivityWorkflowIpos] = useState<IPO[]>([]);
    const [subprojectWorkflowIpos, setSubprojectWorkflowIpos] = useState<IPO[]>([]);
    const [activities, setActivities, activitiesSync] = useSupabaseTable<Activity>('activities', sampleActivities, scopedTableOptions);
    const [marketingPartners, setMarketingPartners, marketingPartnersSync] = useSupabaseTable<MarketingPartner>('marketing_partners', sampleMarketingPartners, scopedTableOptions);
    
    // Program Management States - loaded at startup and refreshed manually
    const [officeReqs, setOfficeReqs, officeReqsSync] = useSupabaseTable<OfficeRequirement>('office_requirements', sampleOfficeRequirements, scopedTableOptions);
    const [staffingReqs, setStaffingReqs, staffingReqsSync] = useSupabaseTable<StaffingRequirement>('staffing_requirements', sampleStaffingRequirements, scopedTableOptions);
    const [otherProgramExpenses, setOtherProgramExpenses, otherProgramExpensesSync] = useSupabaseTable<OtherProgramExpense>('other_program_expenses', sampleOtherProgramExpenses, scopedTableOptions);

    useEffect(() => {
        if (!isAuthReady || !currentUser) return;
        let cancelled = false;
        const loadWorkflowLookups = async () => {
            try {
                const [activityIpos, subprojectIpos] = await Promise.all([
                    fetchWorkflowIpos({
                        canViewAllOperatingUnits: getVisibilityScope('Activities') === 'All',
                        operatingUnit: currentUser.operatingUnit
                    }),
                    fetchWorkflowIpos({
                        canViewAllOperatingUnits: getVisibilityScope('Subprojects') === 'All',
                        operatingUnit: currentUser.operatingUnit
                    })
                ]);
                if (!cancelled) {
                    setActivityWorkflowIpos(activityIpos);
                    setSubprojectWorkflowIpos(subprojectIpos);
                }
            } catch (error) {
                console.error('Failed to load permission-scoped workflow IPO lookups:', error);
                if (!cancelled) {
                    setActivityWorkflowIpos([]);
                    setSubprojectWorkflowIpos([]);
                }
            }
        };
        void loadWorkflowLookups();
        return () => { cancelled = true; };
    }, [currentUser, getVisibilityScope, isAuthReady]);

    // Financial Records - loaded at startup and refreshed manually
    const [allFinancialObligations, setAllFinancialObligations, financialObligationsSync] = useSupabaseTable<any>('financial_obligations', [], scopedTableOptions);
    const [allFinancialDisbursements, setAllFinancialDisbursements, financialDisbursementsSync] = useSupabaseTable<any>('financial_disbursements', [], scopedTableOptions);

    useEffect(() => {
        const handleFinancialObligationChange = (event: Event) => {
            const { entityType, parentId, itemId, records } = (event as CustomEvent<FinancialObligationChange>).detail;
            setAllFinancialObligations(previous => [
                ...previous.filter(row => !(
                    row.entity_type === entityType
                    && Number(row.parent_id) === parentId
                    && (row.item_id === null || row.item_id === undefined || row.item_id === '' ? null : String(row.item_id)) === itemId
                )),
                ...records.map(record => ({
                    id: record.id,
                    entity_type: entityType,
                    parent_id: parentId,
                    item_id: itemId,
                    obligation_date: record.date,
                    amount: record.amount,
                    remarks: record.remarks,
                })),
            ]);
        };
        window.addEventListener(FINANCIAL_OBLIGATIONS_CHANGED_EVENT, handleFinancialObligationChange);
        return () => window.removeEventListener(FINANCIAL_OBLIGATIONS_CHANGED_EVENT, handleFinancialObligationChange);
    }, [setAllFinancialObligations]);

    // Hydration Logic
    const obligationsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        allFinancialObligations.forEach(o => {
            const key = `${o.entity_type}-${o.parent_id}-${o.item_id || 'null'}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({
                id: o.id,
                date: o.obligation_date,
                amount: o.amount,
                remarks: o.remarks
            });
        });
        return map;
    }, [allFinancialObligations]);

    const disbursementsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        allFinancialDisbursements.forEach(d => {
            const key = `${d.entity_type}-${d.parent_id}-${d.item_id || 'null'}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({
                id: d.id,
                date: d.disbursement_date,
                amount: d.amount,
                remarks: d.remarks
            });
        });
        return map;
    }, [allFinancialDisbursements]);

    const enrichedSubprojects: Subproject[] = useMemo(() => {
        return subprojects.map(sp => ({
            ...sp,
            details: sp.details?.map(d => {
                const key = `subproject_detail-${sp.id}-${d.id || 'null'}`;
                return { 
                    ...d, 
                    obligations: obligationsMap.get(key) || d.obligations || [],
                    disbursements: disbursementsMap.get(key) || d.disbursements || []
                };
            })
        }));
    }, [subprojects, obligationsMap, disbursementsMap]);

    const enrichedActivities: Activity[] = useMemo(() => {
        return activities.map(act => ({
            ...act,
            expenses: act.expenses?.map(e => {
                const key = `activity_expense-${act.id}-${e.id || 'null'}`;
                return { 
                    ...e, 
                    obligations: obligationsMap.get(key) || e.obligations || [],
                    disbursements: disbursementsMap.get(key) || e.disbursements || []
                };
            })
        }));
    }, [activities, obligationsMap, disbursementsMap]);

    const enrichedOfficeReqs: OfficeRequirement[] = useMemo(() => {
        return officeReqs.map(o => {
            const key = `office_requirement-${o.id}-null`;
            return { 
                ...o, 
                obligations: obligationsMap.get(key) || o.obligations || [],
                disbursements: disbursementsMap.get(key) || o.disbursements || []
            };
        });
    }, [officeReqs, obligationsMap, disbursementsMap]);

    const enrichedStaffingReqs: StaffingRequirement[] = useMemo(() => {
        return staffingReqs.map(s => {
            if (s.expenses && s.expenses.length > 0) {
                const normalizedExpenses = normalizeStaffingExpenses(s.expenses);
                return {
                    ...s,
                    expenses: normalizedExpenses.map(e => {
                        const key = `staffing_expense-${s.id}-${e.id}`;
                        return { 
                            ...e, 
                            obligations: obligationsMap.get(key) || e.obligations || [],
                            disbursements: disbursementsMap.get(key) || e.disbursements || []
                        };
                    })
                };
            }
            const key = `staffing_expense-${s.id}-null`;
            return { 
                ...s, 
                obligations: obligationsMap.get(key) || s.obligations || [],
                disbursements: disbursementsMap.get(key) || s.disbursements || []
            };
        });
    }, [staffingReqs, obligationsMap, disbursementsMap]);

    const enrichedOtherExpenses: OtherProgramExpense[] = useMemo(() => {
        return otherProgramExpenses.map(o => {
            const key = `other_program_expense-${o.id}-null`;
            return { 
                ...o, 
                obligations: obligationsMap.get(key) || o.obligations || [],
                disbursements: disbursementsMap.get(key) || o.disbursements || []
            };
        });
    }, [otherProgramExpenses, obligationsMap, disbursementsMap]);

    // System Settings States (Deadlines)
    // Managed manually to support direct DB operations
    const [deadlines, setDeadlines] = useState<Deadline[]>([]);
    const [budgetCeilings, setBudgetCeilings] = useState<any[]>([]);
    const [activityMonitoringReports, setActivityMonitoringReports] = useState<ActivityMonitoringReport[]>([]);
    const [activityMonitoringActions, setActivityMonitoringActions] = useState<ActivityMonitoringAction[]>([]);
    const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
    const [globalLastRefreshedAt, setGlobalLastRefreshedAt] = useState<string | null>(null);
    const [globalRefreshError, setGlobalRefreshError] = useState<string | null>(null);
    const [globalCacheStatus, setGlobalCacheStatus] = useState<string | null>(null);
    const isRouteDataLoading = isGlobalRefreshing || (!globalLastRefreshedAt && !globalRefreshError && !globalCacheStatus);
    const activeDataScopeKeyRef = useRef<string | null>(null);
    const activeDataScopeRef = useRef<DataScope | null>(null);
    const scopeRequestSeqRef = useRef(0);
    const replaceSubprojects = subprojectsSync.replaceLocalData;
    const replaceIpos = iposSync.replaceLocalData;
    const replaceActivities = activitiesSync.replaceLocalData;
    const replaceMarketingPartners = marketingPartnersSync.replaceLocalData;
    const replaceOfficeReqs = officeReqsSync.replaceLocalData;
    const replaceStaffingReqs = staffingReqsSync.replaceLocalData;
    const replaceOtherProgramExpenses = otherProgramExpensesSync.replaceLocalData;
    const replaceFinancialObligations = financialObligationsSync.replaceLocalData;
    const replaceFinancialDisbursements = financialDisbursementsSync.replaceLocalData;

    // Helper to filter data based on visibility scope
    const filterByVisibility = <T extends { operatingUnit?: string }>(data: T[]): T[] => {
        if (!currentUser) return data;
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return data;
        const scope = currentUser.visibility_scope || 'All OUs';
        if (scope === 'All OUs') return data;
        return data.filter(item => item.operatingUnit === currentUser.operatingUnit);
    };

    const visibleSubprojects = filterByVisibility(enrichedSubprojects);
    const visibleActivities = filterByVisibility(enrichedActivities);
    const visibleOfficeReqs = filterByVisibility(enrichedOfficeReqs);
    const visibleStaffingReqs = filterByVisibility(enrichedStaffingReqs);
    const visibleOtherExpenses = filterByVisibility(enrichedOtherExpenses);

    // Derived Activities
    const trainings = useMemo(() => visibleActivities.filter(a => a.type === 'Training'), [visibleActivities]);
    const otherActivities = useMemo(() => visibleActivities.filter(a => a.type === 'Activity'), [visibleActivities]);

    // Reference States
    const [referenceUacsList, setReferenceUacsList, referenceUacsSync] = useSupabaseTable<ReferenceUacs>('reference_uacs', sampleReferenceUacsList, scopedTableOptions);
    const [referenceParticularList, setReferenceParticularList, referenceParticularsSync] = useSupabaseTable<ReferenceParticular>('reference_particulars', sampleReferenceParticularList, scopedTableOptions);
    const [refCommodities, setRefCommodities, refCommoditiesSync] = useSupabaseTable<RefCommodity>('ref_commodities', sampleRefCommodities, scopedTableOptions);
    const [refLivestock, setRefLivestock, refLivestockSync] = useSupabaseTable<RefLivestock>('ref_livestock', sampleRefLivestock, scopedTableOptions);
    const [refEquipment, setRefEquipment, refEquipmentSync] = useSupabaseTable<RefEquipment>('ref_equipment', sampleRefEquipment, scopedTableOptions);
    const [refInputs, setRefInputs, refInputsSync] = useSupabaseTable<RefInput>('ref_inputs', sampleRefInputs, scopedTableOptions);
    const [refInfrastructure, setRefInfrastructure, refInfrastructureSync] = useSupabaseTable<RefInfrastructure>('ref_infrastructure', sampleRefInfrastructure, scopedTableOptions);
    const [refTrainings, setRefTrainings, refTrainingsSync] = useSupabaseTable<RefTrainingReference>('ref_trainings', sampleRefTrainings, scopedTableOptions);
    const [referenceActivities, setReferenceActivities, referenceActivitiesSync] = useSupabaseTable<ReferenceActivity>('reference_activities', [], scopedTableOptions);
    const replaceReferenceUacs = referenceUacsSync.replaceLocalData;
    const replaceReferenceParticulars = referenceParticularsSync.replaceLocalData;
    const replaceRefCommodities = refCommoditiesSync.replaceLocalData;
    const replaceRefLivestock = refLivestockSync.replaceLocalData;
    const replaceRefEquipment = refEquipmentSync.replaceLocalData;
    const replaceRefInputs = refInputsSync.replaceLocalData;
    const replaceRefInfrastructure = refInfrastructureSync.replaceLocalData;
    const replaceRefTrainings = refTrainingsSync.replaceLocalData;
    const replaceReferenceActivities = referenceActivitiesSync.replaceLocalData;
    const [gidaAreas, setGidaAreas] = useState<GidaArea[]>(sampleGidaAreas);
    const [elcacAreas, setElcacAreas] = useState<ElcacArea[]>(sampleElcacAreas);

    // Construct systemSettings object for child components that expect it
    const systemSettings = useMemo(() => ({
        deadlines
    }), [deadlines]);

    const buildDefaultDataScope = useCallback((overrides: Partial<DataScope> = {}): DataScope => {
        const canViewAllOus = currentUser ? getVisibilityScope('Dashboards') !== 'Own OU' : true;
        return {
            year: overrides.year ?? new Date().getFullYear().toString(),
            operatingUnit: canViewAllOus
                ? (overrides.operatingUnit ?? 'All')
                : (currentUser?.operatingUnit || overrides.operatingUnit || 'All'),
            tier: overrides.tier ?? 'Tier 1',
            fundType: overrides.fundType ?? 'Current',
            canViewAllOus,
            requestedBy: currentUser?.id ?? null
        };
    }, [currentUser, getVisibilityScope]);

    const applyScopedData = useCallback((data: Awaited<ReturnType<typeof loadScopedAppData>>) => {
        replaceSubprojects(data.subprojects);
        replaceIpos(data.ipos);
        replaceActivities(data.activities);
        replaceMarketingPartners(data.marketingPartners);
        replaceOfficeReqs(data.officeReqs);
        replaceStaffingReqs(data.staffingReqs);
        replaceOtherProgramExpenses(data.otherProgramExpenses);
        replaceFinancialObligations(data.financialObligations);
        replaceFinancialDisbursements(data.financialDisbursements);
        replaceReferenceUacs(data.referenceUacsList);
        replaceReferenceParticulars(data.referenceParticularList);
        replaceRefCommodities(data.refCommodities);
        replaceRefLivestock(data.refLivestock);
        replaceRefEquipment(data.refEquipment);
        replaceRefInputs(data.refInputs);
        replaceRefInfrastructure(data.refInfrastructure);
        replaceRefTrainings(data.refTrainings);
        replaceReferenceActivities(data.referenceActivities);
        setDeadlines(data.deadlines as Deadline[]);
        setBudgetCeilings(data.budgetCeilings || []);
        setGidaAreas((data.gidaAreas || []) as GidaArea[]);
        setElcacAreas((data.elcacAreas || []) as ElcacArea[]);
        setActivityMonitoringReports((data.activityMonitoringReports || []) as ActivityMonitoringReport[]);
        setActivityMonitoringActions((data.activityMonitoringActions || []) as ActivityMonitoringAction[]);
    }, [
        replaceActivities,
        replaceFinancialDisbursements,
        replaceFinancialObligations,
        replaceIpos,
        replaceMarketingPartners,
        replaceOfficeReqs,
        replaceOtherProgramExpenses,
        replaceRefCommodities,
        replaceRefEquipment,
        replaceRefInfrastructure,
        replaceRefInputs,
        replaceRefLivestock,
        replaceRefTrainings,
        replaceReferenceActivities,
        replaceReferenceParticulars,
        replaceReferenceUacs,
        replaceStaffingReqs,
        replaceSubprojects
    ]);

    const ensureDataScope = useCallback(async (scopeOverrides: Partial<DataScope> = {}, force = false) => {
        const nextScope = buildDefaultDataScope(scopeOverrides);
        const nextScopeKey = getDataScopeKey(nextScope);

        if (!force && activeDataScopeKeyRef.current === nextScopeKey) {
            return;
        }

        const requestSeq = scopeRequestSeqRef.current + 1;
        scopeRequestSeqRef.current = requestSeq;
        setIsGlobalRefreshing(true);
        setGlobalRefreshError(null);
        setGlobalCacheStatus(null);
        let hadCachedData = false;

        try {
            const cachedData = await readScopedCache(nextScope);
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }

            if (cachedData) {
                hadCachedData = true;
                applyScopedData(cachedData);
                activeDataScopeKeyRef.current = nextScopeKey;
                activeDataScopeRef.current = nextScope;
                const cachedAt = await getScopeCacheMeta(nextScope);
                const savedAt = cachedAt?.savedAt || new Date().toISOString();
                setGlobalLastRefreshedAt(savedAt);
                setGlobalCacheStatus(`Cached data from ${new Date(savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
            }

            const data = await loadScopedAppData(nextScope);
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }
            applyScopedData(data);
            await writeScopedCache(nextScope, data);
            activeDataScopeKeyRef.current = nextScopeKey;
            activeDataScopeRef.current = nextScope;
            setGlobalLastRefreshedAt(new Date().toISOString());
            setGlobalCacheStatus(null);
        } catch (error: any) {
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }
            const message = error?.message || 'Unable to refresh scoped data.';
            setGlobalRefreshError(hadCachedData ? `Showing cached data. ${message}` : `No cached data for this filter. Connect and refresh data. ${message}`);
            if (hadCachedData) {
                setGlobalCacheStatus('Showing cached data');
            }
            console.error('Scoped data refresh failed:', error);
        } finally {
            if (requestSeq === scopeRequestSeqRef.current) {
                setIsGlobalRefreshing(false);
            }
        }
    }, [applyScopedData, buildDefaultDataScope]);

    const refreshAllData = useCallback(async () => {
        const currentScope = activeDataScopeRef.current || {};
        await Promise.all([
            ensureDataScope(currentScope, true),
            refreshUsersList(),
            refreshPermissions(),
            refreshUser()
        ]);
        window.dispatchEvent(new CustomEvent('app-data-refreshed'));
    }, [ensureDataScope, refreshPermissions, refreshUser, refreshUsersList]);

    const clearLocalCache = useCallback(async () => {
        if (!currentUser?.id) return;
        await clearUserCache(currentUser.id);
        setGlobalCacheStatus(null);
        setGlobalLastRefreshedAt(null);
        setGlobalRefreshError('Local cache cleared. Refresh data to rebuild the cache.');
    }, [currentUser?.id]);

    useEffect(() => {
        if (!isAuthReady) return;
        ensureDataScope();
    }, [ensureDataScope, isAuthReady]);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
    const [selectedMonitoringReportContext, setSelectedMonitoringReportContext] = useState<{
        activity: Activity;
        ipo: IPO;
        report?: ActivityMonitoringReport | null;
    } | null>(null);
    const [selectedOfficeReq, setSelectedOfficeReq] = useState<OfficeRequirement | null>(null);
    const [selectedStaffingReq, setSelectedStaffingReq] = useState<StaffingRequirement | null>(null);
    const [selectedOtherExpense, setSelectedOtherExpense] = useState<OtherProgramExpense | null>(null);
    const [isDirectRouteLookupLoading, setIsDirectRouteLookupLoading] = useState(false);
    const directRouteLookupKeyRef = useRef<string | null>(null);
    const directRouteCacheRef = useRef<Map<string, { id: number }>>(new Map());
    const [selectedMarketingPartner, setSelectedMarketingPartner] = useState<MarketingPartner | null>(null);
    const [selectedMarketingLinkageKey, setSelectedMarketingLinkageKey] = useState<string | number | null>(null);
    const [selectedLodYear, setSelectedLodYear] = useState<number | null>(null);
    const [ipoLinkedDcfState, setIpoLinkedDcfState] = useState<{
        ipoId: number;
        data: IpoLinkedDcfRecords | null;
        loading: boolean;
        error: string | null;
    } | null>(null);
    const ipoLinkedDcfCacheRef = useRef<Map<string, IpoLinkedDcfRecords>>(new Map());
    const [activityEditMode, setActivityEditMode] = useState<'create' | 'details' | 'expenses' | 'accomplishment'>('create');
    const [subprojectDetailMode, setSubprojectDetailMode] = useState<'none' | 'details' | 'commodity' | 'budget' | 'accomplishment'>('none');

    useEffect(() => {
        const routeId = getRouteId(routeParams);
        if (routePath === '/ipo-detail' && routeId !== null) {
            const routeIpo = ipos.find(ipo => ipo.id === routeId) || null;
            if (routeIpo && selectedIpo?.id !== routeIpo.id) setSelectedIpo(routeIpo);
        }

        if (['/marketing-profile-detail', '/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(routePath) && routeId !== null) {
            const routePartner = marketingPartners.find(partner => Number(partner.id) === routeId) || null;
            if (routePartner && Number(selectedMarketingPartner?.id) !== Number(routePartner.id)) setSelectedMarketingPartner(routePartner);
            const linkageKey = routeParams.get('linkageKey');
            if (linkageKey !== null && String(selectedMarketingLinkageKey) !== linkageKey) setSelectedMarketingLinkageKey(linkageKey);
        }

        if (routePath === '/activity-edit') {
            const requestedMode = routeParams.get('action');
            if (['details', 'expenses', 'accomplishment'].includes(requestedMode || '') && activityEditMode !== requestedMode) {
                setActivityEditMode(requestedMode as 'details' | 'expenses' | 'accomplishment');
            }
        }

        if (routePath === '/activity-monitoring-report') {
            const activityId = Number(routeParams.get('activityId'));
            const ipoId = Number(routeParams.get('ipoId'));
            if (!Number.isFinite(activityId) || !Number.isFinite(ipoId)) return;
            const activity = activities.find(item => item.id === activityId);
            const ipo = ipos.find(item => item.id === ipoId);
            if (!activity || !ipo) return;
            const reportId = Number(routeParams.get('reportId'));
            const report = Number.isFinite(reportId)
                ? activityMonitoringReports.find(item => Number(item.id) === reportId) || null
                : null;
            if (selectedMonitoringReportContext?.activity.id !== activity.id
                || selectedMonitoringReportContext?.ipo.id !== ipo.id
                || Number(selectedMonitoringReportContext?.report?.id || 0) !== Number(report?.id || 0)) {
                setSelectedMonitoringReportContext({ activity, ipo, report });
            }
        }
    }, [
        activities,
        activityEditMode,
        activityMonitoringReports,
        ipos,
        marketingPartners,
        routeParams,
        routePath,
        selectedIpo?.id,
        selectedMarketingLinkageKey,
        selectedMarketingPartner?.id,
        selectedMonitoringReportContext,
    ]);

    useEffect(() => {
        const id = getRouteId(routeParams);
        if (id === null || !currentUser) return;
        const target = (() => {
            switch (routePath) {
                case '/subproject-detail': return { table: 'subprojects' as const, module: 'Subprojects', items: subprojects, select: setSelectedSubproject };
                case '/activity-detail': return { table: 'activities' as const, module: 'Activities', items: activities, select: setSelectedActivity };
                case '/program-management/office-detail': return { table: 'office_requirements' as const, module: 'Program Management', items: officeReqs, select: setSelectedOfficeReq };
                case '/program-management/staffing-detail': return { table: 'staffing_requirements' as const, module: 'Program Management', items: staffingReqs, select: setSelectedStaffingReq };
                case '/program-management/other-expense-detail': return { table: 'other_program_expenses' as const, module: 'Program Management', items: otherProgramExpenses, select: setSelectedOtherExpense };
                case '/ipo-detail': return { table: 'ipos' as const, module: 'IPO Management', items: ipos, select: setSelectedIpo };
                case '/marketing-profile-detail':
                case '/marketing-profile-edit':
                case '/marketing-linkage-edit':
                case '/marketing-linkage-detail':
                    return { table: 'marketing_partners' as const, module: 'Marketing Database', items: marketingPartners, select: setSelectedMarketingPartner };
                case '/activity-edit':
                    return routeParams.get('action')
                        ? { table: 'activities' as const, module: 'Activities', items: activities, select: setSelectedActivity }
                        : null;
                default: return null;
            }
        })();
        if (!target || !hasAccess(target.module, 'view') || target.items.some(item => item.id === id)) return;
        const lookupKey = `${target.table}:${id}:${currentUser.id}`;
        const cachedRecord = directRouteCacheRef.current.get(lookupKey);
        if (cachedRecord) {
            (target.select as React.Dispatch<React.SetStateAction<any>>)(cachedRecord);
            return;
        }
        if (directRouteLookupKeyRef.current === lookupKey) return;
        directRouteLookupKeyRef.current = lookupKey;
        let cancelled = false;
        setIsDirectRouteLookupLoading(true);
        const visibilityScope = getVisibilityScope(target.module);
        void fetchWorkflowEntityById<any>(target.table, id, {
            canViewAllOperatingUnits: visibilityScope === 'All',
            operatingUnit: currentUser.operatingUnit,
            region: currentUser.operatingUnit ? ouToRegionMap[currentUser.operatingUnit] : null,
        }).then(record => {
            if (!cancelled && record) {
                directRouteCacheRef.current.set(lookupKey, record);
                (target.select as React.Dispatch<React.SetStateAction<any>>)(record);
            }
        }).catch(error => {
            console.error(`Failed to resolve ${target.table} route ${id}:`, error);
        }).finally(() => {
            if (!cancelled) setIsDirectRouteLookupLoading(false);
        });
        return () => { cancelled = true; };
    }, [activities, currentUser, getVisibilityScope, hasAccess, ipos, marketingPartners, officeReqs, otherProgramExpenses, routeParams, routePath, staffingReqs, subprojects]);

    useEffect(() => {
        if (routePath !== '/activity-monitoring-report' || !currentUser) return;
        const activityId = Number(routeParams.get('activityId'));
        const ipoId = Number(routeParams.get('ipoId'));
        if (!Number.isFinite(activityId) || !Number.isFinite(ipoId)) return;

        const selectedActivityRecord = selectedMonitoringReportContext?.activity.id === activityId
            ? selectedMonitoringReportContext.activity
            : activities.find(item => item.id === activityId) || null;
        const selectedIpoRecord = selectedMonitoringReportContext?.ipo.id === ipoId
            ? selectedMonitoringReportContext.ipo
            : ipos.find(item => item.id === ipoId) || null;
        if (selectedActivityRecord && selectedIpoRecord) return;
        if (!hasAccess('Activities', 'view') || !hasAccess('IPO Management', 'view')) return;

        const lookupKey = `monitoring:${activityId}:${ipoId}:${currentUser.id}`;
        if (directRouteLookupKeyRef.current === lookupKey) return;
        directRouteLookupKeyRef.current = lookupKey;
        let cancelled = false;
        setIsDirectRouteLookupLoading(true);

        const activityCacheKey = `activities:${activityId}:${currentUser.id}`;
        const ipoCacheKey = `ipos:${ipoId}:${currentUser.id}`;
        const activityVisibility = getVisibilityScope('Activities');
        const ipoVisibility = getVisibilityScope('IPO Management');
        const userRegion = currentUser.operatingUnit ? ouToRegionMap[currentUser.operatingUnit] : null;

        const activityPromise = selectedActivityRecord
            || directRouteCacheRef.current.get(activityCacheKey)
            || fetchWorkflowEntityById<Activity>('activities', activityId, {
                canViewAllOperatingUnits: activityVisibility === 'All',
                operatingUnit: currentUser.operatingUnit,
            });
        const ipoPromise = selectedIpoRecord
            || directRouteCacheRef.current.get(ipoCacheKey)
            || fetchWorkflowEntityById<IPO>('ipos', ipoId, {
                canViewAllOperatingUnits: ipoVisibility === 'All',
                region: userRegion,
            });

        void Promise.all([Promise.resolve(activityPromise), Promise.resolve(ipoPromise)])
            .then(([activity, ipo]) => {
                if (cancelled || !activity || !ipo) return;
                directRouteCacheRef.current.set(activityCacheKey, activity);
                directRouteCacheRef.current.set(ipoCacheKey, ipo);
                const reportId = Number(routeParams.get('reportId'));
                const report = Number.isFinite(reportId)
                    ? activityMonitoringReports.find(item => Number(item.id) === reportId) || null
                    : null;
                setSelectedMonitoringReportContext({ activity, ipo, report });
            })
            .catch(error => {
                console.error(`Failed to resolve monitoring route ${activityId}/${ipoId}:`, error);
            })
            .finally(() => {
                if (!cancelled) setIsDirectRouteLookupLoading(false);
            });
        return () => { cancelled = true; };
    }, [activities, activityMonitoringReports, currentUser, getVisibilityScope, hasAccess, ipos, routeParams, routePath, selectedMonitoringReportContext]);

    useEffect(() => {
        const routeId = getRouteId(routeParams);
        let normalizedPath: string | null = null;
        if (routeId === null) {
            const selectedId = (() => {
                switch (routePath) {
                    case '/subproject-detail': return selectedSubproject?.id;
                    case '/activity-detail': return selectedActivity?.id;
                    case '/ipo-detail': return selectedIpo?.id;
                    case '/program-management/office-detail': return selectedOfficeReq?.id;
                    case '/program-management/staffing-detail': return selectedStaffingReq?.id;
                    case '/program-management/other-expense-detail': return selectedOtherExpense?.id;
                    case '/marketing-profile-detail':
                    case '/marketing-profile-edit':
                    case '/marketing-linkage-edit':
                    case '/marketing-linkage-detail':
                        return selectedMarketingPartner?.id;
                    case '/activity-edit':
                        return routeParams.get('action') ? selectedActivity?.id : null;
                    case '/lod-details': return selectedIpo?.id;
                    default: return null;
                }
            })();
            if (selectedId !== undefined && selectedId !== null) {
                normalizedPath = appendPathParams(currentPage, [['id', selectedId]]);
            }
        }

        if (routePath === '/activity-monitoring-report' && selectedMonitoringReportContext) {
            const activityId = Number(routeParams.get('activityId'));
            const ipoId = Number(routeParams.get('ipoId'));
            if (!Number.isFinite(activityId) || !Number.isFinite(ipoId)) {
                normalizedPath = appendPathParams(currentPage, [
                    ['activityId', selectedMonitoringReportContext.activity.id],
                    ['ipoId', selectedMonitoringReportContext.ipo.id],
                    ['reportId', selectedMonitoringReportContext.report?.id],
                ]);
            }
        }

        if (!normalizedPath || normalizedPath === currentPage) return;
        const historyState = window.history.state || {};
        window.history.replaceState({ ...historyState, page: normalizedPath }, '', `/#${normalizedPath}`);
        setCurrentPage(normalizedPath);
    }, [
        currentPage,
        routeParams,
        routePath,
        selectedActivity,
        selectedIpo,
        selectedMarketingPartner,
        selectedMonitoringReportContext,
        selectedOfficeReq,
        selectedOtherExpense,
        selectedStaffingReq,
        selectedSubproject,
    ]);
    
    useEffect(() => {
        if (routePath !== '/reports') return;
        const requestedTab = getReportTabFromSourceView(routeParams.get('report')) as ReportTab | null;
        if (!requestedTab) return;
        setReportsPageState(previous => previous.activeTab === requestedTab
            ? previous
            : { ...previous, activeTab: requestedTab });
    }, [routeParams, routePath]);

    const breadcrumbs = useMemo(() => {
        const routeId = getRouteId(routeParams);
        const monitoringActivityId = Number(routeParams.get('activityId'));
        const monitoringIpoId = Number(routeParams.get('ipoId'));
        const originId = Number(routeParams.get('originId'));
        const resolveRouteItem = <T extends { id: number }>(item: T | null, items: T[]) => {
            if (routeId === null) return item;
            if (item?.id === routeId) return item;
            return items.find(candidate => candidate.id === routeId) || null;
        };
        const activeMarketingPartner = routeId !== null
            ? marketingPartners.find(partner => Number(partner.id) === routeId) || selectedMarketingPartner
            : selectedMarketingPartner;
        const activeLinkageKey = routeParams.get('linkageKey') ?? selectedMarketingLinkageKey;
        const selectedLinkage = activeMarketingPartner?.marketingLinkages?.find((linkage, index) => {
            const stableKey = linkage.id !== undefined && linkage.id !== null && String(linkage.id) !== ''
                ? linkage.id
                : index;
            return String(stableKey) === String(activeLinkageKey);
        });

        const activeSubproject = resolveRouteItem(selectedSubproject, visibleSubprojects);
        const activeActivity = routePath === '/activity-monitoring-report'
            ? selectedMonitoringReportContext?.activity
                || (Number.isFinite(monitoringActivityId) ? visibleActivities.find(activity => activity.id === monitoringActivityId) : null)
                || null
            : resolveRouteItem(selectedActivity, visibleActivities);
        const activeIpo = routePath === '/activity-monitoring-report'
            ? selectedMonitoringReportContext?.ipo
                || (Number.isFinite(monitoringIpoId) ? ipos.find(ipo => ipo.id === monitoringIpoId) : null)
                || null
            : resolveRouteItem(selectedIpo, ipos);
        const originIpo = routeParams.get('origin') === 'ipo' && Number.isFinite(originId)
            ? ipos.find(ipo => ipo.id === originId) || null
            : null;
        const originActivity = routeParams.get('origin') === 'activity' && Number.isFinite(originId)
            ? visibleActivities.find(activity => activity.id === originId) || null
            : null;
        const activeOfficeRequirement = resolveRouteItem(selectedOfficeReq, visibleOfficeReqs);
        const activeOtherProgramExpense = resolveRouteItem(selectedOtherExpense, visibleOtherExpenses);
        const activeStaffingRequirement = resolveRouteItem(selectedStaffingReq, visibleStaffingReqs);

        return resolveAppBreadcrumbs({
            path: routePath,
            params: routeParams,
            role: currentUser?.role,
            context: {
                activity: activeActivity ? { id: activeActivity.id, label: activeActivity.name || activeActivity.uid } : null,
                activityEditMode,
                gadOperatingUnit: routeParams.get('ou'),
                gadYear: Number(routeParams.get('year')) || null,
                ipo: activeIpo ? { id: activeIpo.id, label: activeIpo.name } : null,
                lodYear: selectedLodYear,
                marketingLinkageLabel: selectedLinkage
                    ? selectedLinkage.commodityName || selectedLinkage.ipoName || 'Market Linkage'
                    : null,
                marketingPartner: activeMarketingPartner
                    ? { id: activeMarketingPartner.id, label: activeMarketingPartner.companyName || activeMarketingPartner.uid }
                    : null,
                monitoringIpo: activeIpo
                    ? { id: activeIpo.id, label: activeIpo.name }
                    : null,
                originActivity: originActivity
                    ? { id: originActivity.id, label: originActivity.name || originActivity.uid }
                    : null,
                originIpo: originIpo ? { id: originIpo.id, label: originIpo.name } : null,
                officeRequirement: activeOfficeRequirement
                    ? { id: activeOfficeRequirement.id, label: activeOfficeRequirement.equipment || activeOfficeRequirement.uid }
                    : null,
                otherProgramExpense: activeOtherProgramExpense
                    ? { id: activeOtherProgramExpense.id, label: activeOtherProgramExpense.particulars || activeOtherProgramExpense.uid }
                    : null,
                staffingRequirement: activeStaffingRequirement
                    ? { id: activeStaffingRequirement.id, label: activeStaffingRequirement.personnelPosition || activeStaffingRequirement.uid }
                    : null,
                subproject: activeSubproject ? { id: activeSubproject.id, label: activeSubproject.name || activeSubproject.uid } : null,
                subprojectDetailMode,
            },
        });
    }, [
        activityEditMode,
        currentUser?.role,
        routeParams,
        routePath,
        selectedActivity,
        selectedIpo,
        selectedLodYear,
        selectedMarketingLinkageKey,
        selectedMarketingPartner,
        selectedMonitoringReportContext,
        selectedOfficeReq,
        selectedOtherExpense,
        selectedStaffingReq,
        selectedSubproject,
        subprojectDetailMode,
        visibleActivities,
        visibleOfficeReqs,
        visibleOtherExpenses,
        visibleStaffingReqs,
        visibleSubprojects,
        ipos,
        marketingPartners,
    ]);

    const returnContext = useMemo(() => resolveAppReturnContext(routeParams), [routeParams]);
    
    // Navigation History Stack
    const [historyStack, setHistoryStack] = useState<string[]>([]);
    const previousPage = historyStack.length > 0 ? historyStack[historyStack.length - 1] : '/';

    const currentPageRef = useRef(currentPage);
    const historyStackRef = useRef(historyStack);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        historyStackRef.current = historyStack;
    }, [historyStack]);

    const resetReportsPageState = useCallback(() => {
        setReportsPageState(createDefaultReportsPageState(currentUser?.operatingUnit, isReportsLockedToOwnOu));
    }, [currentUser?.operatingUnit, isReportsLockedToOwnOu]);

    useEffect(() => {
        if (isReportsLockedToOwnOu && currentUser?.operatingUnit) {
            setReportsPageState(prev => ({
                ...prev,
                selectedOu: currentUser.operatingUnit,
                selectedOus: [currentUser.operatingUnit],
            }));
        }
    }, [currentUser?.operatingUnit, isReportsLockedToOwnOu]);

    useEffect(() => {
        if (currentUser?.role !== 'Super Admin') {
            setReportsPageState(prev => prev.activeTab === 'Financial Audit' ? { ...prev, activeTab: 'WFP' } : prev);
        }
    }, [currentUser?.role]);

    const fallbackIpoLinkedDcfRecords = useMemo<IpoLinkedDcfRecords>(() => {
        if (!selectedIpo?.id) return emptyIpoLinkedDcfRecords();
        const ipoId = Number(selectedIpo.id);
        const ipoName = String(selectedIpo.name || '').trim();
        const linkedSubprojects = visibleSubprojects.filter(subproject =>
            Number(subproject.ipo_id) === ipoId ||
            String(subproject.indigenousPeopleOrganization || '').trim() === ipoName
        );
        const linkedActivities = visibleActivities.filter(activity =>
            (activity.participating_ipo_ids || []).map(Number).includes(ipoId) ||
            (Array.isArray(activity.participatingIpos)
                ? activity.participatingIpos
                : String(activity.participatingIpos || '').split(/[;,]/)
            ).some(name => String(name || '').trim() === ipoName)
        );
        const linkedActivityIds = new Set(linkedActivities.map(activity => Number(activity.id)));
        const linkedReports = activityMonitoringReports.filter(report =>
            Number(report.ipo_id) === ipoId &&
            linkedActivityIds.has(Number(report.activity_id))
        );
        const linkedReportIds = new Set(linkedReports.map(report => Number(report.id)));
        return {
            subprojects: linkedSubprojects,
            trainings: linkedActivities.filter(activity => activity.type === 'Training'),
            monitoringActivities: linkedActivities,
            monitoringReports: linkedReports,
            monitoringActions: activityMonitoringActions.filter(action => linkedReportIds.has(Number(action.monitoring_report_id))),
        };
    }, [activityMonitoringActions, activityMonitoringReports, selectedIpo?.id, selectedIpo?.name, visibleActivities, visibleSubprojects]);

    const mergeIpoLinkedRecords = useCallback((primary: IpoLinkedDcfRecords, secondary: IpoLinkedDcfRecords): IpoLinkedDcfRecords => {
        const mergeById = <T extends { id: number }>(first: T[], second: T[]) => {
            const byId = new Map<number, T>();
            [...first, ...second].forEach(item => {
                const id = Number(item.id);
                if (Number.isFinite(id) && !byId.has(id)) byId.set(id, item);
            });
            return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
        };
        return {
            subprojects: mergeById(primary.subprojects, secondary.subprojects),
            trainings: mergeById(primary.trainings, secondary.trainings),
            monitoringActivities: mergeById(primary.monitoringActivities, secondary.monitoringActivities),
            monitoringReports: mergeById(primary.monitoringReports, secondary.monitoringReports),
            monitoringActions: mergeById(primary.monitoringActions, secondary.monitoringActions),
        };
    }, []);

    const ipoDetailLinkedDcfRecords = useMemo(() => {
        const liveData = selectedIpo?.id && ipoLinkedDcfState?.ipoId === selectedIpo.id
            ? ipoLinkedDcfState.data
            : null;
        return liveData
            ? mergeIpoLinkedRecords(fallbackIpoLinkedDcfRecords, liveData)
            : fallbackIpoLinkedDcfRecords;
    }, [fallbackIpoLinkedDcfRecords, ipoLinkedDcfState, mergeIpoLinkedRecords, selectedIpo?.id]);

    useEffect(() => {
        if (!selectedIpo?.id) {
            setIpoLinkedDcfState(null);
            return;
        }

        const ipoId = Number(selectedIpo.id);
        const cacheKey = [
            currentUser?.id || 'anonymous',
            currentUser?.role || 'role',
            currentUser?.operatingUnit || 'ou',
            currentUser?.visibility_scope || 'scope',
            ipoId
        ].join('|');
        const cached = ipoLinkedDcfCacheRef.current.get(cacheKey);
        if (cached) {
            setIpoLinkedDcfState({ ipoId, data: cached, loading: false, error: null });
            return;
        }

        let cancelled = false;
        setIpoLinkedDcfState({ ipoId, data: null, loading: true, error: null });

        fetchIpoLinkedDcfRecords(selectedIpo, currentUser)
            .then(data => {
                if (cancelled) return;
                ipoLinkedDcfCacheRef.current.set(cacheKey, data);
                setIpoLinkedDcfState({ ipoId, data, loading: false, error: null });
            })
            .catch(error => {
                if (cancelled) return;
                setIpoLinkedDcfState({
                    ipoId,
                    data: null,
                    loading: false,
                    error: error?.message || 'Unable to load all linked Subprojects, Trainings, and Monitoring Reports for this IPO.'
                });
            });

        return () => {
            cancelled = true;
        };
    }, [
        currentUser,
        currentUser?.id,
        currentUser?.operatingUnit,
        currentUser?.role,
        currentUser?.visibility_scope,
        selectedIpo
    ]);

    const navigateTo = (page: string, options: NavigationOptions = {}) => {
        const current = currentPageRef.current;
        if (!requestAppNavigation(current, page)) return;
        const stack = historyStackRef.current;
        const newStack = [...stack, current];
        if (page === '/reports' && options.resetReports) {
            resetReportsPageState();
        }
        setHistoryStack(newStack);
        setCurrentPage(page);
        // Use hash-based routing to avoid 404 on refresh in static environments
        window.history.pushState({ page, stack: newStack }, '', `/#${page}`);
    };

    useEffect(() => {
        if (!isAuthReady || !currentUser) return;
        const canonicalRoute = getCanonicalModuleRoute(routePath, currentUser.role);
        if (!canonicalRoute || canonicalRoute === routePath) return;
        const stack = historyStackRef.current;
        currentPageRef.current = canonicalRoute;
        setCurrentPage(canonicalRoute);
        window.history.replaceState({ page: canonicalRoute, stack }, '', `/#${canonicalRoute}`);
    }, [currentUser, isAuthReady, routePath]);

    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            const leavingPage = parseAppRoute(currentPageRef.current).path;
            const nextPage = event.state?.page || window.location.hash.replace('#', '') || '/';
            if (!requestAppNavigation(currentPageRef.current, nextPage)) {
                const current = currentPageRef.current;
                const stack = historyStackRef.current;
                window.history.pushState({ page: current, stack }, '', `/#${current}`);
                return;
            }
            
            if (leavingPage === '/subproject-detail') setSelectedSubproject(null);
            if (leavingPage === '/activity-detail') setSelectedActivity(null);
            if (leavingPage === '/activity-monitoring-report') setSelectedMonitoringReportContext(null);
            if (leavingPage === '/ipo-detail') setSelectedIpo(null);
            if (leavingPage === '/program-management/office-detail') setSelectedOfficeReq(null);
            if (leavingPage === '/program-management/staffing-detail') setSelectedStaffingReq(null);
            if (leavingPage === '/program-management/other-expense-detail') setSelectedOtherExpense(null);
            if (leavingPage === '/marketing-profile-detail') {
                if (!['/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(nextPage)) {
                    setSelectedMarketingPartner(null);
                    setSelectedMarketingLinkageKey(null);
                }
            }
            if (leavingPage === '/marketing-linkage-detail') setSelectedMarketingLinkageKey(null);
            if (leavingPage === '/lod-details') {
                setSelectedIpo(null);
                setSelectedLodYear(null);
            }

            if (event.state && event.state.page) {
                setCurrentPage(event.state.page);
                setHistoryStack(event.state.stack || []);
            } else {
                // Parse the page from the hash instead of pathname to avoid 404
                const path = window.location.hash.replace('#', '') || '/';
                setCurrentPage(path);
                setHistoryStack([]);
            }
        };

        window.addEventListener('popstate', handlePopState);
        
        // Initial setup: Fix for 404 on refresh. OAuth callbacks are the one exception
        // because Google must return to the settings page after a full redirect.
        const hashPath = window.location.hash.replace('#', '') || '/';
        const isGoogleDriveCallback = hashPath.startsWith('/settings?drive=');
        const initialPath = isGoogleDriveCallback ? '/settings' : hashPath;
        window.history.replaceState({ page: initialPath, stack: [] }, '', isGoogleDriveCallback ? `/#${hashPath}` : `/#${initialPath}`);
        setCurrentPage(initialPath);

        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Track previous user to redirect to home on login
    const prevUserRef = useRef<User | null>(null);

    useEffect(() => {
        if (currentUser && !prevUserRef.current) {
            const hashPath = window.location.hash.replace('#', '') || '/';
            if (hashPath.startsWith('/settings?drive=')) {
                setCurrentPage('/settings');
                setHistoryStack([]);
                window.history.replaceState({ page: '/settings', stack: [] }, '', `/#${hashPath}`);
                prevUserRef.current = currentUser;
                return;
            }
            setCurrentPage(hashPath);
            setHistoryStack([]);
            window.history.replaceState({ page: hashPath, stack: [] }, '', `/#${hashPath}`);
        }
        prevUserRef.current = currentUser;
    }, [currentUser]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    useEffect(() => {
        const mobileQuery = window.matchMedia('(max-width: 767px)');
        const syncSidebarToViewport = (event: MediaQueryListEvent | MediaQueryList) => {
            setIsSidebarOpen(!event.matches);
        };

        syncSidebarToViewport(mobileQuery);
        mobileQuery.addEventListener('change', syncSidebarToViewport);
        return () => mobileQuery.removeEventListener('change', syncSidebarToViewport);
    }, []);

    const updateThemePreference = (preference: ThemePreference) => {
        saveThemePreference(preference);
        setThemePreferenceState(preference);
        setThemeMode(resolveThemeMode(preference));
    };

    useEffect(() => {
        applyTheme(themeMode, themePreference);
    }, [themeMode, themePreference]);

    useEffect(() => {
        const themeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!themeQuery) return;

        const handleSystemThemeChange = () => {
            if (themePreference === 'system' && !getSavedThemePreference()) {
                setThemeMode(getSystemThemePreference());
            }
        };

        themeQuery.addEventListener('change', handleSystemThemeChange);
        return () => themeQuery.removeEventListener('change', handleSystemThemeChange);
    }, [themePreference]);

    useEffect(() => {
        const handleThemeStorageChange = (event: StorageEvent) => {
            if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
            const nextPreference = resolveThemePreference();
            setThemePreferenceState(nextPreference);
            setThemeMode(resolveThemeMode(nextPreference));
        };

        window.addEventListener('storage', handleThemeStorageChange);
        return () => window.removeEventListener('storage', handleThemeStorageChange);
    }, []);

    // Derived References
    const derivedUacsCodes = useMemo(() => {
        const tree: { [key: string]: { [key: string]: { [key: string]: string } } } = {};

        referenceUacsList.forEach(item => {
            if (!tree[item.objectType]) tree[item.objectType] = {};
            if (!tree[item.objectType][item.particular]) tree[item.objectType][item.particular] = {};
            tree[item.objectType][item.particular][item.uacsCode] = item.description;
        });
        return tree;
    }, [referenceUacsList]);

    const derivedParticularTypes = useMemo(() => {
        const newTypes: { [key: string]: string[] } = {};
        referenceParticularList.forEach(item => {
            if (!newTypes[item.type]) newTypes[item.type] = [];
            if (!newTypes[item.type].includes(item.particular)) {
                newTypes[item.type].push(item.particular);
            }
        });
        return newTypes;
    }, [referenceParticularList]);

    const derivedCommodityCategories = useMemo(() => {
        const categories: { [key: string]: string[] } = {
            'Livestock': [],
            'Crop': []
        };
        refCommodities.forEach(item => {
            if (!categories['Crop'].includes(item.name)) {
                categories['Crop'].push(item.name);
            }
        });
        refLivestock.forEach(item => {
            if (!categories['Livestock'].includes(item.name)) {
                categories['Livestock'].push(item.name);
            }
        });
        // Sort items
        Object.keys(categories).forEach(key => categories[key].sort());
        return categories;
    }, [refCommodities, refLivestock]);

    // Navigation Handlers
    const getCurrentSourceParams = (): Array<[string, string | null]> => {
        const existingSource = resolveAppReturnContext(routeParams);
        if (existingSource) {
            return [
                ['source', routeParams.get('source')],
                ['sourceView', routeParams.get('sourceView')],
            ];
        }
        if (routePath === '/reports') {
            return [
                ['source', 'report'],
                ['sourceView', getReportSourceView(reportsPageState.activeTab)],
            ];
        }
        if (isDashboardPagePath(routePath)) {
            return [
                ['source', 'dashboard'],
                ['sourceView', getDashboardSourceView(routePath)],
            ];
        }
        return [];
    };

    const getCurrentOriginParams = (): Array<[string, string | null]> => {
        const origin = routeParams.get('origin');
        const originId = routeParams.get('originId');
        if (!['ipo', 'activity'].includes(origin || '') || !originId) return [];
        return [['origin', origin], ['originId', originId]];
    };

    const buildContextualRecordPath = (
        path: string,
        id?: number | string | null,
        origin?: { type: 'ipo' | 'activity'; id: number | string } | null,
        extra: Array<[string, string | number | null | undefined]> = [],
    ) => appendPathParams(buildDetailPath(path, id), [
        ...getCurrentSourceParams(),
        ...(origin
            ? [['origin', origin.type], ['originId', origin.id]] as Array<[string, string | number]>
            : getCurrentOriginParams()),
        ...extra,
    ]);

    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        const origin = routePath === '/ipo-detail' && selectedIpo
            ? { type: 'ipo' as const, id: selectedIpo.id }
            : null;
        navigateTo(buildContextualRecordPath('/subproject-detail', project.id, origin));
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        const origin = routePath === '/activity-detail' && selectedActivity
            ? { type: 'activity' as const, id: selectedActivity.id }
            : null;
        navigateTo(buildContextualRecordPath('/ipo-detail', ipo.id, origin));
    };

    const handleOpenIpoListForAncestralDomain = (adNo: string) => {
        setExternalFilters({ ancestralDomainNo: adNo });
        navigateTo('/ipo');
    };

    const handleSelectActivity = (activity: Activity) => {
        setSelectedActivity(activity);
        const origin = routePath === '/ipo-detail' && selectedIpo
            ? { type: 'ipo' as const, id: selectedIpo.id }
            : null;
        navigateTo(buildContextualRecordPath('/activity-detail', activity.id, origin));
    };

    const handleOpenMonitoringReport = (activity: Activity, ipo: IPO, report?: ActivityMonitoringReport | null) => {
        setSelectedIpo(ipo);
        setSelectedMonitoringReportContext({ activity, ipo, report: report || null });
        const origin = routePath === '/ipo-detail'
            ? { type: 'ipo' as const, id: ipo.id }
            : { type: 'activity' as const, id: activity.id };
        navigateTo(buildContextualRecordPath('/activity-monitoring-report', null, origin, [
            ['activityId', activity.id],
            ['ipoId', ipo.id],
            ['reportId', report?.id],
        ]));
    };

    const handleSelectOfficeReq = (req: OfficeRequirement) => {
        setSelectedOfficeReq(req);
        navigateTo(buildContextualRecordPath('/program-management/office-detail', req.id));
    };

    const handleSelectStaffingReq = (req: StaffingRequirement) => {
        setSelectedStaffingReq(req);
        navigateTo(buildContextualRecordPath('/program-management/staffing-detail', req.id));
    };

    const handleSelectOtherExpense = (req: OtherProgramExpense) => {
        setSelectedOtherExpense(req);
        navigateTo(buildContextualRecordPath('/program-management/other-expense-detail', req.id));
    };

    const handleSelectMarketingPartner = (partner: MarketingPartner) => {
        setSelectedMarketingPartner(partner);
        const origin = routePath === '/ipo-detail' && selectedIpo
            ? { type: 'ipo' as const, id: selectedIpo.id }
            : null;
        navigateTo(buildContextualRecordPath('/marketing-profile-detail', partner.id, origin));
    }
    
    // New handler for activity creation
    const handleCreateActivity = () => {
        setActivityEditMode('create');
        setSelectedActivity(null);
        navigateTo('/activity-edit');
    };
    
    const handleCreateSubproject = () => {
        setSelectedSubproject(null);
        navigateTo('/subproject-edit');
    };

    const handleBack = () => {
        if (historyStackRef.current.length === 0) {
            navigateTo('/');
            return;
        }
        window.history.back();
    };

    // Generic navigation handler for Chatbot
    const handleNavigate = (path: string) => {
        navigateTo(path);
    };
    
    // Handler for Chatbot-driven filters
    const handleApplyFilter = (filters: { region?: string; year?: string; search?: string; status?: string; ancestralDomainNo?: string }) => {
        setExternalFilters(filters);
    };

    if (!isAuthReady) {
        return (
            <div className="app-boot-screen" role="status" aria-live="polite">
                <img src="/assets/4klogo.png" alt="" aria-hidden="true" />
                <span className="app-boot-screen__spinner" aria-hidden="true" />
                <strong>Preparing 4K Information System</strong>
                <p>Empowering Indigenous Peoples towards self-determination.</p>
            </div>
        );
    }

    if (!currentUser) {
        return <Login />;
    }

    const handleSelectIpoForLod = (ipo: IPO, year?: number) => {
        setSelectedIpo(ipo);
        setSelectedLodYear(year ?? null);
        const origin = routePath === '/ipo-detail'
            ? { type: 'ipo' as const, id: ipo.id }
            : null;
        navigateTo(buildContextualRecordPath('/lod-details', ipo.id, origin, [['year', year]]));
    };

    const handleSelectGadPimmeAssessment = (operatingUnit: string, year: number) => {
        navigateTo(appendPathParams(buildGadPimmeDetailPath(operatingUnit, year), getCurrentSourceParams()));
    };

    const renderPage = () => {
        const checkAccess = (module: string) => hasAccess(module, 'view');
        const denied = <AccessDenied onBackToHome={() => navigateTo('/')} />;

        // Phase 6: Guard clauses for module-level access
        if (isDashboardPagePath(routePath) && !checkAccess('Dashboards')) return denied;
        if (routePath === '/reports' && !checkAccess('Reports')) return denied;
        
        if (['/subprojects', '/subproject-edit', '/subproject-detail'].includes(routePath)) {
            if (!checkAccess('Subprojects')) return denied;
        }
        if (['/trainings', '/other-activities', '/activities', '/activity-edit', '/activity-detail', '/activity-monitoring-report'].includes(routePath)) {
            if (!checkAccess('Activities')) return denied;
        }
        if (routePath === '/activity-monitoring-report' && !checkAccess('IPO Management')) return denied;
        if (routePath === '/program-management' || routePath.startsWith('/program-management/')) {
            if (!checkAccess('Program Management')) return denied;
        }
        if (routePath === '/accomplishment/financial' && !checkAccess('Accomplishment - Financial')) return denied;
        if (routePath === '/accomplishment/physical' && !checkAccess('Accomplishment - Physical')) return denied;
        
        if (['/ipo', '/ipo-detail'].includes(routePath)) {
            if (!checkAccess('IPO Management')) return denied;
        }
        if (['/marketing-database', '/marketing-profile-detail', '/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(routePath)) {
            if (!checkAccess('Marketing Database')) return denied;
        }
        if (['/level-of-development', '/lod-details'].includes(routePath)) {
            if (!checkAccess('Level of Development')) return denied;
        }
        if (['/gender-and-development', '/gender-and-development/detail'].includes(routePath)) {
            if (!checkAccess('Gender and Development')) return denied;
        }
        if (routePath === '/commodity-mapping') {
            if (!checkAccess('Commodity Mapping')) return denied;
        }
        if (isReferencePagePath(routePath) && (currentUser?.role === 'Management' || !checkAccess('References'))) return denied;
        if (routePath === '/settings' && !checkAccess('System Management')) {
             // System Management is for the whole settings tab, but maybe we should allow profiles?
             // Usually settings has profile. Let's see.
        }

        if (isDashboardPagePath(routePath)) {
            const dashboardPage = resolveDashboardPage(routePath, currentUser?.role);
            return <DashboardsPage
                activePage={dashboardPage.page}
                subprojects={visibleSubprojects}
                ipos={ipos}
                trainings={visibleActivities.filter(a => a.type === 'Training')}
                otherActivities={visibleActivities.filter(a => a.type === 'Activity')}
                officeReqs={visibleOfficeReqs}
                staffingReqs={visibleStaffingReqs}
                otherProgramExpenses={visibleOtherExpenses}
                marketingPartners={marketingPartners}
                onSelectIpo={handleSelectIpo}
                onSelectLodIpo={handleSelectIpoForLod}
                onSelectSubproject={handleSelectSubproject}
                onSelectActivity={handleSelectActivity}
                onSelectMarketingPartner={handleSelectMarketingPartner}
                onSelectGadAssessment={handleSelectGadPimmeAssessment}
                setExternalFilters={setExternalFilters}
                navigateTo={navigateTo}
                onDataScopeChange={ensureDataScope}
            />;
        }

        if (isProgramManagementPagePath(routePath)) {
            const programPage = resolveProgramManagementPage(routePath);
            return <ProgramManagement
                activePage={programPage.page}
                officeReqs={visibleOfficeReqs}
                setOfficeReqs={setOfficeReqs}
                staffingReqs={visibleStaffingReqs}
                setStaffingReqs={setStaffingReqs}
                otherProgramExpenses={visibleOtherExpenses}
                setOtherProgramExpenses={setOtherProgramExpenses}
                uacsCodes={derivedUacsCodes}
                onSelectOfficeReq={handleSelectOfficeReq}
                onSelectStaffingReq={handleSelectStaffingReq}
                onSelectOtherExpense={handleSelectOtherExpense}
                onDataScopeChange={ensureDataScope}
            />;
        }

        if (isReferencePagePath(routePath)) {
            const referencePage = resolveReferencePage(routePath);
            return <References
                activePage={referencePage.page}
                uacsList={referenceUacsList}
                setUacsList={setReferenceUacsList}
                particularList={referenceParticularList}
                setParticularList={setReferenceParticularList}
                refCommodities={refCommodities}
                setRefCommodities={setRefCommodities}
                refLivestock={refLivestock}
                setRefLivestock={setRefLivestock}
                refEquipment={refEquipment}
                setRefEquipment={setRefEquipment}
                refInputs={refInputs}
                setRefInputs={setRefInputs}
                refInfrastructure={refInfrastructure}
                setRefInfrastructure={setRefInfrastructure}
                refTrainings={refTrainings}
                setRefTrainings={setRefTrainings}
                gidaList={gidaAreas}
                setGidaList={setGidaAreas}
                elcacList={elcacAreas}
                setElcacList={setElcacAreas}
                ipos={ipos}
                setIpos={setIpos}
            />;
        }

        switch (routePath) {
            case '/':
                return <Dashboard 
                            subprojects={visibleSubprojects} 
                            ipos={ipos}
                            activities={visibleActivities}
                            systemSettings={systemSettings}
                            officeReqs={visibleOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            navigateTo={navigateTo}
                            // @ts-ignore
                            externalFilters={externalFilters}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/subprojects':
                return <Subprojects 
                            ipos={ipos} 
                            subprojects={visibleSubprojects} 
                            setSubprojects={setSubprojects}
                            setIpos={setIpos} 
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            onCreateSubproject={handleCreateSubproject}
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/trainings':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Training"
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/other-activities':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Activity"
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/activities': 
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/activity-edit': {
                const routeId = getRouteId(routeParams);
                const requestedMode = routeParams.get('action');
                const existingMode = ['details', 'expenses', 'accomplishment'].includes(requestedMode || '')
                    ? requestedMode as 'details' | 'expenses' | 'accomplishment'
                    : null;
                const routeActivity = routeId !== null
                    ? (selectedActivity?.id === routeId ? selectedActivity : activities.find(item => item.id === routeId) || null)
                    : selectedActivity;
                if (existingMode && !routeActivity) {
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading activity..." />;
                    return <DetailRouteFallback title="Activity unavailable" message="This activity was not found or is outside your visibility scope." actionLabel="Back to Activities" onAction={() => navigateTo('/activities')} />;
                }
                const effectiveEditMode = existingMode || activityEditMode;
                if (effectiveEditMode !== 'create' && routeActivity) {
                    const activityEditDecision = effectiveEditMode === 'details'
                        ? getStatusDecision({ moduleKey: 'activities', item: routeActivity, action: 'editDetails', hasModuleAccess: hasAccess('Activities', 'edit') })
                        : effectiveEditMode === 'expenses'
                            ? getStatusDecision({ moduleKey: 'activities', item: routeActivity, action: 'editBudget', hasModuleAccess: hasAccess('Activities', 'edit') })
                            : (
                                getStatusDecision({ moduleKey: 'activities', item: routeActivity, action: 'editPhysicalAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Physical', 'edit') }).allowed
                                    ? getStatusDecision({ moduleKey: 'activities', item: routeActivity, action: 'editPhysicalAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Physical', 'edit') })
                                    : getStatusDecision({ moduleKey: 'activities', item: routeActivity, action: 'editFinancialAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Financial', 'edit') })
                            );
                    if (!activityEditDecision.allowed) {
                        return (
                            <DetailRouteFallback
                                title="Activity editing is locked"
                                message={activityEditDecision.message}
                                actionLabel="Back to Activity Details"
                                onAction={() => navigateTo(buildContextualRecordPath('/activity-detail', routeActivity.id))}
                            />
                        );
                    }
                }
                return <ActivityEdit 
                            mode={effectiveEditMode}
                            activity={routeActivity || undefined}
                            ipos={activityWorkflowIpos}
                            onBack={() => navigateTo(effectiveEditMode === 'create'
                                ? '/activities'
                                : buildContextualRecordPath('/activity-detail', routeActivity?.id))}
                            onUpdateActivity={(updated) => {
                                if (effectiveEditMode === 'create') {
                                     setActivities(prev => [...prev, updated]);
                                } else {
                                     setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
                                     setSelectedActivity(updated);
                                }
                            }}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType={
                                previousPage === '/trainings' ? 'Training' : 
                                previousPage === '/other-activities' ? 'Activity' : 
                                undefined
                            }
                        />;
            }
            case '/subproject-edit':
                if (selectedSubproject) {
                    const subprojectEditDecision = getStatusDecision({
                        moduleKey: 'subprojects',
                        item: selectedSubproject,
                        action: 'editDetails',
                        hasModuleAccess: hasAccess('Subprojects', 'edit'),
                    });
                    if (!subprojectEditDecision.allowed) {
                        return (
                            <DetailRouteFallback
                                title="Subproject editing is locked"
                                message={subprojectEditDecision.message}
                                actionLabel="Back to Subproject Details"
                                onAction={() => navigateTo(buildContextualRecordPath('/subproject-detail', selectedSubproject.id))}
                            />
                        );
                    }
                }
                return <SubprojectEdit 
                            subproject={selectedSubproject || undefined}
                            ipos={subprojectWorkflowIpos}
                            setIpos={(action) => {
                                setIpos(action);
                                setSubprojectWorkflowIpos(action);
                            }}
                            onBack={() => navigateTo(selectedSubproject
                                ? buildContextualRecordPath('/subproject-detail', selectedSubproject.id)
                                : '/subprojects')}
                            onUpdateSubproject={(updated) => {
                                if (selectedSubproject) {
                                     setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p));
                                     setSelectedSubproject(updated);
                                } else {
                                     setSubprojects(prev => [updated, ...prev]);
                                }
                                
                                // Sync commodities to IPO
                                if (updated.subprojectCommodities && updated.subprojectCommodities.length > 0) {
                                    setIpos(prev => prev.map(ipo => {
                                        if (ipo.name === updated.indigenousPeopleOrganization) {
                                            const newCommodities = [...ipo.commodities];
                                            let changed = false;
                                            updated.subprojectCommodities?.forEach(sc => {
                                                const exists = newCommodities.some(c => c.particular === sc.name && c.type === sc.typeName);
                                                if (!exists) {
                                                    newCommodities.push({
                                                        type: sc.typeName,
                                                        particular: sc.name,
                                                        value: sc.area,
                                                        isScad: false
                                                    });
                                                    changed = true;
                                                }
                                            });
                                            if (changed) return { ...ipo, commodities: newCommodities };
                                        }
                                        return ipo;
                                    }));
                                }
                            }}
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                            refCommodities={refCommodities}
                            refLivestock={refLivestock}
                        />;
            // NEW ACCOMPLISHMENT ROUTES
            case '/accomplishment/financial':
                return <FinancialAccomplishment 
                            subprojects={visibleSubprojects}
                            setSubprojects={setSubprojects}
                            activities={visibleActivities}
                            setActivities={setActivities}
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            onOpenIpoListForAncestralDomain={handleOpenIpoListForAncestralDomain}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/accomplishment/physical':
                return <PhysicalAccomplishment 
                            subprojects={visibleSubprojects}
                            setSubprojects={setSubprojects}
                            activities={visibleActivities}
                            setActivities={setActivities}
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onDataScopeChange={ensureDataScope}
                        />;
                
            case '/program-management/office-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleOfficeReqs, routeId);
                const latestOffice = routeId !== null
                    ? (selectedOfficeReq?.id === routeId ? (routeItem || selectedOfficeReq) : routeItem)
                    : selectedOfficeReq;
                if (!latestOffice) {
                    if (routeId === null) return <DetailRouteFallback title="No office requirement selected" message="Open an item from Office Requirements." actionLabel="Back to Office Requirements" onAction={() => navigateTo('/program-management/office-requirements')} />;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading office requirement..." />;
                    return (
                        <DetailRouteFallback
                            title="Office requirement not found"
                            message="This office requirement is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management/office-requirements')}
                        />
                    );
                }
                return <OfficeRequirementDetail 
                            item={latestOffice}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setOfficeReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedOfficeReq(updatedItem);
                            }}
                        />;
            }
            case '/program-management/staffing-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleStaffingReqs, routeId);
                const latestStaff = routeId !== null
                    ? (selectedStaffingReq?.id === routeId ? (routeItem || selectedStaffingReq) : routeItem)
                    : selectedStaffingReq;
                if (!latestStaff) {
                    if (routeId === null) return <DetailRouteFallback title="No staffing requirement selected" message="Open an item from Staffing Requirements." actionLabel="Back to Staffing Requirements" onAction={() => navigateTo('/program-management/staffing-requirements')} />;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading staffing requirement..." />;
                    return (
                        <DetailRouteFallback
                            title="Staffing requirement not found"
                            message="This staffing requirement is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management/staffing-requirements')}
                        />
                    );
                }
                return <StaffingRequirementDetail 
                            item={latestStaff}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setStaffingReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedStaffingReq(updatedItem);
                            }}
                        />;
            }
            case '/program-management/other-expense-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleOtherExpenses, routeId);
                const latestOther = routeId !== null
                    ? (selectedOtherExpense?.id === routeId ? (routeItem || selectedOtherExpense) : routeItem)
                    : selectedOtherExpense;
                if (!latestOther) {
                    if (routeId === null) return <DetailRouteFallback title="No program expense selected" message="Open an item from Other Expenses." actionLabel="Back to Other Expenses" onAction={() => navigateTo('/program-management/other-expenses')} />;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading other program expense..." />;
                    return (
                        <DetailRouteFallback
                            title="Program expense not found"
                            message="This program expense is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management/other-expenses')}
                        />
                    );
                }
                return <OtherExpenseDetail 
                            item={latestOther}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setOtherProgramExpenses(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedOtherExpense(updatedItem);
                            }}
                        />;
            }
            case '/ipo':
                return <IPOs 
                            ipos={ipos}
                            setIpos={setIpos} 
                            subprojects={subprojects} 
                            activities={activities}
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            gidaAreas={gidaAreas}
                            elcacAreas={elcacAreas}
                        />;
            case '/reports':
                return <Reports 
                            ipos={ipos} 
                            subprojects={visibleSubprojects} 
                            trainings={visibleActivities.filter(a => a.type === 'Training')}
                            otherActivities={visibleActivities.filter(a => a.type === 'Activity')}
                            officeReqs={visibleOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            deadlines={deadlines}
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectIpo={handleSelectIpo}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            onOpenIpoListForAncestralDomain={handleOpenIpoListForAncestralDomain}
                            onDataScopeChange={ensureDataScope}
                            reportState={reportsPageState}
                            onReportStateChange={setReportsPageState}
                        />;
            case '/subproject-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleSubprojects, routeId);
                const latestSp = routeId !== null
                    ? (selectedSubproject?.id === routeId ? (routeItem || selectedSubproject) : routeItem)
                    : selectedSubproject;
                if (!latestSp) {
                    if (routeId === null) return <DetailRouteFallback title="No subproject selected" message="Open a record from the Subprojects list." actionLabel="Back to Subprojects" onAction={() => navigateTo('/subprojects')} />;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading subproject..." />;
                    return (
                        <DetailRouteFallback
                            title="Subproject not found"
                            message="This subproject is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Subprojects"
                            onAction={() => navigateTo('/subprojects')}
                        />
                    );
                }
                return <SubprojectDetail 
                            subproject={latestSp} 
                            ipos={subprojectWorkflowIpos}
                            onEditModeChange={setSubprojectDetailMode}
                            onUpdateSubproject={(updated) => {
                                setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedSubproject(updated);

                                // Sync commodities to IPO
                                if (updated.subprojectCommodities && updated.subprojectCommodities.length > 0) {
                                    setIpos(prev => prev.map(ipo => {
                                        if (ipo.name === updated.indigenousPeopleOrganization) {
                                            const newCommodities = [...ipo.commodities];
                                            let changed = false;
                                            updated.subprojectCommodities?.forEach(sc => {
                                                const exists = newCommodities.some(c => c.particular === sc.name && c.type === sc.typeName);
                                                if (!exists) {
                                                    newCommodities.push({
                                                        type: sc.typeName,
                                                        particular: sc.name,
                                                        value: sc.area,
                                                        isScad: false
                                                    });
                                                    changed = true;
                                                }
                                            });
                                            if (changed) return { ...ipo, commodities: newCommodities };
                                        }
                                        return ipo;
                                    }));
                                }
                            }}
                            particularTypes={derivedParticularTypes}
                            uacsCodes={derivedUacsCodes}
                            commodityCategories={derivedCommodityCategories}
                            refCommodities={refCommodities}
                            refLivestock={refLivestock}
                        />;
            }
            case '/ipo-detail': {
                const routeId = getRouteId(routeParams);
                const latestIpo = routeId !== null
                    ? (selectedIpo?.id === routeId ? selectedIpo : ipos.find(ipo => ipo.id === routeId) || null)
                    : selectedIpo;
                if (!latestIpo) {
                    if (routeId !== null && (isRouteDataLoading || isDirectRouteLookupLoading)) return <LoadingState label="Loading IPO..." />;
                    return <DetailRouteFallback title={routeId === null ? 'No IPO selected' : 'IPO not found'} message={routeId === null ? 'Open an IPO from the IPO list.' : 'This IPO is no longer available, or it is outside your current visibility scope.'} actionLabel="Back to IPOs" onAction={() => navigateTo('/ipo')} />;
                }
                return <IPODetail 
                            ipo={latestIpo}
                            subprojects={ipoDetailLinkedDcfRecords.subprojects}
                            trainings={ipoDetailLinkedDcfRecords.trainings}
                            monitoringActivities={ipoDetailLinkedDcfRecords.monitoringActivities}
                            cachedMonitoringReports={ipoDetailLinkedDcfRecords.monitoringReports}
                            cachedMonitoringActions={ipoDetailLinkedDcfRecords.monitoringActions}
                            linkedDcfLoading={ipoLinkedDcfState?.ipoId === latestIpo.id ? ipoLinkedDcfState.loading : false}
                            linkedDcfError={ipoLinkedDcfState?.ipoId === latestIpo.id ? ipoLinkedDcfState.error : null}
                            marketingPartners={marketingPartners}
                            onUpdateIpo={(updated) => {
                                setIpos(prev => prev.map(i => i.id === updated.id ? updated : i));
                                setSelectedIpo(updated);
                            }}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onOpenMonitoringReport={handleOpenMonitoringReport}
                            onSelectLodYear={handleSelectIpoForLod}
                            onSelectMarketingPartner={handleSelectMarketingPartner}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                        />;
            }
            case '/activity-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleActivities, routeId);
                const latestAct = routeId !== null
                    ? (selectedActivity?.id === routeId ? (routeItem || selectedActivity) : routeItem)
                    : selectedActivity;
                if (!latestAct) {
                    if (routeId === null) return <DetailRouteFallback title="No activity selected" message="Open a record from the Activities list." actionLabel="Back to Activities" onAction={() => navigateTo('/activities')} />;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading activity..." />;
                    return (
                        <DetailRouteFallback
                            title="Activity not found"
                            message="This activity is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Activities"
                            onAction={() => navigateTo('/activities')}
                        />
                    );
                }
                return <ActivityDetail
                            activity={latestAct}
                            ipos={activityWorkflowIpos}
                            onUpdateActivity={(updated) => {
                                setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
                                setSelectedActivity(updated);
                            }}
                            onEdit={(mode) => {
                                setSelectedActivity(latestAct);
                                setActivityEditMode(mode);
                                navigateTo(buildContextualRecordPath('/activity-edit', latestAct.id, null, [['action', mode]]));
                            }}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            cachedMonitoringReports={activityMonitoringReports}
                            cachedMonitoringActions={activityMonitoringActions}
                            onSelectIpo={handleSelectIpo}
                            onOpenMonitoringReport={handleOpenMonitoringReport}
                        />;
            }
            case '/activity-monitoring-report': {
                const activityId = Number(routeParams.get('activityId'));
                const ipoId = Number(routeParams.get('ipoId'));
                const activity = selectedMonitoringReportContext?.activity.id === activityId
                    ? selectedMonitoringReportContext.activity
                    : (Number.isFinite(activityId) ? visibleActivities.find(item => item.id === activityId) : null);
                const ipo = selectedMonitoringReportContext?.ipo.id === ipoId
                    ? selectedMonitoringReportContext.ipo
                    : (Number.isFinite(ipoId) ? ipos.find(item => item.id === ipoId) : null);
                if (!activity || !ipo) {
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading monitoring report..." />;
                    return <DetailRouteFallback title="Monitoring report unavailable" message="The linked activity or IPO is unavailable in your current visibility scope." actionLabel="Back to Activities" onAction={() => navigateTo('/activities')} />;
                }
                const reportId = Number(routeParams.get('reportId'));
                const report = selectedMonitoringReportContext?.report
                    || (Number.isFinite(reportId) ? activityMonitoringReports.find(item => Number(item.id) === reportId) || null : null);
                return <ActivityMonitoringReportDetail
                            activity={activity}
                            ipo={ipo}
                            initialReport={report}
                            initialActions={report?.id
                                ? activityMonitoringActions.filter(action => Number(action.monitoring_report_id) === Number(report.id))
                                : []}
                        />;
            }
            case '/settings':
                return <Settings 
                            isDarkMode={isDarkMode} 
                            themePreference={themePreference}
                            onThemePreferenceChange={updateThemePreference}
                            deadlines={deadlines}
                            setDeadlines={setDeadlines}
                            // Pass data for DCF Management
                            subprojects={subprojects} setSubprojects={setSubprojects}
                            activities={activities} setActivities={setActivities}
                            ipos={ipos} setIpos={setIpos}
                            officeReqs={officeReqs} setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs} setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses} setOtherProgramExpenses={setOtherProgramExpenses}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectIpo={handleSelectIpo}
                        />;
            // NEW RESOURCE ROUTES
            case '/marketing-database':
                return <MarketingDatabase 
                            partners={marketingPartners}
                            setPartners={setMarketingPartners}
                            onSelectPartner={handleSelectMarketingPartner}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-profile-detail': {
                const routePartnerId = getRouteId(routeParams);
                const routePartner = routePartnerId !== null
                    ? (Number(selectedMarketingPartner?.id) === routePartnerId
                        ? selectedMarketingPartner
                        : marketingPartners.find(partner => Number(partner.id) === routePartnerId) || null)
                    : selectedMarketingPartner;
                if (!routePartner) {
                    if (routePartnerId !== null && (isRouteDataLoading || isDirectRouteLookupLoading)) return <LoadingState label="Loading marketing partner..." />;
                    return <DetailRouteFallback title={routePartnerId === null ? 'No marketing partner selected' : 'Marketing partner not found'} message={routePartnerId === null ? 'Open a partner from the Marketing Database.' : 'This marketing partner is unavailable or outside your visibility scope.'} actionLabel="Back to Marketing Database" onAction={() => navigateTo('/marketing-database')} />;
                }
                return <MarketProfileDetail 
                            partner={routePartner}
                            ipos={ipos}
                            onEditDetails={() => {
                                navigateTo(buildContextualRecordPath('/marketing-profile-edit', routePartner.id));
                            }}
                            onAddLinkage={() => {
                                navigateTo(buildContextualRecordPath('/marketing-linkage-edit', routePartner.id));
                            }}
                            onSelectLinkage={(linkageKey) => {
                                setSelectedMarketingLinkageKey(linkageKey);
                                navigateTo(buildContextualRecordPath('/marketing-linkage-detail', routePartner.id, null, [['linkageKey', linkageKey]]));
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            }
            case '/marketing-profile-edit': {
                const routePartnerId = getRouteId(routeParams);
                const routePartner = routePartnerId !== null
                    ? (Number(selectedMarketingPartner?.id) === routePartnerId ? selectedMarketingPartner : marketingPartners.find(partner => Number(partner.id) === routePartnerId) || null)
                    : selectedMarketingPartner;
                if (!routePartner) {
                    if (routePartnerId !== null && (isRouteDataLoading || isDirectRouteLookupLoading)) return <LoadingState label="Loading marketing partner..." />;
                    return <DetailRouteFallback title="Marketing partner unavailable" message="The selected marketing partner was not found or is outside your visibility scope." actionLabel="Back to Marketing Database" onAction={() => navigateTo('/marketing-database')} />;
                }
                return <MarketProfileEdit 
                            partner={routePartner}
                            onBack={() => navigateTo(buildContextualRecordPath('/marketing-profile-detail', routePartner.id))}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            }
            case '/marketing-linkage-edit': {
                const routePartnerId = getRouteId(routeParams);
                const routePartner = routePartnerId !== null
                    ? (Number(selectedMarketingPartner?.id) === routePartnerId ? selectedMarketingPartner : marketingPartners.find(partner => Number(partner.id) === routePartnerId) || null)
                    : selectedMarketingPartner;
                if (!routePartner) {
                    if (routePartnerId !== null && (isRouteDataLoading || isDirectRouteLookupLoading)) return <LoadingState label="Loading marketing partner..." />;
                    return <DetailRouteFallback title="Marketing partner unavailable" message="The selected marketing partner was not found or is outside your visibility scope." actionLabel="Back to Marketing Database" onAction={() => navigateTo('/marketing-database')} />;
                }
                return <MarketLinkageEdit 
                            partner={routePartner}
                            ipos={ipos}
                            onBack={() => navigateTo(buildContextualRecordPath('/marketing-profile-detail', routePartner.id))}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                        />;
            }
            case '/marketing-linkage-detail': {
                const routePartnerId = getRouteId(routeParams);
                const routePartner = routePartnerId !== null
                    ? (Number(selectedMarketingPartner?.id) === routePartnerId ? selectedMarketingPartner : marketingPartners.find(partner => Number(partner.id) === routePartnerId) || null)
                    : selectedMarketingPartner;
                const linkageKey = routeParams.get('linkageKey') ?? selectedMarketingLinkageKey;
                if (!routePartner) {
                    if (routePartnerId !== null && (isRouteDataLoading || isDirectRouteLookupLoading)) return <LoadingState label="Loading market linkage..." />;
                    return <DetailRouteFallback title="Marketing partner unavailable" message="The parent marketing partner was not found or is outside your visibility scope." actionLabel="Back to Marketing Database" onAction={() => navigateTo('/marketing-database')} />;
                }
                if (linkageKey === null || linkageKey === undefined || !(routePartner.marketingLinkages || []).some((linkage, index) => String(linkage.id ?? index) === String(linkageKey))) {
                    return <DetailRouteFallback title="Market linkage not found" message="The selected linkage is unavailable for this marketing partner." actionLabel="Back to Marketing Partner" onAction={() => navigateTo(buildContextualRecordPath('/marketing-profile-detail', routePartner.id))} />;
                }
                return <MarketLinkageDetail
                            partner={routePartner}
                            linkageKey={linkageKey}
                            ipos={ipos}
                            onBack={() => navigateTo(buildContextualRecordPath('/marketing-profile-detail', routePartner.id))}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                        />;
            }
            case '/level-of-development':
                return <LODPage onSelectIpo={handleSelectIpoForLod} />;
            case '/lod-details':
                {
                    const routeId = getRouteId(routeParams);
                    const routeYear = Number(routeParams.get('year'));
                    const assessmentYear = Number.isFinite(routeYear) && routeYear > 0 ? routeYear : selectedLodYear;
                    return <LODDetailsRoute
                        ipoId={routeId ?? selectedIpo?.id ?? null}
                        selectedIpo={selectedIpo}
                        onBack={handleBack}
                        initialYear={assessmentYear}
                    />;
                }
            case '/gender-and-development':
                return <GadPimmePage onSelectAssessment={handleSelectGadPimmeAssessment} />;
            case '/gender-and-development/detail':
                {
                    const routeOu = routeParams.get('ou');
                    const routeYear = Number(routeParams.get('year'));
                    return <GadPimmeDetailsRoute
                        operatingUnit={routeOu}
                        year={Number.isFinite(routeYear) ? routeYear : null}
                        onBack={() => navigateTo('/gender-and-development')}
                        onSelectYear={year => routeOu && handleSelectGadPimmeAssessment(routeOu, year)}
                    />;
                }
            case '/commodity-mapping':
                return <CommodityMappingPage subprojects={subprojects} ipos={ipos} />;
            default:
                return <div className="p-6">Page not found</div>;
        }
    };

    return (
        <div className="app-shell">
            <Sidebar 
                isOpen={isSidebarOpen} 
                closeSidebar={() => setIsSidebarOpen(false)} 
                currentPage={routePath} 
                setCurrentPage={navigateTo} 
            />
            <div className="app-workspace">
                <Header 
                    breadcrumbs={breadcrumbs}
                    returnContext={returnContext}
                    toggleSidebar={toggleSidebar} 
                    isDarkMode={isDarkMode} 
                    themePreference={themePreference}
                    onThemePreferenceChange={updateThemePreference}
                    setCurrentPage={navigateTo}
                    onRefreshData={refreshAllData}
                    onClearLocalCache={clearLocalCache}
                    isRefreshingData={isGlobalRefreshing}
                    lastDataRefreshAt={globalLastRefreshedAt}
                    dataRefreshError={globalRefreshError}
                    cacheStatus={globalCacheStatus}
                />
                <main className="app-main">
                    {renderPage()}
                </main>
                <AIChatbot 
                    subprojects={subprojects}
                    ipos={ipos}
                    activities={activities}
                    marketingPartners={marketingPartners}
                    officeReqs={officeReqs}
                    staffingReqs={staffingReqs}
                    otherProgramExpenses={otherProgramExpenses}
                    budgetCeilings={budgetCeilings}
                    onNavigate={handleNavigate}
                    onSelectSubproject={handleSelectSubproject}
                    onSelectIpo={handleSelectIpo}
                    onSelectActivity={handleSelectActivity}
                    onSelectMarketingPartner={handleSelectMarketingPartner}
                    onApplyFilter={handleApplyFilter}
                />
            </div>
        </div>
    );
};

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <DcfPolicyProvider>
                <AppContent />
            </DcfPolicyProvider>
        </AuthProvider>
    );
};
