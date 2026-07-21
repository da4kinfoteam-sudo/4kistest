import React, { useEffect, useRef, useState } from 'react';
import {
    ChevronDown,
    LogOut,
    Monitor,
    Moon,
    RefreshCw,
    Settings2,
    Sun,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ThemePreference } from '../lib/theme';
import { supabase } from '../supabaseClient';

interface HeaderProps {
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
    cacheStatus = null,
}) => {
    const { currentUser, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [dbStatus, setDbStatus] = useState<'connected' | 'offline' | 'loading'>('loading');
    const menuRef = useRef<HTMLDivElement>(null);
    const failureCountRef = useRef(0);

    useEffect(() => {
        const timer = window.setInterval(() => setCurrentDate(new Date()), 60000);
        return () => window.clearInterval(timer);
    }, []);

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
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsMenuOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const formattedDate = currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

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
    const refreshTitle = dataRefreshError
        ? `Refresh failed: ${dataRefreshError}`
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
                <div className="app-topbar__context">
                    <span className="app-topbar__product">4KIS</span>
                    <span className="app-topbar__date">{formattedDate}</span>
                </div>
            </div>

            <div className="app-topbar__actions">
                <div
                    className={`app-topbar__status app-topbar__status--${dbStatus}`}
                    title={dbStatusLabel}
                    aria-label={dbStatusLabel}
                    role="status"
                >
                    <span className="app-topbar__status-dot" />
                    <span className="app-topbar__status-label">{dbStatusLabel}</span>
                </div>

                <span className="app-topbar__refresh-time">
                    {isRefreshingData
                        ? 'Syncing…'
                        : cacheStatus || (lastDataRefreshAt ? `Updated ${formatRefreshTime(lastDataRefreshAt)}` : 'Ready')}
                </span>
                <button
                    type="button"
                    onClick={() => void onRefreshData?.()}
                    className={`app-topbar__action app-topbar__refresh ${isRefreshingData ? 'is-loading' : ''} ${dataRefreshError ? 'has-error' : ''}`}
                    aria-label="Sync data"
                    title={refreshTitle}
                    disabled={!onRefreshData || isRefreshingData}
                >
                    <RefreshCw aria-hidden="true" />
                    <span>Sync</span>
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
                            <span className="app-topbar__avatar" aria-hidden="true">{initials}</span>
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
