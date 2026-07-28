import { marketLinkageUnits, type MarketLinkage, type MarketLinkageUnit, type MarketingPartner } from '../constants';

const toNumber = (value: unknown) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export interface MarketLinkageSales {
    quantity: number;
    unitOfMeasure: MarketLinkageUnit;
    pricePerUnit: number;
    salesValue: number;
    quantityKg: number;
    pricePerKg: number;
}

export interface MarketSalesSummary {
    linkageCount: number;
    linkedIpoCount: number;
    linkedMarketCount: number;
    totalQuantityByUnit: Record<MarketLinkageUnit, number>;
    totalKg: number;
    totalSales: number;
}

export interface IpoMarketSalesRow extends MarketLinkageSales {
    partner: MarketingPartner;
    link: MarketLinkage;
}

export const getMarketLinkageUnit = (link?: Partial<MarketLinkage> | null): MarketLinkageUnit => {
    const unit = String(link?.unitOfMeasure || 'KG').trim();
    return marketLinkageUnits.includes(unit as MarketLinkageUnit) ? unit as MarketLinkageUnit : 'KG';
};

export const createEmptyMarketQuantityTotals = (): Record<MarketLinkageUnit, number> => (
    marketLinkageUnits.reduce((totals, unit) => {
        totals[unit] = 0;
        return totals;
    }, {} as Record<MarketLinkageUnit, number>)
);

export const formatMarketQuantity = (quantity: number, unit: MarketLinkageUnit) => `${new Intl.NumberFormat('en-US').format(Number.isFinite(quantity) ? quantity : 0)} ${unit}`;

export const formatMarketQuantityTotals = (totals: Partial<Record<MarketLinkageUnit, number>>) => {
    const parts = marketLinkageUnits
        .map(unit => ({ unit, quantity: Number(totals[unit] || 0) }))
        .filter(item => item.quantity > 0)
        .map(item => formatMarketQuantity(item.quantity, item.unit));
    return parts.length > 0 ? parts.join(', ') : `0 ${marketLinkageUnits[0]}`;
};

export const calculateMarketLinkageSales = (link: MarketLinkage): MarketLinkageSales => {
    const quantity = toNumber(link.agreedQuantityValue);
    const unitOfMeasure = getMarketLinkageUnit(link);
    const pricePerUnit = toNumber(link.agreedPricePerKg);

    return {
        quantity,
        unitOfMeasure,
        pricePerUnit,
        salesValue: quantity * pricePerUnit,
        quantityKg: unitOfMeasure === 'KG' ? quantity : 0,
        pricePerKg: unitOfMeasure === 'KG' ? pricePerUnit : 0,
    };
};

export const summarizeMarketLinkages = (linkages: MarketLinkage[] = []): MarketSalesSummary => {
    const linkedIpos = new Set<string>();

    const totals = linkages.reduce(
        (summary, link) => {
            const sales = calculateMarketLinkageSales(link);
            if (link.ipoId) linkedIpos.add(`id:${link.ipoId}`);
            else if (link.ipoName) linkedIpos.add(`name:${link.ipoName}`);

            return {
                linkageCount: summary.linkageCount + 1,
                linkedIpoCount: summary.linkedIpoCount,
                linkedMarketCount: summary.linkedMarketCount,
                totalQuantityByUnit: {
                    ...summary.totalQuantityByUnit,
                    [sales.unitOfMeasure]: summary.totalQuantityByUnit[sales.unitOfMeasure] + sales.quantity,
                },
                totalKg: summary.totalKg + (sales.unitOfMeasure === 'KG' ? sales.quantity : 0),
                totalSales: summary.totalSales + sales.salesValue,
            };
        },
        { linkageCount: 0, linkedIpoCount: 0, linkedMarketCount: 0, totalQuantityByUnit: createEmptyMarketQuantityTotals(), totalKg: 0, totalSales: 0 }
    );

    return {
        ...totals,
        linkedIpoCount: linkedIpos.size,
        linkedMarketCount: 0,
    };
};

export const summarizeMarketPartnerSales = (partner: MarketingPartner): MarketSalesSummary => (
    summarizeMarketLinkages(partner.marketingLinkages || [])
);

export const getIpoMarketSalesRows = (
    partners: MarketingPartner[] = [],
    ipo: { id: number | string; name: string } | string
): IpoMarketSalesRow[] => {
    const rows: IpoMarketSalesRow[] = [];
    const ipoId = typeof ipo === 'string' ? null : Number(ipo.id);
    const ipoName = typeof ipo === 'string' ? ipo : ipo.name;

    partners.forEach(partner => {
        (partner.marketingLinkages || []).forEach(link => {
            const hasImmutableId = Number.isFinite(Number(link.ipoId));
            if (hasImmutableId ? Number(link.ipoId) !== ipoId : link.ipoName !== ipoName) return;
            rows.push({
                partner,
                link,
                ...calculateMarketLinkageSales(link),
            });
        });
    });

    return rows.sort((a, b) => new Date(b.link.agreementDate || '').getTime() - new Date(a.link.agreementDate || '').getTime());
};

export const summarizeIpoMarketSales = (rows: IpoMarketSalesRow[]): MarketSalesSummary => ({
    linkageCount: rows.length,
    linkedIpoCount: rows.length > 0 ? 1 : 0,
    linkedMarketCount: new Set(rows.map(row => row.partner.id)).size,
    totalQuantityByUnit: rows.reduce((totals, row) => ({
        ...totals,
        [row.unitOfMeasure]: totals[row.unitOfMeasure] + row.quantity,
    }), createEmptyMarketQuantityTotals()),
    totalKg: rows.reduce((sum, row) => sum + (row.unitOfMeasure === 'KG' ? row.quantity : 0), 0),
    totalSales: rows.reduce((sum, row) => sum + row.salesValue, 0),
});
