// Author: 4K
import React, { useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Boxes,
    CheckCircle2,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    CircleDollarSign,
    Clock,
    Download,
    Gauge,
    PackageCheck,
    Search,
    Truck,
    Users,
} from 'lucide-react';
import { Subproject } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { XLSX } from '../reports/ReportUtils';
import { isMonthTargetOverdue } from '../../lib/dateStatus';

interface Props {
    subprojects: Subproject[];
}

type DeliveryStatus = 'completed' | 'partial' | 'delayed' | 'notStarted';

interface InterventionRow {
    key: string;
    region: string;
    province: string;
    municipality: string;
    ipo: string;
    subprojectName: string;
    subprojectStatus: Subproject['status'];
    itemType: string;
    particulars: string;
    unit: string;
    targetQty: number;
    actualQty: number;
    allocation: number;
    obligated: number;
    disbursed: number;
    completionRate: number;
    financialObligationRate: number;
    financialDisbursementRate: number;
    status: DeliveryStatus;
    deliveryDate?: string;
    actualDeliveryDate?: string;
    searchableText: string;
}

interface AggregateStats {
    targetQty: number;
    actualQty: number;
    allocation: number;
    obligated: number;
    disbursed: number;
    weightedPhysical: number;
    physicalWeight: number;
    completionSum: number;
    itemCount: number;
    completed: number;
    partial: number;
    delayed: number;
    notStarted: number;
}

interface TreeNode {
    key: string;
    label: string;
    level: number;
    stats: AggregateStats;
    children: TreeNode[];
    rows: InterventionRow[];
}

const emptyStats = (): AggregateStats => ({
    targetQty: 0,
    actualQty: 0,
    allocation: 0,
    obligated: 0,
    disbursed: 0,
    weightedPhysical: 0,
    physicalWeight: 0,
    completionSum: 0,
    itemCount: 0,
    completed: 0,
    partial: 0,
    delayed: 0,
    notStarted: 0,
});

const peso = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
});

const compactPeso = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('en-PH', {
    maximumFractionDigits: 1,
});

const normalizeQuantity = (qty: number, unit: string): { qty: number; unit: string } => {
    const normalizedUnit = (unit || '').toLowerCase().trim();
    if (['g', 'gram', 'grams'].includes(normalizedUnit)) return { qty: qty / 1000, unit: 'kg' };
    if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalizedUnit)) return { qty, unit: 'kg' };
    if (['pc', 'pcs', 'piece', 'pieces'].includes(normalizedUnit)) return { qty, unit: 'pcs' };
    return { qty, unit: normalizedUnit || 'unspecified' };
};

const parseDate = (value?: string) => {
    if (!value) return undefined;
    const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date;
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? undefined : fallback;
};

const formatDate = (value?: string) => {
    const date = parseDate(value);
    if (!date) return '-';
    return date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
};

const clampRate = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(value, 100));
};

const getActualObligation = (detail: any) => {
    if (Array.isArray(detail.obligations) && detail.obligations.length > 0) {
        return detail.obligations.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    }
    return Number(detail.actualObligationAmount) || Number(detail.actualAmount) || 0;
};

const getActualDisbursement = (detail: any) => {
    if (Array.isArray(detail.disbursements) && detail.disbursements.length > 0) {
        return detail.disbursements.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
    }
    return Number(detail.actualDisbursementAmount) || 0;
};

const getStatus = (row: {
    targetQty: number;
    actualQty: number;
    isCompleted?: boolean;
    deliveryDate?: string;
}): DeliveryStatus => {
    const completed = row.isCompleted || (row.targetQty > 0 && row.actualQty >= row.targetQty);
    if (completed) return 'completed';

    if (isMonthTargetOverdue(row.deliveryDate)) return 'delayed';
    if (row.actualQty > 0) return 'partial';
    return 'notStarted';
};

const addRowToStats = (stats: AggregateStats, row: InterventionRow) => {
    const weight = row.allocation > 0 ? row.allocation : row.targetQty;
    stats.targetQty += row.targetQty;
    stats.actualQty += row.actualQty;
    stats.allocation += row.allocation;
    stats.obligated += row.obligated;
    stats.disbursed += row.disbursed;
    stats.weightedPhysical += row.completionRate * weight;
    stats.physicalWeight += weight;
    stats.completionSum += row.completionRate;
    stats.itemCount += 1;
    if (row.status === 'completed') stats.completed += 1;
    if (row.status === 'partial') stats.partial += 1;
    if (row.status === 'delayed') stats.delayed += 1;
    if (row.status === 'notStarted') stats.notStarted += 1;
};

