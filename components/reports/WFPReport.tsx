
// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { getObjectTypeByCode, ReportExcelRequest, ReportPrintRequest, getReportingQuarter, isDateInReportingYear, isParentRealignmentOrSavings, withReportYearLabel } from './ReportUtils';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets } from '../../lib/budgetLineAdjustments';

interface WFPReportProps {
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
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const formatNumber = (num: number) => {
    if (!num) return '';
    return Math.ceil(num).toLocaleString('en-US');
};

const WFPReport: React.FC<WFPReportProps> = ({ data, uacsCodes, selectedYear, selectedReportingYear, selectedOu, onPrintReport, onExportReport }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const indentClasses: { [key: number]: string } = { 0: '', 1: 'pl-6', 2: 'pl-10', 3: 'pl-14' };
    const dataCellClass = "report-table__cell";

    const wfpData = useMemo(() => {
        const getQuarter = (dateStr?: string, fallbackYear?: string | number): number =>
            getReportingQuarter(dateStr, selectedReportingYear, fallbackYear);
        const matchesReportYear = (dateStr?: string, fallbackYear?: string | number) =>
            isDateInReportingYear(dateStr, selectedReportingYear, fallbackYear);
        const getActivityTargetDate = (activity: Training | OtherActivity) => activity.endDate || activity.date;

        const finalData: { [key: string]: any } = {
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

        // Helper to aggregate items with same name/indicator
        const addItemToGroup = (list: any[], newItem: any, isExcluded: boolean = false) => {
            const existing = list.find(i => i.indicator === newItem.indicator);
            if (existing) {
                if (!isExcluded) {
                    existing.totalPhysicalTarget += newItem.totalPhysicalTarget;
                    existing.mooeCost += newItem.mooeCost;
                    existing.coCost += newItem.coCost;
                    existing.totalCost += newItem.totalCost;
                    
                    existing.q1Physical += newItem.q1Physical;
                    existing.q2Physical += newItem.q2Physical;
                    existing.q3Physical += newItem.q3Physical;
                    existing.q4Physical += newItem.q4Physical;
                    
                    existing.q1Financial += newItem.q1Financial;
                    existing.q2Financial += newItem.q2Financial;
                    existing.q3Financial += newItem.q3Financial;
                    existing.q4Financial += newItem.q4Financial;
                }
                // Actuals still aggregate...
            } else {
                list.push(newItem);
            }
        };
        
        data.subprojects.forEach(sp => {
            const isExcluded = isParentRealignmentOrSavings(sp);
            const mooeCost = isExcluded ? 0 : sp.details.filter(d => d.objectType === 'MOOE' && !isBudgetLineExcludedFromTargets(d) && matchesReportYear(d.obligationMonth, sp.fundingYear)).reduce((sum, d) => sum + getBudgetLineAmount(d), 0);
            const coCost = isExcluded ? 0 : sp.details.filter(d => d.objectType === 'CO' && !isBudgetLineExcludedFromTargets(d) && matchesReportYear(d.obligationMonth, sp.fundingYear)).reduce((sum, d) => sum + getBudgetLineAmount(d), 0);
            const totalCost = isExcluded ? 0 : mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(sp.estimatedCompletionDate, sp.fundingYear);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            sp.details.forEach(detail => {
                const financialQuarter = getQuarter(detail.obligationMonth, sp.fundingYear);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    if (!isExcluded && !isBudgetLineExcludedFromTargets(detail)) {
                        quarterlyFinancial[`q${financialQuarter}`] += getBudgetLineAmount(detail);
                    }
                }
            });

            const item = {
                indicator: sp.name, totalPhysicalTarget: !isExcluded && physicalTargetQuarter ? 1 : 0, mooeCost, coCost, totalCost,
                q1Physical: !isExcluded && physicalTargetQuarter === 1 ? 1 : 0, q2Physical: !isExcluded && physicalTargetQuarter === 2 ? 1 : 0, q3Physical: !isExcluded && physicalTargetQuarter === 3 ? 1 : 0, q4Physical: !isExcluded && physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };
            
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            addItemToGroup(finalData['Production and Livelihood'].packages[packageKey].items, item, isExcluded);
        });

        data.trainings.forEach(t => {
            const isExcluded = isParentRealignmentOrSavings(t);
            const mooeCost = isExcluded ? 0 : t.expenses.filter(e => e.objectType === 'MOOE' && !isBudgetLineExcludedFromTargets(e) && matchesReportYear(e.obligationMonth, t.fundingYear)).reduce((sum, e) => sum + getBudgetLineAmount(e), 0);
            const coCost = isExcluded ? 0 : t.expenses.filter(e => e.objectType === 'CO' && !isBudgetLineExcludedFromTargets(e) && matchesReportYear(e.obligationMonth, t.fundingYear)).reduce((sum, e) => sum + getBudgetLineAmount(e), 0);
            const totalCost = isExcluded ? 0 : mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(getActivityTargetDate(t), t.fundingYear);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            t.expenses.forEach(expense => {
                const financialQuarter = getQuarter(expense.obligationMonth, t.fundingYear);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    if (!isExcluded && !isBudgetLineExcludedFromTargets(expense))
                        quarterlyFinancial[`q${financialQuarter}`] += getBudgetLineAmount(expense);
                }
            });

            const item = {
                indicator: t.name, totalPhysicalTarget: !isExcluded && physicalTargetQuarter ? 1 : 0, mooeCost, coCost, totalCost,
                q1Physical: !isExcluded && physicalTargetQuarter === 1 ? 1 : 0, q2Physical: !isExcluded && physicalTargetQuarter === 2 ? 1 : 0, q3Physical: !isExcluded && physicalTargetQuarter === 3 ? 1 : 0, q4Physical: !isExcluded && physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };

            if (t.component === 'Production and Livelihood') {
                  const packageKey = 'Trainings';
                  if (!finalData['Production and Livelihood'].packages[packageKey]) {
                    finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
                  }
                  addItemToGroup(finalData['Production and Livelihood'].packages[packageKey].items, item, isExcluded);
            } else if (t.component === 'Program Management') {
                 addItemToGroup(finalData['Program Management'].packages['Activities'].items, item, isExcluded);
            } else if (finalData[t.component]) {
                addItemToGroup(finalData[t.component], item, isExcluded);
            }
        });

        data.otherActivities.forEach(oa => {
            const isExcluded = isParentRealignmentOrSavings(oa);
            const mooeCost = isExcluded ? 0 : oa.expenses.filter(e => e.objectType === 'MOOE' && !isBudgetLineExcludedFromTargets(e) && matchesReportYear(e.obligationMonth, oa.fundingYear)).reduce((sum, e) => sum + getBudgetLineAmount(e), 0);
            const coCost = isExcluded ? 0 : oa.expenses.filter(e => e.objectType === 'CO' && !isBudgetLineExcludedFromTargets(e) && matchesReportYear(e.obligationMonth, oa.fundingYear)).reduce((sum, e) => sum + getBudgetLineAmount(e), 0);
            const totalCost = isExcluded ? 0 : mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(getActivityTargetDate(oa), oa.fundingYear);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            oa.expenses.forEach(expense => {
                const financialQuarter = getQuarter(expense.obligationMonth, oa.fundingYear);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    if (!isExcluded && !isBudgetLineExcludedFromTargets(expense))
                        quarterlyFinancial[`q${financialQuarter}`] += getBudgetLineAmount(expense);
                }
            });

            const item = {
                indicator: oa.name, totalPhysicalTarget: !isExcluded && physicalTargetQuarter ? 1 : 0, mooeCost, coCost, totalCost,
                q1Physical: !isExcluded && physicalTargetQuarter === 1 ? 1 : 0, q2Physical: !isExcluded && physicalTargetQuarter === 2 ? 1 : 0, q3Physical: !isExcluded && physicalTargetQuarter === 3 ? 1 : 0, q4Physical: !isExcluded && physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };
            
            if (oa.component === 'Program Management') {
                 addItemToGroup(finalData['Program Management'].packages['Activities'].items, item, isExcluded);
            } else if (finalData[oa.component]) {
                addItemToGroup(finalData[oa.component], item, isExcluded);
            }
        });

        const processPmItem = (items: any[], packageKey: string, isStaff = false, isOtherExpense = false) => {
            items.forEach(pm => {
                const isExcluded = isParentRealignmentOrSavings(pm);
                if (isStaff && pm.expenses && pm.expenses.length > 0) {
                    const component = pm.component || 'Program Management';
                    const physicalQuarter = getQuarter(pm.obligationDate, pm.fundYear);
                    const physicalCount = !isExcluded && physicalQuarter ? 1 : 0;
                    const item = {
                        indicator: pm.personnelPosition,
                        totalPhysicalTarget: physicalCount,
                        mooeCost: 0,
                        coCost: 0,
                        totalCost: 0,
                        q1Physical: physicalQuarter === 1 ? physicalCount : 0,
                        q2Physical: physicalQuarter === 2 ? physicalCount : 0,
                        q3Physical: physicalQuarter === 3 ? physicalCount : 0,
                        q4Physical: physicalQuarter === 4 ? physicalCount : 0,
                        q1Financial: 0,
                        q2Financial: 0,
                        q3Financial: 0,
                        q4Financial: 0,
                    };

                    pm.expenses.forEach((expense: any) => {
                        const objType = expense.objectType || getObjectTypeByCode(expense.uacsCode, uacsCodes);
                        const amount = isExcluded || isBudgetLineExcludedFromTargets(expense) ? 0 : getBudgetLineAmount(expense);
                        const financialQuarter = getQuarter(expense.obligationDate, pm.fundYear);

                        if (objType === 'CO') item.coCost += amount;
                        else item.mooeCost += amount;
                        item.totalCost += amount;

                        if (financialQuarter === 1) item.q1Financial += amount;
                        else if (financialQuarter === 2) item.q2Financial += amount;
                        else if (financialQuarter === 3) item.q3Financial += amount;
                        else if (financialQuarter === 4) item.q4Financial += amount;
                    });

                    if (component === 'Program Management') {
                        addItemToGroup(finalData['Program Management'].packages[packageKey].items, item, isExcluded);
                    } else if (component === 'Production and Livelihood') {
                        if (!finalData['Production and Livelihood'].packages['Staff Requirements']) {
                            finalData['Production and Livelihood'].packages['Staff Requirements'] = { items: [] };
                        }
                        addItemToGroup(finalData['Production and Livelihood'].packages['Staff Requirements'].items, item, isExcluded);
                    } else if (finalData[component]) {
                        addItemToGroup(finalData[component], item, isExcluded);
                    }
                } else {
                    const objType = getObjectTypeByCode(pm.uacsCode, uacsCodes);
                    const amount = isExcluded ? 0 : (isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits)));
                    
                    const financialQuarter = getQuarter(pm.obligationDate, pm.fundYear);
                    const physicalQuarter = getQuarter(pm.obligationDate, pm.fundYear);

                    const physicalCount = isExcluded || isOtherExpense || !physicalQuarter ? 0 : (isStaff ? 1 : (pm.numberOfUnits || 1));

                    const item = {
                        indicator: isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars),
                        totalPhysicalTarget: physicalCount,
                        mooeCost: objType === 'MOOE' ? amount : 0,
                        coCost: objType === 'CO' ? amount : 0,
                        totalCost: amount,
                        q1Physical: physicalQuarter === 1 ? physicalCount : 0,
                        q2Physical: physicalQuarter === 2 ? physicalCount : 0,
                        q3Physical: physicalQuarter === 3 ? physicalCount : 0,
                        q4Physical: physicalQuarter === 4 ? physicalCount : 0,
                        q1Financial: financialQuarter === 1 ? amount : 0,
                        q2Financial: financialQuarter === 2 ? amount : 0,
                        q3Financial: financialQuarter === 3 ? amount : 0,
                        q4Financial: financialQuarter === 4 ? amount : 0,
                    };

                    if (isStaff) {
                        const component = pm.component || 'Program Management';
                        if (component === 'Program Management') {
                            addItemToGroup(finalData['Program Management'].packages[packageKey].items, item, isExcluded);
                        } else if (component === 'Production and Livelihood') {
                             if (!finalData['Production and Livelihood'].packages['Staff Requirements']) {
                                finalData['Production and Livelihood'].packages['Staff Requirements'] = { items: [] };
                             }
                             addItemToGroup(finalData['Production and Livelihood'].packages['Staff Requirements'].items, item, isExcluded);
                        } else if (finalData[component]) {
                              // Social Prep or Marketing (Arrays)
                             addItemToGroup(finalData[component], item, isExcluded);
                        }
                    } else {
                        addItemToGroup(finalData['Program Management'].packages[packageKey].items, item, isExcluded);
                    }
                }
            });
        }

        processPmItem(data.staffingReqs, 'Staff Requirements', true);
        processPmItem(data.officeReqs, 'Office Requirements');
        processPmItem(data.otherProgramExpenses, 'Office Requirements', false, true);

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [data, selectedReportingYear, uacsCodes]);

    const handleDownloadXLSX = () => {
        const aoa: (string | number | null)[][] = [
            ["Program/Activity/Project", "Total Target", null, null, null, "Quarterly Physical Target", null, null, null, null, "Quarterly Financial Target (PHP)", null, null, null, null],
            [null, "Physical", "MOOE (PHP)", "CO (PHP)", "Total (PHP)", "Q1", "Q2", "Q3", "Q4", "Total", "Q1", "Q2", "Q3", "Q4", "Total"]
        ];

        const processItems = (items: any[]) => {
            items.forEach(item => {
                const totalQuarterlyPhysical = item.q1Physical + item.q2Physical + item.q3Physical + item.q4Physical;
                const totalQuarterlyFinancial = item.q1Financial + item.q2Financial + item.q3Financial + item.q4Financial;
                aoa.push([
                    item.indicator, 
                    item.totalPhysicalTarget, 
                    item.mooeCost, 
                    item.coCost, 
                    item.totalCost,
                    item.q1Physical, 
                    item.q2Physical, 
                    item.q3Physical, 
                    item.q4Physical, 
                    totalQuarterlyPhysical,
                    item.q1Financial, 
                    item.q2Financial, 
                    item.q3Financial, 
                    item.q4Financial, 
                    totalQuarterlyFinancial
                ]);
            });
        };

        const addTotalsRow = (items: any[], label: string) => {
            const totals = items.reduce((acc, item) => ({
                totalPhysicalTarget: acc.totalPhysicalTarget + (item.totalPhysicalTarget || 0),
                mooeCost: acc.mooeCost + (item.mooeCost || 0),
                coCost: acc.coCost + (item.coCost || 0),
                totalCost: acc.totalCost + (item.totalCost || 0),
                q1Physical: acc.q1Physical + (item.q1Physical || 0),
                q2Physical: acc.q2Physical + (item.q2Physical || 0),
                q3Physical: acc.q3Physical + (item.q3Physical || 0),
                q4Physical: acc.q4Physical + (item.q4Physical || 0),
                q1Financial: acc.q1Financial + (item.q1Financial || 0),
                q2Financial: acc.q2Financial + (item.q2Financial || 0),
                q3Financial: acc.q3Financial + (item.q3Financial || 0),
                q4Financial: acc.q4Financial + (item.q4Financial || 0),
            }), { 
                totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
                q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
                q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
            });
            
            const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
            const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;

            aoa.push([
                label, 
                totals.totalPhysicalTarget, 
                totals.mooeCost, 
                totals.coCost, 
                totals.totalCost,
                totals.q1Physical, 
                totals.q2Physical, 
                totals.q3Physical, 
                totals.q4Physical, 
                totalQuarterlyPhysical,
                totals.q1Financial, 
                totals.q2Financial, 
                totals.q3Financial, 
                totals.q4Financial, 
                totalQuarterlyFinancial
            ]);
        };

        Object.entries(wfpData).forEach(([component, items]) => {
            aoa.push([component, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items);
            } else if ((items as any).isExpandable) {
                if((items as any).items.length > 0) processItems((items as any).items);
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData] : [string, any]) => {
                    aoa.push([`  ${packageName}`, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
                    if((packageData as any).items.length > 0) processItems((packageData as any).items);
                });
            }
        });

        const grandTotals = Object.values(wfpData).flatMap((component: any) => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");
        
        onExportReport({
            reportName: withReportYearLabel('Work and Financial Plan (WFP)', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `WFP_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'WFP Report',
                rows: aoa,
                headerRowCount: 2,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                    { s: { r: 0, c: 1 }, e: { r: 0, c: 4 } },
                    { s: { r: 0, c: 5 }, e: { r: 0, c: 9 } },
                    { s: { r: 0, c: 10 }, e: { r: 0, c: 14 } },
                ],
                columnWidths: [40, 10, 15, 15, 15, 8, 8, 8, 8, 10, 15, 15, 15, 15, 15],
                columnFormats: {
                    1: 'physical',
                    2: 'money',
                    3: 'money',
                    4: 'money',
                    5: 'physical',
                    6: 'physical',
                    7: 'physical',
                    8: 'physical',
                    9: 'physical',
                    10: 'money',
                    11: 'money',
                    12: 'money',
                    13: 'money',
                    14: 'money',
                },
            }],
        });
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = items.reduce((acc, item) => {
            acc.totalPhysicalTarget += item.totalPhysicalTarget;
            acc.mooeCost += item.mooeCost;
            acc.coCost += item.coCost;
            acc.totalCost += item.totalCost;
            acc.q1Physical += item.q1Physical;
            acc.q2Physical += item.q2Physical;
            acc.q3Physical += item.q3Physical;
            acc.q4Physical += item.q4Physical;
            acc.q1Financial += item.q1Financial;
            acc.q2Financial += item.q2Financial;
            acc.q3Financial += item.q3Financial;
            acc.q4Financial += item.q4Financial;
            return acc;
        }, { 
            totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
            q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
            q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
        });

        const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
        const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;

        return (
            <tr className="report-table__row report-table__row--total">
                <td className={`${dataCellClass}`}>{label}</td>
                <td className={`${dataCellClass} text-center`}>{formatNumber(totals.totalPhysicalTarget)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{formatNumber(q)}</td>)}
                <td className={`${dataCellClass} text-center`}>{formatNumber(totalQuarterlyPhysical)}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrencyWhole(q) : ''}</td>)}
                 <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrencyWhole(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0) => {
        if (items.length === 0) {
            return (
                <tr className="report-table__row report-table__row--summary">
                     <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>
                        <span className="inline-block w-5"></span> {label}
                    </td>
                    <td colSpan={14} className={`${dataCellClass} text-center italic`}>No activities for this component.</td>
                </tr>
            )
        }
        
        const totals = items.reduce((acc, item) => {
            acc.totalPhysicalTarget += item.totalPhysicalTarget;
            acc.mooeCost += item.mooeCost;
            acc.coCost += item.coCost;
            acc.totalCost += item.totalCost;
            acc.q1Physical += item.q1Physical;
            acc.q2Physical += item.q2Physical;
            acc.q3Physical += item.q3Physical;
            acc.q4Physical += item.q4Physical;
            acc.q1Financial += item.q1Financial;
            acc.q2Financial += item.q2Financial;
            acc.q3Financial += item.q3Financial;
            acc.q4Financial += item.q4Financial;
            return acc;
        }, { 
            totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
            q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
            q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
        });

        const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
        const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;
        
        return (
             <tr onClick={() => toggleRow(rowKey)} className="report-table__row report-table__row--summary cursor-pointer">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>
                    <span className="wfp-report__expand">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                <td className={`${dataCellClass} text-center`}>{formatNumber(totals.totalPhysicalTarget)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{formatNumber(q)}</td>)}
                <td className={`${dataCellClass} text-center`}>{formatNumber(totalQuarterlyPhysical)}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrencyWhole(q) : ''}</td>)}
                <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrencyWhole(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        const totalQuarterlyPhysical = item.q1Physical + item.q2Physical + item.q3Physical + item.q4Physical;
        const totalQuarterlyFinancial = item.q1Financial + item.q2Financial + item.q3Financial + item.q4Financial;
        return (
            <tr key={key} className="report-table__row">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}>{formatNumber(item.totalPhysicalTarget)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(item.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(item.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrencyWhole(item.totalCost)}</td>
                {[item.q1Physical, item.q2Physical, item.q3Physical, item.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{formatNumber(q)}</td>)}
                <td className={`${dataCellClass} text-center`}>{formatNumber(totalQuarterlyPhysical)}</td>
                {[item.q1Financial, item.q2Financial, item.q3Financial, item.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrencyWhole(q) : ''}</td>)}
                <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrencyWhole(totalQuarterlyFinancial) : ''}</td>
            </tr>
        )
    };

    const grandTotals = Object.values(wfpData).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
        return [];
    });

    return (
        <div id="wfp-container-for-print" className="report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">Work and Financial Plan (WFP)</h3>
                <div className="report-card__actions">
                    <button
                        onClick={() => onPrintReport({
                            reportName: 'Work and Financial Plan (WFP)',
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'wfp-report',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button onClick={handleDownloadXLSX} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>
            <div id="wfp-report" className="report-table-scroll">
                <table className="report-table wfp-report-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} className="report-table__head-cell align-bottom">Program/Activity/Project</th>
                            <th colSpan={4} className="report-table__head-cell text-center">Total Target</th>
                            <th colSpan={5} className="report-table__head-cell text-center">Quarterly Physical Target</th>
                            <th colSpan={5} className="report-table__head-cell text-center">Quarterly Financial Target (PHP)</th>
                        </tr>
                        <tr>
                            <th className="report-table__head-cell text-center">Physical</th>
                            <th className="report-table__head-cell text-center">MOOE (PHP)</th>
                            <th className="report-table__head-cell text-center">CO (PHP)</th>
                            <th className="report-table__head-cell text-center">Total (PHP)</th>
                            <th className="report-table__head-cell text-center">Q1</th>
                            <th className="report-table__head-cell text-center">Q2</th>
                            <th className="report-table__head-cell text-center">Q3</th>
                            <th className="report-table__head-cell text-center">Q4</th>
                            <th className="report-table__head-cell text-center">Total</th>
                            <th className="report-table__head-cell text-center">Q1</th>
                            <th className="report-table__head-cell text-center">Q2</th>
                            <th className="report-table__head-cell text-center">Q3</th>
                            <th className="report-table__head-cell text-center">Q4</th>
                            <th className="report-table__head-cell text-center">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(wfpData).map(([key, cd]) => {
                            const componentData = cd as any;
                            if (Array.isArray(componentData)) {
                                const isComponentExpanded = expandedRows.has(key);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded &&
                                            componentData.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))
                                        }
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData.items, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded && componentData.items.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))}
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isNestedExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                const allPackageItems = Object.values(componentData.packages).flatMap((pkg: any) => pkg.items);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(allPackageItems, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded && Object.entries(componentData.packages).map(([packageName, packageData]: [string, any]) => (
                                            <React.Fragment key={packageName}>
                                                {renderSummaryRow(packageData.items, packageName, packageName, expandedRows.has(packageName), 1)}
                                                {expandedRows.has(packageName) && packageData.items.map((item: any, index: number) => renderDataRow(item, `${packageName}-${index}`, 2))}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                );
                            }
                            return null;
                        })}
                    </tbody>
                    <tfoot>
                        {renderTotalsRow(grandTotals, "GRAND TOTAL")}
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default WFPReport;
