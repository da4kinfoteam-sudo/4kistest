export type DashboardPageKey =
    | 'Physical'
    | 'Financial'
    | 'SCAD'
    | 'Agricultural Interventions'
    | 'Farm Productivity and Income'
    | 'Commodities'
    | 'IPO Level of Development'
    | 'GAD'
    | 'Nutrition'
    | 'Awards and Rankings';

export type ProgramManagementPageKey = 'Office' | 'Staffing' | 'Other';

export type ReferencePageKey =
    | 'UACS'
    | 'Items'
    | 'Crop Reference'
    | 'Livestock Reference'
    | 'Agricultural Input Reference'
    | 'Equipment Reference'
    | 'Infrastructure Reference'
    | 'Training Reference'
    | 'GIDA'
    | 'ELCAC';

export interface RoutePageDefinition<TPage extends string> {
    id: string;
    label: string;
    sidebarLabel?: string;
    page: TPage;
    route: string;
    activeMatchPaths?: readonly string[];
    allowedRoles?: readonly string[];
}

export const dashboardPages: readonly RoutePageDefinition<DashboardPageKey>[] = [
    { id: 'dashboard-physical', label: 'Physical', page: 'Physical', route: '/dashboards/physical' },
    { id: 'dashboard-financial', label: 'Financial', page: 'Financial', route: '/dashboards/financial' },
    { id: 'dashboard-scad', label: 'SCAD', page: 'SCAD', route: '/dashboards/scad' },
    { id: 'dashboard-agricultural-interventions', label: 'Agricultural Interventions', page: 'Agricultural Interventions', route: '/dashboards/agricultural-interventions' },
    { id: 'dashboard-farm-productivity-income', label: 'Farm Productivity and Income', sidebarLabel: 'FPI', page: 'Farm Productivity and Income', route: '/dashboards/farm-productivity-income' },
    { id: 'dashboard-commodities', label: 'Commodities', page: 'Commodities', route: '/dashboards/commodities' },
    { id: 'dashboard-ipo-level-development', label: 'IPO Level of Development', sidebarLabel: 'IPO LOD', page: 'IPO Level of Development', route: '/dashboards/ipo-level-development' },
    { id: 'dashboard-gad', label: 'GAD', page: 'GAD', route: '/dashboards/gad' },
    { id: 'dashboard-nutrition', label: 'Nutrition', page: 'Nutrition', route: '/dashboards/nutrition' },
    {
        id: 'dashboard-awards-rankings',
        label: 'Awards and Rankings',
        page: 'Awards and Rankings',
        route: '/dashboards/awards-rankings',
        allowedRoles: ['Super Admin', 'Administrator']
    }
];

export const programManagementPages: readonly RoutePageDefinition<ProgramManagementPageKey>[] = [
    {
        id: 'program-office-requirements',
        label: 'Office Requirements',
        page: 'Office',
        route: '/program-management/office-requirements',
        activeMatchPaths: ['/program-management/office-detail']
    },
    {
        id: 'program-staffing-requirements',
        label: 'Staffing Requirements',
        page: 'Staffing',
        route: '/program-management/staffing-requirements',
        activeMatchPaths: ['/program-management/staffing-detail']
    },
    {
        id: 'program-other-expenses',
        label: 'Other Expenses',
        page: 'Other',
        route: '/program-management/other-expenses',
        activeMatchPaths: ['/program-management/other-expense-detail']
    }
];

export interface ReferenceNavigationGroup {
    id: string;
    label: string;
    pages: readonly RoutePageDefinition<ReferencePageKey>[];
}

