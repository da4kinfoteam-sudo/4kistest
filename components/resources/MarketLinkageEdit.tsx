// Author: 4K
import React, { useMemo, useState } from 'react';
import { IPO, MarketLinkage, MarketingPartner, marketLinkageUnits, philippineRegions } from '../../constants';
import { getMarketLinkageUnit } from '../../lib/marketSalesAggregation';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { resolveIpoByIdOrName } from '../../lib/entityIdentity';

interface MarketLinkageEditProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'] as const;
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'] as const;
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'] as const;

const commonInputClasses = "form-control";

const createBlankLinkage = (): MarketLinkage => ({
    id: '',
    region: '',
    ipoId: null,
    ipoName: '',
    commodityNeedId: null,
    commodityName: '',
    commodityType: '',
    negotiationStatus: 'Agreed',
    unitOfMeasure: 'KG',
    agreedQuantityValue: 0,
    agreedQuantityTimeframe: 'Monthly',
    agreedPricePerKg: 0,
    agreementType: 'Verbal',
    agreementDate: '',
    testBuyConducted: false,
});

const getCommodityLabel = (name?: string, type?: string) => (
    name ? `${name}${type ? ` (${type})` : ''}` : 'Unassigned'
);

const getLinkedIpoNames = (linkages: MarketLinkage[]) => (
    Array.from(new Set(linkages.map(link => link.ipoName).filter(Boolean)))
);

