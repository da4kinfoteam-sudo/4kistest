// Author: 4K 
import React, { useState, useMemo } from 'react';
import { Subproject, IPO, Training, OtherActivity, ouToRegionMap, OfficeRequirement, StaffingRequirement, OtherProgramExpense, MarketingPartner } from '../constants';
import PhysicalDashboard from './dashboards/PhysicalDashboard';
import FinancialDashboard from './dashboards/FinancialDashboard';
import GADDashboard from './dashboards/GADDashboard';
import IPOLevelDashboard from './dashboards/IPOLevelDashboard';
import NutritionDashboard from './dashboards/NutritionDashboard';
import FarmProductivityDashboard from './dashboards/FarmProductivityDashboard';
import SCADDashboard from './dashboards/SCADDashboard';
import AgriculturalInterventionsDashboard from './dashboards/AgriculturalInterventionsDashboard';
import CommodityDashboard from './dashboards/CommodityDashboard';
import AwardsRankingsDashboard from './dashboards/AwardsRankingsDashboard';
import { ModalItem } from './dashboards/DashboardComponents';
import type { DataScope } from '../lib/scopedDataFetch';
import type { DashboardPageKey } from '../lib/appNavigation';
import { DcfScopeFilterPanel, useDcfScopeFilters } from './ui/DcfScopeFilters';

export interface DashboardsPageProps {
    activePage: DashboardPageKey;
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    marketingPartners: MarketingPartner[];
    onSelectIpo?: (ipo: IPO) => void;
    onSelectLodIpo?: (ipo: IPO, year?: number) => void;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectActivity?: (activity: Training | OtherActivity) => void;
    onSelectMarketingPartner?: (partner: MarketingPartner) => void;
    setExternalFilters?: (filters: any) => void;
    navigateTo?: (page: string) => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

const DashboardsPage: React.FC<DashboardsPageProps> = (props) => {
    const { onDataScopeChange } = props;
    const activeTab = props.activePage;
    const [modalData, setModalData] = useState<{ title: string; items: ModalItem[] } | null>(null);
    const dcfFilters = useDcfScopeFilters({
        storageKey: 'dashboards_dcf_scope',
        moduleName: 'Dashboards',
        onDataScopeChange
    });
    const {
        selectedYear,
        selectedOu,
        selectedTier,
        selectedFundType
    } = dcfFilters.value;
    const filteredData = useMemo(() => {
        // Deep sanitization helper: ensures array exists and filters out null/undefined items inside it
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        let data = {
            subprojects: props.subprojects.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherActivities: props.otherActivities.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            officeReqs: props.officeReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            staffingReqs: props.staffingReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherProgramExpenses: props.otherProgramExpenses.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED')
        };

        // Filter by Year
        if (selectedYear !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundingYear?.toString() === selectedYear);
            // Note: We DO NOT filter IPOs by registration date here anymore. 
            // Dashboards like GAD and Physical need the full IPO registry to check for engagement status in the selected year.
            data.trainings = data.trainings.filter(t => t.fundingYear?.toString() === selectedYear);
            data.otherActivities = data.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear);
            data.officeReqs = data.officeReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear);
        }