export const referenceNavigationGroups: readonly ReferenceNavigationGroup[] = [
    {
        id: 'references-dcf',
        label: 'DCF References',
        pages: [
            { id: 'references-uacs', label: 'UACS Codes', page: 'UACS', route: '/references/uacs-codes' },
            { id: 'references-subproject-items', label: 'Subproject Items', page: 'Items', route: '/references/subproject-items' }
        ]
    },
    {
        id: 'references-commodity',
        label: 'Commodity References',
        pages: [
            { id: 'references-crops', label: 'Crop', page: 'Crop Reference', route: '/references/crops' },
            { id: 'references-livestock', label: 'Livestock', page: 'Livestock Reference', route: '/references/livestock' }
        ]
    },
    {
        id: 'references-intervention',
        label: 'Intervention References',
        pages: [
            { id: 'references-agricultural-inputs', label: 'Agricultural Inputs', page: 'Agricultural Input Reference', route: '/references/agricultural-inputs' },
            { id: 'references-equipment', label: 'Equipment', page: 'Equipment Reference', route: '/references/equipment' },
            { id: 'references-infrastructure', label: 'Infrastructure', page: 'Infrastructure Reference', route: '/references/infrastructure' },
            { id: 'references-training', label: 'Training', page: 'Training Reference', route: '/references/training' }
        ]
    },
    {
        id: 'references-policy',
        label: 'Policy References',
        pages: [
            { id: 'references-gida', label: 'GIDA Areas', page: 'GIDA', route: '/references/gida-areas' },
            { id: 'references-elcac', label: 'ELCAC Areas', page: 'ELCAC', route: '/references/elcac-areas' }
        ]
    }
];

export const referencePages: readonly RoutePageDefinition<ReferencePageKey>[] = referenceNavigationGroups.flatMap(group => group.pages);

export type NavigationItemKind = 'link' | 'section' | 'disclosure' | 'group';

export interface AppNavigationItem {
    id: string;
    name: string;
    title?: string;
    kind: NavigationItemKind;
    href?: string;
    module?: string;
    hiddenFor?: readonly string[];
    allowedRoles?: readonly string[];
    activeMatchPaths?: readonly string[];
    children?: readonly AppNavigationItem[];
}

const pageToNavigationItem = <TPage extends string>(
    page: RoutePageDefinition<TPage>,
    module: string,
    hiddenFor?: readonly string[]
): AppNavigationItem => ({
    id: page.id,
    name: page.sidebarLabel || page.label,
    title: page.sidebarLabel ? page.label : undefined,
    kind: 'link',
    href: page.route,
    module,
    hiddenFor,
    allowedRoles: page.allowedRoles,
    activeMatchPaths: page.activeMatchPaths
});

export const appNavigationStructure: readonly AppNavigationItem[] = [
    { id: 'homepage', name: 'Homepage', kind: 'link', href: '/' },
    {
        id: 'reports-section',
        name: 'Reports',
        kind: 'section',
        children: [
            {
                id: 'dashboard-group',
                name: 'Dashboard',
                kind: 'disclosure',
                module: 'Dashboards',
                children: dashboardPages.map(page => pageToNavigationItem(page, 'Dashboards'))
            },
            { id: 'reports', name: 'Reports', kind: 'link', href: '/reports', module: 'Reports' }
        ]
    },
    {
        id: 'data-collection-section',
        name: 'Data Collection Forms',
        kind: 'section',
        children: [
            { id: 'subprojects', name: 'Subprojects', kind: 'link', href: '/subprojects', module: 'Subprojects' },
            { id: 'activities', name: 'Activities', kind: 'link', href: '/activities', module: 'Activities' },
            {
                id: 'program-management-group',
                name: 'Program Management',
                kind: 'disclosure',
                module: 'Program Management',
                children: programManagementPages.map(page => pageToNavigationItem(page, 'Program Management'))
            }
        ]
    },
    {
        id: 'accomplishment-section',
        name: 'Accomplishment Forms',
        kind: 'section',
        children: [
            { id: 'accomplishment-financial', name: 'Financial', kind: 'link', href: '/accomplishment/financial', module: 'Accomplishment - Financial' },
            { id: 'accomplishment-physical', name: 'Physical', kind: 'link', href: '/accomplishment/physical', module: 'Accomplishment - Physical' }
        ]
    },
    { id: 'ipo', name: 'IPOs', title: 'Indigenous Peoples Organization', kind: 'link', href: '/ipo', module: 'IPO Management' },
    {
        id: 'resources-section',
        name: 'Resources',
        kind: 'section',
        children: [
            { id: 'marketing-database', name: 'Marketing Database', kind: 'link', href: '/marketing-database', module: 'Marketing Database' },
            { id: 'level-of-development', name: 'Level of Development', kind: 'link', href: '/level-of-development', module: 'Level of Development' },
            { id: 'gender-and-development', name: 'Gender and Development', kind: 'link', href: '/gender-and-development', module: 'Gender and Development' },
            { id: 'commodity-mapping', name: 'Commodity Mapping', kind: 'link', href: '/commodity-mapping', module: 'Commodity Mapping' },
            {
                id: 'references-group',
                name: 'References',
                kind: 'disclosure',
                module: 'References',
                hiddenFor: ['Management'],
                children: referenceNavigationGroups.map(group => ({
                    id: group.id,
                    name: group.label,
                    kind: 'group' as const,
                    module: 'References',
                    hiddenFor: ['Management'],
                    children: group.pages.map(page => pageToNavigationItem(page, 'References', ['Management']))
                }))
            }
        ]
    }
];

