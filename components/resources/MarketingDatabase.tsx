
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Check, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { MarketingPartner, philippineRegions, CommodityNeed, referenceCommodityTypes } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination, useSelection, useUserAccess } from '../mainfunctions/TableHooks';
import LocationPicker, { parseLocation } from '../LocationPicker';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { supabase } from '../../supabaseClient';
import { summarizeMarketPartnerSales } from '../../lib/marketSalesAggregation';
import { ConfirmDialog, DataTablePagination } from '../ui/enterprise';

declare const XLSX: any;

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// PSGC Region Codes Mapping for Province Fetching
const REGION_CODE_MAP: Record<string, string> = {
    'National Capital Region (NCR)': '130000000',
    'Cordillera Administrative Region (CAR)': '140000000',
    'Region I (Ilocos Region)': '010000000',
    'Region II (Cagayan Valley)': '020000000',
    'Region III (Central Luzon)': '030000000',
    'Region IV-A (CALABARZON)': '040000000',
    'MIMAROPA Region': '170000000',
    'Region V (Bicol Region)': '050000000',
    'Region VI (Western Visayas)': '060000000',
    'Region VII (Central Visayas)': '070000000',
    'Region VIII (Eastern Visayas)': '080000000',
    'Region IX (Zamboanga Peninsula)': '090000000',
    'Region X (Northern Mindanao)': '100000000',
    'Region XI (Davao Region)': '110000000',
    'Region XII (SOCCSKSARGEN)': '120000000',
    'Region XIII (Caraga)': '160000000',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)': '150000000',
    'Negros Island Region (NIR)': '180000000'
};

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const commonInputClasses = "form-control";

interface MarketingDatabaseProps {
    partners: MarketingPartner[];
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
    onSelectPartner: (partner: MarketingPartner) => void;
    commodityCategories: { [key: string]: string[] };
}

