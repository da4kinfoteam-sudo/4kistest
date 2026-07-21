import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    CalendarDays,
    ChevronDown,
    Download,
    Medal,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Trophy,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
    AwardAnnualOuRow,
    AwardManualScore,
    AwardPhysicalComponentKey,
    AwardQuarter,
    AwardQuarterResult,
    AwardRankingSettings,
    AwardSpecialScore,
    awardQuarters,
    calculateAwardsDashboardData,
    DEFAULT_AWARD_SETTINGS,
    normalizeAwardSettings,
} from '../../lib/awardRankings';
import { IPO, OfficeRequirement, OtherActivity, OtherProgramExpense, StaffingRequirement, Subproject, Training, operatingUnits } from '../../constants';

interface AwardsRankingsDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedTier: string;
    selectedFundType: string;
}

type ManualField =
    | 'reportorial_required'
    | 'reportorial_submitted'
    | 'national_activities_required'
    | 'national_activities_attended'
    | 'remarks';

const SETTINGS_KEY = 'awards_and_rankings';
const AWARD_PERIODS: AwardManualScore['period'][] = ['Q1', 'Q2', 'Q3', 'Q4', 'Year End'];

const componentLabels: Record<AwardPhysicalComponentKey, string> = {
    socialPrep: 'Social Prep',
    productionLivelihood: 'Production and Livelihood',
    marketingEnterprise: 'Marketing and Enterprise',
    programManagement: 'Program Management',
};

const formatScore = (value: number, suffix = '') => `${value.toFixed(2)}${suffix}`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(Math.ceil(amount));

type QuarterDetailMode = 'financial' | 'physical';
type QuarterDetailPeriod = AwardQuarter | 'All';

const formatPoint = (value: number) => `${value.toFixed(0)} pts`;
const formatCountPoints = (count: number, points: number) => `${count} (${formatPoint(points)})`;
const formatRank = (rank: number | undefined) => rank ? String(rank) : '-';

const ensureManualRows = (rows: AwardManualScore[], year: number): AwardManualScore[] => {
    const map = new Map<string, AwardManualScore>();
    rows.forEach(row => {
        map.set(`${row.period}::${row.operating_unit}`, {
            ...row,
            reportorial_required: Number(row.reportorial_required) || 0,
            reportorial_submitted: Number(row.reportorial_submitted) || 0,
            national_activities_required: Number(row.national_activities_required) || 0,
            national_activities_attended: Number(row.national_activities_attended) || 0,
            remarks: row.remarks || '',
        });
    });

    return AWARD_PERIODS.flatMap(period => operatingUnits.map(ou => (
        map.get(`${period}::${ou}`) || {
            fund_year: year,
            period,
            operating_unit: ou,
            reportorial_required: 0,
            reportorial_submitted: 0,
            national_activities_required: 0,
            national_activities_attended: 0,
            remarks: '',
        }
    )));
};

const settingsEqual = (a: AwardRankingSettings, b: AwardRankingSettings) => JSON.stringify(a) === JSON.stringify(b);
const manualEqual = (a: AwardManualScore[], b: AwardManualScore[]) => JSON.stringify(a) === JSON.stringify(b);