const getPhysicalRate = (stats: AggregateStats) => {
    if (stats.physicalWeight > 0) return stats.weightedPhysical / stats.physicalWeight;
    if (stats.itemCount > 0) return stats.completionSum / stats.itemCount;
    return 0;
};

const getDominantStatus = (stats: AggregateStats): DeliveryStatus => {
    if (stats.delayed > 0) return 'delayed';
    if (stats.partial > 0) return 'partial';
    if (stats.completed > 0 && stats.completed === stats.itemCount) return 'completed';
    return 'notStarted';
};

const getStatusLabel = (status: DeliveryStatus) => {
    if (status === 'completed') return 'Completed';
    if (status === 'partial') return 'Partial';
    if (status === 'delayed') return 'Delayed';
    return 'Not Started';
};

const getStatusClass = (status: DeliveryStatus) => {
    if (status === 'completed') return 'is-completed';
    if (status === 'partial') return 'is-partial';
    if (status === 'delayed') return 'is-delayed';
    return 'is-not-started';
};

const getFinancialRate = (actual: number, allocation: number) => {
    if (allocation <= 0) return 0;
    return clampRate((actual / allocation) * 100);
};

const formatQty = (qty: number, unit?: string) => {
    const suffix = unit && unit !== 'unspecified' ? ` ${unit}` : '';
    return `${numberFormatter.format(qty)}${suffix}`;
};

const buildNode = (key: string, label: string, level: number): TreeNode => ({
    key,
    label,
    level,
    stats: emptyStats(),
    children: [],
    rows: [],
});

const getOrCreateChild = (node: TreeNode, key: string, label: string, level: number) => {
    let child = node.children.find(item => item.key === key);
    if (!child) {
        child = buildNode(key, label, level);
        node.children.push(child);
    }
    return child;
};

const SortableLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="agri-intervention-table__sort-label">{children}</span>
);

const RateBar = ({ value, tone = 'physical' }: { value: number; tone?: 'physical' | 'obligation' | 'disbursement' }) => (
    <div className={`agri-rate-bar agri-rate-bar--${tone}`}>
        <div className="agri-rate-bar__track" aria-hidden="true">
            <span style={{ width: `${clampRate(value)}%` }} />
        </div>
        <strong>{percentFormatter.format(clampRate(value))}%</strong>
    </div>
);

const KpiCard = ({
    icon,
    label,
    value,
    note,
    tone = 'neutral',
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    note: string;
    tone?: 'neutral' | 'green' | 'orange' | 'blue' | 'purple' | 'red';
}) => (
    <article className={`agri-kpi-card agri-kpi-card--${tone}`}>
        <div className="agri-kpi-card__icon">{icon}</div>
        <div className="agri-kpi-card__body">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
        </div>
    </article>
);

const AlertItem = ({
    icon,
    title,
    detail,
    tone,
}: {
    icon: React.ReactNode;
    title: string;
    detail: string;
    tone: 'red' | 'orange' | 'blue' | 'green';
}) => (
    <div className={`agri-alert-item agri-alert-item--${tone}`}>
        <span className="agri-alert-item__icon">{icon}</span>
        <div>
            <strong>{title}</strong>
            <p>{detail}</p>
        </div>
    </div>
);

