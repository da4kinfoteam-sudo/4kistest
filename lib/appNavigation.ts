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

export const navigationItemMatchesPath = (item: AppNavigationItem, path: string): boolean =>
    item.href === path || !!item.activeMatchPaths?.includes(path);

export const navigationBranchMatchesPath = (item: AppNavigationItem, path: string): boolean =>
    navigationItemMatchesPath(item, path) || !!item.children?.some(child => navigationBranchMatchesPath(child, path));