const LeaderboardTable: React.FC<{
    title: string;
    rows: AwardAnnualOuRow[];
    columns: Array<{ key: string; label: string; render: (row: AwardAnnualOuRow) => React.ReactNode }>;
}> = ({ title, rows, columns }) => (
    <article className="dashboard-panel award-panel award-leaderboard-panel">
        <div className="dashboard-panel__header">
            <h3 className="dashboard-panel__title">{title}</h3>
        </div>
        <div className="data-table-scroll custom-scrollbar">
            <table className="data-table award-table award-table--wide">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>OU</th>
                        <th className="data-table__numeric">Points</th>
                        {columns.map(column => <th key={column.key} className="data-table__numeric">{column.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.ou}>
                            <td className="award-rank-text">{formatRank(row.rank)}</td>
                            <td className="data-table__emphasis">{row.ou}</td>
                            <td className="data-table__numeric data-table__emphasis">{formatScore(row.totalPoints)}</td>
                            {columns.map(column => (
                                <td key={column.key} className="data-table__numeric">{column.render(row)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </article>
);

const QuarterLeaderboard: React.FC<{ quarter: AwardQuarterResult }> = ({ quarter }) => (
    <article className="dashboard-panel award-panel award-quarter-panel">
        <div className="dashboard-panel__header">
            <h3 className="dashboard-panel__title">{quarter.period} Awards</h3>
            <span className="award-panel__meta">{quarter.statusLabel}</span>
        </div>
        {!quarter.isActive ? (
            <p className="award-empty-note">This quarter is not yet due for the selected fund year.</p>
        ) : (
            <div className="award-quarter-grid">
                <div className="award-mini-board">
                    <h4>Top Physical Performance</h4>
                    <ul>
                        {quarter.physicalOverall.map(row => (
                            <li key={row.ou}>
                                <span className="award-rank-text">{formatRank(row.rank)}</span>
                                <strong>{row.ou}</strong>
                                <b>{formatScore(row.points)} pts</b>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="award-mini-board">
                    <h4>Top Financial Performance</h4>
                    <ul>
                        {quarter.financial.map(row => (
                            <li key={row.ou}>
                                <span className="award-rank-text">{formatRank(row.rank)}</span>
                                <strong>{row.ou}</strong>
                                <b>{formatScore(row.points)} pts</b>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        )}
    </article>
);

const SpecialAwardsTable: React.FC<{
    title: string;
    rows: AwardSpecialScore[];
    valueLabel: string;
    showTarget?: boolean;
}> = ({ title, rows, valueLabel, showTarget = false }) => (
    <article className="dashboard-panel award-panel award-special-table-card">
        <div className="dashboard-panel__header">
            <h3 className="dashboard-panel__title">{title}</h3>
        </div>
        <div className="data-table-scroll custom-scrollbar">
            <table className="data-table award-table award-table--special">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>OU</th>
                        <th className="data-table__numeric">{valueLabel}</th>
                        {showTarget && <th className="data-table__numeric">Target IPOs</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.ou}>
                            <td className="award-rank-text">{formatRank(row.rank)}</td>
                            <td className="data-table__emphasis">{row.ou}</td>
                            <td className="data-table__numeric data-table__emphasis">{row.score.toLocaleString()}</td>
                            {showTarget && <td className="data-table__numeric">{(row.target || 0).toLocaleString()}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </article>
);

const AwardsRankingsDashboard: React.FC<AwardsRankingsDashboardProps> = ({ data, selectedYear, selectedTier, selectedFundType }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const effectiveYear = Number.isFinite(Number(selectedYear)) ? Number(selectedYear) : new Date().getFullYear();
    const [controllerOpen, setControllerOpen] = useState(false);
    const [quarterDetailMode, setQuarterDetailMode] = useState<QuarterDetailMode>('financial');
    const [quarterDetailPeriod, setQuarterDetailPeriod] = useState<QuarterDetailPeriod>('All');
    const [activeManualPeriod, setActiveManualPeriod] = useState<AwardManualScore['period']>('Q1');
    const [settings, setSettings] = useState<AwardRankingSettings>(DEFAULT_AWARD_SETTINGS);
    const [draftSettings, setDraftSettings] = useState<AwardRankingSettings>(DEFAULT_AWARD_SETTINGS);
    const [manualScores, setManualScores] = useState<AwardManualScore[]>([]);
    const [draftManualScores, setDraftManualScores] = useState<AwardManualScore[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;

        const loadController = async () => {
            if (!supabase) {
                setError('Supabase is not configured. Awards settings cannot be loaded.');
                return;
            }
            setLoading(true);
            setError('');
            setMessage('');
            try {
                const [settingsResult, scoresResult] = await Promise.all([
                    supabase.from('award_ranking_settings').select('settings').eq('settings_key', SETTINGS_KEY).maybeSingle(),
                    supabase.from('award_manual_scores').select('*').eq('fund_year', effectiveYear).order('period').order('operating_unit'),
                ]);

                if (cancelled) return;
                if (settingsResult.error) {
                    console.error('Unable to load award ranking settings:', settingsResult.error);
                    setError('Award settings could not be loaded. Check that the awards migration has been applied.');
                }
                if (scoresResult.error) {
                    console.error('Unable to load award manual scores:', scoresResult.error);
                    setError('Manual award inputs could not be loaded. Check that the awards migration has been applied.');
                }

                const normalizedSettings = normalizeAwardSettings(settingsResult.data?.settings);
                const normalizedRows = ensureManualRows((scoresResult.data || []) as AwardManualScore[], effectiveYear);
                setSettings(normalizedSettings);
                setDraftSettings(normalizedSettings);
                setManualScores(normalizedRows);
                setDraftManualScores(normalizedRows);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadController();
        return () => {
            cancelled = true;
        };
    }, [effectiveYear, isAdmin]);

    const awardsData = useMemo(
        () => calculateAwardsDashboardData(data, selectedYear, settings, manualScores),
        [data, manualScores, selectedYear, settings]
    );

    const hasChanges = !settingsEqual(settings, draftSettings) || !manualEqual(manualScores, draftManualScores);

    const activeQuarters = useMemo(() => awardsData.quarters.filter(quarter => quarter.isActive), [awardsData.quarters]);
    const visibleDetailQuarters = useMemo(
        () => activeQuarters.filter(quarter => quarterDetailPeriod === 'All' || quarter.period === quarterDetailPeriod),
        [activeQuarters, quarterDetailPeriod]
    );
    const financialDetailRows = useMemo(
        () => visibleDetailQuarters.flatMap(quarter => quarter.financial.map(row => ({ ...row, period: quarter.period }))),
        [visibleDetailQuarters]
    );
    const physicalDetailRows = useMemo(
        () => visibleDetailQuarters.flatMap(quarter => (
            (Object.entries(quarter.physicalComponents) as Array<[AwardPhysicalComponentKey, typeof quarter.physicalComponents[AwardPhysicalComponentKey]]>)
                .flatMap(([component, rows]) => rows.map(row => ({
                    ...row,
                    period: quarter.period,
                    component,
                    componentLabel: componentLabels[component],
                })))
        )),
        [visibleDetailQuarters]
    );
    const quarterDetailTitle = `${quarterDetailMode === 'financial' ? 'Quarter Financial Details' : 'Quarter Physical Details'}${quarterDetailPeriod === 'All' ? '' : ` - ${quarterDetailPeriod}`}`;

    const updateManual = (period: AwardManualScore['period'], ou: string, field: ManualField, value: string) => {
        setDraftManualScores(current => ensureManualRows(current, effectiveYear).map(row => {
            if (row.period !== period || row.operating_unit !== ou) return row;
            if (field === 'remarks') return { ...row, remarks: value };
            return { ...row, [field]: Math.max(0, Math.floor(Number(value) || 0)) };
        }));
        setMessage('');
    };

    const updateQuarterWeight = (component: AwardPhysicalComponentKey, key: string, value: string) => {
        setDraftSettings(current => ({
            ...current,
            quarterlyPhysicalWeights: {
                ...current.quarterlyPhysicalWeights,
                [component]: {
                    ...current.quarterlyPhysicalWeights[component],
                    [key]: Number(value) || 0,
                },
            },
        }));
        setMessage('');
    };

    const updateSimpleSetting = (group: 'quarterlyRankPoints' | 'annualRankPoints' | 'annualConsistencyPoints' | 'annualAttendanceMissedPoints', key: string, value: string) => {
        setDraftSettings(current => ({
            ...current,
            [group]: {
                ...current[group],
                [key]: Number(value) || 0,
            },
        }));
        setMessage('');
    };

    const updateFinancialWeight = (key: keyof AwardRankingSettings['quarterlyFinancialWeights'], value: string) => {
        setDraftSettings(current => ({
            ...current,
            quarterlyFinancialWeights: {
                ...current.quarterlyFinancialWeights,
                [key]: Number(value) || 0,
            },
        }));
        setMessage('');
    };

    const saveController = async () => {
        if (!supabase) {
            setError('Supabase is not configured. Awards controller cannot be saved.');
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');
        try {
            const normalizedSettings = normalizeAwardSettings(draftSettings);
            const rowsToSave = ensureManualRows(draftManualScores, effectiveYear).map(row => ({
                fund_year: effectiveYear,
                period: row.period,
                operating_unit: row.operating_unit,
                reportorial_required: Number(row.reportorial_required) || 0,
                reportorial_submitted: Number(row.reportorial_submitted) || 0,
                national_activities_required: Number(row.national_activities_required) || 0,
                national_activities_attended: Number(row.national_activities_attended) || 0,
                remarks: row.remarks || null,
                updated_by: currentUser?.id || null,
                updated_by_name: currentUser?.fullName || currentUser?.username || null,
            }));

            const [settingsResult, scoresResult] = await Promise.all([
                supabase.from('award_ranking_settings').upsert({
                    settings_key: SETTINGS_KEY,
                    settings: normalizedSettings,
                    updated_by: currentUser?.id || null,
                    updated_by_name: currentUser?.fullName || currentUser?.username || null,
                }, { onConflict: 'settings_key' }),
                supabase.from('award_manual_scores').upsert(rowsToSave, { onConflict: 'fund_year,period,operating_unit' }),
            ]);

            if (settingsResult.error || scoresResult.error) {
                console.error('Unable to save awards controller:', settingsResult.error || scoresResult.error);
                setError('Awards controller could not be saved. Check migration/table permissions.');
                return;
            }

            setSettings(normalizedSettings);
            setDraftSettings(normalizedSettings);
            const normalizedManual = ensureManualRows(rowsToSave as AwardManualScore[], effectiveYear);
            setManualScores(normalizedManual);
            setDraftManualScores(normalizedManual);
            setMessage('Awards controller saved.');
        } finally {
            setSaving(false);
        }
    };

    const exportWorkbook = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.overall.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Points: row.totalPoints,
            Allotment: row.allocation,
            'Actual Obligation': row.obligation,
            'Actual Disbursement': row.disbursement,
            'Disbursement vs Allotment': row.disbursementVsAllotmentRate,
            'Disbursement vs Allotment Rank Points': row.breakdown.disbursementVsAllotmentRank,
            'Disbursement vs Allotment Completion Points': row.breakdown.disbursementVsAllotmentCompletion,
            'Disbursement vs Obligation': row.disbursementVsObligationRate,
            'Disbursement vs Obligation Rank Points': row.breakdown.disbursementVsObligationRank,
            'Disbursement vs Obligation Completion Points': row.breakdown.disbursementVsObligationCompletion,
            'Physical Completion': row.physicalCompletionRate,
            'Physical Rank Points': row.breakdown.physicalCompletionRank,
            'Physical Completion Points': row.breakdown.physicalCompletionBand,
            'Financial Top 4 Quarters': row.financialTop4Quarters,
            'Financial Consistency Points': row.breakdown.financialConsistency,
            'Physical Top 4 Quarters': row.physicalTop4Quarters,
            'Physical Consistency Points': row.breakdown.physicalConsistency,
            'Attendance Missed': row.attendanceMissed,
            'Attendance Points': row.breakdown.nationalAttendance,
        }))), 'Annual Overall');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.financial.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Points: row.totalPoints,
            Allotment: row.allocation,
            'Actual Obligation': row.obligation,
            'Actual Disbursement': row.disbursement,
            'Disbursement vs Allotment': row.disbursementVsAllotmentRate,
            'Disbursement vs Allotment Rank Points': row.breakdown.disbursementVsAllotmentRank,
            'Disbursement vs Allotment Completion Points': row.breakdown.disbursementVsAllotmentCompletion,
            'Disbursement vs Obligation': row.disbursementVsObligationRate,
            'Disbursement vs Obligation Rank Points': row.breakdown.disbursementVsObligationRank,
            'Disbursement vs Obligation Completion Points': row.breakdown.disbursementVsObligationCompletion,
            'Consistent Performance Quarters': row.financialTop4Quarters,
            'Consistent Performance Points': row.breakdown.financialConsistency,
        }))), 'Annual Financial');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.physical.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Points: row.totalPoints,
            'Physical Completion': row.physicalCompletionRate,
            'Physical Rank Points': row.breakdown.physicalCompletionRank,
            'Physical Completion Points': row.breakdown.physicalCompletionBand,
            'Consistent Performance Quarters': row.physicalTop4Quarters,
            'Consistent Performance Points': row.breakdown.physicalConsistency,
        }))), 'Annual Physical');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.mostIposAssisted.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            'Actual IPOs': row.score,
            'Target IPOs': row.target || 0,
        }))), 'Most IPOs Assisted');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.mostAttendance.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Attendance: row.score,
        }))), 'Attendance');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.mostTrainings.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Trainings: row.score,
        }))), 'Most Trainings');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.mostSubprojects.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Subprojects: row.score,
        }))), 'Most Subprojects');
        awardsData.quarters.forEach(quarter => {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quarter.physicalOverall.map(row => ({
                Status: quarter.statusLabel,
                Rank: row.rank,
                OU: row.ou,
                'Component Points': row.componentPoints,
                'Overall Rank Points': row.rankPoints,
            }))), `${quarter.period} Physical`);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quarter.financial.map(row => ({
                Status: quarter.statusLabel,
                Rank: row.rank,
                OU: row.ou,
                Allocation: row.allocation,
                Obligation: row.obligation,
                Disbursement: row.disbursement,
                'Obligation Rate': row.obligationRate,
                'Disbursement Rate': row.disbursementRate,
                Score: row.score,
                Points: row.points,
            }))), `${quarter.period} Financial`);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(physicalDetailRows.map(row => ({
            Period: row.period,
            Component: row.componentLabel,
            Rank: row.rank,
            OU: row.ou,
            Points: row.points,
            Score: row.score,
            Completion: row.completionRate,
            'Activities Conducted': row.metrics.activitiesConducted || 0,
            'IPOs Trained': row.metrics.iposTrained || 0,
            'Trainings Conducted': row.metrics.trainingsConducted || 0,
            'Subprojects Provided': row.metrics.subprojectsProvided || 0,
            'IPOs Assisted': row.metrics.iposAssisted || 0,
            'Reports Submitted': row.metrics.reportorialSubmitted || 0,
            'Reports Required': row.metrics.reportorialRequired || 0,
            'National Activities Attended': row.metrics.nationalAttended || 0,
            'National Activities Required': row.metrics.nationalRequired || 0,
            'Targets Due': row.metrics.targetsDue || 0,
            'Targets Completed': row.metrics.targetsCompleted || 0,
        }))), 'Quarter Physical Details');
        XLSX.writeFile(wb, `Awards_Rankings_FY${awardsData.effectiveYear}.xlsx`);
    };

    if (!isAdmin) {
        return (
            <section className="dashboard-panel award-access-panel">
                <h3 className="dashboard-panel__title">Awards and Rankings</h3>
                <p className="dashboard-empty">This dashboard is available only to Administrator and Super Admin users.</p>
            </section>
        );
    }

    const annualWinner = awardsData.annual.overall[0];
    const financialWinner = awardsData.annual.financial[0];
    const physicalWinner = awardsData.annual.physical[0];

    return (
        <div className="awards-dashboard dashboard-view">
            <section className="award-hero dashboard-panel">
                <div>
                    <span className="award-eyebrow">Awards and Rankings</span>
                    <h3 className="dashboard-module-title">OU Awarding Dashboard</h3>
                    <p>Fund Year {awardsData.effectiveYear} / {selectedTier} / {selectedFundType}</p>
                    {error && <p className="award-message award-message--error">{error}</p>}
                    {message && <p className="award-message award-message--success">{message}</p>}
                </div>
                <div className="award-hero__actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-responsive"
                        onClick={() => setControllerOpen(prev => !prev)}
                        aria-expanded={controllerOpen}
                        aria-controls="award-controller"
                    >
                        <SlidersHorizontal className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Award Controller</span>
                        <ChevronDown className={`btn-symbol ${controllerOpen ? 'is-open' : ''}`} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn-primary btn-responsive" onClick={exportWorkbook}>
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Export</span>
                    </button>
                </div>
            </section>

            {controllerOpen && (
                <section id="award-controller" className="award-controller dashboard-panel">
                    <div className="dashboard-panel__header">
                        <div>
                            <h3 className="dashboard-panel__title">Award Controller</h3>
                            <span className="award-panel__meta">{loading ? 'Loading saved controller...' : hasChanges ? 'Unsaved changes' : 'Saved settings active'}</span>
                        </div>
                        <div className="award-controller__actions">
                            <button type="button" className="btn btn-secondary btn-responsive" onClick={() => {
                                setDraftSettings(DEFAULT_AWARD_SETTINGS);
                                setMessage('');
                            }} disabled={saving}>
                                <RotateCcw className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Reset Formulas</span>
                            </button>
                            <button type="button" className="btn btn-secondary btn-responsive" onClick={() => {
                                setDraftSettings(settings);
                                setDraftManualScores(manualScores);
                                setMessage('');
                            }} disabled={!hasChanges || saving}>
                                <span className="btn-text">Cancel</span>
                            </button>
                            <button type="button" className="btn btn-primary btn-responsive" onClick={saveController} disabled={!hasChanges || saving || loading}>
                                <Save className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">{saving ? 'Saving...' : 'Save'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="award-controller-grid">
                        <div className="award-controller-card">
                            <h4>Quarterly Physical Weights</h4>
                            {(Object.entries(draftSettings.quarterlyPhysicalWeights) as Array<[AwardPhysicalComponentKey, Record<string, number>]>).map(([component, weights]) => (
                                <div key={component} className="award-form-group">
                                    <strong>{componentLabels[component]}</strong>
                                    {Object.entries(weights).map(([key, value]) => (
                                        <label key={key}>
                                            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                                            <input type="number" value={value} onChange={event => updateQuarterWeight(component, key, event.target.value)} />
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="award-controller-card">
                            <h4>Rank and Financial Rules</h4>
                            <div className="award-form-group">
                                <strong>Quarter Rank Points</strong>
                                {[1, 2, 3, 4, 5].map(rank => (
                                    <label key={rank}>
                                        <span>Rank {rank}</span>
                                        <input type="number" value={draftSettings.quarterlyRankPoints[String(rank)] || 0} onChange={event => updateSimpleSetting('quarterlyRankPoints', String(rank), event.target.value)} />
                                    </label>
                                ))}
                                <label>
                                    <span>Rest</span>
                                    <input type="number" value={draftSettings.quarterlyRestPoints} onChange={event => setDraftSettings(current => ({ ...current, quarterlyRestPoints: Number(event.target.value) || 0 }))} />
                                </label>
                            </div>
                            <div className="award-form-group">
                                <strong>Quarter Financial Weights</strong>
                                <label>
                                    <span>Disbursement vs Allotment</span>
                                    <input type="number" value={draftSettings.quarterlyFinancialWeights.disbursementVsAllotment} onChange={event => updateFinancialWeight('disbursementVsAllotment', event.target.value)} />
                                </label>
                                <label>
                                    <span>Obligation vs Allotment</span>
                                    <input type="number" value={draftSettings.quarterlyFinancialWeights.obligationVsAllotment} onChange={event => updateFinancialWeight('obligationVsAllotment', event.target.value)} />
                                </label>
                            </div>
                            <div className="award-form-group">
                                <strong>Annual Rank Points</strong>
                                {[1, 2, 3, 4].map(rank => (
                                    <label key={rank}>
                                        <span>Rank {rank}</span>
                                        <input type="number" value={draftSettings.annualRankPoints[String(rank)] || 0} onChange={event => updateSimpleSetting('annualRankPoints', String(rank), event.target.value)} />
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="award-manual-controller">
                        <div className="award-manual-controller__tabs">
                            {AWARD_PERIODS.map(period => (
                                <button key={period} type="button" className={activeManualPeriod === period ? 'is-active' : ''} onClick={() => setActiveManualPeriod(period)}>
                                    {period}
                                </button>
                            ))}
                        </div>
                        <div className="data-table-scroll custom-scrollbar">
                            <table className="data-table award-table award-manual-table">
                                <thead>
                                    <tr>
                                        <th>OU</th>
                                        <th className="data-table__numeric">Reports Required</th>
                                        <th className="data-table__numeric">Reports Submitted</th>
                                        <th className="data-table__numeric">Activities Required</th>
                                        <th className="data-table__numeric">Activities Attended</th>
                                        <th>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ensureManualRows(draftManualScores, effectiveYear)
                                        .filter(row => row.period === activeManualPeriod)
                                        .map(row => (
                                            <tr key={`${row.period}-${row.operating_unit}`}>
                                                <td className="data-table__emphasis">{row.operating_unit}</td>
                                                <td className="data-table__numeric"><input type="number" value={row.reportorial_required} onChange={event => updateManual(row.period, row.operating_unit, 'reportorial_required', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.reportorial_submitted} onChange={event => updateManual(row.period, row.operating_unit, 'reportorial_submitted', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.national_activities_required} onChange={event => updateManual(row.period, row.operating_unit, 'national_activities_required', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.national_activities_attended} onChange={event => updateManual(row.period, row.operating_unit, 'national_activities_attended', event.target.value)} /></td>
                                                <td><input type="text" value={row.remarks || ''} onChange={event => updateManual(row.period, row.operating_unit, 'remarks', event.target.value)} /></td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            <section className="award-summary-grid">
                <article className="award-summary-card award-summary-card--gold">
                    <Trophy aria-hidden="true" />
                    <span>Overall Top Performance</span>
                    <strong>{annualWinner?.ou || 'No Data'}</strong>
                    <small>{annualWinner ? `${formatScore(annualWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <BarChart3 aria-hidden="true" />
                    <span>Top Financial Performance</span>
                    <strong>{financialWinner?.ou || 'No Data'}</strong>
                    <small>{financialWinner ? `${formatScore(financialWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <Medal aria-hidden="true" />
                    <span>Top Physical Performance</span>
                    <strong>{physicalWinner?.ou || 'No Data'}</strong>
                    <small>{physicalWinner ? `${formatScore(physicalWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <CalendarDays aria-hidden="true" />
                    <span>Awarding Timeline</span>
                    <strong>Quarterly + Year End</strong>
                    <small>{awardQuarters.join(', ')} and annual awards</small>
                </article>
            </section>

            <section className="award-section">
                <div className="award-section__header">
                    <div>
                        <span>Annual Awards</span>
                        <h3>Year-End Award Rankings</h3>
                    </div>
                </div>
                <div className="award-annual-grid">
                    <LeaderboardTable
                        title="Overall Top Performance"
                        rows={awardsData.annual.overall}
                        columns={[
                            { key: 'allotment', label: 'Annual Allotment', render: row => formatCurrency(row.allocation) },
                            { key: 'obligation', label: 'Actual Obligation', render: row => formatCurrency(row.obligation) },
                            { key: 'disbursement', label: 'Actual Disbursement', render: row => formatCurrency(row.disbursement) },
                            { key: 'disb-allotment', label: 'Disb / Allot', render: row => formatPercent(row.disbursementVsAllotmentRate) },
                            { key: 'disb-allotment-points', label: 'Disb / Allot Pts', render: row => `${formatPoint(row.breakdown.disbursementVsAllotmentRank)} + ${formatPoint(row.breakdown.disbursementVsAllotmentCompletion)}` },
                            { key: 'disb-obli', label: 'Disb / Obli', render: row => formatPercent(row.disbursementVsObligationRate) },
                            { key: 'disb-obli-points', label: 'Disb / Obli Pts', render: row => `${formatPoint(row.breakdown.disbursementVsObligationRank)} + ${formatPoint(row.breakdown.disbursementVsObligationCompletion)}` },
                            { key: 'physical', label: 'Physical Completion', render: row => formatPercent(row.physicalCompletionRate) },
                            { key: 'physical-points', label: 'Physical Pts', render: row => `${formatPoint(row.breakdown.physicalCompletionRank)} + ${formatPoint(row.breakdown.physicalCompletionBand)}` },
                            { key: 'financial-consistency', label: 'Financial Consistent Performance', render: row => formatCountPoints(row.financialTop4Quarters, row.breakdown.financialConsistency) },
                            { key: 'physical-consistency', label: 'Physical Consistent Performance', render: row => formatCountPoints(row.physicalTop4Quarters, row.breakdown.physicalConsistency) },
                            { key: 'attendance', label: 'Attendance Pts', render: row => formatPoint(row.breakdown.nationalAttendance) },
                        ]}
                    />
                    <LeaderboardTable
                        title="Top Financial Performance"
                        rows={awardsData.annual.financial}
                        columns={[
                            { key: 'allotment', label: 'Annual Allotment', render: row => formatCurrency(row.allocation) },
                            { key: 'obligation', label: 'Actual Obligation', render: row => formatCurrency(row.obligation) },
                            { key: 'disbursement', label: 'Actual Disbursement', render: row => formatCurrency(row.disbursement) },
                            { key: 'disb-allotment', label: 'Disb / Allot', render: row => formatPercent(row.disbursementVsAllotmentRate) },
                            { key: 'disb-allotment-points', label: 'Disb / Allot Pts', render: row => `${formatPoint(row.breakdown.disbursementVsAllotmentRank)} + ${formatPoint(row.breakdown.disbursementVsAllotmentCompletion)}` },
                            { key: 'disb-obli', label: 'Disb / Obli', render: row => formatPercent(row.disbursementVsObligationRate) },
                            { key: 'disb-obli-points', label: 'Disb / Obli Pts', render: row => `${formatPoint(row.breakdown.disbursementVsObligationRank)} + ${formatPoint(row.breakdown.disbursementVsObligationCompletion)}` },
                            { key: 'consistent', label: 'Consistent Performance', render: row => formatCountPoints(row.financialTop4Quarters, row.breakdown.financialConsistency) },
                        ]}
                    />
                    <LeaderboardTable
                        title="Top Physical Performance"
                        rows={awardsData.annual.physical}
                        columns={[
                            { key: 'physical', label: 'Physical Completion', render: row => formatPercent(row.physicalCompletionRate) },
                            { key: 'physical-rank-points', label: 'Physical Rank Pts', render: row => formatPoint(row.breakdown.physicalCompletionRank) },
                            { key: 'physical-completion-points', label: 'Completion Rate Pts', render: row => formatPoint(row.breakdown.physicalCompletionBand) },
                            { key: 'consistent', label: 'Consistent Performance', render: row => formatCountPoints(row.physicalTop4Quarters, row.breakdown.physicalConsistency) },
                        ]}
                    />
                </div>

                <div className="award-special-grid">
                    <SpecialAwardsTable title="Most IPOs Assisted" rows={awardsData.annual.mostIposAssisted} valueLabel="Actual IPOs" showTarget />
                    <SpecialAwardsTable title="Committed to Attending National Activities" rows={awardsData.annual.mostAttendance} valueLabel="Attendance" />
                    <SpecialAwardsTable title="Most Trainings Conducted" rows={awardsData.annual.mostTrainings} valueLabel="Trainings" />
                    <SpecialAwardsTable title="Most Subprojects Provided" rows={awardsData.annual.mostSubprojects} valueLabel="Subprojects" />
                </div>
            </section>

            <section className="award-section">
                <div className="award-section__header">
                    <div>
                        <span>Quarterly Awards</span>
                        <h3>Quarter-Only Performance Rankings</h3>
                    </div>
                </div>
                <div className="award-quarter-list">
                    {awardsData.quarters.map(quarter => <QuarterLeaderboard key={quarter.period} quarter={quarter} />)}
                </div>
            </section>

            <section className="dashboard-panel award-panel award-detail-panel">
                <div className="dashboard-panel__header">
                    <div>
                        <h3 className="dashboard-panel__title">{quarterDetailTitle}</h3>
                        <span className="award-panel__meta">
                            {quarterDetailMode === 'financial'
                                ? 'Quarter actuals versus quarter due allotment'
                                : 'Quarter physical criteria counts and component points'}
                        </span>
                    </div>
                    <div className="award-detail-controls">
                        <div className="award-toggle-group" role="group" aria-label="Quarter detail type">
                            <button type="button" className={quarterDetailMode === 'financial' ? 'is-active' : ''} onClick={() => setQuarterDetailMode('financial')}>Financial Details</button>
                            <button type="button" className={quarterDetailMode === 'physical' ? 'is-active' : ''} onClick={() => setQuarterDetailMode('physical')}>Physical Details</button>
                        </div>
                        <div className="award-toggle-group" role="group" aria-label="Quarter detail period">
                            {awardQuarters.map(quarter => (
                                <button key={quarter} type="button" className={quarterDetailPeriod === quarter ? 'is-active' : ''} onClick={() => setQuarterDetailPeriod(quarter)}>
                                    {quarter}
                                </button>
                            ))}
                            <button type="button" className={quarterDetailPeriod === 'All' ? 'is-active' : ''} onClick={() => setQuarterDetailPeriod('All')}>Display All</button>
                        </div>
                    </div>
                </div>
                <div className="data-table-scroll custom-scrollbar">
                    {quarterDetailMode === 'financial' ? (
                        <table className="data-table award-table award-table--wide">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th>Rank</th>
                                    <th>OU</th>
                                    <th className="data-table__numeric">Quarter Allotment</th>
                                    <th className="data-table__numeric">Obligation</th>
                                    <th className="data-table__numeric">Disbursement</th>
                                    <th className="data-table__numeric">Obli Rate</th>
                                    <th className="data-table__numeric">Disb Rate</th>
                                    <th className="data-table__numeric">Score</th>
                                    <th className="data-table__numeric">Points</th>
                                </tr>
                            </thead>
                            <tbody>
                                {financialDetailRows.length > 0 ? financialDetailRows.map(row => (
                                    <tr key={`${row.period}-${row.ou}`}>
                                        <td>{row.period}</td>
                                        <td className="award-rank-text">{formatRank(row.rank)}</td>
                                        <td className="data-table__emphasis">{row.ou}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.allocation)}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.obligation)}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.disbursement)}</td>
                                        <td className="data-table__numeric">{formatPercent(row.obligationRate)}</td>
                                        <td className="data-table__numeric">{formatPercent(row.disbursementRate)}</td>
                                        <td className="data-table__numeric">{formatScore(row.score)}</td>
                                        <td className="data-table__numeric">{formatScore(row.points)}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={10} className="text-center">No active quarter data to display.</td></tr>
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table className="data-table award-table award-table--wide">
                            <thead>
                                <tr>
                                    <th>Period</th>
                                    <th>Component</th>
                                    <th>Rank</th>
                                    <th>OU</th>
                                    <th className="data-table__numeric">Points</th>
                                    <th className="data-table__numeric">Score</th>
                                    <th className="data-table__numeric">Completion</th>
                                    <th className="data-table__numeric">Activities / Trainings</th>
                                    <th className="data-table__numeric">IPOs Trained</th>
                                    <th className="data-table__numeric">Subprojects</th>
                                    <th className="data-table__numeric">IPOs Assisted</th>
                                    <th className="data-table__numeric">Reports</th>
                                    <th className="data-table__numeric">National Attendance</th>
                                    <th className="data-table__numeric">Targets</th>
                                </tr>
                            </thead>
                            <tbody>
                                {physicalDetailRows.length > 0 ? physicalDetailRows.map(row => (
                                    <tr key={`${row.period}-${row.component}-${row.ou}`}>
                                        <td>{row.period}</td>
                                        <td>{row.componentLabel}</td>
                                        <td className="award-rank-text">{formatRank(row.rank)}</td>
                                        <td className="data-table__emphasis">{row.ou}</td>
                                        <td className="data-table__numeric">{formatScore(row.points)}</td>
                                        <td className="data-table__numeric">{formatScore(row.score)}</td>
                                        <td className="data-table__numeric">{formatPercent(row.completionRate)}</td>
                                        <td className="data-table__numeric">{row.metrics.activitiesConducted ?? row.metrics.trainingsConducted ?? '-'}</td>
                                        <td className="data-table__numeric">{row.metrics.iposTrained ?? '-'}</td>
                                        <td className="data-table__numeric">{row.metrics.subprojectsProvided ?? '-'}</td>
                                        <td className="data-table__numeric">{row.metrics.iposAssisted ?? '-'}</td>
                                        <td className="data-table__numeric">{row.metrics.reportorialRequired ? `${row.metrics.reportorialSubmitted || 0} / ${row.metrics.reportorialRequired}` : '-'}</td>
                                        <td className="data-table__numeric">{row.metrics.nationalRequired ? `${row.metrics.nationalAttended || 0} / ${row.metrics.nationalRequired}` : '-'}</td>
                                        <td className="data-table__numeric">{`${row.metrics.targetsCompleted || 0} / ${row.metrics.targetsDue || 0}`}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={14} className="text-center">No active quarter data to display.</td></tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    );
};

export default AwardsRankingsDashboard;