const isRoleAllowed = (page: RoutePageDefinition<string>, role?: string | null) =>
    !page.allowedRoles || (!!role && page.allowedRoles.includes(role));

const resolvePage = <TPage extends string>(
    pages: readonly RoutePageDefinition<TPage>[],
    path: string,
    role?: string | null
) => pages.find(page => page.route === path && isRoleAllowed(page, role)) || pages[0];

export const isDashboardPagePath = (path: string) => path === '/dashboards' || path.startsWith('/dashboards/');

const programManagementDetailPaths = new Set(programManagementPages.flatMap(page => page.activeMatchPaths || []));

export const isProgramManagementPagePath = (path: string) =>
    (path === '/program-management' || path.startsWith('/program-management/')) && !programManagementDetailPaths.has(path);

export const isReferencePagePath = (path: string) => path === '/references' || path.startsWith('/references/');

export const resolveDashboardPage = (path: string, role?: string | null) => resolvePage(dashboardPages, path, role);
export const resolveProgramManagementPage = (path: string) => resolvePage(programManagementPages, path);
export const resolveReferencePage = (path: string) => resolvePage(referencePages, path);

export const getCanonicalModuleRoute = (path: string, role?: string | null): string | null => {
    if (isDashboardPagePath(path)) return resolveDashboardPage(path, role).route;
    if (isProgramManagementPagePath(path)) return resolveProgramManagementPage(path).route;
    if (isReferencePagePath(path)) return resolveReferencePage(path).route;
    return null;
};

export const getNavigationPageTitle = (path: string, role?: string | null): string | null => {
    if (isDashboardPagePath(path)) return `${(dashboardPages.find(page => page.route === path) || resolveDashboardPage(path, role)).label} Dashboard`;
    if (isProgramManagementPagePath(path)) return (programManagementPages.find(page => page.route === path) || programManagementPages[0]).label;
    if (isReferencePagePath(path)) return (referencePages.find(page => page.route === path) || referencePages[0]).label;
    const detailPage = programManagementPages.find(page => page.activeMatchPaths?.includes(path));
    return detailPage ? detailPage.label : null;
};

export interface AppBreadcrumb {
    label: string;
    path?: string;
}

export interface AppReturnContext {
    compactLabel: string;
    label: string;
    path: string;
}

export type AppEntityOrigin = 'ipo' | 'activity';

