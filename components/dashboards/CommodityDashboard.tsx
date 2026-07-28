// Author: 4K
import React, { useMemo, useState } from 'react';
import { ChevronDown, Download, Layers3, PackageSearch, Search, Sprout, UsersRound, WalletCards } from 'lucide-react';
import { IPO, Subproject } from '../../constants';
import { XLSX } from '../reports/ReportUtils';
import { getSubprojectIpo, getSubprojectIpoName } from '../../lib/entityIdentity';

interface Props {
    subprojects: Subproject[];
    ipos?: IPO[];
    onSelectSubproject?: (project: Subproject) => void;
}

type CommodityUnit = 'hectares' | 'heads';

interface CommodityDetailRow {
    key: string;
    commodityName: string;
    commodityType: string;
    unit: CommodityUnit;
    quantity: number;
    allocatedAmount: number;
    subprojectAmount: number;
    subprojectName: string;
    subprojectStatus: string;
    ipoName: string;
    operatingUnit: string;
    fundingYear?: number;
    subproject: Subproject;
}

interface CommoditySummary {
    key: string;
    name: string;
    type: string;
    unit: CommodityUnit;
    cropHectares: number;
    livestockHeads: number;
    amount: number;
    subprojects: Set<string>;
    ipos: Set<string>;
    operatingUnits: Set<string>;
    statusCounts: Record<string, number>;
    rows: CommodityDetailRow[];
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const normalizeText = (value: unknown) => String(value || '').trim();

const normalizeKey = (type: string, name: string) => `${type.toLowerCase()}::${name.toLowerCase()}`;

const formatNumber = (value: number) => numberFormatter.format(Math.round((value || 0) * 100) / 100);

const formatCurrency = (value: number) => currencyFormatter.format(Math.round(value || 0));

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: 'compact',
});

const formatCompactNumber = (value: number) => compactNumberFormatter.format(value || 0);

const formatCompactCurrency = (value: number) => {
    if (!value) return '₱0';
    return `₱${compactNumberFormatter.format(value)}`;
};

const formatCompactQuantity = (value: number, suffix = '') => {
    const formatted = formatCompactNumber(value);
    return suffix ? `${formatted} ${suffix}` : formatted;
};

const formatSetList = (values: Set<string>, emptyLabel = '-') => {
    const list = Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b));
    if (list.length === 0) return emptyLabel;
    if (list.length <= 2) return list.join(', ');
    return `${list.slice(0, 2).join(', ')} +${list.length - 2}`;
};

const getSubprojectAmount = (subproject: Subproject) => {
    return (subproject.details || []).reduce((total, detail) => {
        const units = Number(detail.numberOfUnits) || 0;
        const price = Number(detail.pricePerUnit) || 0;
        return total + units * price;
    }, 0);
};

const getStatusCount = (summaries: CommoditySummary[], status: string) => {
    return summaries.reduce((total, item) => total + (item.statusCounts[status] || 0), 0);
};

const HorizontalBarList: React.FC<{
    title: string;
    unitLabel: string;
    items: { name: string; value: number }[];
    emptyLabel: string;
    valueFormatter?: (value: number) => string;
}> = ({ title, unitLabel, items, emptyLabel, valueFormatter }) => {
    const maxValue = Math.max(1, ...items.map(item => item.value));

    return (
        <div className="dashboard-chart-card commodity-chart-card">
            <h4 className="dashboard-chart-title">{title}</h4>
            <div className="commodity-bar-list">
                {items.length > 0 ? items.map(item => (
                    <div key={item.name} className="commodity-bar-row">
                        <span className="commodity-bar-row__label" title={item.name}>{item.name}</span>
                        <div className="commodity-bar-row__track" aria-hidden="true">
                            <span style={{ width: `${Math.max(4, (item.value / maxValue) * 100)}%` }} />
                        </div>
                        <span className="commodity-bar-row__value">{valueFormatter ? valueFormatter(item.value) : `${formatNumber(item.value)} ${unitLabel}`.trim()}</span>
                    </div>
                )) : (
                    <p className="dashboard-empty dashboard-empty--center">{emptyLabel}</p>
                )}
            </div>
        </div>
    );
};

