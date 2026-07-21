
// Author: 4K 
import React, { useMemo } from 'react';
import { MarketingPartner, IPO } from '../../constants';
import { usePagination, useUserAccess } from '../mainfunctions/TableHooks';
import { calculateMarketLinkageSales, formatMarketQuantityTotals, summarizeMarketPartnerSales } from '../../lib/marketSalesAggregation';
import { DataTablePagination } from '../ui/enterprise';

interface MarketProfileDetailProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onEditDetails: () => void;
    onAddLinkage: () => void;
    onSelectLinkage: (linkageKey: string | number) => void;
    commodityCategories: { [key: string]: string[] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MarketProfileDetail: React.FC<MarketProfileDetailProps> = ({ partner, ipos, onBack, onEditDetails, onAddLinkage, onSelectLinkage, commodityCategories }) => {
    const { canEdit } = useUserAccess('Marketing Database');
    
    // Filter and Sort IPOs by Region Proximity (Potential)
    const potentialIpos = useMemo(() => {
        if (!partner.commodityNeeds) return [];
        const needsNames = partner.commodityNeeds
            .map(commodity => commodity?.name?.trim().toLowerCase())
            .filter((name): name is string => Boolean(name));
        const filtered = ipos.filter(ipo => 
            (ipo.commodities || []).some(commodity => needsNames.includes((commodity.particular || '').trim().toLowerCase()))
        );
        const partnerRegion = partner.region;
        return filtered.sort((a, b) => {
            if (a.region === partnerRegion && b.region !== partnerRegion) return -1;
            if (a.region !== partnerRegion && b.region === partnerRegion) return 1;
            if (a.region !== b.region) return a.region.localeCompare(b.region);
            return a.name.localeCompare(b.name);
        });
    }, [partner.commodityNeeds, partner.region, ipos]);

    const marketSalesSummary = useMemo(() => summarizeMarketPartnerSales(partner), [partner]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const formatNumber = (amount: number) => {
        return new Intl.NumberFormat('en-US').format(amount);
    };

    const getLinkageCommodityLabel = (link: { commodityName?: string; commodityType?: string }) => (
        link.commodityName ? `${link.commodityName}${link.commodityType ? ` (${link.commodityType})` : ''}` : 'Unassigned'
    );

    const DetailBlock = ({ label, value }: { label: string, value: any }) => (
        <div className="detail-item">
            <dt className="detail-label">{label}</dt>
            <dd className="detail-value">{value || 'N/A'}</dd>
        </div>
    );

    const PaginationControls = ({
        currentPage,
        totalPages,
        onPageChange,
        itemsPerPage,
        onItemsPerPageChange,
        totalItems,
    }: {
        currentPage: number;
        totalPages: number;
        onPageChange: (page: number) => void;
        itemsPerPage: number;
        onItemsPerPageChange: (value: number) => void;
        totalItems: number;
    }) => (
        <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={onPageChange}
            onItemsPerPageChange={onItemsPerPageChange}
            pageSizeOptions={[5, 10, 20]}
        />
    );

    const marketingLinkageItems = useMemo(() => (
        (partner.marketingLinkages || []).map((link, index) => ({ link, index }))
    ), [partner.marketingLinkages]);
    const linkagePagination = usePagination(marketingLinkageItems, [partner.id, marketingLinkageItems.length]);
    const matchedIpoPagination = usePagination(potentialIpos, [partner.id, potentialIpos.length]);

    return (
        <div className="detail-page animate-fadeIn">
            <header className="detail-header">
                <div className="detail-heading">
                    <button onClick={onBack} className="btn btn-secondary btn-icon" aria-label="Back to marketing partners">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h1 className="detail-title">{partner.companyName}</h1>
                        <p className="detail-meta">Marketing Partner Profile | {partner.uid}</p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* General Information Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="detail-card-title">General Information</h3>
                            {canEdit && (
                                <button onClick={onEditDetails} className="btn btn-link">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    Edit Details
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                            <DetailBlock label="Buyer Type" value={<span className={`status-badge status-badge--compact ${partner.buyerType === 'Government' ? 'status-badge--info' : 'status-badge--neutral'}`}>{partner.buyerType || 'Private'}</span>} />
                            <DetailBlock label="Owner / Principal" value={partner.ownerName} />
                            <DetailBlock label="Payment Methods" value={
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {partner.paymentMethods?.map(m => <span key={m} className="status-badge status-badge--neutral status-badge--compact">{m}</span>)}
                                    {(!partner.paymentMethods || partner.paymentMethods.length === 0) && <span className="detail-empty detail-empty--compact">Unspecified</span>}
                                </div>
                            } />
                            <DetailBlock label="Contact Number" value={partner.contactNumber} />
                            <DetailBlock label="Email Address" value={partner.email} />
                            <DetailBlock label="Region" value={partner.region} />
                            <div className="md:col-span-2"><DetailBlock label="Location" value={partner.location} /></div>
                            
                            <div className="md:col-span-2">
                                <dt className="detail-label">Commodity Needs</dt>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {partner.commodityNeeds?.map((c, i) => {
                                        const totalVolume = MONTHS.reduce((sum, m) => sum + (Number((c as any)[`volume${m}`]) || 0), 0);
                                        return (
                                            <div key={i} className="market-need-card">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="market-need-card__title">{c.name}</h4>
                                                    <span className="status-badge status-badge--approved status-badge--compact">{c.sourceProvince || 'Any Source'}</span>
                                                </div>
                                                <div>
                                                    <p className="market-need-card__label">Quality Standard</p>
                                                    <p className="market-need-card__copy">"{c.qualityStandard || 'None specified.'}"</p>
                                                </div>
                                                <div>
                                                    <p className="market-need-card__label market-need-card__label--spread">
                                                        Monthly Volumes
                                                        <span className="market-need-card__total">Total: {totalVolume.toLocaleString()} Kg/Yr</span>
                                                    </p>
                                                    <div className="grid grid-cols-6 gap-1 mt-1">
                                                        {MONTHS.map(m => {
                                                            const val = (c as any)[`volume${m}`] || 0;
                                                            return (
                                                                <div key={m} className="market-month-cell">
                                                                    <span className="market-month-cell__label">{m}</span>
                                                                    <span className={`market-month-cell__value ${val > 0 ? 'has-value' : ''}`}>{val > 0 ? val.toLocaleString() : '-'}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {(!partner.commodityNeeds || partner.commodityNeeds.length === 0) && (
                                        <p className="detail-empty">No commodity requirements listed.</p>
                                    )}
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <DetailBlock label="Remarks" value={<p className="detail-note">{partner.remarks || 'No additional remarks.'}</p>} />
                            </div>
                        </div>
                    </div>

                    {/* Established Linkages Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="detail-card-title">Marketing Linkages</h3>
                            {canEdit && (
                                <button onClick={onAddLinkage} className="btn btn-link">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Add Market Linkage
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="detail-metric">
                                    <p className="detail-metric-label">Linked IPOs</p>
                                    <p className="detail-metric-value">{formatNumber(marketSalesSummary.linkedIpoCount)}</p>
                                </div>
                                <div className="detail-metric">
                                    <p className="detail-metric-label">Total Quantity Sold</p>
                                    <p className="detail-metric-value">{formatMarketQuantityTotals(marketSalesSummary.totalQuantityByUnit)}</p>
                                </div>
                                <div className="detail-metric">
                                    <p className="detail-metric-label">Total Sales from Market Linkage</p>
                                    <p className="detail-metric-value">{formatCurrency(marketSalesSummary.totalSales)}</p>
                                </div>
                            </div>
                            {marketingLinkageItems.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {linkagePagination.paginatedData.map(({ link, index }) => {
                                        const linkSales = calculateMarketLinkageSales(link);
                                        return (
                                        <button
                                            type="button"
                                            key={link.id ?? index}
                                            onClick={() => onSelectLinkage(link.id ?? index)}
                                            className="market-link-card"
                                            title={`Open market linkage details for ${link.ipoName}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <h4 className="market-link-card__title">{link.ipoName}</h4>
                                                <span className={`status-badge status-badge--compact ${link.negotiationStatus === 'Contract Signed' ? 'status-badge--approved' : 'status-badge--pending'}`}>
                                                    {link.negotiationStatus}
                                                </span>
                                            </div>
                                            <div className="market-link-card__grid">
                                                <div><p className="market-link-card__label">Commodity Sold</p><p className={link.commodityName ? 'market-link-card__value' : 'market-link-card__value is-missing'}>{getLinkageCommodityLabel(link)}</p></div>
                                                <div><p className="market-link-card__label">Qty Agreement</p><p className="market-link-card__value">{formatNumber(linkSales.quantity)} {linkSales.unitOfMeasure} ({link.agreedQuantityTimeframe})</p></div>
                                                <div><p className="market-link-card__label">Agreed Price</p><p className="market-link-card__value">{formatCurrency(linkSales.pricePerUnit)}/{linkSales.unitOfMeasure}</p></div>
                                                <div><p className="market-link-card__label">Sales Value</p><p className="market-link-card__value">{formatCurrency(linkSales.salesValue)}</p></div>
                                                <div><p className="market-link-card__label">Agreement Type</p><p className="market-link-card__value">{link.agreementType}</p></div>
                                                <div><p className="market-link-card__label">Effective Date</p><p className="market-link-card__value">{link.agreementDate ? new Date(link.agreementDate).toLocaleDateString() : 'N/A'}</p></div>
                                            </div>
                                            {link.testBuyConducted && (
                                                <div className="market-link-card__note">
                                                    <p className="market-link-card__label">Test Buy Completed</p>
                                                    <p className="market-link-card__copy">"{link.testBuyFeedback || 'No feedback provided.'}"</p>
                                                </div>
                                            )}
                                            <p className="table-link">Open details</p>
                                        </button>
                                        );
                                    })}
                                    <div className="md:col-span-2">
                                        <PaginationControls
                                            currentPage={linkagePagination.currentPage}
                                            totalPages={linkagePagination.totalPages}
                                            onPageChange={linkagePagination.setCurrentPage}
                                            itemsPerPage={linkagePagination.itemsPerPage}
                                            onItemsPerPageChange={linkagePagination.setItemsPerPage}
                                            totalItems={marketingLinkageItems.length}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="detail-empty">
                                    <p>No marketing linkages established yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Potential Partners Section (Matched IPOs) */}
                    <div className="detail-card">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="detail-card-title">
                                Matched IPO Producers
                            </h3>
                            <span className="status-badge status-badge--info status-badge--compact">{potentialIpos.length} Matches</span>
                        </div>
                        <div className="space-y-3">
                            {matchedIpoPagination.paginatedData.map(ipo => {
                                const matchingComms = ipo.commodities.filter(c => 
                                    partner.commodityNeeds?.map(n => n.name.toLowerCase()).includes(c.particular.toLowerCase())
                                );
                                const isSameRegion = ipo.region === partner.region;
                                return (
                                    <div key={ipo.id} className={`market-match-card ${isSameRegion ? 'is-nearby' : ''}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="market-match-card__title">{ipo.name}</h4>
                                            {isSameRegion && <span className="status-badge status-badge--approved status-badge--compact">Nearby</span>}
                                        </div>
                                        <p className="market-match-card__meta">{ipo.region}</p>
                                        <div className="mt-3 space-y-1">
                                            <div className="flex flex-wrap gap-1">
                                                {matchingComms.map((mc, idx) => (
                                                    <span key={idx} className="data-table-tag">{mc.particular}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {potentialIpos.length > 0 && (
                                <PaginationControls
                                    currentPage={matchedIpoPagination.currentPage}
                                    totalPages={matchedIpoPagination.totalPages}
                                    onPageChange={matchedIpoPagination.setCurrentPage}
                                    itemsPerPage={matchedIpoPagination.itemsPerPage}
                                    onItemsPerPageChange={matchedIpoPagination.setItemsPerPage}
                                    totalItems={potentialIpos.length}
                                />
                            )}
                        </div>
                    </div>

                    <div className="detail-card">
                        <h3 className="detail-card-title">Partner History</h3>
                        {partner.history && partner.history.length > 0 ? (
                            <div className="detail-timeline">
                                <ul className="detail-timeline__list">
                                    {partner.history.map((entry, index) => (
                                        <li key={index} className="detail-timeline__item">
                                            <span className="detail-timeline__marker"></span>
                                            <time className="detail-timeline__time">{new Date(entry.date).toLocaleDateString()}</time>
                                            <p className="detail-list-name">{entry.event}</p>
                                            <p className="detail-timeline__byline">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="detail-empty">No history available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarketProfileDetail;
