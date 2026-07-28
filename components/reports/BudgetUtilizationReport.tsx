// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { deriveExcelHeaderMerges, ExcelColumnFormat, getObjectTypeByCode, ReportExcelRequest, ReportPrintRequest, withReportYearLabel } from './ReportUtils';
import { collectFinancialLineItems, FinancialAggregationFilters } from '../../lib/financialAggregation';
import { getActivityDisplayTitle } from '../../lib/entityIdentity';

interface BudgetUtilizationReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
    uacsCodes: any;
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedTier?: string;
    selectedFundType?: string;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = [
    { name: '1st Quarter', months: [0, 1, 2] },
    { name: '2nd Quarter', months: [3, 4, 5] },
    { name: '3rd Quarter', months: [6, 7, 8] },
    { name: '4th Quarter', months: [9, 10, 11] }
];

const formatCurrencyWhole = (amount: number) => {
    if (!amount) return '';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const formatPercent = (value: number, total: number) => {
    if (!total || total === 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
};

const createMetrics = () => ({ mooe: 0, co: 0, total: 0 });
const createMonthData = () => ({ obligation: createMetrics(), disbursement: createMetrics() });
const createActivityData = (name: string) => ({
    name,
    allotment: createMetrics(),
    months: Array.from({ length: 12 }, createMonthData)
});

const addMetrics = (a: any, b: any) => {
    a.mooe += b.mooe;
    a.co += b.co;
    a.total += b.total;
};

const addMonthData = (a: any, b: any) => {
    addMetrics(a.obligation, b.obligation);
    addMetrics(a.disbursement, b.disbursement);
};

const addActivityData = (a: any, b: any) => {
    addMetrics(a.allotment, b.allotment);
    for (let i = 0; i < 12; i++) {
        addMonthData(a.months[i], b.months[i]);
    }
};

const getMonthIndex = (dateString: string) => {
    if (!dateString) return -1;
    // Use manual parsing to avoid timezone shifts
    // Format is usually YYYY-MM-DD or YYYY-MM
    const parts = dateString.split('-');
    if (parts.length >= 2) {
        const month = parseInt(parts[1], 10);
        if (!isNaN(month) && month >= 1 && month <= 12) {
            return month - 1; // 0-indexed
        }
    }
    // Fallback but safer
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return -1;
    // If it's a T00:00:00Z date, getMonth might shift it. 
    // We can use getUTCMonth if the date string has no time component
    return date.getUTCMonth(); 
};

const MetricsColumns: React.FC<{ metrics: any, allotmentTotal: number, obligationTotal?: number, showPercent?: boolean, isUnpaid?: boolean }> = ({ metrics, allotmentTotal, obligationTotal, showPercent = true, isUnpaid = false }) => {
    const cellClass = "bur-report__cell text-right whitespace-nowrap";
    return (
        <>
            <td className={cellClass}>{formatCurrencyWhole(metrics.mooe)}</td>
            <td className={cellClass}>{formatCurrencyWhole(metrics.co)}</td>
            <td className={`${cellClass} bur-report__cell--emphasis`}>{formatCurrencyWhole(metrics.total)}</td>
            {showPercent && !isUnpaid && (
                <>
                    {obligationTotal !== undefined && (
                        <td className={`${cellClass} bur-report__cell--percent-obligation`}>{formatPercent(metrics.total, obligationTotal)}</td>
                    )}
                    <td className={`${cellClass} bur-report__cell--percent-allotment`}>{formatPercent(metrics.total, allotmentTotal)}</td>
                </>
            )}
            {showPercent && isUnpaid && (
                <td className={`${cellClass} bur-report__cell--percent-unpaid`}>{formatPercent(metrics.total, obligationTotal || 0)}</td>
            )}
        </>
    );
};

const MonthColumns: React.FC<{ monthData: any, allotmentTotal: number }> = ({ monthData, allotmentTotal }) => {
    return (
        <>
            <MetricsColumns metrics={monthData.obligation} allotmentTotal={allotmentTotal} />
            <MetricsColumns metrics={monthData.disbursement} allotmentTotal={allotmentTotal} obligationTotal={monthData.obligation.total} />
        </>
    );
};

const ActivityRow: React.FC<{
    activity: any;
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ activity, indentLevel, dataCellClass, indentClasses }) => {
    
    const quarters = QUARTERS.map(q => {
        const qData = createMonthData();
        q.months.forEach(m => addMonthData(qData, activity.months[m]));
        return qData;
    });

    const grandTotal = createMonthData();
    quarters.forEach(q => addMonthData(grandTotal, q));

    const unpaidObligation = createMetrics();
    unpaidObligation.mooe = grandTotal.obligation.mooe - grandTotal.disbursement.mooe;
    unpaidObligation.co = grandTotal.obligation.co - grandTotal.disbursement.co;
    unpaidObligation.total = grandTotal.obligation.total - grandTotal.disbursement.total;

    return (
        <tr className="bur-report__row">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 z-10 bur-report__sticky`}>{getActivityDisplayTitle(activity)}</td>
            
            {/* Allotment */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(activity.allotment.mooe)}</td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(activity.allotment.co)}</td>
            <td className={`${dataCellClass} bur-report__cell--total text-right whitespace-nowrap`}>{formatCurrencyWhole(activity.allotment.total)}</td>
            
            {/* Adjustment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} bur-report__cell--total text-right whitespace-nowrap`}></td>

            {/* Adjusted Allotment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} bur-report__cell--total text-right whitespace-nowrap`}></td>

            {/* Months and Quarters */}
            {QUARTERS.map((q, qIdx) => (
                <React.Fragment key={q.name}>
                    {q.months.map(mIdx => (
                        <MonthColumns key={mIdx} monthData={activity.months[mIdx]} allotmentTotal={activity.allotment.total} />
                    ))}
                    {/* Quarter Total */}
                    <td className="bur-report__separator bur-report__separator--quarter"></td>
                    <MonthColumns monthData={quarters[qIdx]} allotmentTotal={activity.allotment.total} />
                    <td className="bur-report__separator bur-report__separator--quarter"></td>
                </React.Fragment>
            ))}

            {/* Grand Total */}
            <td className="bur-report__separator bur-report__separator--grand"></td>
            <MonthColumns monthData={grandTotal} allotmentTotal={activity.allotment.total} />
            <td className="bur-report__separator bur-report__separator--grand"></td>

            {/* Unpaid Obligation */}
            <MetricsColumns metrics={unpaidObligation} allotmentTotal={activity.allotment.total} obligationTotal={grandTotal.obligation.total} isUnpaid={true} />
        </tr>
    );
};