const StatusBreakdown: React.FC<{ summaries: CommoditySummary[] }> = ({ summaries }) => {
    const statuses = [
        { label: 'Proposed', value: getStatusCount(summaries, 'Proposed'), className: 'commodity-status-bar--proposed' },
        { label: 'Ongoing', value: getStatusCount(summaries, 'Ongoing'), className: 'commodity-status-bar--ongoing' },
        { label: 'Completed', value: getStatusCount(summaries, 'Completed'), className: 'commodity-status-bar--completed' },
        { label: 'Cancelled', value: getStatusCount(summaries, 'Cancelled'), className: 'commodity-status-bar--cancelled' },
    ];
    const total = Math.max(1, statuses.reduce((sum, item) => sum + item.value, 0));

    return (
        <div className="dashboard-chart-card commodity-status-card">
            <h4 className="dashboard-chart-title">Subproject Status by Commodity Links</h4>
            <div className="commodity-status-stack">
                {statuses.map(item => (
                    <div key={item.label} className="commodity-status-row">
                        <div className="commodity-status-row__header">
                            <span>{item.label}</span>
                            <strong>{item.value.toLocaleString()}</strong>
                        </div>
                        <div className="commodity-status-row__track">
                            <span className={item.className} style={{ width: `${(item.value / total) * 100}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CommodityMetricCard: React.FC<{
    label: string;
    value: string;
    detail: string;
    icon: React.ReactNode;
}> = ({ label, value, detail, icon }) => (
    <div className="commodity-metric-card">
        <div className="commodity-metric-card__icon">{icon}</div>
        <div className="commodity-metric-card__body">
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    </div>
);

const CommodityDashboard: React.FC<Props> = ({ subprojects, ipos = [], onSelectSubproject }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCommodities, setExpandedCommodities] = useState<Set<string>>(new Set());

    const { summaries, detailRows } = useMemo(() => {
        const summaryMap = new Map<string, CommoditySummary>();
        const rows: CommodityDetailRow[] = [];

        (subprojects || []).forEach(subproject => {
            const commodities = (subproject.subprojectCommodities || [])
                .map(commodity => ({
                    type: normalizeText(commodity.typeName),
                    name: normalizeText(commodity.name),
                    quantity: Math.max(0, Number(commodity.area) || 0),
                }))
                .filter(commodity => commodity.type && commodity.name);

            if (commodities.length === 0) return;

            const subprojectAmount = getSubprojectAmount(subproject);
            const totalQuantity = commodities.reduce((sum, commodity) => sum + commodity.quantity, 0);
            const fallbackShare = commodities.length > 0 ? 1 / commodities.length : 0;

            commodities.forEach((commodity, index) => {
                const key = normalizeKey(commodity.type, commodity.name);
                const unit: CommodityUnit = commodity.type.toLowerCase() === 'livestock' ? 'heads' : 'hectares';
                const share = totalQuantity > 0 ? commodity.quantity / totalQuantity : fallbackShare;
                const allocatedAmount = subprojectAmount * share;
                const subprojectKey = String(subproject.id ?? subproject.uid ?? subproject.name);
                const linkedIpo = getSubprojectIpo(subproject, ipos);
                const ipoName = getSubprojectIpoName(subproject, ipos) || 'Unspecified IPO';
                const ipoKey = linkedIpo ? String(linkedIpo.id) : `legacy:${ipoName.toLowerCase()}`;

                if (!summaryMap.has(key)) {
                    summaryMap.set(key, {
                        key,
                        name: commodity.name,
                        type: commodity.type,
                        unit,
                        cropHectares: 0,
                        livestockHeads: 0,
                        amount: 0,
                        subprojects: new Set(),
                        ipos: new Set(),
                        operatingUnits: new Set(),
                        statusCounts: {},
                        rows: [],
                    });
                }

                const summary = summaryMap.get(key)!;
                if (unit === 'heads') summary.livestockHeads += commodity.quantity;
                else summary.cropHectares += commodity.quantity;

                summary.amount += allocatedAmount;
                summary.subprojects.add(subprojectKey);
                summary.ipos.add(ipoKey);
                summary.operatingUnits.add(subproject.operatingUnit || 'Unspecified OU');
                summary.statusCounts[subproject.status] = (summary.statusCounts[subproject.status] || 0) + 1;

                const row: CommodityDetailRow = {
                    key: `${key}-${subprojectKey}-${index}`,
                    commodityName: commodity.name,
                    commodityType: commodity.type,
                    unit,
                    quantity: commodity.quantity,
                    allocatedAmount,
                    subprojectAmount,
                    subprojectName: subproject.name || 'Untitled subproject',
                    subprojectStatus: subproject.status,
                    ipoName,
                    operatingUnit: subproject.operatingUnit || 'Unspecified OU',
                    fundingYear: subproject.fundingYear,
                    subproject,
                };

                summary.rows.push(row);
                rows.push(row);
            });
        });

        const sortedSummaries = Array.from(summaryMap.values()).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
        return { summaries: sortedSummaries, detailRows: rows };
    }, [ipos, subprojects]);

    const filteredSummaries = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return summaries;
        return summaries.filter(item => (
            item.name.toLowerCase().includes(term) ||
            item.type.toLowerCase().includes(term)
        ));
    }, [searchTerm, summaries]);

    const totals = useMemo(() => {
        const subprojectKeys = new Set<string>();
        const ipoKeys = new Set<string>();
        summaries.forEach(item => {
            item.subprojects.forEach(id => subprojectKeys.add(id));
            item.ipos.forEach(id => ipoKeys.add(id));
        });

        return {
            commodityCount: summaries.length,
            subprojectsWithCommodities: subprojectKeys.size,
            iposInvolved: ipoKeys.size,
            cropHectares: summaries.reduce((sum, item) => sum + item.cropHectares, 0),
            livestockHeads: summaries.reduce((sum, item) => sum + item.livestockHeads, 0),
            amount: summaries.reduce((sum, item) => sum + item.amount, 0),
        };
    }, [summaries]);

    const topCropItems = filteredSummaries
        .filter(item => item.cropHectares > 0)
        .sort((a, b) => b.cropHectares - a.cropHectares)
        .slice(0, 8)
        .map(item => ({ name: item.name, value: item.cropHectares }));

    const topLivestockItems = filteredSummaries
        .filter(item => item.livestockHeads > 0)
        .sort((a, b) => b.livestockHeads - a.livestockHeads)
        .slice(0, 8)
        .map(item => ({ name: item.name, value: item.livestockHeads }));

    const topAmountItems = filteredSummaries
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8)
        .map(item => ({ name: item.name, value: item.amount }));

    const toggleCommodity = (key: string) => {
        setExpandedCommodities(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleDownloadExcel = () => {
        if (!XLSX) {
            alert('XLSX library is not available.');
            return;
        }

        if (summaries.length === 0) {
            alert('No commodity data to download.');
            return;
        }

        const summarySheet = summaries.map(item => ({
            Commodity: item.name,
            Type: item.type,
            Unit: item.unit,
            'Crop Hectares': item.cropHectares,
            'Livestock Heads': item.livestockHeads,
            'Operating Units': Array.from(item.operatingUnits).sort().join('; '),
            'IPOs Involved': item.ipos.size,
            'Subprojects': item.subprojects.size,
            'Allocated Amount': item.amount,
            Proposed: item.statusCounts.Proposed || 0,
            Ongoing: item.statusCounts.Ongoing || 0,
            Completed: item.statusCounts.Completed || 0,
            Cancelled: item.statusCounts.Cancelled || 0,
        }));

        const detailSheet = detailRows.map(row => ({
            Commodity: row.commodityName,
            Type: row.commodityType,
            Unit: row.unit,
            Quantity: row.quantity,
            'Allocated Amount': row.allocatedAmount,
            'Subproject Amount': row.subprojectAmount,
            Subproject: row.subprojectName,
            IPO: row.ipoName,
            OU: row.operatingUnit,
            Status: row.subprojectStatus,
            'Funding Year': row.fundingYear || '',
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'Commodity Summary');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailSheet), 'Subproject Details');
        XLSX.writeFile(wb, `Commodity_Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="commodity-dashboard dashboard-view animate-fadeIn">
            <section className="dashboard-section commodity-hero" aria-labelledby="commodity-dashboard-title">
                <div>
                    <div id="commodity-dashboard-title" className="dashboard-section__title">Commodity Overview</div>
                </div>
                <button type="button" onClick={handleDownloadExcel} className="btn btn-primary btn-responsive">
                    <Download className="btn-symbol" aria-hidden="true" />
                    <span className="btn-text">Export XLSX</span>
                </button>
            </section>

            <section className="commodity-metric-grid" aria-label="Commodity dashboard metrics">
                <CommodityMetricCard label="Commodities tracked" value={formatCompactNumber(totals.commodityCount)} detail="Unique subproject commodities" icon={<Sprout aria-hidden="true" />} />
                <CommodityMetricCard label="Crop hectares" value={formatCompactQuantity(totals.cropHectares, 'ha')} detail="Crop commodity area" icon={<Layers3 aria-hidden="true" />} />
                <CommodityMetricCard label="Livestock heads" value={formatCompactNumber(totals.livestockHeads)} detail="Livestock commodity count" icon={<PackageSearch aria-hidden="true" />} />
                <CommodityMetricCard label="IPOs involved" value={formatCompactNumber(totals.iposInvolved)} detail="Unique linked IPOs" icon={<UsersRound aria-hidden="true" />} />
                <CommodityMetricCard label="Subprojects" value={formatCompactNumber(totals.subprojectsWithCommodities)} detail="With commodity entries" icon={<PackageSearch aria-hidden="true" />} />
                <CommodityMetricCard label="Allocated amount" value={formatCompactCurrency(totals.amount)} detail="Proportional by commodity area" icon={<WalletCards aria-hidden="true" />} />
            </section>

            <section className="dashboard-card-grid dashboard-card-grid--two" aria-label="Commodity charts">
                <HorizontalBarList title="Top Crop Commodities by Hectares" unitLabel="ha" items={topCropItems} emptyLabel="No crop commodity hectares found." />
                <HorizontalBarList title="Top Livestock Commodities by Heads" unitLabel="heads" items={topLivestockItems} emptyLabel="No livestock commodities found." />
                <HorizontalBarList title="Top Commodities by Allocated Amount" unitLabel="" items={topAmountItems} emptyLabel="No allocated amounts found." valueFormatter={formatCurrency} />
                <StatusBreakdown summaries={filteredSummaries} />
            </section>

            <section className="report-card commodity-summary-card" aria-labelledby="commodity-summary-title">
                <div className="agri-intervention-card__header commodity-summary-card__header">
                    <h4 id="commodity-summary-title" className="report-card__title agri-intervention-card__title">Commodity Summary</h4>
                    <div className="data-table-search-wrap commodity-summary-card__search">
                        <Search aria-hidden="true" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="data-table-search"
                            placeholder="Search commodity or type..."
                        />
                    </div>
                </div>
                <div className="data-table-scroll custom-scrollbar commodity-summary-table-wrap">
                    <table className="data-table commodity-summary-table">
                        <thead>
                            <tr>
                                <th>Commodity</th>
                                <th>Type</th>
                                <th className="data-table__numeric">Hectares</th>
                                <th className="data-table__numeric">Heads</th>
                                <th>OUs</th>
                                <th className="data-table__numeric">IPOs</th>
                                <th className="data-table__numeric">Subprojects</th>
                                <th className="data-table__numeric">Amount</th>
                                <th>Status Mix</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSummaries.map(item => {
                                const isExpanded = expandedCommodities.has(item.key);
                                return (
                                    <React.Fragment key={item.key}>
                                        <tr className="commodity-summary-row">
                                            <td>
                                                <button
                                                    type="button"
                                                    className="commodity-expand-button"
                                                    onClick={() => toggleCommodity(item.key)}
                                                    aria-expanded={isExpanded}
                                                >
                                                    <ChevronDown className={isExpanded ? 'is-expanded' : ''} aria-hidden="true" />
                                                    <span className="commodity-name-cell">
                                                        <strong>{item.name}</strong>
                                                        <span>{item.rows.length.toLocaleString()} linked commodity record{item.rows.length === 1 ? '' : 's'}</span>
                                                    </span>
                                                </button>
                                            </td>
                                            <td><span className="status-badge status-badge--compact status-badge--cyan">{item.type}</span></td>
                                            <td className="data-table__numeric">{item.cropHectares > 0 ? formatNumber(item.cropHectares) : '-'}</td>
                                            <td className="data-table__numeric">{item.livestockHeads > 0 ? formatNumber(item.livestockHeads) : '-'}</td>
                                            <td title={Array.from(item.operatingUnits).sort().join(', ')}>{formatSetList(item.operatingUnits)}</td>
                                            <td className="data-table__numeric">{item.ipos.size.toLocaleString()}</td>
                                            <td className="data-table__numeric">{item.subprojects.size.toLocaleString()}</td>
                                            <td className="data-table__numeric">{formatCurrency(item.amount)}</td>
                                            <td>
                                                <div className="commodity-status-pills">
                                                    {(item.statusCounts.Proposed || 0) > 0 && <span>Proposed {item.statusCounts.Proposed}</span>}
                                                    {(item.statusCounts.Ongoing || 0) > 0 && <span>Ongoing {item.statusCounts.Ongoing}</span>}
                                                    {(item.statusCounts.Completed || 0) > 0 && <span>Completed {item.statusCounts.Completed}</span>}
                                                    {(item.statusCounts.Cancelled || 0) > 0 && <span>Cancelled {item.statusCounts.Cancelled}</span>}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && item.rows.map(row => (
                                            <tr key={row.key} className="commodity-detail-row">
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="commodity-subproject-link"
                                                        onClick={() => onSelectSubproject?.(row.subproject)}
                                                        disabled={!onSelectSubproject}
                                                        title={onSelectSubproject ? 'Open subproject details' : undefined}
                                                    >
                                                        {row.subprojectName}
                                                    </button>
                                                </td>
                                                <td>{row.subprojectStatus}</td>
                                                <td className="data-table__numeric">{row.unit === 'hectares' ? formatNumber(row.quantity) : '-'}</td>
                                                <td className="data-table__numeric">{row.unit === 'heads' ? formatNumber(row.quantity) : '-'}</td>
                                                <td>{row.operatingUnit}</td>
                                                <td>{row.ipoName}</td>
                                                <td className="data-table__numeric">1</td>
                                                <td className="data-table__numeric">{formatCurrency(row.allocatedAmount)}</td>
                                                <td>{row.fundingYear || '-'}</td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                            {filteredSummaries.length === 0 && (
                                <tr>
                                    <td colSpan={9}>
                                        <div className="dashboard-empty dashboard-empty--center">
                                            {searchTerm ? `No commodities found for "${searchTerm}".` : 'No subproject commodity data found for the selected filters.'}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="dashboard-section__note">
                    Amounts are allocated across each subproject's commodities by recorded hectares or heads. If no quantity is recorded, the subproject amount is split equally.
                </div>
            </section>
        </div>
    );
};

export default CommodityDashboard;