const MarketLinkageEdit: React.FC<MarketLinkageEditProps> = ({ partner, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const [tempLinkage, setTempLinkage] = useState<MarketLinkage>(createBlankLinkage);
    const [isSaving, setIsSaving] = useState(false);
    const commodityNeeds = partner.commodityNeeds || [];
    const selectedUnit = getMarketLinkageUnit(tempLinkage);

    const iposInLinkageRegion = useMemo(() => {
        if (!tempLinkage.region) return [];
        return ipos.filter(i => i.region === tempLinkage.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [tempLinkage.region, ipos]);

    const handleCommoditySoldChange = (commodityNeedId: string) => {
        const selectedNeed = commodityNeeds.find(need => String(need.id) === commodityNeedId);
        setTempLinkage(prev => ({
            ...prev,
            commodityNeedId: selectedNeed?.id ?? null,
            commodityName: selectedNeed?.name || '',
            commodityType: selectedNeed?.type || '',
        }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (commodityNeeds.length === 0) {
            alert('Add at least one company commodity need before creating a market linkage.');
            return;
        }
        const selectedIpo = resolveIpoByIdOrName(ipos, tempLinkage.ipoId, tempLinkage.ipoName);
        if (!tempLinkage.region || !selectedIpo) {
            alert('Region and IPO are required.');
            return;
        }
        if (!tempLinkage.commodityNeedId || !tempLinkage.commodityName) {
            alert('Commodity Sold is required.');
            return;
        }

        const newLinkage: MarketLinkage = {
            ...tempLinkage,
            id: tempLinkage.id || Date.now(),
            ipoId: selectedIpo.id,
            ipoName: selectedIpo.name,
            unitOfMeasure: selectedUnit,
        };
        const marketingLinkages = [...(partner.marketingLinkages || []), newLinkage];
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages,
            linkedIpoNames: getLinkedIpoNames(marketingLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Added: ${newLinkage.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        if (supabase) {
            try {
                const { id, ...payload } = updatedPartner;
                const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
                if (error) throw error;
            } catch (err: any) {
                alert(`Failed to update database: ${err.message}`);
                setIsSaving(false);
                return;
            }
        }

        onUpdatePartner(updatedPartner);
        setIsSaving(false);
        onBack();
    };

    return (
        <div className="form-page animate-fadeIn">
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">Add Market Linkage</h1>
                    <p className="detail-meta">{partner.companyName} | {partner.uid}</p>
                </div>
                <button onClick={onBack} className="btn btn-secondary">Back to Profile</button>
            </header>

            <form onSubmit={handleSave} className="form-card form-stack form-stack--spacious">
                <div className="form-section form-stack">
                    <h3 className="form-section__title">Establish New Linkage</h3>
                    {commodityNeeds.length === 0 && (
                        <div className="notice notice--warning">
                            Add company commodity needs first before creating market linkages.
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="form-label form-label--compact">Region</label>
                            <select value={tempLinkage.region} onChange={e => setTempLinkage({ ...tempLinkage, region: e.target.value, ipoId: null, ipoName: '' })} className={commonInputClasses}>
                                <option value="">Select Region</option>
                                {philippineRegions.map(region => <option key={region} value={region}>{region}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label form-label--compact">IPO</label>
                            <select value={tempLinkage.ipoId ? String(tempLinkage.ipoId) : ''} onChange={e => {
                                const selectedIpo = iposInLinkageRegion.find(ipo => String(ipo.id) === e.target.value);
                                setTempLinkage({
                                    ...tempLinkage,
                                    ipoId: selectedIpo?.id || null,
                                    ipoName: selectedIpo?.name || '',
                                });
                            }} disabled={!tempLinkage.region} className={commonInputClasses}>
                                <option value="">Select IPO</option>
                                {iposInLinkageRegion.map(ipo => <option key={ipo.id} value={String(ipo.id)}>{ipo.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label form-label--compact">Negotiation Status</label>
                            <select value={tempLinkage.negotiationStatus} onChange={e => setTempLinkage({ ...tempLinkage, negotiationStatus: e.target.value as MarketLinkage['negotiationStatus'] })} className={commonInputClasses}>
                                {NEGOTIATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="form-label form-label--compact">Agreement Type</label>
                            <select value={tempLinkage.agreementType} onChange={e => setTempLinkage({ ...tempLinkage, agreementType: e.target.value as MarketLinkage['agreementType'] })} className={commonInputClasses}>
                                {AGREEMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="form-label form-label--compact">Commodity Sold</label>
                            <select value={tempLinkage.commodityNeedId ? String(tempLinkage.commodityNeedId) : ''} onChange={e => handleCommoditySoldChange(e.target.value)} disabled={commodityNeeds.length === 0} className={commonInputClasses}>
                                <option value="">{commodityNeeds.length === 0 ? 'No company commodity needs encoded' : 'Select commodity'}</option>
                                {commodityNeeds.map(need => <option key={need.id} value={String(need.id)}>{getCommodityLabel(need.name, need.type)}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="form-label form-label--compact">Unit of Measure</label>
                                <select value={selectedUnit} onChange={e => setTempLinkage({ ...tempLinkage, unitOfMeasure: e.target.value as MarketLinkage['unitOfMeasure'] })} className={commonInputClasses}>
                                    {marketLinkageUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label form-label--compact">Agreed Qty ({selectedUnit})</label>
                                <input type="number" value={tempLinkage.agreedQuantityValue || ''} onChange={e => setTempLinkage({ ...tempLinkage, agreedQuantityValue: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="form-label form-label--compact">Timeframe</label>
                                <select value={tempLinkage.agreedQuantityTimeframe} onChange={e => setTempLinkage({ ...tempLinkage, agreedQuantityTimeframe: e.target.value as MarketLinkage['agreedQuantityTimeframe'] })} className={commonInputClasses}>
                                    {TIMEFRAMES.map(timeframe => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="form-label form-label--compact">Agreed Price (PHP/{selectedUnit})</label>
                                <input type="number" value={tempLinkage.agreedPricePerKg || ''} onChange={e => setTempLinkage({ ...tempLinkage, agreedPricePerKg: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="form-label form-label--compact">Agreement Date</label>
                                <input type="date" value={tempLinkage.agreementDate} onChange={e => setTempLinkage({ ...tempLinkage, agreementDate: e.target.value })} className={commonInputClasses} />
                            </div>
                        </div>
                    </div>

                    <div className="form-divider">
                        <label className="form-check">
                            <input type="checkbox" checked={tempLinkage.testBuyConducted} onChange={e => setTempLinkage({ ...tempLinkage, testBuyConducted: e.target.checked })} className="form-checkbox" />
                            <span>Test Buy Information</span>
                        </label>
                        {tempLinkage.testBuyConducted && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                                <div>
                                    <label className="form-label form-label--compact">Test Buy Date</label>
                                    <input type="date" value={tempLinkage.testBuyDate || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyDate: e.target.value })} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="form-label form-label--compact">Test Buy Qty ({selectedUnit})</label>
                                    <input type="number" value={tempLinkage.testBuyQuantity || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyQuantity: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label form-label--compact">Test Buy Feedback</label>
                                    <textarea value={tempLinkage.testBuyFeedback || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyFeedback: e.target.value })} rows={3} className={commonInputClasses} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-footer">
                    <button type="button" onClick={onBack} className="btn btn-secondary">Cancel</button>
                    <button type="submit" disabled={isSaving || commodityNeeds.length === 0} className="btn btn-primary">
                        {isSaving ? 'Saving...' : 'Save Linkage'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MarketLinkageEdit;
