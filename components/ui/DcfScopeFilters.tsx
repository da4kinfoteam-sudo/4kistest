import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { filterYears, fundTypes, operatingUnits, tiers } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import type { DataScope } from '../../lib/scopedDataFetch';

export interface DcfScopeFilterValue {
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
}

interface UseDcfScopeFiltersOptions {
    storageKey: string;
    moduleName: string;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

export const useDcfScopeFilters = ({ storageKey, moduleName, onDataScopeChange }: UseDcfScopeFiltersOptions) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const defaultYear = new Date().getFullYear().toString();
    const canViewAll = getVisibilityScope(moduleName) === 'All';
    const defaultOu = canViewAll ? 'All' : (currentUser?.operatingUnit || 'All');

    const [selectedYear, setSelectedYear] = useLocalStorageState<string>(`${storageKey}_year`, defaultYear);
    const [selectedOu, setSelectedOu] = useLocalStorageState<string>(`${storageKey}_ou`, defaultOu);
    const [selectedTier, setSelectedTier] = useLocalStorageState<string>(`${storageKey}_tier`, 'Tier 1');
    const [selectedFundType, setSelectedFundType] = useLocalStorageState<string>(`${storageKey}_fundType`, 'Current');
    const [filtersOpen, setFiltersOpen] = useState(false);

    const effectiveOu = !canViewAll && currentUser?.operatingUnit
        ? currentUser.operatingUnit
        : (selectedOu || 'All');

    useEffect(() => {
        if (!selectedYear) setSelectedYear(defaultYear);
        if (!selectedTier) setSelectedTier('Tier 1');
        if (!selectedFundType) setSelectedFundType('Current');
        if (!canViewAll && currentUser?.operatingUnit && selectedOu !== currentUser.operatingUnit) {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [
        canViewAll,
        currentUser?.operatingUnit,
        defaultYear,
        selectedFundType,
        selectedOu,
        selectedTier,
        selectedYear,
        setSelectedFundType,
        setSelectedOu,
        setSelectedTier,
        setSelectedYear
    ]);

    useEffect(() => {
        onDataScopeChange?.({
            year: selectedYear || defaultYear,
            operatingUnit: effectiveOu,
            tier: selectedTier || 'Tier 1',
            fundType: selectedFundType || 'Current',
            canViewAllOus: canViewAll,
            requestedBy: currentUser?.id ?? null
        });
    }, [
        canViewAll,
        currentUser?.id,
        defaultYear,
        effectiveOu,
        onDataScopeChange,
        selectedFundType,
        selectedTier,
        selectedYear
    ]);

    const value = useMemo<DcfScopeFilterValue>(() => ({
        selectedYear: selectedYear || defaultYear,
        selectedOu: effectiveOu,
        selectedTier: selectedTier || 'Tier 1',
        selectedFundType: selectedFundType || 'Current'
    }), [defaultYear, effectiveOu, selectedFundType, selectedTier, selectedYear]);

    const summary = [
        value.selectedOu === 'All' ? 'All OUs' : value.selectedOu,
        value.selectedTier,
        value.selectedFundType,
        value.selectedYear
    ].join(' / ');

    return {
        canViewAll,
        filtersOpen,
        setFiltersOpen,
        selectedYear: value.selectedYear,
        selectedOu: value.selectedOu,
        selectedTier: value.selectedTier,
        selectedFundType: value.selectedFundType,
        setSelectedYear,
        setSelectedOu,
        setSelectedTier,
        setSelectedFundType,
        summary,
        value
    };
};

interface DcfScopeFilterPanelProps {
    idPrefix: string;
    filters: ReturnType<typeof useDcfScopeFilters>;
}

export const DcfScopeFilterToggle: React.FC<DcfScopeFilterPanelProps> = ({ idPrefix, filters }) => (
    <div className="page-filter-toggle">
        <span className="page-filter-summary">{filters.summary}</span>
        <button
            type="button"
            className={`btn btn-secondary page-filter-button ${filters.filtersOpen ? 'is-open' : ''}`}
            onClick={() => filters.setFiltersOpen(prev => !prev)}
            aria-expanded={filters.filtersOpen}
            aria-controls={`${idPrefix}-filter-panel`}
        >
            <SlidersHorizontal aria-hidden="true" />
            <span>Filters</span>
            <ChevronDown aria-hidden="true" className="page-filter-button__chevron" />
        </button>
    </div>
);

export const DcfScopeFilterPanel: React.FC<DcfScopeFilterPanelProps> = ({ idPrefix, filters }) => (
    <div
        id={`${idPrefix}-filter-panel`}
        className={`report-filter-panel dashboard-filter-panel page-filter-panel ${filters.filtersOpen ? 'is-open' : ''}`}
        hidden={!filters.filtersOpen}
    >
        <div className="report-filter-grid">
            <div className="report-filter">
                <label htmlFor={`${idPrefix}-ou-filter`} className="form-label">OU</label>
                <select
                    id={`${idPrefix}-ou-filter`}
                    value={filters.selectedOu}
                    onChange={(event) => filters.setSelectedOu(event.target.value)}
                    disabled={!filters.canViewAll}
                    className="form-control"
                >
                    <option value="All">All OUs</option>
                    {operatingUnits.map(ou => (
                        <option key={ou} value={ou}>{ou}</option>
                    ))}
                </select>
            </div>
            <div className="report-filter">
                <label htmlFor={`${idPrefix}-tier-filter`} className="form-label">Tier</label>
                <select
                    id={`${idPrefix}-tier-filter`}
                    value={filters.selectedTier}
                    onChange={(event) => filters.setSelectedTier(event.target.value)}
                    className="form-control"
                >
                    <option value="All">All Tiers</option>
                    {tiers.map(tier => (
                        <option key={tier} value={tier}>{tier}</option>
                    ))}
                </select>
            </div>
            <div className="report-filter">
                <label htmlFor={`${idPrefix}-fund-type-filter`} className="form-label">Fund Type</label>
                <select
                    id={`${idPrefix}-fund-type-filter`}
                    value={filters.selectedFundType}
                    onChange={(event) => filters.setSelectedFundType(event.target.value)}
                    className="form-control"
                >
                    <option value="All">All Fund Types</option>
                    {fundTypes.map(fundType => (
                        <option key={fundType} value={fundType}>{fundType}</option>
                    ))}
                </select>
            </div>
            <div className="report-filter">
                <label htmlFor={`${idPrefix}-year-filter`} className="form-label">Year</label>
                <select
                    id={`${idPrefix}-year-filter`}
                    value={filters.selectedYear}
                    onChange={(event) => filters.setSelectedYear(event.target.value)}
                    className="form-control"
                >
                    <option value="All">All Years</option>
                    {filterYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                    ))}
                </select>
            </div>
        </div>
        <p className="page-filter-panel__note">
            This page loads records for the selected DCF scope. Table search and column filters apply within this loaded data.
        </p>
    </div>
);

export const matchesDcfScope = (
    item: Record<string, any>,
    filters: DcfScopeFilterValue,
    yearKey: 'fundingYear' | 'fundYear'
) => {
    if (filters.selectedYear !== 'All' && String(item?.[yearKey] ?? '') !== String(filters.selectedYear)) return false;
    if (filters.selectedOu !== 'All' && item?.operatingUnit !== filters.selectedOu) return false;
    if (filters.selectedTier !== 'All' && item?.tier !== filters.selectedTier) return false;
    if (filters.selectedFundType !== 'All' && item?.fundType !== filters.selectedFundType) return false;
    return true;
};
