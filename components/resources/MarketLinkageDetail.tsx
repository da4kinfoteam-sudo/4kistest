// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import { IPO, MarketLinkage, MarketingPartner, marketLinkageUnits, philippineRegions } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { calculateMarketLinkageSales, getMarketLinkageUnit } from '../../lib/marketSalesAggregation';
import { supabase } from '../../supabaseClient';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { ConfirmDialog } from '../ui/enterprise';

interface MarketLinkageDetailProps {
    partner: MarketingPartner;
    linkageKey: string | number;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'] as const;
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'] as const;
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'] as const;

const commonInputClasses = "form-control";

const getCommodityLabel = (name?: string, type?: string) => (
    name ? `${name}${type ? ` (${type})` : ''}` : 'Unassigned'
);

const getLinkedIpoNames = (linkages: MarketLinkage[]) => (
    Array.from(new Set(linkages.map(link => link.ipoName).filter(Boolean)))
);

const findLinkageIndex = (linkages: MarketLinkage[], linkageKey: string | number) => (
    linkages.findIndex((link, idx) => {
        const stableKey = link.id !== undefined && link.id !== null && String(link.id) !== '' ? link.id : idx;
        return String(stableKey) === String(linkageKey);
    })
);

const formatCurrency = (amount: number) => (
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number.isFinite(amount) ? amount : 0)
);

const formatNumber = (amount: number) => (
    new Intl.NumberFormat('en-US').format(Number.isFinite(amount) ? amount : 0)
);

const DetailBlock = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="detail-metric">
        <dt className="detail-metric-label">{label}</dt>
        <dd className="detail-metric-value">{value || 'N/A'}</dd>
    </div>
);

