
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
import Reports, { ReportsPageState } from './components/Reports';
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
import LODDetails from './components/LOD/LODDetails';
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
import { emptyIpoLinkedDcfRecords, fetchIpoLinkedDcfRecords, IpoLinkedDcfRecords } from './lib/ipoLinkedDcfRecords';
import { fetchWorkflowEntityById, fetchWorkflowIpos } from './lib/workflowLookups';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings,
    Deadline, PlanningSchedule, ReferenceActivity, MarketingPartner, GidaArea, ElcacArea, RefCommodity, RefLivestock, RefEquipment,
    RefInput, RefInfrastructure, RefTrainingReference, ActivityMonitoringAction, ActivityMonitoringReport, operatingUnits
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

// Helper to format page names for "Back to..." buttons
const getPageName = (path: string) => {
    const routePath = parseAppRoute(path).path;
    if (routePath === '/') return 'Dashboard';
    if (routePath === '/ipo-detail') return 'IPO Details';
    if (routePath === '/ipo') return 'IPO List';
    if (routePath === '/activity-detail') return 'Activity Details';
    if (routePath === '/program-management') return 'Program Management';
    if (routePath === '/marketing-database') return 'Marketing Database';
    if (routePath === '/marketing-profile-detail') return 'Partner Profile';
    
    // Generic formatter: remove slash, replace hyphens with spaces, capitalize words
    return routePath.substring(1)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
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
                default: return null;
            }
        })();
        if (!target || !hasAccess(target.module, 'view') || target.items.some(item => item.id === id)) return;
        const lookupKey = `${target.table}:${id}:${currentUser.id}`;
        if (directRouteLookupKeyRef.current === lookupKey) return;
        directRouteLookupKeyRef.current = lookupKey;
        let cancelled = false;
        setIsDirectRouteLookupLoading(true);
        void fetchWorkflowEntityById<any>(target.table, id, {
            canViewAllOperatingUnits: getVisibilityScope(target.module) === 'All',
            operatingUnit: currentUser.operatingUnit
        }).then(record => {
            if (!cancelled && record) (target.select as React.Dispatch<React.SetStateAction<any>>)(record);
        }).catch(error => {
            console.error(`Failed to resolve ${target.table} route ${id}:`, error);
        }).finally(() => {
            if (!cancelled) setIsDirectRouteLookupLoading(false);
        });
        return () => { cancelled = true; };
    }, [activities, currentUser, getVisibilityScope, hasAccess, officeReqs, otherProgramExpenses, routeParams, routePath, staffingReqs, subprojects]);
    
    // Activity Edit Mode State
    const [activityEditMode, setActivityEditMode] = useState<'create' | 'details' | 'expenses' | 'accomplishment'>('create');
    
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
        const handlePopState = (event: PopStateEvent) => {
            const leavingPage = parseAppRoute(currentPageRef.current).path;
            
            if (leavingPage === '/subproject-detail') setSelectedSubproject(null);
            if (leavingPage === '/activity-detail') setSelectedActivity(null);
            if (leavingPage === '/activity-monitoring-report') setSelectedMonitoringReportContext(null);
            if (leavingPage === '/ipo-detail') setSelectedIpo(null);
            if (leavingPage === '/program-management/office-detail') setSelectedOfficeReq(null);
            if (leavingPage === '/program-management/staffing-detail') setSelectedStaffingReq(null);
            if (leavingPage === '/program-management/other-expense-detail') setSelectedOtherExpense(null);
            if (leavingPage === '/marketing-profile-detail') {
                const nextPage = event.state?.page || window.location.hash.replace('#', '') || '/';
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
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        navigateTo(buildDetailPath('/subproject-detail', project.id));
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        navigateTo('/ipo-detail');
    };

    const handleOpenIpoListForAncestralDomain = (adNo: string) => {
        setExternalFilters({ ancestralDomainNo: adNo });
        navigateTo('/ipo');
    };

    const handleSelectActivity = (activity: Activity) => {
        setSelectedActivity(activity);
        navigateTo(buildDetailPath('/activity-detail', activity.id));
    };

    const handleOpenMonitoringReport = (activity: Activity, ipo: IPO, report?: ActivityMonitoringReport | null) => {
        setSelectedMonitoringReportContext({ activity, ipo, report: report || null });
        navigateTo('/activity-monitoring-report');
    };

    const handleSelectOfficeReq = (req: OfficeRequirement) => {
        setSelectedOfficeReq(req);
        navigateTo(buildDetailPath('/program-management/office-detail', req.id));
    };

    const handleSelectStaffingReq = (req: StaffingRequirement) => {
        setSelectedStaffingReq(req);
        navigateTo(buildDetailPath('/program-management/staffing-detail', req.id));
    };

    const handleSelectOtherExpense = (req: OtherProgramExpense) => {
        setSelectedOtherExpense(req);
        navigateTo(buildDetailPath('/program-management/other-expense-detail', req.id));
    };

    const handleSelectMarketingPartner = (partner: MarketingPartner) => {
        setSelectedMarketingPartner(partner);
        navigateTo('/marketing-profile-detail');
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
        navigateTo('/lod-details');
    };

    const renderPage = () => {
        const checkAccess = (module: string) => hasAccess(module, 'view');
        const denied = <AccessDenied onBackToHome={() => navigateTo('/')} />;

        // Phase 6: Guard clauses for module-level access
        if (routePath === '/dashboards' && !checkAccess('Dashboards')) return denied;
        if (routePath === '/reports' && !checkAccess('Reports')) return denied;
        
        if (['/subprojects', '/subproject-edit', '/subproject-detail'].includes(routePath)) {
            if (!checkAccess('Subprojects')) return denied;
        }
        if (['/trainings', '/other-activities', '/activities', '/activity-edit', '/activity-detail', '/activity-monitoring-report'].includes(routePath)) {
            if (!checkAccess('Activities')) return denied;
        }
        if (['/program-management', '/program-management/office-detail', '/program-management/staffing-detail', '/program-management/other-expense-detail'].includes(routePath)) {
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
        if (routePath === '/commodity-mapping') {
            if (!checkAccess('Commodity Mapping')) return denied;
        }
        if (routePath === '/references' && !checkAccess('References')) return denied;
        if (routePath === '/settings' && !checkAccess('System Management')) {
             // System Management is for the whole settings tab, but maybe we should allow profiles?
             // Usually settings has profile. Let's see.
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
            case '/dashboards':
                 return <DashboardsPage 
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
                            setExternalFilters={setExternalFilters}
                            navigateTo={navigateTo}
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
            case '/activity-edit':
                if (activityEditMode !== 'create' && selectedActivity) {
                    const activityEditDecision = activityEditMode === 'details'
                        ? getStatusDecision({ moduleKey: 'activities', item: selectedActivity, action: 'editDetails', hasModuleAccess: hasAccess('Activities', 'edit') })
                        : activityEditMode === 'expenses'
                            ? getStatusDecision({ moduleKey: 'activities', item: selectedActivity, action: 'editBudget', hasModuleAccess: hasAccess('Activities', 'edit') })
                            : (
                                getStatusDecision({ moduleKey: 'activities', item: selectedActivity, action: 'editPhysicalAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Physical', 'edit') }).allowed
                                    ? getStatusDecision({ moduleKey: 'activities', item: selectedActivity, action: 'editPhysicalAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Physical', 'edit') })
                                    : getStatusDecision({ moduleKey: 'activities', item: selectedActivity, action: 'editFinancialAccomplishment', hasModuleAccess: hasAccess('Accomplishment - Financial', 'edit') })
                            );
                    if (!activityEditDecision.allowed) {
                        return (
                            <DetailRouteFallback
                                title="Activity editing is locked"
                                message={activityEditDecision.message}
                                actionLabel="Back to Activity Details"
                                onAction={() => navigateTo(buildDetailPath('/activity-detail', selectedActivity.id))}
                            />
                        );
                    }
                }
                return <ActivityEdit 
                            mode={activityEditMode}
                            activity={selectedActivity || undefined}
                            ipos={activityWorkflowIpos}
                            onBack={handleBack}
                            onUpdateActivity={(updated) => {
                                if (activityEditMode === 'create') {
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
                                onAction={() => navigateTo(buildDetailPath('/subproject-detail', selectedSubproject.id))}
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
                            onBack={handleBack}
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
            case '/program-management':
                return <ProgramManagement
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            // @ts-ignore
                            externalFilters={externalFilters}
                            onDataScopeChange={ensureDataScope}
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
                    if (routeId === null) return <div>Select an item</div>;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading office requirement..." />;
                    return (
                        <DetailRouteFallback
                            title="Office requirement not found"
                            message="This office requirement is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management')}
                        />
                    );
                }
                return <OfficeRequirementDetail 
                            item={latestOffice}
                            onBack={handleBack}
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
                    if (routeId === null) return <div>Select an item</div>;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading staffing requirement..." />;
                    return (
                        <DetailRouteFallback
                            title="Staffing requirement not found"
                            message="This staffing requirement is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management')}
                        />
                    );
                }
                return <StaffingRequirementDetail 
                            item={latestStaff}
                            onBack={handleBack}
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
                    if (routeId === null) return <div>Select an item</div>;
                    if (isRouteDataLoading || isDirectRouteLookupLoading) return <LoadingState label="Loading other program expense..." />;
                    return (
                        <DetailRouteFallback
                            title="Program expense not found"
                            message="This program expense is no longer available, or it is outside your current visibility scope."
                            actionLabel="Back to Program Management"
                            onAction={() => navigateTo('/program-management')}
                        />
                    );
                }
                return <OtherExpenseDetail 
                            item={latestOther}
                            onBack={handleBack}
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
            case '/references':
                return <References 
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
                    if (routeId === null) return <div>Select a subproject</div>;
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
                            onBack={handleBack} 
                            previousPageName={getPageName(previousPage)}
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
            case '/ipo-detail':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <IPODetail 
                            ipo={selectedIpo} 
                            subprojects={ipoDetailLinkedDcfRecords.subprojects}
                            trainings={ipoDetailLinkedDcfRecords.trainings}
                            monitoringActivities={ipoDetailLinkedDcfRecords.monitoringActivities}
                            cachedMonitoringReports={ipoDetailLinkedDcfRecords.monitoringReports}
                            cachedMonitoringActions={ipoDetailLinkedDcfRecords.monitoringActions}
                            linkedDcfLoading={ipoLinkedDcfState?.ipoId === selectedIpo.id ? ipoLinkedDcfState.loading : false}
                            linkedDcfError={ipoLinkedDcfState?.ipoId === selectedIpo.id ? ipoLinkedDcfState.error : null}
                            marketingPartners={marketingPartners}
                            onBack={handleBack}
                            previousPageName={getPageName(previousPage)}
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
            case '/activity-detail': {
                const routeId = getRouteId(routeParams);
                const routeItem = findByRouteId(visibleActivities, routeId);
                const latestAct = routeId !== null
                    ? (selectedActivity?.id === routeId ? (routeItem || selectedActivity) : routeItem)
                    : selectedActivity;
                if (!latestAct) {
                    if (routeId === null) return <div>Select an activity</div>;
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
                            onBack={handleBack} 
                            previousPageName={getPageName(previousPage)}
                            onUpdateActivity={(updated) => {
                                setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
                                setSelectedActivity(updated);
                            }}
                            onEdit={(mode) => {
                                setSelectedActivity(latestAct);
                                setActivityEditMode(mode);
                                navigateTo('/activity-edit');
                            }}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            cachedMonitoringReports={activityMonitoringReports}
                            cachedMonitoringActions={activityMonitoringActions}
                            onSelectIpo={handleSelectIpo}
                            onOpenMonitoringReport={handleOpenMonitoringReport}
                        />;
            }
            case '/activity-monitoring-report':
                if (!selectedMonitoringReportContext) return <div>Select a monitoring report</div>;
                return <ActivityMonitoringReportDetail
                            activity={selectedMonitoringReportContext.activity}
                            ipo={selectedMonitoringReportContext.ipo}
                            initialReport={selectedMonitoringReportContext.report}
                            initialActions={selectedMonitoringReportContext.report?.id
                                ? activityMonitoringActions.filter(action => Number(action.monitoring_report_id) === Number(selectedMonitoringReportContext.report?.id))
                                : []}
                            onBack={handleBack}
                        />;
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
            case '/marketing-profile-detail':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketProfileDetail 
                            partner={selectedMarketingPartner}
                            ipos={ipos}
                            onBack={handleBack}
                            onEditDetails={() => {
                                navigateTo('/marketing-profile-edit');
                            }}
                            onAddLinkage={() => {
                                navigateTo('/marketing-linkage-edit');
                            }}
                            onSelectLinkage={(linkageKey) => {
                                setSelectedMarketingLinkageKey(linkageKey);
                                navigateTo('/marketing-linkage-detail');
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-profile-edit':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketProfileEdit 
                            partner={selectedMarketingPartner}
                            onBack={handleBack}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-linkage-edit':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketLinkageEdit 
                            partner={selectedMarketingPartner}
                            ipos={ipos}
                            onBack={handleBack}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                        />;
            case '/marketing-linkage-detail':
                if (!selectedMarketingPartner || selectedMarketingLinkageKey === null) return <div>Select a market linkage</div>;
                return <MarketLinkageDetail
                            partner={selectedMarketingPartner}
                            linkageKey={selectedMarketingLinkageKey}
                            ipos={ipos}
                            onBack={handleBack}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                        />;
            case '/level-of-development':
                return <LODPage ipos={ipos} onSelectIpo={handleSelectIpoForLod} />;
            case '/lod-details':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <LODDetails ipo={selectedIpo} onBack={handleBack} initialYear={selectedLodYear} />;
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
