// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeftRight, ArrowRight, Banknote, Ban, ChevronLeft, ChevronRight,
    CirclePercent, ClipboardCheck, Download, Gauge, PiggyBank, Scale, Wallet,
} from 'lucide-react';
import {
    Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
    IPO, OfficeRequirement, OtherActivity, OtherProgramExpense,
    StaffingRequirement, Subproject, Training,
} from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import {
    collectFinancialLineItems, FINANCIAL_COMPONENTS,
    FinancialAggregationFilters, FinancialLineItem,
} from '../../lib/financialAggregation';
import { generateFinancialPowerPoint } from '../../lib/financialPowerPoint';
import { parseLocation } from '../LocationPicker';

declare const PptxGenJS: any;

interface FinancialDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
    selectedYearProp?: string;
    selectedOuProp?: string;
    selectedTierProp?: string;
    selectedFundTypeProp?: string;
}

type AdjustmentType = 'Savings' | 'Realignment' | 'Cancelled';
type BreakdownView = 'component' | 'operatingUnit' | 'province';
type Bucket = { label: string; allocation: number; obligation: number; disbursement: number };
type AdjustmentRow = { id: string; type: AdjustmentType; component: string; source: string; amount: number; reason: string };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE_SIZE = 8;
const COMPONENT_COLORS: Record<string, string> = {
    'Social Preparation': '#2563eb',
    'Production and Livelihood': '#16a34a',
    'Marketing and Enterprise': '#7c3aed',
    'Program Management': '#f59e0b',
};

const money = (amount: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(Math.ceil(amount));

const compactMoney = (amount: number) => {
    const absolute = Math.abs(amount);
    if (absolute >= 1e9) return `₱${(amount / 1e9).toFixed(1)}B`;
    if (absolute >= 1e6) return `₱${(amount / 1e6).toFixed(1)}M`;
    if (absolute >= 1e3) return `₱${(amount / 1e3).toFixed(0)}K`;
    return `₱${Math.ceil(amount).toLocaleString('en-PH')}`;
};

const rate = (value: number, base: number) => base > 0 ? (value / base) * 100 : 0;
const percent = (value: number) => `${value.toFixed(1)}%`;

const adjustmentType = (item: FinancialLineItem): AdjustmentType | null => {
    if (item.lineTag === 'Cancelled' || item.isCancelledLine || item.status === 'Cancelled') return 'Cancelled';
    if (item.lineTag === 'Realignment' || item.isRealignment) return 'Realignment';
    if (item.lineTag === 'Savings' || item.isSavings) return 'Savings';
    return null;
};

const lineLabel = (item: FinancialLineItem) => item.line.expenseParticular
    || item.line.particulars || item.line.equipment || item.line.personnelPosition
    || item.activityName || 'Financial item';

const aggregate = (items: FinancialLineItem[], labelFor: (item: FinancialLineItem) => string) => {
    const map = new Map<string, Bucket>();
    items.forEach(item => {
        const label = labelFor(item) || 'Unspecified';
        const bucket = map.get(label) || { label, allocation: 0, obligation: 0, disbursement: 0 };
        bucket.allocation += item.alloc;
        bucket.obligation += item.obli;
        bucket.disbursement += item.disb;
        map.set(label, bucket);
    });
    return Array.from(map.values());
};

const SectionHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <div className="fd-section-header"><h3>{title}</h3>{action}</div>
);

const Kpi = ({ label, value, meta, icon, tone }: {
    label: string; value: string; meta: string; icon: React.ReactNode; tone: string;
}) => (
    <article className={`fd-kpi fd-kpi--${tone}`}>
        <div className="fd-kpi__top"><span className="fd-kpi__icon">{icon}</span><span>{label}</span></div>
        <strong title={value}>{value}</strong><small>{meta}</small>
    </article>
);

const Pager = ({ page, pages, setPage }: { page: number; pages: number; setPage: (page: number) => void }) => (
    <div className="fd-pager">
        <span>Page {page} of {pages}</span>
        <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></button>
        </div>
    </div>
);

const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return <div className="fd-tooltip">
        <strong>{label || payload[0]?.name}</strong>
        {payload.map((entry: any) => <div key={entry.dataKey || entry.name}>
            <i style={{ background: entry.color || entry.payload?.fill }} />{entry.name}: {money(Number(entry.value) || 0)}
        </div>)}
    </div>;
};

