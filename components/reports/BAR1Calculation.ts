import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO, HistoryEntry } from '../../constants';
import { countPhysicalActual, countPhysicalTarget, getReportingMonthIndex, isParentRealignmentOrSavings } from './ReportUtils';
import {
    getActivityDisplayTitle,
    getActivityIpoNames,
    getActivityTypeLabel,
    getSubprojectIpo,
    getSubprojectIpoName,
    resolveActivityIpos,
} from '../../lib/entityIdentity';

export interface BAR1DataGroup {
    indicator: string;
    target: BAR1Counter;
    actual: BAR1Counter;
}

export type BAR1DrilldownRecordType = 'training' | 'activity' | 'ipo' | 'subproject' | 'ad' | 'staffing' | 'office' | 'participant';

export interface BAR1DrilldownRecord {
    id: string;
    type: BAR1DrilldownRecordType;
    label: string;
    description?: string;
    targetDate?: string;
    actualDate?: string;
    ipoName?: string;
    ipoNames?: string[];
    linkedNames?: string[];
    adNo?: string;
    packageName?: string;
    component?: string;
    source?: Subproject | Training | OtherActivity | OfficeRequirement | StaffingRequirement | IPO;
}

export interface BAR1Counter {
    m1: number; m2: number; m3: number; q1: number;
    m4: number; m5: number; m6: number; q2: number;
    m7: number; m8: number; m9: number; q3: number;
    m10: number; m11: number; m12: number; q4: number;
    total: number;
    m1_items: string[]; m2_items: string[]; m3_items: string[];
    m4_items: string[]; m5_items: string[]; m6_items: string[];
    m7_items: string[]; m8_items: string[]; m9_items: string[];
    m10_items: string[]; m11_items: string[]; m12_items: string[];
    m1_records: BAR1DrilldownRecord[]; m2_records: BAR1DrilldownRecord[]; m3_records: BAR1DrilldownRecord[];
    m4_records: BAR1DrilldownRecord[]; m5_records: BAR1DrilldownRecord[]; m6_records: BAR1DrilldownRecord[];
    m7_records: BAR1DrilldownRecord[]; m8_records: BAR1DrilldownRecord[]; m9_records: BAR1DrilldownRecord[];
    m10_records: BAR1DrilldownRecord[]; m11_records: BAR1DrilldownRecord[]; m12_records: BAR1DrilldownRecord[];
}

interface BAR1CalculationOptions {
    asOfDate?: string;
    reportingYear?: string;
}

export const initializeCounter = (): BAR1Counter => ({
    m1: 0, m2: 0, m3: 0, q1: 0,
    m4: 0, m5: 0, m6: 0, q2: 0,
    m7: 0, m8: 0, m9: 0, q3: 0,
    m10: 0, m11: 0, m12: 0, q4: 0,
    total: 0,
    m1_items: [], m2_items: [], m3_items: [],
    m4_items: [], m5_items: [], m6_items: [],
    m7_items: [], m8_items: [], m9_items: [],
    m10_items: [], m11_items: [], m12_items: [],
    m1_records: [], m2_records: [], m3_records: [],
    m4_records: [], m5_records: [], m6_records: [],
    m7_records: [], m8_records: [], m9_records: [],
    m10_records: [], m11_records: [], m12_records: []
});

const appendRecord = (records: BAR1DrilldownRecord[], record: BAR1DrilldownRecord) => {
    if (!records.some(existing => existing.id === record.id && existing.type === record.type)) {
        records.push(record);
    }
};

const incrementCounter = (counter: BAR1Counter, dateStr?: string, count: number = 1, itemName?: string, reportingYear: string = 'All', record?: BAR1DrilldownRecord) => {
    const monthIdx = getReportingMonthIndex(dateStr, reportingYear);
    if (monthIdx !== undefined) {
        const monthKey = `m${monthIdx + 1}` as keyof BAR1Counter;
        (counter[monthKey] as number) += count;
        
        if (itemName) {
            const itemsKey = `${monthKey}_items` as keyof BAR1Counter;
            const items = counter[itemsKey] as string[];
            if (!items.includes(itemName)) {
                items.push(itemName);
            }
        }
        if (record) {
            const recordsKey = `${monthKey}_records` as keyof BAR1Counter;
            appendRecord(counter[recordsKey] as BAR1DrilldownRecord[], record);
        }

        if (monthIdx < 3) counter.q1 += count;
        else if (monthIdx < 6) counter.q2 += count;
        else if (monthIdx < 9) counter.q3 += count;
        else counter.q4 += count;
        
        counter.total += count;
    }
};