        // Filter by Tier
        if (selectedTier !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.tier === selectedTier);
            data.trainings = data.trainings.filter(t => t.tier === selectedTier);
            data.otherActivities = data.otherActivities.filter(a => a.tier === selectedTier);
            data.officeReqs = data.officeReqs.filter(i => i.tier === selectedTier);
            data.staffingReqs = data.staffingReqs.filter(i => i.tier === selectedTier);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.tier === selectedTier);
        }

        // Filter by Fund Type
        if (selectedFundType !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundType === selectedFundType);
            data.trainings = data.trainings.filter(t => t.fundType === selectedFundType);
            data.otherActivities = data.otherActivities.filter(a => a.fundType === selectedFundType);
            data.officeReqs = data.officeReqs.filter(i => i.fundType === selectedFundType);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundType === selectedFundType);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundType === selectedFundType);
        }

        // Filter by OU
        if (selectedOu !== 'All') {
            const targetRegion = ouToRegionMap[selectedOu];
            data.subprojects = data.subprojects.filter(p => p.operatingUnit === selectedOu);
            data.trainings = data.trainings.filter(t => t.operatingUnit === selectedOu);
            data.otherActivities = data.otherActivities.filter(a => a.operatingUnit === selectedOu);
            data.ipos = data.ipos.filter(i => i.region === targetRegion);
            data.officeReqs = data.officeReqs.filter(i => i.operatingUnit === selectedOu);
            data.staffingReqs = data.staffingReqs.filter(i => i.operatingUnit === selectedOu);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.operatingUnit === selectedOu);
        }

        return {
            ...data,
            subprojects: data.subprojects.map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            trainings: data.trainings.map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: data.otherActivities.map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            staffingReqs: data.staffingReqs.map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
        };
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, props]);

    const financialSourceData = useMemo(() => {
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        return {
            subprojects: props.subprojects.map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: props.otherActivities.map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: props.officeReqs,
            staffingReqs: props.staffingReqs.map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: props.otherProgramExpenses,
        };
    }, [props.subprojects, props.ipos, props.trainings, props.otherActivities, props.officeReqs, props.staffingReqs, props.otherProgramExpenses]);

    const awardsData = useMemo(() => {
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        let data = {
            subprojects: props.subprojects.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherActivities: props.otherActivities.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            officeReqs: props.officeReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            staffingReqs: props.staffingReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherProgramExpenses: props.otherProgramExpenses.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
        };

        if (selectedYear !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundingYear?.toString() === selectedYear);
            data.trainings = data.trainings.filter(t => t.fundingYear?.toString() === selectedYear);
            data.otherActivities = data.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear);
            data.officeReqs = data.officeReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear);
        }

        if (selectedTier !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.tier === selectedTier);
            data.trainings = data.trainings.filter(t => t.tier === selectedTier);
            data.otherActivities = data.otherActivities.filter(a => a.tier === selectedTier);
            data.officeReqs = data.officeReqs.filter(i => i.tier === selectedTier);
            data.staffingReqs = data.staffingReqs.filter(i => i.tier === selectedTier);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.tier === selectedTier);
        }

        if (selectedFundType !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundType === selectedFundType);
            data.trainings = data.trainings.filter(t => t.fundType === selectedFundType);
            data.otherActivities = data.otherActivities.filter(a => a.fundType === selectedFundType);
            data.officeReqs = data.officeReqs.filter(i => i.fundType === selectedFundType);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundType === selectedFundType);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundType === selectedFundType);
        }

        return {
            ...data,
            subprojects: data.subprojects.map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            trainings: data.trainings.map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: data.otherActivities.map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            staffingReqs: data.staffingReqs.map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
        };
    }, [props.subprojects, props.ipos, props.trainings, props.otherActivities, props.officeReqs, props.staffingReqs, props.otherProgramExpenses, selectedYear, selectedTier, selectedFundType]);

    return (
        <div className="data-list-page dashboards-page">
            <div className="data-list-header">
                <h2 className="data-list-title">Strategic Dashboard</h2>
            </div>
            <DcfScopeFilterPanel idPrefix="dashboard-dcf" filters={dcfFilters} />

            <div className="dashboard-tab-content">
                {activeTab === 'Physical' && (
                    <PhysicalDashboard 
                        data={filteredData} 
                        setModalData={setModalData} 
                        selectedYear={selectedYear}
                        selectedOu={selectedOu}
                        isAllOuView={selectedOu === 'All'}
                        onSelectIpo={props.onSelectIpo}
                        onSelectSubproject={props.onSelectSubproject}
                        onSelectActivity={props.onSelectActivity}
                        setExternalFilters={props.setExternalFilters}
                        navigateTo={props.navigateTo}
                    />
                )}
                {activeTab === 'Financial' && (
                    <FinancialDashboard 
                        data={financialSourceData} 
                        selectedYearProp={selectedYear}
                        selectedOuProp={selectedOu}
                        selectedTierProp={selectedTier}
                        selectedFundTypeProp={selectedFundType}
                    />
                )}
                {activeTab === 'SCAD' && <SCADDashboard ipos={filteredData.ipos} />}
                {activeTab === 'Agricultural Interventions' && <AgriculturalInterventionsDashboard subprojects={filteredData.subprojects} ipos={filteredData.ipos} />}
                {activeTab === 'Commodities' && <CommodityDashboard subprojects={filteredData.subprojects} ipos={filteredData.ipos} onSelectSubproject={props.onSelectSubproject} />}
                {activeTab === 'GAD' && <GADDashboard trainings={filteredData.trainings} otherActivities={filteredData.otherActivities} ipos={filteredData.ipos} subprojects={filteredData.subprojects} />}
                {activeTab === 'IPO Level of Development' && <IPOLevelDashboard ipos={filteredData.ipos} selectedYear={selectedYear} onSelectLodIpo={props.onSelectLodIpo} />}
                {activeTab === 'Nutrition' && <NutritionDashboard />}
                {activeTab === 'Farm Productivity and Income' && (
                    <FarmProductivityDashboard
                        subprojects={filteredData.subprojects}
                        ipos={filteredData.ipos}
                        marketingPartners={props.marketingPartners}
                        selectedYear={selectedYear}
                        selectedOu={selectedOu}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        onSelectSubproject={props.onSelectSubproject}
                        onSelectIpo={props.onSelectIpo}
                        onSelectMarketingPartner={props.onSelectMarketingPartner}
                    />
                )}
                {activeTab === 'Awards and Rankings' && (
                    <AwardsRankingsDashboard
                        data={awardsData}
                        selectedYear={selectedYear}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                    />
                )}
            </div>
            
            {modalData && (
                <div className="dashboard-modal-backdrop" onClick={() => setModalData(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <h3>{modalData.title}</h3>
                            <button type="button" onClick={() => setModalData(null)} className="dashboard-modal__close" aria-label="Close modal">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="dashboard-modal__body custom-scrollbar">
                            {modalData.items.length > 0 ? (
                                <ul className="dashboard-modal__stack">
                                    {modalData.items.map((item, index) => (
                                        <li key={index} className="dashboard-modal__event">
                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="dashboard-empty text-center">No items found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardsPage;
