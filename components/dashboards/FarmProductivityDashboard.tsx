// Author: 4K
import React, { useMemo } from 'react';
import {
    BarChart3,
    Download,
    Leaf,
    LineChart,
    PackageSearch,
    Sprout,
    Store,
    TrendingUp,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import { IPO, MarketingPartner, ouToRegionMap, Subproject, type MarketLinkageUnit } from '../../constants';
import { collectFinancialLineItems, FinancialAggregationFilters } from '../../lib/financialAggregation';
import { calculateMarketLinkageSales, createEmptyMarketQuantityTotals, formatMarketQuantityTotals } from '../../lib/marketSalesAggregation';
import { parseLocation } from '../LocationPicker';
import { XLSX } from '../reports/ReportUtils';
import { getSubprojectIpo, getSubprojectIpoName, resolveIpoByIdOrName } from '../../lib/entityIdentity';

interface Props {
    subprojects: Subproject[];
    ipos: IPO[];
    marketingPartners: MarketingPartner[];
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectIpo?: (ipo: IPO) => void;
    onSelectMarketingPartner?: (partner: MarketingPartner) => void;
}

type CommodityUnit = 'crop' | 'livestock';

interface CommodityRow {
    key: string;
    commodityName: string;
    commodityType: string;
    unit: CommodityUnit;
    area: number;
    targetYieldKg: number;
    actualYieldKg: number;
    marketedYieldKg: number;
    foodSecurityYieldKg: number;
    unspecifiedYieldKg: number;
    marketingPercentage: number;
    foodSecurityPercentage: number;
    subprojectIncome: number;
    investment: number;
    subproject: Subproject;
    subprojectName: string;
    ipoName: string;
    operatingUnit: string;
    province: string;
    completionDate?: string;
    estimatedDate?: string;
}

interface MarketingSaleRow {
    key: string;
    commodityName: string;
    commodityType: string;
    isCommodityAssigned: boolean;
    ipoName: string;
    marketName: string;
    operatingUnit: string;
    quantity: number;
    unitOfMeasure: MarketLinkageUnit;
    salesValue: number;
    agreementDate?: string;
    partner: MarketingPartner;
    ipo?: IPO;
}

interface CommoditySummary {
    key: string;
    name: string;
    type: string;
    unit: CommodityUnit;
    area: number;
    targetYieldKg: number;
    actualYieldKg: number;
    marketedYieldKg: number;
    foodSecurityYieldKg: number;
    unspecifiedYieldKg: number;
    investment: number;
    subprojectIncome: number;
    marketingIncome: number;
    subprojects: Set<string>;
    ipos: Set<string>;
}

interface SubprojectImpactRow {
    key: string;
    subproject: Subproject;
    name: string;
    commodity: string;
    ipo: string;
    province: string;
    investment: number;
    income: number;
    roi: number;
    yieldRate: number;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const numberFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
});
const compactCurrencyFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const toNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeKey = (value: unknown) => normalizeText(value).toLowerCase();
const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));
const formatCompactCurrency = (value: number) => compactCurrencyFormatter.format(value || 0);
const formatNumber = (value: number) => numberFormatter.format(value || 0);
const formatInteger = (value: number) => integerFormatter.format(value || 0);
const percent = (actual: number, target: number) => target > 0 ? (actual / target) * 100 : 0;
const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
const kgToMt = (value: number) => value / 1000;
const clampPercent = (value: unknown) => Math.max(0, Math.min(100, toNumber(value)));

const getDateYear = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? '' : date.getFullYear().toString();
};

const getMonthIndex = (dateString?: string) => {
    if (!dateString) return -1;
    const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? -1 : date.getMonth();
};

const matchesYear = (dateString: string | undefined, selectedYear: string) => (
    selectedYear === 'All' || getDateYear(dateString) === selectedYear
);

const getCommodityKey = (type: string, name: string) => `${normalizeKey(type || 'Unspecified')}::${normalizeKey(name || 'Unspecified')}`;

const getStatusTone = (value: number, good = 80, warning = 50) => {
    if (value >= good) return 'good';
    if (value >= warning) return 'warning';
    return 'danger';
};

const getFallbackTargetYield = (commodity: { name: string; area: number }, ipo?: IPO) => {
    if (!ipo) return 0;
    const ipoCommodity = (ipo.commodities || []).find(item => normalizeKey(item.particular) === normalizeKey(commodity.name));
    if (!ipoCommodity?.yield) return 0;
    return toNumber(commodity.area) * toNumber(ipoCommodity.yield);
};

const SimpleDonut = ({ value, label, tone = 'green' }: { value: number; label: string; tone?: 'green' | 'blue' }) => {
    const safeValue = Math.max(0, Math.min(100, value));
    const color = tone === 'blue' ? '#2563eb' : '#16a34a';
    return (
        <div className="farm-impact-donut" style={{ background: `conic-gradient(${color} ${safeValue}%, #e2e8f0 0)` }}>
            <div>
                <strong>{formatNumber(value)}%</strong>
                <span>{label}</span>
            </div>
        </div>
    );
};

const MetricCard = ({
    label,
    value,
    detail,
    icon,
    tone = 'green',
}: {
    label: string;
    value: string;
    detail: string;
    icon: React.ReactNode;
    tone?: string;
}) => (
    <article className={`farm-impact-kpi farm-impact-kpi--${tone}`}>
        <div className="farm-impact-kpi__icon">{icon}</div>
        <div className="farm-impact-kpi__body">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    </article>
);

const ProgressBar = ({ value, tone = 'green' }: { value: number; tone?: 'green' | 'blue' | 'orange' }) => (
    <div className={`farm-impact-progress farm-impact-progress--${tone}`}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
);