const reportReturnSources = [
    { view: 'wfp', tab: 'WFP', label: 'WFP Report' },
    { view: 'bp-forms', tab: 'BP Forms', label: 'BP Forms Report' },
    { view: 'beds', tab: 'BEDS', label: 'BEDS Report' },
    { view: 'pics', tab: 'PICS', label: 'PICS Report' },
    { view: 'bar1', tab: 'BAR1', label: 'BAR1 Report' },
    { view: 'budget-utilization', tab: 'Budget Utilization Report', label: 'Budget Utilization Report' },
    { view: 'monthly-matrix', tab: 'Monthly Matrix', label: 'Monthly Matrix Report' },
    { view: 'detailed-accomplishment', tab: 'Detailed Accomplishment Data', label: 'Detailed Accomplishment Report' },
    { view: 'financial-audit', tab: 'Financial Audit', label: 'Financial Audit Report' },
] as const;

const dashboardReturnSources = dashboardPages.map(page => ({
    view: page.route.replace('/dashboards/', ''),
    route: page.route,
    label: `${page.label} Dashboard`,
}));

export const getReportSourceView = (tab: string): string | null =>
    reportReturnSources.find(source => source.tab === tab)?.view || null;

export const getReportTabFromSourceView = (view: string | null): string | null =>
    reportReturnSources.find(source => source.view === view)?.tab || null;

export const getDashboardSourceView = (path: string): string | null =>
    dashboardReturnSources.find(source => source.route === path)?.view
    || (path === '/dashboards' ? dashboardReturnSources[0]?.view || null : null);

export const resolveAppReturnContext = (params?: URLSearchParams): AppReturnContext | null => {
    const source = params?.get('source');
    const sourceView = params?.get('sourceView');
    if (!source || !sourceView) return null;

    if (source === 'report') {
        const definition = reportReturnSources.find(candidate => candidate.view === sourceView);
        if (!definition) return null;
        return {
            compactLabel: definition.label,
            label: `Return to ${definition.label}`,
            path: `/reports?report=${encodeURIComponent(definition.view)}`,
        };
    }

    if (source === 'dashboard') {
        const definition = dashboardReturnSources.find(candidate => candidate.view === sourceView);
        if (!definition) return null;
        return {
            compactLabel: definition.label,
            label: `Return to ${definition.label}`,
            path: definition.route,
        };
    }

    return null;
};

export interface AppBreadcrumbEntity {
    id?: number | string | null;
    label?: string | null;
}

export interface AppBreadcrumbContext {
    activity?: AppBreadcrumbEntity | null;
    activityEditMode?: 'create' | 'details' | 'expenses' | 'accomplishment';
    gadOperatingUnit?: string | null;
    gadYear?: number | null;
    ipo?: AppBreadcrumbEntity | null;
    lodYear?: number | null;
    marketingLinkageLabel?: string | null;
    marketingPartner?: AppBreadcrumbEntity | null;
    monitoringIpo?: AppBreadcrumbEntity | null;
    originActivity?: AppBreadcrumbEntity | null;
    originIpo?: AppBreadcrumbEntity | null;
    officeRequirement?: AppBreadcrumbEntity | null;
    otherProgramExpense?: AppBreadcrumbEntity | null;
    staffingRequirement?: AppBreadcrumbEntity | null;
    subproject?: AppBreadcrumbEntity | null;
    subprojectDetailMode?: 'none' | 'details' | 'commodity' | 'budget' | 'accomplishment';
}

const breadcrumbEntityLabel = (
    entity: AppBreadcrumbEntity | null | undefined,
    fallbackPrefix: string,
    routeId?: string | null,
) => entity?.label?.trim() || (entity?.id !== undefined && entity?.id !== null
    ? `${fallbackPrefix} ${entity.id}`
    : routeId
        ? `${fallbackPrefix} ${routeId}`
        : fallbackPrefix);

const detailPath = (path: string, id?: string | number | null) => (
    id === undefined || id === null || id === '' ? path : `${path}?id=${encodeURIComponent(String(id))}`
);

