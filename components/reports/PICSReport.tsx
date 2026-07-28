// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Download, Printer, Search, X } from 'lucide-react';
import { Subproject, Training, OtherActivity, IPO, ouToRegionMap } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { ReportExcelRequest, ReportPrintRequest, countPhysicalTarget, isParentRealignmentOrSavings, withReportYearLabel } from './ReportUtils';
import {
    getActivityDisplayTitle,
    getActivityIpoIds,
    getActivityIpoNames,
    getSubprojectIpo,
    getSubprojectIpoId,
    getSubprojectIpoName,
} from '../../lib/entityIdentity';

interface PICSReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training | OtherActivity) => void;
    onOpenIpoListForAncestralDomain: (adNo: string) => void;
}

type PicsTierScope = 'total' | 'tier1' | 'tier2';
type PicsDetailType = 'subprojects' | 'activities' | 'ads';

interface PicsAdDetail {
    adNo: string;
    region: string;
    province: string;
    ipoNames: string[];
    tier1IpoNames: string[];
    tier2IpoNames: string[];
}

interface PicsRow {
    region: string;
    province: string;
    indicator: string;
    detailType: PicsDetailType;
    totalTarget: number;
    ipoIds: Set<number>;
    maleTarget: number;
    femaleTarget: number;
    unidentifiedTarget: number;
    totalParticipants: number;
    tier1TotalTarget: number;
    tier1IpoIds: Set<number>;
    tier1MaleTarget: number;
    tier1FemaleTarget: number;
    tier1UnidentifiedTarget: number;
    tier1TotalParticipants: number;
    tier2TotalTarget: number;
    tier2IpoIds: Set<number>;
    tier2MaleTarget: number;
    tier2FemaleTarget: number;
    tier2UnidentifiedTarget: number;
    tier2TotalParticipants: number;
    subprojects: Subproject[];
    activities: (Training | OtherActivity)[];
    ads: PicsAdDetail[];
}

interface MutableAdTracker {
    all: Set<string>;
    t1: Set<string>;
    t2: Set<string>;
    details: Map<string, {
        adNo: string;
        region: string;
        province: string;
        ipoNames: Set<string>;
        tier1IpoNames: Set<string>;
        tier2IpoNames: Set<string>;
    }>;
}

const createPicsRow = (region: string, province: string, indicator: string, detailType: PicsDetailType): PicsRow => ({
    region,
    province,
    indicator,
    detailType,
    totalTarget: 0,
    ipoIds: new Set<number>(),
    maleTarget: 0,
    femaleTarget: 0,
    unidentifiedTarget: 0,
    totalParticipants: 0,
    tier1TotalTarget: 0,
    tier1IpoIds: new Set<number>(),
    tier1MaleTarget: 0,
    tier1FemaleTarget: 0,
    tier1UnidentifiedTarget: 0,
    tier1TotalParticipants: 0,
    tier2TotalTarget: 0,
    tier2IpoIds: new Set<number>(),
    tier2MaleTarget: 0,
    tier2FemaleTarget: 0,
    tier2UnidentifiedTarget: 0,
    tier2TotalParticipants: 0,
    subprojects: [],
    activities: [],
    ads: [],
});

const getScopeLabel = (scope: PicsTierScope) => scope === 'tier1' ? 'Tier 1' : scope === 'tier2' ? 'Tier 2' : 'Total';

const getRecordBadge = (record: { status?: string; isRealignment?: boolean; isSavings?: boolean }) => {
    if (record.status === 'Cancelled') return 'Cancelled';
    if (record.isRealignment) return 'Realignment';
    if (record.isSavings) return 'Savings';
    return '';
};