const ScatterChart = ({ items }: { items: CommoditySummary[] }) => {
    const chartItems = items
        .filter(item => item.investment > 0 || item.subprojectIncome + item.marketingIncome > 0)
        .sort((a, b) => (b.subprojectIncome + b.marketingIncome) - (a.subprojectIncome + a.marketingIncome))
        .slice(0, 12);
    const maxInvestment = Math.max(1, ...chartItems.map(item => item.investment));
    const maxIncome = Math.max(1, ...chartItems.map(item => item.subprojectIncome + item.marketingIncome));

    return (
        <div className="farm-impact-scatter">
            <svg viewBox="0 0 420 240" role="img" aria-label="Income versus investment by commodity">
                <line x1="44" y1="205" x2="390" y2="205" />
                <line x1="44" y1="24" x2="44" y2="205" />
                <line className="farm-impact-scatter__median" x1="44" y1="115" x2="390" y2="115" />
                <line className="farm-impact-scatter__median" x1="217" y1="24" x2="217" y2="205" />
                {chartItems.map((item, index) => {
                    const x = 44 + (item.investment / maxInvestment) * 330;
                    const y = 205 - ((item.subprojectIncome + item.marketingIncome) / maxIncome) * 170;
                    const radius = Math.max(7, Math.min(18, 7 + (item.area / Math.max(1, ...chartItems.map(i => i.area))) * 11));
                    return (
                        <g key={item.key}>
                            <circle cx={x} cy={y} r={radius} className={`farm-impact-scatter__point farm-impact-scatter__point--${index % 4}`} />
                            <title>{`${item.name}: ${formatCurrency(item.investment)} investment, ${formatCurrency(item.subprojectIncome + item.marketingIncome)} income`}</title>
                            <text x={x + radius + 4} y={y + 4}>{item.name}</text>
                        </g>
                    );
                })}
            </svg>
            {chartItems.length === 0 && <p className="dashboard-empty dashboard-empty--center">No commodity income or investment data found.</p>}
        </div>
    );
};

