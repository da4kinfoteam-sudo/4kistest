
// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO } from '../../constants';
import { ReportExcelRequest, ReportPrintRequest, isParentRealignmentOrSavings, withReportYearLabel } from './ReportUtils';
import { collectFinancialLineItems, getActualDisbursementTotalAsOf, getActualObligationTotalInWindow } from '../../lib/financialAggregation';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets } from '../../lib/budgetLineAdjustments';

interface MonthlyReportMatrixProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    financialData: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedMonth: number;
    onSelectedMonthChange: (month: number) => void;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

const MONTHS = [
    { value: 0, label: 'January' }, { value: 1, label: 'February' }, { value: 2, label: 'March' },
    { value: 3, label: 'April' }, { value: 4, label: 'May' }, { value: 5, label: 'June' },
    { value: 6, label: 'July' }, { value: 7, label: 'August' }, { value: 8, label: 'September' },
    { value: 9, label: 'October' }, { value: 10, label: 'November' }, { value: 11, label: 'December' }
];

const dataCellClass = "monthly-matrix__cell monthly-matrix__cell--number";
const textCellClass = "monthly-matrix__cell monthly-matrix__cell--text";
const headerCellClass = "monthly-matrix__head-cell";

const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const MonthlyReportMatrix: React.FC<MonthlyReportMatrixProps> = ({ data, financialData, selectedYear, selectedReportingYear, selectedOu, selectedMonth, onSelectedMonthChange, onPrintReport, onExportReport }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const targetYearInt = parseInt(selectedReportingYear);
    const isYearSelected = selectedReportingYear !== 'All';

    // --- TABLE 1: Physical Accomplishment ---
    const physicalData = useMemo(() => {
        const reportDate = new Date(targetYearInt, selectedMonth + 1, 0); // End of selected month

        // Logic for Cumulative (Up to selected Month)
        const isTargetDueCumulative = (dateStr?: string) => {
            if (!dateStr || !isYearSelected) return false; 
            const d = new Date(dateStr);
            return d.getFullYear() === targetYearInt && d.getMonth() <= selectedMonth;
        };

        // Logic for Specific Month
        const isTargetDueMonthly = (dateStr?: string) => {
            if (!dateStr || !isYearSelected) return false;
            const d = new Date(dateStr);
            return d.getFullYear() === targetYearInt && d.getMonth() === selectedMonth;
        };

        const createRow = (indicator: string, unit: string, tMonth: number, aMonth: number, tCum: number, aCum: number) => {
            const vMonth = tMonth - aMonth;
            const pMonth = tMonth > 0 ? (aMonth / tMonth) * 100 : 0;
            
            const vCum = tCum - aCum;
            const pCum = tCum > 0 ? (aCum / tCum) * 100 : 0;

            return { 
                indicator, unit, 
                targetMonth: tMonth, actualMonth: aMonth, varianceMonth: vMonth, percentageMonth: pMonth,
                targetCum: tCum, actualCum: aCum, varianceCum: vCum, percentageCum: pCum
            };
        };

        const structure: { [key: string]: any } = {
            'Social Preparation': { items: [], cost: 0 },
            'Production and Livelihood': { isNested: true, packages: {}, cost: 0 },
            'Marketing and Enterprise': { items: [], cost: 0 },
            'Program Management': { isNested: true, packages: { 'Staffing': [], 'Office': [], 'Activities': [] }, cost: 0 }
        };

        const addItem = (list: any[], item: any) => {
            const existing = list.find((i: any) => i.indicator === item.indicator);
            if (existing) {
                // Aggregate Monthly
                existing.targetMonth += item.targetMonth;
                existing.actualMonth += item.actualMonth;
                existing.varianceMonth = existing.targetMonth - existing.actualMonth;
                existing.percentageMonth = existing.targetMonth > 0 ? (existing.actualMonth / existing.targetMonth) * 100 : 0;

                // Aggregate Cumulative
                existing.targetCum += item.targetCum;
                existing.actualCum += item.actualCum;
                existing.varianceCum = existing.targetCum - existing.actualCum;
                existing.percentageCum = existing.targetCum > 0 ? (existing.actualCum / existing.targetCum) * 100 : 0;
            } else {
                list.push(item);
            }
        };

        // --- 1. Subprojects Logic ---
        const packages: Record<string, Subproject[]> = {};
        const ipoAdMap = new Map<string, string>();
        data.ipos.forEach(i => ipoAdMap.set(i.name, i.ancestralDomainNo));

        data.subprojects.forEach(sp => {
            const pkg = sp.packageType || 'Other';
            if (!packages[pkg]) packages[pkg] = [];
            packages[pkg].push(sp);
            
            // Cost Aggregation
            const cost = isParentRealignmentOrSavings(sp)
                ? 0
                : sp.details.reduce((sum, d) => sum + (isBudgetLineExcludedFromTargets(d) ? 0 : getBudgetLineAmount(d)), 0);
            structure['Production and Livelihood'].cost += cost;
        });

        if (!structure['Production and Livelihood'].packages['Subproject Provisions']) {
            structure['Production and Livelihood'].packages['Subproject Provisions'] = [];
        }
        const spProvisions = structure['Production and Livelihood'].packages['Subproject Provisions'];

        const targetIpoSetCum = new Set<string>();
        const actualIpoSetCum = new Set<string>();
        const targetAdSetCum = new Set<string>();
        const actualAdSetCum = new Set<string>();
        
        const targetIpoSetMonth = new Set<string>();
        const actualIpoSetMonth = new Set<string>();
        const targetAdSetMonth = new Set<string>();
        const actualAdSetMonth = new Set<string>();

        Object.keys(packages).sort().forEach(pkg => {
            const subList = packages[pkg];
            
            // Counts
            const targetCountMonth = subList.filter(sp => !isParentRealignmentOrSavings(sp) && isTargetDueMonthly(sp.estimatedCompletionDate)).length;
            const targetCountCum = subList.filter(sp => !isParentRealignmentOrSavings(sp) && isTargetDueCumulative(sp.estimatedCompletionDate)).length;
            
            const actualCountMonth = subList.filter(sp => sp.status === 'Completed' && isTargetDueMonthly(sp.actualCompletionDate)).length;
            const actualCountCum = subList.filter(sp => sp.status === 'Completed' && isTargetDueCumulative(sp.actualCompletionDate)).length;

            subList.forEach(sp => {
                const ad = ipoAdMap.get(sp.indigenousPeopleOrganization);
                
                // Cumulative Sets
                if (!isParentRealignmentOrSavings(sp) && isTargetDueCumulative(sp.estimatedCompletionDate)) {
                    targetIpoSetCum.add(sp.indigenousPeopleOrganization);
                    if (ad) targetAdSetCum.add(ad);
                }
                if (sp.status === 'Completed' && isTargetDueCumulative(sp.actualCompletionDate)) {
                    actualIpoSetCum.add(sp.indigenousPeopleOrganization);
                    if (ad) actualAdSetCum.add(ad);
                }

                // Monthly Sets
                if (!isParentRealignmentOrSavings(sp) && isTargetDueMonthly(sp.estimatedCompletionDate)) {
                    targetIpoSetMonth.add(sp.indigenousPeopleOrganization);
                    if (ad) targetAdSetMonth.add(ad);
                }
                if (sp.status === 'Completed' && isTargetDueMonthly(sp.actualCompletionDate)) {
                    actualIpoSetMonth.add(sp.indigenousPeopleOrganization);
                    if (ad) actualAdSetMonth.add(ad);
                }
            });

            spProvisions.push(createRow(pkg, "Project", targetCountMonth, actualCountMonth, targetCountCum, actualCountCum));
        });

        // Add Aggregate Rows for Subprojects
        spProvisions.unshift(createRow("Number of IPOs", "Number", targetIpoSetMonth.size, actualIpoSetMonth.size, targetIpoSetCum.size, actualIpoSetCum.size));
        spProvisions.unshift(createRow("Number of Ancestral Domains", "Number", targetAdSetMonth.size, actualAdSetMonth.size, targetAdSetCum.size, actualAdSetCum.size));

        // --- 2. Trainings/Activities ---
        const processActivity = (act: any) => {
            const isExcluded = isParentRealignmentOrSavings(act);
            const tMonth = (!isExcluded && isTargetDueMonthly(act.date)) ? 1 : 0;
            const tCum = (!isExcluded && isTargetDueCumulative(act.date)) ? 1 : 0;
            const aMonth = (act.actualDate && isTargetDueMonthly(act.actualDate)) ? 1 : 0;
            const aCum = (act.actualDate && isTargetDueCumulative(act.actualDate)) ? 1 : 0;
            
            const item = createRow(act.name, 'Number', tMonth, aMonth, tCum, aCum);
            
            // Cost Aggregation
            const cost = isExcluded ? 0 : act.expenses.reduce((sum: number, e: any) => sum + (isBudgetLineExcludedFromTargets(e) ? 0 : getBudgetLineAmount(e)), 0);

            if (act.component === 'Production and Livelihood') {
                if (!structure['Production and Livelihood'].packages['Trainings']) structure['Production and Livelihood'].packages['Trainings'] = [];
                addItem(structure['Production and Livelihood'].packages['Trainings'], item);
                structure['Production and Livelihood'].cost += cost;
            } else if (act.component === 'Program Management') {
                addItem(structure['Program Management'].packages['Activities'], item);
                structure['Program Management'].cost += cost;
            } else if (structure[act.component]) {
                addItem(structure[act.component].items || structure[act.component], item); // Handle generic list
                structure[act.component].cost += cost;
            }
        };
        data.trainings.forEach(processActivity);
        data.otherActivities.forEach(processActivity);

        // --- 3. PM Items ---
        const processPM = (items: any[], typeKey: string, isStaff = false) => {
            items.forEach(pm => {
                const isExcluded = pm.status === 'Cancelled' || isParentRealignmentOrSavings(pm);
                const targetQty = isStaff ? 1 : (pm.numberOfUnits || 1);
                const tMonth = !isExcluded && isTargetDueMonthly(pm.obligationDate) ? targetQty : 0;
                const tCum = !isExcluded && isTargetDueCumulative(pm.obligationDate) ? targetQty : 0;
                
                const actDate = pm.actualDate || pm.actualObligationDate;
                const aMonth = (actDate && isTargetDueMonthly(actDate)) ? targetQty : 0;
                const aCum = (actDate && isTargetDueCumulative(actDate)) ? targetQty : 0;
                
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const unit = isStaff ? 'Pax' : 'Unit';
                const item = createRow(indicator, unit, tMonth, aMonth, tCum, aCum);
                
                addItem(structure['Program Management'].packages[typeKey], item);

                // Cost
                const cost = isExcluded
                    ? 0
                    : isStaff && pm.expenses && pm.expenses.length > 0
                        ? pm.expenses.reduce((sum: number, expense: any) => sum + (isBudgetLineExcludedFromTargets(expense) ? 0 : getBudgetLineAmount(expense)), 0)
                        : isStaff
                            ? pm.annualSalary
                            : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                structure['Program Management'].cost += cost;
            });
        };
        processPM(data.staffingReqs, 'Staffing', true);
        processPM(data.officeReqs, 'Office');
        // Other Expenses - Add to cost but maybe not physical count unless defined
        data.otherProgramExpenses.forEach(ope => {
             const isExcluded = ope.status === 'Cancelled' || isParentRealignmentOrSavings(ope);
             structure['Program Management'].cost += isExcluded ? 0 : ope.amount;
        });

        return structure;
    }, [data, selectedReportingYear, selectedMonth, targetYearInt, isYearSelected]);


    // --- TABLE 2: Financial History ---
    const financialHistoryData = useMemo(() => {
        if (!isYearSelected) return [];

        interface RowData {
            label: string;
            sortOrder: number;
            alloc: number;
            obli: number;
            disb: number;
        }
        
        const rowMap = new Map<string, RowData>();
        const prevYear = targetYearInt - 1;

        // Initialize Template Rows to ensure they appear
        rowMap.set('current', {
            label: `Current Year (${targetYearInt})`,
            sortOrder: targetYearInt,
            alloc: 0, obli: 0, disb: 0
        });

        rowMap.set('prev_continuing', {
            label: `Continuing (${prevYear})`,
            sortOrder: prevYear + 0.5,
            alloc: 0, obli: 0, disb: 0
        });

        rowMap.set('prev_other', {
            label: `${prevYear}`,
            sortOrder: prevYear,
            alloc: 0, obli: 0, disb: 0
        });

        const getRowInfo = (year: number, fundType: string): { key: string, label: string, sortOrder: number } | null => {
            if (year > targetYearInt) return null; 
            if (year === targetYearInt) {
                if (fundType === 'Current') {
                    return { key: 'current', label: `Current Year (${year})`, sortOrder: year };
                }
                return null; 
            } 
            if (year === prevYear) {
                if (fundType === 'Continuing') {
                    return { key: 'prev_continuing', label: `Continuing (${year})`, sortOrder: year + 0.5 };
                } else {
                    return { key: 'prev_other', label: `${year}`, sortOrder: year };
                }
            } 
            if (year < prevYear) {
                return { key: `hist_${year}`, label: `${year}`, sortOrder: year };
            }
            return null;
        };

        const isDateInReportWindow = (dateStr?: string) => {
            if (!dateStr) return false;
            // Manual check for YYYY-MM-DD or YYYY-MM
            const parts = dateStr.split('-');
            if (parts.length >= 2) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                if (year < targetYearInt) return true;
                if (year > targetYearInt) return false;
                return (month - 1) <= selectedMonth;
            }
            const d = new Date(dateStr);
            const reportDateLimit = new Date(targetYearInt, selectedMonth + 1, 0);
            return d <= reportDateLimit;
        };

        const aggregate = (year: number, fundType: string, alloc: number, obli: number, disb: number) => {
            if (!year) return;
            const info = getRowInfo(year, fundType || 'Current');
            if (!info) return;

            if (!rowMap.has(info.key)) {
                rowMap.set(info.key, {
                    label: info.label,
                    sortOrder: info.sortOrder,
                    alloc: 0,
                    obli: 0,
                    disb: 0
                });
            }
            const entry = rowMap.get(info.key)!;
            entry.alloc += alloc;
            entry.obli += obli;
            entry.disb += disb;
        };

        const lineItems = collectFinancialLineItems({
            subprojects: financialData.subprojects,
            activities: [...financialData.trainings, ...financialData.otherActivities],
            officeReqs: financialData.officeReqs,
            staffingReqs: financialData.staffingReqs,
            otherProgramExpenses: financialData.otherProgramExpenses,
        }, {
            year: 'All',
            operatingUnit: 'All',
            tier: 'All',
            fundType: 'All',
        });

        lineItems.forEach(item => {
            const year = Number(item.recordYear) || 0;
            const obligation = getActualObligationTotalInWindow(item.line, isDateInReportWindow);
            const disbursement = getActualDisbursementTotalAsOf(item.line, {
                targetYear: targetYearInt,
                selectedMonth,
                fallbackYear: item.recordYear,
                isDateIncluded: isDateInReportWindow,
            });
            aggregate(year, item.fundType || 'Current', item.alloc, obligation, disbursement);
        });

        const rows = Array.from(rowMap.entries()).map(([key, row]) => {
            const alloc = Math.ceil(row.alloc);
            const obli = Math.ceil(row.obli);
            const disb = Math.ceil(row.disb);
            const unutilized = alloc - obli;
            const unpaid = obli - disb;
            const obliRate = alloc > 0 ? (obli / alloc) * 100 : 0;
            const disbRate = obli > 0 ? (disb / obli) * 100 : 0;

            return {
                key,
                ...row,
                alloc, obli, disb, unutilized, unpaid, obliRate, disbRate
            };
        });

        return rows.sort((a, b) => a.sortOrder - b.sortOrder);
    }, [financialData, selectedReportingYear, selectedMonth, targetYearInt, isYearSelected]);

    const financialGrandTotal = useMemo(() => {
        return financialHistoryData.reduce((acc, row) => ({
            alloc: acc.alloc + row.alloc,
            obli: acc.obli + row.obli,
            disb: acc.disb + row.disb,
            unutilized: acc.unutilized + row.unutilized,
            unpaid: acc.unpaid + row.unpaid
        }), { alloc: 0, obli: 0, disb: 0, unutilized: 0, unpaid: 0 });
    }, [financialHistoryData]);

    const handleDownload = () => {
        const physRows: Array<Array<string | number | null>> = [
            [`Monthly Report - Physical Accomplishment (CY ${selectedReportingYear} - ${MONTHS[selectedMonth].label})`],
            [],
            ["Component / Indicator", "Cost", "Unit",
             "For the Month", "", "", "",
             "Cumulative (Year-to-Date)", "", "", ""],
            ["", "", "", "Target", "Actual", "Var", "%", "Target", "Actual", "Var", "%"]
        ];

        const processPhysItems = (items: any[], indent: string) => {
            items.forEach(item => {
                physRows.push([
                    indent + item.indicator,
                    null,
                    item.unit,
                    item.targetMonth, item.actualMonth, item.varianceMonth, item.percentageMonth / 100,
                    item.targetCum, item.actualCum, item.varianceCum, item.percentageCum / 100
                ]);
            });
        };

        Object.entries(physicalData).forEach(([key, val]: [string, any]) => {
            physRows.push([key, val.cost, null, null, null, null, null, null, null, null, null]);

            if (Array.isArray(val)) {
                processPhysItems(val, "  " );
            } else if (val.isNested) {
                Object.entries(val.packages).forEach(([pkg, items]: [string, any]) => {
                    if (items.length > 0) {
                        physRows.push([`  ${pkg}`, null, null, null, null, null, null, null, null, null, null]);
                        processPhysItems(items, "    " );
                    }
                });
            } else if (val.items) {
                processPhysItems(val.items, "  " );
            }
        });

        const finRows: Array<Array<string | number | null>> = [
            [`Monthly Report - Financial Accomplishment (Absolute Value) (CY ${selectedReportingYear} - ${MONTHS[selectedMonth].label})`],
            [],
            ["Fund Source", "Allocation", "Obligation", "Disbursement", "Obligation Rate", "Disbursement Rate", "Unutilized", "Unpaid"]
        ];
        financialHistoryData.forEach(row => {
            finRows.push([
                row.label, row.alloc, row.obli, row.disb, row.obliRate / 100, row.disbRate / 100, row.unutilized, row.unpaid
            ]);
        });

        if (financialHistoryData.length > 0) {
            const obliRateTotal = financialGrandTotal.alloc > 0 ? (financialGrandTotal.obli / financialGrandTotal.alloc) : 0;
            const disbRateTotal = financialGrandTotal.obli > 0 ? (financialGrandTotal.disb / financialGrandTotal.obli) : 0;
            finRows.push([
                "Grand Total", financialGrandTotal.alloc, financialGrandTotal.obli, financialGrandTotal.disb,
                obliRateTotal, disbRateTotal, financialGrandTotal.unutilized, financialGrandTotal.unpaid
            ]);
        }

        onExportReport({
            reportName: withReportYearLabel('Monthly Report Matrix', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `Monthly_Report_FY${selectedYear}_RY${selectedReportingYear}_${MONTHS[selectedMonth].label}.xlsx`,
            sheets: [
                {
                    sheetName: 'Physical',
                    rows: physRows,
                    headerRowCount: 4,
                    merges: [
                        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
                        { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
                        { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
                        { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
                        { s: { r: 2, c: 3 }, e: { r: 2, c: 6 } },
                        { s: { r: 2, c: 7 }, e: { r: 2, c: 10 } },
                    ],
                    columnWidths: [40, 15, 10, 10, 10, 10, 10, 10, 10, 10, 10],
                    columnFormats: {
                        1: 'money',
                        3: 'physical',
                        4: 'physical',
                        5: 'physical',
                        6: 'percent',
                        7: 'physical',
                        8: 'physical',
                        9: 'physical',
                        10: 'percent',
                    },
                },
                {
                    sheetName: 'Financial',
                    rows: finRows,
                    headerRowCount: 3,
                    merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }],
                    columnWidths: [30, 15, 15, 15, 15, 15, 15, 15],
                    columnFormats: {
                        1: 'money',
                        2: 'money',
                        3: 'money',
                        4: 'percent',
                        5: 'percent',
                        6: 'money',
                        7: 'money',
                    },
                },
            ],
        });
    };

    const renderPhysRow = (item: any, idx: string, level: number) => {
        const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-10';
        return (
            <tr key={idx} className="monthly-matrix__row">
                <td className={`${textCellClass} ${indent} monthly-report-matrix__label`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td className={`${dataCellClass} text-center`}>{item.unit}</td>
                
                {/* Monthly */}
                <td className={`${dataCellClass} monthly-matrix__cell--monthly text-center`}>{item.targetMonth}</td>
                <td className={`${dataCellClass} monthly-matrix__cell--monthly text-center`}>{item.actualMonth}</td>
                <td className={`${dataCellClass} monthly-matrix__cell--monthly text-center ${item.varianceMonth > 0 ? 'monthly-matrix__cell--negative' : 'monthly-matrix__cell--positive'}`}>{item.varianceMonth}</td>
                <td className={`${dataCellClass} monthly-matrix__cell--monthly text-center`}>{item.percentageMonth.toFixed(0)}%</td>

                {/* Cumulative */}
                <td className={`${dataCellClass} text-center`}>{item.targetCum}</td>
                <td className={`${dataCellClass} text-center`}>{item.actualCum}</td>
                <td className={`${dataCellClass} text-center ${item.varianceCum > 0 ? 'monthly-matrix__cell--negative' : 'monthly-matrix__cell--positive'}`}>{item.varianceCum}</td>
                <td className={`${dataCellClass} text-center`}>{item.percentageCum.toFixed(0)}%</td>
            </tr>
        );
    };

    return (
        <div className="report-card monthly-matrix-card space-y-8">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">
                    Monthly Report
                    {selectedReportingYear === 'All' && <span className="monthly-matrix__year-warning">Select a Reporting Year</span>}
                </h3>
                <div className="report-card__actions monthly-matrix-toolbar">
                    <div className="monthly-matrix-month-control">
                        <label className="monthly-matrix-month-control__label">Month:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => onSelectedMonthChange(Number(e.target.value))} 
                            className="form-control form-control--compact"
                        >
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('Monthly Report Matrix', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'monthly-matrix-printable',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print</span>
                    </button>
                    <button onClick={handleDownload} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download</span>
                    </button>
                </div>
            </div>

            <div id="monthly-matrix-printable" className="monthly-matrix-printable">
            {/* Table 1: Physical */}
            <div>
                <h4 className="monthly-matrix__section-title monthly-matrix__section-title--physical">
                    Table 1: Physical Accomplishment (CY {selectedReportingYear})
                </h4>
                <div className="report-table-scroll monthly-matrix-scroll">
                    <table className="monthly-matrix-table min-w-full border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th rowSpan={2} className={`${headerCellClass} text-left w-1/4`}>Component / Indicator</th>
                                <th rowSpan={2} className={`${headerCellClass} text-center`}>Cost</th>
                                <th rowSpan={2} className={`${headerCellClass} text-center`}>Unit</th>
                                <th colSpan={4} className={`${headerCellClass} monthly-matrix__head-cell--month text-center`}>For the Month</th>
                                <th colSpan={4} className={`${headerCellClass} monthly-matrix__head-cell--cumulative text-center`}>Cumulative (Year-to-Date)</th>
                            </tr>
                            <tr>
                                {/* For the Month */}
                                <th className={`${headerCellClass} monthly-matrix__head-cell--month text-center`}>Target</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--month text-center`}>Actual</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--month text-center`}>Var</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--month text-center`}>%</th>
                                {/* Cumulative */}
                                <th className={`${headerCellClass} monthly-matrix__head-cell--cumulative text-center`}>Target</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--cumulative text-center`}>Actual</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--cumulative text-center`}>Var</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--cumulative text-center`}>%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(physicalData).map(([key, val]: [string, any]) => {
                                 const isExpanded = expandedRows.has(key);
                                 return (
                                    <React.Fragment key={key}>
                                         <tr onClick={() => toggleRow(key)} className="monthly-matrix__row monthly-matrix__row--summary cursor-pointer">
                                             <td className={`${textCellClass} monthly-matrix__summary-label`}>
                                                <span className="report-table__toggle">{isExpanded ? '-' : '+'}</span>
                                                {key}
                                             </td>
                                             <td className={dataCellClass}>{formatCurrencyWhole(val.cost)}</td>
                                             <td colSpan={9} className="monthly-matrix__cell monthly-matrix__cell--blank"></td>
                                         </tr>
                                         {isExpanded && Array.isArray(val) && val.map((item, idx) => renderPhysRow(item, `${key}-${idx}`, 1))}
                                         {isExpanded && val.isNested && Object.entries(val.packages).map(([pkg, pkgItems]: [string, any]) => (
                                             <React.Fragment key={`${key}-${pkg}`}>
                                                 {pkgItems.length > 0 && (
                                                     <>
                                                        <tr className="monthly-matrix__row monthly-matrix__row--package">
                                                            <td className={`${textCellClass} pl-6`}>{pkg}</td>
                                                            <td colSpan={10} className="monthly-matrix__cell monthly-matrix__cell--blank"></td>
                                                        </tr>
                                                        {pkgItems.map((item: any, idx: number) => renderPhysRow(item, `${key}-${pkg}-${idx}`, 2))}
                                                     </>
                                                 )}
                                             </React.Fragment>
                                         ))}
                                         {isExpanded && val.items && val.items.map((item: any, idx: number) => renderPhysRow(item, `${key}-${idx}`, 1))}
                                    </React.Fragment>
                                 )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 2: Financial */}
            <div>
                <h4 className="monthly-matrix__section-title monthly-matrix__section-title--financial">
                    Table 2: Financial Accomplishment (Absolute Value)
                </h4>
                <div className="report-table-scroll monthly-matrix-scroll monthly-matrix-scroll--compact">
                    <table className="monthly-matrix-table min-w-full border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-left`}>Fund Source</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-right`}>Allocation</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-right`}>Obligation</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-right`}>Disbursement</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-center`}>Obligation Rate</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-center`}>Disbursement Rate</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-right`}>Unutilized</th>
                                <th className={`${headerCellClass} monthly-matrix__head-cell--financial text-right`}>Unpaid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {financialHistoryData.map((row) => (
                                <tr key={row.key} className="monthly-matrix__row">
                                    <td className={`${textCellClass} monthly-report-matrix__label monthly-report-matrix__label--total`}>{row.label}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.alloc)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.obli)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.disb)}</td>
                                    <td className={`${dataCellClass} text-center`}>{row.obliRate.toFixed(1)}%</td>
                                    <td className={`${dataCellClass} text-center`}>{row.disbRate.toFixed(1)}%</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.unutilized)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.unpaid)}</td>
                                </tr>
                            ))}
                            {financialHistoryData.length > 0 && (
                                <tr className="monthly-matrix__row monthly-matrix__row--total">
                                    <td className={textCellClass}>Grand Total</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.alloc)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.obli)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.disb)}</td>
                                    <td className={`${dataCellClass} text-center`}>
                                        {(financialGrandTotal.alloc > 0 ? (financialGrandTotal.obli / financialGrandTotal.alloc * 100) : 0).toFixed(1)}%
                                    </td>
                                    <td className={`${dataCellClass} text-center`}>
                                        {(financialGrandTotal.obli > 0 ? (financialGrandTotal.disb / financialGrandTotal.obli * 100) : 0).toFixed(1)}%
                                    </td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.unutilized)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.unpaid)}</td>
                                </tr>
                            )}
                            {financialHistoryData.length === 0 && (
                                <tr><td colSpan={8} className="monthly-matrix__cell monthly-matrix__empty">No financial data available.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </div>
            
             <div className="monthly-matrix__note">
                * Physical Actuals are based on items completed on or before the selected month of the selected year. <br/>
                * Financial Actuals (Obligation/Disbursement) are sums of transactions recorded on or before the selected month for the specific Fund Year rows.
            </div>
        </div>
    );
};

export default MonthlyReportMatrix;
