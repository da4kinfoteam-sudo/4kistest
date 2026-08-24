export const APP_BEFORE_NAVIGATION_EVENT = 'app-before-navigation';

export interface AppBeforeNavigationDetail {
    from: string;
    to: string;
}

export const requestAppNavigation = (from: string, to: string) => {
    if (from === to || typeof window === 'undefined') return true;
    return window.dispatchEvent(new CustomEvent<AppBeforeNavigationDetail>(APP_BEFORE_NAVIGATION_EVENT, {
        cancelable: true,
        detail: { from, to },
    }));
};