const Donut = ({ title, total, data }: {
    title: string; total: number; data: Array<{ label: string; value: number; color: string }>;
}) => {
    const visible = data.filter(item => item.value > 0);
    return <article className="fd-donut-card">
        <h4>{title}</h4>
        {visible.length === 0 ? <div className="fd-empty">No tagged amounts</div> : <div className="fd-donut-layout">
            <div className="fd-donut-chart">
                <ResponsiveContainer width="100%" height={180}>
                    <PieChart><Pie data={visible} dataKey="value" nameKey="label" innerRadius={51} outerRadius={74} paddingAngle={2} stroke="none">
                        {visible.map(item => <Cell key={item.label} fill={item.color} />)}
                    </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
                </ResponsiveContainer>
                <div><strong>{compactMoney(total)}</strong><span>Total</span></div>
            </div>
            <div className="fd-donut-legend">{visible.map(item => <div key={item.label}>
                <i style={{ background: item.color }} /><span>{item.label}</span><strong>{compactMoney(item.value)}</strong>
            </div>)}</div>
        </div>}
    </article>;
};

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
    data, selectedYearProp, selectedOuProp, selectedTierProp, selectedFundTypeProp,
}) => {
    const { currentUser } = useAuth();
    const canViewMatrix = currentUser?.role === 'Administrator' || currentUser?.role === 'Management';
    const selectedYear = selectedYearProp || new Date().getFullYear().toString();
    const selectedOu = selectedOuProp || (canViewMatrix ? 'All' : (currentUser?.operatingUnit || 'All'));
    const selectedTier = selectedTierProp || 'Tier 1';
    const selectedFundType = selectedFundTypeProp || 'Current';
    const [view, setView] = useState<BreakdownView>('component');
    const [breakdownPage, setBreakdownPage] = useState(1);
    const [adjustmentPage, setAdjustmentPage] = useState(1);
    const [isPowerPointExporting, setIsPowerPointExporting] = useState(false);
    const [powerPointExportMessage, setPowerPointExportMessage] = useState<string | null>(null);

    const filters = useMemo<FinancialAggregationFilters>(() => ({
        year: selectedYear, operatingUnit: selectedOu, tier: selectedTier,
        fundType: selectedFundType, includeTaggedExclusions: true,
    }), [selectedYear, selectedOu, selectedTier, selectedFundType]);

    const items = useMemo(() => collectFinancialLineItems({
        subprojects: data.subprojects || [],
        activities: [...(data.trainings || []), ...(data.otherActivities || [])],
        officeReqs: data.officeReqs || [], staffingReqs: data.staffingReqs || [],
        otherProgramExpenses: data.otherProgramExpenses || [],
    }, filters), [data, filters]);

    const totals = useMemo(() => items.reduce((sum, item) => {
        sum.allocation += item.alloc; sum.obligation += item.obli; sum.disbursement += item.disb;
        const type = adjustmentType(item); const excluded = item.excludedTargetAllocation || 0;
        if (type === 'Savings') sum.savings += excluded;
        if (type === 'Realignment') sum.realignment += excluded;
        if (type === 'Cancelled') sum.cancelled += excluded;
        return sum;
    }, { allocation: 0, obligation: 0, disbursement: 0, savings: 0, realignment: 0, cancelled: 0 }), [items]);

    const componentRows = useMemo(() => {
        const map = new Map(aggregate(items, item => item.component).map(row => [row.label, row]));
        return FINANCIAL_COMPONENTS.map(label => map.get(label) || { label, allocation: 0, obligation: 0, disbursement: 0 });
    }, [items]);
    const ouRows = useMemo(() => aggregate(items, item => item.operatingUnit || 'Unspecified')
        .filter(row => row.allocation || row.obligation || row.disbursement)
        .sort((a, b) => b.allocation - a.allocation || a.label.localeCompare(b.label)), [items]);
    const provinceRows = useMemo(() => aggregate(items, item => parseLocation(item.location || '').province || 'Unspecified')
        .filter(row => row.allocation || row.obligation || row.disbursement)
        .sort((a, b) => a.label === 'Unspecified' ? 1 : b.label === 'Unspecified' ? -1 : b.allocation - a.allocation), [items]);

    const monthly = useMemo(() => {
        let cumulativeObligation = 0, cumulativeDisbursement = 0;
        return MONTHS.map((month, index) => {
            const obligation = items.reduce((sum, item) => sum + item.obligationByMonth[index], 0);
            const disbursement = items.reduce((sum, item) => sum + item.disbursementByMonth[index], 0);
            cumulativeObligation += obligation; cumulativeDisbursement += disbursement;
            return { month, obligation, disbursement, cumulativeObligation, cumulativeDisbursement };
        });
    }, [items]);

    const adjustmentRows = useMemo<AdjustmentRow[]>(() => items.flatMap((item, index) => {
        const type = adjustmentType(item), amount = item.excludedTargetAllocation || 0;
        return !type || !amount ? [] : [{
            id: `${item.sourceType}-${item.recordId || index}-${item.line.id || index}`,
            type, component: item.component, source: lineLabel(item), amount,
            reason: item.line.adjustmentReason || '—',
        }];
    }).sort((a, b) => b.amount - a.amount || a.source.localeCompare(b.source)), [items]);

    const adjustmentChart = (type: AdjustmentType) => FINANCIAL_COMPONENTS.map(component => ({
        label: component,
        value: items.reduce((sum, item) => adjustmentType(item) === type && item.component === component
            ? sum + (item.excludedTargetAllocation || 0) : sum, 0),
        color: COMPONENT_COLORS[component],
    }));
    const savingsChart = useMemo(() => adjustmentChart('Savings'), [items]);
    const realignmentChart = useMemo(() => adjustmentChart('Realignment'), [items]);

    const breakdownRows = view === 'component' ? componentRows : view === 'operatingUnit' ? ouRows : provinceRows;
    const breakdownPages = Math.max(1, Math.ceil(breakdownRows.length / PAGE_SIZE));
    const adjustmentPages = Math.max(1, Math.ceil(adjustmentRows.length / PAGE_SIZE));
    const shownBreakdown = breakdownRows.slice((breakdownPage - 1) * PAGE_SIZE, breakdownPage * PAGE_SIZE);
    const shownAdjustments = adjustmentRows.slice((adjustmentPage - 1) * PAGE_SIZE, adjustmentPage * PAGE_SIZE);

    useEffect(() => setBreakdownPage(1), [view, filters]);
    useEffect(() => setBreakdownPage(page => Math.min(page, breakdownPages)), [breakdownPages]);
    useEffect(() => setAdjustmentPage(page => Math.min(page, adjustmentPages)), [adjustmentPages]);

    const obligationRate = rate(totals.obligation, totals.allocation);
    const disbursementEfficiency = rate(totals.disbursement, totals.obligation);
    const unobligated = totals.allocation - totals.obligation;
    const undisbursed = totals.obligation - totals.disbursement;
    const totalAdjustments = totals.savings + totals.realignment + totals.cancelled;

    const exportPptx = async () => {
        if (isPowerPointExporting) return;
        if (typeof PptxGenJS === 'undefined') {
            setPowerPointExportMessage('PowerPoint export library is still loading. Please try again in a moment.');
            return;
        }
        if (totals.allocation === 0 && totals.obligation === 0 && totals.disbursement === 0 && totalAdjustments === 0) {
            setPowerPointExportMessage('No financial dashboard data is available for the current filter selection.');
            return;
        }

        setIsPowerPointExporting(true);
        setPowerPointExportMessage(null);
        try {
            await generateFinancialPowerPoint({
                selectedYear,
                selectedOu,
                selectedTier,
                selectedFundType,
                totals,
                componentRows,
                monthlyRows: monthly,
                savingsByComponent: savingsChart,
                realignmentByComponent: realignmentChart,
            });
            setPowerPointExportMessage('PowerPoint file generated successfully.');
        } catch (error) {
            console.error('Financial PowerPoint export failed:', error);
            setPowerPointExportMessage('PowerPoint export failed. Please refresh the dashboard and try again.');
        } finally {
            setIsPowerPointExporting(false);
        }
    };

    return <div className="fd-dashboard dashboard-view animate-fadeIn">
        <header className="fd-page-header"><h1>Financial Performance</h1>
            <div className="fd-export-group">
                {powerPointExportMessage && <span className="fd-export-message" role="status">{powerPointExportMessage}</span>}
                <button type="button" className="btn btn-primary fd-export" onClick={exportPptx} disabled={isPowerPointExporting}>
                    <Download /><span>{isPowerPointExporting ? 'Generating...' : 'Generate PowerPoint'}</span>
                </button>
            </div>
        </header>

        <section><SectionHeader title="Financial Summary" /><div className="fd-kpi-grid">
            <Kpi label="Target Allocation" value={money(totals.allocation)} meta="After tagged exclusions" icon={<Wallet />} tone="allocation" />
            <Kpi label="Actual Obligated" value={money(totals.obligation)} meta={`${percent(obligationRate)} of Allocation`} icon={<ClipboardCheck />} tone="obligation" />
            <Kpi label="Actual Disbursed" value={money(totals.disbursement)} meta={`${percent(disbursementEfficiency)} of Obligations`} icon={<Banknote />} tone="disbursement" />
            <Kpi label="Obligation Rate" value={percent(obligationRate)} meta="Obligated / Allocation" icon={<Gauge />} tone="rate" />
            <Kpi label="Disbursement Efficiency" value={percent(disbursementEfficiency)} meta="Disbursed / Obligated" icon={<CirclePercent />} tone="efficiency" />
            <Kpi label={unobligated < 0 ? 'Over-obligated' : 'Unobligated Balance'} value={money(Math.abs(unobligated))} meta="Allocation − Obligation" icon={<Scale />} tone={unobligated < 0 ? 'warning' : 'balance'} />
        </div></section>

        <section className="fd-panel"><SectionHeader title="Budget Utilization" /><div className="fd-pipeline">
            <div className="fd-stage"><span>Active Allocation</span><strong>{money(totals.allocation)}</strong><small>100%</small></div>
            <div className="fd-arrow"><span>{percent(obligationRate)}</span><ArrowRight /></div>
            <div className="fd-stage fd-stage--blue"><span>Obligated</span><strong>{money(totals.obligation)}</strong><small>{percent(obligationRate)} of allocation</small></div>
            <div className="fd-arrow"><span>{percent(disbursementEfficiency)}</span><ArrowRight /></div>
            <div className="fd-stage fd-stage--green"><span>Disbursed</span><strong>{money(totals.disbursement)}</strong><small>{percent(disbursementEfficiency)} of obligations</small></div>
        </div><div className="fd-gaps">
            <div><span>Unobligated</span><strong className={unobligated < 0 ? 'fd-negative' : ''}>{money(unobligated)}</strong></div>
            <div><span>Undisbursed Obligations</span><strong className={undisbursed < 0 ? 'fd-negative' : ''}>{money(undisbursed)}</strong></div>
        </div></section>

        <section className="fd-panel"><SectionHeader title="Financial Performance by Component" /><div className="fd-table-scroll">
            <table className="fd-table fd-component-table"><thead><tr><th>Component</th><th>Performance</th><th>Allocation</th><th>Obligated</th><th>Disbursed</th><th>Obligation Rate</th><th>Disbursement Efficiency</th></tr></thead>
                <tbody>{componentRows.map(row => { const max = Math.max(row.allocation, row.obligation, row.disbursement, 1); return <tr key={row.label}>
                    <td><span className="fd-component"><i style={{ background: COMPONENT_COLORS[row.label] }} /><strong>{row.label}</strong></span></td>
                    <td><span className="fd-inline-bars"><i style={{ width: `${row.allocation / max * 100}%` }} /><i style={{ width: `${row.obligation / max * 100}%` }} /><i style={{ width: `${row.disbursement / max * 100}%` }} /></span></td>
                    <td>{money(row.allocation)}</td><td>{money(row.obligation)}</td><td>{money(row.disbursement)}</td>
                    <td className="fd-rate">{percent(rate(row.obligation, row.allocation))}</td><td className="fd-rate">{percent(rate(row.disbursement, row.obligation))}</td>
                </tr>; })}</tbody>
                <tfoot><tr><td colSpan={2}>Total</td><td>{money(totals.allocation)}</td><td>{money(totals.obligation)}</td><td>{money(totals.disbursement)}</td><td>{percent(obligationRate)}</td><td>{percent(disbursementEfficiency)}</td></tr></tfoot>
            </table></div></section>

        <section><SectionHeader title="Budget Adjustments" /><div className="fd-adjustment-kpis">
            <article><PiggyBank /><span><small>Tagged Savings</small><strong>{money(totals.savings)}</strong></span></article>
            <article><ArrowLeftRight /><span><small>Realigned Amount</small><strong>{money(totals.realignment)}</strong></span></article>
            <article><Ban /><span><small>Cancelled Amount</small><strong>{money(totals.cancelled)}</strong></span></article>
            <article><Scale /><span><small>Total Adjustments</small><strong>{money(totalAdjustments)}</strong></span></article>
        </div><div className="fd-donut-grid"><Donut title="Savings by Component" total={totals.savings} data={savingsChart} /><Donut title="Realignment by Component" total={totals.realignment} data={realignmentChart} /></div></section>

        <section className="fd-panel fd-chart-panel"><SectionHeader title="Monthly Financial Trend" action={<span className="fd-muted">Amounts in PHP</span>} />
            <div className="fd-chart-legend"><span><i className="bar-blue" />Obligation</span><span><i className="bar-green" />Disbursement</span><span><i className="line-blue" />Cumulative Obligation</span><span><i className="line-green" />Cumulative Disbursement</span></div>
            <div className="fd-monthly-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly} margin={{ top: 18, right: 18, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--fd-grid)" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickFormatter={compactMoney} tickLine={false} axisLine={false} width={66} />
                <Tooltip content={<ChartTooltip />} /><Bar dataKey="obligation" name="Obligation" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={18} /><Bar dataKey="disbursement" name="Disbursement" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="cumulativeObligation" name="Cumulative Obligation" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2.5 }} /><Line type="monotone" dataKey="cumulativeDisbursement" name="Cumulative Disbursement" stroke="#15803d" strokeWidth={2.5} dot={{ r: 2.5 }} />
            </ComposedChart></ResponsiveContainer></div>
        </section>

        <section className="fd-panel fd-fixed-table"><SectionHeader title="Financial Breakdown" action={<div className="fd-segmented">
            <button type="button" className={view === 'component' ? 'active' : ''} onClick={() => setView('component')}>Component</button>
            {canViewMatrix && <button type="button" className={view === 'operatingUnit' ? 'active' : ''} onClick={() => setView('operatingUnit')}>Operating Unit</button>}
            <button type="button" className={view === 'province' ? 'active' : ''} onClick={() => setView('province')}>Province</button>
        </div>} /><div className="fd-table-scroll fd-table-scroll--fixed"><table className="fd-table"><thead><tr><th>{view === 'component' ? 'Component' : view === 'operatingUnit' ? 'Operating Unit' : 'Province'}</th><th>Allocation</th><th>Obligated</th><th>Disbursed</th><th>Obligation Rate</th><th>Disbursement Efficiency</th></tr></thead>
            <tbody>{shownBreakdown.length ? shownBreakdown.map(row => <tr key={row.label}><td><strong>{row.label}</strong></td><td>{money(row.allocation)}</td><td>{money(row.obligation)}</td><td>{money(row.disbursement)}</td><td className="fd-rate">{percent(rate(row.obligation, row.allocation))}</td><td className="fd-rate">{percent(rate(row.disbursement, row.obligation))}</td></tr>) : <tr><td colSpan={6}><div className="fd-empty">No financial records for this view</div></td></tr>}</tbody>
        </table></div><Pager page={breakdownPage} pages={breakdownPages} setPage={setBreakdownPage} /></section>

        <section className="fd-panel fd-fixed-table"><SectionHeader title="Budget Adjustment Register" action={<span className="fd-muted">{adjustmentRows.length} items</span>} /><div className="fd-table-scroll fd-table-scroll--fixed"><table className="fd-table fd-adjustment-table"><thead><tr><th>Type</th><th>Component</th><th>Financial Item</th><th>Amount</th><th>Reason</th></tr></thead>
            <tbody>{shownAdjustments.length ? shownAdjustments.map(row => <tr key={row.id}><td><span className={`fd-tag fd-tag--${row.type.toLowerCase()}`}>{row.type}</span></td><td>{row.component}</td><td><strong>{row.source}</strong></td><td>{money(row.amount)}</td><td title={row.reason}>{row.reason}</td></tr>) : <tr><td colSpan={5}><div className="fd-empty">No tagged budget adjustments</div></td></tr>}</tbody>
        </table></div><Pager page={adjustmentPage} pages={adjustmentPages} setPage={setAdjustmentPage} /></section>
    </div>;
};

export default FinancialDashboard;
