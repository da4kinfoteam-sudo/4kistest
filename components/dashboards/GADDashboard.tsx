import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Banknote, Building2,
    CheckCircle2, CircleDollarSign, ClipboardCheck, Users,
} from 'lucide-react';
import {
    Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
    ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    Activity, IPO, OfficeRequirement, OtherProgramExpense, StaffingRequirement,
    Subproject, operatingUnits,
} from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import {
    GAD_PIMME_CLASSIFICATIONS, GadPimmeClassification, getGadPimmeClassification,
} from '../../lib/gadPimmeScoring';
import { buildGadPimmeDetailPath } from '../../lib/gadPimmeAccess';
import { collectFinancialLineItems } from '../../lib/financialAggregation';
import { resolveSubprojectCompletionRollup } from '../../lib/subprojectCompletion';
import { supabase } from '../../supabaseClient';
import { DataTablePagination, LoadingState } from '../ui/enterprise';

type GadFilter = 'All' | GadPimmeClassification | 'Incomplete' | 'For Assessment';
type AssessmentState = 'Completed' | 'Incomplete' | 'For Assessment';

interface GadAssessmentSummary {
    id: number;
    operating_unit: string;
    year: number;
    total_score: number;
    answered_count: number;
    status: 'Incomplete' | 'Completed';
}

interface GADDashboardProps {
    subprojects: Subproject[];
    trainings: Activity[];
    otherActivities: Activity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    ipos: IPO[];
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    navigateTo?: (path: string) => void;
    onSelectAssessment?: (operatingUnit: string, year: number) => void;
}

interface OuDashboardRow {
    ou: string;
    state: AssessmentState;
    score: number | null;
    previousScore: number | null;
    change: number | null;
    classification: GadPimmeClassification | null;
    rate: number | null;
    allocation: number;
    obligation: number;
    attributableAllocation: number | null;
    attributableObligation: number | null;
    utilization: number | null;
    womenTargeted: number;
    womenAssisted: number;
    actualFemaleParticipants: number;
    actualMaleParticipants: number;
    femaleBeneficiaries: number;
    maleBeneficiaries: number;
    beneficiaryCoverage: number | null;
}

const CLASSIFICATION_COLORS: Record<GadPimmeClassification, string> = {
    'Gender-Responsive': '#168a55',
    'Gender-Sensitive': '#2f6fed',
    'Promising GAD Prospects': '#e99a06',
    'GAD-Invisible': '#dc3545',
};
const STATE_COLORS: Record<string, string> = { Incomplete: '#e99a06', 'For Assessment': '#94a3b8' };
const PAGE_SIZE = 10;
const normalizeName = (value?: string | null) => (value || '').trim().toLocaleLowerCase();
const toNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const isApproved = (item: { workflow_status?: string }) => !item.workflow_status || item.workflow_status === 'APPROVED';
const isActive = (item: { status?: string }) => item.status !== 'Cancelled';
const getYear = (date?: string) => date ? new Date(date).getFullYear() : null;
const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: digits }).format(value);
const formatCurrency = (value: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: 1,
}).format(value);
const percent = (numerator: number, denominator: number) => denominator ? (numerator / denominator) * 100 : null;

const getAssessmentState = (assessment?: GadAssessmentSummary): AssessmentState => {
    if (!assessment) return 'For Assessment';
    return assessment.status === 'Completed' && assessment.answered_count === 22
        && assessment.total_score >= 0 && assessment.total_score <= 20
        ? 'Completed'
        : 'Incomplete';
};

