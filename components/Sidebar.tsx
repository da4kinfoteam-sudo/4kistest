import React, { useEffect, useRef, useState } from 'react';
import {
    BarChart3,
    BookOpen,
    Briefcase,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    CircleDollarSign,
    ClipboardList,
    Database,
    Folder,
    Home,
    LayoutDashboard,
    MapPinned,
    Settings,
    Store,
    TrendingUp,
    UsersRound,
    X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import useLocalStorageState from '../hooks/useLocalStorageState';
import {
    AppNavigationItem,
    appNavigationStructure,
    navigationBranchMatchesPath,
    navigationItemMatchesPath,
} from '../lib/appNavigation';

interface SidebarProps {
    isOpen: boolean;
    closeSidebar: () => void;
    currentPage: string;
    setCurrentPage: (page: string, options?: { resetReports?: boolean }) => void;
}

const navIconMap: Record<string, React.ReactNode> = {
    Homepage: <Home />,
    Reports: <BarChart3 />,
    Dashboard: <LayoutDashboard />,
    Subprojects: <Folder />,
    Activities: <CalendarDays />,
    'Program Management': <Briefcase />,
    Financial: <CircleDollarSign />,
    Physical: <TrendingUp />,
    IPOs: <UsersRound />,
    Resources: <Database />,
    'Marketing Database': <Store />,
    'Level of Development': <MapPinned />,
    'Commodity Mapping': <MapPinned />,
    References: <BookOpen />,
    'User Settings': <Settings />,
    'Accomplishment Forms': <CheckCircle2 />,
    'Data Collection Forms': <ClipboardList />,
};

type ExpandedGroupsByUser = Record<string, Record<string, boolean>>;

const Sidebar: React.FC<SidebarProps> = ({ isOpen, closeSidebar, currentPage, setCurrentPage }) => {
    const { currentUser, hasAccess } = useAuth();
    const navRef = useRef<HTMLElement>(null);
    const [sessionExpansion, setSessionExpansion] = useState<Record<string, boolean>>({});
    const [expandedGroupsByUser, setExpandedGroupsByUser] = useLocalStorageState<ExpandedGroupsByUser>('sidebar_navigation_groups', {});
    const userStorageKey = currentUser?.id ? String(currentUser.id) : 'anonymous';
    const persistedExpansion = expandedGroupsByUser[userStorageKey] || {};

    const canViewItem = (item: AppNavigationItem): boolean => {
        if (item.hiddenFor?.includes(currentUser?.role || '')) return false;
        if (item.allowedRoles && !item.allowedRoles.includes(currentUser?.role || '')) return false;
        if (item.module && !hasAccess(item.module, 'view')) return false;
        return true;
    };

    const visibleNavigation = (() => {
        const filterItem = (item: AppNavigationItem): AppNavigationItem | null => {
            if (!canViewItem(item)) return null;
            const children = item.children
                ?.map(filterItem)
                .filter((child): child is AppNavigationItem => child !== null);
            if (item.children && (!children || children.length === 0)) return null;
            return { ...item, children };
        };
        return appNavigationStructure
            .map(filterItem)
            .filter((item): item is AppNavigationItem => item !== null);
    })();

    useEffect(() => {
        setSessionExpansion({});
        const focusFrame = window.requestAnimationFrame(() => {
            const activeLink = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
            activeLink?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
        return () => window.cancelAnimationFrame(focusFrame);
    }, [currentPage]);

    const handleLinkClick = (href: string) => {
        setCurrentPage(href, { resetReports: href === '/reports' });
        if (window.innerWidth < 768) closeSidebar();
    };

    const toggleGroup = (item: AppNavigationItem, expanded: boolean) => {
        const nextExpanded = !expanded;
        setSessionExpansion(previous => ({ ...previous, [item.id]: nextExpanded }));
        setExpandedGroupsByUser(previous => ({
            ...previous,
            [userStorageKey]: {
                ...(previous[userStorageKey] || {}),
                [item.id]: nextExpanded,
            },
        }));
    };

    const renderIcon = (item: AppNavigationItem) => (
        <span className="app-sidebar__nav-icon" aria-hidden="true">
            {navIconMap[item.name] || <ClipboardList />}
        </span>
    );

    const renderLink = (item: AppNavigationItem, depth: number, parentId?: string) => {
        if (!item.href) return null;
        const active = item.kind === 'link' && navigationItemMatchesPath(item, currentPage);
        return (
            <a
                href={`/#${item.href}`}
                onClick={event => {
                    event.preventDefault();
                    handleLinkClick(item.href!);
                }}
                className={`app-sidebar__nav-item app-sidebar__nav-item--depth-${Math.min(depth, 2)} ${active ? 'app-sidebar__nav-item--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={item.title || item.name}
                data-parent-navigation={parentId}
            >
                {depth === 0 && renderIcon(item)}
                <span className="app-sidebar__label">{item.name}</span>
            </a>
        );
    };

    const renderItem = (item: AppNavigationItem, depth = 0): React.ReactNode => {
        if (item.kind === 'link') {
            return <li key={item.id}>{renderLink(item, depth)}</li>;
        }

        if (item.kind === 'section') {
            return (
                <li className="app-sidebar__section" key={item.id}>
                    <span className="app-sidebar__section-label">{item.name === 'Homepage' ? 'Overview' : item.name}</span>
                    <ul className="app-sidebar__section-items">
                        {item.children?.map(child => renderItem(child, 0))}
                    </ul>
                </li>
            );
        }

        const activeBranch = navigationBranchMatchesPath(item, currentPage);
        const persisted = persistedExpansion[item.id] === true;
        const expanded = sessionExpansion[item.id] ?? (activeBranch || persisted);
        const submenuId = `sidebar-group-${item.id}`;

        return (
            <li
                className={`app-sidebar__tree-item app-sidebar__tree-item--${item.kind} ${activeBranch ? 'app-sidebar__tree-item--active-branch' : ''}`}
                key={item.id}
            >
                <div className={`app-sidebar__disclosure-row app-sidebar__disclosure-row--depth-${Math.min(depth, 2)}`}>
                    <button
                        type="button"
                        className={`app-sidebar__disclosure-trigger ${item.kind === 'group' ? 'app-sidebar__disclosure-trigger--group' : ''}`}
                        onClick={() => toggleGroup(item, expanded)}
                        aria-expanded={expanded}
                        aria-controls={submenuId}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.name}`}
                        title={`${expanded ? 'Collapse' : 'Expand'} ${item.name}`}
                    >
                        {item.kind === 'disclosure' && renderIcon(item)}
                        <span className={item.kind === 'group' ? 'app-sidebar__group-label' : 'app-sidebar__label'}>{item.name}</span>
                        <ChevronDown className="app-sidebar__disclosure-chevron" aria-hidden="true" />
                    </button>
                </div>
                <div className="app-sidebar__submenu-shell" hidden={!expanded}>
                    <ul id={submenuId} className="app-sidebar__subnav">
                        {item.children?.map(child => renderItem(child, depth + 1))}
                    </ul>
                </div>
            </li>
        );
    };

    return (
        <>
            <div
                className={`app-sidebar-overlay ${isOpen ? '' : 'app-sidebar-overlay--hidden'}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />
            <div className={`app-sidebar-shell ${isOpen ? 'app-sidebar-shell--open' : ''}`}>
                <aside
                    className={`app-sidebar ${isOpen ? 'app-sidebar--open' : ''}`}
                    aria-label="Primary navigation"
                    aria-hidden={!isOpen}
                    inert={!isOpen}
                >
                    <div className="relative flex-shrink-0">
                        <a
                            href="/#/"
                            onClick={event => {
                                event.preventDefault();
                                handleLinkClick('/');
                            }}
                            className="app-sidebar__brand"
                        >
                            <span className="app-sidebar__logo">
                                <img src="/assets/4klogo.png" alt="4K Program" />
                            </span>
                            <span className="app-sidebar__title">
                                <strong>4K Information System</strong>
                                <span>Department of Agriculture</span>
                            </span>
                        </a>
                        <button
                            type="button"
                            onClick={closeSidebar}
                            className="app-sidebar__mobile-close"
                            aria-label="Close navigation"
                            title="Close navigation"
                        >
                            <X aria-hidden="true" />
                        </button>
                    </div>

                    <nav ref={navRef} className="app-sidebar__nav">
                        <ul className="app-sidebar__nav-list">
                            {visibleNavigation.map(item => item.kind === 'link' ? (
                                <li className="app-sidebar__section" key={item.id}>
                                    {item.name === 'Homepage' && <span className="app-sidebar__section-label">Overview</span>}
                                    <ul className="app-sidebar__section-items">{renderItem(item)}</ul>
                                </li>
                            ) : renderItem(item))}
                        </ul>
                    </nav>

                    <div className="app-sidebar__footer">
                        <a
                            href="/#/settings"
                            onClick={event => {
                                event.preventDefault();
                                handleLinkClick('/settings');
                            }}
                            className={`app-sidebar__nav-item ${currentPage === '/settings' ? 'app-sidebar__nav-item--active' : ''}`}
                            aria-current={currentPage === '/settings' ? 'page' : undefined}
                            title="User Settings"
                        >
                            <span className="app-sidebar__nav-icon" aria-hidden="true">{navIconMap['User Settings']}</span>
                            <span className="app-sidebar__label">User Settings</span>
                        </a>
                    </div>
                </aside>
            </div>
        </>
    );
};

export default Sidebar;
