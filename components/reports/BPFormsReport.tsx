// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { formatCurrency, getObjectTypeByCode, ReportExcelRequest, ReportPrintRequest, withReportYearLabel } from './ReportUtils';
import { getBudgetLineAmount } from '../../lib/budgetLineAdjustments';

interface BPFormsReportProps {
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

const ActivityRow: React.FC<{
    activity: any;
    mooeCodes: string[];
    coCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
    isExpanded?: boolean;
    toggleRow?: (key: string) => void;
    rowKey?: string;
}> = ({ activity, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses, isExpanded, toggleRow, rowKey }) => {
    const hasParticulars = activity.particulars && activity.particulars.length > 0;
    
    return (
        <tr 
            onClick={() => hasParticulars && toggleRow && rowKey && toggleRow(rowKey)} 
            className={`bp-report__row ${hasParticulars ? 'cursor-pointer bp-report__row--interactive' : ''}`}
        >
            <td className={`${dataCellClass} ${indentClasses[indentLevel]} bp-report__cell--sticky`}>
                {hasParticulars && toggleRow && <span className="bp-report__expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span>}
                {!hasParticulars && <span className="inline-block w-5"></span>}
                {activity.name}
            </td>
            
            {/* MOOE Columns */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrencyWhole(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--mooe`}>{activity.totalMOOE > 0 ? formatCurrencyWhole(activity.totalMOOE) : ''}</td>
            
            {/* CO Columns */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrencyWhole(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--co`}>{activity.totalCO > 0 ? formatCurrencyWhole(activity.totalCO) : ''}</td>
            
            {/* Grand Total */}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--grand`}>{(activity.totalMOOE + activity.totalCO) > 0 ? formatCurrencyWhole(activity.totalMOOE + activity.totalCO) : ''}</td>
        </tr>
    );
};

const ParticularRow: React.FC<{
    particular: any;
    mooeCodes: string[];
    coCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ particular, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses }) => {
    return (
        <tr className="bp-report__row bp-report__row--particular">
            <td className={`${dataCellClass} ${indentClasses[indentLevel]} bp-report__cell--sticky`}>
                <span className="inline-block w-5"></span> {particular.name}
            </td>
            
            {/* MOOE Columns */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                    {particular.uacsCode === code && particular.amount > 0 ? formatCurrencyWhole(particular.amount) : ''}
                </td>
            ))}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--mooe`}>
                {particular.objectType !== 'CO' ? formatCurrencyWhole(particular.amount) : ''}
            </td>
            
            {/* CO Columns */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                    {particular.uacsCode === code && particular.amount > 0 ? formatCurrencyWhole(particular.amount) : ''}
                </td>
            ))}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--co`}>
                {particular.objectType === 'CO' ? formatCurrencyWhole(particular.amount) : ''}
            </td>
            
            {/* Grand Total */}
            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--grand`}>{formatCurrencyWhole(particular.amount)}</td>
        </tr>
    );
};