const TrendChart = ({
    title,
    incomeValues,
    rateValues,
}: {
    title: string;
    incomeValues: number[];
    rateValues: number[];
}) => {
    const maxIncome = Math.max(1, ...incomeValues);
    const points = rateValues.map((value, index) => {
        const x = 35 + index * 36;
        const y = 145 - Math.max(0, Math.min(120, value)) * 1.08;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="farm-impact-trend">
            <h4 className="report-card__title">{title}</h4>
            <svg viewBox="0 0 440 185" role="img" aria-label={title}>
                <line x1="30" y1="150" x2="420" y2="150" />
                <line x1="30" y1="25" x2="30" y2="150" />
                {incomeValues.map((value, index) => {
                    const height = (value / maxIncome) * 90;
                    const x = 25 + index * 36;
                    return <rect key={monthNames[index]} x={x} y={150 - height} width="18" height={height} rx="3" />;
                })}
                <polyline points={points} />
                {rateValues.map((value, index) => (
                    <circle key={monthNames[index]} cx={35 + index * 36} cy={145 - Math.max(0, Math.min(120, value)) * 1.08} r="3.5" />
                ))}
                {monthNames.map((month, index) => (
                    <text key={month} x={35 + index * 36} y="174">{month}</text>
                ))}
            </svg>
            <div className="physical-dashboard-legend">
                <span><i className="farm-impact-legend__income" /> Income</span>
                <span><i className="farm-impact-legend__yield" /> Yield achievement</span>
            </div>
        </div>
    );
};

const YieldUseMix = ({
    marketedYieldKg,
    foodSecurityYieldKg,
    unspecifiedYieldKg,
    actualYieldKg,
}: {
    marketedYieldKg: number;
    foodSecurityYieldKg: number;
    unspecifiedYieldKg: number;
    actualYieldKg: number;
}) => {
    const segments = [
        { label: 'Marketed Yield', value: marketedYieldKg, percent: percent(marketedYieldKg, actualYieldKg), className: 'farm-impact-yield-mix__segment--marketed' },
        { label: 'Food Security Yield', value: foodSecurityYieldKg, percent: percent(foodSecurityYieldKg, actualYieldKg), className: 'farm-impact-yield-mix__segment--food' },
        { label: 'Unspecified Use', value: unspecifiedYieldKg, percent: percent(unspecifiedYieldKg, actualYieldKg), className: 'farm-impact-yield-mix__segment--other' },
    ];

    return (
        <div className="farm-impact-yield-mix">
            <div className="farm-impact-yield-mix__bar" aria-label="Actual yield utilization mix">
                {segments.map(segment => (
                    <span
                        key={segment.label}
                        className={segment.className}
                        style={{ width: `${Math.max(0, Math.min(100, segment.percent))}%` }}
                        title={`${segment.label}: ${formatNumber(kgToMt(segment.value))} MT (${formatNumber(segment.percent)}%)`}
                    />
                ))}
            </div>
            <div className="farm-impact-yield-mix__legend">
                {segments.map(segment => (
                    <div key={segment.label}>
                        <i className={segment.className} />
                        <span>{segment.label}</span>
                        <strong>{formatNumber(kgToMt(segment.value))} MT</strong>
                        <small>{formatNumber(segment.percent)}%</small>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FarmProductivityDashboard: React.FC<Props> = ({
    subprojects,
    ipos,
    marketingPartners,
    selectedYear,
    selectedOu,
    selectedTier,
    selectedFundType,
    onSelectSubproject,
    onSelectIpo,
    onSelectMarketingPartner,
}) => {
    const analytics = useMemo(() => {
        const filters: FinancialAggregationFilters = {
            year: selectedYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
        };

        const investmentBySubproject = new Map<string, number>();
        collectFinancialLineItems({
            subprojects: subprojects || [],
            activities: [],
            officeReqs: [],
            staffingReqs: [],
            otherProgramExpenses: [],
        }, filters).forEach(item => {
            if (item.sourceType !== 'subproject') return;
            const key = String(item.recordId ?? '');
            investmentBySubproject.set(key, (investmentBySubproject.get(key) || 0) + item.alloc);
        });

        const commodityRows: CommodityRow[] = [];
        const subprojectImpacts = new Map<string, SubprojectImpactRow>();
        const monthlyIncome = Array(12).fill(0);
        const monthlyTargetYield = Array(12).fill(0);
        const monthlyActualYield = Array(12).fill(0);

        (subprojects || [])
            .filter(subproject => subproject.status !== 'Cancelled')
            .forEach(subproject => {
                const commodities = (subproject.subprojectCommodities || [])
                    .map((commodity, index) => ({
                        index,
                        typeName: normalizeText(commodity.typeName || 'Unspecified'),
                        name: normalizeText(commodity.name || 'Unspecified'),
                        area: Math.max(0, toNumber(commodity.area)),
                        averageYield: Math.max(0, toNumber(commodity.averageYield)),
                        actualYield: Math.max(0, toNumber(commodity.actualYield)),
                        marketingPercentage: clampPercent((commodity as any).marketingPercentage),
                        foodSecurityPercentage: clampPercent((commodity as any).foodSecurityPercentage),
                        income: Math.max(0, toNumber(commodity.income)),
                    }))
                    .filter(commodity => commodity.name);

                if (commodities.length === 0) return;

                const subprojectKey = String(subproject.id ?? subproject.uid ?? subproject.name);
                const subprojectInvestment = investmentBySubproject.get(String(subproject.id)) || 0;
                const totalQuantity = commodities.reduce((sum, commodity) => sum + commodity.area, 0);
                const equalShare = commodities.length > 0 ? 1 / commodities.length : 0;
                const ipo = getSubprojectIpo(subproject, ipos);
                const ipoName = getSubprojectIpoName(subproject, ipos) || 'Unspecified IPO';
                const province = parseLocation(subproject.location || '').province || 'Unspecified Province';

                let subIncome = 0;
                let subTargetYield = 0;
                let subActualYield = 0;
                let primaryCommodity = commodities[0]?.name || 'Unspecified';

                commodities.forEach(commodity => {
                    const unit: CommodityUnit = commodity.typeName.toLowerCase() === 'livestock' ? 'livestock' : 'crop';
                    const targetYieldKg = unit === 'crop'
                        ? (commodity.averageYield || getFallbackTargetYield(commodity, ipo))
                        : 0;
                    const actualYieldKg = unit === 'crop' ? commodity.actualYield : 0;
                    const marketingShare = actualYieldKg * (commodity.marketingPercentage / 100);
                    const remainingAfterMarketing = Math.max(0, actualYieldKg - marketingShare);
                    const requestedFoodSecurityYield = actualYieldKg * (commodity.foodSecurityPercentage / 100);
                    const foodSecurityYieldKg = Math.min(remainingAfterMarketing, requestedFoodSecurityYield);
                    const marketedYieldKg = Math.min(actualYieldKg, marketingShare);
                    const unspecifiedYieldKg = Math.max(0, actualYieldKg - marketedYieldKg - foodSecurityYieldKg);
                    const share = totalQuantity > 0 ? commodity.area / totalQuantity : equalShare;
                    const investment = subprojectInvestment * share;
                    const key = `${subprojectKey}-${commodity.index}-${getCommodityKey(commodity.typeName, commodity.name)}`;

                    commodityRows.push({
                        key,
                        commodityName: commodity.name,
                        commodityType: commodity.typeName,
                        unit,
                        area: commodity.area,
                        targetYieldKg,
                        actualYieldKg,
                        marketedYieldKg,
                        foodSecurityYieldKg,
                        unspecifiedYieldKg,
                        marketingPercentage: commodity.marketingPercentage,
                        foodSecurityPercentage: commodity.foodSecurityPercentage,
                        subprojectIncome: commodity.income,
                        investment,
                        subproject,
                        subprojectName: subproject.name || 'Untitled subproject',
                        ipoName,
                        operatingUnit: subproject.operatingUnit || 'Unspecified OU',
                        province,
                        completionDate: subproject.actualCompletionDate,
                        estimatedDate: subproject.estimatedCompletionDate,
                    });

                    subIncome += commodity.income;
                    subTargetYield += targetYieldKg;
                    subActualYield += actualYieldKg;
                });

                const incomeMonth = getMonthIndex(subproject.actualCompletionDate || subproject.estimatedCompletionDate);
                if (incomeMonth >= 0) monthlyIncome[incomeMonth] += subIncome;
                const targetMonth = getMonthIndex(subproject.estimatedCompletionDate);
                if (targetMonth >= 0) monthlyTargetYield[targetMonth] += subTargetYield;
                const actualMonth = getMonthIndex(subproject.actualCompletionDate);
                if (actualMonth >= 0) monthlyActualYield[actualMonth] += subActualYield;

                subprojectImpacts.set(subprojectKey, {
                    key: subprojectKey,
                    subproject,
                    name: subproject.name || 'Untitled subproject',
                    commodity: primaryCommodity,
                    ipo: ipoName,
                    province,
                    investment: subprojectInvestment,
                    income: subIncome,
                    roi: ratio(subIncome, subprojectInvestment),
                    yieldRate: percent(subActualYield, subTargetYield),
                });
            });

        const marketingRows: MarketingSaleRow[] = [];
        const allowedStatuses = new Set(['Agreed', 'Contract Signed']);
        (marketingPartners || []).forEach(partner => {
            (partner.marketingLinkages || []).forEach((link, index) => {
                if (!allowedStatuses.has(link.negotiationStatus)) return;
                if (!matchesYear(link.agreementDate, selectedYear)) return;

                const sales = calculateMarketLinkageSales(link);
                if (sales.salesValue <= 0 && sales.quantity <= 0) return;

                const ipo = resolveIpoByIdOrName(ipos, link.ipoId, link.ipoName);
                const assignedCommodityName = normalizeText(link.commodityName);
                if (assignedCommodityName) {
                    marketingRows.push({
                        key: `${partner.id}-${index}-assigned`,
                        commodityName: assignedCommodityName,
                        commodityType: normalizeText(link.commodityType) || 'Unspecified',
                        isCommodityAssigned: true,
                        ipoName: ipo?.name || link.ipoName || 'Unspecified IPO',
                        marketName: partner.companyName || 'Unspecified Market',
                        operatingUnit: 'Unspecified OU',
                        quantity: sales.quantity,
                        unitOfMeasure: sales.unitOfMeasure,
                        salesValue: sales.salesValue,
                        agreementDate: link.agreementDate,
                        partner,
                        ipo,
                    });

                    const month = getMonthIndex(link.agreementDate);
                    if (month >= 0) monthlyIncome[month] += sales.salesValue;
                    return;
                }

                const partnerNeeds = new Set((partner.commodityNeeds || []).map(need => normalizeKey(need.name)));
                const matchedCommodities = (ipo?.commodities || [])
                    .filter(commodity => partnerNeeds.size === 0 || partnerNeeds.has(normalizeKey(commodity.particular)));
                const targets = matchedCommodities.length > 0
                    ? matchedCommodities
                    : [{ type: 'Unspecified', particular: 'Unspecified Commodity' }];
                const share = targets.length > 0 ? 1 / targets.length : 1;

                targets.forEach((commodity, targetIndex) => {
                    marketingRows.push({
                        key: `${partner.id}-${index}-${targetIndex}`,
                        commodityName: normalizeText((commodity as any).particular) || 'Unspecified Commodity',
                        commodityType: normalizeText((commodity as any).type) || 'Unspecified',
                        isCommodityAssigned: false,
                        ipoName: ipo?.name || link.ipoName || 'Unspecified IPO',
                        marketName: partner.companyName || 'Unspecified Market',
                        operatingUnit: 'Unspecified OU',
                        quantity: sales.quantity * share,
                        unitOfMeasure: sales.unitOfMeasure,
                        salesValue: sales.salesValue * share,
                        agreementDate: link.agreementDate,
                        partner,
                        ipo,
                    });
                });

                const month = getMonthIndex(link.agreementDate);
                if (month >= 0) monthlyIncome[month] += sales.salesValue;
            });
        });

        const regionToOu = new Map<string, string>();
        Object.entries(ouToRegionMap).forEach(([ou, region]) => {
            regionToOu.set(region, ou);
        });
        marketingRows.forEach(row => {
            if (row.ipo?.region) row.operatingUnit = regionToOu.get(row.ipo.region) || row.ipo.region;
            else row.operatingUnit = row.partner.region || 'Unspecified OU';
        });

        const commoditySummaryMap = new Map<string, CommoditySummary>();
        const ensureSummary = (type: string, name: string, unit: CommodityUnit): CommoditySummary => {
            const key = getCommodityKey(type, name);
            if (!commoditySummaryMap.has(key)) {
                commoditySummaryMap.set(key, {
                    key,
                    name: name || 'Unspecified Commodity',
                    type: type || 'Unspecified',
                    unit,
                    area: 0,
                    targetYieldKg: 0,
                    actualYieldKg: 0,
                    marketedYieldKg: 0,
                    foodSecurityYieldKg: 0,
                    unspecifiedYieldKg: 0,
                    investment: 0,
                    subprojectIncome: 0,
                    marketingIncome: 0,
                    subprojects: new Set(),
                    ipos: new Set(),
                });
            }
            return commoditySummaryMap.get(key)!;
        };

        commodityRows.forEach(row => {
            const summary = ensureSummary(row.commodityType, row.commodityName, row.unit);
            summary.area += row.area;
            summary.targetYieldKg += row.targetYieldKg;
            summary.actualYieldKg += row.actualYieldKg;
            summary.marketedYieldKg += row.marketedYieldKg;
            summary.foodSecurityYieldKg += row.foodSecurityYieldKg;
            summary.unspecifiedYieldKg += row.unspecifiedYieldKg;
            summary.investment += row.investment;
            summary.subprojectIncome += row.subprojectIncome;
            summary.subprojects.add(String(row.subproject.id ?? row.subproject.uid ?? row.subprojectName));
            summary.ipos.add(row.ipoName);
        });

        marketingRows.forEach(row => {
            const summary = ensureSummary(row.commodityType, row.commodityName, 'crop');
            summary.marketingIncome += row.salesValue;
            summary.ipos.add(row.ipoName);
        });

        const commoditySummaries = Array.from(commoditySummaryMap.values())
            .sort((a, b) => (b.subprojectIncome + b.marketingIncome) - (a.subprojectIncome + a.marketingIncome) || a.name.localeCompare(b.name));

        const subprojectImpactRows = Array.from(subprojectImpacts.values())
            .sort((a, b) => b.roi - a.roi || b.income - a.income);

        const performanceMap = new Map<string, {
            key: string;
            operatingUnit: string;
            province: string;
            investment: number;
            income: number;
            targetYieldKg: number;
            actualYieldKg: number;
            hectares: number;
            subprojects: Set<string>;
            ipos: Set<string>;
        }>();

        commodityRows.forEach(row => {
            const key = `${row.operatingUnit}::${row.province}`;
            if (!performanceMap.has(key)) {
                performanceMap.set(key, {
                    key,
                    operatingUnit: row.operatingUnit,
                    province: row.province,
                    investment: 0,
                    income: 0,
                    targetYieldKg: 0,
                    actualYieldKg: 0,
                    hectares: 0,
                    subprojects: new Set(),
                    ipos: new Set(),
                });
            }
            const item = performanceMap.get(key)!;
            item.investment += row.investment;
            item.income += row.subprojectIncome;
            item.targetYieldKg += row.targetYieldKg;
            item.actualYieldKg += row.actualYieldKg;
            if (row.unit === 'crop') item.hectares += row.area;
            item.subprojects.add(String(row.subproject.id ?? row.subproject.uid ?? row.subprojectName));
            item.ipos.add(row.ipoName);
        });

        marketingRows.forEach(row => {
            const province = parseLocation(row.ipo?.location || '').province || 'Marketing Linkage';
            const key = `${row.operatingUnit}::${province}`;
            if (!performanceMap.has(key)) {
                performanceMap.set(key, {
                    key,
                    operatingUnit: row.operatingUnit,
                    province,
                    investment: 0,
                    income: 0,
                    targetYieldKg: 0,
                    actualYieldKg: 0,
                    hectares: 0,
                    subprojects: new Set(),
                    ipos: new Set(),
                });
            }
            const item = performanceMap.get(key)!;
            item.income += row.salesValue;
            item.ipos.add(row.ipoName);
        });

        const performanceRows = Array.from(performanceMap.values())
            .sort((a, b) => b.income - a.income || a.operatingUnit.localeCompare(b.operatingUnit));

        const marketMap = new Map<string, { partner: MarketingPartner; sales: number; volumeByUnit: Record<MarketLinkageUnit, number>; linkages: number }>();
        marketingRows.forEach(row => {
            const key = String(row.partner.id ?? row.marketName);
            if (!marketMap.has(key)) marketMap.set(key, { partner: row.partner, sales: 0, volumeByUnit: createEmptyMarketQuantityTotals(), linkages: 0 });
            const item = marketMap.get(key)!;
            item.sales += row.salesValue;
            item.volumeByUnit[row.unitOfMeasure] += row.quantity;
            item.linkages += 1;
        });
        const topMarkets = Array.from(marketMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);

        const totalInvestment = commodityRows.reduce((sum, row) => sum + row.investment, 0);
        const subprojectIncome = commodityRows.reduce((sum, row) => sum + row.subprojectIncome, 0);
        const marketingIncome = marketingRows.reduce((sum, row) => sum + row.salesValue, 0);
        const totalIncome = subprojectIncome + marketingIncome;
        const cropRows = commodityRows.filter(row => row.unit === 'crop');
        const livestockRows = commodityRows.filter(row => row.unit === 'livestock');
        const totalHectares = cropRows.reduce((sum, row) => sum + row.area, 0);
        const livestockHeads = livestockRows.reduce((sum, row) => sum + row.area, 0);
        const targetYieldKg = cropRows.reduce((sum, row) => sum + row.targetYieldKg, 0);
        const actualYieldKg = cropRows.reduce((sum, row) => sum + row.actualYieldKg, 0);
        const marketedYieldKg = cropRows.reduce((sum, row) => sum + row.marketedYieldKg, 0);
        const foodSecurityYieldKg = cropRows.reduce((sum, row) => sum + row.foodSecurityYieldKg, 0);
        const unspecifiedYieldKg = cropRows.reduce((sum, row) => sum + row.unspecifiedYieldKg, 0);
        const yieldRate = percent(actualYieldKg, targetYieldKg);
        const marketedSubprojects = new Set(cropRows.filter(row => row.marketedYieldKg > 0).map(row => String(row.subproject.id ?? row.subproject.uid ?? row.subprojectName)));
        const foodSecuritySubprojects = new Set(cropRows.filter(row => row.foodSecurityYieldKg > 0).map(row => String(row.subproject.id ?? row.subproject.uid ?? row.subprojectName)));
        const commoditiesMeetingTarget = commoditySummaries.filter(item => item.unit === 'crop' && item.targetYieldKg > 0 && item.actualYieldKg >= item.targetYieldKg).length;
        const cropCommodityCount = commoditySummaries.filter(item => item.unit === 'crop').length;
        const highImpactCount = subprojectImpactRows.filter(row => row.income > row.investment && row.investment > 0).length;
        const breakEvenCount = subprojectImpactRows.filter(row => row.investment > 0 && row.income >= row.investment * 0.9 && row.income <= row.investment).length;
        const underperformingCount = subprojectImpactRows.filter(row => row.investment > 0 && row.income < row.investment * 0.9).length;
        const monthlyYieldRate = monthlyActualYield.map((actual, index) => percent(actual, monthlyTargetYield[index]));

        return {
            commodityRows,
            marketingRows,
            commoditySummaries,
            subprojectImpactRows,
            performanceRows,
            topMarkets,
            monthlyIncome,
            monthlyYieldRate,
            stats: {
                totalInvestment,
                subprojectIncome,
                marketingIncome,
                totalIncome,
                totalHectares,
                livestockHeads,
                targetYieldKg,
                actualYieldKg,
                marketedYieldKg,
                foodSecurityYieldKg,
                unspecifiedYieldKg,
                yieldRate,
                commercializationRate: percent(marketedYieldKg, actualYieldKg),
                foodSecurityContributionRate: percent(foodSecurityYieldKg, actualYieldKg),
                averageYieldPerHa: totalHectares > 0 ? kgToMt(actualYieldKg) / totalHectares : 0,
                incomePerPeso: ratio(totalIncome, totalInvestment),
                netIncomeGain: totalIncome - totalInvestment,
                marketedSubprojectCount: marketedSubprojects.size,
                foodSecuritySubprojectCount: foodSecuritySubprojects.size,
                highImpactCount,
                breakEvenCount,
                underperformingCount,
                commoditiesMeetingTarget,
                cropCommodityCount,
                activeMarkets: marketMap.size,
                totalMarketingQuantityByUnit: marketingRows.reduce((totals, row) => ({
                    ...totals,
                    [row.unitOfMeasure]: totals[row.unitOfMeasure] + row.quantity,
                }), createEmptyMarketQuantityTotals()),
                averageSaleValue: marketingRows.length > 0 ? marketingIncome / marketingRows.length : 0,
            },
        };
    }, [ipos, marketingPartners, selectedFundType, selectedOu, selectedTier, selectedYear, subprojects]);

    const hasAnyData = analytics.commodityRows.length > 0 || analytics.marketingRows.length > 0;
    const maxMarketSales = Math.max(1, ...analytics.topMarkets.map(item => item.sales));
    const maxCommodityIncome = Math.max(1, ...analytics.commoditySummaries.map(item => item.subprojectIncome + item.marketingIncome));

    const insights = [
        analytics.commoditySummaries[0]
            ? `${analytics.commoditySummaries[0].name} generated the highest total income at ${formatCurrency(analytics.commoditySummaries[0].subprojectIncome + analytics.commoditySummaries[0].marketingIncome)}.`
            : 'No commodity income has been encoded yet.',
        analytics.stats.incomePerPeso > 0
            ? `The current income per peso invested is ${formatNumber(analytics.stats.incomePerPeso)}x.`
            : 'No subproject budget reference is available for income-per-peso comparison.',
        analytics.stats.actualYieldKg > 0
            ? `${formatNumber(analytics.stats.commercializationRate)}% of actual crop yield was marked for sales and ${formatNumber(analytics.stats.foodSecurityContributionRate)}% was retained for food security or sustenance.`
            : 'No actual crop yield utilization split has been encoded yet.',
        analytics.stats.cropCommodityCount > 0
            ? `${analytics.stats.commoditiesMeetingTarget} of ${analytics.stats.cropCommodityCount} crop commodities met or exceeded target yield.`
            : 'No crop yield target data is available for the selected filters.',
        analytics.stats.marketingIncome > 0
            ? `Marketing sales contributed ${formatNumber(percent(analytics.stats.marketingIncome, analytics.stats.totalIncome))}% of total generated income.`
            : 'No agreed or contract-signed marketing sales are available for this filter.',
    ];

    const handleDownloadExcel = () => {
        if (!XLSX) {
            alert('XLSX library is not available.');
            return;
        }
        if (!hasAnyData) {
            alert('No farm productivity data to download.');
            return;
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
            'Budget for Subprojects': analytics.stats.totalInvestment,
            'Subproject Income': analytics.stats.subprojectIncome,
            'Marketing Sales': analytics.stats.marketingIncome,
            'Total Income': analytics.stats.totalIncome,
            'Income per Peso Invested': analytics.stats.incomePerPeso,
            'Net Income Gain': analytics.stats.netIncomeGain,
            'Total Hectares': analytics.stats.totalHectares,
            'Livestock Heads': analytics.stats.livestockHeads,
            'Target Yield MT': kgToMt(analytics.stats.targetYieldKg),
            'Actual Yield MT': kgToMt(analytics.stats.actualYieldKg),
            'Marketed Yield MT': kgToMt(analytics.stats.marketedYieldKg),
            'Food Security Yield MT': kgToMt(analytics.stats.foodSecurityYieldKg),
            'Unspecified Yield MT': kgToMt(analytics.stats.unspecifiedYieldKg),
            'Yield Achievement %': analytics.stats.yieldRate,
            'Commercialization Rate %': analytics.stats.commercializationRate,
            'Food Security Contribution %': analytics.stats.foodSecurityContributionRate,
        }]), 'Summary');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analytics.commoditySummaries.map(item => ({
            Commodity: item.name,
            Type: item.type,
            Unit: item.unit,
            Hectares: item.unit === 'crop' ? item.area : 0,
            Heads: item.unit === 'livestock' ? item.area : 0,
            'Target Yield MT': kgToMt(item.targetYieldKg),
            'Actual Yield MT': kgToMt(item.actualYieldKg),
            'Marketed Yield MT': kgToMt(item.marketedYieldKg),
            'Food Security Yield MT': kgToMt(item.foodSecurityYieldKg),
            'Unspecified Yield MT': kgToMt(item.unspecifiedYieldKg),
            'Yield Achievement %': percent(item.actualYieldKg, item.targetYieldKg),
            'Subproject Budget': item.investment,
            'Subproject Income': item.subprojectIncome,
            'Marketing Income': item.marketingIncome,
            'Total Income': item.subprojectIncome + item.marketingIncome,
            IPOs: item.ipos.size,
            Subprojects: item.subprojects.size,
        }))), 'Commodity Impact');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analytics.subprojectImpactRows.map(row => ({
            Subproject: row.name,
            Commodity: row.commodity,
            IPO: row.ipo,
            Province: row.province,
            'Subproject Budget': row.investment,
            Income: row.income,
            'Income per Peso': row.roi,
            'Yield Achievement %': row.yieldRate,
        }))), 'Subproject Impact');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(analytics.marketingRows.map(row => ({
            Market: row.marketName,
            IPO: row.ipoName,
            Commodity: row.commodityName,
            'Commodity Status': row.isCommodityAssigned ? 'Assigned' : 'Unassigned / legacy fallback',
            'Quantity': row.quantity,
            'Unit': row.unitOfMeasure,
            Sales: row.salesValue,
            'Agreement Date': row.agreementDate || '',
        }))), 'Marketing Sales');
        XLSX.writeFile(wb, `Farm_Productivity_Income_${selectedYear}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="farm-productivity-dashboard dashboard-view animate-fadeIn">
            <section className="dashboard-section farm-impact-hero" aria-labelledby="farm-impact-title">
                <div>
                    <div id="farm-impact-title" className="dashboard-section__title">Farm Productivity, Income & Investment Impact Dashboard</div>
                </div>
                <button type="button" onClick={handleDownloadExcel} className="btn btn-primary btn-responsive">
                    <Download className="btn-symbol" aria-hidden="true" />
                    <span className="btn-text">Download XLSX</span>
                </button>
            </section>

            {!hasAnyData && (
                <section className="report-card farm-impact-empty">
                    <Leaf aria-hidden="true" />
                    <h3>No productivity or income data found.</h3>
                    <p>Add subproject commodity actual yield/income or agreed marketing linkages for the active filters to populate this dashboard.</p>
                </section>
            )}

            <section className="farm-impact-section" aria-labelledby="farm-income-summary">
                <div className="farm-impact-section__header">
                    <h3 id="farm-income-summary">Income & Investment Summary</h3>
                    <span>Subproject budget, generated income, and income-to-budget comparison</span>
                </div>
                <div className="farm-impact-kpi-grid" aria-label="Income and investment summary">
                <MetricCard label="Budget for Subprojects" value={formatCompactCurrency(analytics.stats.totalInvestment)} detail={formatCurrency(analytics.stats.totalInvestment)} icon={<WalletCards aria-hidden="true" />} tone="blue" />
                <MetricCard label="Subproject Income" value={formatCompactCurrency(analytics.stats.subprojectIncome)} detail="From subproject actuals" icon={<Sprout aria-hidden="true" />} tone="green" />
                <MetricCard label="Marketing Sales" value={formatCompactCurrency(analytics.stats.marketingIncome)} detail={`${formatInteger(analytics.marketingRows.length)} committed linkage${analytics.marketingRows.length === 1 ? '' : 's'}`} icon={<Store aria-hidden="true" />} tone="violet" />
                <MetricCard label="Total Income" value={formatCompactCurrency(analytics.stats.totalIncome)} detail="Subproject + marketing" icon={<TrendingUp aria-hidden="true" />} tone="green" />
                <MetricCard label="Income per Peso" value={`${formatNumber(analytics.stats.incomePerPeso)}x`} detail="IPO income vs subproject budget" icon={<LineChart aria-hidden="true" />} tone="orange" />
                <MetricCard label="Net Income Gain" value={formatCompactCurrency(analytics.stats.netIncomeGain)} detail="Income less subproject budget" icon={<BarChart3 aria-hidden="true" />} tone={analytics.stats.netIncomeGain >= 0 ? 'green' : 'red'} />
                <MetricCard label="High Impact Subprojects" value={formatInteger(analytics.stats.highImpactCount)} detail="Income exceeds budget" icon={<PackageSearch aria-hidden="true" />} tone="blue" />
                </div>
            </section>

            <section className="farm-impact-section" aria-labelledby="farm-productivity-overview">
                <div className="farm-impact-section__header">
                    <h3 id="farm-productivity-overview">Productivity Overview</h3>
                    <span>Area coverage, target yield, actual yield, and commodity target achievement</span>
                </div>
                <div className="farm-impact-kpi-grid farm-impact-kpi-grid--productivity" aria-label="Productivity overview">
                <MetricCard label="Total Hectares" value={`${formatNumber(analytics.stats.totalHectares)} ha`} detail={analytics.stats.livestockHeads > 0 ? `${formatNumber(analytics.stats.livestockHeads)} livestock heads tracked separately` : 'Crop commodity area'} icon={<Leaf aria-hidden="true" />} tone="green" />
                <MetricCard label="Target Yield" value={`${formatNumber(kgToMt(analytics.stats.targetYieldKg))} MT`} detail="Crop commodities only" icon={<Sprout aria-hidden="true" />} tone="blue" />
                <MetricCard label="Actual Yield" value={`${formatNumber(kgToMt(analytics.stats.actualYieldKg))} MT`} detail="Crop commodities only" icon={<Sprout aria-hidden="true" />} tone="green" />
                <MetricCard label="Marketed Yield" value={`${formatNumber(kgToMt(analytics.stats.marketedYieldKg))} MT`} detail={`${formatNumber(analytics.stats.commercializationRate)}% of actual yield`} icon={<Store aria-hidden="true" />} tone="blue" />
                <MetricCard label="Food Security Yield" value={`${formatNumber(kgToMt(analytics.stats.foodSecurityYieldKg))} MT`} detail={`${formatNumber(analytics.stats.foodSecurityContributionRate)}% retained for IPO use`} icon={<UsersRound aria-hidden="true" />} tone="orange" />
                <MetricCard label="Yield Achievement" value={`${formatNumber(analytics.stats.yieldRate)}%`} detail="Actual vs target yield" icon={<TrendingUp aria-hidden="true" />} tone={getStatusTone(analytics.stats.yieldRate)} />
                <MetricCard label="Market Output Subprojects" value={formatInteger(analytics.stats.marketedSubprojectCount)} detail="With yield marked for sales" icon={<PackageSearch aria-hidden="true" />} tone="violet" />
                <MetricCard label="Food Security Subprojects" value={formatInteger(analytics.stats.foodSecuritySubprojectCount)} detail="With yield retained for sustenance" icon={<Leaf aria-hidden="true" />} tone="green" />
                <MetricCard label="Avg Yield per Hectare" value={`${formatNumber(analytics.stats.averageYieldPerHa)} MT/ha`} detail="Actual yield over hectares" icon={<LineChart aria-hidden="true" />} tone="violet" />
                <MetricCard label="Commodities Meeting Target" value={`${analytics.stats.commoditiesMeetingTarget} of ${analytics.stats.cropCommodityCount}`} detail="Crop commodities" icon={<PackageSearch aria-hidden="true" />} tone="orange" />
                </div>
            </section>

            <section className="farm-impact-analytics-grid">
                <article className="report-card farm-impact-card farm-impact-card--wide">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Income vs Investment Analysis</h4>
                        <span className="dashboard-section__note">By commodity</span>
                    </div>
                    <ScatterChart items={analytics.commoditySummaries} />
                </article>

                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Investment Impact Summary</h4>
                    </div>
                    <div className="farm-impact-summary">
                        <SimpleDonut value={Math.min(100, analytics.stats.incomePerPeso * 50)} label={`${formatNumber(analytics.stats.incomePerPeso)}x income/budget`} />
                        <div className="farm-impact-summary__list">
                            <div><span>Income Generated</span><strong>{formatCurrency(analytics.stats.totalIncome)}</strong></div>
                            <div><span>Budget for Subprojects</span><strong>{formatCurrency(analytics.stats.totalInvestment)}</strong></div>
                            <div><span>Net Income Gain</span><strong>{formatCurrency(analytics.stats.netIncomeGain)}</strong></div>
                            <div><span>High Impact</span><strong>{formatInteger(analytics.stats.highImpactCount)}</strong></div>
                            <div><span>Break-even</span><strong>{formatInteger(analytics.stats.breakEvenCount)}</strong></div>
                            <div><span>Underperforming</span><strong>{formatInteger(analytics.stats.underperformingCount)}</strong></div>
                        </div>
                    </div>
                </article>

                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Income Sources Breakdown</h4>
                    </div>
                    <div className="farm-impact-summary">
                        <SimpleDonut value={percent(analytics.stats.subprojectIncome, analytics.stats.totalIncome)} label="Subproject Share" tone="blue" />
                        <div className="farm-impact-source-list">
                            <div>
                                <span className="farm-impact-source-list__marker farm-impact-source-list__marker--green" />
                                <span>Subproject Income</span>
                                <strong>{formatCurrency(analytics.stats.subprojectIncome)}</strong>
                            </div>
                            <div>
                                <span className="farm-impact-source-list__marker farm-impact-source-list__marker--blue" />
                                <span>Marketing Sales</span>
                                <strong>{formatCurrency(analytics.stats.marketingIncome)}</strong>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <section className="report-card farm-impact-card">
                <div className="report-card__header">
                    <h4 className="report-card__title">Yield Utilization Impact</h4>
                    <span className="dashboard-section__note">Sales, food security, and unspecified use</span>
                </div>
                <YieldUseMix
                    marketedYieldKg={analytics.stats.marketedYieldKg}
                    foodSecurityYieldKg={analytics.stats.foodSecurityYieldKg}
                    unspecifiedYieldKg={analytics.stats.unspecifiedYieldKg}
                    actualYieldKg={analytics.stats.actualYieldKg}
                />
            </section>

            <section className="farm-impact-analytics-grid farm-impact-analytics-grid--two">
                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">OU / Province Performance</h4>
                    </div>
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table farm-impact-table">
                            <thead>
                                <tr>
                                    <th>OU / Province</th>
                                    <th className="data-table__numeric">Investment</th>
                                    <th className="data-table__numeric">Income</th>
                                    <th className="data-table__numeric">Income/Peso</th>
                                    <th className="data-table__numeric">Yield</th>
                                    <th className="data-table__numeric">IPOs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.performanceRows.slice(0, 12).map(row => (
                                    <tr key={row.key}>
                                        <td><strong>{row.operatingUnit}</strong><span>{row.province}</span></td>
                                        <td className="data-table__numeric">{formatCurrency(row.investment)}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.income)}</td>
                                        <td className="data-table__numeric">{formatNumber(ratio(row.income, row.investment))}x</td>
                                        <td className="data-table__numeric">{formatNumber(percent(row.actualYieldKg, row.targetYieldKg))}%</td>
                                        <td className="data-table__numeric">{row.ipos.size}</td>
                                    </tr>
                                ))}
                                {analytics.performanceRows.length === 0 && (
                                    <tr><td colSpan={6}><p className="dashboard-empty dashboard-empty--center">No regional performance data available.</p></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Marketing Performance Overview</h4>
                    </div>
                    <div className="farm-impact-market-metrics">
                        <div><span>Total Sales</span><strong>{formatCurrency(analytics.stats.marketingIncome)}</strong></div>
                        <div><span>Volume Sold</span><strong>{formatMarketQuantityTotals(analytics.stats.totalMarketingQuantityByUnit)}</strong></div>
                        <div><span>Average Sale</span><strong>{formatCurrency(analytics.stats.averageSaleValue)}</strong></div>
                        <div><span>Active Markets</span><strong>{formatInteger(analytics.stats.activeMarkets)}</strong></div>
                    </div>
                    <div className="commodity-bar-list farm-impact-market-list">
                        {analytics.topMarkets.map(item => (
                            <button
                                type="button"
                                key={item.partner.id}
                                className="commodity-bar-row farm-impact-market-row"
                                onClick={() => onSelectMarketingPartner?.(item.partner)}
                                disabled={!onSelectMarketingPartner}
                            >
                                <span className="commodity-bar-row__label">{item.partner.companyName}</span>
                                <div className="commodity-bar-row__track"><span style={{ width: `${(item.sales / maxMarketSales) * 100}%` }} /></div>
                                <span className="commodity-bar-row__value">{formatCurrency(item.sales)}</span>
                            </button>
                        ))}
                        {analytics.topMarkets.length === 0 && <p className="dashboard-empty dashboard-empty--center">No agreed or contract-signed marketing sales.</p>}
                    </div>
                </article>
            </section>

            <section className="report-card farm-impact-card">
                <div className="report-card__header">
                    <h4 className="report-card__title">Commodity Impact Summary</h4>
                </div>
                <div className="data-table-scroll custom-scrollbar">
                    <table className="data-table farm-impact-table farm-impact-table--wide">
                        <thead>
                            <tr>
                                <th>Commodity</th>
                                <th>Type</th>
                                <th className="data-table__numeric">Hectares / Heads</th>
                                <th className="data-table__numeric">Target MT</th>
                                <th className="data-table__numeric">Actual MT</th>
                                <th className="data-table__numeric">Marketed MT</th>
                                <th className="data-table__numeric">Food Security MT</th>
                                <th className="data-table__numeric">Yield Rate</th>
                                <th className="data-table__numeric">Investment</th>
                                <th className="data-table__numeric">Subproject Income</th>
                                <th className="data-table__numeric">Marketing Income</th>
                                <th className="data-table__numeric">Total Income</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analytics.commoditySummaries.map(item => {
                                const totalIncome = item.subprojectIncome + item.marketingIncome;
                                return (
                                    <tr key={item.key}>
                                        <td><strong>{item.name}</strong><span>{item.subprojects.size} subproject link{item.subprojects.size === 1 ? '' : 's'}</span></td>
                                        <td><span className="status-badge status-badge--compact status-badge--cyan">{item.type}</span></td>
                                        <td className="data-table__numeric">{formatNumber(item.area)} {item.unit === 'livestock' ? 'heads' : 'ha'}</td>
                                        <td className="data-table__numeric">{item.unit === 'crop' ? formatNumber(kgToMt(item.targetYieldKg)) : '-'}</td>
                                        <td className="data-table__numeric">{item.unit === 'crop' ? formatNumber(kgToMt(item.actualYieldKg)) : '-'}</td>
                                        <td className="data-table__numeric">{item.unit === 'crop' ? formatNumber(kgToMt(item.marketedYieldKg)) : '-'}</td>
                                        <td className="data-table__numeric">{item.unit === 'crop' ? formatNumber(kgToMt(item.foodSecurityYieldKg)) : '-'}</td>
                                        <td className="data-table__numeric">
                                            {item.unit === 'crop' ? (
                                                <div className="farm-impact-rate-cell">
                                                    <span>{formatNumber(percent(item.actualYieldKg, item.targetYieldKg))}%</span>
                                                    <ProgressBar value={percent(item.actualYieldKg, item.targetYieldKg)} />
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="data-table__numeric">{formatCurrency(item.investment)}</td>
                                        <td className="data-table__numeric">{formatCurrency(item.subprojectIncome)}</td>
                                        <td className="data-table__numeric">{formatCurrency(item.marketingIncome)}</td>
                                        <td className="data-table__numeric"><strong>{formatCurrency(totalIncome)}</strong></td>
                                    </tr>
                                );
                            })}
                            {analytics.commoditySummaries.length === 0 && (
                                <tr><td colSpan={12}><p className="dashboard-empty dashboard-empty--center">No commodity impact records found.</p></td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="farm-impact-analytics-grid farm-impact-analytics-grid--two">
                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Investment Impact by Subproject</h4>
                    </div>
                    <div className="data-table-scroll custom-scrollbar">
                        <table className="data-table farm-impact-table farm-impact-table--wide">
                            <thead>
                                <tr>
                                    <th>Subproject</th>
                                    <th>Commodity</th>
                                    <th>IPO</th>
                                    <th className="data-table__numeric">Investment</th>
                                    <th className="data-table__numeric">Income</th>
                                    <th className="data-table__numeric">Income/Peso</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.subprojectImpactRows.slice(0, 12).map(row => (
                                    <tr key={row.key}>
                                        <td>
                                            <button
                                                type="button"
                                                className="commodity-subproject-link"
                                                onClick={() => onSelectSubproject?.(row.subproject)}
                                                disabled={!onSelectSubproject}
                                            >
                                                {row.name}
                                            </button>
                                        </td>
                                        <td>{row.commodity}</td>
                                        <td>{row.ipo}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.investment)}</td>
                                        <td className="data-table__numeric">{formatCurrency(row.income)}</td>
                                        <td className="data-table__numeric">{formatNumber(row.roi)}x</td>
                                        <td><span className={`physical-dashboard-status physical-dashboard-status--${row.roi >= 1 ? 'good' : row.roi >= 0.5 ? 'warning' : 'danger'}`}>{row.roi >= 1 ? 'High Impact' : row.roi >= 0.5 ? 'Developing' : 'Low Income'}</span></td>
                                    </tr>
                                ))}
                                {analytics.subprojectImpactRows.length === 0 && (
                                    <tr><td colSpan={7}><p className="dashboard-empty dashboard-empty--center">No subproject impact records found.</p></td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Productivity & Income Insights</h4>
                    </div>
                    <div className="physical-dashboard-alert-list">
                        {insights.map((item, index) => (
                            <div key={item} className={`physical-dashboard-alert physical-dashboard-alert--${index === 0 ? 'good' : index === 2 ? 'warning' : 'good'}`}>
                                <TrendingUp aria-hidden="true" />
                                <strong>{item}</strong>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="farm-impact-analytics-grid farm-impact-analytics-grid--two">
                <article className="report-card farm-impact-card">
                    <TrendChart title="Income Over Time" incomeValues={analytics.monthlyIncome} rateValues={analytics.monthlyYieldRate} />
                </article>
                <article className="report-card farm-impact-card">
                    <div className="report-card__header">
                        <h4 className="report-card__title">Top Commodities by Income</h4>
                    </div>
                    <div className="commodity-bar-list">
                        {analytics.commoditySummaries.slice(0, 10).map(item => {
                            const income = item.subprojectIncome + item.marketingIncome;
                            return (
                                <div key={item.key} className="commodity-bar-row">
                                    <span className="commodity-bar-row__label" title={item.name}>{item.name}</span>
                                    <div className="commodity-bar-row__track"><span style={{ width: `${(income / maxCommodityIncome) * 100}%` }} /></div>
                                    <span className="commodity-bar-row__value">{formatCurrency(income)}</span>
                                </div>
                            );
                        })}
                        {analytics.commoditySummaries.length === 0 && <p className="dashboard-empty dashboard-empty--center">No commodity income found.</p>}
                    </div>
                </article>
            </section>
        </div>
    );
};

export default FarmProductivityDashboard;