const GADDashboard: React.FC<GADDashboardProps> = ({
    subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses,
    ipos, selectedYear, selectedOu, selectedTier, selectedFundType, navigateTo, onSelectAssessment,
}) => {
    const { currentUser, hasAccess, getVisibilityScope } = useAuth();
    const [assessments, setAssessments] = useState<GadAssessmentSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [classificationFilter, setClassificationFilter] = useState<GadFilter>('All');
    const [attributionPage, setAttributionPage] = useState(1);
    const [summaryPage, setSummaryPage] = useState(1);
    const [sortKey, setSortKey] = useState<keyof OuDashboardRow>('score');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const requestIdRef = useRef(0);
    const year = Number(selectedYear);
    const canView = hasAccess('Dashboards', 'view') && hasAccess('Gender and Development', 'view');

    const visibleOus = useMemo(() => {
        if (!currentUser) return [];
        const dashboardScope = getVisibilityScope('Dashboards');
        const gadScope = getVisibilityScope('Gender and Development');
        const ownOuOnly = dashboardScope === 'Own OU' || gadScope === 'Own OU';
        const scoped = ownOuOnly ? operatingUnits.filter(ou => ou === currentUser.operatingUnit) : [...operatingUnits];
        return selectedOu === 'All' ? scoped : scoped.filter(ou => ou === selectedOu);
    }, [currentUser, getVisibilityScope, selectedOu]);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const requestId = ++requestIdRef.current;
            if (!canView || !supabase || !Number.isFinite(year) || !visibleOus.length) {
                setAssessments([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            setError('');
            const result = await supabase.from('gad_pimme_assessments')
                .select('id,operating_unit,year,total_score,answered_count,status')
                .in('operating_unit', visibleOus)
                .gte('year', year - 4)
                .lte('year', year);
            if (!active || requestId !== requestIdRef.current) return;
            if (result.error) setError(result.error.message || 'Unable to load PIMME assessment summaries.');
            else setAssessments((result.data || []) as GadAssessmentSummary[]);
            setLoading(false);
        };
        void load();
        const refresh = () => void load();
        window.addEventListener('gad-pimme-data-changed', refresh);
        window.addEventListener('app-data-refreshed', refresh);
        return () => {
            active = false;
            window.removeEventListener('gad-pimme-data-changed', refresh);
            window.removeEventListener('app-data-refreshed', refresh);
        };
    }, [canView, visibleOus.join('|'), year]);

    const assessmentByOuYear = useMemo(() => new Map(
        assessments.map(item => [`${item.operating_unit}:${item.year}`, item]),
    ), [assessments]);

    const allFinancialLines = useMemo(() => collectFinancialLineItems({
        subprojects,
        activities: [...trainings, ...otherActivities],
        officeReqs,
        staffingReqs,
        otherProgramExpenses,
    }, {
        year: selectedYear,
        operatingUnit: selectedOu,
        tier: selectedTier,
        fundType: selectedFundType,
        includeTaggedExclusions: true,
    }), [subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses, selectedYear, selectedOu, selectedTier, selectedFundType]);

    const baseRows = useMemo<OuDashboardRow[]>(() => visibleOus.map(ou => {
        const assessment = assessmentByOuYear.get(`${ou}:${year}`);
        const state = getAssessmentState(assessment);
        const completed = state === 'Completed' ? assessment : undefined;
        const previous = assessments
            .filter(item => item.operating_unit === ou && item.year < year && getAssessmentState(item) === 'Completed')
            .sort((a, b) => b.year - a.year)[0];
        const lines = allFinancialLines.filter(line => line.operatingUnit === ou);
        const allocation = lines.reduce((sum, line) => sum + line.alloc, 0);
        const obligation = lines.reduce((sum, line) => sum + line.obli, 0);
        const score = completed ? toNumber(completed.total_score) : null;
        const rate = score === null ? null : score / 20;
        const attributableAllocation = rate === null ? null : allocation * rate;
        const attributableObligation = rate === null ? null : obligation * rate;
        return {
            ou, state, score,
            previousScore: previous ? toNumber(previous.total_score) : null,
            change: score !== null && previous ? score - toNumber(previous.total_score) : null,
            classification: score === null ? null : getGadPimmeClassification(score),
            rate, allocation, obligation, attributableAllocation, attributableObligation,
            utilization: attributableAllocation ? (attributableObligation! / attributableAllocation) * 100 : null,
            womenTargeted: 0,
            womenAssisted: 0,
            actualFemaleParticipants: 0,
            actualMaleParticipants: 0,
            femaleBeneficiaries: 0,
            maleBeneficiaries: 0,
            beneficiaryCoverage: null,
        };
    }), [visibleOus, assessmentByOuYear, assessments, allFinancialLines, year]);

    const rows = useMemo(() => baseRows.filter(row => {
        if (classificationFilter === 'All') return true;
        if (classificationFilter === 'Incomplete' || classificationFilter === 'For Assessment') return row.state === classificationFilter;
        return row.classification === classificationFilter;
    }), [baseRows, classificationFilter]);
    const rowOus = useMemo(() => new Set(rows.map(row => row.ou)), [rows]);
    const completedRows = rows.filter(row => row.state === 'Completed');
    const completedDenominator = completedRows.length;

    useEffect(() => {
        setAttributionPage(1);
        setSummaryPage(1);
    }, [classificationFilter, selectedYear, selectedOu, selectedTier, selectedFundType]);

    const totalAllocation = rows.reduce((sum, row) => sum + row.allocation, 0);
    const assessedAllocation = completedRows.reduce((sum, row) => sum + row.allocation, 0);
    const attributableAllocation = completedRows.reduce((sum, row) => sum + (row.attributableAllocation || 0), 0);
    const attributableObligation = completedRows.reduce((sum, row) => sum + (row.attributableObligation || 0), 0);
    const averageScore = completedRows.length ? completedRows.reduce((sum, row) => sum + (row.score || 0), 0) / completedRows.length : null;
    const averagePrevious = completedRows.filter(row => row.previousScore !== null);
    const averageChange = averagePrevious.length ? averagePrevious.reduce((sum, row) => sum + (row.change || 0), 0) / averagePrevious.length : null;

    const classificationData = GAD_PIMME_CLASSIFICATIONS.map(name => ({
        name,
        value: completedRows.filter(row => row.classification === name).length,
        color: CLASSIFICATION_COLORS[name],
    })).filter(item => item.value > 0);

    const trendData = useMemo(() => Array.from({ length: 5 }, (_, index) => year - 4 + index).map(trendYear => {
        const values = rows.map(row => assessmentByOuYear.get(`${row.ou}:${trendYear}`))
            .filter((item): item is GadAssessmentSummary => !!item && getAssessmentState(item) === 'Completed')
            .map(item => item.total_score);
        return { year: trendYear, average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, assessed: values.length };
    }), [assessmentByOuYear, rows, year]);

    const progression = completedRows.reduce((result, row) => {
        if (row.previousScore === null || row.change === null) result.noBaseline += 1;
        else if (Math.abs(row.change) < 0.01) result.maintained += 1;
        else if (row.change > 0) result.improved += 1;
        else result.declined += 1;
        return result;
    }, { improved: 0, maintained: 0, declined: 0, noBaseline: 0 });

    const quarterlyFinancial = useMemo(() => {
        const completedByOu = new Map<string, number>(completedRows.map(row => [row.ou, row.rate || 0]));
        const monthly: number[] = Array(12).fill(0);
        allFinancialLines.forEach(line => {
            if (!line.operatingUnit || !rowOus.has(line.operatingUnit)) return;
            const rate = completedByOu.get(line.operatingUnit);
            if (rate === undefined) return;
            line.obligationByMonth.forEach((amount, index) => { monthly[index] += amount * rate; });
        });
        let cumulative = 0;
        return [0, 1, 2, 3].map(quarter => {
            cumulative += monthly.slice(quarter * 3, quarter * 3 + 3).reduce((sum, value) => sum + value, 0);
            return { quarter: `Q${quarter + 1}`, obligation: cumulative, allocation: attributableAllocation };
        });
    }, [allFinancialLines, attributableAllocation, completedRows, rowOus]);

    const scopedProgramData = useMemo(() => {
        const recordMatches = (record: { fundingYear?: number; operatingUnit?: string; tier?: string; fundType?: string }) => (
            record.fundingYear?.toString() === selectedYear
            && rowOus.has(record.operatingUnit || '')
            && (selectedTier === 'All' || record.tier === selectedTier)
            && (selectedFundType === 'All' || record.fundType === selectedFundType)
        );
        return {
            subprojects: subprojects.filter(item => recordMatches(item) && isApproved(item) && isActive(item)),
            activities: [...trainings, ...otherActivities].filter(item => recordMatches(item) && isApproved(item) && isActive(item)),
        };
    }, [subprojects, trainings, otherActivities, selectedYear, selectedTier, selectedFundType, rowOus]);

    const ipoLookup = useMemo(() => {
        const byId = new Map(ipos.map(ipo => [Number(ipo.id), ipo]));
        const byName = new Map(ipos.map(ipo => [normalizeName(ipo.name), ipo]));
        return { byId, byName };
    }, [ipos]);
    const resolveSubprojectIpos = (item: Subproject) => {
        const byId = item.ipo_id ? ipoLookup.byId.get(Number(item.ipo_id)) : undefined;
        return byId ? [byId] : [ipoLookup.byName.get(normalizeName(item.indigenousPeopleOrganization))].filter(Boolean) as IPO[];
    };
    const resolveActivityIpos = (item: Activity) => {
        const byIds = (item.participating_ipo_ids || []).map(id => ipoLookup.byId.get(Number(id))).filter(Boolean) as IPO[];
        if (byIds.length) return Array.from(new Map(byIds.map(ipo => [ipo.id, ipo])).values());
        return Array.from(new Map((item.participatingIpos || []).map(name => ipoLookup.byName.get(normalizeName(name))).filter(Boolean).map(ipo => [ipo!.id, ipo!])).values());
    };

    const physicalMetrics = useMemo(() => {
        const targetedWomen = new Set<number>();
        const assistedWomen = new Set<number>();
        let targetedWomenSubprojects = 0;
        let completedWomenSubprojects = 0;
        let womenTrainings = 0;
        scopedProgramData.subprojects.forEach(item => {
            const linked = resolveSubprojectIpos(item).filter(ipo => ipo.isWomenLed);
            if (!linked.length) return;
            targetedWomenSubprojects += 1;
            linked.forEach(ipo => targetedWomen.add(ipo.id));
            const rollup = resolveSubprojectCompletionRollup(item.details || []);
            if (rollup.isComplete && getYear(rollup.actualCompletionDate || undefined) === year) {
                completedWomenSubprojects += 1;
                linked.forEach(ipo => assistedWomen.add(ipo.id));
            }
        });
        scopedProgramData.activities.forEach(item => {
            const linked = resolveActivityIpos(item).filter(ipo => ipo.isWomenLed);
            linked.forEach(ipo => targetedWomen.add(ipo.id));
            if (item.actualDate && getYear(item.actualDate) === year) {
                linked.forEach(ipo => assistedWomen.add(ipo.id));
                if (item.type === 'Training' && linked.length) womenTrainings += 1;
            }
        });

        const trainingRows = scopedProgramData.activities.filter(item => item.type === 'Training');
        const conductedTrainings = trainingRows.filter(item => item.actualDate && getYear(item.actualDate) === year);
        const trainingTargets = trainingRows.reduce((result, item) => ({
            targetMale: result.targetMale + toNumber(item.participantsMale),
            targetFemale: result.targetFemale + toNumber(item.participantsFemale),
        }), { targetMale: 0, targetFemale: 0 });
        const trainingActuals = conductedTrainings.reduce((result, item) => ({
            actualMale: result.actualMale + toNumber(item.actualParticipantsMale),
            actualFemale: result.actualFemale + toNumber(item.actualParticipantsFemale),
            missingActual: result.missingActual + (item.actualParticipantsMale == null || item.actualParticipantsFemale == null ? 1 : 0),
        }), { actualMale: 0, actualFemale: 0, missingActual: 0 });
        const training = { ...trainingTargets, ...trainingActuals };

        const completedSubprojects = scopedProgramData.subprojects.filter(item => {
            const rollup = resolveSubprojectCompletionRollup(item.details || []);
            return rollup.isComplete && getYear(rollup.actualCompletionDate || undefined) === year;
        });
        const reportedBeneficiaries = completedSubprojects.filter(item => item.actualMaleBeneficiaries != null && item.actualFemaleBeneficiaries != null);
        const beneficiaryByOu = Array.from(rowOus).map(ou => {
            const items = reportedBeneficiaries.filter(item => item.operatingUnit === ou);
            return {
                ou,
                male: items.reduce((sum, item) => sum + toNumber(item.actualMaleBeneficiaries), 0),
                female: items.reduce((sum, item) => sum + toNumber(item.actualFemaleBeneficiaries), 0),
            };
        }).filter(item => item.male + item.female > 0);
        const beneficiaries = reportedBeneficiaries.reduce((result, item) => ({
            male: result.male + toNumber(item.actualMaleBeneficiaries),
            female: result.female + toNumber(item.actualFemaleBeneficiaries),
        }), { male: 0, female: 0 });
        const completedActivities = scopedProgramData.activities.filter(item => item.actualDate && getYear(item.actualDate) === year);
        const meetingFemaleTarget = completedActivities.filter(item => item.actualParticipantsFemale != null && toNumber(item.actualParticipantsFemale) >= toNumber(item.participantsFemale)).length;
        const belowFemaleTarget = completedActivities.filter(item => item.actualParticipantsFemale != null && toNumber(item.actualParticipantsFemale) < toNumber(item.participantsFemale)).length;
        const missingSexActual = completedActivities.filter(item => item.actualParticipantsMale == null || item.actualParticipantsFemale == null).length;
        return {
            women: { targeted: targetedWomen.size, assisted: assistedWomen.size, targetedSubprojects: targetedWomenSubprojects, completedSubprojects: completedWomenSubprojects, trainings: womenTrainings },
            training,
            beneficiaries: { ...beneficiaries, reported: reportedBeneficiaries.length, eligible: completedSubprojects.length, byOu: beneficiaryByOu },
            completion: { targets: scopedProgramData.activities.length, completed: completedActivities.length, meetingFemaleTarget, belowFemaleTarget, missingSexActual },
        };
    }, [scopedProgramData, ipoLookup, rowOus, year]);

    const detailedRows = useMemo(() => rows.map(row => {
        const ouSubprojects = scopedProgramData.subprojects.filter(item => item.operatingUnit === row.ou);
        const ouActivities = scopedProgramData.activities.filter(item => item.operatingUnit === row.ou);
        const targetedWomen = new Set<number>();
        const assistedWomen = new Set<number>();
        ouSubprojects.forEach(item => {
            const linked = resolveSubprojectIpos(item).filter(ipo => ipo.isWomenLed);
            linked.forEach(ipo => targetedWomen.add(ipo.id));
            const rollup = resolveSubprojectCompletionRollup(item.details || []);
            if (rollup.isComplete && getYear(rollup.actualCompletionDate || undefined) === year) linked.forEach(ipo => assistedWomen.add(ipo.id));
        });
        ouActivities.forEach(item => {
            const linked = resolveActivityIpos(item).filter(ipo => ipo.isWomenLed);
            linked.forEach(ipo => targetedWomen.add(ipo.id));
            if (item.actualDate && getYear(item.actualDate) === year) linked.forEach(ipo => assistedWomen.add(ipo.id));
        });
        const conducted = ouActivities.filter(item => item.type === 'Training' && item.actualDate && getYear(item.actualDate) === year);
        const completedSubprojects = ouSubprojects.filter(item => {
            const rollup = resolveSubprojectCompletionRollup(item.details || []);
            return rollup.isComplete && getYear(rollup.actualCompletionDate || undefined) === year;
        });
        const reported = completedSubprojects.filter(item => item.actualMaleBeneficiaries != null && item.actualFemaleBeneficiaries != null);
        return {
            ...row,
            womenTargeted: targetedWomen.size,
            womenAssisted: assistedWomen.size,
            actualFemaleParticipants: conducted.reduce((sum, item) => sum + toNumber(item.actualParticipantsFemale), 0),
            actualMaleParticipants: conducted.reduce((sum, item) => sum + toNumber(item.actualParticipantsMale), 0),
            femaleBeneficiaries: reported.reduce((sum, item) => sum + toNumber(item.actualFemaleBeneficiaries), 0),
            maleBeneficiaries: reported.reduce((sum, item) => sum + toNumber(item.actualMaleBeneficiaries), 0),
            beneficiaryCoverage: percent(reported.length, completedSubprojects.length),
        };
    }), [rows, scopedProgramData, ipoLookup, year]);

    const sortedRows = useMemo(() => [...rows].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const comparison = typeof av === 'string' ? av.localeCompare(String(bv || '')) : (toNumber(av) - toNumber(bv));
        return sortDirection === 'asc' ? comparison : -comparison;
    }), [rows, sortKey, sortDirection]);
    const attributionPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    const attributionRows = sortedRows.slice((attributionPage - 1) * PAGE_SIZE, attributionPage * PAGE_SIZE);
    const summaryPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    const summaryRows = detailedRows.slice((summaryPage - 1) * PAGE_SIZE, summaryPage * PAGE_SIZE);
    const toggleSort = (key: keyof OuDashboardRow) => {
        if (sortKey === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDirection('desc'); }
    };
    const openAssessment = (ou: string) => {
        if (onSelectAssessment) onSelectAssessment(ou, year);
        else navigateTo?.(buildGadPimmeDetailPath(ou, year));
    };

    if (!canView) return <div className="notice notice--warning"><p>You need both Dashboard and Gender and Development view access to open this dashboard.</p></div>;
    if (!Number.isFinite(year)) return <div className="gad-dashboard dashboard-view"><div className="dashboard-panel gad-dashboard-empty"><h3>Select a Fund Year</h3><p>Choose a specific Fund Year to align annual PIMME assessments and program records.</p></div></div>;

    const kpis = [
        { label: 'Average PIMME', value: averageScore === null ? 'No Data' : `${averageScore.toFixed(2)} / 20`, meta: averageChange === null ? 'No previous baseline' : `${averageChange >= 0 ? '+' : ''}${averageChange.toFixed(2)} vs previous`, icon: ClipboardCheck },
        ...GAD_PIMME_CLASSIFICATIONS.map(name => ({ label: name, value: completedRows.filter(row => row.classification === name).length.toLocaleString(), meta: completedDenominator ? `${((completedRows.filter(row => row.classification === name).length / completedDenominator) * 100).toFixed(1)}% of completed` : 'No completed assessments', icon: CheckCircle2 })),
        { label: 'Program Allocation', value: formatCurrency(totalAllocation), meta: `${rows.length} visible OUs`, icon: Banknote },
        { label: 'Attributable Allocation', value: completedRows.length ? formatCurrency(attributableAllocation) : 'No Data', meta: `${formatNumber(percent(assessedAllocation, totalAllocation) || 0, 1)}% allocation coverage`, icon: CircleDollarSign },
        { label: 'Attributable Obligation', value: completedRows.length ? formatCurrency(attributableObligation) : 'No Data', meta: 'Signed FY item actuals', icon: Banknote },
        { label: 'Attribution Utilization', value: attributableAllocation ? `${formatNumber((attributableObligation / attributableAllocation) * 100, 1)}%` : 'No Data', meta: 'Obligation / attributable allocation', icon: ArrowUp },
        { label: 'Assessed OUs', value: `${completedRows.length} / ${rows.length}`, meta: `${rows.filter(row => row.state === 'Incomplete').length} incomplete`, icon: Building2 },
    ];

    return (
        <div className="gad-dashboard dashboard-view animate-fadeIn">
            <header className="gad-dashboard-header">
                <div><h2>Gender and Development Dashboard</h2></div>
                <label className="gad-dashboard-classification-filter">
                    <span>Classification</span>
                    <select className="form-control" value={classificationFilter} onChange={event => setClassificationFilter(event.target.value as GadFilter)}>
                        <option value="All">All</option>
                        {GAD_PIMME_CLASSIFICATIONS.map(item => <option value={item} key={item}>{item}</option>)}
                        <option value="Incomplete">Incomplete</option>
                        <option value="For Assessment">For Assessment</option>
                    </select>
                </label>
            </header>
            {error && <div className="notice notice--warning" role="alert"><p>PIMME data could not be refreshed: {error}. Program implementation metrics remain available.</p></div>}
            {loading ? <LoadingState title="Loading GAD dashboard" message="Preparing visible PIMME assessment summaries." /> : (
                <>
                    <section className="gad-dashboard-kpis" aria-label="GAD executive indicators">
                        {kpis.map(({ label, value, meta, icon: Icon }) => <article className="dashboard-panel gad-dashboard-kpi" key={label}>
                            <div className="gad-dashboard-kpi__heading"><span>{label}</span><Icon aria-hidden="true" /></div>
                            <strong>{value}</strong><small>{meta}</small>
                        </article>)}
                    </section>

                    <section className="gad-dashboard-grid gad-dashboard-grid--three">
                        <article className="dashboard-panel gad-dashboard-chart"><h3>PIMME Classification Distribution</h3>
                            {classificationData.length ? <div className="gad-dashboard-donut"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={classificationData} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2}>{classificationData.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer><div className="gad-dashboard-donut__center"><strong>{completedRows.length}</strong><span>Assessed OUs</span></div></div> : <p className="dashboard-empty">No completed PIMME assessments.</p>}
                        </article>
                        <article className="dashboard-panel gad-dashboard-chart"><h3>OU PIMME Ranking</h3>
                            {completedRows.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={[...completedRows].sort((a, b) => (b.score || 0) - (a.score || 0))} layout="vertical" margin={{ left: 16, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 20]} /><YAxis type="category" dataKey="ou" width={80} /><Tooltip /><ReferenceLine x={4} stroke="#e99a06" strokeDasharray="4 4" /><ReferenceLine x={8} stroke="#2f6fed" strokeDasharray="4 4" /><ReferenceLine x={15} stroke="#168a55" strokeDasharray="4 4" /><Bar dataKey="score" fill="#247a52" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <p className="dashboard-empty">No ranking data.</p>}
                        </article>
                        <article className="dashboard-panel gad-dashboard-chart"><h3>Five-Year PIMME Trend</h3>
                            <ResponsiveContainer width="100%" height={230}><LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis domain={[0, 20]} /><Tooltip /><Line dataKey="average" name="Average score" stroke="#247a52" strokeWidth={3} connectNulls /></LineChart></ResponsiveContainer>
                            <div className="gad-dashboard-progression"><span><ArrowUp />Improved <b>{progression.improved}</b></span><span><ArrowRight />Maintained <b>{progression.maintained}</b></span><span><ArrowDown />Declined <b>{progression.declined}</b></span><span><AlertTriangle />No baseline <b>{progression.noBaseline}</b></span></div>
                        </article>
                    </section>

                    <section className="gad-dashboard-grid gad-dashboard-grid--two">
                        <article className="dashboard-panel gad-dashboard-financial"><h3>Financial Attribution</h3>
                            <div className="gad-dashboard-financial__flow"><div><span>Total allocation</span><strong>{formatCurrency(totalAllocation)}</strong></div><ArrowRight /><div><span>Attributable allocation</span><strong>{completedRows.length ? formatCurrency(attributableAllocation) : 'No Data'}</strong></div><ArrowRight /><div><span>Attributable obligation</span><strong>{completedRows.length ? formatCurrency(attributableObligation) : 'No Data'}</strong></div></div>
                            <div className="gad-dashboard-progress"><span style={{ width: `${Math.max(0, Math.min(100, percent(attributableObligation, attributableAllocation) || 0))}%` }} /></div>
                            <p>{formatNumber(percent(assessedAllocation, totalAllocation) || 0, 1)}% of allocation belongs to OUs with completed PIMME assessments.</p>
                        </article>
                        <article className="dashboard-panel gad-dashboard-chart"><h3>Quarterly Cumulative Attributable Obligations</h3>
                            <ResponsiveContainer width="100%" height={220}><BarChart data={quarterlyFinancial}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="quarter" /><YAxis tickFormatter={value => formatCurrency(value)} width={82} /><Tooltip formatter={(value: number) => formatCurrency(value)} /><Bar dataKey="obligation" name="Cumulative obligation" fill="#247a52" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
                        </article>
                    </section>

                    <section className="dashboard-panel gad-dashboard-table-card"><h3>Attribution by OU</h3><div className="data-table-scroll custom-scrollbar"><table className="data-table gad-dashboard-table"><thead><tr>{[
                        ['ou', 'OU'], ['score', 'PIMME'], ['classification', 'Classification'], ['rate', 'Attribution'], ['allocation', 'Allocation'], ['attributableAllocation', 'Attributed Allocation'], ['obligation', 'Actual Obligation'], ['attributableObligation', 'Attributed Obligation'], ['utilization', 'Utilization'], ['change', 'Previous / Change'],
                    ].map(([key, label]) => <th key={key}><button type="button" onClick={() => toggleSort(key as keyof OuDashboardRow)}>{label}</button></th>)}</tr></thead><tbody>
                        {attributionRows.map(row => <tr key={row.ou}><td><button className="table-action-link" type="button" onClick={() => openAssessment(row.ou)}>{row.ou}</button></td><td>{row.score === null ? row.state : `${row.score.toFixed(2)} / 20`}</td><td>{row.classification || row.state}</td><td>{row.rate === null ? 'No Data' : `${formatNumber(row.rate * 100, 1)}%`}</td><td>{formatCurrency(row.allocation)}</td><td>{row.attributableAllocation === null ? 'No Data' : formatCurrency(row.attributableAllocation)}</td><td>{formatCurrency(row.obligation)}</td><td>{row.attributableObligation === null ? 'No Data' : formatCurrency(row.attributableObligation)}</td><td>{row.utilization === null ? 'No Data' : `${formatNumber(row.utilization, 1)}%`}</td><td>{row.previousScore === null ? 'No baseline' : `${row.previousScore.toFixed(2)} (${row.change! >= 0 ? '+' : ''}${row.change!.toFixed(2)})`}</td></tr>)}
                        {!attributionRows.length && <tr><td colSpan={10} className="data-table__empty-cell">No OUs match the current classification filter.</td></tr>}
                    </tbody></table></div><DataTablePagination currentPage={attributionPage} totalPages={attributionPages} totalItems={sortedRows.length} itemsPerPage={PAGE_SIZE} onPageChange={setAttributionPage} />
                    </section>

                    <section className="gad-dashboard-grid gad-dashboard-grid--three">
                        <article className="dashboard-panel gad-dashboard-metric-panel"><h3>Women-Led IPO Support</h3><div className="gad-dashboard-metric-list"><span>Targeted IPOs <b>{physicalMetrics.women.targeted}</b></span><span>Assisted IPOs <b>{physicalMetrics.women.assisted}</b></span><span>Completed subprojects <b>{physicalMetrics.women.completedSubprojects}</b></span><span>Trainings conducted <b>{physicalMetrics.women.trainings}</b></span><span>Subproject delivery rate <b>{percent(physicalMetrics.women.completedSubprojects, physicalMetrics.women.targetedSubprojects) === null ? 'No Data' : `${formatNumber(percent(physicalMetrics.women.completedSubprojects, physicalMetrics.women.targetedSubprojects)!, 1)}%`}</b></span></div><small>Women-led status uses current IPO registry metadata.</small></article>
                        <article className="dashboard-panel gad-dashboard-metric-panel"><h3>Training Participation</h3><div className="gad-dashboard-sex-bars"><div><span>Female actual / target</span><strong>{physicalMetrics.training.actualFemale} / {physicalMetrics.training.targetFemale}</strong><i><b style={{ width: `${Math.min(100, percent(physicalMetrics.training.actualFemale, physicalMetrics.training.targetFemale) || 0)}%` }} /></i></div><div><span>Male actual / target</span><strong>{physicalMetrics.training.actualMale} / {physicalMetrics.training.targetMale}</strong><i><b style={{ width: `${Math.min(100, percent(physicalMetrics.training.actualMale, physicalMetrics.training.targetMale) || 0)}%` }} /></i></div></div><small>{physicalMetrics.training.missingActual} conducted trainings have incomplete sex-disaggregated actuals.</small></article>
                        <article className="dashboard-panel gad-dashboard-metric-panel"><h3>Activity and Training Completion</h3><div className="gad-dashboard-metric-list"><span>Total targets <b>{physicalMetrics.completion.targets}</b></span><span>Completed <b>{physicalMetrics.completion.completed}</b></span><span>Completion rate <b>{percent(physicalMetrics.completion.completed, physicalMetrics.completion.targets) === null ? 'No Data' : `${formatNumber(percent(physicalMetrics.completion.completed, physicalMetrics.completion.targets)!, 1)}%`}</b></span><span>Meeting female target <b>{physicalMetrics.completion.meetingFemaleTarget}</b></span><span>Below female target <b>{physicalMetrics.completion.belowFemaleTarget}</b></span><span>Missing sex actuals <b>{physicalMetrics.completion.missingSexActual}</b></span></div></article>
                    </section>

                    <section className="dashboard-panel gad-dashboard-beneficiaries"><div><h3>Subproject Beneficiary Composition</h3><p>{physicalMetrics.beneficiaries.reported} of {physicalMetrics.beneficiaries.eligible} completed subprojects have reported recipient data.</p></div>
                        {physicalMetrics.beneficiaries.reported ? <><div className="gad-dashboard-beneficiary-kpis"><span>Total recipients <b>{physicalMetrics.beneficiaries.male + physicalMetrics.beneficiaries.female}</b></span><span>Female <b>{physicalMetrics.beneficiaries.female} ({formatNumber(percent(physicalMetrics.beneficiaries.female, physicalMetrics.beneficiaries.male + physicalMetrics.beneficiaries.female) || 0, 1)}%)</b></span><span>Male <b>{physicalMetrics.beneficiaries.male} ({formatNumber(percent(physicalMetrics.beneficiaries.male, physicalMetrics.beneficiaries.male + physicalMetrics.beneficiaries.female) || 0, 1)}%)</b></span><span>Average / reported SP <b>{formatNumber((physicalMetrics.beneficiaries.male + physicalMetrics.beneficiaries.female) / physicalMetrics.beneficiaries.reported, 1)}</b></span></div><ResponsiveContainer width="100%" height={240}><BarChart data={physicalMetrics.beneficiaries.byOu}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="ou" /><YAxis /><Tooltip /><Legend /><Bar dataKey="female" name="Female" stackId="a" fill="#168a55" /><Bar dataKey="male" name="Male" stackId="a" fill="#2f6fed" /></BarChart></ResponsiveContainer></> : <p className="dashboard-empty">No Data. Existing records remain unreported until recipient counts are entered.</p>}
                    </section>

                    <section className="dashboard-panel gad-dashboard-table-card"><h3>Detailed OU Summary</h3><div className="data-table-scroll custom-scrollbar"><table className="data-table gad-dashboard-table"><thead><tr><th>OU</th><th>PIMME</th><th>Classification</th><th>Attributed Allocation</th><th>Attributed Obligation</th><th>Women-Led IPOs Targeted</th><th>Women-Led IPOs Assisted</th><th>Training Female</th><th>Training Male</th><th>SP Female Beneficiaries</th><th>SP Male Beneficiaries</th><th>Beneficiary Coverage</th></tr></thead><tbody>{summaryRows.map(row => <tr key={row.ou}><td><button className="table-action-link" type="button" onClick={() => openAssessment(row.ou)}>{row.ou}</button></td><td>{row.score === null ? 'No Data' : row.score.toFixed(2)}</td><td>{row.classification || row.state}</td><td>{row.attributableAllocation === null ? 'No Data' : formatCurrency(row.attributableAllocation)}</td><td>{row.attributableObligation === null ? 'No Data' : formatCurrency(row.attributableObligation)}</td><td>{row.womenTargeted}</td><td>{row.womenAssisted}</td><td>{row.actualFemaleParticipants}</td><td>{row.actualMaleParticipants}</td><td>{row.beneficiaryCoverage === null ? 'No Data' : row.femaleBeneficiaries}</td><td>{row.beneficiaryCoverage === null ? 'No Data' : row.maleBeneficiaries}</td><td>{row.beneficiaryCoverage === null ? 'No Data' : `${formatNumber(row.beneficiaryCoverage, 1)}%`}</td></tr>)}</tbody></table></div><DataTablePagination currentPage={summaryPage} totalPages={summaryPages} totalItems={detailedRows.length} itemsPerPage={PAGE_SIZE} onPageChange={setSummaryPage} />
                    </section>
                </>
            )}
        </div>
    );
};

export default GADDashboard;