const MarketLinkageDetail: React.FC<MarketLinkageDetailProps> = ({ partner, linkageKey, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const { canEdit, canDelete } = useUserAccess('Marketing Database');
    const linkages = partner.marketingLinkages || [];
    const linkageIndex = useMemo(() => findLinkageIndex(linkages, linkageKey), [linkages, linkageKey]);
    const linkage = linkageIndex >= 0 ? linkages[linkageIndex] : null;
    const [draft, setDraft] = useState<MarketLinkage | null>(linkage ? { commodityNeedId: null, commodityName: '', commodityType: '', ...linkage } : null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const commodityNeeds = partner.commodityNeeds || [];
    const selectedUnit = getMarketLinkageUnit(draft || linkage);

    useEffect(() => {
        setDraft(linkage ? { commodityNeedId: null, commodityName: '', commodityType: '', ...linkage } : null);
        setIsEditing(false);
        setIsDeleteModalOpen(false);
    }, [linkage]);

    const iposInLinkageRegion = useMemo(() => {
        if (!draft?.region) return [];
        return ipos.filter(i => i.region === draft.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [draft?.region, ipos]);

    const sales = calculateMarketLinkageSales(draft || linkage || ({} as MarketLinkage));

    const savePartner = async (updatedPartner: MarketingPartner) => {
        if (supabase) {
            const { id, ...payload } = updatedPartner;
            const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
            if (error) throw error;
        }
        onUpdatePartner(updatedPartner);
    };

    const handleCommoditySoldChange = (commodityNeedId: string) => {
        if (!draft) return;
        const selectedNeed = commodityNeeds.find(need => String(need.id) === commodityNeedId);
        setDraft({
            ...draft,
            commodityNeedId: selectedNeed?.id ?? null,
            commodityName: selectedNeed?.name || '',
            commodityType: selectedNeed?.type || '',
        });
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft || linkageIndex < 0) return;
        if (!draft.region || !draft.ipoName) {
            alert('Region and IPO are required.');
            return;
        }
        if (!draft.commodityNeedId || !draft.commodityName) {
            alert('Commodity Sold is required before saving this linkage.');
            return;
        }

        const normalizedDraft: MarketLinkage = {
            ...draft,
            id: draft.id || Date.now(),
            unitOfMeasure: selectedUnit,
        };
        const updatedLinkages = linkages.map((link, idx) => idx === linkageIndex ? normalizedDraft : link);
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages: updatedLinkages,
            linkedIpoNames: getLinkedIpoNames(updatedLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Updated: ${normalizedDraft.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        try {
            await savePartner(updatedPartner);
            setIsEditing(false);
        } catch (err: any) {
            alert(`Failed to update database: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete || linkageIndex < 0 || !linkage) return;
        const updatedLinkages = linkages.filter((_, idx) => idx !== linkageIndex);
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages: updatedLinkages,
            linkedIpoNames: getLinkedIpoNames(updatedLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Deleted: ${linkage.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        try {
            await savePartner(updatedPartner);
            setIsDeleteModalOpen(false);
            onBack();
        } catch (err: any) {
            alert(`Failed to delete linkage: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!linkage || !draft) {
        return (
            <div className="detail-page animate-fadeIn">
                <button onClick={onBack} className="btn btn-secondary">Back to Profile</button>
                <div className="detail-card detail-empty">
                    <h1 className="detail-title">Market linkage not found</h1>
                    <p>The selected linkage may have been removed or refreshed.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="detail-page animate-fadeIn">
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">Market Linkage Details</h1>
                    <p className="detail-meta">{partner.companyName} | {partner.uid}</p>
                </div>
                <div className="detail-actions">
                    <button onClick={onBack} className="btn btn-secondary">Back to Profile</button>
                    {!isEditing && canEdit && (
                        <button onClick={() => setIsEditing(true)} className="btn btn-primary">Edit Linkage</button>
                    )}
                    {!isEditing && canDelete && (
                        <button onClick={() => setIsDeleteModalOpen(true)} className="btn btn-danger">Delete</button>
                    )}
                </div>
            </header>

            <section className="detail-card">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="detail-label">Linked IPO</p>
                        <h2 className="detail-title">{linkage.ipoName}</h2>
                        <p className="detail-meta">{linkage.region}</p>
                    </div>
                    <div className="text-left md:text-right">
                        <p className="detail-label">Commodity Sold</p>
                        <p className={`detail-metric-value ${linkage.commodityName ? '' : 'is-missing'}`}>
                            {getCommodityLabel(linkage.commodityName, linkage.commodityType)}
                        </p>
                    </div>
                </div>

                {!isEditing ? (
                    <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <DetailBlock label="Negotiation Status" value={<span className={`status-badge status-badge--compact ${linkage.negotiationStatus === 'Contract Signed' ? 'status-badge--approved' : 'status-badge--pending'}`}>{linkage.negotiationStatus}</span>} />
                        <DetailBlock label="Agreement Type" value={linkage.agreementType} />
                        <DetailBlock label="Agreement Date" value={linkage.agreementDate ? new Date(linkage.agreementDate).toLocaleDateString() : 'N/A'} />
                        <DetailBlock label="Agreed Quantity" value={`${formatNumber(sales.quantity)} ${sales.unitOfMeasure} (${linkage.agreedQuantityTimeframe})`} />
                        <DetailBlock label="Agreed Price" value={`${formatCurrency(sales.pricePerUnit)} / ${sales.unitOfMeasure}`} />
                        <DetailBlock label="Sales Value" value={formatCurrency(sales.salesValue)} />
                        <DetailBlock label="Test Buy" value={linkage.testBuyConducted ? 'Conducted' : 'Not recorded'} />
                        <DetailBlock label="Test Buy Date" value={linkage.testBuyDate ? new Date(linkage.testBuyDate).toLocaleDateString() : 'N/A'} />
                        <DetailBlock label="Test Buy Quantity" value={`${formatNumber(linkage.testBuyQuantity || 0)} ${sales.unitOfMeasure}`} />
                        <div className="md:col-span-3">
                            <DetailBlock label="Test Buy Feedback" value={<span className="detail-note">{linkage.testBuyFeedback || 'No feedback provided.'}</span>} />
                        </div>
                    </dl>
                ) : (
                    <form onSubmit={handleSave} className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="form-label form-label--compact">Region</label>
                                <select value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value, ipoName: '' })} className={commonInputClasses}>
                                    <option value="">Select Region</option>
                                    {philippineRegions.map(region => <option key={region} value={region}>{region}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label form-label--compact">IPO</label>
                                <select value={draft.ipoName} onChange={e => setDraft({ ...draft, ipoName: e.target.value })} disabled={!draft.region} className={commonInputClasses}>
                                    <option value="">Select IPO</option>
                                    {iposInLinkageRegion.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label form-label--compact">Negotiation Status</label>
                                <select value={draft.negotiationStatus} onChange={e => setDraft({ ...draft, negotiationStatus: e.target.value as MarketLinkage['negotiationStatus'] })} className={commonInputClasses}>
                                    {NEGOTIATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="form-label form-label--compact">Agreement Type</label>
                                <select value={draft.agreementType} onChange={e => setDraft({ ...draft, agreementType: e.target.value as MarketLinkage['agreementType'] })} className={commonInputClasses}>
                                    {AGREEMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="form-label form-label--compact">Commodity Sold</label>
                                <select value={draft.commodityNeedId ? String(draft.commodityNeedId) : ''} onChange={e => handleCommoditySoldChange(e.target.value)} disabled={commodityNeeds.length === 0} className={commonInputClasses}>
                                    <option value="">{commodityNeeds.length === 0 ? 'No company commodity needs encoded' : 'Select commodity'}</option>
                                    {commodityNeeds.map(need => <option key={need.id} value={String(need.id)}>{getCommodityLabel(need.name, need.type)}</option>)}
                                </select>
                                {!draft.commodityName && (
                                    <p className="form-help form-help--warning">This linkage is unassigned. Select a commodity before saving changes.</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="form-label form-label--compact">Unit of Measure</label>
                                    <select value={selectedUnit} onChange={e => setDraft({ ...draft, unitOfMeasure: e.target.value as MarketLinkage['unitOfMeasure'] })} className={commonInputClasses}>
                                        {marketLinkageUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label form-label--compact">Agreed Qty ({selectedUnit})</label>
                                    <input type="number" value={draft.agreedQuantityValue || ''} onChange={e => setDraft({ ...draft, agreedQuantityValue: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="form-label form-label--compact">Timeframe</label>
                                    <select value={draft.agreedQuantityTimeframe} onChange={e => setDraft({ ...draft, agreedQuantityTimeframe: e.target.value as MarketLinkage['agreedQuantityTimeframe'] })} className={commonInputClasses}>
                                        {TIMEFRAMES.map(timeframe => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="form-label form-label--compact">Agreed Price (PHP/{selectedUnit})</label>
                                    <input type="number" value={draft.agreedPricePerKg || ''} onChange={e => setDraft({ ...draft, agreedPricePerKg: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="form-label form-label--compact">Agreement Date</label>
                                    <input type="date" value={draft.agreementDate} onChange={e => setDraft({ ...draft, agreementDate: e.target.value })} className={commonInputClasses} />
                                </div>
                            </div>
                        </div>

                        <div className="form-divider">
                            <label className="form-check">
                                <input type="checkbox" checked={draft.testBuyConducted} onChange={e => setDraft({ ...draft, testBuyConducted: e.target.checked })} className="form-checkbox" />
                                <span>Test Buy Information</span>
                            </label>
                            {draft.testBuyConducted && (
                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="form-label form-label--compact">Test Buy Date</label>
                                        <input type="date" value={draft.testBuyDate || ''} onChange={e => setDraft({ ...draft, testBuyDate: e.target.value })} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="form-label form-label--compact">Test Buy Qty ({selectedUnit})</label>
                                        <input type="number" value={draft.testBuyQuantity || ''} onChange={e => setDraft({ ...draft, testBuyQuantity: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="form-label form-label--compact">Test Buy Feedback</label>
                                        <textarea value={draft.testBuyFeedback || ''} onChange={e => setDraft({ ...draft, testBuyFeedback: e.target.value })} rows={3} className={commonInputClasses} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="form-footer">
                            <button type="button" onClick={() => { setDraft({ commodityNeedId: null, commodityName: '', commodityType: '', ...linkage }); setIsEditing(false); }} className="btn btn-secondary">Cancel</button>
                            <button type="submit" disabled={isSaving} className="btn btn-primary">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                )}
            </section>

            {isDeleteModalOpen && (
                <ConfirmDialog
                    title="Delete Market Linkage"
                    description={`Delete the linkage with ${linkage.ipoName}? This removes only this nested linkage record.`}
                    confirmLabel={isSaving ? 'Deleting…' : 'Delete Linkage'}
                    tone="danger"
                    onConfirm={handleDelete}
                    onCancel={() => setIsDeleteModalOpen(false)}
                />
            )}
        </div>
    );
};

export default MarketLinkageDetail;
