
// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, Deadline, tiers, fundTypes, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import WFPReport from './reports/WFPReport';
import BPFormsReport from './reports/BPFormsReport';
import BEDSReport from './reports/BEDSReport';
import PICSReport from './reports/PICSReport';
import BAR1Report from './reports/BAR1Report';
import BudgetUtilizationReport from './reports/BudgetUtilizationReport';
import MonthlyReportMatrix from './reports/MonthlyReportMatrix'; // Import
import DetailedAccomplishmentDataReport from './reports/DetailedAccomplishmentDataReport';
import FinancialAuditReport from './reports/FinancialAuditReport';
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, Printer, SlidersHorizontal, X } from 'lucide-react';
import type { DataScope } from '../lib/scopedDataFetch';
import { exportReportWorkbook } from '../lib/reportExcelExport';
import type { ReportExcelRequest, ReportPrintRequest } from './reports/ReportUtils';

export type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1' | 'Budget Utilization Report' | 'Monthly Matrix' | 'Detailed Accomplishment Data' | 'Financial Audit';

export interface ReportsPageState {
    activeTab: ReportTab;
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedOus: string[];
    selectedTier: string;
    selectedFundType: string;
    bar1SelectedAsOfDate: string;
    monthlySelectedMonth: number;
    detailedSelectedQuarter: 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
    financialAuditSearchTerm: string;
    financialAuditSeverityFilter: string;
    financialAuditReportFilter: string;
    financialAuditSourceFilter: string;
    financialAuditIssueTypeFilter: string;
    financialAuditAsOfMonth: number;
}

interface ReportsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    deadlines: Deadline[];
    budgetCeilings: Array<{ operating_unit: string; year: number; amount: number }>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training | OtherActivity) => void;
    onSelectIpo: (ipo: IPO) => void;
    onSelectOfficeReq: (req: OfficeRequirement) => void;
    onSelectStaffingReq: (req: StaffingRequirement) => void;
    onSelectOtherExpense: (req: OtherProgramExpense) => void;
    onOpenIpoListForAncestralDomain: (adNo: string) => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
    reportState: ReportsPageState;
    onReportStateChange: React.Dispatch<React.SetStateAction<ReportsPageState>>;
}

interface PreparedPrintJob extends ReportPrintRequest {
    tableHtml: string;
    preparedBy: string;
    approvedBy: string;
}

const REPORT_PRINT_NAMES_KEY = '4kis-report-print-signatories';

