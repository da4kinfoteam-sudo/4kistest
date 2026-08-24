export const LOD_DATA_CHANGED_EVENT = '4kis:lod-data-changed';

export interface LodDataChangedDetail {
    ipoId?: number;
    year?: number;
    reason?: 'save' | 'import' | 'clear' | 'drop' | 'override' | 'settings';
}

export const notifyLodDataChanged = (detail: LodDataChangedDetail = {}) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<LodDataChangedDetail>(LOD_DATA_CHANGED_EVENT, { detail }));
};

export const subscribeToLodDataChanges = (listener: (detail: LodDataChangedDetail) => void) => {
    if (typeof window === 'undefined') return () => {};
    const handler = (event: Event) => listener((event as CustomEvent<LodDataChangedDetail>).detail || {});
    window.addEventListener(LOD_DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(LOD_DATA_CHANGED_EVENT, handler);
};
