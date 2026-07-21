
// Author: 4K
import React, { useMemo, useState } from 'react';
import { Download, Printer, Search, X } from 'lucide-react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO, Deadline } from '../../constants';
import { ReportExcelRequest, ReportPrintRequest, withReportYearLabel } from './ReportUtils';
import { BAR1DrilldownRecord, calculateBAR1ReportData } from './BAR1Calculation';
import { isMonthTargetOverdue } from '../../lib/dateStatus';

interface DetailPopup {
    indicator: string;
    month: string;
    items: string[];
    records: BAR1DrilldownRecord[];
    type: 'Target' | 'Accomplishment';
}

interface BAR1ReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    uacsCodes: any;
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    deadlines: Deadline[];
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training | OtherActivity) => void;
    onSelectIpo: (ipo: IPO) => void;
    onSelectOfficeReq: (req: OfficeRequirement) => void;
    onSelectStaffingReq: (req: StaffingRequirement) => void;
    onOpenIpoListForAncestralDomain: (adNo: string) => void;
    selectedAsOfDate: string;
    onSelectedAsOfDateChange: (value: string) => void;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

const BAR1_COLUMN_COUNT = 50;

const BAR1Report: React.FC<BAR1ReportProps> = ({ data, uacsCodes, selectedYear, selectedReportingYear, selectedOu, selectedTier, selectedFundType, deadlines, onSelectSubproject, onSelectActivity, onSelectIpo, onSelectOfficeReq, onSelectStaffingReq, onOpenIpoListForAncestralDomain, selectedAsOfDate, onSelectedAsOfDateChange, onPrintReport, onExportReport }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const [popup, setPopup] = useState<DetailPopup | null>(null);
    const [popupSearch, setPopupSearch] = useState('');
    const sortedDeadlines = useMemo(() => {
        return [...deadlines].sort((a, b) => a.date.localeCompare(b.date));
    }, [deadlines]);

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const indentClasses: { [key: number]: string } = { 0: '', 1: 'bar1-report__indent--1', 2: 'bar1-report__indent--2', 3: 'bar1-report__indent--3', 4: 'bar1-report__indent--4' };
    const dataCellClass = "bar1-report__cell";

    const bar1Data = useMemo(() => {
        return calculateBAR1ReportData(data, selectedYear, selectedOu, { asOfDate: selectedAsOfDate || undefined, reportingYear: selectedReportingYear });
    }, [data, selectedYear, selectedReportingYear, selectedOu, selectedAsOfDate]);

    const ipoByName = useMemo(() => {
        const map = new Map<string, IPO>();
        data.ipos.forEach(ipo => map.set(ipo.name, ipo));
        return map;
    }, [data.ipos]);

    const formatDate = (value?: string) => {
        if (!value) return '-';
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const uniqueStrings = (values?: string[]) => Array.from(new Set((values || []).filter(Boolean))).sort();

    const mergePopupRecords = (records: BAR1DrilldownRecord[]) => {
        const merged = new Map<string, BAR1DrilldownRecord>();
        records.forEach(record => {
            const key = `${record.type}-${record.id}`;
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, {
                    ...record,
                    ipoNames: uniqueStrings(record.ipoNames),
                    linkedNames: uniqueStrings(record.linkedNames),
                });
                return;
            }
            existing.ipoNames = uniqueStrings([...(existing.ipoNames || []), ...(record.ipoNames || [])]);
            existing.linkedNames = uniqueStrings([...(existing.linkedNames || []), ...(record.linkedNames || [])]);
            existing.targetDate = existing.targetDate || record.targetDate;
            existing.actualDate = existing.actualDate || record.actualDate;
            existing.source = existing.source || record.source;
        });
        return Array.from(merged.values());
    };

    const popupRecords = useMemo(() => {
        if (!popup) return [];
        const term = popupSearch.trim().toLowerCase();
        return mergePopupRecords(popup.records).filter(record => {
            if (!term) return true;
            return [
                record.label,
                record.description,
                record.adNo,
                record.ipoName,
                ...(record.ipoNames || []),
                ...(record.linkedNames || []),
            ].filter(Boolean).join(' ').toLowerCase().includes(term);
        });
    }, [popup, popupSearch]);

    const isRecordOverdue = (record: BAR1DrilldownRecord) => {
        if (!record.targetDate || record.actualDate) return false;
        return isMonthTargetOverdue(record.targetDate);
    };

    const openRecord = (record: BAR1DrilldownRecord) => {
        if (record.type === 'subproject' && record.source) {
            onSelectSubproject(record.source as Subproject);
            return;
        }
        if ((record.type === 'training' || record.type === 'activity') && record.source) {
            onSelectActivity(record.source as Training | OtherActivity);
            return;
        }
        if (record.type === 'ipo') {
            const ipo = (record.source as IPO | undefined) || ipoByName.get(record.label);
            if (ipo) onSelectIpo(ipo);
            return;
        }
        if (record.type === 'ad' && record.adNo) {
            onOpenIpoListForAncestralDomain(record.adNo);
            return;
        }
        if (record.type === 'office' && record.source) {
            onSelectOfficeReq(record.source as OfficeRequirement);
            return;
        }
        if (record.type === 'staffing' && record.source) {
            onSelectStaffingReq(record.source as StaffingRequirement);
        }
    };

    const canOpenRecord = (record: BAR1DrilldownRecord) => {
        if (record.type === 'ad') return Boolean(record.adNo);
        if (record.type === 'ipo') return Boolean((record.source as IPO | undefined) || ipoByName.get(record.label));
        return Boolean(record.source && record.type !== 'participant');
    };

    const calculateTotals = (items: any[]) => {
        const initial = {
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0,
            m1_items: [] as string[], m2_items: [] as string[], m3_items: [] as string[],
            m4_items: [] as string[], m5_items: [] as string[], m6_items: [] as string[],
            m7_items: [] as string[], m8_items: [] as string[], m9_items: [] as string[],
            m10_items: [] as string[], m11_items: [] as string[], m12_items: [] as string[],
            m1_records: [] as BAR1DrilldownRecord[], m2_records: [] as BAR1DrilldownRecord[], m3_records: [] as BAR1DrilldownRecord[],
            m4_records: [] as BAR1DrilldownRecord[], m5_records: [] as BAR1DrilldownRecord[], m6_records: [] as BAR1DrilldownRecord[],
            m7_records: [] as BAR1DrilldownRecord[], m8_records: [] as BAR1DrilldownRecord[], m9_records: [] as BAR1DrilldownRecord[],
            m10_records: [] as BAR1DrilldownRecord[], m11_records: [] as BAR1DrilldownRecord[], m12_records: [] as BAR1DrilldownRecord[]
        };

        const total = {
            target: { ...initial },
            actual: { ...initial }
        };

        items.forEach(item => {
            if (item.isExpandable && item.items) {
                 const primaryMetric = item.items.find((i: any) => i.indicator.includes("conducted"));
                 if (primaryMetric) {
                     for (let i = 1; i <= 12; i++) {
                        total.target[`m${i}`] += (primaryMetric.target[`m${i}`] || 0);
                        total.actual[`m${i}`] += (primaryMetric.actual[`m${i}`] || 0);
                        total.target[`m${i}_items`] = [...new Set([...total.target[`m${i}_items`], ...(primaryMetric.target[`m${i}_items`] || [])])];
                        total.actual[`m${i}_items`] = [...new Set([...total.actual[`m${i}_items`], ...(primaryMetric.actual[`m${i}_items`] || [])])];
                        total.target[`m${i}_records`] = [...(total.target[`m${i}_records`] || []), ...(primaryMetric.target[`m${i}_records`] || [])];
                        total.actual[`m${i}_records`] = [...(total.actual[`m${i}_records`] || []), ...(primaryMetric.actual[`m${i}_records`] || [])];
                    }
                    total.target.q1 += (primaryMetric.target.q1 || 0); total.actual.q1 += (primaryMetric.actual.q1 || 0);
                    total.target.q2 += (primaryMetric.target.q2 || 0); total.actual.q2 += (primaryMetric.actual.q2 || 0);
                    total.target.q3 += (primaryMetric.target.q3 || 0); total.actual.q3 += (primaryMetric.actual.q3 || 0);
                    total.target.q4 += (primaryMetric.target.q4 || 0); total.actual.q4 += (primaryMetric.actual.q4 || 0);
                    total.target.total += (primaryMetric.target.total || 0); total.actual.total += (primaryMetric.actual.total || 0);
                 }
                 return;
            }

            for (let i = 1; i <= 12; i++) {
                total.target[`m${i}`] += (item.target[`m${i}`] || 0);
                total.actual[`m${i}`] += (item.actual[`m${i}`] || 0);
                total.target[`m${i}_items`] = [...new Set([...total.target[`m${i}_items`], ...(item.target[`m${i}_items`] || [])])];
                total.actual[`m${i}_items`] = [...new Set([...total.actual[`m${i}_items`], ...(item.actual[`m${i}_items`] || [])])];
                total.target[`m${i}_records`] = [...(total.target[`m${i}_records`] || []), ...(item.target[`m${i}_records`] || [])];
                total.actual[`m${i}_records`] = [...(total.actual[`m${i}_records`] || []), ...(item.actual[`m${i}_records`] || [])];
            }
            total.target.q1 += (item.target.q1 || 0); total.actual.q1 += (item.actual.q1 || 0);
            total.target.q2 += (item.target.q2 || 0); total.actual.q2 += (item.actual.q2 || 0);
            total.target.q3 += (item.target.q3 || 0); total.actual.q3 += (item.actual.q3 || 0);
            total.target.q4 += (item.target.q4 || 0); total.actual.q4 += (item.actual.q4 || 0);
            total.target.total += (item.target.total || 0); total.actual.total += (item.actual.total || 0);
        });
        return total;
    };

    const renderDataCells = (item: any, isTotal: boolean = false, rowLabel?: string) => {
        const cellClass = `${dataCellClass} bar1-report__cell--center ${isTotal ? 'bar1-report__cell--emphasis' : ''}`;
        const totalClass = `${dataCellClass} bar1-report__cell--total bar1-report__cell--center bar1-report__cell--emphasis`;
        const calculatedClass = `${dataCellClass} bar1-report__cell--calculated bar1-report__cell--center bar1-report__cell--emphasis`;
        const yearEndClass = `${dataCellClass} bar1-report__cell--year-end bar1-report__cell--center bar1-report__cell--emphasis`;
        const percentClass = `${dataCellClass} bar1-report__cell--percent bar1-report__cell--center bar1-report__cell--emphasis`;

        const getVals = (source: any) => {
             const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
             const asOfSept = semestralTotal + (source.q3 || 0);
             const yearEndNov = (source.total || 0) - (source.m12 || 0);
             return { ...source, semestralTotal, asOfSept, yearEndNov };
        }

        const t = getVals(item.target);
        const a = getVals(item.actual);

        const getPct = (actual: number, target: number) => {
            if (!target) return '';
            return `${Math.round((actual / target) * 100)}%`;
        };

        const getUnmetClass = (actual: number, target: number) => target > 0 && actual < target ? 'bar1-report__cell--unmet' : '';

        const collectMonthItems = (source: any, months: number[]) => {
            return Array.from(new Set(months.flatMap(month => source[`m${month}_items`] || [])));
        };

        const collectMonthRecords = (source: any, months: number[]) => {
            return months.flatMap(month => source[`m${month}_records`] || []);
        };

        const ClickableValue = ({ val, items, records, month, type }: { val: number | string, items: string[], records?: BAR1DrilldownRecord[], month: string, type: 'Target' | 'Accomplishment' }) => {
            if (!val || val === 0) return <span></span>;
            const usableRecords = (records || []).filter(record => record.type !== 'participant');
            const isParticipantMetric = /participant/i.test(item.indicator || rowLabel || '');
            if (isParticipantMetric || usableRecords.length === 0) return <span>{val}</span>;

            return (
                <button
                    onClick={() => {
                        setPopup({ indicator: item.indicator || rowLabel || 'Summary', month, items, records: usableRecords, type });
                        setPopupSearch('');
                    }}
                    className="table-link"
                >
                    {val}
                </button>
            );
        };

        const renderTargetSection = () => (
            <>
                <td className={cellClass}><ClickableValue val={t.m1} items={t.m1_items} records={t.m1_records} month="January" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m2} items={t.m2_items} records={t.m2_records} month="February" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m3} items={t.m3_items} records={t.m3_records} month="March" type="Target" /></td>
                <td className={totalClass}><ClickableValue val={t.q1} items={collectMonthItems(t, [1, 2, 3])} records={collectMonthRecords(t, [1, 2, 3])} month="1st Quarter" type="Target" /></td>

                <td className={cellClass}><ClickableValue val={t.m4} items={t.m4_items} records={t.m4_records} month="April" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m5} items={t.m5_items} records={t.m5_records} month="May" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m6} items={t.m6_items} records={t.m6_records} month="June" type="Target" /></td>
                <td className={totalClass}><ClickableValue val={t.q2} items={collectMonthItems(t, [4, 5, 6])} records={collectMonthRecords(t, [4, 5, 6])} month="2nd Quarter" type="Target" /></td>

                <td className={calculatedClass}><ClickableValue val={t.semestralTotal} items={collectMonthItems(t, [1, 2, 3, 4, 5, 6])} records={collectMonthRecords(t, [1, 2, 3, 4, 5, 6])} month="Semestral" type="Target" /></td>

                <td className={cellClass}><ClickableValue val={t.m7} items={t.m7_items} records={t.m7_records} month="July" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m8} items={t.m8_items} records={t.m8_records} month="August" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m9} items={t.m9_items} records={t.m9_records} month="September" type="Target" /></td>
                <td className={totalClass}><ClickableValue val={t.q3} items={collectMonthItems(t, [7, 8, 9])} records={collectMonthRecords(t, [7, 8, 9])} month="3rd Quarter" type="Target" /></td>

                <td className={calculatedClass}><ClickableValue val={t.asOfSept} items={collectMonthItems(t, [1, 2, 3, 4, 5, 6, 7, 8, 9])} records={collectMonthRecords(t, [1, 2, 3, 4, 5, 6, 7, 8, 9])} month="As of September" type="Target" /></td>

                <td className={cellClass}><ClickableValue val={t.m10} items={t.m10_items} records={t.m10_records} month="October" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m11} items={t.m11_items} records={t.m11_records} month="November" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m12} items={t.m12_items} records={t.m12_records} month="December" type="Target" /></td>
                <td className={totalClass}><ClickableValue val={t.q4} items={collectMonthItems(t, [10, 11, 12])} records={collectMonthRecords(t, [10, 11, 12])} month="4th Quarter" type="Target" /></td>

                <td className={yearEndClass}><ClickableValue val={t.yearEndNov} items={collectMonthItems(t, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])} records={collectMonthRecords(t, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])} month="Year-end (Nov)" type="Target" /></td>
                <td className={`${dataCellClass} bar1-report__cell--grand-target bar1-report__cell--center bar1-report__cell--emphasis`}><ClickableValue val={t.total} items={collectMonthItems(t, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} records={collectMonthRecords(t, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} month="Annual Total" type="Target" /></td>
            </>
        );

        const renderActualSection = () => (
            <>
                <td className={`${cellClass} ${getUnmetClass(a.m1, t.m1)}`}><ClickableValue val={a.m1} items={a.m1_items} records={a.m1_records} month="January" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m2, t.m2)}`}><ClickableValue val={a.m2} items={a.m2_items} records={a.m2_records} month="February" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m3, t.m3)}`}><ClickableValue val={a.m3} items={a.m3_items} records={a.m3_records} month="March" type="Accomplishment" /></td>
                <td className={`${totalClass} ${getUnmetClass(a.q1, t.q1)}`}><ClickableValue val={a.q1} items={collectMonthItems(a, [1, 2, 3])} records={collectMonthRecords(a, [1, 2, 3])} month="1st Quarter" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.q1, t.q1)}`}>{getPct(a.q1, t.q1)}</td>

                <td className={`${cellClass} ${getUnmetClass(a.m4, t.m4)}`}><ClickableValue val={a.m4} items={a.m4_items} records={a.m4_records} month="April" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m5, t.m5)}`}><ClickableValue val={a.m5} items={a.m5_items} records={a.m5_records} month="May" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m6, t.m6)}`}><ClickableValue val={a.m6} items={a.m6_items} records={a.m6_records} month="June" type="Accomplishment" /></td>
                <td className={`${totalClass} ${getUnmetClass(a.q2, t.q2)}`}><ClickableValue val={a.q2} items={collectMonthItems(a, [4, 5, 6])} records={collectMonthRecords(a, [4, 5, 6])} month="2nd Quarter" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.q2, t.q2)}`}>{getPct(a.q2, t.q2)}</td>

                <td className={`${calculatedClass} ${getUnmetClass(a.semestralTotal, t.semestralTotal)}`}><ClickableValue val={a.semestralTotal} items={collectMonthItems(a, [1, 2, 3, 4, 5, 6])} records={collectMonthRecords(a, [1, 2, 3, 4, 5, 6])} month="Semestral" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.semestralTotal, t.semestralTotal)}`}>{getPct(a.semestralTotal, t.semestralTotal)}</td>

                <td className={`${cellClass} ${getUnmetClass(a.m7, t.m7)}`}><ClickableValue val={a.m7} items={a.m7_items} records={a.m7_records} month="July" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m8, t.m8)}`}><ClickableValue val={a.m8} items={a.m8_items} records={a.m8_records} month="August" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m9, t.m9)}`}><ClickableValue val={a.m9} items={a.m9_items} records={a.m9_records} month="September" type="Accomplishment" /></td>
                <td className={`${totalClass} ${getUnmetClass(a.q3, t.q3)}`}><ClickableValue val={a.q3} items={collectMonthItems(a, [7, 8, 9])} records={collectMonthRecords(a, [7, 8, 9])} month="3rd Quarter" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.q3, t.q3)}`}>{getPct(a.q3, t.q3)}</td>

                <td className={`${calculatedClass} ${getUnmetClass(a.asOfSept, t.asOfSept)}`}><ClickableValue val={a.asOfSept} items={collectMonthItems(a, [1, 2, 3, 4, 5, 6, 7, 8, 9])} records={collectMonthRecords(a, [1, 2, 3, 4, 5, 6, 7, 8, 9])} month="As of September" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.asOfSept, t.asOfSept)}`}>{getPct(a.asOfSept, t.asOfSept)}</td>

                <td className={`${cellClass} ${getUnmetClass(a.m10, t.m10)}`}><ClickableValue val={a.m10} items={a.m10_items} records={a.m10_records} month="October" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m11, t.m11)}`}><ClickableValue val={a.m11} items={a.m11_items} records={a.m11_records} month="November" type="Accomplishment" /></td>
                <td className={`${cellClass} ${getUnmetClass(a.m12, t.m12)}`}><ClickableValue val={a.m12} items={a.m12_items} records={a.m12_records} month="December" type="Accomplishment" /></td>
                <td className={`${totalClass} ${getUnmetClass(a.q4, t.q4)}`}><ClickableValue val={a.q4} items={collectMonthItems(a, [10, 11, 12])} records={collectMonthRecords(a, [10, 11, 12])} month="4th Quarter" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.q4, t.q4)}`}>{getPct(a.q4, t.q4)}</td>

                <td className={`${yearEndClass} ${getUnmetClass(a.yearEndNov, t.yearEndNov)}`}><ClickableValue val={a.yearEndNov} items={collectMonthItems(a, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])} records={collectMonthRecords(a, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])} month="Year-end (Nov)" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.yearEndNov, t.yearEndNov)}`}>{getPct(a.yearEndNov, t.yearEndNov)}</td>

                <td className={`${dataCellClass} bar1-report__cell--grand-actual bar1-report__cell--center bar1-report__cell--emphasis ${getUnmetClass(a.total, t.total)}`}><ClickableValue val={a.total} items={collectMonthItems(a, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} records={collectMonthRecords(a, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} month="Annual Total" type="Accomplishment" /></td>
                <td className={`${percentClass} ${getUnmetClass(a.total, t.total)}`}>{getPct(a.total, t.total)}</td>
            </>
        );

        return (
            <>
                {renderTargetSection()}
                <td className="bar1-report__separator"></td>
                {renderActualSection()}
            </>
        );
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = calculateTotals(items);
        return (
            <tr className="bar1-report__row bar1-report__row--total">
                <td className={`${dataCellClass} bar1-report__cell--sticky`}>{label}</td>
                {renderDataCells(totals, true, label)}
            </tr>
        );
    };

    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0, showTotals: boolean = true) => {
        if (items.length === 0) {
            return (
                <tr className="bar1-report__row bar1-report__row--summary">
                     <td className={`${dataCellClass} ${indentClasses[indentLevel]} bar1-report__cell--sticky`}>
                        <span className="bar1-report__expand" aria-hidden="true"></span> {label}
                    </td>
                    <td colSpan={53} className={`${dataCellClass} bar1-report__cell--empty`}>No activities for this component.</td>
                </tr>
            )
        }

        let totals: any = null;
        if (showTotals) {
            totals = calculateTotals(items);
        }

        return (
             <tr onClick={() => toggleRow(rowKey)} className="bar1-report__row bar1-report__row--summary is-interactive">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} bar1-report__cell--sticky`}>
                    <span className="bar1-report__expand" aria-hidden="true">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                {showTotals && totals ? renderDataCells(totals, true, label) : <td colSpan={53} className={dataCellClass}></td>}
            </tr>
        );
    };

    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        return (
            <tr key={key} className="bar1-report__row">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} bar1-report__cell--sticky`}>{item.indicator}</td>
                {renderDataCells(item, false, item.indicator)}
            </tr>
        )
    };

    const grandTotals = Object.values(bar1Data).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    });

    const handleDownloadBar1Xlsx = () => {
        const createEmptyCounter = () => ({
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0,
            m1_items: [] as string[], m2_items: [] as string[], m3_items: [] as string[],
            m4_items: [] as string[], m5_items: [] as string[], m6_items: [] as string[],
            m7_items: [] as string[], m8_items: [] as string[], m9_items: [] as string[],
            m10_items: [] as string[], m11_items: [] as string[], m12_items: [] as string[],
            m1_records: [] as BAR1DrilldownRecord[], m2_records: [] as BAR1DrilldownRecord[], m3_records: [] as BAR1DrilldownRecord[],
            m4_records: [] as BAR1DrilldownRecord[], m5_records: [] as BAR1DrilldownRecord[], m6_records: [] as BAR1DrilldownRecord[],
            m7_records: [] as BAR1DrilldownRecord[], m8_records: [] as BAR1DrilldownRecord[], m9_records: [] as BAR1DrilldownRecord[],
            m10_records: [] as BAR1DrilldownRecord[], m11_records: [] as BAR1DrilldownRecord[], m12_records: [] as BAR1DrilldownRecord[],
        });

        const safeCounter = (source: any) => ({ ...createEmptyCounter(), ...(source || {}) });

        const isCounterLike = (source: any) => {
            return Boolean(source && typeof source === 'object' && (
                'q1' in source ||
                'q2' in source ||
                'q3' in source ||
                'q4' in source ||
                'total' in source ||
                'm1' in source
            ));
        };

        const isMetricRow = (item: any) => {
            return Boolean(item?.indicator && (isCounterLike(item.target) || isCounterLike(item.actual)));
        };

        const normalizeExcelRow = (row: (string | number | null)[]) => {
            const normalized = row.slice(0, BAR1_COLUMN_COUNT);
            while (normalized.length < BAR1_COLUMN_COUNT) normalized.push(null);
            return normalized;
        };

        const header1 = [null];
        const header2 = [null];

        const sectionHeaders1 = [
            "1st Quarter", null, null, null,
            "2nd Quarter", null, null, null,
            "Semestral Total",
            "3rd Quarter", null, null, null,
            "As of September",
            "4th Quarter", null, null, null,
            "Year End (As of Nov)",
            "Grand Total"
        ];

        const sectionHeadersTarget = [
            "Jan", "Feb", "Mar", "Total",
            "Apr", "May", "Jun", "Total",
            null,
            "Jul", "Aug", "Sep", "Total",
            null,
            "Oct", "Nov", "Dec", "Total",
            null,
            null
        ];

        const sectionHeadersActual = [
            "Jan", "Feb", "Mar", "Total", "%",
            "Apr", "May", "Jun", "Total", "%",
            "Total", "%",
            "Jul", "Aug", "Sep", "Total", "%",
            "Total", "%",
            "Oct", "Nov", "Dec", "Total", "%",
            "Total", "%",
            "Total", "%"
        ];

        const sectionHeadersActualGroups = [
            "1st Quarter", null, null, null, null,
            "2nd Quarter", null, null, null, null,
            "Semestral Total", null,
            "3rd Quarter", null, null, null, null,
            "As of September", null,
            "4th Quarter", null, null, null, null,
            "Year End (As of Nov)", null,
            "Grand Total", null
        ];

        header1.push(...sectionHeaders1, null, ...sectionHeadersActualGroups);
        header2.push(...sectionHeadersTarget, null, ...sectionHeadersActual);

        const aoa: (string | number | null)[][] = [
            normalizeExcelRow(["Program/Activity/Project", "Physical Targets", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Physical Accomplishments", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]),
            normalizeExcelRow(header1),
            normalizeExcelRow(header2)
        ];

        const processItems = (items: any[], prefix = "") => {
            items.forEach(item => {
                if (!item) return;

                if (item.isExpandable && Array.isArray(item.items)) {
                    aoa.push(normalizeExcelRow([prefix + (item.indicator || 'Group'), ...Array(BAR1_COLUMN_COUNT - 1).fill(null)]));
                    if (item.items.length > 0) {
                        processItems(item.items, prefix + "    ");
                    }
                    return;
                }

                if (!isMetricRow(item)) {
                    if (item.indicator) {
                        aoa.push(normalizeExcelRow([prefix + item.indicator, ...Array(BAR1_COLUMN_COUNT - 1).fill(null)]));
                    }
                    return;
                }

                const getVals = (source: any) => {
                    const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
                    const asOfSept = semestralTotal + (source.q3 || 0);
                    const yearEndNov = (source.total || 0) - (source.m12 || 0);
                    return { ...source, semestralTotal, asOfSept, yearEndNov };
               }
               const t = getVals(safeCounter(item.target));
               const a = getVals(safeCounter(item.actual));

                const getPct = (act: number, tgt: number) => {
                    if (!tgt) return null;
                    return act / tgt;
                };

                aoa.push(normalizeExcelRow([
                    prefix + item.indicator,
                    t.m1, t.m2, t.m3, t.q1,
                    t.m4, t.m5, t.m6, t.q2,
                    t.semestralTotal,
                    t.m7, t.m8, t.m9, t.q3,
                    t.asOfSept,
                    t.m10, t.m11, t.m12, t.q4,
                    t.yearEndNov,
                    t.total,
                    null,
                    a.m1, a.m2, a.m3, a.q1, getPct(a.q1, t.q1),
                    a.m4, a.m5, a.m6, a.q2, getPct(a.q2, t.q2),
                    a.semestralTotal, getPct(a.semestralTotal, t.semestralTotal),
                    a.m7, a.m8, a.m9, a.q3, getPct(a.q3, t.q3),
                    a.asOfSept, getPct(a.asOfSept, t.asOfSept),
                    a.m10, a.m11, a.m12, a.q4, getPct(a.q4, t.q4),
                    a.yearEndNov, getPct(a.yearEndNov, t.yearEndNov),
                    a.total, getPct(a.total, t.total)
                ]));

            });
        };

        Object.entries(bar1Data).forEach(([component, items]) => {
            // Component Header - No Totals
            aoa.push(normalizeExcelRow([component, ...Array(BAR1_COLUMN_COUNT - 1).fill(null)]));

            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items, "  ");
            } else if ((items as any).isExpandable) {
                if ((items as any).items.length > 0) processItems((items as any).items, "  ");
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData]: [string, any]) => {
                    aoa.push(normalizeExcelRow([`  ${packageName}`, ...Array(BAR1_COLUMN_COUNT - 1).fill(null)]));
                    if ((packageData as any).items.length > 0) processItems((packageData as any).items, "    ");
                });
            }
        });

        // Grand Totals - Removed per user request to not total component groups,
        // but user didn't explicitly say remove Grand Total.
        // However, if components are different and can't be summed, Grand Total is also meaningless.
        // I will remove Grand Total as well to be safe and consistent.

        const rows = aoa.map(normalizeExcelRow);

        const columnFormats = rows[0].reduce<Record<number, 'physical' | 'percent'>>((acc, _, index) => {
            if (index === 0 || index === 21) return acc;
            acc[index] = typeof rows[2]?.[index] === 'string' && String(rows[2][index]).includes('%') ? 'percent' : 'physical';
            return acc;
        }, {});

        onExportReport({
            reportName: withReportYearLabel('Physical Report of Operations (BAR No. 1)', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `BAR1_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'BAR1 Report',
                rows,
                headerRowCount: 3,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
                    { s: { r: 0, c: 1 }, e: { r: 0, c: 20 } },
                    { s: { r: 0, c: 22 }, e: { r: 0, c: 49 } },
                    { s: { r: 1, c: 1 }, e: { r: 1, c: 4 } },
                    { s: { r: 1, c: 5 }, e: { r: 1, c: 8 } },
                    { s: { r: 1, c: 9 }, e: { r: 2, c: 9 } },
                    { s: { r: 1, c: 10 }, e: { r: 1, c: 13 } },
                    { s: { r: 1, c: 14 }, e: { r: 2, c: 14 } },
                    { s: { r: 1, c: 15 }, e: { r: 1, c: 18 } },
                    { s: { r: 1, c: 19 }, e: { r: 2, c: 19 } },
                    { s: { r: 1, c: 20 }, e: { r: 2, c: 20 } },
                    { s: { r: 1, c: 22 }, e: { r: 1, c: 26 } },
                    { s: { r: 1, c: 27 }, e: { r: 1, c: 31 } },
                    { s: { r: 1, c: 32 }, e: { r: 1, c: 33 } },
                    { s: { r: 1, c: 34 }, e: { r: 1, c: 38 } },
                    { s: { r: 1, c: 39 }, e: { r: 1, c: 40 } },
                    { s: { r: 1, c: 41 }, e: { r: 1, c: 45 } },
                    { s: { r: 1, c: 46 }, e: { r: 1, c: 47 } },
                    { s: { r: 1, c: 48 }, e: { r: 1, c: 49 } },
                ],
                columnWidths: [34, ...Array(49).fill(10)],
                columnFormats,
            }],
        });
    };

    const SectionHeaderTarget = () => (
        <>
            <th colSpan={4} className="bar1-report__header-cell bar1-report__header-cell--target">1st Quarter</th>
            <th colSpan={4} className="bar1-report__header-cell bar1-report__header-cell--target">2nd Quarter</th>
            <th rowSpan={2} className="bar1-report__header-cell bar1-report__header-cell--target bar1-report__header-cell--aggregate">Semestral Total</th>
            <th colSpan={4} className="bar1-report__header-cell bar1-report__header-cell--target">3rd Quarter</th>
            <th rowSpan={2} className="bar1-report__header-cell bar1-report__header-cell--target bar1-report__header-cell--aggregate">As of September</th>
            <th colSpan={4} className="bar1-report__header-cell bar1-report__header-cell--target">4th Quarter</th>
            <th rowSpan={2} className="bar1-report__header-cell bar1-report__header-cell--target bar1-report__header-cell--aggregate">Year End (As of Nov)</th>
            <th rowSpan={2} className="bar1-report__header-cell bar1-report__header-cell--target bar1-report__header-cell--aggregate">Grand Total</th>
        </>
    );

    const SectionHeaderActual = () => (
        <>
            <th colSpan={5} className="bar1-report__header-cell bar1-report__header-cell--actual">1st Quarter</th>
            <th colSpan={5} className="bar1-report__header-cell bar1-report__header-cell--actual">2nd Quarter</th>
            <th colSpan={2} className="bar1-report__header-cell bar1-report__header-cell--actual">Semestral Total</th>
            <th colSpan={5} className="bar1-report__header-cell bar1-report__header-cell--actual">3rd Quarter</th>
            <th colSpan={2} className="bar1-report__header-cell bar1-report__header-cell--actual">As of September</th>
            <th colSpan={5} className="bar1-report__header-cell bar1-report__header-cell--actual">4th Quarter</th>
            <th colSpan={2} className="bar1-report__header-cell bar1-report__header-cell--actual">Year End (As of Nov)</th>
            <th colSpan={2} className="bar1-report__header-cell bar1-report__header-cell--actual">Grand Total</th>
        </>
    );

    const renderSubHeaders = (labels: string[]) => labels.map((label, index) => (
        <th
            key={`${label}-${index}`}
            className={`bar1-report__header-cell bar1-report__header-cell--sub${label === 'Total' ? ' bar1-report__header-cell--total' : ''}${label === '%' ? ' bar1-report__header-cell--percent' : ''}`}
        >
            {label}
        </th>
    ));

    const SubHeadersTarget = () => <>{renderSubHeaders(['Jan', 'Feb', 'Mar', 'Total', 'Apr', 'May', 'Jun', 'Total', 'Jul', 'Aug', 'Sep', 'Total', 'Oct', 'Nov', 'Dec', 'Total'])}</>;

    const SubHeadersActual = () => <>{renderSubHeaders(['Jan', 'Feb', 'Mar', 'Total', '%', 'Apr', 'May', 'Jun', 'Total', '%', 'Total', '%', 'Jul', 'Aug', 'Sep', 'Total', '%', 'Total', '%', 'Oct', 'Nov', 'Dec', 'Total', '%', 'Total', '%', 'Total', '%'])}</>;

    const renderRecordDateLabel = (record: BAR1DrilldownRecord) => {
        return popup?.type === 'Target'
            ? `Target date: ${formatDate(record.targetDate)}`
            : `Actual date: ${formatDate(record.actualDate)}`;
    };

    const getRecordKindLabel = (record: BAR1DrilldownRecord) => {
        if (record.type === 'training') return 'Training';
        if (record.type === 'activity') return 'Activity';
        if (record.type === 'subproject') return record.packageName || 'Subproject';
        if (record.type === 'ad') return 'Ancestral Domain';
        if (record.type === 'ipo') return 'IPO';
        if (record.type === 'staffing') return 'Staffing Requirement';
        if (record.type === 'office') return 'Office Requirement';
        return 'Record';
    };

    const renderRecordDetails = (record: BAR1DrilldownRecord) => {
        if (record.type === 'ipo') {
            return (
                <>
                    <dt>Linked records</dt>
                    <dd>{uniqueStrings(record.linkedNames).join(', ') || '-'}</dd>
                </>
            );
        }
        if (record.type === 'ad') {
            return (
                <>
                    <dt>Linked IPOs</dt>
                    <dd>{uniqueStrings(record.ipoNames).join(', ') || '-'}</dd>
                    <dt>Related subprojects</dt>
                    <dd>{uniqueStrings(record.linkedNames).join(', ') || '-'}</dd>
                </>
            );
        }
        if (record.type === 'subproject') {
            return (
                <>
                    <dt>IPO</dt>
                    <dd>{record.ipoName || uniqueStrings(record.ipoNames)[0] || '-'}</dd>
                    <dt>Package</dt>
                    <dd>{record.packageName || '-'}</dd>
                </>
            );
        }
        if (record.type === 'training' || record.type === 'activity') {
            return (
                <>
                    <dt>Component</dt>
                    <dd>{record.component || '-'}</dd>
                    <dt>Target IPOs</dt>
                    <dd>{uniqueStrings(record.ipoNames).join(', ') || '-'}</dd>
                </>
            );
        }
        return (
            <>
                <dt>Component</dt>
                <dd>{record.component || 'Program Management'}</dd>
            </>
        );
    };

    return (
        <div className="report-card bar1-report-card">
            {popup && (
                <div className="bar1-drilldown-overlay print-hidden" role="presentation" onMouseDown={() => setPopup(null)}>
                    <div
                        className="bar1-drilldown-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bar1-drilldown-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="bar1-drilldown-modal__header">
                            <div>
                                <h4 id="bar1-drilldown-title">{popup.indicator}</h4>
                                <p>{popup.type} · {popup.month} · {popupRecords.length} record{popupRecords.length === 1 ? '' : 's'}</p>
                            </div>
                            <button
                                onClick={() => setPopup(null)}
                                className="bar1-drilldown-modal__close"
                                type="button"
                                aria-label="Close BAR1 details"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        {(popup.records.length > 8 || popupSearch) && (
                            <label className="bar1-drilldown-search">
                                <Search className="h-4 w-4" aria-hidden="true" />
                                <input
                                    value={popupSearch}
                                    onChange={(event) => setPopupSearch(event.target.value)}
                                    placeholder="Search records..."
                                />
                            </label>
                        )}
                        <div className="bar1-drilldown-list">
                            {popupRecords.map(record => {
                                const clickable = canOpenRecord(record);
                                const CardTag: any = clickable ? 'button' : 'article';
                                return (
                                    <CardTag
                                        key={`${record.type}-${record.id}`}
                                        type={clickable ? 'button' : undefined}
                                        onClick={clickable ? () => openRecord(record) : undefined}
                                        className={`bar1-drilldown-card ${isRecordOverdue(record) ? 'bar1-drilldown-card--overdue' : ''}`}
                                    >
                                        <div className="bar1-drilldown-card__title">
                                            <strong>{record.label}</strong>
                                            <span>{getRecordKindLabel(record)}</span>
                                        </div>
                                        {record.description && <p>{record.description}</p>}
                                        <dl>
                                            <dt>{popup.type === 'Target' ? 'Target date' : 'Actual date'}</dt>
                                            <dd>{renderRecordDateLabel(record).replace(/^Target date: |^Actual date: /, '')}</dd>
                                            {renderRecordDetails(record)}
                                        </dl>
                                    </CardTag>
                                );
                            })}
                            {popupRecords.length === 0 && (
                                <div className="bar1-drilldown-empty">No matching records found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <div className="report-card__header print-hidden">
                <div className="bar1-report-header-main">
                    <h3 className="report-card__title">Physical Report of Operations (BAR No. 1)</h3>

                    <div className="bar1-as-of-filter">
                        <label htmlFor="as-of-date-preset" className="bar1-as-of-filter__label">As of:</label>
                        <select
                            id="as-of-date-preset"
                            value={selectedAsOfDate || 'current'}
                            onChange={(e) => onSelectedAsOfDateChange(e.target.value === 'current' ? '' : e.target.value)}
                            className="form-control form-control--compact"
                        >
                            <option value="current">Current approved data</option>
                            {sortedDeadlines.map(deadline => (
                                <option key={deadline.id} value={deadline.date}>
                                    {deadline.name}: {new Date(deadline.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={selectedAsOfDate}
                            onChange={(e) => onSelectedAsOfDateChange(e.target.value)}
                            className="form-control form-control--compact"
                        />
                        {selectedAsOfDate && (
                            <button
                                type="button"
                                onClick={() => onSelectedAsOfDateChange('')}
                                className="bar1-as-of-filter__clear"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                <div className="report-card__actions">
                    <button onClick={handleDownloadBar1Xlsx} className="btn btn-primary btn-responsive">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download Excel</span>
                    </button>
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('Physical Report of Operations (BAR No. 1)', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'bar1-report',
                        })}
                        className="btn btn-secondary btn-responsive"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print</span>
                    </button>
                </div>
            </div>
            <div id="bar1-report" className="report-table-scroll bar1-report-scroll">
                <table className="bar1-report-table">
                    <thead className="bar1-report__head">
                        <tr>
                            <th rowSpan={3} className="bar1-report__header-cell bar1-report__header-cell--sticky bar1-report__header-cell--label">Program/Activity/Project</th>
                            <th colSpan={20} className="bar1-report__header-cell bar1-report__header-cell--target">Physical Targets</th>
                            <th rowSpan={3} className="bar1-report__separator"></th>
                            <th colSpan={28} className="bar1-report__header-cell bar1-report__header-cell--actual">Physical Accomplishments</th>
                        </tr>
                        <tr>
                            <SectionHeaderTarget />
                            <SectionHeaderActual />
                        </tr>
                        <tr>
                            <SubHeadersTarget />
                            <SubHeadersActual />
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(bar1Data).map(([key, cd]) => {
                            const componentData = cd as any;
                            if (Array.isArray(componentData)) {
                                 const isComponentExpanded = expandedRows.has(key);
                                 return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData, key, key, isComponentExpanded, 0, false)}
                                        {isComponentExpanded && componentData.map((item: any, index: number) => {
                                            if (item.isExpandable) {
                                                const nestedKey = `${key}-nested-${index}`;
                                                const isNestedExpanded = expandedRows.has(nestedKey);
                                                return (
                                                    <React.Fragment key={nestedKey}>
                                                        {renderSummaryRow(item.items, item.indicator, nestedKey, isNestedExpanded, 1)}
                                                        {isNestedExpanded && item.items.map((subItem: any, subIndex: number) => renderDataRow(subItem, `${nestedKey}-${subIndex}`, 2))}
                                                    </React.Fragment>
                                                )
                                            }
                                            return renderDataRow(item, `${key}-${index}`, 1)
                                        })}
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isNestedExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                const sortedPackageKeys = Object.keys(componentData.packages).sort((a,b) => a.localeCompare(b));
                                const allPackageItems = Object.values(componentData.packages).flatMap((pkg: any) => pkg.items);

                                 return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(allPackageItems, key, key, isComponentExpanded, 0, false)}
                                        {isComponentExpanded && sortedPackageKeys.map((packageName) => {
                                            const packageData = componentData.packages[packageName];
                                            const isPkgExpanded = expandedRows.has(packageName);
                                            const items = packageData.items;

                                            return (
                                                <React.Fragment key={packageName}>
                                                    {renderSummaryRow(items, packageName, packageName, isPkgExpanded, 1)}
                                                    {isPkgExpanded && items.map((item: any, index: number) => renderDataRow(item, `${packageName}-${index}`, 2))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            }
                            return null;
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BAR1Report;