const SummaryRow: React.FC<{
    items: any[];
    label: string;
    rowKey: string;
    isExpanded: boolean;
    indentLevel: number;
    toggleRow: (key: string) => void;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ items, label, rowKey, isExpanded, indentLevel, toggleRow, dataCellClass, indentClasses }) => {
    
    if (!items || items.length === 0) {
        return (
             <tr className="bur-report__row bur-report__row--summary">
                <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 z-10 bur-report__sticky`}>
                     <span className="inline-block w-5 text-center"></span> {label}
                </td>
                <td colSpan={166} className={`${dataCellClass} text-center italic`}>No activities for this item.</td>
            </tr>
        );
    }

    const summary = createActivityData(label);
    items.forEach(item => addActivityData(summary, item));

    const quarters = QUARTERS.map(q => {
        const qData = createMonthData();
        q.months.forEach(m => addMonthData(qData, summary.months[m]));
        return qData;
    });

    const grandTotal = createMonthData();
    quarters.forEach(q => addMonthData(grandTotal, q));

    const unpaidObligation = createMetrics();
    unpaidObligation.mooe = grandTotal.obligation.mooe - grandTotal.disbursement.mooe;
    unpaidObligation.co = grandTotal.obligation.co - grandTotal.disbursement.co;
    unpaidObligation.total = grandTotal.obligation.total - grandTotal.disbursement.total;

    return (
        <tr onClick={() => toggleRow(rowKey)} className="bur-report__row bur-report__row--summary cursor-pointer">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 z-10 bur-report__sticky`}>
                <span className="report-table__toggle">{isExpanded ? '−' : '+'}</span> {label}
            </td>
            
            {/* Allotment */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(summary.allotment.mooe)}</td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(summary.allotment.co)}</td>
            <td className={`${dataCellClass} bur-report__cell--summary-total text-right whitespace-nowrap`}>{formatCurrencyWhole(summary.allotment.total)}</td>
            
            {/* Adjustment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} bur-report__cell--summary-total text-right whitespace-nowrap`}></td>

            {/* Adjusted Allotment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} bur-report__cell--summary-total text-right whitespace-nowrap`}></td>

            {/* Months and Quarters */}
            {QUARTERS.map((q, qIdx) => (
                <React.Fragment key={q.name}>
                    {q.months.map(mIdx => (
                        <MonthColumns key={mIdx} monthData={summary.months[mIdx]} allotmentTotal={summary.allotment.total} />
                    ))}
                    {/* Quarter Total */}
                    <td className="bur-report__separator bur-report__separator--quarter"></td>
                    <MonthColumns monthData={quarters[qIdx]} allotmentTotal={summary.allotment.total} />
                    <td className="bur-report__separator bur-report__separator--quarter"></td>
                </React.Fragment>
            ))}

            {/* Grand Total */}
            <td className="bur-report__separator bur-report__separator--grand"></td>
            <MonthColumns monthData={grandTotal} allotmentTotal={summary.allotment.total} />
            <td className="bur-report__separator bur-report__separator--grand"></td>

            {/* Unpaid Obligation */}
            <MetricsColumns metrics={unpaidObligation} allotmentTotal={summary.allotment.total} obligationTotal={grandTotal.obligation.total} isUnpaid={true} />
        </tr>
    );
};

