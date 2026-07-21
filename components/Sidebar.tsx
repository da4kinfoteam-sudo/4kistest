import React from 'react';
import {
    BarChart3,
    BookOpen,
    Briefcase,
    CalendarDays,
    CheckCircle2,
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
import { NavItem, navigationStructure } from '../constants';
import { useAuth } from '../contexts/AuthContext';

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
    'Data Collection Forms': <ClipboardList />,
    Subprojects: <Folder />,
    Activities: <CalendarDays />,
    'Program Management': <Briefcase />,
    'Accomplishment Forms': <CheckCircle2 />,
    Financial: <CircleDollarSign />,
    Physical: <TrendingUp />,
    'Indigenous Peoples Organization': <UsersRound />,
    Resources: <Database />,
    'Marketing Database': <Store />,
    'Level of Development': <MapPinned />,
    'Commodity Mapping': <MapPinned />,
    References: <BookOpen />,
    'User Settings': <Settings />,
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, closeSidebar, currentPage, setCurrentPage }) => {
    const { currentUser, hasAccess } = useAuth();

    const moduleMapping: Record<string, string> = {
        Dashboards: 'Dashboards',
        Dashboard: 'Dashboards',
        Reports: 'Reports',
        Subprojects: 'Subprojects',
        Activities: 'Activities',
        'Program Management': 'Program Management',
        Financial: 'Accomplishment - Financial',
        Physical: 'Accomplishment - Physical',
        'Indigenous Peoples Organization': 'IPO Management',
        'Marketing Database': 'Marketing Database',
        'Level of Development': 'Level of Development',
        'Commodity Mapping': 'Commodity Mapping',
        References: 'References',
    };

    const canViewItem = (item: NavItem): boolean => {
        if (item.hiddenFor && currentUser && item.hiddenFor.includes(currentUser.role)) return false;
        if (item.name === 'Homepage') return true;
        if (item.children) return item.children.some(canViewItem);
        return hasAccess(moduleMapping[item.name] || item.name, 'view');
    };

    const handleLinkClick = (href: string) => {
        setCurrentPage(href, { resetReports: href === '/reports' });
        if (window.innerWidth < 768) closeSidebar();
    };

    const renderLink = (item: NavItem) => {
        if (!item.href || !canViewItem(item)) return null;
        const active = item.href === currentPage;

        return (
            <li key={`${item.name}-${item.href}`}>
                <a
                    href={item.href}
                    onClick={event => {
                        event.preventDefault();
                        handleLinkClick(item.href!);
                    }}
                    className={`app-sidebar__nav-item ${active ? 'app-sidebar__nav-item--active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={item.name}
                >
                    <span className="app-sidebar__nav-icon" aria-hidden="true">
                        {navIconMap[item.name] || item.icon}
                    </span>
                    <span className="app-sidebar__label">{item.name}</span>
                </a>
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
                <aside className={`app-sidebar ${isOpen ? 'app-sidebar--open' : ''}`} aria-label="Primary navigation">
                    <div className="relative flex-shrink-0">
                        <a
                            href="/"
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

                    <nav className="app-sidebar__nav">
                        <ul className="app-sidebar__nav-list">
                            {navigationStructure.map(item => {
                                if (!canViewItem(item)) return null;
                                if (item.children) {
                                    const visibleChildren = item.children.filter(canViewItem);
                                    if (visibleChildren.length === 0) return null;
                                    return (
                                        <li className="app-sidebar__section" key={item.name}>
                                            <span className="app-sidebar__section-label">{item.name}</span>
                                            <ul className="app-sidebar__section-items">
                                                {visibleChildren.map(renderLink)}
                                            </ul>
                                        </li>
                                    );
                                }

                                return (
                                    <li className="app-sidebar__section" key={item.name}>
                                        {item.name === 'Homepage' && <span className="app-sidebar__section-label">Overview</span>}
                                        <ul className="app-sidebar__section-items">{renderLink(item)}</ul>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    <div className="app-sidebar__footer">
                        <a
                            href="/settings"
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