const calculateFirstEncounter = (entries: { id: string; date?: string; label?: string; record?: BAR1DrilldownRecord }[], reportingYear: string) => {
    const counter = initializeCounter();
    const validEntries = entries
        .filter(e => e.date)
        .map(e => ({ ...e, d: new Date(e.date + 'T00:00:00Z') }))
        .sort((a, b) => a.d.getTime() - b.d.getTime());

    const seen = new Set<string>();

    validEntries.forEach(entry => {
        if (!seen.has(entry.id)) {
            seen.add(entry.id);
            incrementCounter(counter, entry.date, 1, entry.label || entry.id, reportingYear, entry.record);
        }
    });
    return counter;
};

const calculateSumOverTime = (entries: { val: number; date?: string; label?: string; record?: BAR1DrilldownRecord }[], reportingYear: string) => {
    const counter = initializeCounter();
    entries.forEach(e => {
        if (e.date) {
            incrementCounter(counter, e.date, e.val, e.label, reportingYear, e.record);
        }
    });
    return counter;
};

export const calculateBAR1ReportData = (data: {
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    ipos: IPO[];
}, selectedYear: string, selectedOu: string, options: BAR1CalculationOptions = {}) => {
    const reportingYear = options.reportingYear || selectedYear;
    const asOfCutoff = options.asOfDate ? new Date(`${options.asOfDate}T23:59:59.999`) : null;
    const getAccomplishmentHistoryDate = (history?: HistoryEntry[]) => {
        if (!Array.isArray(history)) return undefined;
        const relevantDates = history
            .filter(entry => /accomplishment|subproject completed|completed/i.test(entry.event || ''))
            .map(entry => new Date(entry.date))
            .filter(date => !Number.isNaN(date.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());
        return relevantDates[0]?.toISOString();
    };
    const getPhysicalSubmissionDate = (item: {
        physical_accomplishment_submitted_at?: string | null;
        history?: HistoryEntry[];
        updated_at?: string;
        created_at?: string;
    }) => item.physical_accomplishment_submitted_at || getAccomplishmentHistoryDate(item.history) || item.updated_at || item.created_at;
    const isSubmittedByAsOf = (item: {
        physical_accomplishment_submitted_at?: string | null;
        history?: HistoryEntry[];
        updated_at?: string;
        created_at?: string;
    }) => {
        if (!asOfCutoff) return true;
        const submissionDate = getPhysicalSubmissionDate(item);
        if (!submissionDate) return true;
        const submittedAt = new Date(submissionDate);
        if (Number.isNaN(submittedAt.getTime())) return true;
        return submittedAt <= asOfCutoff;
    };
    const actualDateIfSubmitted = <T extends {
        physical_accomplishment_submitted_at?: string | null;
        history?: HistoryEntry[];
        updated_at?: string;
        created_at?: string;
    }>(item: T, actualDate?: string) => {
        if (!actualDate) return undefined;
        return isSubmittedByAsOf(item) ? actualDate : undefined;
    };

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

    const makeSubprojectRecord = (sp: Subproject): BAR1DrilldownRecord => {
        const ipoName = getSubprojectIpoName(sp, data.ipos);
        return {
            id: `subproject-${sp.id}`,
            type: 'subproject',
            label: sp.name,
            description: sp.remarks || '',
            targetDate: sp.estimatedCompletionDate,
            actualDate: sp.actualCompletionDate,
            ipoName,
            ipoNames: ipoName ? [ipoName] : [],
            packageName: sp.packageType,
            component: 'Production and Livelihood',
            source: sp,
        };
    };
    const makeSubprojectIpoRecord = (sp: Subproject): BAR1DrilldownRecord | undefined => {
        const ipo = getSubprojectIpo(sp, data.ipos);
        if (!ipo) return undefined;
        return {
            id: `ipo-${ipo.id}`,
            type: 'ipo',
            label: ipo.name,
            targetDate: sp.estimatedCompletionDate,
            actualDate: sp.actualCompletionDate,
            linkedNames: [sp.name],
            packageName: sp.packageType,
            source: ipo,
        };
    };
    const makeSubprojectAdRecord = (sp: Subproject): BAR1DrilldownRecord | undefined => {
        const ipo = getSubprojectIpo(sp, data.ipos);
        const adNo = ipo?.ancestralDomainNo;
        if (!adNo) return undefined;
        return {
            id: `ad-${adNo}`,
            type: 'ad',
            label: adNo,
            adNo,
            targetDate: sp.estimatedCompletionDate,
            actualDate: sp.actualCompletionDate,
            ipoNames: [ipo.name],
            linkedNames: [sp.name],
            packageName: sp.packageType,
        };
    };
    const makeActivityRecord = (activity: Training | OtherActivity, actualDate?: string): BAR1DrilldownRecord => ({
        id: `activity-${activity.id}`,
        type: activity.type === 'Training' ? 'training' : 'activity',
        label: getActivityDisplayTitle(activity),
        description: activity.description,
        targetDate: activity.endDate || activity.date,
        actualDate: actualDate || activity.actualDate,
        ipoNames: getActivityIpoNames(activity, data.ipos),
        component: activity.component,
        source: activity,
    });
    const makeActivityIpoRecord = (activity: Training | OtherActivity, ipo: IPO, actualDate?: string): BAR1DrilldownRecord => ({
        id: `ipo-${ipo.id}`,
        type: 'ipo',
        label: ipo.name,
        targetDate: activity.endDate || activity.date,
        actualDate: actualDate || activity.actualDate,
        linkedNames: [getActivityDisplayTitle(activity)],
        component: activity.component,
        source: ipo,
    });
    const makeProgramRecord = (pm: OfficeRequirement | StaffingRequirement, type: 'office' | 'staffing', label: string, actualDate?: string): BAR1DrilldownRecord => ({
        id: `${type}-${pm.id}`,
        type,
        label,
        description: type === 'office' ? ((pm as OfficeRequirement).purpose || (pm as OfficeRequirement).specs || '') : ((pm as StaffingRequirement).component || ''),
        targetDate: pm.physicalDeliveryDate || pm.obligationDate,
        actualDate: actualDate || pm.actualDate || pm.actualObligationDate,
        component: type === 'staffing' ? (pm as StaffingRequirement).component : 'Program Management',
        source: pm,
    });

    // Production and Livelihood - Subproject Reach
    const allTargetADs = data.subprojects.filter(sp => !isParentRealignmentOrSavings(sp)).map(sp => ({
        id: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
        label: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
        date: sp.estimatedCompletionDate,
        record: makeSubprojectAdRecord(sp)
    })).filter(x => x.id);
    const allActualADs = data.subprojects.map(sp => ({
        id: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
        label: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
        date: actualDateIfSubmitted(sp, sp.actualCompletionDate),
        record: makeSubprojectAdRecord(sp)
    })).filter(x => x.id);

    const allTargetIPOs = data.subprojects.filter(sp => !isParentRealignmentOrSavings(sp)).map(sp => ({
        id: String(getSubprojectIpo(sp, data.ipos)?.id || ''),
        label: getSubprojectIpoName(sp, data.ipos),
        date: sp.estimatedCompletionDate,
        record: makeSubprojectIpoRecord(sp)
    })).filter(item => item.id);
    const allActualIPOs = data.subprojects.map(sp => ({
        id: String(getSubprojectIpo(sp, data.ipos)?.id || ''),
        label: getSubprojectIpoName(sp, data.ipos),
        date: actualDateIfSubmitted(sp, sp.actualCompletionDate),
        record: makeSubprojectIpoRecord(sp)
    })).filter(item => item.id);

    finalData['Production and Livelihood'].packages['Subproject Reach'] = {
        items: [
            {
                indicator: "Number of Ancestral Domains covered",
                target: calculateFirstEncounter(allTargetADs, reportingYear),
                actual: calculateFirstEncounter(allActualADs, reportingYear)
            },
            {
                indicator: "Number of IPOs with subprojects",
                target: calculateFirstEncounter(allTargetIPOs, reportingYear),
                actual: calculateFirstEncounter(allActualIPOs, reportingYear)
            }
        ]
    };

    const packages: Record<string, Subproject[]> = {};
    data.subprojects.forEach(sp => {
        const pkg = sp.packageType || 'Other';
        if (!packages[pkg]) packages[pkg] = [];
        packages[pkg].push(sp);
    });

    Object.entries(packages).forEach(([pkgName, subprojects]) => {
        if (!finalData['Production and Livelihood'].packages[pkgName]) {
            finalData['Production and Livelihood'].packages[pkgName] = { items: [] };
        }
        const pkgItems = finalData['Production and Livelihood'].packages[pkgName].items;

        const targetADs = subprojects.filter(sp => !isParentRealignmentOrSavings(sp)).map(sp => ({
            id: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
            label: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
            date: sp.estimatedCompletionDate,
            record: makeSubprojectAdRecord(sp)
        })).filter(x => x.id); 
        const actualADs = subprojects.map(sp => ({
            id: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
            label: getSubprojectIpo(sp, data.ipos)?.ancestralDomainNo || '',
            date: actualDateIfSubmitted(sp, sp.actualCompletionDate),
            record: makeSubprojectAdRecord(sp)
        })).filter(x => x.id);

        pkgItems.push({
            indicator: "Number of Ancestral Domains covered",
            target: calculateFirstEncounter(targetADs, reportingYear),
            actual: calculateFirstEncounter(actualADs, reportingYear)
        });

        const targetIPOs = subprojects.filter(sp => !isParentRealignmentOrSavings(sp)).map(sp => ({
            id: String(getSubprojectIpo(sp, data.ipos)?.id || ''),
            label: getSubprojectIpoName(sp, data.ipos),
            date: sp.estimatedCompletionDate,
            record: makeSubprojectIpoRecord(sp)
        })).filter(item => item.id);
        const actualIPOs = subprojects.map(sp => ({
            id: String(getSubprojectIpo(sp, data.ipos)?.id || ''),
            label: getSubprojectIpoName(sp, data.ipos),
            date: actualDateIfSubmitted(sp, sp.actualCompletionDate),
            record: makeSubprojectIpoRecord(sp)
        })).filter(item => item.id);

        pkgItems.push({
            indicator: "Number of IPOs",
            target: calculateFirstEncounter(targetIPOs, reportingYear),
            actual: calculateFirstEncounter(actualIPOs, reportingYear)
        });

        const targetSPs = subprojects
            .filter(sp => !isParentRealignmentOrSavings(sp))
            .map(sp => ({ val: 1, date: sp.estimatedCompletionDate, label: sp.name, record: makeSubprojectRecord(sp) }));
        const actualSPs = subprojects.map(sp => ({ val: countPhysicalActual(sp, 1), date: actualDateIfSubmitted(sp, sp.actualCompletionDate), label: sp.name, record: makeSubprojectRecord(sp) }));
        pkgItems.push({
            indicator: "Number of Subprojects",
            target: calculateSumOverTime(targetSPs, reportingYear),
            actual: calculateSumOverTime(actualSPs, reportingYear)
        });
    });

    // Trainings
    const processTrainings = (componentName: string, targetContainer: any[], isPackage: boolean = false) => {
        const relevantTrainings = data.trainings.filter(t => t.component === componentName);
        if (relevantTrainings.length === 0 && !isPackage) return; // Skip empty groups? Original didn't skip, but it keeps it clean. Wait, original didn't skip.

        const getTargetDate = (t: Training) => t.endDate || t.date;
        const getActualDate = (t: Training) => actualDateIfSubmitted(t, t.actualDate);
        const targetTrainings = relevantTrainings
            .filter(t => !isParentRealignmentOrSavings(t))
            .map(t => ({ val: 1, label: getActivityDisplayTitle(t), date: getTargetDate(t), record: makeActivityRecord(t, getActualDate(t)) }));
        const actualTrainings = relevantTrainings.map(t => ({ val: countPhysicalActual(t, 1), label: getActivityDisplayTitle(t), date: getActualDate(t), record: makeActivityRecord(t, getActualDate(t)) }));
        const targetIPOs: { id: string, label: string, date?: string, record?: BAR1DrilldownRecord }[] = [];
        const actualIPOs: { id: string, label: string, date?: string, record?: BAR1DrilldownRecord }[] = [];
        
        relevantTrainings.forEach(t => {
            const tDate = getTargetDate(t);
            const aDate = getActualDate(t);
            resolveActivityIpos(t, data.ipos).forEach(ipo => {
                if (!isParentRealignmentOrSavings(t)) targetIPOs.push({ id: String(ipo.id), label: ipo.name, date: tDate, record: makeActivityIpoRecord(t, ipo, aDate) });
                if (aDate) actualIPOs.push({ id: String(ipo.id), label: ipo.name, date: aDate, record: makeActivityIpoRecord(t, ipo, aDate) });
            });
        });

        const targetPax = relevantTrainings.filter(t => !isParentRealignmentOrSavings(t)).map(t => ({
            val: (t.participantsMale || 0) + (t.participantsFemale || 0), 
            label: getActivityDisplayTitle(t),
            date: getTargetDate(t),
            record: { ...makeActivityRecord(t, getActualDate(t)), type: 'participant' as BAR1DrilldownRecordType }
        }));
        const actualPax = relevantTrainings.map(t => ({ 
            val: (t.actualParticipantsMale || 0) + (t.actualParticipantsFemale || 0), 
            label: getActivityDisplayTitle(t),
            date: getActualDate(t),
            record: { ...makeActivityRecord(t, getActualDate(t)), type: 'participant' as BAR1DrilldownRecordType }
        }));

        const trainingGroup = {
            indicator: "Trainings",
            isExpandable: true,
            items: [
                {
                    indicator: "Number of Trainings conducted",
                    target: calculateSumOverTime(targetTrainings, reportingYear),
                    actual: calculateSumOverTime(actualTrainings, reportingYear)
                },
                {
                    indicator: "Number of IPOs trained",
                    target: calculateFirstEncounter(targetIPOs, reportingYear),
                    actual: calculateFirstEncounter(actualIPOs, reportingYear)
                },
                {
                    indicator: "Number of Participants",
                    target: calculateSumOverTime(targetPax, reportingYear),
                    actual: calculateSumOverTime(actualPax, reportingYear)
                }
            ]
        };

        if (isPackage) {
            if (!finalData['Production and Livelihood'].packages['Trainings']) {
                finalData['Production and Livelihood'].packages['Trainings'] = { items: [] };
            }
            finalData['Production and Livelihood'].packages['Trainings'].items.push(...trainingGroup.items);
        } else {
            targetContainer.push(trainingGroup);
        }
    };

    const processOtherActivities = (componentName: string, targetContainer: any[], isPackage: boolean = false) => {
        const relevantActivities = data.otherActivities.filter(a => a.component === componentName);
        
        // Group by name
        const groups: { [name: string]: OtherActivity[] } = {};
        relevantActivities.forEach(a => {
            const activityType = getActivityTypeLabel(a);
            if (!groups[activityType]) groups[activityType] = [];
            groups[activityType].push(a);
        });

        Object.entries(groups).forEach(([name, activities]) => {
            const targetConducted = activities
                .filter(a => !isParentRealignmentOrSavings(a))
                .map(a => ({ val: 1, label: getActivityDisplayTitle(a), date: a.date, record: makeActivityRecord(a, actualDateIfSubmitted(a, a.actualDate)) }));
            const actualConducted = activities.map(a => ({ val: countPhysicalActual(a, 1), label: getActivityDisplayTitle(a), date: actualDateIfSubmitted(a, a.actualDate), record: makeActivityRecord(a, actualDateIfSubmitted(a, a.actualDate)) }));

            const targetIPOs: { id: string, label: string, date?: string, record?: BAR1DrilldownRecord }[] = [];
            const actualIPOs: { id: string, label: string, date?: string, record?: BAR1DrilldownRecord }[] = [];
            
            activities.forEach(a => {
                resolveActivityIpos(a, data.ipos).forEach(ipo => {
                    const actualDate = actualDateIfSubmitted(a, a.actualDate);
                    if (!isParentRealignmentOrSavings(a)) targetIPOs.push({ id: String(ipo.id), label: ipo.name, date: a.date, record: makeActivityIpoRecord(a, ipo, actualDate) });
                    if (actualDate) actualIPOs.push({ id: String(ipo.id), label: ipo.name, date: actualDate, record: makeActivityIpoRecord(a, ipo, actualDate) });
                });
            });

            let activityGroup: any;

            if (componentName === 'Program Management') {
                activityGroup = {
                    indicator: name,
                        target: calculateSumOverTime(targetConducted, reportingYear),
                        actual: calculateSumOverTime(actualConducted, reportingYear)
                };
            } else {
                activityGroup = {
                    indicator: name,
                    isExpandable: true,
                    items: [
                        {
                            indicator: `Number of ${name} conducted`,
                            target: calculateSumOverTime(targetConducted, reportingYear),
                            actual: calculateSumOverTime(actualConducted, reportingYear)
                        },
                        {
                            indicator: `Number of IPOs assisted in ${name}`,
                            target: calculateFirstEncounter(targetIPOs, reportingYear),
                            actual: calculateFirstEncounter(actualIPOs, reportingYear)
                        }
                    ]
                };
            }

            if (isPackage) {
                 if (finalData['Program Management'].packages['Activities']) {
                    finalData['Program Management'].packages['Activities'].items.push(activityGroup);
                 }
            } else {
                targetContainer.push(activityGroup);
            }
        });
    };

    processTrainings('Social Preparation', finalData['Social Preparation']);
    processTrainings('Marketing and Enterprise', finalData['Marketing and Enterprise']);
    processTrainings('Production and Livelihood', [], true);

    processOtherActivities('Social Preparation', finalData['Social Preparation']);
    processOtherActivities('Marketing and Enterprise', finalData['Marketing and Enterprise']);
    processOtherActivities('Program Management', [], true);

    const createBar1Item = (indicator: string, targetCount: number, targetDate?: string, actualDate?: string, itemName?: string, actualCount = targetCount, record?: BAR1DrilldownRecord) => {
        const item: any = {
            indicator,
            target: initializeCounter(),
            actual: initializeCounter()
        };
        incrementCounter(item.target, targetDate, targetCount, itemName, reportingYear, record);
        incrementCounter(item.actual, actualDate, actualCount, itemName, reportingYear, record);
        return item;
    };

    const addItemToGroup = (list: any[], newItem: any) => {
        const existing = list.find(i => i.indicator === newItem.indicator);
        if (existing) {
            for (const key in newItem.target) {
                if (key.endsWith('_items')) {
                    existing.target[key] = [...(existing.target[key] || []), ...((newItem.target[key] as any) || [])];
                } else if (key.endsWith('_records')) {
                    existing.target[key] = [...(existing.target[key] || []), ...((newItem.target[key] as any) || [])];
                } else {
                    (existing.target as any)[key] += (newItem.target as any)[key];
                }
            }
            for (const key in newItem.actual) {
                if (key.endsWith('_items')) {
                    existing.actual[key] = [...(existing.actual[key] || []), ...((newItem.actual[key] as any) || [])];
                } else if (key.endsWith('_records')) {
                    existing.actual[key] = [...(existing.actual[key] || []), ...((newItem.actual[key] as any) || [])];
                } else {
                    (existing.actual as any)[key] += (newItem.actual as any)[key];
                }
            }
        } else {
            list.push(newItem);
        }
    };

    const processPm = (items: any[], pkgKey: string, isStaff = false, isOtherExpense = false) => {
        items.forEach(pm => {
            if (isOtherExpense) return; 
            const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
            const count = isStaff ? 1 : (pm.numberOfUnits || 1);
            const itemName = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
            const actualDate = actualDateIfSubmitted(pm, pm.actualDate || pm.actualObligationDate);
            const record = makeProgramRecord(pm, isStaff ? 'staffing' : 'office', itemName, actualDate);
            const item = createBar1Item(
                indicator,
                countPhysicalTarget(pm, count),
                pm.obligationDate,
                actualDate,
                itemName,
                countPhysicalActual(pm, count),
                record
            );
            addItemToGroup(finalData['Program Management'].packages[pkgKey].items, item);
        });
    }
    processPm(data.staffingReqs || [], 'Staff Requirements', true);
    processPm(data.officeReqs || [], 'Office Requirements');

    const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
    const sortedPLPackageData: { [key: string]: any } = {};
    for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
    finalData['Production and Livelihood'].packages = sortedPLPackageData;

    return finalData;
};