const MarketingDatabase: React.FC<MarketingDatabaseProps> = ({ partners, setPartners, onSelectPartner, commodityCategories }) => {
    const { currentUser } = useAuth();
    const { canEdit, canDelete } = useUserAccess('Marketing Database');
    
    const [view, setView] = useState<'list' | 'add'>('list');
    const [searchTerm, setSearchTerm] = useLocalStorageState('market_search', '');
    const [regionFilter, setRegionFilter] = useLocalStorageState('market_region', 'All');
    const [isUploading, setIsUploading] = useState(false);
    const [deletePartner, setDeletePartner] = useState<MarketingPartner | null>(null);

    // Multi-Delete State using Shared Hook (adapted for MarketingPartner)
    const { 
        isSelectionMode, selectedIds, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<MarketingPartner>();
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Omit<MarketingPartner, 'id'>>({
        uid: '',
        companyName: '',
        ownerName: '',
        contactNumber: '',
        email: '',
        location: '',
        region: '',
        buyerType: 'Private Company',
        paymentMethods: [],
        commodityNeeds: [],
        linkedIpoNames: [],
        remarks: '',
        encodedBy: currentUser?.fullName || '',
        history: [],
        marketingLinkages: []
    });

    // Inline Commodity Entry State
    const [editingCommodityIdx, setEditingCommodityIdx] = useState<number | null>(null);
    const [tempCommodity, setTempCommodity] = useState<CommodityNeed>({
        id: '',
        name: '',
        type: '',
        sourceRegion: '',
        sourceProvince: '',
        qualityStandard: '',
        volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
        volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
    });

    // Commodity Selection Cascading State
    const [provinceOptions, setProvinceOptions] = useState<string[]>([]);

    const filteredPartners = useMemo(() => {
        let list = [...partners];
        if (regionFilter !== 'All') {
            list = list.filter(p => p.region === regionFilter);
        }
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            list = list.filter(p => 
                p.companyName.toLowerCase().includes(low) ||
                p.ownerName.toLowerCase().includes(low) ||
                p.commodityNeeds.some(c => c.name.toLowerCase().includes(low))
            );
        }
        return list.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }, [partners, regionFilter, searchTerm]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredPartners, [regionFilter, searchTerm]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLocationChange = (val: string) => {
        const { region } = parseLocation(val);
        setFormData(prev => ({ ...prev, location: val, region }));
    };

    const handlePaymentToggle = (method: string) => {
        setFormData(prev => {
            const existing = prev.paymentMethods || [];
            if (existing.includes(method)) {
                return { ...prev, paymentMethods: existing.filter(m => m !== method) };
            }
            return { ...prev, paymentMethods: [...existing, method] };
        });
    };

    const handleTempCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setTempCommodity(prev => {
            const updated = { ...prev, [name]: value };
            
            // Cascaded Commodity Logic
            if (name === 'type') {
                updated.name = '';
            }
            if (name === 'sourceRegion') {
                updated.sourceProvince = '';
            }
            
            return updated;
        });
    };

    // Region -> Province dropdown logic
    useEffect(() => {
        const regionCode = REGION_CODE_MAP[tempCommodity.sourceRegion];
        if (regionCode) {
            const fetchProvinces = async () => {
                try {
                    const res = await fetch(`https://psgc.gitlab.io/api/regions/${regionCode}/provinces/`);
                    const data = await res.json();
                    setProvinceOptions(data.map((p:any) => p.name).sort());
                } catch {
                    setProvinceOptions([]);
                }
            };
            fetchProvinces();
        } else {
            setProvinceOptions([]);
        }
    }, [tempCommodity.sourceRegion]);

    const saveTempCommodity = () => {
        if (!tempCommodity.name || !tempCommodity.type) return alert("Type and Commodity Name are required.");
        
        setFormData(prev => {
            const newList = [...prev.commodityNeeds];
            const itemToSave = { ...tempCommodity };
            
            if (editingCommodityIdx !== null) {
                newList[editingCommodityIdx] = itemToSave;
            } else {
                newList.push({ ...itemToSave, id: Date.now() });
            }
            return { ...prev, commodityNeeds: newList };
        });
        
        resetTempCommodity();
    };

    const resetTempCommodity = () => {
        setTempCommodity({
            id: '', name: '', type: '', sourceRegion: '', sourceProvince: '', qualityStandard: '',
            volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
            volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
        });
        setEditingCommodityIdx(null);
    };

    const handleEditCommodity = (idx: number) => {
        const c = formData.commodityNeeds[idx];
        setTempCommodity({ ...c });
        setEditingCommodityIdx(idx);
    };

    const handleMultiDelete = async () => {
        if (!canDelete || selectedIds.length === 0) return;
        if (supabase) {
            const { error } = await supabase.from('marketing_partners').delete().in('id', selectedIds);
            if (error) return alert(error.message);
        }
        setPartners(prev => prev.filter(p => !selectedIds.includes(p.id)));
        resetSelection();
        setIsMultiDeleteModalOpen(false);
    };

    const handleDeletePartner = async () => {
        if (!canDelete || !deletePartner) return;
        if (supabase) {
            const { error } = await supabase.from('marketing_partners').delete().eq('id', deletePartner.id);
            if (error) return alert(error.message);
        }
        setPartners(prev => prev.filter(p => p.id !== deletePartner.id));
        setDeletePartner(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const year = new Date().getFullYear();
        const uid = `MP-${year}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        
        const historyEntry = {
            date: new Date().toISOString(),
            event: 'Profile Created',
            user: currentUser?.fullName || 'System'
        };

        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        const newPartnerPayload = {
            ...formData,
            uid,
            workflow_status,
            history: [historyEntry],
            created_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                const { data, error } = await supabase.from('marketing_partners').insert([newPartnerPayload]).select().single();
                if (error) throw error;
                if (data) setPartners(prev => [data, ...prev]);
            } catch (err: any) {
                alert("Failed to save: " + err.message);
                return;
            }
        } else {
            setPartners(prev => [{ ...newPartnerPayload, id: Date.now() } as MarketingPartner, ...prev]);
        }
        
        setView('list');
        setFormData({
            uid: '', companyName: '', ownerName: '', contactNumber: '', email: '', 
            location: '', region: '', buyerType: 'Private Company', paymentMethods: [],
            commodityNeeds: [], linkedIpoNames: [], remarks: '', encodedBy: currentUser?.fullName || '', history: [], marketingLinkages: []
        });
    };

    const handleDownloadTemplate = () => {
        const headers = ['companyName', 'ownerName', 'contactNumber', 'email', 'location', 'buyerType', 'paymentMethods', 'commodityNeeds', 'remarks'];
        const exampleData = [{
            companyName: 'Sample Trade Corp', ownerName: 'Juan Dela Cruz', contactNumber: '09171234567', email: 'juan@sample.com',
            location: 'Tanay, Rizal', buyerType: 'Private Company', paymentMethods: 'Cash; Bank Transfer',
            commodityNeeds: '[]', remarks: 'Prefers bulk purchases'
        }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Marketing_Partner_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                const newPartners = jsonData.map((row: any, index: number) => {
                    const uid = `MP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${index}`;
                    const { region } = parseLocation(row.location || '');
                    const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
                    return {
                        uid,
                        companyName: String(row.companyName || 'Unnamed Partner'),
                        ownerName: String(row.ownerName || ''),
                        contactNumber: String(row.contactNumber || ''),
                        email: String(row.email || ''),
                        region,
                        location: String(row.location || ''),
                        buyerType: row.buyerType || 'Private Company',
                        paymentMethods: row.paymentMethods ? row.paymentMethods.split(';').map((p:string) => p.trim()) : [],
                        commodityNeeds: row.commodityNeeds ? JSON.parse(row.commodityNeeds) : [],
                        linkedIpoNames: [],
                        marketingLinkages: [],
                        workflow_status,
                        history: [{ date: new Date().toISOString(), event: 'Imported from Excel', user: currentUser?.fullName || 'System' }],
                        encodedBy: currentUser?.fullName || 'Excel Import',
                        created_at: new Date().toISOString()
                    };
                });
                if (supabase) {
                    const { data, error } = await supabase.from('marketing_partners').insert(newPartners).select();
                    if (error) throw error;
                    if (data) setPartners(prev => [...(data as MarketingPartner[]), ...prev]);
                } else {
                    setPartners(prev => [...newPartners.map((p, i) => ({ ...p, id: Date.now() + i } as MarketingPartner)), ...prev]);
                }
                alert(`Imported ${newPartners.length} partners.`);
            } catch (err: any) { alert("Import failed: " + err.message); } finally { setIsUploading(false); if (e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    const getWorkflowStatusBadge = (status?: string) => {
        let classes = 'status-badge status-badge--compact status-badge--neutral';
        switch (status) {
            case 'APPROVED': classes = 'status-badge status-badge--compact status-badge--approved'; break;
            case 'PENDING': classes = 'status-badge status-badge--compact status-badge--pending'; break;
            case 'REJECTED': classes = 'status-badge status-badge--compact status-badge--rejected'; break;
            case 'DRAFT': classes = 'status-badge status-badge--compact status-badge--draft'; break;
        }
        return <span className={classes}>{status || 'DRAFT'}</span>;
    };

    const canApprove = (role?: string) => {
        return ['Super Admin', 'Administrator', 'Focal - User', 'Management'].includes(role || '');
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const handleApprove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to approve this partner?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('marketing_partners').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setPartners(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setPartners(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('marketing_partners').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setPartners(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setPartners(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    if (view === 'add') {
        return (
            <div className="form-page">
                <div className="data-list-header">
                    <h2 className="data-list-title">Add New Marketing Partner</h2>
                    <button type="button" onClick={() => setView('list')} className="btn btn-secondary">Back to list</button>
                </div>
                <form onSubmit={handleSubmit} className="form-stack form-stack--spacious">
                    <div className="form-grid form-grid--two">
                        <section className="form-section form-stack">
                            <h3 className="form-section__title">Company Profile</h3>
                            <div><label className="form-label">Company Name</label><input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} required className={commonInputClasses} /></div>
                            <div className="form-grid form-grid--two form-grid--compact">
                                <div><label className="form-label">Buyer Type</label><select name="buyerType" value={formData.buyerType} onChange={handleInputChange} className={commonInputClasses}>{BUYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="form-label">Owner / Contact</label><input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                            <div className="form-grid form-grid--two form-grid--compact">
                                <div><label className="form-label">Contact Number</label><input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="form-label">Email Address</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                            <div>
                                <label className="form-label">Company Location</label>
                                <LocationPicker value={formData.location} onChange={handleLocationChange} />
                            </div>
                        </section>

                        <section className="form-section form-stack">
                            <h3 className="form-section__title">Preferences</h3>
                            <div>
                                <label className="form-label">Preferred Payment Methods</label>
                                <div className="form-choice-group">
                                    {PAYMENT_METHODS.map(m => (
                                        <button key={m} type="button" onClick={() => handlePaymentToggle(m)} className={`form-choice-button ${formData.paymentMethods.includes(m) ? 'is-selected' : ''}`} aria-pressed={formData.paymentMethods.includes(m)}>{m}</button>
                                    ))}
                                </div>
                            </div>
                            <div><label className="form-label">Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} /></div>
                        </section>
                    </div>

                    <section className="form-section form-stack">
                        <h3 className="form-section__title">Commodity Requirements</h3>
                        <div className="form-subsection">
                            <div className="form-grid form-grid--four form-grid--compact">
                                <div><label className="form-label">Type</label><select name="type" value={tempCommodity.type} onChange={handleTempCommodityChange} className={commonInputClasses}><option value="">Select Type</option>{referenceCommodityTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="form-label">Commodity Name</label><select name="name" value={tempCommodity.name} onChange={handleTempCommodityChange} disabled={!tempCommodity.type} className={commonInputClasses}><option value="">Select Commodity</option>{tempCommodity.type && commodityCategories[tempCommodity.type]?.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div><label className="form-label">Source Region</label>
                                    <select name="sourceRegion" value={tempCommodity.sourceRegion} onChange={handleTempCommodityChange} className={commonInputClasses}>
                                        <option value="">Select Region</option>
                                        {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div><label className="form-label">Source Province</label><select name="sourceProvince" value={tempCommodity.sourceProvince} onChange={handleTempCommodityChange} className={commonInputClasses} disabled={provinceOptions.length === 0}><option value="">Select Province</option>{provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            </div>
                            <div className="form-grid form-grid--two form-grid--compact">
                                <div><label className="form-label">Quality Standard</label><input type="text" name="qualityStandard" value={tempCommodity.qualityStandard} onChange={handleTempCommodityChange} className={commonInputClasses} placeholder="Grade A, Organic, etc." /></div>
                                <div>
                                    <label className="form-label">Monthly Volume (Kg/Month)</label>
                                    <div className="form-month-grid">
                                        {MONTHS.map(m => (
                                            <div key={m} className="form-month-field"><label>{m}</label><input type="number"
                                            // @ts-ignore
                                            value={tempCommodity[`volume${m}`] || ''} onChange={e => setTempCommodity({...tempCommodity, [`volume${m}`]: parseFloat(e.target.value) || 0})} className="form-control form-control--compact" /></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="form-action-row">
                                {editingCommodityIdx !== null && <button type="button" onClick={resetTempCommodity} className="btn btn-secondary btn-compact">Cancel Edit</button>}
                                <button type="button" onClick={saveTempCommodity} className="btn btn-primary">{editingCommodityIdx !== null ? 'Update Item' : 'Add Requirement'}</button>
                            </div>
                        </div>

                        <div className="form-repeat-list">
                            {formData.commodityNeeds.map((c, i) => (
                                <div key={i} className="form-repeat-card">
                                    <div>
                                        <p className="form-repeat-card__title">{c.name} <span className="data-table__subline">({c.type})</span></p>
                                        <p className="form-repeat-card__meta">{c.sourceProvince || 'Any Province'}, {c.sourceRegion}</p>
                                    </div>
                                    <div className="form-repeat-card__actions">
                                        <button type="button" onClick={() => handleEditCommodity(i)} className="table-action">Edit</button>
                                        <button type="button" onClick={() => setFormData(prev => ({...prev, commodityNeeds: prev.commodityNeeds.filter((_, idx) => idx !== i)}))} className="table-action table-action--danger">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="form-footer">
                        <button type="submit" className="btn btn-primary">Save Partner Profile</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="data-list-page">
            {isMultiDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm bulk deletion"
                    description={`Delete ${selectedIds.length} selected partner${selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.`}
                    confirmLabel="Delete selected"
                    onCancel={() => setIsMultiDeleteModalOpen(false)}
                    onConfirm={handleMultiDelete}
                />
            )}

            {deletePartner && canDelete && (
                <ConfirmDialog
                    title="Delete market partner"
                    description={`Delete ${deletePartner.companyName}? This removes the profile, commodity needs, and market-linkage records stored under this partner.`}
                    confirmLabel="Delete partner"
                    onCancel={() => setDeletePartner(null)}
                    onConfirm={handleDeletePartner}
                />
            )}

            <div className="data-list-header">
                <h2 className="data-list-title">Marketing Database</h2>
                <div className="data-list-actions">
                    {canEdit && (
                        <button onClick={() => setView('add')} className="btn btn-primary btn-responsive" title="Add Market Partner">
                            <Plus className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Add Market Partner</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="data-table-card">
                <div className="data-table-toolbar">
                <div className="data-toolbar-row">
                    <div className="data-toolbar-group">
                        <div className="data-toolbar-search">
                            <input 
                                type="text" 
                                placeholder="Search by company, owner, or commodity..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`data-table-search ${commonInputClasses}`}
                            />
                        </div>
                        <div className="data-toolbar-filter">
                            <select 
                                value={regionFilter} 
                                onChange={(e) => setRegionFilter(e.target.value)} 
                                className={`data-table-select ${commonInputClasses}`}
                            >
                                <option value="All">All Regions</option>
                                {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>
                    
                    <div className="data-toolbar-group data-toolbar-group--actions">
                        {canDelete && isSelectionMode && selectedIds.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="btn btn-danger">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        {canEdit && (
                            <>
                                <button onClick={handleDownloadTemplate} className="btn btn-secondary btn-responsive" title="Download Template">
                                    <FileSpreadsheet className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">Template</span>
                                </button>
                                <label className={`btn btn-primary btn-responsive ${isUploading ? 'is-disabled' : ''}`} title={isUploading ? 'Uploading...' : 'Upload XLSX'}>
                                    <Upload className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">{isUploading ? 'Uploading...' : 'Upload XLSX'}</span>
                                    <input type="file" className="file-input-hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                                </label>
                            </>
                        )}
                        {canDelete && (
                            <button 
                                onClick={toggleSelectionMode} 
                                className={`btn btn-secondary btn-icon ${isSelectionMode ? 'is-active-danger' : ''}`}
                                title="Toggle Multi-Delete Mode"
                            >
                                <TrashIcon />
                            </button>
                        )}
                    </div>
                </div>
                </div>

                <div className="data-table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                {isSelectionMode && <th className="data-table__cell--selection"><input type="checkbox" onChange={(e) => handleSelectAll(e, paginatedData)} checked={paginatedData.length > 0 && paginatedData.every(p => selectedIds.includes(p.id))} className="form-checkbox" aria-label="Select all partners on this page" /></th>}
                                <th>Region</th>
                                <th>Company Name</th>
                                <th>Type</th>
                                <th>Commodity Needs</th>
                                <th>Owner / Contact</th>
                                <th>Total Sales from Market Linkage</th>
                                <th>Workflow Status</th>
                                {canDelete && <th className="data-table__head--actions">Action</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((partner) => {
                                const salesSummary = summarizeMarketPartnerSales(partner);
                                return (
                                <tr key={partner.id} className={selectedIds.includes(partner.id) ? 'data-table__row--selected' : undefined}>
                                    {isSelectionMode && <td className="data-table__cell--selection"><input type="checkbox" checked={selectedIds.includes(partner.id)} onChange={() => handleSelectRow(partner.id)} className="form-checkbox" aria-label={`Select ${partner.companyName}`} /></td>}
                                    <td className="data-table__cell--muted data-table__cell--nowrap">{partner.region || 'N/A'}</td>
                                    <td className="data-table__cell--nowrap"><button onClick={() => onSelectPartner(partner)} className="table-link">{partner.companyName}</button><div className="data-table__subline">{partner.uid}</div></td>
                                    <td className="data-table__cell--nowrap"><span className={`status-badge ${partner.buyerType === 'Government' ? 'status-badge--info' : 'status-badge--neutral'}`}>{partner.buyerType || 'Private'}</span></td>
                                    <td>
                                        <div className="data-table-tags">
                                            {partner.commodityNeeds?.slice(0, 3).map((c, i) => (
                                                <span key={i} className="data-table-tag">{c.name}</span>
                                            ))}
                                            {(partner.commodityNeeds?.length || 0) > 3 && <span className="data-table__subline">+{partner.commodityNeeds.length - 3} more</span>}
                                            {(!partner.commodityNeeds || partner.commodityNeeds.length === 0) && <span className="data-table__cell--soft">Unspecified</span>}
                                        </div>
                                    </td>
                                    <td className="data-table__cell--muted data-table__cell--nowrap"><div className="data-table__cell--primary">{partner.ownerName}</div><div>{partner.contactNumber}</div></td>
                                    <td className="data-table__cell--nowrap">
                                        <div className="data-table__cell--primary">{formatCurrency(salesSummary.totalSales)}</div>
                                        <div className="data-table__subline">{salesSummary.linkageCount} linkage{salesSummary.linkageCount === 1 ? '' : 's'}</div>
                                    </td>
                                    <td className="data-table__cell--nowrap">
                                        <div className="data-table-workflow">
                                            {getWorkflowStatusBadge(partner.workflow_status)}
                                            {partner.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                                <div className="data-table-workflow__actions">
                                                    <button 
                                                        onClick={(e) => handleApprove(partner.id, e)} 
                                                        className="action-mini action-mini--approve"
                                                        title="Approve"
                                                    >
                                                        <Check aria-hidden="true" />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => handleReject(partner.id, e)} 
                                                        className="action-mini action-mini--reject"
                                                        title="Reject"
                                                    >
                                                        <X aria-hidden="true" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {canDelete && (
                                        <td className="data-table__cell--actions data-table__cell--nowrap">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setDeletePartner(partner);
                                                }}
                                                className="table-action table-action--danger"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                <DataTablePagination
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={filteredPartners.length}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    aria-label="Marketing partners pagination"
                />
            </div>
        </div>
    );
};

export default MarketingDatabase;