const Reports: React.FC<ReportsProps> = ({
    ipos,
    subprojects,
    trainings,
    otherActivities,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    deadlines,
    budgetCeilings,
    uacsCodes,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense,
    onOpenIpoListForAncestralDomain,
    onDataScopeChange,
    reportState,
    onReportStateChange,
}) => {
    const { currentUser, getVisibilityScope, hasAccess } = useAuth();
    const visibilityScope = getVisibilityScope('Reports');
    const isLockedToOwnOu = visibilityScope === 'Own OU';
    const canViewFinancialAudit = hasAccess('Reports', 'manage_settings');

    const {
        activeTab,
        selectedYear,
        selectedReportingYear,
        selectedTier,
        selectedFundType,
    } = reportState;
    const updateReportState = React.useCallback((patch: Partial<ReportsPageState>) => {
        onReportStateChange(prev => ({ ...prev, ...patch }));
    }, [onReportStateChange]);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [pendingPrintRequest, setPendingPrintRequest] = useState<ReportPrintRequest | null>(null);
    const [pendingExcelRequest, setPendingExcelRequest] = useState<ReportExcelRequest | null>(null);
    const [preparedBy, setPreparedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    const [preparedPrintJob, setPreparedPrintJob] = useState<PreparedPrintJob | null>(null);
    const [printError, setPrintError] = useState('');
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [ouSelectorOpen, setOuSelectorOpen] = useState(false);
    const [ouSearchTerm, setOuSearchTerm] = useState('');
    const requiresFinancialHistoryScope = activeTab === 'Monthly Matrix' || activeTab === 'Financial Audit';
    const selectedOus = useMemo(() => {
        if (isLockedToOwnOu) return currentUser?.operatingUnit ? [currentUser.operatingUnit] : [];
        return Array.from(new Set((reportState.selectedOus || []).filter(ou => operatingUnits.includes(ou))));
    }, [currentUser?.operatingUnit, isLockedToOwnOu, reportState.selectedOus]);
    const allOusSelected = selectedOus.length === operatingUnits.length;
    const selectedOu = selectedOus.length === 1 ? selectedOus[0] : 'All';
    const selectedOuForCalculations = selectedOus.length === 1 ? selectedOus[0] : 'All';
    const selectedOuLabel = allOusSelected
        ? 'All OUs'
        : selectedOus.length === 1
            ? selectedOus[0]
            : selectedOus.length === 0
                ? 'No OUs selected'
                : `${selectedOus.length} OUs selected`;
    const selectedOuFileToken = allOusSelected
        ? 'All_OUs'
        : selectedOus.length === 1
            ? selectedOus[0].replace(/\s+/g, '_')
            : selectedOus.length === 0
                ? 'No_OUs'
                : `${selectedOus.length}_OUs`;
    const filteredOuOptions = useMemo(() => {
        const search = ouSearchTerm.trim().toLowerCase();
        return search
            ? operatingUnits.filter(ou => ou.toLowerCase().includes(search))
            : operatingUnits;
    }, [ouSearchTerm]);
    const updateSelectedOus = React.useCallback((nextOus: string[]) => {
        if (isLockedToOwnOu) return;
        const normalized = Array.from(new Set(nextOus.filter(ou => operatingUnits.includes(ou))));
        updateReportState({
            selectedOus: normalized,
            selectedOu: normalized.length === 1 ? normalized[0] : 'All',
        });
    }, [isLockedToOwnOu, updateReportState]);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(REPORT_PRINT_NAMES_KEY);
            if (!saved) return;
            const parsed = JSON.parse(saved);
            setPreparedBy(parsed.preparedBy || '');
            setApprovedBy(parsed.approvedBy || '');
        } catch {
            // Ignore malformed local preference data.
        }
    }, []);

    useEffect(() => {
        if (requiresFinancialHistoryScope) return;
        onDataScopeChange?.({
            year: selectedYear,
            operatingUnit: selectedOu,
            operatingUnits: allOusSelected ? undefined : selectedOus,
            tier: selectedTier,
            fundType: selectedFundType,
            canViewAllOus: !isLockedToOwnOu,
            requestedBy: currentUser?.id ?? null
        });
    }, [allOusSelected, currentUser?.id, isLockedToOwnOu, onDataScopeChange, requiresFinancialHistoryScope, selectedFundType, selectedOu, selectedOus, selectedTier, selectedYear]);

    useEffect(() => {
        if (!requiresFinancialHistoryScope) return;
        if (activeTab === 'Financial Audit' && !canViewFinancialAudit) return;
        onDataScopeChange?.({
            year: 'All',
            operatingUnit: selectedOu,
            operatingUnits: allOusSelected ? undefined : selectedOus,
            tier: selectedTier,
            fundType: 'All',
            canViewAllOus: !isLockedToOwnOu,
            requestedBy: currentUser?.id ?? null
        });
    }, [activeTab, allOusSelected, canViewFinancialAudit, currentUser?.id, isLockedToOwnOu, onDataScopeChange, requiresFinancialHistoryScope, selectedOu, selectedOus, selectedTier]);

    useEffect(() => {
        if (isLockedToOwnOu && currentUser) {
            updateReportState({ selectedOu: currentUser.operatingUnit, selectedOus: [currentUser.operatingUnit] });
        }
    }, [currentUser, isLockedToOwnOu, updateReportState]);

    useEffect(() => {
        if (isLockedToOwnOu || Array.isArray(reportState.selectedOus)) return;
        updateReportState({ selectedOus: operatingUnits, selectedOu: 'All' });
    }, [isLockedToOwnOu, reportState.selectedOus, updateReportState]);

    useEffect(() => {
        if (!canViewFinancialAudit && activeTab === 'Financial Audit') {
            updateReportState({ activeTab: 'WFP' });
        }
    }, [activeTab, canViewFinancialAudit, updateReportState]);

    useEffect(() => {
        const handleAfterPrint = () => {
            document.body.classList.remove('report-print-active');
            setPreparedPrintJob(null);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const availableYears = useMemo(() => {
        return [...filterYears].sort((a, b) => parseInt(b) - parseInt(a));
    }, []);

    // Helper functions for filtering
    const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
    const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

    const filterByOu = (list: any[]) => {
        if (allOusSelected) return list;
        if (selectedOus.length === 0) return [];
        return list.filter(item => selectedOus.includes(item.operatingUnit));
    };

    const targetRegions = useMemo(() => {
        if (allOusSelected) return null;
        return new Set(selectedOus.map(ou => ouToRegionMap[ou]).filter(Boolean));
    }, [allOusSelected, selectedOus]);
    const filterIpoByRegion = (list: IPO[]) => {
        const approvedList = list.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED');
        if (allOusSelected) return approvedList;
        if (!targetRegions || targetRegions.size === 0) return [];
        return approvedList.filter(i => targetRegions.has(i.region));
    };

    const baseFilter = (item: any) => {
        if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
        return true;
    };

    // Filter logic for Financial History Table (Ignores Year AND Fund Type filter)
    // This allows Table 2 in MonthlyReportMatrix to show Current vs Continuing breakdown
    const financialBaseFilter = (item: any) => {
        if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        // NOTE: fundType filter is INTENTIONALLY skipped here to allow aggregation of Current vs Continuing
        return true;
    };

    // Data filtered by Year (For Physical Reports)
    const filteredData = useMemo(() => {
        let filtered = {
            subprojects: subprojects.filter(baseFilter),
            ipos: ipos,
            trainings: trainings.filter(baseFilter),
            otherActivities: otherActivities.filter(baseFilter),
            officeReqs: officeReqs.filter(baseFilter),
            staffingReqs: staffingReqs.filter(baseFilter),
            otherProgramExpenses: otherProgramExpenses.filter(baseFilter)
        };

        if (selectedYear !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                trainings: filtered.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                otherActivities: filtered.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear),
                officeReqs: filtered.officeReqs.filter(i => i.fundYear?.toString() === selectedYear),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear),
            };
        }

        return {
            subprojects: filterByOu(filtered.subprojects).map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: filterIpoByRegion(filtered.ipos),
            trainings: filterByOu(filtered.trainings).map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: filterByOu(filtered.otherActivities).map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: filterByOu(filtered.officeReqs),
            staffingReqs: filterByOu(filtered.staffingReqs).map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: filterByOu(filtered.otherProgramExpenses),
        };
    }, [selectedYear, allOusSelected, selectedOus, targetRegions, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    // Data IGNORING Year and FundType Filter (For Financial History Table)
    const financialFilteredData = useMemo(() => {
        // Apply OU and Tier filters only
        let filtered = {
            subprojects: subprojects.filter(financialBaseFilter),
            ipos: ipos,
            trainings: trainings.filter(financialBaseFilter),
            otherActivities: otherActivities.filter(financialBaseFilter),
            officeReqs: officeReqs.filter(financialBaseFilter),
            staffingReqs: staffingReqs.filter(financialBaseFilter),
            otherProgramExpenses: otherProgramExpenses.filter(financialBaseFilter)
        };

        return {
            subprojects: filterByOu(filtered.subprojects).map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: filterIpoByRegion(filtered.ipos),
            trainings: filterByOu(filtered.trainings).map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: filterByOu(filtered.otherActivities).map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: filterByOu(filtered.officeReqs),
            staffingReqs: filterByOu(filtered.staffingReqs).map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: filterByOu(filtered.otherProgramExpenses),
        };
    }, [allOusSelected, selectedOus, targetRegions, selectedTier, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    const reportTabs: { tabName: ReportTab; label: string }[] = [
        { tabName: 'WFP', label: 'WFP' },
        { tabName: 'BP Forms', label: 'BP Forms' },
        { tabName: 'BEDS', label: 'BEDS' },
        { tabName: 'PICS', label: 'PICS' },
        { tabName: 'BAR1', label: 'BAR1' },
        { tabName: 'Budget Utilization Report', label: 'Budget Utilization' },
        { tabName: 'Monthly Matrix', label: 'Monthly Matrix' },
        { tabName: 'Detailed Accomplishment Data', label: 'Detailed Accomplishment Data' },
        ...(canViewFinancialAudit ? [{ tabName: 'Financial Audit' as ReportTab, label: 'Financial Audit' }] : []),
    ];

    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => updateReportState({ activeTab: tabName })}
                className={`data-tab ${isActive ? 'is-active' : ''}`}
            >
                {label}
            </button>
        );
    }

    const cloneReportTable = (tableElementId: string) => {
        const source = document.getElementById(tableElementId);
        if (!source) return '';
        const clone = source.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.querySelectorAll('.print-hidden, button, [aria-hidden="true"].btn-symbol').forEach(element => element.remove());
        clone.querySelectorAll('[style]').forEach(element => {
            const htmlElement = element as HTMLElement;
            htmlElement.style.position = '';
            htmlElement.style.left = '';
            htmlElement.style.top = '';
            htmlElement.style.transform = '';
            htmlElement.style.maxHeight = '';
            htmlElement.style.overflow = '';
        });
        return clone.outerHTML;
    };

    const handleRequestPrint = (request: ReportPrintRequest) => {
        setPrintError('');
        setPendingPrintRequest({
            ...request,
            ouName: selectedOuLabel,
        });
    };

    const handleRequestExport = (request: ReportExcelRequest) => {
        setPrintError('');
        const fileName = request.fileName.replace(/_(All|All_OUs|NPMO|RPMO[^.]*)\.xlsx$/i, `_${selectedOuFileToken}.xlsx`);
        setPendingExcelRequest({
            ...request,
            ouName: selectedOuLabel,
            fileName,
        });
    };

    const closeOutputModal = () => {
        setPendingPrintRequest(null);
        setPendingExcelRequest(null);
        setPrintError('');
    };

    const handleConfirmOutput = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!pendingPrintRequest && !pendingExcelRequest) return;
        const nextPreparedBy = preparedBy.trim();
        const nextApprovedBy = approvedBy.trim();
        if (!nextPreparedBy || !nextApprovedBy) {
            setPrintError('Prepared By and Approved By are required before printing.');
            return;
        }

        try {
            localStorage.setItem(REPORT_PRINT_NAMES_KEY, JSON.stringify({
                preparedBy: nextPreparedBy,
                approvedBy: nextApprovedBy,
            }));
        } catch {
            // Printing should still continue if local preference storage is unavailable.
        }

        if (pendingExcelRequest) {
            setIsExportingExcel(true);
            try {
                await exportReportWorkbook(pendingExcelRequest, {
                    preparedBy: nextPreparedBy,
                    approvedBy: nextApprovedBy,
                });
                closeOutputModal();
            } catch (error) {
                console.error('Failed to export report workbook:', error);
                setPrintError('Unable to generate the Excel report. Please try again.');
            } finally {
                setIsExportingExcel(false);
            }
            return;
        }

        if (pendingPrintRequest) {
            const tableHtml = cloneReportTable(pendingPrintRequest.tableElementId);
            if (!tableHtml) {
                setPrintError('Unable to find the selected report table for printing.');
                return;
            }

            const printJob: PreparedPrintJob = {
                ...pendingPrintRequest,
                tableHtml,
                preparedBy: nextPreparedBy,
                approvedBy: nextApprovedBy,
            };
            setPendingPrintRequest(null);
            setPreparedPrintJob(printJob);
            document.body.classList.add('report-print-active');
            window.setTimeout(() => window.print(), 100);
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'WFP':
                return <WFPReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'BP Forms':
                return <BPFormsReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'BEDS':
                return (
                    <BEDSReport
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedFundType={selectedFundType}
                        selectedTier={selectedTier}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onSelectOtherExpense={onSelectOtherExpense}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'PICS':
                return (
                    <PICSReport
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onOpenIpoListForAncestralDomain={onOpenIpoListForAncestralDomain}
                        selectedAsOfDate={reportState.bar1SelectedAsOfDate}
                        onSelectedAsOfDateChange={(bar1SelectedAsOfDate) => updateReportState({ bar1SelectedAsOfDate })}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'BAR1':
                return (
                    <BAR1Report
                        data={filteredData}
                        uacsCodes={uacsCodes}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        deadlines={deadlines}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectIpo={onSelectIpo}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onOpenIpoListForAncestralDomain={onOpenIpoListForAncestralDomain}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'Budget Utilization Report':
                return <BudgetUtilizationReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} selectedTier={selectedTier} selectedFundType={selectedFundType} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'Monthly Matrix':
                // Pass filteredData for Physical (Year specific) and financialFilteredData for Financial (History/Breakdown)
                return <MonthlyReportMatrix data={filteredData} financialData={financialFilteredData} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} selectedMonth={reportState.monthlySelectedMonth} onSelectedMonthChange={(monthlySelectedMonth) => updateReportState({ monthlySelectedMonth })} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'Detailed Accomplishment Data':
                return (
                    <DetailedAccomplishmentDataReport
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        selectedQuarter={reportState.detailedSelectedQuarter}
                        onSelectedQuarterChange={(detailedSelectedQuarter) => updateReportState({ detailedSelectedQuarter })}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'Financial Audit':
                if (!canViewFinancialAudit) return null;
                return (
                    <FinancialAuditReport
                        data={financialFilteredData}
                        budgetCeilings={budgetCeilings}
                        selectedYear={selectedYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        searchTerm={reportState.financialAuditSearchTerm}
                        severityFilter={reportState.financialAuditSeverityFilter}
                        reportFilter={reportState.financialAuditReportFilter}
                        sourceFilter={reportState.financialAuditSourceFilter}
                        issueTypeFilter={reportState.financialAuditIssueTypeFilter}
                        auditAsOfMonth={reportState.financialAuditAsOfMonth}
                        onFilterChange={(patch) => updateReportState({
                            financialAuditSearchTerm: patch.searchTerm ?? reportState.financialAuditSearchTerm,
                            financialAuditSeverityFilter: patch.severityFilter ?? reportState.financialAuditSeverityFilter,
                            financialAuditReportFilter: patch.reportFilter ?? reportState.financialAuditReportFilter,
                            financialAuditSourceFilter: patch.sourceFilter ?? reportState.financialAuditSourceFilter,
                            financialAuditIssueTypeFilter: patch.issueTypeFilter ?? reportState.financialAuditIssueTypeFilter,
                            financialAuditAsOfMonth: patch.auditAsOfMonth ?? reportState.financialAuditAsOfMonth,
                        })}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onSelectOtherExpense={onSelectOtherExpense}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="data-list-page reports-page">
            <div className="data-list-header print-hidden">
                <h2 className="data-list-title">Reports</h2>
                <div className="page-filter-toggle">
                    <span className="page-filter-summary">
                        {[selectedOuLabel, selectedTier, selectedFundType, `FY ${selectedYear}`, `RY ${selectedReportingYear}`].join(' / ')}
                    </span>
                    <button
                        type="button"
                        className={`btn btn-secondary page-filter-button ${filtersOpen ? 'is-open' : ''}`}
                        onClick={() => setFiltersOpen(prev => !prev)}
                        aria-expanded={filtersOpen}
                        aria-controls="reports-filter-panel"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                        <span>Filters</span>
                        <ChevronDown aria-hidden="true" className="page-filter-button__chevron" />
                    </button>
                </div>
            </div>

            <div id="reports-filter-panel" className={`report-filter-panel page-filter-panel print-hidden ${filtersOpen ? 'is-open' : ''}`} hidden={!filtersOpen}>
                <div className="report-filter-grid">
                    <div className="report-filter">
                        <label htmlFor="ou-filter-button" className="form-label">OU</label>
                        <div className="report-ou-multiselect">
                            <button
                                id="ou-filter-button"
                                type="button"
                                className="form-control report-ou-multiselect__button"
                                onClick={() => !isLockedToOwnOu && setOuSelectorOpen(prev => !prev)}
                                disabled={isLockedToOwnOu}
                                aria-expanded={ouSelectorOpen}
                                aria-controls="reports-ou-selector"
                            >
                                <span>{selectedOuLabel}</span>
                                <ChevronDown aria-hidden="true" className={`report-ou-multiselect__chevron ${ouSelectorOpen ? 'is-open' : ''}`} />
                            </button>
                            {ouSelectorOpen && !isLockedToOwnOu && (
                                <div id="reports-ou-selector" className="report-ou-multiselect__menu">
                                    <input
                                        type="search"
                                        value={ouSearchTerm}
                                        onChange={(event) => setOuSearchTerm(event.target.value)}
                                        className="form-control report-ou-multiselect__search"
                                        placeholder="Search OU..."
                                    />
                                    <div className="report-ou-multiselect__actions">
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateSelectedOus(operatingUnits)}>Select All</button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateSelectedOus([])}>Clear All</button>
                                    </div>
                                    <div className="report-ou-multiselect__list">
                                        {filteredOuOptions.map(ou => (
                                            <label key={ou} className="report-ou-multiselect__option">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOus.includes(ou)}
                                                    onChange={(event) => {
                                                        updateSelectedOus(event.target.checked
                                                            ? [...selectedOus, ou]
                                                            : selectedOus.filter(item => item !== ou));
                                                    }}
                                                />
                                                <span>{ou}</span>
                                            </label>
                                        ))}
                                        {filteredOuOptions.length === 0 && (
                                            <p className="report-ou-multiselect__empty">No OUs found.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="tier-filter" className="form-label">Tier</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => updateReportState({ selectedTier: e.target.value })}
                            className="form-control"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="fund-type-filter" className="form-label">Fund Type</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => updateReportState({ selectedFundType: e.target.value })}
                            className="form-control"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="year-filter" className="form-label">Fund Year</label>
                        <select 
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => updateReportState({ selectedYear: e.target.value, selectedReportingYear: e.target.value })}
                            className="form-control"
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => ( <option key={year} value={year}>{year}</option> ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="reporting-year-filter" className="form-label">Reporting Year</label>
                        <select
                            id="reporting-year-filter"
                            value={selectedReportingYear}
                            onChange={(e) => updateReportState({ selectedReportingYear: e.target.value })}
                            className="form-control"
                        >
                            <option value="All">All Reporting Years</option>
                            {availableYears.map(year => ( <option key={year} value={year}>{year}</option> ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="report-tabs-card print-hidden">
                <nav className="data-tabs" aria-label="Report tabs">
                    {reportTabs.map(tab => (
                        <TabButton key={tab.tabName} tabName={tab.tabName} label={tab.label} />
                    ))}
                </nav>
            </div>

            <div className="report-output">
                {renderTabContent()}
            </div>

            {(pendingPrintRequest || pendingExcelRequest) && (
                <div className="modal-backdrop print-hidden" role="presentation">
                    <form className="modal-card report-print-modal" onSubmit={handleConfirmOutput}>
                        <div className="modal-card__header">
                            <div>
                                <h3>{pendingExcelRequest ? 'Export Report' : 'Print Report'}</h3>
                                <p>{pendingPrintRequest?.sectionName || pendingPrintRequest?.reportName || pendingExcelRequest?.reportName}</p>
                            </div>
                            <button
                                type="button"
                                className="modal-card__close"
                                onClick={closeOutputModal}
                                aria-label="Close report output dialog"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="modal-card__body report-print-modal__body">
                            <label className="form-field">
                                <span className="form-label">Prepared By</span>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={preparedBy}
                                    onChange={(event) => setPreparedBy(event.target.value)}
                                    placeholder="Enter prepared by name"
                                    autoFocus
                                />
                            </label>
                            <label className="form-field">
                                <span className="form-label">Approved By</span>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={approvedBy}
                                    onChange={(event) => setApprovedBy(event.target.value)}
                                    placeholder="Enter approved by name"
                                />
                            </label>
                            {printError && <p className="form-error">{printError}</p>}
                        </div>
                        <div className="modal-card__footer">
                            <button type="button" className="btn btn-secondary" onClick={closeOutputModal} disabled={isExportingExcel}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={isExportingExcel}>
                                <Printer aria-hidden="true" />
                                <span>{pendingExcelRequest ? (isExportingExcel ? 'Exporting...' : 'Export XLSX') : 'Print'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {preparedPrintJob && (
                <section className="report-print-shell" aria-hidden={!preparedPrintJob}>
                    <header className="report-print-header">
                        <img src="/assets/4klogo.png" alt="4K Program logo" />
                        <div>
                            <p>Department of Agriculture.</p>
                            <p>Kabuhayan at Kaunlaran ng Kababayang Katutubo</p>
                            <p>{preparedPrintJob.reportName} - {preparedPrintJob.ouName}</p>
                        </div>
                    </header>
                    <main className="report-print-body" dangerouslySetInnerHTML={{ __html: preparedPrintJob.tableHtml }} />
                    <footer className="report-print-signatures">
                        <div>
                            <span className="report-print-signature-line" />
                            <strong>{preparedPrintJob.preparedBy}</strong>
                            <small>Prepared By</small>
                        </div>
                        <div>
                            <span className="report-print-signature-line" />
                            <strong>{preparedPrintJob.approvedBy}</strong>
                            <small>Approved By</small>
                        </div>
                    </footer>
                </section>
            )}
        </div>
    );
};

export default Reports;