const PICSReport: React.FC<PICSReportProps> = ({
    data,
    selectedYear,
    selectedReportingYear,
    selectedOu,
    onPrintReport,
    onExportReport,
    onSelectSubproject,
    onSelectActivity,
    onOpenIpoListForAncestralDomain
}) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [drilldown, setDrilldown] = useState<{ row: PicsRow; scope: PicsTierScope } | null>(null);
    const [drilldownSearch, setDrilldownSearch] = useState('');

    const toggle = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const picsData = useMemo(() => {
        const aggregator = new Map<string, PicsRow>();
        const getKey = (r:string, p:string, i:string) => `${r}|${p}|${i}`;
        const getOrCreateRow = (region: string, province: string, indicator: string, detailType: PicsDetailType) => {
            const key = getKey(region, province, indicator);
            if (!aggregator.has(key)) aggregator.set(key, createPicsRow(region, province, indicator, detailType));
            return aggregator.get(key)!;
        };
        const adTracker = new Map<string, MutableAdTracker>();
        
        data.subprojects.forEach(sp => {
            const region = ouToRegionMap[sp.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return;
            const { province } = parseLocation(sp.location); 
            const indicator = `${sp.packageType} Subprojects provided`; 
            const provinceName = province || 'Unspecified';
            const entry = getOrCreateRow(region, provinceName, indicator, 'subprojects');
            const targetCount = countPhysicalTarget(sp, 1);
            entry.totalTarget += targetCount;
            if (targetCount > 0) {
                entry.subprojects.push(sp);
                const ipoId = getSubprojectIpoId(sp, data.ipos);
                if (ipoId) entry.ipoIds.add(Number(ipoId));
                if (sp.tier === 'Tier 1') {
                    entry.tier1TotalTarget += 1;
                    if (ipoId) entry.tier1IpoIds.add(Number(ipoId));
                } else if (sp.tier === 'Tier 2') {
                    entry.tier2TotalTarget += 1;
                    if (ipoId) entry.tier2IpoIds.add(Number(ipoId));
                }
            }
            
            const ipo = getSubprojectIpo(sp, data.ipos);
            if (targetCount > 0 && ipo && ipo.ancestralDomainNo) { 
                const locKey = `${region}|${provinceName}`;
                if (!adTracker.has(locKey)) adTracker.set(locKey, { all: new Set(), t1: new Set(), t2: new Set(), details: new Map() });
                const tracker = adTracker.get(locKey); 
                if (!tracker) return;
                const adNo = ipo.ancestralDomainNo;
                tracker.all.add(adNo);
                if (!tracker.details.has(adNo)) {
                    tracker.details.set(adNo, {
                        adNo,
                        region,
                        province: provinceName,
                        ipoNames: new Set<string>(),
                        tier1IpoNames: new Set<string>(),
                        tier2IpoNames: new Set<string>(),
                    });
                }
                const adDetail = tracker.details.get(adNo)!;
                adDetail.ipoNames.add(ipo.name);
                if (sp.tier === 'Tier 1') {
                    tracker.t1.add(adNo);
                    adDetail.tier1IpoNames.add(ipo.name);
                }
                if (sp.tier === 'Tier 2') {
                    tracker.t2.add(adNo);
                    adDetail.tier2IpoNames.add(ipo.name);
                }
            }
        });

        adTracker.forEach((tracker, locKey) => { 
            const [region, province] = locKey.split('|'); 
            const indicator = "Ancestral Domains covered"; 
            const entry = getOrCreateRow(region, province, indicator, 'ads');
            entry.totalTarget = tracker.all.size; 
            entry.tier1TotalTarget = tracker.t1.size; 
            entry.tier2TotalTarget = tracker.t2.size;
            entry.ads = Array.from(tracker.details.values())
                .map(detail => ({
                    adNo: detail.adNo,
                    region: detail.region,
                    province: detail.province,
                    ipoNames: Array.from(detail.ipoNames).sort(),
                    tier1IpoNames: Array.from(detail.tier1IpoNames).sort(),
                    tier2IpoNames: Array.from(detail.tier2IpoNames).sort(),
                }))
                .sort((a, b) => a.adNo.localeCompare(b.adNo));
        });

        data.trainings.forEach(activity => { 
            if (activity.component === 'Program Management') return; 
            const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return; 
            const { province } = parseLocation(activity.location); 
            const indicator = `${activity.component} Trainings conducted`; 
            const entry = getOrCreateRow(region, province || 'Unspecified', indicator, 'activities');
            if (!isParentRealignmentOrSavings(activity)) {
                entry.activities.push(activity);
                entry.totalTarget += 1; 
                const ipoIds = getActivityIpoIds(activity, data.ipos);
                ipoIds.forEach(ipoId => entry.ipoIds.add(ipoId));
                if (activity.tier === 'Tier 1') {
                    entry.tier1TotalTarget += 1;
                    ipoIds.forEach(ipoId => entry.tier1IpoIds.add(ipoId));
                } else if (activity.tier === 'Tier 2') {
                    entry.tier2TotalTarget += 1;
                    ipoIds.forEach(ipoId => entry.tier2IpoIds.add(ipoId));
                }
                entry.maleTarget += (activity.participantsMale || 0); 
                entry.femaleTarget += (activity.participantsFemale || 0); 
                entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); 
                if (activity.tier === 'Tier 1') { entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
                else if (activity.tier === 'Tier 2') { entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
            }
        });

        data.otherActivities.forEach(activity => { 
            if (activity.component === 'Program Management') return; 
            const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return; 
            const { province } = parseLocation(activity.location); 
            const indicator = `${getActivityDisplayTitle(activity)} conducted`;
            const entry = getOrCreateRow(region, province || 'Unspecified', indicator, 'activities');
            if (!isParentRealignmentOrSavings(activity)) {
                entry.activities.push(activity);
                entry.totalTarget += 1; 
                const ipoIds = getActivityIpoIds(activity, data.ipos);
                ipoIds.forEach(ipoId => entry.ipoIds.add(ipoId));
                if (activity.tier === 'Tier 1') {
                    entry.tier1TotalTarget += 1;
                    ipoIds.forEach(ipoId => entry.tier1IpoIds.add(ipoId));
                } else if (activity.tier === 'Tier 2') {
                    entry.tier2TotalTarget += 1;
                    ipoIds.forEach(ipoId => entry.tier2IpoIds.add(ipoId));
                }
                entry.maleTarget += (activity.participantsMale || 0); 
                entry.femaleTarget += (activity.participantsFemale || 0); 
                entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); 
                if (activity.tier === 'Tier 1') { entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
                else if (activity.tier === 'Tier 2') { entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
            }
        });

        return Array.from(aggregator.values()).sort((a:any, b:any) => { if (a.region !== b.region) return a.region.localeCompare(b.region); if (a.province !== b.province) return a.province.localeCompare(b.province); return a.indicator.localeCompare(b.indicator); });
    }, [data]);

    const calculateSummary = (items: any[]) => {
        const summary = {
            totalTarget: 0,
            maleTarget: 0,
            femaleTarget: 0,
            unidentifiedTarget: 0,
            totalParticipants: 0,
            allIpoIds: new Set<number>(),
            tier1TotalTarget: 0,
            tier1MaleTarget: 0,
            tier1FemaleTarget: 0,
            tier1UnidentifiedTarget: 0,
            tier1TotalParticipants: 0,
            tier1AllIpoIds: new Set<number>(),
            tier2TotalTarget: 0,
            tier2MaleTarget: 0,
            tier2FemaleTarget: 0,
            tier2UnidentifiedTarget: 0,
            tier2TotalParticipants: 0,
            tier2AllIpoIds: new Set<number>(),
        };
        items.forEach(item => {
            summary.totalTarget += item.totalTarget;
            summary.maleTarget += item.maleTarget;
            summary.femaleTarget += item.femaleTarget;
            summary.unidentifiedTarget += item.unidentifiedTarget;
            summary.totalParticipants += item.totalParticipants;
            if (item.ipoIds) {
                item.ipoIds.forEach((id: number) => summary.allIpoIds.add(id));
            }

            summary.tier1TotalTarget += item.tier1TotalTarget;
            summary.tier1MaleTarget += item.tier1MaleTarget;
            summary.tier1FemaleTarget += item.tier1FemaleTarget;
            summary.tier1UnidentifiedTarget += item.tier1UnidentifiedTarget;
            summary.tier1TotalParticipants += item.tier1TotalParticipants;
            if (item.tier1IpoIds) item.tier1IpoIds.forEach((id: number) => summary.tier1AllIpoIds.add(id));

            summary.tier2TotalTarget += item.tier2TotalTarget;
            summary.tier2MaleTarget += item.tier2MaleTarget;
            summary.tier2FemaleTarget += item.tier2FemaleTarget;
            summary.tier2UnidentifiedTarget += item.tier2UnidentifiedTarget;
            summary.tier2TotalParticipants += item.tier2TotalParticipants;
            if (item.tier2IpoIds) item.tier2IpoIds.forEach((id: number) => summary.tier2AllIpoIds.add(id));
        });
        return {
            ...summary,
            totalGroup: summary.allIpoIds.size,
            tier1TotalGroup: summary.tier1AllIpoIds.size,
            tier2TotalGroup: summary.tier2AllIpoIds.size,
        };
    };

    const groupedData = useMemo<Record<string, { provinces: Record<string, { items: any[] }> }>>(() => {
        const regions: Record<string, { provinces: Record<string, { items: any[] }> }> = {};
        picsData.forEach(item => {
            if (!regions[item.region]) regions[item.region] = { provinces: {} };
            if (!regions[item.region].provinces[item.province]) regions[item.region].provinces[item.province] = { items: [] };
            regions[item.region].provinces[item.province].items.push(item);
        });
        return regions;
    }, [picsData]);

    const sortedRegions = Object.keys(groupedData).sort();
    const grandTotalSummary = calculateSummary(picsData);

    const dataCellClass = "pics-report__cell";
    const headerCellClass = "pics-report__head-cell text-center align-middle";
    const groupRowClass = "pics-report__row pics-report__row--summary cursor-pointer";

    const handleDownloadPicsXlsx = () => {
        const aoa: (string | number | null)[][] = [
            [
                "OU/Location", "Province", "Performance Indicator", "Unit of Measure",
                "TOTAL", null, null, null, null, null,
                "TIER 1", null, null, null, null, null,
                "TIER 2", null, null, null, null, null
            ],
            [
                null, null, null, null,
                "Target", "Group (IPOs)", "Male", "Female", "Unidentified", "Participants",
                "Target", "Group", "Male", "Female", "Unidentified", "Participants",
                "Target", "Group", "Male", "Female", "Unidentified", "Participants"
            ]
        ];

        picsData.forEach(row => {
            aoa.push([
                row.region,
                row.province,
                row.indicator,
                "number",
                row.totalTarget, 
                row.ipoIds.size,
                row.maleTarget, 
                row.femaleTarget, 
                null, 
                row.totalParticipants,
                row.tier1TotalTarget,
                row.tier1IpoIds.size,
                row.tier1MaleTarget,
                row.tier1FemaleTarget,
                null,
                row.tier1TotalParticipants,
                row.tier2TotalTarget,
                row.tier2IpoIds.size,
                row.tier2MaleTarget,
                row.tier2FemaleTarget,
                null,
                row.tier2TotalParticipants
            ]);
        });

        onExportReport({
            reportName: withReportYearLabel('PICS Report', selectedYear, selectedReportingYear),
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `PICS_Report_FY${selectedYear}_RY${selectedReportingYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'PICS Report',
                rows: aoa,
                headerRowCount: 2,
                merges: [
                    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
                    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
                    { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
                    { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
                    { s: { r: 0, c: 4 }, e: { r: 0, c: 9 } },
                    { s: { r: 0, c: 10 }, e: { r: 0, c: 15 } },
                    { s: { r: 0, c: 16 }, e: { r: 0, c: 21 } },
                ],
                columnWidths: [20, 22, 42, 14, ...Array(18).fill(14)],
                columnFormats: Object.fromEntries(Array.from({ length: 18 }, (_, index) => [index + 4, 'physical'])),
            }],
        });
    };

    const openDrilldown = (row: PicsRow, scope: PicsTierScope) => {
        setDrilldown({ row, scope });
        setDrilldownSearch('');
    };

    const getTargetForScope = (row: PicsRow, scope: PicsTierScope) => {
        if (scope === 'tier1') return row.tier1TotalTarget;
        if (scope === 'tier2') return row.tier2TotalTarget;
        return row.totalTarget;
    };

    const getScopedSubprojects = (row: PicsRow, scope: PicsTierScope) => {
        return row.subprojects.filter(sp => scope === 'total' || sp.tier === getScopeLabel(scope));
    };

    const getScopedActivities = (row: PicsRow, scope: PicsTierScope) => {
        return row.activities.filter(activity => scope === 'total' || activity.tier === getScopeLabel(scope));
    };

    const getScopedAds = (row: PicsRow, scope: PicsTierScope) => {
        return row.ads
            .map(ad => ({
                ...ad,
                scopedIpoNames: scope === 'tier1' ? ad.tier1IpoNames : scope === 'tier2' ? ad.tier2IpoNames : ad.ipoNames,
            }))
            .filter(ad => ad.scopedIpoNames.length > 0);
    };

    const renderTargetButton = (row: PicsRow, scope: PicsTierScope) => {
        const value = getTargetForScope(row, scope);
        if (!value) return value;
        return (
            <button
                type="button"
                className="pics-report__target-button"
                onClick={() => openDrilldown(row, scope)}
                title={`View ${getScopeLabel(scope)} target records`}
                aria-label={`View ${getScopeLabel(scope)} target records for ${row.indicator} in ${row.province}`}
            >
                {value}
            </button>
        );
    };

    const drilldownContent = useMemo(() => {
        if (!drilldown) return null;
        const term = drilldownSearch.trim().toLowerCase();
        const row = drilldown.row;
        if (row.detailType === 'subprojects') {
            const records = getScopedSubprojects(row, drilldown.scope)
                .filter(sp => {
                    if (!term) return true;
                    return [
                        sp.name,
                        sp.packageType,
                        getSubprojectIpoName(sp, data.ipos),
                        sp.remarks,
                        sp.estimatedCompletionDate,
                        sp.actualCompletionDate,
                    ].filter(Boolean).join(' ').toLowerCase().includes(term);
                });
            return { type: 'subprojects' as const, records };
        }
        if (row.detailType === 'activities') {
            const records = getScopedActivities(row, drilldown.scope)
                .filter(activity => {
                    if (!term) return true;
                    return [
                        getActivityDisplayTitle(activity),
                        activity.component,
                        activity.type,
                        activity.description,
                        ...getActivityIpoNames(activity, data.ipos),
                    ].filter(Boolean).join(' ').toLowerCase().includes(term);
                });
            return { type: 'activities' as const, records };
        }
        const records = getScopedAds(row, drilldown.scope)
            .filter(ad => {
                if (!term) return true;
                return [ad.adNo, ad.region, ad.province, ...ad.scopedIpoNames].join(' ').toLowerCase().includes(term);
            });
        return { type: 'ads' as const, records };
    }, [drilldown, drilldownSearch]);

    const drilldownCount = drilldown
        ? (drilldown.row.detailType === 'subprojects'
            ? getScopedSubprojects(drilldown.row, drilldown.scope).length
            : drilldown.row.detailType === 'activities'
                ? getScopedActivities(drilldown.row, drilldown.scope).length
                : getScopedAds(drilldown.row, drilldown.scope).length)
        : 0;

    return (
        <div className="report-card pics-report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">PICS Report</h3>
                <div className="report-card__actions">
                    <button
                        onClick={() => onPrintReport({
                            reportName: withReportYearLabel('PICS Report', selectedYear, selectedReportingYear),
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'pics-report-table',
                        })}
                        className="btn btn-secondary btn-responsive"
                        aria-label="Print report"
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button onClick={handleDownloadPicsXlsx} className="btn btn-primary btn-responsive" aria-label="Download XLSX">
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Download XLSX</span>
                    </button>
                </div>
            </div>
            <div id="pics-report-table" className="report-table-scroll pics-report-scroll">
                <table className="pics-report-table">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th rowSpan={2} className={`${headerCellClass} text-left`}>Location / Performance Indicator</th>
                            <th rowSpan={2} className={headerCellClass}>Unit of Measure</th>
                            <th colSpan={6} className={headerCellClass}>TOTAL</th>
                            <th colSpan={6} className={headerCellClass}>TIER 1</th>
                            <th colSpan={6} className={headerCellClass}>TIER 2</th>
                        </tr>
                        <tr>
                            {/* Total Sub-columns */}
                            <th className={headerCellClass}>Target</th>
                            <th className={headerCellClass}>Group (IPOs)</th>
                            <th className={headerCellClass}>Male</th>
                            <th className={headerCellClass}>Female</th>
                            <th className={headerCellClass}>Unidentified</th>
                            <th className={headerCellClass}>Participants</th>
                            
                            {/* Tier 1 Sub-columns */}
                            <th className={headerCellClass}>Target</th>
                            <th className={headerCellClass}>Group</th>
                            <th className={headerCellClass}>Male</th>
                            <th className={headerCellClass}>Female</th>
                            <th className={headerCellClass}>Unidentified</th>
                            <th className={headerCellClass}>Participants</th>

                            {/* Tier 2 Sub-columns */}
                            <th className={headerCellClass}>Target</th>
                            <th className={headerCellClass}>Group</th>
                            <th className={headerCellClass}>Male</th>
                            <th className={headerCellClass}>Female</th>
                            <th className={headerCellClass}>Unidentified</th>
                            <th className={headerCellClass}>Participants</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRegions.map(region => {
                            const regionData = groupedData[region];
                            const regionItems = Object.values(regionData.provinces).flatMap((p: any) => p.items);
                            const regionSummary = calculateSummary(regionItems);
                            const isRegionExpanded = expanded[region];

                            return (
                                <React.Fragment key={region}>
                                    <tr className={groupRowClass} onClick={() => toggle(region)}>
                                        <td className={`${dataCellClass} text-left`}>
                                            <span className="pics-report__expand" aria-hidden="true">{isRegionExpanded ? '−' : '+'}</span>
                                            {region}
                                        </td>
                                        <td className={`${dataCellClass} text-center`}>number</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.totalTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.totalGroup}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.maleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.femaleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.unidentifiedTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.totalParticipants}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalGroup}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1MaleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1FemaleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1UnidentifiedTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalParticipants}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalGroup}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2MaleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2FemaleTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2UnidentifiedTarget}</td>
                                        <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalParticipants}</td>
                                    </tr>
                                    {isRegionExpanded && Object.keys(regionData.provinces).sort().map(province => {
                                        const provinceItems = regionData.provinces[province].items;
                                        const provinceSummary = calculateSummary(provinceItems);
                                        const provinceKey = `${region}|${province}`;
                                        const isProvinceExpanded = expanded[provinceKey];

                                        return (
                                            <React.Fragment key={provinceKey}>
                                                <tr className={groupRowClass} onClick={() => toggle(provinceKey)}>
                                                    <td className={`${dataCellClass} text-left pl-6`}>
                                                        <span className="pics-report__expand" aria-hidden="true">{isProvinceExpanded ? '−' : '+'}</span>
                                                        {province}
                                                    </td>
                                                    <td className={`${dataCellClass} text-center`}>number</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.totalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.totalGroup}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.maleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.femaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.unidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.totalParticipants}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalGroup}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1MaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1FemaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1UnidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalParticipants}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalGroup}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2MaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2FemaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2UnidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalParticipants}</td>
                                                </tr>
                                                {isProvinceExpanded && provinceItems.map((item, idx) => (
                                                    <tr key={`${provinceKey}-${idx}`} className="pics-report__row">
                                                        <td className={`${dataCellClass} text-left pl-10`}>{item.indicator}</td>
                                                        <td className={`${dataCellClass} text-center`}>number</td>
                                                        <td className={`${dataCellClass} text-center`}>{renderTargetButton(item, 'total')}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.ipoIds.size}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.maleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.femaleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.unidentifiedTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.totalParticipants}</td>
                                                        <td className={`${dataCellClass} text-center`}>{renderTargetButton(item, 'tier1')}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier1IpoIds.size}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier1MaleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier1FemaleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier1UnidentifiedTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier1TotalParticipants}</td>
                                                        <td className={`${dataCellClass} text-center`}>{renderTargetButton(item, 'tier2')}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier2IpoIds.size}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier2MaleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier2FemaleTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier2UnidentifiedTarget}</td>
                                                        <td className={`${dataCellClass} text-center`}>{item.tier2TotalParticipants}</td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="pics-report__row pics-report__row--total">
                            <td className={`${dataCellClass} text-right`}>GRAND TOTAL</td>
                            <td className={`${dataCellClass} text-center`}>number</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalGroup}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.maleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.femaleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.unidentifiedTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalParticipants}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalGroup}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1MaleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1FemaleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1UnidentifiedTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalParticipants}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalGroup}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2MaleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2FemaleTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2UnidentifiedTarget}</td>
                            <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalParticipants}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {drilldown && drilldownContent && (
                <div className="pics-drilldown-overlay print-hidden" role="presentation" onMouseDown={() => setDrilldown(null)}>
                    <section
                        className="pics-drilldown-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="pics-drilldown-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="pics-drilldown-modal__header">
                            <div>
                                <h4 id="pics-drilldown-title">
                                    {drilldown.row.indicator} - {drilldown.row.province} ({getScopeLabel(drilldown.scope)})
                                </h4>
                                <p>
                                    {drilldownCount} target {drilldown.row.detailType === 'ads' ? 'record' : 'record'}{drilldownCount === 1 ? '' : 's'}
                                    {drilldown.row.detailType !== 'subprojects' && drilldown.row.detailType !== 'activities'
                                        ? ''
                                        : ` · ${drilldown.scope === 'tier1'
                                            ? drilldown.row.tier1IpoIds.size
                                            : drilldown.scope === 'tier2'
                                                ? drilldown.row.tier2IpoIds.size
                                                : drilldown.row.ipoIds.size} IPOs`}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="pics-drilldown-modal__close"
                                onClick={() => setDrilldown(null)}
                                aria-label="Close PICS target records"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {drilldownCount > 8 && (
                            <label className="pics-drilldown-search">
                                <Search size={16} />
                                <input
                                    type="search"
                                    value={drilldownSearch}
                                    onChange={(event) => setDrilldownSearch(event.target.value)}
                                    placeholder="Search target records..."
                                />
                            </label>
                        )}

                        <div className="pics-drilldown-list">
                            {drilldownContent.type === 'subprojects' && drilldownContent.records.map(sp => {
                                const badge = getRecordBadge(sp);
                                return (
                                    <button
                                        type="button"
                                        key={`sp-${sp.id}`}
                                        className="pics-drilldown-card"
                                        onClick={() => onSelectSubproject(sp)}
                                    >
                                        <div className="pics-drilldown-card__title">
                                            <strong>{sp.name}</strong>
                                            {badge && <span className={`status-badge status-badge--compact ${badge === 'Cancelled' ? 'status-badge--cancelled' : badge === 'Realignment' ? 'status-badge--orange' : 'status-badge--purple'}`}>{badge}</span>}
                                        </div>
                                        <p>{sp.remarks || 'No description provided.'}</p>
                                        <dl>
                                            <div><dt>Package</dt><dd>{sp.packageType || '-'}</dd></div>
                                            <div><dt>IPO</dt><dd>{getSubprojectIpoName(sp, data.ipos) || '-'}</dd></div>
                                            <div><dt>Target</dt><dd>{sp.estimatedCompletionDate || '-'}</dd></div>
                                            <div><dt>Completed</dt><dd>{sp.actualCompletionDate || '-'}</dd></div>
                                        </dl>
                                    </button>
                                );
                            })}

                            {drilldownContent.type === 'activities' && drilldownContent.records.map(activity => {
                                const badge = getRecordBadge(activity);
                                const participants = (Number(activity.participantsMale) || 0) + (Number(activity.participantsFemale) || 0);
                                return (
                                    <button
                                        type="button"
                                        key={`activity-${activity.id}`}
                                        className="pics-drilldown-card"
                                        onClick={() => onSelectActivity(activity)}
                                    >
                                        <div className="pics-drilldown-card__title">
                                            <strong>{getActivityDisplayTitle(activity)}</strong>
                                            {badge && <span className={`status-badge status-badge--compact ${badge === 'Cancelled' ? 'status-badge--cancelled' : badge === 'Realignment' ? 'status-badge--orange' : 'status-badge--purple'}`}>{badge}</span>}
                                        </div>
                                        <p>{activity.description || 'No description provided.'}</p>
                                        <dl>
                                            <div><dt>Component</dt><dd>{activity.component || activity.type || '-'}</dd></div>
                                            <div><dt>Target Date</dt><dd>{activity.date || '-'}</dd></div>
                                            <div><dt>Target IPOs</dt><dd>{getActivityIpoNames(activity, data.ipos).join(', ') || '-'}</dd></div>
                                            <div><dt>Participants</dt><dd>{participants || '-'}</dd></div>
                                        </dl>
                                    </button>
                                );
                            })}

                            {drilldownContent.type === 'ads' && drilldownContent.records.map(ad => (
                                <button
                                    type="button"
                                    key={`ad-${ad.adNo}`}
                                    className="pics-drilldown-card"
                                    onClick={() => onOpenIpoListForAncestralDomain(ad.adNo)}
                                >
                                    <div className="pics-drilldown-card__title">
                                        <strong>{ad.adNo}</strong>
                                        <span className="status-badge status-badge--compact status-badge--info">{ad.scopedIpoNames.length} IPO{ad.scopedIpoNames.length === 1 ? '' : 's'}</span>
                                    </div>
                                    <p>Linked Indigenous Peoples Organizations covered by this ancestral domain.</p>
                                    <dl>
                                        <div><dt>Region</dt><dd>{ad.region || '-'}</dd></div>
                                        <div><dt>Province</dt><dd>{ad.province || '-'}</dd></div>
                                        <div><dt>Linked IPOs</dt><dd>{ad.scopedIpoNames.join(', ') || '-'}</dd></div>
                                    </dl>
                                </button>
                            ))}

                            {((drilldownContent.type === 'subprojects' && drilldownContent.records.length === 0)
                                || (drilldownContent.type === 'activities' && drilldownContent.records.length === 0)
                                || (drilldownContent.type === 'ads' && drilldownContent.records.length === 0)) && (
                                <div className="pics-drilldown-empty">No matching target records found.</div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default PICSReport;
// --- End of components/reports/PICSReport.tsx ---
