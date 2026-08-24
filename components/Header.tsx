import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft,
    ChevronRight,
    ChevronDown,
    LogOut,
    Monitor,
    MoreHorizontal,
    Moon,
    RefreshCw,
    Search,
    Settings2,
    Sun,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AppBreadcrumb, AppReturnContext } from '../lib/appNavigation';
import { ThemePreference } from '../lib/theme';
import { supabase } from '../supabaseClient';

interface HeaderProps {
    breadcrumbs: AppBreadcrumb[];
    returnContext?: AppReturnContext | null;
    toggleSidebar: () => void;
    isDarkMode: boolean;
    themePreference: ThemePreference;
    onThemePreferenceChange: (preference: ThemePreference) => void;
    setCurrentPage: (page: string, options?: { resetReports?: boolean }) => void;
    onRefreshData?: () => Promise<void> | void;
    onClearLocalCache?: () => Promise<void> | void;
    isRefreshingData?: boolean;
    lastDataRefreshAt?: string | null;
    dataRefreshError?: string | null;
    cacheStatus?: string | null;
}

const themeOptions: Array<{
    value: ThemePreference;
    label: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
];

const Header: React.FC<HeaderProps> = ({
    breadcrumbs,
    returnContext = null,
    toggleSidebar,
    isDarkMode,
    themePreference,
    onThemePreferenceChange,
    setCurrentPage,
    onRefreshData,
    onClearLocalCache,
    isRefreshingData = false,
    lastDataRefreshAt = null,
    dataRefreshError = null,
}) => {
    const { currentUser, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isBreadcrumbMenuOpen, setIsBreadcrumbMenuOpen] = useState(false);
    const [shouldCollapseBreadcrumbs, setShouldCollapseBreadcrumbs] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [dbStatus, setDbStatus] = useState<'connected' | 'offline' | 'loading'>('loading');
    const menuRef = useRef<HTMLDivElement>(null);
    const breadcrumbNavRef = useRef<HTMLElement>(null);
    const breadcrumbMeasureRef = useRef<HTMLOListElement>(null);
    const failureCountRef = useRef(0);

    useEffect(() => {
        const checkDb = async (isRetry = false) => {
            if (!supabase) {
                setDbStatus('offline');
                return;
            }

            try {
                const fetchPromise = supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1);
                const timeoutPromise = new Promise<{ error: unknown }>((_, reject) =>
                    window.setTimeout(() => reject(new Error('Network Threshold Exceeded')), 15000)
                );
                const { error } = await Promise.race([fetchPromise, timeoutPromise]) as { error?: unknown };

                if (!error) {
                    setDbStatus('connected');
                    failureCountRef.current = 0;
                    return;
                }
                throw error;
            } catch (error) {
                failureCountRef.current += 1;
                console.warn(`Connection heartbeat failed (${failureCountRef.current}/3):`, error);

                if (failureCountRef.current >= 3) {
                    setDbStatus('offline');
                } else if (!isRetry) {
                    window.setTimeout(() => checkDb(true), 2500);
                }
            }
        };

        void checkDb();
        const intervalId = window.setInterval(() => void checkDb(false), 60000);
        return () => window.clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
            if (breadcrumbNavRef.current && !breadcrumbNavRef.current.contains(event.target as Node)) {
                setIsBreadcrumbMenuOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsMenuOpen(false);
                setIsBreadcrumbMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const formatRefreshTime = (value: string | null) => {
        if (!value) return 'Not refreshed yet';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'Not refreshed yet';
        return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };

    const dbStatusLabel = dbStatus === 'connected'
        ? 'System online'
        : dbStatus === 'offline'
            ? 'Offline mode'
            : 'Connecting';
    const refreshTitle = isRefreshingData
        ? 'Syncing data'
        : dataRefreshError
            ? `Sync failed: ${dataRefreshError}`
            : lastDataRefreshAt
                ? `Sync data · Last updated ${formatRefreshTime(lastDataRefreshAt)}`
                : 'Sync data';
    const initials = (currentUser?.fullName || currentUser?.username || '4K')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase();
    const parentBreadcrumb = [...breadcrumbs]
        .slice(0, -1)
        .reverse()
        .find(breadcrumb => Boolean(breadcrumb.path));
    const hiddenBreadcrumbs = useMemo(
        () => breadcrumbs.length > 3 ? breadcrumbs.slice(1, -2) : [],
        [breadcrumbs]
    );
    const displayedBreadcrumbs = useMemo(() => {
        if (!shouldCollapseBreadcrumbs || hiddenBreadcrumbs.length === 0) {
            return breadcrumbs.map((breadcrumb, originalIndex) => ({ type: 'breadcrumb' as const, breadcrumb, originalIndex }));
        }

        return [
            { type: 'breadcrumb' as const, breadcrumb: breadcrumbs[0], originalIndex: 0 },
            { type: 'overflow' as const },
            { type: 'breadcrumb' as const, breadcrumb: breadcrumbs[breadcrumbs.length - 2], originalIndex: breadcrumbs.length - 2 },
            { type: 'breadcrumb' as const, breadcrumb: breadcrumbs[breadcrumbs.length - 1], originalIndex: breadcrumbs.length - 1 },
        ];
    }, [breadcrumbs, hiddenBreadcrumbs.length, shouldCollapseBreadcrumbs]);

    useLayoutEffect(() => {
        const updateBreadcrumbOverflow = () => {
            const nav = breadcrumbNavRef.current;
            const measure = breadcrumbMeasureRef.current;
            if (!nav || !measure || hiddenBreadcrumbs.length === 0) {
                setShouldCollapseBreadcrumbs(false);
                return;
            }
            setShouldCollapseBreadcrumbs(measure.scrollWidth > nav.clientWidth + 1);
        };

        updateBreadcrumbOverflow();
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateBreadcrumbOverflow)
            : null;
        if (breadcrumbNavRef.current) resizeObserver?.observe(breadcrumbNavRef.current);
        window.addEventListener('resize', updateBreadcrumbOverflow);
        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateBreadcrumbOverflow);
        };
    }, [breadcrumbs, hiddenBreadcrumbs.length, returnContext]);

    useEffect(() => {
        if (!shouldCollapseBreadcrumbs) setIsBreadcrumbMenuOpen(false);
    }, [shouldCollapseBreadcrumbs]);

    const navigateFromHeader = (path: string) => {
        setIsBreadcrumbMenuOpen(false);
        setCurrentPage(path);
    };

    return (
        <header className="app-topbar">
            <div className="app-topbar__left">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="app-icon-button app-topbar__menu-toggle"
                    aria-label="Open navigation"
                    title="Open navigation"
                >
                    <span className="app-topbar__hamburger" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                    </span>
                </button>
                {returnContext && (
                    <button
                        type="button"
                        className="app-topbar__return"
                        onClick={() => navigateFromHeader(returnContext.path)}
                        aria-label={returnContext.label}
                        title={returnContext.label}
                    >
                        <span className="app-topbar__return-full">{returnContext.label}</span>
                        <span className="app-topbar__return-compact">{returnContext.compactLabel}</span>
                    </button>
                )}
                {!returnContext && parentBreadcrumb?.path && (
                    <button
                        type="button"
                        className="app-topbar__mobile-parent"
                        onClick={() => navigateFromHeader(parentBreadcrumb.path!)}
                        aria-label={`Back to ${parentBreadcrumb.label}`}
                        title={`Back to ${parentBreadcrumb.label}`}
                    >
                        <ArrowLeft aria-hidden="true" />
                        <span>{parentBreadcrumb.label}</span>
                    </button>
                )}
                <nav ref={breadcrumbNavRef} className="app-topbar__breadcrumbs" aria-label="Breadcrumb">
                    <ol className="app-topbar__breadcrumb-trail">
                        {displayedBreadcrumbs.map((item, displayIndex) => {
                            if (item.type === 'overflow') {
                                return (
                                    <li className="app-topbar__breadcrumb app-topbar__breadcrumb--overflow" key="breadcrumb-overflow">
                                        {displayIndex > 0 && (
                                            <ChevronRight className="app-topbar__breadcrumb-separator" aria-hidden="true" />
                                        )}
                                        <button
                                            type="button"
                                            className="app-topbar__breadcrumb-overflow-trigger"
                                            onClick={() => setIsBreadcrumbMenuOpen(open => !open)}
                                            aria-label="Show hidden breadcrumb levels"
                                            aria-expanded={isBreadcrumbMenuOpen}
                                            aria-haspopup="menu"
                                            title="Show hidden breadcrumb levels"
                                        >
                                            <MoreHorizontal aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            }

                            const { breadcrumb, originalIndex } = item;
                            const isCurrent = originalIndex === breadcrumbs.length - 1;
                            return (
                                <li className="app-topbar__breadcrumb" key={`${breadcrumb.label}-${originalIndex}`}>
                                    {displayIndex > 0 && (
                                        <ChevronRight className="app-topbar__breadcrumb-separator" aria-hidden="true" />
                                    )}
                                    {breadcrumb.path && !isCurrent ? (
                                        <button
                                            type="button"
                                            className="app-topbar__breadcrumb-link"
                                            onClick={() => navigateFromHeader(breadcrumb.path!)}
                                            title={breadcrumb.label}
                                        >
                                            {breadcrumb.label}
                                        </button>
                                    ) : (
                                        <span
                                            className="app-topbar__breadcrumb-current"
                                            aria-current={isCurrent ? 'page' : undefined}
                                            title={breadcrumb.label}
                                        >
                                            {breadcrumb.label}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ol>
                    <ol ref={breadcrumbMeasureRef} className="app-topbar__breadcrumb-measure" aria-hidden="true">
                        {breadcrumbs.map((breadcrumb, index) => (
                            <li className="app-topbar__breadcrumb" key={`${breadcrumb.label}-${index}`}>
                                {index > 0 && <ChevronRight className="app-topbar__breadcrumb-separator" aria-hidden="true" />}
                                <span className={index === breadcrumbs.length - 1 ? 'app-topbar__breadcrumb-current' : 'app-topbar__breadcrumb-link'}>
                                    {breadcrumb.label}
                                </span>
                            </li>
                        ))}
                    </ol>
                    {isBreadcrumbMenuOpen && (
                        <div className="app-topbar__breadcrumb-menu" role="menu">
                            {hiddenBreadcrumbs.map((breadcrumb, index) => breadcrumb.path ? (
                                <button
                                    type="button"
                                    role="menuitem"
                                    key={`${breadcrumb.label}-${index}`}
                                    onClick={() => navigateFromHeader(breadcrumb.path!)}
                                    title={breadcrumb.label}
                                >
                                    {breadcrumb.label}
                                </button>
                            ) : (
                                <span key={`${breadcrumb.label}-${index}`}>{breadcrumb.label}</span>
                            ))}
                        </div>
                    )}
                </nav>
            </div>

            <label className="app-topbar__search">
                <Search className="app-topbar__search-icon" aria-hidden="true" />
                <span className="sr-only">Search 4KIS</span>
                <input
                    type="search"
                    className="app-topbar__search-input"
                    value={searchValue}
                    onChange={event => setSearchValue(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter') event.preventDefault();
                    }}
                    placeholder="Search IPOs, subprojects, activities..."
                    aria-label="Search 4KIS"
                />
            </label>

            <div className="app-topbar__actions">
                <button
                    type="button"
                    onClick={() => void onRefreshData?.()}
                    className={`app-topbar__action app-topbar__refresh ${isRefreshingData ? 'is-loading' : ''} ${dataRefreshError ? 'has-error' : ''}`}
                    aria-label={refreshTitle}
                    title={refreshTitle}
                    disabled={!onRefreshData || isRefreshingData}
                >
                    <RefreshCw aria-hidden="true" />
                </button>

                {currentUser && (
                    <div className="app-topbar__user" ref={menuRef}>
                        <button
                            type="button"
                            className="app-topbar__user-trigger"
                            onClick={() => setIsMenuOpen(open => !open)}
                            aria-expanded={isMenuOpen}
                            aria-haspopup="menu"
                        >
                            <span
                                className={`app-topbar__avatar app-topbar__avatar--${dbStatus}`}
                                title={dbStatusLabel}
                                aria-label={dbStatusLabel}
                                role="status"
                            >
                                {initials}
                            </span>
                            <span className="app-topbar__user-text">
                                <strong>{currentUser.fullName}</strong>
                                <small>{currentUser.role} · {currentUser.operatingUnit}</small>
                            </span>
                            <ChevronDown className="app-topbar__user-chevron" aria-hidden="true" />
                        </button>

                        {isMenuOpen && (
                            <div className="app-topbar__menu" role="menu">
                                <div className="app-topbar__menu-info">
                                    <p>{currentUser.fullName}</p>
                                    <span>{currentUser.role} · {currentUser.operatingUnit}</span>
                                </div>

                                <div className="app-theme-selector">
                                    <span className="app-theme-selector__label">Theme</span>
                                    <div className="app-theme-selector__options" role="group" aria-label="Theme preference">
                                        {themeOptions.map(option => {
                                            const Icon = option.icon;
                                            const isActive = themePreference === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={`app-theme-selector__option ${isActive ? 'is-active' : ''}`}
                                                    onClick={() => onThemePreferenceChange(option.value)}
                                                    aria-pressed={isActive}
                                                    title={`${option.label} theme`}
                                                >
                                                    <Icon aria-hidden="true" />
                                                    <span>{option.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <small>{themePreference === 'system' ? `Following system · ${isDarkMode ? 'Dark' : 'Light'}` : `${themePreference === 'dark' ? 'Dark' : 'Light'} selected`}</small>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => { setCurrentPage('/settings'); setIsMenuOpen(false); }}
                                    className="app-topbar__menu-item"
                                    role="menuitem"
                                >
                                    <Settings2 aria-hidden="true" />
                                    User Settings
                                </button>
                                {onClearLocalCache && (
                                    <button
                                        type="button"
                                        onClick={() => { void onClearLocalCache(); setIsMenuOpen(false); }}
                                        className="app-topbar__menu-item"
                                        role="menuitem"
                                    >
                                        <RefreshCw aria-hidden="true" />
                                        Clear Local Cache
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { logout(); setIsMenuOpen(false); }}
                                    className="app-topbar__menu-item app-topbar__menu-item--danger"
                                    role="menuitem"
                                >
                                    <LogOut aria-hidden="true" />
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