const AgriculturalInterventionsDashboard: React.FC<Props> = ({ subprojects }) => {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    const subprojectPerformance = useMemo(() => {
        const targetSubprojects = (subprojects || []).filter(subproject => !subproject.isRealignment && !subproject.isSavings);
        const completedSubprojects = (subprojects || []).filter(subproject =>
            subproject.status === 'Completed' && !!subproject.actualCompletionDate
        );

        return {
            target: targetSubprojects.length,
            completed: completedSubprojects.length,
        };
    }, [subprojects]);

    const rows = useMemo<InterventionRow[]>(() => {
        const validSubprojects = (subprojects || []).filter(subproject => subproject.status !== 'Cancelled');

        return validSubprojects.flatMap(subproject => {
            const parsedLocation = parseLocation(subproject.location || '');
            const province = parsedLocation.province || subproject.location || 'Unspecified Province';
            const municipality = parsedLocation.municipality || 'Unspecified Municipality';
            const ipo = subproject.indigenousPeopleOrganization || 'Unspecified IPO';
            const region = subproject.operatingUnit || 'Unspecified OU';

            return (subproject.details || []).filter(Boolean).map((detail, index) => {
                const target = normalizeQuantity(Number(detail.numberOfUnits) || 0, detail.unitOfMeasure);
                const actual = normalizeQuantity(Number(detail.actualNumberOfUnits) || 0, detail.unitOfMeasure);
                const allocation = (Number(detail.numberOfUnits) || 0) * (Number(detail.pricePerUnit) || 0);
                const obligated = getActualObligation(detail);
                const disbursed = getActualDisbursement(detail);
                const completionRate = target.qty > 0 ? clampRate((actual.qty / target.qty) * 100) : 0;
                const status = getStatus({
                    targetQty: target.qty,
                    actualQty: actual.qty,
                    isCompleted: detail.isCompleted,
                    deliveryDate: detail.deliveryDate,
                });
                const particulars = detail.particulars || 'Unspecified item';
                const itemType = detail.type || 'Unspecified';
                const key = `${subproject.uid || subproject.id || subproject.name}-${detail.id || index}`;

                return {
                    key,
                    region,
                    province,
                    municipality,
                    ipo,
                    subprojectName: subproject.name || 'Untitled subproject',
                    subprojectStatus: subproject.status,
                    itemType,
                    particulars,
                    unit: target.unit,
                    targetQty: target.qty,
                    actualQty: actual.qty,
                    allocation,
                    obligated,
                    disbursed,
                    completionRate,
                    financialObligationRate: getFinancialRate(obligated, allocation),
                    financialDisbursementRate: getFinancialRate(disbursed, allocation),
                    status,
                    deliveryDate: detail.deliveryDate,
                    actualDeliveryDate: detail.actualDeliveryDate,
                    searchableText: [
                        region,
                        province,
                        municipality,
                        ipo,
                        subproject.name,
                        itemType,
                        particulars,
                    ].join(' ').toLowerCase(),
                };
            });
        });
    }, [subprojects]);

    const filteredRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(row => row.searchableText.includes(term));
    }, [rows, searchTerm]);

    const analytics = useMemo(() => {
        const allStats = emptyStats();
        const ipoRows = new Map<string, { total: number; completed: number }>();
        const deliveredUnitSet = new Set<string>();
        let deliveredQuantity = 0;
        let deliveredItemRows = 0;
        let onTimeDeliveries = 0;
        let undeliveredItems = 0;
        let partiallyDeliveredItems = 0;

        filteredRows.forEach(row => {
            addRowToStats(allStats, row);

            const ipoStats = ipoRows.get(row.ipo) || { total: 0, completed: 0 };
            ipoStats.total += 1;
            if (row.status === 'completed') ipoStats.completed += 1;
            ipoRows.set(row.ipo, ipoStats);

            if (row.actualQty > 0) {
                deliveredQuantity += row.actualQty;
                deliveredItemRows += 1;
                deliveredUnitSet.add(row.unit);
            }

            if (row.actualQty <= 0) undeliveredItems += 1;
            if (row.targetQty > 0 && row.actualQty > 0 && row.actualQty < row.targetQty) {
                partiallyDeliveredItems += 1;
            }

            const actualDate = parseDate(row.actualDeliveryDate);
            const targetDate = parseDate(row.deliveryDate);
            if (row.status === 'completed' && actualDate && targetDate && actualDate <= targetDate) {
                onTimeDeliveries += 1;
            }
        });

        const fullyServedIpos = Array.from(ipoRows.values()).filter(item => item.total > 0 && item.total === item.completed).length;
        const averageDeliveryRate = allStats.itemCount > 0 ? allStats.completionSum / allStats.itemCount : 0;
        const oneCompatibleUnit = deliveredUnitSet.size === 1 && !deliveredUnitSet.has('unspecified');
        const costDivisor = oneCompatibleUnit ? deliveredQuantity : deliveredItemRows;
        const costPerDelivered = costDivisor > 0 ? allStats.disbursed / costDivisor : 0;
        const costLabel = oneCompatibleUnit ? `per ${Array.from(deliveredUnitSet)[0]}` : 'per delivered item';

        return {
            stats: allStats,
            fullyServedIpos,
            physicalRate: getPhysicalRate(allStats),
            obligationRate: getFinancialRate(allStats.obligated, allStats.allocation),
            disbursementRate: getFinancialRate(allStats.disbursed, allStats.allocation),
            averageDeliveryRate,
            deliveredItemRows,
            onTimeDeliveries,
            undeliveredItems,
            partiallyDeliveredItems,
            costPerDelivered,
            costLabel,
        };
    }, [filteredRows]);

    const regionStats = useMemo(() => {
        const map = new Map<string, AggregateStats>();
        filteredRows.forEach(row => {
            if (!map.has(row.region)) map.set(row.region, emptyStats());
            addRowToStats(map.get(row.region)!, row);
        });
        return Array.from(map.entries())
            .map(([region, stats]) => ({
                region,
                stats,
                physicalRate: getPhysicalRate(stats),
                obligationRate: getFinancialRate(stats.obligated, stats.allocation),
                disbursementRate: getFinancialRate(stats.disbursed, stats.allocation),
            }))
            .sort((a, b) => b.stats.allocation - a.stats.allocation || a.region.localeCompare(b.region));
    }, [filteredRows]);

    const tableTree = useMemo(() => {
        const root = buildNode('root', 'Root', -1);
        filteredRows.forEach(row => {
            addRowToStats(root.stats, row);
            const region = getOrCreateChild(root, `region:${row.region}`, row.region, 0);
            addRowToStats(region.stats, row);
            const province = getOrCreateChild(region, `${region.key}|province:${row.province}`, row.province, 1);
            addRowToStats(province.stats, row);
            const municipality = getOrCreateChild(province, `${province.key}|municipality:${row.municipality}`, row.municipality, 2);
            addRowToStats(municipality.stats, row);
            const ipo = getOrCreateChild(municipality, `${municipality.key}|ipo:${row.ipo}`, row.ipo, 3);
            addRowToStats(ipo.stats, row);
            const subproject = getOrCreateChild(ipo, `${ipo.key}|subproject:${row.subprojectName}`, row.subprojectName, 4);
            addRowToStats(subproject.stats, row);
            subproject.rows.push(row);
        });

        const sortNode = (node: TreeNode) => {
            node.children.sort((a, b) => b.stats.allocation - a.stats.allocation || a.label.localeCompare(b.label));
            node.children.forEach(sortNode);
            node.rows.sort((a, b) => b.allocation - a.allocation || a.particulars.localeCompare(b.particulars));
        };
        sortNode(root);
        return root.children;
    }, [filteredRows]);

    const allExpandableKeys = useMemo(() => {
        const keys: string[] = [];
        const collect = (node: TreeNode) => {
            keys.push(node.key);
            node.children.forEach(collect);
        };
        tableTree.forEach(collect);
        return keys;
    }, [tableTree]);

    const statusCounts = analytics.stats;
    const statusTotal = Math.max(statusCounts.itemCount, 1);
    const completedDegrees = (statusCounts.completed / statusTotal) * 360;
    const partialDegrees = (statusCounts.partial / statusTotal) * 360;
    const delayedDegrees = (statusCounts.delayed / statusTotal) * 360;
    const donutStyle = {
        background: `conic-gradient(#16a34a 0deg ${completedDegrees}deg, #2563eb ${completedDegrees}deg ${completedDegrees + partialDegrees}deg, #f97316 ${completedDegrees + partialDegrees}deg ${completedDegrees + partialDegrees + delayedDegrees}deg, #ef4444 ${completedDegrees + partialDegrees + delayedDegrees}deg 360deg)`,
    };

    const mostDelayedRegion = [...regionStats].sort((a, b) => b.stats.delayed - a.stats.delayed)[0];
    const zeroCompletionSubprojects = new Set(
        filteredRows
            .filter(row => row.actualQty <= 0)
            .map(row => row.subprojectName)
    );

    const toggleNode = (key: string) => {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleExpandAll = () => setExpandedKeys(new Set(allExpandableKeys));
    const handleCollapseAll = () => setExpandedKeys(new Set());

    const handleDownloadExcel = () => {
        if (filteredRows.length === 0) {
            alert('No data to download.');
            return;
        }

        const exportRows = filteredRows.map(row => ({
            Region: row.region,
            Province: row.province,
            Municipality: row.municipality,
            IPO: row.ipo,
            Subproject: row.subprojectName,
            'Intervention Type': row.itemType,
            Particulars: row.particulars,
            Unit: row.unit,
            'Target Quantity': row.targetQty,
            'Allocated Budget': row.allocation,
            'Delivered Quantity': row.actualQty,
            'Physical Completion': row.completionRate / 100,
            Obligated: row.obligated,
            Disbursed: row.disbursed,
            'Obligation Completion': row.financialObligationRate / 100,
            'Disbursement Completion': row.financialDisbursementRate / 100,
            Status: getStatusLabel(row.status),
            'Target Delivery': formatDate(row.deliveryDate),
            'Actual Delivery': formatDate(row.actualDeliveryDate),
        }));

        const ws = XLSX.utils.json_to_sheet(exportRows);
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
            [11, 14, 15].forEach(columnIndex => {
                const cellRef = XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex });
                if (ws[cellRef]) {
                    ws[cellRef].t = 'n';
                    ws[cellRef].z = '0.0%';
                }
            });
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Interventions');
        XLSX.writeFile(wb, `Agricultural_Interventions_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const renderGroupRow = (node: TreeNode): React.ReactNode => {
        const isExpanded = searchTerm.trim() ? true : expandedKeys.has(node.key);
        const physicalRate = getPhysicalRate(node.stats);
        const obligationRate = getFinancialRate(node.stats.obligated, node.stats.allocation);
        const disbursementRate = getFinancialRate(node.stats.disbursed, node.stats.allocation);
        const status = getDominantStatus(node.stats);

        return (
            <React.Fragment key={node.key}>
                <tr className={`agri-monitor-row agri-monitor-row--level-${node.level}`}>
                    <td>
                        <button
                            type="button"
                            className="agri-monitor-row__toggle"
                            onClick={() => toggleNode(node.key)}
                            aria-expanded={isExpanded}
                            style={{ paddingLeft: `${node.level * 1.25 + 0.25}rem` }}
                        >
                            <ChevronRight aria-hidden="true" className={isExpanded ? 'is-expanded' : ''} />
                            <span title={node.label}>{node.label}</span>
                        </button>
                    </td>
                    <td className="agri-monitor-row__muted">{node.stats.itemCount} items</td>
                    <td className="agri-monitor-row__muted">-</td>
                    <td className="data-table__numeric agri-monitor-row__muted">-</td>
                    <td className="data-table__numeric">{peso.format(node.stats.allocation)}</td>
                    <td className="data-table__numeric agri-monitor-row__muted">-</td>
                    <td><RateBar value={physicalRate} /></td>
                    <td className="data-table__numeric">{peso.format(node.stats.obligated)}</td>
                    <td className="data-table__numeric">{peso.format(node.stats.disbursed)}</td>
                    <td>
                        <div className="agri-financial-mini">
                            <RateBar value={obligationRate} tone="obligation" />
                            <RateBar value={disbursementRate} tone="disbursement" />
                        </div>
                    </td>
                    <td><span className={`agri-status-pill ${getStatusClass(status)}`}>{getStatusLabel(status)}</span></td>
                </tr>
                {isExpanded && node.children.map(renderGroupRow)}
                {isExpanded && node.rows.map(renderItemRow)}
            </React.Fragment>
        );
    };

    const renderItemRow = (row: InterventionRow) => (
        <tr key={row.key} className="agri-monitor-row agri-monitor-row--item">
            <td>
                <div className="agri-monitor-item-title" title={`${row.itemType}: ${row.particulars}`}>
                    <strong>{row.particulars}</strong>
                    <span>{row.itemType}</span>
                </div>
            </td>
            <td>{row.itemType}</td>
            <td>{row.unit}</td>
            <td className="data-table__numeric">{formatQty(row.targetQty)}</td>
            <td className="data-table__numeric">{peso.format(row.allocation)}</td>
            <td className="data-table__numeric">{formatQty(row.actualQty)}</td>
            <td><RateBar value={row.completionRate} /></td>
            <td className="data-table__numeric">{peso.format(row.obligated)}</td>
            <td className="data-table__numeric">{peso.format(row.disbursed)}</td>
            <td>
                <div className="agri-financial-mini">
                    <RateBar value={row.financialObligationRate} tone="obligation" />
                    <RateBar value={row.financialDisbursementRate} tone="disbursement" />
                </div>
            </td>
            <td><span className={`agri-status-pill ${getStatusClass(row.status)}`}>{getStatusLabel(row.status)}</span></td>
        </tr>
    );

    return (
        <div className="agri-dashboard dashboard-view animate-fadeIn">
            <section className="agri-dashboard-hero" aria-labelledby="agri-interventions-title">
                <div>
                    <h3 id="agri-interventions-title" className="dashboard-module-title">Agricultural Interventions Dashboard</h3>
                </div>
                <button type="button" className="btn btn-primary btn-responsive" onClick={handleDownloadExcel}>
                    <Download aria-hidden="true" />
                    <span>Download XLSX</span>
                </button>
            </section>

            <section className="agri-kpi-grid" aria-label="Agricultural intervention summary">
                <KpiCard
                    icon={<Boxes />}
                    label="Total Subprojects"
                    value={`${numberFormatter.format(subprojectPerformance.completed)} / ${numberFormatter.format(subprojectPerformance.target)}`}
                    note="Completed / target"
                    tone="orange"
                />
                <KpiCard icon={<PackageCheck />} label="Total Intervention Items" value={numberFormatter.format(analytics.stats.itemCount)} note="Budget line items" tone="green" />
                <KpiCard icon={<CircleDollarSign />} label="Total Allocation" value={compactPeso.format(analytics.stats.allocation)} note={peso.format(analytics.stats.allocation)} tone="blue" />
                <KpiCard icon={<Gauge />} label="Physical Completion" value={`${percentFormatter.format(analytics.physicalRate)}%`} note={`${numberFormatter.format(analytics.stats.completed)} of ${numberFormatter.format(analytics.stats.itemCount)} items completed`} tone="green" />
                <KpiCard icon={<BarChart3 />} label="Financial Completion" value={`${percentFormatter.format(analytics.disbursementRate)}%`} note={`Obligated ${percentFormatter.format(analytics.obligationRate)}% / Disbursed ${percentFormatter.format(analytics.disbursementRate)}%`} tone="orange" />
                <KpiCard icon={<Users />} label="IPOs Fully Served" value={numberFormatter.format(analytics.fullyServedIpos)} note="All linked items completed" tone="purple" />
            </section>

            <section className="agri-kpi-grid agri-kpi-grid--secondary" aria-label="Delivery performance">
                <KpiCard icon={<AlertTriangle />} label="Delayed Deliveries" value={numberFormatter.format(analytics.stats.delayed)} note="Incomplete past target date" tone="red" />
                <KpiCard icon={<Clock />} label="Undelivered Items" value={numberFormatter.format(analytics.undeliveredItems)} note="No delivery recorded" tone="orange" />
                <KpiCard icon={<Truck />} label="Partially Delivered" value={numberFormatter.format(analytics.partiallyDeliveredItems)} note="Delivery in progress" tone="blue" />
                <KpiCard icon={<CheckCircle2 />} label="On Time Deliveries" value={numberFormatter.format(analytics.onTimeDeliveries)} note="Completed by target date" tone="green" />
                <KpiCard icon={<Gauge />} label="Average Delivery Rate" value={`${percentFormatter.format(analytics.averageDeliveryRate)}%`} note="Across all item rows" tone="purple" />
                <KpiCard icon={<CircleDollarSign />} label="Cost Per Unit Delivered" value={peso.format(analytics.costPerDelivered)} note={analytics.costLabel} tone="blue" />
            </section>

            <section className="agri-analytics-grid" aria-label="Agricultural intervention analytics">
                <article className="report-card agri-chart-card">
                    <div className="agri-card-heading">
                        <h4>Delivery Status Breakdown</h4>
                        <span>{numberFormatter.format(analytics.stats.itemCount)} total items</span>
                    </div>
                    <div className="agri-donut-layout">
                        <div className="agri-donut" style={donutStyle} aria-hidden="true">
                            <span>
                                <strong>{numberFormatter.format(analytics.stats.itemCount)}</strong>
                                Items
                            </span>
                        </div>
                        <div className="agri-donut-legend">
                            <span><i className="is-completed" />Completed <strong>{analytics.stats.completed}</strong></span>
                            <span><i className="is-partial" />Partial <strong>{analytics.stats.partial}</strong></span>
                            <span><i className="is-not-started" />Not Started <strong>{analytics.stats.notStarted}</strong></span>
                            <span><i className="is-delayed" />Delayed <strong>{analytics.stats.delayed}</strong></span>
                        </div>
                    </div>
                </article>

                <article className="report-card agri-chart-card agri-chart-card--wide">
                    <div className="agri-card-heading">
                        <h4>Physical vs Financial Completion</h4>
                        <span>By operating unit</span>
                    </div>
                    <div className="agri-region-bars">
                        {regionStats.length > 0 ? regionStats.map(item => (
                            <div key={item.region} className="agri-region-bar-row">
                                <span title={item.region}>{item.region}</span>
                                <div>
                                    <RateBar value={item.physicalRate} />
                                    <RateBar value={item.obligationRate} tone="obligation" />
                                    <RateBar value={item.disbursementRate} tone="disbursement" />
                                </div>
                            </div>
                        )) : (
                            <div className="dashboard-empty dashboard-empty--center">No regional data available.</div>
                        )}
                    </div>
                </article>

            </section>

            <section className="report-card agri-alert-card" aria-label="Top alerts and bottlenecks">
                <div className="agri-card-heading">
                    <h4>Top Alerts & Bottlenecks</h4>
                    <span>Generated from delivery records</span>
                </div>
                <div className="agri-alert-grid">
                    <AlertItem tone="red" icon={<AlertTriangle />} title={`${numberFormatter.format(analytics.stats.delayed)} delayed items`} detail="Items are beyond their target delivery date." />
                    <AlertItem tone="orange" icon={<Clock />} title={`${numberFormatter.format(analytics.stats.notStarted)} undelivered items`} detail="No actual delivery quantity has been encoded." />
                    <AlertItem tone="orange" icon={<AlertTriangle />} title={mostDelayedRegion ? `${mostDelayedRegion.region} has the most delayed items` : 'No delayed region'} detail={mostDelayedRegion ? `${mostDelayedRegion.stats.delayed} delayed items in this operating unit.` : 'No regional bottleneck detected.'} />
                    <AlertItem tone="blue" icon={<BarChart3 />} title={`${numberFormatter.format(zeroCompletionSubprojects.size)} subprojects at 0%`} detail="Subprojects have no delivered quantities encoded yet." />
                </div>
            </section>

            <section className="report-card agri-monitor-card" aria-labelledby="agri-monitor-title">
                <div className="agri-monitor-card__header">
                    <div>
                        <h4 id="agri-monitor-title">Intervention Items Monitoring Table</h4>
                        <p>Region / Province / Municipality / IPO / Subproject / Particular</p>
                    </div>
                    <div className="agri-monitor-actions">
                        <div className="data-table-search-wrap agri-monitor-search">
                            <Search aria-hidden="true" />
                            <input
                                type="text"
                                placeholder="Search region, IPO, subproject, or item..."
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                className="data-table-search"
                            />
                        </div>
                        <button type="button" className="btn btn-secondary btn-responsive" onClick={handleExpandAll}>
                            <ChevronsDown aria-hidden="true" />
                            <span>Expand All</span>
                        </button>
                        <button type="button" className="btn btn-secondary btn-responsive" onClick={handleCollapseAll}>
                            <ChevronsUp aria-hidden="true" />
                            <span>Collapse All</span>
                        </button>
                    </div>
                </div>

                <div className="data-table-scroll agri-monitor-table-wrap custom-scrollbar">
                    <table className="data-table agri-monitor-table">
                        <thead>
                            <tr>
                                <th>Region / Province / Municipality / IPO / Subproject / Particular</th>
                                <th>Intervention Item / Description</th>
                                <th>Unit</th>
                                <th className="data-table__numeric"><SortableLabel>Target Quantity</SortableLabel></th>
                                <th className="data-table__numeric"><SortableLabel>Allocated Budget</SortableLabel></th>
                                <th className="data-table__numeric"><SortableLabel>Delivered Quantity</SortableLabel></th>
                                <th>Physical Completion</th>
                                <th className="data-table__numeric">Obligated</th>
                                <th className="data-table__numeric">Disbursed</th>
                                <th>Financial Completion</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tableTree.length > 0 ? tableTree.map(renderGroupRow) : (
                                <tr>
                                    <td colSpan={11}>
                                        <div className="dashboard-empty dashboard-empty--center">
                                            {searchTerm ? `No results found for "${searchTerm}"` : 'No intervention data found in records.'}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default AgriculturalInterventionsDashboard;