const SummaryRow: React.FC<{
    items: any[];
    label: string;
    rowKey: string;
    isExpanded: boolean;
    indentLevel: number;
    mooeCodes: string[];
    coCodes: string[];
    toggleRow: (key: string) => void;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ items, label, rowKey, isExpanded, indentLevel, mooeCodes, coCodes, toggleRow, dataCellClass, indentClasses }) => {
    const totalCols = mooeCodes.length + coCodes.length + 3; // + MOOE Total, CO Total, Grand Total

    if (!items || items.length === 0) {
        return (
             <tr className="bp-report__row bp-report__row--summary">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} bp-report__cell--sticky`}>
                     <span className="bp-report__expand" aria-hidden="true"></span> {label}
                </td>
                <td colSpan={totalCols} className={`${dataCellClass} bp-report__cell--empty`}>No activities for this item.</td>
            </tr>
        );
    }

    const summary = useMemo(() => items.reduce((acc, item) => {
        acc.totalMOOE += item.totalMOOE;
        acc.totalCO += item.totalCO;
        [...mooeCodes, ...coCodes].forEach((code: string) => {
            acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
        });
        return acc;
    }, { totalMOOE: 0, totalCO: 0, uacsValues: [...mooeCodes, ...coCodes].reduce((acc: any, code: string) => ({...acc, [code]: 0}), {}) }), [items, mooeCodes, coCodes]);
    
    const numberCellClass = `${dataCellClass} bp-report__cell--number`;

    return (
        <tr onClick={() => toggleRow(rowKey)} className="bp-report__row bp-report__row--summary cursor-pointer">
            <td className={`${dataCellClass} ${indentClasses[indentLevel]} bp-report__cell--sticky`}>
                <span className="bp-report__expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span> {label}
            </td>
            
            {/* MOOE Summary */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrencyWhole(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bp-report__cell--mooe`}>{summary.totalMOOE > 0 ? formatCurrencyWhole(summary.totalMOOE) : ''}</td>

            {/* CO Summary */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrencyWhole(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bp-report__cell--co`}>{summary.totalCO > 0 ? formatCurrencyWhole(summary.totalCO) : ''}</td>

            {/* Grand Total Summary */}
            <td className={`${numberCellClass} bp-report__cell--grand`}>{(summary.totalMOOE + summary.totalCO) > 0 ? formatCurrencyWhole(summary.totalMOOE + summary.totalCO) : ''}</td>
        </tr>
    );
};

const BPFormsReport: React.FC<BPFormsReportProps> = ({ data, uacsCodes, selectedYear, selectedReportingYear, selectedOu, onPrintReport, onExportReport }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const bpFormsProcessedData = useMemo(() => {
        const headers: { [objectType: string]: { [particular: string]: string[] } } = { MOOE: {}, CO: {} };
        const seenCodes = new Set<string>();
        
        // Helper to ensure code exists in headers (dynamic discovery)
        const ensureHeader = (objType: string, particular: string, code: string, amount: number) => {
            if (!code || amount <= 0) return;
            // Normalize object type
            const typeKey = (objType === 'CO') ? 'CO' : 'MOOE';
            
            if (!headers[typeKey]) headers[typeKey] = {};
            // Attempt to look up the "official" particular name from reference if possible, 
            // otherwise use the one stored in the record.
            let officialParticular = particular || 'Other Expenses';
            if (uacsCodes[typeKey]) {
                for (const part in uacsCodes[typeKey]) {
                    if (uacsCodes[typeKey][part][code]) {
                        officialParticular = part;
                        break;
                    }
                }
            }

            const partKey = officialParticular;
            
            if (!headers[typeKey][partKey]) headers[typeKey][partKey] = [];
            
            if (!headers[typeKey][partKey].includes(code)) {
                headers[typeKey][partKey].push(code);
            }
            seenCodes.add(code);
        };

        const lineItems: any[] = [];
        const addLineItem = (item: any) => {
            if (item.amount <= 0 || item.isRealignment || item.isSavings || item.isCancelled) return;
            ensureHeader(item.objectType, item.particularName, item.uacsCode, item.amount);
            lineItems.push(item);
        };
        
        data.subprojects.forEach(sp => {
            sp.details.forEach(d => {
                addLineItem({
                    component: 'Production and Livelihood', packageType: sp.packageType, activityName: sp.name,
                    objectType: d.objectType, uacsCode: d.uacsCode, amount: getBudgetLineAmount(d),
                    particularName: d.expenseParticular,
                    itemParticular: d.particulars,
                    isRealignment: sp.isRealignment || d.isRealignment,
                    isSavings: sp.isSavings || d.isSavings,
                    isCancelled: sp.status === 'Cancelled' || d.isCancelled
                });
            });
        });
        
        data.trainings.forEach(t => {
            t.expenses.forEach(e => {
                addLineItem({
                    component: t.component, packageType: t.component === 'Program Management' ? 'Activities' : undefined, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: getBudgetLineAmount(e),
                    isTraining: true, particularName: e.expenseParticular,
                    isRealignment: t.isRealignment || e.isRealignment,
                    isSavings: t.isSavings || e.isSavings,
                    isCancelled: t.status === 'Cancelled' || e.isCancelled
                });
            });
        });
        
        data.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                addLineItem({
                    component: oa.component, packageType, activityName: oa.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: getBudgetLineAmount(e),
                    particularName: e.expenseParticular,
                    isRealignment: oa.isRealignment || e.isRealignment,
                    isSavings: oa.isSavings || e.isSavings,
                    isCancelled: oa.status === 'Cancelled' || e.isCancelled
                });
            });
        });
        
        data.staffingReqs.forEach(sr => {
            if (sr.expenses && sr.expenses.length > 0) {
                sr.expenses.forEach(expense => {
                    const objType = expense.objectType || getObjectTypeByCode(expense.uacsCode, uacsCodes);
                    addLineItem({
                        component: 'Program Management',
                        packageType: 'Staff Requirements',
                        activityName: sr.personnelPosition,
                        objectType: objType,
                        uacsCode: expense.uacsCode,
                        amount: getBudgetLineAmount(expense),
                        particularName: expense.expenseParticular || 'Salaries & Wages',
                        itemParticular: expense.expenseParticular,
                        isRealignment: sr.isRealignment || expense.isRealignment,
                        isSavings: sr.isSavings || expense.isSavings,
                        isCancelled: sr.status === 'Cancelled' || expense.isCancelled
                    });
                });
                return;
            }

            const objType = getObjectTypeByCode(sr.uacsCode, uacsCodes);
            addLineItem({
                component: 'Program Management',
                packageType: 'Staff Requirements',
                activityName: sr.personnelPosition,
                objectType: objType,
                uacsCode: sr.uacsCode,
                amount: sr.annualSalary,
                particularName: 'Salaries & Wages',
                isRealignment: sr.isRealignment,
                isSavings: sr.isSavings
            });
        });
        
        data.officeReqs.forEach(or => {
            const objType = getObjectTypeByCode(or.uacsCode, uacsCodes);
            addLineItem({
                component: 'Program Management', packageType: 'Office Requirements', activityName: or.equipment,
                objectType: objType, uacsCode: or.uacsCode, amount: or.pricePerUnit * or.numberOfUnits,
                particularName: 'Office Equipment',
                isRealignment: or.isRealignment,
                isSavings: or.isSavings
            });
        });
        
        data.otherProgramExpenses.forEach(ope => {
            const objType = getObjectTypeByCode(ope.uacsCode, uacsCodes);
            addLineItem({
                component: 'Program Management', packageType: 'Office Requirements', activityName: ope.particulars,
                objectType: objType, uacsCode: ope.uacsCode, amount: ope.amount,
                particularName: 'Other Expenses',
                isRealignment: ope.isRealignment,
                isSavings: ope.isSavings
            });
        });

        // Derive flat lists of codes for rendering columns, sorting them in ascending order
        const mooeCodes: string[] = [];
        Object.keys(headers.MOOE).forEach(part => {
            headers.MOOE[part].forEach(c => { if (!mooeCodes.includes(c)) mooeCodes.push(c); });
        });
        mooeCodes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const coCodes: string[] = [];
        Object.keys(headers.CO).forEach(part => {
            headers.CO[part].forEach(c => { if (!coCodes.includes(c)) coCodes.push(c); });
        });
        coCodes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const initialUacsValues = [...mooeCodes, ...coCodes].reduce((acc, code) => ({ ...acc, [code]: 0 }), {});
        
        const groupedData: { [key: string]: any } = {
            'Social Preparation': { isNestedExpandable: true, packages: {} },
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': { isNestedExpandable: true, packages: {} },
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
            if (item.amount <= 0 || item.isRealignment || item.isSavings || item.isCancelled) return;

            let targetList;
            const packageKey = item.packageType || (item.isTraining ? 'Trainings' : 'Activities');
            
            if (groupedData[item.component]) {
                if (!groupedData[item.component].packages[packageKey]) {
                    groupedData[item.component].packages[packageKey] = { items: [] };
                }
                targetList = groupedData[item.component].packages[packageKey].items;
            } else {
                return; 
            }

            let activity = targetList.find((a: any) => a.name === item.activityName);
            if (!activity) {
                activity = { 
                    name: item.activityName, 
                    uacsValues: { ...initialUacsValues }, 
                    totalMOOE: 0, 
                    totalCO: 0,
                    particulars: []
                };
                targetList.push(activity);
            }
            
            if(item.uacsCode) {
                activity.uacsValues[item.uacsCode] = (activity.uacsValues[item.uacsCode] || 0) + item.amount;
                
                // Only add particulars if it's a subproject in Production and Livelihood under Package 1-7
                const isPL = item.component === 'Production and Livelihood';
                const isPackage1to7 = item.packageType && /^Package [1-7](\s|$)/i.test(item.packageType);
                
                if (isPL && isPackage1to7) {
                    activity.particulars.push({
                        name: item.itemParticular || item.particularName || item.uacsCode,
                        uacsCode: item.uacsCode,
                        amount: item.amount,
                        objectType: item.objectType
                    });
                }
            }

            // Determine if MOOE or CO for Total calc
            // Use the determined header grouping to check where it belongs
            const isCO = coCodes.includes(item.uacsCode) || item.objectType === 'CO';
            
            if (isCO) {
                activity.totalCO += item.amount;
            } else {
                activity.totalMOOE += item.amount;
            }
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

        return { headers, rows: groupedData, mooeCodes, coCodes };
    }, [data, uacsCodes]);

    const { headers, rows, mooeCodes, coCodes } = bpFormsProcessedData;

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

        return allActivities.reduce((acc, item) => {
            acc.totalMOOE += item.totalMOOE;
            acc.totalCO += item.totalCO;
            [...mooeCodes, ...coCodes].forEach((code: string) => {
                acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
            });
            return acc;
        }, {
            totalMOOE: 0,
            totalCO: 0,
            uacsValues: [...mooeCodes, ...coCodes].reduce((acc: any, code: string) => ({...acc, [code]: 0}), {})
        });
    }, [rows, mooeCodes, coCodes]);

    const getDescription = (objType: string, particular: string, code: string) => {
        if (uacsCodes[objType] && uacsCodes[objType][particular] && uacsCodes[objType][particular][code]) {
            return uacsCodes[objType][particular][code];
        }
        // Fallback search
        if (uacsCodes[objType]) {
            for (const p in uacsCodes[objType]) {
                if (uacsCodes[objType][p][code]) return uacsCodes[objType][p][code];
            }
        }
        return '';
    };

    const handleDownloadBpFormsXlsx = () => {
        // Construct grouped headers for XLSX
        const mooeCodesSorted = [...mooeCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const coCodesSorted = [...coCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const mooeSpan = mooeCodesSorted.length;
        const coSpan = coCodesSorted.length;
        
        // Row 1: Object Types
        const row1: (string | null)[] = ["Program/Activity/Project"];
        if (mooeSpan > 0) {
            row1.push("MOOE");
            for(let i=1; i<mooeSpan; i++) row1.push(null);
        }
        row1.push("Total MOOE");
        if (coSpan > 0) {
            row1.push("CO");
            for(let i=1; i<coSpan; i++) row1.push(null);
        }
        row1.push("Total CO");
        row1.push("Grand Total");

        // Row 2: Particulars (Merged cells will handle the grouping visually)
        const row2: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => {
            // Find which particular this code belongs to
            let partName = "Other Expenses";
            for (const p in headers.MOOE) {
                if (headers.MOOE[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row2.push(partName);
        });
        row2.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.CO) {
                if (headers.CO[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row2.push(partName);
        });
        row2.push(null); // Under Total CO
        row2.push(null); // Under Grand Total

        // Row 3: Descriptions
        const row3: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.MOOE) {
                if (headers.MOOE[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row3.push(getDescription('MOOE', partName, code));
        });
        row3.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.CO) {
                if (headers.CO[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row3.push(getDescription('CO', partName, code));
        });
        row3.push(null); // Under Total CO
        row3.push(null); // Under Grand Total

        // Row 4: UACS Codes
        const row4: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => row4.push(code));
        row4.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => row4.push(code));
        row4.push(null); // Under Total CO
        row4.push(null); // Under Grand Total

        // Flatten Data
        const flatDataRows: any[][] = [];
        const allCodesOrdered = [...mooeCodesSorted, ...coCodesSorted];
        const appendBpValueCells = (
            row: (string | number | null)[],
            values: Record<string, number>,
            totalMOOE: number,
            totalCO: number,
        ) => {
            mooeCodesSorted.forEach(code => {
                row.push(values[code] > 0 ? Math.ceil(values[code]) : null);
            });
            row.push(totalMOOE > 0 ? Math.ceil(totalMOOE) : null);
            coCodesSorted.forEach(code => {
                row.push(values[code] > 0 ? Math.ceil(values[code]) : null);
            });
            row.push(totalCO > 0 ? Math.ceil(totalCO) : null);
            row.push((totalMOOE + totalCO) > 0 ? Math.ceil(totalMOOE + totalCO) : null);
        };

        const calculateSummary = (items: any[]) => {
            return items.reduce((acc, item) => {
                acc.totalMOOE += item.totalMOOE;
                acc.totalCO += item.totalCO;
                allCodesOrdered.forEach((code: string) => {
                    acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
                });
                return acc;
            }, { totalMOOE: 0, totalCO: 0, uacsValues: allCodesOrdered.reduce((acc: any, code: string) => ({...acc, [code]: 0}), {}) });
        };

        const addSummaryRow = (label: string, items: any[], prefix: string) => {
            const summary = calculateSummary(items);
            const row: (string | number | null)[] = [`${prefix}${label}`];
            appendBpValueCells(row, summary.uacsValues, summary.totalMOOE, summary.totalCO);
            flatDataRows.push(row);
        };

        const addActivityRows = (pkgName: string, items: any[], prefix: string) => {
            items.forEach((activity: any, i: number) => {
                const actKey = `${pkgName}-${activity.name}-${i}`;
                const isActExpanded = expandedRows.has(actKey);
                
                const row: (string | number | null)[] = [`${prefix}${activity.name}`];
                appendBpValueCells(row, activity.uacsValues, activity.totalMOOE, activity.totalCO);
                flatDataRows.push(row);

                if (isActExpanded && activity.particulars) {
                    activity.particulars.forEach((part: any) => {
                        const pRow: (string | number | null)[] = [`${prefix}  ${part.name}`];
                        const pValues = allCodesOrdered.reduce<Record<string, number>>((acc, code) => {
                            acc[code] = part.uacsCode === code && part.amount > 0 ? part.amount : 0;
                            return acc;
                        }, {});
                        appendBpValueCells(
                            pRow,
                            pValues,
                            part.objectType !== 'CO' ? part.amount : 0,
                            part.objectType === 'CO' ? part.amount : 0,
                        );
                        flatDataRows.push(pRow);
                    });
                }
            });
        };

        Object.entries(rows).forEach(([componentName, componentData]) => {
            const isComponentExpanded = expandedRows.has(componentName);
            if ((componentData as any).isNestedExpandable) {
                const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                addSummaryRow(componentName, allPackageItems, "");
                
                if (isComponentExpanded) {
                    Object.entries((componentData as any).packages).forEach(([pkgName, pkgData]: [string, any]) => {
                        const isPkgExpanded = expandedRows.has(pkgName);
                        addSummaryRow(pkgName, pkgData.items, "  ");
                        if (isPkgExpanded) {
                            addActivityRows(pkgName, pkgData.items, "    ");
                        }
                    });
                }
            }
        });

        // Add Grand Total Row
        const totalRow: (string | number | null)[] = ["GRAND TOTAL"];
        appendBpValueCells(totalRow, grandTotals.uacsValues, grandTotals.totalMOOE, grandTotals.totalCO);
        flatDataRows.push(totalRow);

        // Combine all
        const aoa = [row1, row2, row3, row4, ...flatDataRows];
        const merges = [];
        
        // PAP Vertical Merge (Rows 0 to 3)
        merges.push({ s: { r: 0, c: 0 }, e: { r: 3, c: 0 } });

        let colIdx = 1; 
        // MOOE Group Merge
        if(mooeSpan > 0) {
            merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + mooeSpan - 1 } });
            
            // MOOE Particulars Merges (Group consecutive same particulars)
            let startCol = colIdx;
            for (let i = 0; i < mooeCodesSorted.length; i++) {
                const currentPart = row2[startCol];
                let endCol = startCol;
                while (endCol + 1 < colIdx + mooeCodesSorted.length && row2[endCol + 1] === currentPart) {
                    endCol++;
                }
                if (endCol > startCol) {
                    merges.push({ s: { r: 1, c: startCol }, e: { r: 1, c: endCol } });
                }
                i += (endCol - startCol);
                startCol = endCol + 1;
            }
            colIdx += mooeSpan;
        }
        
        // Total MOOE Vertical Merge
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });
        colIdx++;

        // CO Group Merge
        if(coSpan > 0) {
            merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + coSpan - 1 } });
            
            // CO Particulars Merges (Group consecutive same particulars)
            let startCol = colIdx;
            for (let i = 0; i < coCodesSorted.length; i++) {
                const currentPart = row2[startCol];
                let endCol = startCol;
                while (endCol + 1 < colIdx + coCodesSorted.length && row2[endCol + 1] === currentPart) {
                    endCol++;
                }
                if (endCol > startCol) {
                    merges.push({ s: { r: 1, c: startCol }, e: { r: 1, c: endCol } });
                }
                i += (endCol - startCol);
                startCol = endCol + 1;
            }
            colIdx += coSpan;
        }
        
        // Total CO Vertical Merge
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });
        colIdx++;
        
        // Grand Total Vertical Merge
        merges.push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });

        // Set column widths and alignment
        const columnWidths = aoa[0].map((_, index) => index === 0 ? 50 : 15);
        const columnFormats = aoa[0].reduce<Record<number, 'money'>>((acc, _, index) => {
            if (index > 0) acc[index] = 'money';
            return acc;
        }, {});

        onExportReport({
            reportName: withReportYearLabel('Budget Proposal (BP) Forms', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `BP_Forms_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'BP Forms',
                rows: aoa,
                headerRowCount: 4,
                merges,
                columnWidths,
                columnFormats,
            }],
        });
    };

    const mooeParticulars = Object.keys(headers.MOOE).sort();
    const coParticulars = Object.keys(headers.CO).sort();
    
    // Ensure all MOOE cols + 1 for Total MOOE
    const mooeSpan = mooeCodes.length; 
    // Ensure all CO cols + 1 for Total CO
    const coSpan = coCodes.length;

    const indentClasses = ['', 'bp-report__indent--1', 'bp-report__indent--2', 'bp-report__indent--3'];
    const headerCellClass = "bp-report__head-cell";
    const dataCellClass = "bp-report__cell";

    return (
        <div id="bp-forms-container" className="report-card bp-report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">Budget Proposal (BP) Forms</h3>
                <div className="report-card__actions">
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('Budget Proposal (BP) Forms', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'bp-forms-table',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button onClick={handleDownloadBpFormsXlsx} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>
            <div id="bp-forms-table" className="report-table-scroll relative">
                <table className="bp-report-table">
                    <thead className="sticky top-0 z-20">
                        <tr>
                            {/* PAP Column: Frozen */}
                            <th rowSpan={4} className={`${headerCellClass} bp-report__header-cell--label`}>Program/Activity/Project</th>
                            
                            {/* MOOE Group */}
                            {mooeCodes.length > 0 && <th colSpan={mooeCodes.length} className={`${headerCellClass} bp-report__group--mooe`}>MOOE</th>}
                            <th rowSpan={4} className={`${headerCellClass} bp-report__group--mooe bp-report__head-cell--total`}>Total MOOE</th>
                            
                            {/* CO Group */}
                            {coCodes.length > 0 && <th colSpan={coCodes.length} className={`${headerCellClass} bp-report__group--co`}>CO</th>}
                            <th rowSpan={4} className={`${headerCellClass} bp-report__group--co bp-report__head-cell--total`}>Total CO</th>
                            
                            {/* Grand Total */}
                            <th rowSpan={4} className={`${headerCellClass} bp-report__group--grand bp-report__header-cell--grand`}>Grand Total</th>
                        </tr>
                        <tr>
                            {/* MOOE Particulars (Dynamic grouping) */}
                            {mooeCodes.map((code, idx) => {
                                // Find particular for this code
                                let partName = "Other Expenses";
                                for (const p in headers.MOOE) {
                                    if (headers.MOOE[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                
                                // Check if this is the start of a group
                                const prevCode = idx > 0 ? mooeCodes[idx-1] : null;
                                let prevPart = null;
                                if (prevCode) {
                                    for (const p in headers.MOOE) {
                                        if (headers.MOOE[p].includes(prevCode)) {
                                            prevPart = p;
                                            break;
                                        }
                                    }
                                }
                                
                                if (partName === prevPart) return null;
                                
                                // Calculate span
                                let span = 1;
                                for (let i = idx + 1; i < mooeCodes.length; i++) {
                                    let nextPart = null;
                                    for (const p in headers.MOOE) {
                                        if (headers.MOOE[p].includes(mooeCodes[i])) {
                                            nextPart = p;
                                            break;
                                        }
                                    }
                                    if (nextPart === partName) span++;
                                    else break;
                                }
                                
                                return <th key={`p-mooe-${code}`} colSpan={span} className={`${headerCellClass}`}>{partName}</th>;
                            })}
                            
                            {/* CO Particulars (Dynamic grouping) */}
                            {coCodes.map((code, idx) => {
                                let partName = "Other Expenses";
                                for (const p in headers.CO) {
                                    if (headers.CO[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                
                                const prevCode = idx > 0 ? coCodes[idx-1] : null;
                                let prevPart = null;
                                if (prevCode) {
                                    for (const p in headers.CO) {
                                        if (headers.CO[p].includes(prevCode)) {
                                            prevPart = p;
                                            break;
                                        }
                                    }
                                }
                                
                                if (partName === prevPart) return null;
                                
                                let span = 1;
                                for (let i = idx + 1; i < coCodes.length; i++) {
                                    let nextPart = null;
                                    for (const p in headers.CO) {
                                        if (headers.CO[p].includes(coCodes[i])) {
                                            nextPart = p;
                                            break;
                                        }
                                    }
                                    if (nextPart === partName) span++;
                                    else break;
                                }
                                
                                return <th key={`p-co-${code}`} colSpan={span} className={`${headerCellClass}`}>{partName}</th>;
                            })}
                        </tr>
                        <tr>
                            {/* MOOE Descriptions */}
                            {mooeCodes.map(code => {
                                let partName = "Other Expenses";
                                for (const p in headers.MOOE) {
                                    if (headers.MOOE[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                return (
                                    <th key={`desc-mooe-${code}`} className={`${headerCellClass} bp-report__head-cell--description`}>
                                        {getDescription('MOOE', partName, code)}
                                    </th>
                                );
                            })}
                            {/* CO Descriptions */}
                            {coCodes.map(code => {
                                let partName = "Other Expenses";
                                for (const p in headers.CO) {
                                    if (headers.CO[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                return (
                                    <th key={`desc-co-${code}`} className={`${headerCellClass} bp-report__head-cell--description`}>
                                        {getDescription('CO', partName, code)}
                                    </th>
                                );
                            })}
                        </tr>
                        <tr>
                            {/* MOOE Codes */}
                            {mooeCodes.map(code => <th key={code} className={`${headerCellClass} bp-report__head-cell--code`}>{code}</th>)}
                            {/* CO Codes */}
                            {coCodes.map(code => <th key={code} className={`${headerCellClass} bp-report__head-cell--code`}>{code}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(rows).map(([componentName, componentData]) => {
                            const isComponentExpanded = expandedRows.has(componentName);
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
                                            mooeCodes={mooeCodes}
                                            coCodes={coCodes}
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
                                                        mooeCodes={mooeCodes}
                                                        coCodes={coCodes}
                                                        toggleRow={toggleRow}
                                                        dataCellClass={dataCellClass}
                                                        indentClasses={indentClasses}
                                                    />
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => {
                                                        const actKey = `${pkgName}-${act.name}-${i}`;
                                                        const isActExpanded = expandedRows.has(actKey);
                                                        return (
                                                            <React.Fragment key={actKey}>
                                                                <ActivityRow 
                                                                    activity={act}
                                                                    mooeCodes={mooeCodes}
                                                                    coCodes={coCodes}
                                                                    indentLevel={2}
                                                                    dataCellClass={dataCellClass}
                                                                    indentClasses={indentClasses}
                                                                    isExpanded={isActExpanded}
                                                                    toggleRow={toggleRow}
                                                                    rowKey={actKey}
                                                                />
                                                                {isActExpanded && act.particulars.map((part: any, pi: number) => (
                                                                    <ParticularRow 
                                                                        key={`${actKey}-part-${pi}`}
                                                                        particular={part}
                                                                        mooeCodes={mooeCodes}
                                                                        coCodes={coCodes}
                                                                        indentLevel={3}
                                                                        dataCellClass={dataCellClass}
                                                                        indentClasses={indentClasses}
                                                                    />
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
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
                        <tr className="bp-report__row bp-report__row--total">
                            <td className={`${dataCellClass} bp-report__cell--sticky`}>GRAND TOTAL</td>
                            
                            {/* MOOE Totals */}
                            {mooeCodes.map((code: string) => (
                                <td key={`total-mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrencyWhole(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--mooe`}>{grandTotals.totalMOOE > 0 ? formatCurrencyWhole(grandTotals.totalMOOE) : ''}</td>

                            {/* CO Totals */}
                            {coCodes.map((code: string) => (
                                <td key={`total-co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrencyWhole(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--co`}>{grandTotals.totalCO > 0 ? formatCurrencyWhole(grandTotals.totalCO) : ''}</td>

                            {/* Grand Total */}
                            <td className={`${dataCellClass} bp-report__cell--number bp-report__cell--grand`}>{(grandTotals.totalMOOE + grandTotals.totalCO) > 0 ? formatCurrencyWhole(grandTotals.totalMOOE + grandTotals.totalCO) : ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BPFormsReport;