const appendRouteParams = (
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

const sourceParams = (params?: URLSearchParams) => [
    ['source', params?.get('source')],
    ['sourceView', params?.get('sourceView')],
] as Array<[string, string | null | undefined]>;

const contextualPath = (
    path: string,
    params?: URLSearchParams,
    extra: Array<[string, string | number | null | undefined]> = [],
) => appendRouteParams(path, [...sourceParams(params), ...extra]);

const withRoot = (...items: AppBreadcrumb[]): AppBreadcrumb[] => [
    { label: '4KIS', path: '/' },
    ...items,
];

const subprojectModeLabel: Record<Exclude<AppBreadcrumbContext['subprojectDetailMode'], undefined | 'none'>, string> = {
    details: 'Edit Details',
    commodity: 'Edit Commodities',
    budget: 'Edit Budget',
    accomplishment: 'Edit Accomplishment',
};

const activityModeLabel: Record<Exclude<AppBreadcrumbContext['activityEditMode'], undefined | 'create'>, string> = {
    details: 'Edit Details',
    expenses: 'Edit Expenses',
    accomplishment: 'Edit Accomplishment',
};

export const resolveAppBreadcrumbs = ({
    path,
    params,
    role,
    context = {},
}: {
    path: string;
    params?: URLSearchParams;
    role?: string | null;
    context?: AppBreadcrumbContext;
}): AppBreadcrumb[] => {
    if (path === '/') return [{ label: '4KIS' }];

    const routeId = params?.get('id') || null;
    const origin = params?.get('origin') as AppEntityOrigin | null;
    const originId = params?.get('originId') || null;
    const selectedYear = Number(params?.get('year'));
    const originIpo = origin === 'ipo' && originId && context.originIpo ? context.originIpo : null;
    const originActivity = origin === 'activity' && originId && context.originActivity ? context.originActivity : null;

    const ipoOrigin = (current: AppBreadcrumb, ...tail: AppBreadcrumb[]) => withRoot(
        { label: 'IPOs', path: '/ipo' },
        {
            label: breadcrumbEntityLabel(originIpo, 'IPO', originId),
            path: contextualPath(detailPath('/ipo-detail', originIpo?.id ?? originId), params),
        },
        current,
        ...tail,
    );

    const activityOrigin = (current: AppBreadcrumb, ...tail: AppBreadcrumb[]) => withRoot(
        { label: 'Activities', path: '/activities' },
        {
            label: breadcrumbEntityLabel(originActivity, 'Activity', originId),
            path: contextualPath(detailPath('/activity-detail', originActivity?.id ?? originId), params),
        },
        current,
        ...tail,
    );
    const dashboardPage = dashboardPages.find(page => page.route === path);
    if (dashboardPage || path === '/dashboards') {
        const resolved = dashboardPage || resolveDashboardPage(path, role);
        return withRoot(
            { label: 'Dashboards', path: '/dashboards' },
            { label: `${resolved.label} Dashboard` },
        );
    }

    const programPage = programManagementPages.find(page => page.route === path);
    if (programPage) {
        return withRoot(
            { label: 'Program Management', path: '/program-management' },
            { label: programPage.label },
        );
    }

    const referencePage = referencePages.find(page => page.route === path);
    if (referencePage) {
        return withRoot(
            { label: 'References', path: '/references' },
            { label: referencePage.label },
        );
    }

    if (path === '/subprojects') return withRoot({ label: 'Subprojects' });
    if (path === '/subproject-detail') {
        const current = { label: breadcrumbEntityLabel(context.subproject, 'Subproject', routeId) };
        const action = context.subprojectDetailMode && context.subprojectDetailMode !== 'none'
            ? [{ label: subprojectModeLabel[context.subprojectDetailMode] }]
            : [];
        if (originIpo) return ipoOrigin(current, ...action);
        return withRoot(
            { label: 'Subprojects', path: '/subprojects' },
            current,
            ...action,
        );
    }
    if (path === '/subproject-edit') {
        if (!context.subproject) return withRoot({ label: 'Subprojects', path: '/subprojects' }, { label: 'Add Subproject' });
        if (originIpo) return ipoOrigin(
            {
                label: breadcrumbEntityLabel(context.subproject, 'Subproject'),
                path: contextualPath(detailPath('/subproject-detail', context.subproject.id), params, [
                    ['origin', 'ipo'],
                    ['originId', originIpo.id],
                ]),
            },
            { label: 'Edit Details' },
        );
        return withRoot(
            { label: 'Subprojects', path: '/subprojects' },
            {
                label: breadcrumbEntityLabel(context.subproject, 'Subproject'),
                path: detailPath('/subproject-detail', context.subproject.id),
            },
            { label: 'Edit Details' },
        );
    }

    if (['/activities', '/trainings', '/other-activities'].includes(path)) {
        const label = path === '/trainings' ? 'Trainings' : path === '/other-activities' ? 'Other Activities' : 'Activities';
        return withRoot({ label });
    }
    if (path === '/activity-detail') {
        if (originIpo) return ipoOrigin({ label: breadcrumbEntityLabel(context.activity, 'Activity', routeId) });
        return withRoot(
            { label: 'Activities', path: '/activities' },
            { label: breadcrumbEntityLabel(context.activity, 'Activity', routeId) },
        );
    }
    if (path === '/activity-edit') {
        if (context.activityEditMode === 'create' || !context.activity) {
            return withRoot({ label: 'Activities', path: '/activities' }, { label: 'Add Activity' });
        }
        const current = {
            label: breadcrumbEntityLabel(context.activity, 'Activity'),
            path: contextualPath(detailPath('/activity-detail', context.activity.id), params),
        };
        const action = { label: activityModeLabel[context.activityEditMode || 'details'] };
        if (originIpo) return ipoOrigin(current, action);
        return withRoot(
            { label: 'Activities', path: '/activities' },
            current,
            action,
        );
    }
    if (path === '/activity-monitoring-report') {
        const monitoringLabel = breadcrumbEntityLabel(context.monitoringIpo, 'IPO');
        if (originIpo) return ipoOrigin(
            {
                label: breadcrumbEntityLabel(context.activity, 'Activity'),
                path: contextualPath(detailPath('/activity-detail', context.activity?.id), params, [
                    ['origin', 'ipo'],
                    ['originId', originIpo.id],
                ]),
            },
            { label: 'Monitoring Report' },
        );
        if (originActivity) return activityOrigin(
            {
                label: monitoringLabel,
                path: contextualPath(detailPath('/ipo-detail', context.monitoringIpo?.id), params, [
                    ['origin', 'activity'],
                    ['originId', originActivity.id],
                ]),
            },
            { label: 'Monitoring Report' },
        );
        return withRoot(
            { label: 'Activities', path: '/activities' },
            {
                label: breadcrumbEntityLabel(context.activity, 'Activity'),
                path: detailPath('/activity-detail', context.activity?.id),
            },
            { label: monitoringLabel, path: detailPath('/ipo-detail', context.monitoringIpo?.id) },
            { label: 'Monitoring Report' },
        );
    }

    if (path === '/program-management/office-detail') {
        return withRoot(
            { label: 'Program Management', path: '/program-management' },
            { label: 'Office Requirements', path: '/program-management/office-requirements' },
            { label: breadcrumbEntityLabel(context.officeRequirement, 'Office Requirement', routeId) },
        );
    }
    if (path === '/program-management/staffing-detail') {
        return withRoot(
            { label: 'Program Management', path: '/program-management' },
            { label: 'Staffing Requirements', path: '/program-management/staffing-requirements' },
            { label: breadcrumbEntityLabel(context.staffingRequirement, 'Staffing Requirement', routeId) },
        );
    }
    if (path === '/program-management/other-expense-detail') {
        return withRoot(
            { label: 'Program Management', path: '/program-management' },
            { label: 'Other Expenses', path: '/program-management/other-expenses' },
            { label: breadcrumbEntityLabel(context.otherProgramExpense, 'Program Expense', routeId) },
        );
    }

    if (path === '/ipo') return withRoot({ label: 'IPOs' });
    if (path === '/ipo-detail') {
        if (originActivity) return activityOrigin({ label: breadcrumbEntityLabel(context.ipo, 'IPO', routeId) });
        return withRoot(
            { label: 'IPOs', path: '/ipo' },
            { label: breadcrumbEntityLabel(context.ipo, 'IPO') },
        );
    }

    if (path === '/marketing-database') return withRoot({ label: 'Marketing Database' });
    if (path === '/marketing-profile-detail') {
        if (originIpo) return ipoOrigin({ label: breadcrumbEntityLabel(context.marketingPartner, 'Partner', routeId) });
        return withRoot(
            { label: 'Marketing Database', path: '/marketing-database' },
            { label: breadcrumbEntityLabel(context.marketingPartner, 'Partner') },
        );
    }
    if (['/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(path)) {
        const action = path === '/marketing-profile-edit'
            ? 'Edit Details'
            : path === '/marketing-linkage-edit'
                ? 'Add Linkage'
                : context.marketingLinkageLabel || 'Market Linkage';
        const current = {
            label: breadcrumbEntityLabel(context.marketingPartner, 'Partner', routeId),
            path: contextualPath(detailPath('/marketing-profile-detail', context.marketingPartner?.id), params),
        };
        if (originIpo) return ipoOrigin(current, { label: action });
        return withRoot(
            { label: 'Marketing Database', path: '/marketing-database' },
            current,
            { label: action },
        );
    }

    if (path === '/level-of-development') return withRoot({ label: 'Level of Development' });
    if (path === '/lod-details') {
        const year = Number.isFinite(selectedYear) && selectedYear > 0 ? selectedYear : context.lodYear;
        const ipoPath = detailPath('/lod-details', context.ipo?.id ?? routeId);
        if (originIpo) return ipoOrigin({ label: `LOD Assessment${year ? ` ${year}` : ''}` });
        return withRoot(
            { label: 'Level of Development', path: '/level-of-development' },
            { label: breadcrumbEntityLabel(context.ipo, 'IPO', routeId), path: ipoPath },
            ...(year ? [{ label: String(year) }] : []),
        );
    }

    if (path === '/gender-and-development') return withRoot({ label: 'Gender and Development' });
    if (path === '/gender-and-development/detail') {
        const operatingUnit = params?.get('ou') || context.gadOperatingUnit || 'Operating Unit';
        const year = Number.isFinite(selectedYear) && selectedYear > 0 ? selectedYear : context.gadYear;
        return withRoot(
            { label: 'Gender and Development', path: '/gender-and-development' },
            { label: operatingUnit, path: '/gender-and-development' },
            ...(year ? [{ label: String(year) }] : []),
        );
    }

    if (path === '/reports') return withRoot({ label: 'Reports' });
    if (path === '/settings') return withRoot({ label: 'Settings' });
    if (path === '/commodity-mapping') return withRoot({ label: 'Commodity Mapping' });
    if (path === '/accomplishment/financial') return withRoot({ label: 'Financial Accomplishment' });
    if (path === '/accomplishment/physical') return withRoot({ label: 'Physical Accomplishment' });

    return withRoot({ label: getNavigationPageTitle(path, role) || 'Page' });
};

export const navigationItemMatchesPath = (item: AppNavigationItem, path: string): boolean =>
    item.href === path || !!item.activeMatchPaths?.includes(path);

export const navigationBranchMatchesPath = (item: AppNavigationItem, path: string): boolean =>
    navigationItemMatchesPath(item, path) || !!item.children?.some(child => navigationBranchMatchesPath(child, path));