const BudgetUtilizationReport: React.FC<BudgetUtilizationReportProps> = ({ data, uacsCodes, selectedYear, selectedReportingYear, selectedOu, selectedTier = 'All', selectedFundType = 'All', onPrintReport, onExportReport }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const processedData = useMemo(() => {
        const filters: FinancialAggregationFilters = {
            year: selectedYear,
            actualYear: selectedReportingYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
        };
        const lineItems = collectFinancialLineItems({
            subprojects: data.subprojects,
            activities: [...data.trainings, ...data.otherActivities],
            officeReqs: data.officeReqs,
            staffingReqs: data.staffingReqs,
            otherProgramExpenses: data.otherProgramExpenses,
        }, filters);

        const groupedData: { [key: string]: any } = {
            'Social Preparation': [], 
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': [], 
            'Program Management': { 
                isNestedExpandable: true, 
                packages: {
                    'Staff Requirements': { items: [] },
                    'Office Requirements': { items: [] },
                    'Activities': { items: [] }
                } 
            }
        };
        
        lineItems.forEach(item => {
            let targetList;
            if (item.component === 'Production and Livelihood') {
                const packageKey = item.packageType || 'Trainings';
                if (!groupedData['Production and Livelihood'].packages[packageKey]) {
                    groupedData['Production and Livelihood'].packages[packageKey] = { items: [] };
                }
                targetList = groupedData['Production and Livelihood'].packages[packageKey].items;
            } else if (item.component === 'Program Management') {
                 const packageKey = item.packageType || 'Activities';
                 if (!groupedData['Program Management'].packages[packageKey]) {
                    groupedData['Program Management'].packages[packageKey] = { items: [] };
                 }
                 targetList = groupedData['Program Management'].packages[packageKey].items;
            } else if (groupedData[item.component]) {
                targetList = groupedData[item.component];
            } else {
                return; 
            }

            let activity = targetList.find((a: any) => a.name === item.activityName);
            if (!activity) {
                activity = createActivityData(item.activityName);
                targetList.push(activity);
            }
            
            const objectType = item.objectType || getObjectTypeByCode(item.uacsCode, uacsCodes);
            const isCO = objectType === 'CO';
            
            if (isCO) activity.allotment.co += item.alloc;
            else activity.allotment.mooe += item.alloc;
            activity.allotment.total += item.alloc;

            item.obligationByMonth.forEach((amount, monthIndex) => {
                const obli = activity.months[monthIndex].obligation;
                if (isCO) obli.co += amount;
                else obli.mooe += amount;
                obli.total += amount;
            });

            item.disbursementByMonth.forEach((amount, monthIndex) => {
                const disb = activity.months[monthIndex].disbursement;
                if (isCO) disb.co += amount;
                else disb.mooe += amount;
                disb.total += amount;
            });
        });
        
        const plPackageKeys = Object.keys(groupedData['Production and Livelihood'].packages);
        plPackageKeys.sort((a, b) => {
            if (a === 'Trainings') return -1;
            if (b === 'Trainings') return 1;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        const plSortedPackages: { [key: string]: any } = {};
        for (const key of plPackageKeys) { plSortedPackages[key] = groupedData['Production and Livelihood'].packages[key]; }
        groupedData['Production and Livelihood'].packages = plSortedPackages;

        return { rows: groupedData };
    }, [data, selectedYear, selectedReportingYear, selectedOu, selectedTier, selectedFundType, uacsCodes]);

    const { rows } = processedData;

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key);
            else newSet.add(key);
            return newSet;
        });
    };

    const grandTotals = useMemo(() => {
        const allActivities: any[] = [];
        Object.values(rows).forEach((componentData: any) => {
            if (Array.isArray(componentData)) {
                allActivities.push(...componentData);
            } else if (componentData.isNestedExpandable) {
                Object.values(componentData.packages).forEach((pkg: any) => {
                    allActivities.push(...pkg.items);
                });
            }
        });

        const summary = createActivityData('GRAND TOTAL');
        allActivities.forEach(item => addActivityData(summary, item));
        return summary;
    }, [rows]);

    const handleDownloadXlsx = () => {
        const metricHeader = ['MOOE', 'CO', 'Total'];
        const obligationHeader = ['MOOE', 'CO', 'Total', '% of Obli/Allot'];
        const disbursementHeader = ['MOOE', 'CO', 'Total', '% of Disb/Obli', '% of Disb/Allot'];
        const unpaidHeader = ['MOOE', 'CO', 'Total', '% of Unpaid/Obli'];

        const headerRow1: Array<string | number | null> = ['Program/Activity/Project', 'Allotment', '', '', 'Adjustment (+/-)', '', '', 'Adjusted Allotment', '', ''];
        const headerRow2: Array<string | number | null> = ['', ...metricHeader, ...metricHeader, ...metricHeader];
        const headerRow3: Array<string | number | null> = ['', ...metricHeader, ...metricHeader, ...metricHeader];

        const addPeriodHeader = (label: string) => {
            headerRow1.push(label, '', '', '', '', '', '', '', '');
            headerRow2.push('Obligation', '', '', '', 'Disbursement', '', '', '', '');
            headerRow3.push(...obligationHeader, ...disbursementHeader);
        };

        QUARTERS.forEach(q => {
            q.months.forEach(monthIndex => addPeriodHeader(SHORT_MONTHS[monthIndex]));
            addPeriodHeader(`${q.name} Total`);
        });
        addPeriodHeader('Grand Total');
        headerRow1.push('Unpaid Obligation', '', '', '');
        headerRow2.push('', '', '', '');
        headerRow3.push(...unpaidHeader);

        const metricValues = (metrics: any) => [metrics.mooe || 0, metrics.co || 0, metrics.total || 0];
        const obligationValues = (metrics: any, allotmentTotal: number) => [
            metrics.mooe || 0,
            metrics.co || 0,
            metrics.total || 0,
            allotmentTotal ? metrics.total / allotmentTotal : 0,
        ];
        const disbursementValues = (metrics: any, allotmentTotal: number, obligationTotal: number) => [
            metrics.mooe || 0,
            metrics.co || 0,
            metrics.total || 0,
            obligationTotal ? metrics.total / obligationTotal : 0,
            allotmentTotal ? metrics.total / allotmentTotal : 0,
        ];
        const monthValues = (monthData: any, allotmentTotal: number) => [
            ...obligationValues(monthData.obligation, allotmentTotal),
            ...disbursementValues(monthData.disbursement, allotmentTotal, monthData.obligation.total),
        ];

        const activityRow = (activity: any, label: string, indentLevel: number): Array<string | number | null> => {
            const quarters = QUARTERS.map(q => {
                const qData = createMonthData();
                q.months.forEach(monthIndex => addMonthData(qData, activity.months[monthIndex]));
                return qData;
            });

            const grandTotal = createMonthData();
            quarters.forEach(qData => addMonthData(grandTotal, qData));

            const unpaidObligation = createMetrics();
            unpaidObligation.mooe = grandTotal.obligation.mooe - grandTotal.disbursement.mooe;
            unpaidObligation.co = grandTotal.obligation.co - grandTotal.disbursement.co;
            unpaidObligation.total = grandTotal.obligation.total - grandTotal.disbursement.total;

            const row: Array<string | number | null> = [
                `${'  '.repeat(indentLevel)}${label}`,
                ...metricValues(activity.allotment),
                null, null, null,
                null, null, null,
            ];

            QUARTERS.forEach((quarter, quarterIndex) => {
                quarter.months.forEach(monthIndex => row.push(...monthValues(activity.months[monthIndex], activity.allotment.total)));
                row.push(...monthValues(quarters[quarterIndex], activity.allotment.total));
            });
            row.push(...monthValues(grandTotal, activity.allotment.total));
            row.push(...metricValues(unpaidObligation), grandTotal.obligation.total ? unpaidObligation.total / grandTotal.obligation.total : 0);
            return row;
        };

        const summaryRow = (items: any[], label: string, indentLevel: number) => {
            const summary = createActivityData(label);
            items.forEach(item => addActivityData(summary, item));
            return activityRow(summary, label, indentLevel);
        };

        const dataRows: Array<Array<string | number | null>> = [];
        Object.entries(rows).forEach(([componentName, componentData]) => {
            if (Array.isArray(componentData)) {
                dataRows.push(summaryRow(componentData, componentName, 0));
                if (expandedRows.has(componentName)) {
                    componentData.forEach(activity => dataRows.push(activityRow(activity, getActivityDisplayTitle(activity), 1)));
                }
                return;
            }

            if ((componentData as any).isNestedExpandable) {
                const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                dataRows.push(summaryRow(allPackageItems, componentName, 0));
                if (expandedRows.has(componentName)) {
                    Object.entries((componentData as any).packages).forEach(([pkgName, pkgData]: [string, any]) => {
                        dataRows.push(summaryRow(pkgData.items, pkgName, 1));
                        if (expandedRows.has(pkgName)) {
                            pkgData.items.forEach((activity: any) => dataRows.push(activityRow(activity, getActivityDisplayTitle(activity), 2)));
                        }
                    });
                }
            }
        });
        dataRows.push(summaryRow([grandTotals], 'GRAND TOTAL', 0));

        const exportRows = [headerRow1, headerRow2, headerRow3, ...dataRows];
        const columnFormats = headerRow3.reduce<Record<number, ExcelColumnFormat>>((acc, heading, index) => {
            if (index === 0) return acc;
            const label = String(heading || '');
            acc[index] = label.includes('%') ? 'percent' : 'money';
            return acc;
        }, {});

        onExportReport({
            reportName: withReportYearLabel('Budget Utilization Report', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `Budget_Utilization_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'Budget Utilization',
                rows: exportRows,
                headerRowCount: 3,
                merges: deriveExcelHeaderMerges(exportRows, 3),
                columnWidths: [34, ...Array.from({ length: Math.max(0, exportRows[0].length - 1) }, () => 13)],
                columnFormats,
            }],
        });
    };

    const indentClasses = ['pl-2', 'pl-6', 'pl-10'];
    const headerCellClass = "bur-report__head-cell";
    const dataCellClass = "bur-report__cell";

    const renderMetricsHeaders = (title: string, showPercent: boolean = true, isUnpaid: boolean = false) => (
        <>
            <th rowSpan={2} className={headerCellClass}>MOOE</th>
            <th rowSpan={2} className={headerCellClass}>CO</th>
            <th rowSpan={2} className={headerCellClass}>Total</th>
            {showPercent && !isUnpaid && (
                <>
                    {title === 'Disbursement' && <th rowSpan={2} className={headerCellClass}>% of Disb/Obli</th>}
                    <th rowSpan={2} className={headerCellClass}>{title === 'Obligation' ? '% of Obli/Allot' : '% of Disb/Allot'}</th>
                </>
            )}
            {showPercent && isUnpaid && (
                <th rowSpan={2} className={headerCellClass}>% of Unpaid/Obli</th>
            )}
        </>
    );

    const renderMonthHeaders = (title: string) => (
        <>
            <th colSpan={4} className={headerCellClass}>Obligation</th>
            <th colSpan={5} className={headerCellClass}>Disbursement</th>
        </>
    );

    return (
        <div id="bur-container" className="report-card bur-report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">Budget Utilization Report</h3>
                <div className="report-card__actions">
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('Budget Utilization Report', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'bur-table',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button onClick={handleDownloadXlsx} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>
            <div id="bur-table" className="report-table-scroll bur-report-scroll">
                <table className="bur-report-table">
                    <thead className="sticky top-0 z-20">
                        <tr>
                            <th rowSpan={3} className={`${headerCellClass} bur-report__sticky bur-report__header-cell--label`}>Program/Activity/Project</th>
                            
                            <th colSpan={3} className={headerCellClass}>Allotment</th>
                            <th colSpan={3} className={headerCellClass}>Adjustment (+/-)</th>
                            <th colSpan={3} className={headerCellClass}>Adjusted Allotment</th>
                            
                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <th key={mIdx} colSpan={9} className={headerCellClass}>{SHORT_MONTHS[mIdx]}</th>
                                    ))}
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                    <th colSpan={9} className={`${headerCellClass} bur-report__head-cell--quarter`}>{q.name} Total</th>
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                </React.Fragment>
                            ))}
                            
                            <th className="bur-report__separator bur-report__separator--grand"></th>
                            <th colSpan={9} className={`${headerCellClass} bur-report__head-cell--grand`}>Grand Total</th>
                            <th className="bur-report__separator bur-report__separator--grand"></th>

                            <th colSpan={4} className={`${headerCellClass} bur-report__head-cell--unpaid`}>Unpaid Obligation</th>
                        </tr>
                        <tr>
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>
                            
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>
                            
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>

                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <React.Fragment key={mIdx}>{renderMonthHeaders('')}</React.Fragment>
                                    ))}
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                    {renderMonthHeaders('')}
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                </React.Fragment>
                            ))}

                            <th className="bur-report__separator bur-report__separator--grand"></th>
                            {renderMonthHeaders('')}
                            <th className="bur-report__separator bur-report__separator--grand"></th>

                            {renderMetricsHeaders('Unpaid Obligation', true, true)}
                        </tr>
                        <tr>
                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <React.Fragment key={mIdx}>
                                            {renderMetricsHeaders('Obligation')}
                                            {renderMetricsHeaders('Disbursement')}
                                        </React.Fragment>
                                    ))}
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                    {renderMetricsHeaders('Obligation')}
                                    {renderMetricsHeaders('Disbursement')}
                                    <th className="bur-report__separator bur-report__separator--quarter"></th>
                                </React.Fragment>
                            ))}

                            <th className="bur-report__separator bur-report__separator--grand"></th>
                            {renderMetricsHeaders('Obligation')}
                            {renderMetricsHeaders('Disbursement')}
                            <th className="bur-report__separator bur-report__separator--grand"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(rows).map(([componentName, componentData]) => {
                            const isComponentExpanded = expandedRows.has(componentName);
                            if (Array.isArray(componentData)) {
                                 return (
                                    <React.Fragment key={componentName}>
                                        <SummaryRow 
                                            items={componentData}
                                            label={componentName}
                                            rowKey={componentName}
                                            isExpanded={isComponentExpanded}
                                            indentLevel={0}
                                            toggleRow={toggleRow}
                                            dataCellClass={dataCellClass}
                                            indentClasses={indentClasses}
                                        />
                                        {isComponentExpanded && componentData.map((act, i) => (
                                            <ActivityRow 
                                                key={`${componentName}-${i}`}
                                                activity={act}
                                                indentLevel={1}
                                                dataCellClass={dataCellClass}
                                                indentClasses={indentClasses}
                                            />
                                        ))}
                                    </React.Fragment>
                                );
                            }
                            if ((componentData as any).isNestedExpandable) {
                                 const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                                 return (
                                    <React.Fragment key={componentName}>
                                        <SummaryRow 
                                            items={allPackageItems}
                                            label={componentName}
                                            rowKey={componentName}
                                            isExpanded={isComponentExpanded}
                                            indentLevel={0}
                                            toggleRow={toggleRow}
                                            dataCellClass={dataCellClass}
                                            indentClasses={indentClasses}
                                        />
                                        {isComponentExpanded && Object.entries((componentData as any).packages).map(([pkgName, pkgData]: [string, any]) => {
                                            const isPkgExpanded = expandedRows.has(pkgName);
                                            return (
                                                <React.Fragment key={pkgName}>
                                                    <SummaryRow 
                                                        items={pkgData.items}
                                                        label={pkgName}
                                                        rowKey={pkgName}
                                                        isExpanded={isPkgExpanded}
                                                        indentLevel={1}
                                                        toggleRow={toggleRow}
                                                        dataCellClass={dataCellClass}
                                                        indentClasses={indentClasses}
                                                    />
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => (
                                                        <ActivityRow 
                                                            key={`${pkgName}-${i}`}
                                                            activity={act}
                                                            indentLevel={2}
                                                            dataCellClass={dataCellClass}
                                                            indentClasses={indentClasses}
                                                        />
                                                    ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                 );
                            }
                            return null;
                        })}
                    </tbody>
                    <tfoot>
                        <SummaryRow 
                            items={[grandTotals]} 
                            label="GRAND TOTAL" 
                            rowKey="grand-total" 
                            isExpanded={false} 
                            indentLevel={0} 
                            toggleRow={() => {}} 
                            dataCellClass={`${dataCellClass} bur-report__cell--footer`} 
                            indentClasses={indentClasses} 
                        />
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BudgetUtilizationReport;
