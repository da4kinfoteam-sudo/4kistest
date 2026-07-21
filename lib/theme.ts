export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export const THEME_STORAGE_KEY = '4kis-theme-preference';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

export const getSavedThemePreference = (): ThemeMode | null => {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isThemeMode(stored) ? stored : null;
    } catch {
        return null;
    }
};

export const getSystemThemePreference = (): ThemeMode => {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

export const resolveInitialTheme = (): ThemeMode => {
    return getSavedThemePreference() ?? getSystemThemePreference();
};

export const resolveThemePreference = (): ThemePreference => {
    return getSavedThemePreference() ?? 'system';
};

export const resolveThemeMode = (preference: ThemePreference): ThemeMode => {
    return preference === 'system' ? getSystemThemePreference() : preference;
};

export const saveThemePreference = (preference: ThemePreference) => {
    try {
        if (preference === 'system') {
            window.localStorage.removeItem(THEME_STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
        // Theme persistence is a convenience; the active theme still applies.
    }
};

export const applyTheme = (theme: ThemeMode, preference: ThemePreference = theme) => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = theme;
};
