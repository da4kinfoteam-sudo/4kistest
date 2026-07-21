// Author: 4K
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { ArrowLeft, Info, Pencil, Trash2 } from 'lucide-react';
import { MonthYearPicker } from './ui/MonthYearPicker';
import { Subproject, IPO, SubprojectDetail, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, philippineRegions, operatingUnits, ouToRegionMap, RefCommodity, RefLivestock } from '../constants';
import LocationPicker from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { getMonetaryChanges } from '../lib/logUtils';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { supabase } from '../supabaseClient';
import { resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../lib/physicalAccomplishmentTimestamp';
import { isMonthTargetOverdue } from '../lib/dateStatus';
import { ConfirmDialog } from './ui/enterprise';

interface SubprojectEditProps {
    subproject?: Subproject;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    onBack: () => void;
    onUpdateSubproject: (updated: Subproject) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
    refCommodities: RefCommodity[];
    refLivestock: RefLivestock[];
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "form-control";

const budgetItemFieldLabels: Record<string, string> = {
    type: 'Type',
    particulars: 'Particulars',
    uacsCode: 'UACS Code',
    deliveryDate: 'Delivery Month',
    obligationMonth: 'Obligation Month',
    disbursementMonth: 'Disbursement Month',
    pricePerUnit: 'Price per Unit',
    numberOfUnits: 'Number of Units'
};

const defaultFormData: Subproject = {
    id: 0,
    uid: '',
    name: '',
    location: '',
    indigenousPeopleOrganization: '',
    status: 'Proposed',
    details: [],
    subprojectCommodities: [],
    packageType: 'Package 1',
    startDate: `${new Date().getFullYear()}-01-01`,
    estimatedCompletionDate: '',
    lat: 0,
    lng: 0,
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: ''
};

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const SubprojectEdit: React.FC<SubprojectEditProps> = ({ 
    subproject, ipos, setIpos, onBack, onUpdateSubproject, uacsCodes, particularTypes, commodityCategories, refCommodities, refLivestock
}): React.ReactNode => {
    const { currentUser, hasAccess } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    const { getStatusDecision, ensureDecisionAllowed } = useDcfPolicyGuard();
    
    const [formData, setFormData] = useState<Subproject>(subproject || defaultFormData);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget' | 'summary'>('details');
    const [selectedRegion, setSelectedRegion] = useState('');
    
    const [currentDetail, setCurrentDetail] = useState<Omit<SubprojectDetail, 'id'>>({
        type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: ''
    });
    const [editingDetailId, setEditingDetailId] = useState<number | null>(null);

    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '', name: '', area: 0, averageYield: 0
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [confirmBudgetItemDate, setConfirmBudgetItemDate] = useState<{field: 'deliveryDate' | 'obligationMonth', dateStr: string} | null>(null);
    const [budgetItemErrorFields, setBudgetItemErrorFields] = useState<string[]>([]);

    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        if (!formData.name?.trim()) errors.push('name');
        if (!formData.indigenousPeopleOrganization) errors.push('indigenousPeopleOrganization');
        if (!formData.status) errors.push('status');
        if (!formData.estimatedCompletionDate) errors.push('estimatedCompletionDate');
        if (!formData.details || formData.details.length === 0) errors.push('details');
        if (!formData.subprojectCommodities || formData.subprojectCommodities.length === 0) errors.push('commodities');
        return errors;
    }, [formData]);

    useEffect(() => {
        if (subproject) {
            setFormData(subproject);
            const linkedIpo = ipos.find(i => i.name === subproject.indigenousPeopleOrganization);
            if (linkedIpo) setSelectedRegion(linkedIpo.region);
        } else {
            const defaultOu = currentUser?.operatingUnit || '';
            const defaultRegion = ouToRegionMap[defaultOu] || '';
            setFormData({
                ...defaultFormData,
                operatingUnit: defaultOu,
                encodedBy: currentUser?.fullName || ''
            });
            setSelectedRegion(defaultRegion);
        }
    }, [subproject, ipos, currentUser]);

    const filteredIpos = useMemo(() => {
        if (!selectedRegion) return [];
        return ipos.filter(ipo => ipo.region === selectedRegion).sort((a, b) => a.name.localeCompare(b.name));
    }, [ipos, selectedRegion]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
        const { name, value } = e.target;
        setMissingFields(prev => prev.filter(f => f !== name));
        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'indigenousPeopleOrganization') {
                const selectedIpo = ipos.find(ipo => ipo.name === value);
                if (selectedIpo) {
                    newData.location = selectedIpo.location;
                    newData.ipo_id = selectedIpo.id;
                } else {
                    newData.location = '';
                    newData.ipo_id = undefined;
                }
            } else if (name === 'operatingUnit') {
                const mappedRegion = ouToRegionMap[value] || '';
                setSelectedRegion(mappedRegion);
                newData.indigenousPeopleOrganization = '';
            } else if (name === 'fundingYear') {
                const year = parseInt(value) || new Date().getFullYear();
                newData.startDate = `${year}-01-01`;
                if (newData.estimatedCompletionDate) {
                    const month = getMonthFromDateStr(newData.estimatedCompletionDate);
                    if (month !== '') {
                        newData.estimatedCompletionDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                    }
                }
                
                // Sync details if fundingYear changes
                if (newData.details) {
                    newData.details = newData.details.map(d => {
                        const updateDate = (dateStr?: string) => {
                            if (!dateStr) return dateStr;
                            const parts = dateStr.split('-');
                            if (parts.length > 1) return `${year}-${parts[1]}-${parts[2] || '01'}`;
                            return dateStr;
                        };
                        return {
                            ...d,
                            obligationMonth: updateDate(d.obligationMonth) || '',
                            disbursementMonth: updateDate(d.disbursementMonth) || '',
                            actualObligationDate: updateDate(d.actualObligationDate),
                            actualDisbursementDate: updateDate(d.actualDisbursementDate)
                        };
                    });
                }
            }
            return newData;
        });
    };

    const getMonthFromDateStr = (dateStr: string): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    const getYearFromDateStr = (dateStr: string): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 0) return parts[0];
        return '';
    };

    const updateDetailDateFromMonth = (field: string, monthIndex: string): void => {
        if (monthIndex === '') {
            setCurrentDetail(prev => ({ ...prev, [field]: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const year = formData.fundingYear || new Date().getFullYear();
        const dateStr = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
        
        if ((field === 'deliveryDate' || field === 'obligationMonth') && formData.estimatedCompletionDate) {
            const estCompDate = new Date(formData.estimatedCompletionDate);
            const selectedDate = new Date(dateStr);
            if (selectedDate.getFullYear() > estCompDate.getFullYear() || 
                (selectedDate.getFullYear() === estCompDate.getFullYear() && selectedDate.getMonth() > estCompDate.getMonth())) {
                setConfirmBudgetItemDate({ field, dateStr });
                return;
            }
        }
        
        setCurrentDetail(prev => ({ ...prev, [field]: dateStr }));
    }

    const handleConfirmBudgetItemDate = (): void => {
        if (confirmBudgetItemDate) {
            setFormData(prev => ({ ...prev, estimatedCompletionDate: confirmBudgetItemDate.dateStr }));
            setCurrentDetail(prev => ({ ...prev, [confirmBudgetItemDate.field]: confirmBudgetItemDate.dateStr }));
            setConfirmBudgetItemDate(null);
        }
    };

    const handleCancelBudgetItemDate = (): void => {
        setConfirmBudgetItemDate(null);
    };

    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (currentDetail.expenseParticular) {
            const ot = currentDetail.objectType;
            const ep = currentDetail.expenseParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
            Object.entries(uacsCodes).forEach(([ot, eps]) => {
                Object.entries(eps).forEach(([ep, codesObj]) => {
                    Object.entries(codesObj as Record<string, string>).forEach(([code, desc]) => {
                        codes.push({ code, desc });
                    });
                });
            });
        }
        return codes;
    }, [currentDetail.expenseParticular, currentDetail.objectType, uacsCodes]);

    const groupedCommodities = useMemo(() => {
        const groups: { [key: string]: RefCommodity[] } = {};
        refCommodities.forEach(c => {
            const group = c.commodity_group || 'Others';
            if (!groups[group]) groups[group] = [];
            groups[group].push(c);
        });
        const sortedGroupNames = Object.keys(groups).sort();
        sortedGroupNames.forEach(name => {
            groups[name].sort((a, b) => a.name.localeCompare(b.name));
        });
        return { names: sortedGroupNames, groups };
    }, [refCommodities]);

    const groupedLivestock = useMemo(() => {
        const groups: { [key: string]: RefLivestock[] } = {};
        refLivestock.forEach(c => {
            const group = c.category || 'Others';
            if (!groups[group]) groups[group] = [];
            groups[group].push(c);
        });
        const sortedGroupNames = Object.keys(groups).sort();
        sortedGroupNames.forEach(name => {
            groups[name].sort((a, b) => a.name.localeCompare(b.name));
        });
        return { names: sortedGroupNames, groups };
    }, [refLivestock]);

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
        const { name, value } = e.target;
        if (name === 'type') setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        else if (name === 'objectType') setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        else if (name === 'expenseParticular') setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        else if (name === 'uacsCode') {
            let foundOt = currentDetail.objectType;
            let foundEp = currentDetail.expenseParticular;
            
            let isMatch = false;
            if (foundEp && uacsCodes[foundOt] && uacsCodes[foundOt][foundEp] && uacsCodes[foundOt][foundEp][value]) {
                isMatch = true;
            }

            if (!isMatch) {
                for (const ot in uacsCodes) {
                    for (const ep in uacsCodes[ot]) {
                        if (uacsCodes[ot][ep][value]) {
                            foundOt = ot as ObjectType;
                            foundEp = ep;
                            break;
                        }
                    }
                }
            }
            
            setCurrentDetail(prev => ({ ...prev, uacsCode: value, objectType: foundOt, expenseParticular: foundEp }));
        }
        else setCurrentDetail(prev => ({ ...prev, [name]: value }));
    };

    const handleAddDetail = (): void => {
        const requiredDetailFields = ['particulars', 'uacsCode', 'deliveryDate', 'obligationMonth', 'disbursementMonth', 'pricePerUnit', 'numberOfUnits'];
        const missingDetailFields = requiredDetailFields.filter(field => !currentDetail[field as keyof typeof currentDetail]);
        if (missingDetailFields.length > 0) {
            setBudgetItemErrorFields(missingDetailFields);
            return;
        }

        let updatedDetails: SubprojectDetail[] = [];
        const newItem = { 
            ...currentDetail, 
            pricePerUnit: Number(currentDetail.pricePerUnit), 
            numberOfUnits: Number(currentDetail.numberOfUnits) 
        };

        if (editingDetailId !== null) {
            updatedDetails = formData.details.map(d => d.id === editingDetailId ? { ...d, ...newItem } : d);
            setEditingDetailId(null);
        } else {
            updatedDetails = [...formData.details, { id: Date.now(), ...newItem } as SubprojectDetail];
        }

        let newEstimatedCompletionDate = formData.estimatedCompletionDate;
        const deliveryDates = updatedDetails.map(d => d.deliveryDate).filter(d => d).map(d => new Date(d).getTime());
        if (deliveryDates.length > 0) {
            const maxDate = new Date(Math.max(...deliveryDates)).toISOString().split('T')[0];
            if (!newEstimatedCompletionDate || new Date(maxDate) > new Date(newEstimatedCompletionDate)) {
                newEstimatedCompletionDate = maxDate;
            }
        }

        setFormData(prev => ({ ...prev, details: updatedDetails, estimatedCompletionDate: newEstimatedCompletionDate }));
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleEditDetail = (id: number): void => {
        const d = formData.details.find(d => d.id === id);
        if (d) {
            setCurrentDetail(d);
            setEditingDetailId(id);
        }
    };

    const handleRemoveDetail = (id: number): void => {
        setFormData(prev => ({ ...prev, details: prev.details.filter(d => d.id !== id) }));
        if (editingDetailId === id) {
            setEditingDetailId(null);
            setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
        }
    };

    const handleCancelEditDetail = (): void => {
        setEditingDetailId(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
        const { name, value } = e.target;
        if (name === 'typeName') {
            setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '', area: 0, averageYield: 0 }));
        } else if (name === 'name') {
            const selectedName = value;
            let yieldVal = 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === selectedName);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * (currentCommodity.area || 0);
                }
            }
            setCurrentCommodity(prev => ({ ...prev, name: selectedName, averageYield: yieldVal }));
        } else if (name === 'area') {
            const areaVal = Number(value);
            let yieldVal = currentCommodity.averageYield || 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === currentCommodity.name);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * areaVal;
                }
            }
            setCurrentCommodity(prev => ({ ...prev, area: areaVal, averageYield: yieldVal }));
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = (): void => {
        const isAnimal = currentCommodity.typeName === 'Livestock';
        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area) {
            alert("Please fill in required commodity fields."); return;
        }
        const newCom: SubprojectCommodity = { ...currentCommodity, area: Number(currentCommodity.area), averageYield: isAnimal ? undefined : Number(currentCommodity.averageYield) };
        
        let updatedCommodities = [...(formData.subprojectCommodities || [])];
        if (editingCommodityIndex !== null) {
            updatedCommodities[editingCommodityIndex] = newCom;
            setEditingCommodityIndex(null);
        } else {
            updatedCommodities.push(newCom);
        }
        setFormData(prev => ({ ...prev, subprojectCommodities: updatedCommodities }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (idx: number): void => {
        if (formData.subprojectCommodities) {
            setCurrentCommodity(formData.subprojectCommodities[idx]);
            setEditingCommodityIndex(idx);
        }
    };

    const handleRemoveCommodity = (idx: number): void => {
        setFormData(prev => ({ ...prev, subprojectCommodities: prev.subprojectCommodities?.filter((_, i) => i !== idx) }));
        if (editingCommodityIndex === idx) {
             setEditingCommodityIndex(null);
             setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
        }
    };

    const handleNextSection = (): void => {
        if (activeTab === 'details') {
            const required = ['name', 'indigenousPeopleOrganization', 'status'];
            const missing = required.filter(field => !formData[field as keyof Subproject]);
            if (missing.length > 0) {
                setMissingFields(missing);
                alert("Please fill in all required fields in the Subproject Details section.");
                return;
            }
            setActiveTab('commodity');
        } else if (activeTab === 'commodity') {
            setActiveTab('budget');
        } else if (activeTab === 'budget') {
            if (!subproject && !formData.estimatedCompletionDate) {
                alert("Estimated Completion Date is required before proceeding to summary.");
                setMissingFields(['estimatedCompletionDate']);
                setActiveTab('details');
                return;
            }
            if (!subproject) {
                setActiveTab('summary');
            }
        }
    };

    const handleBackSection = (): void => {
        if (activeTab === 'summary') {
            setActiveTab('budget');
        } else if (activeTab === 'budget') {
            setActiveTab('commodity');
        } else if (activeTab === 'commodity') {
            setActiveTab('details');
        }
    };

    const handleSubmit = async (e: FormEvent): Promise<void> => {
        e.preventDefault();
        
        // Final guard: only allow submission from the intended tabs
        const isNew = !subproject;
        if (isNew && activeTab !== 'summary') {
            // If they pressed Enter, we don't want to save.
            // We just return and do nothing, letting the user use the navigation buttons.
            return;
        }

        if (!isNew && activeTab !== 'budget' && activeTab !== 'summary') {
            return;
        }

        if (!isNew && subproject) {
            const decision = getStatusDecision({
                moduleKey: 'subprojects',
                item: subproject,
                action: 'editDetails',
                hasModuleAccess: hasAccess('Subprojects', 'edit'),
            });
            const allowed = await ensureDecisionAllowed(decision, {
                moduleKey: 'subprojects',
                item: subproject,
                itemId: subproject.id,
                itemName: subproject.name,
                status: subproject.status,
                action: 'editDetails',
                entityType: 'subproject',
            });
            if (!allowed) return;
        }

        if (isNew && validationErrors.length > 0) {
            setMissingFields(validationErrors);
            alert("Please fill in all required fields before saving.");
            setActiveTab('details');
            return;
        }
        
        setMissingFields([]);

        const timestamp = new Date().toISOString();
        const historyEntry = { date: timestamp, event: subproject ? "Subproject Updated" : "Subproject Created", user: currentUser?.fullName || "System" };
        
        let resolvedIpoId = formData.ipo_id;
        if (!resolvedIpoId && formData.indigenousPeopleOrganization) {
            const matched = ipos.find(i => i.name === formData.indigenousPeopleOrganization);
            if (matched) resolvedIpoId = matched.id;
        }

        const detailActualsChanged = !!subproject && (formData.details || []).some(detail => {
            const original = (subproject.details || []).find(item => item.id === detail.id);
            if (!original) return !!detail.actualDeliveryDate || !!detail.actualNumberOfUnits;
            return valuesDiffer(original.actualDeliveryDate, detail.actualDeliveryDate)
                || valuesDiffer(original.actualNumberOfUnits, detail.actualNumberOfUnits);
        });
        const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
            hasPhysicalAccomplishment: !!formData.actualCompletionDate,
            hasChanged: !subproject || valuesDiffer(subproject.actualCompletionDate, formData.actualCompletionDate) || detailActualsChanged,
            previousSubmittedAt: subproject?.physical_accomplishment_submitted_at,
            submittedAt: timestamp
        });

        const payload: any = {
            ...formData,
            ipo_id: resolvedIpoId,
            physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
            updated_at: timestamp
        };
        if (!subproject) {
            payload.created_at = timestamp;
            payload.uid = formData.uid || `SP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
            payload.history = [historyEntry];
            
            // Phase 2: Workflow Logic
            if (currentUser?.requires_approver) {
                payload.workflow_status = 'PENDING';
            } else {
                payload.workflow_status = 'APPROVED';
            }
        } else {
            payload.history = [...(subproject.history || []), historyEntry];
        }

        if (supabase) {
            const { id, ...dbPayload } = payload; 
            
            const dateFields = ['startDate', 'estimatedCompletionDate', 'actualCompletionDate'];
            dateFields.forEach(field => {
                if (dbPayload[field] === '') {
                    dbPayload[field] = null;
                }
            });

            if (dbPayload.details) {
                dbPayload.details = dbPayload.details.map((d: any) => {
                    const cleanD = { ...d };
                    if (cleanD.deliveryDate === '') cleanD.deliveryDate = null;
                    if (cleanD.actualDeliveryDate === '') cleanD.actualDeliveryDate = null;
                    if (cleanD.obligationMonth === '') cleanD.obligationMonth = null;
                    if (cleanD.disbursementMonth === '') cleanD.disbursementMonth = null;
                    return cleanD;
                });
            }

            if (!subproject) {
                const { data, error } = await supabase.from('subprojects').insert([dbPayload]).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    logAction('Created Subproject', data.name, data.indigenousPeopleOrganization, 'Subproject', String(data.id));
                    if (resolvedIpoId) addIpoHistory(resolvedIpoId, `Subproject Created: ${data.name}`);
                }
            } else {
                const { data, error } = await supabase.from('subprojects').update(dbPayload).eq('id', subproject.id).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    const metadata = getMonetaryChanges(subproject, data, 'Subproject');
                    logAction('Updated Subproject', data.name, data.indigenousPeopleOrganization, 'Subproject', String(data.id), metadata);
                }
            }
        } else {
             const offlinePayload = { ...payload, id: subproject ? subproject.id : Date.now() };
             onUpdateSubproject(offlinePayload);
        }

        if (payload.subprojectCommodities && payload.subprojectCommodities.length > 0) {
            setIpos(prev => prev.map(ipo => {
                if (ipo.name === payload.indigenousPeopleOrganization) {
                    const newComs = [...ipo.commodities];
                    let changed = false;
                    payload.subprojectCommodities.forEach((sc: SubprojectCommodity) => {
                         const exists = newComs.some(c => c.particular === sc.name && c.type === sc.typeName);
                         if (!exists) {
                             newComs.push({ type: sc.typeName, particular: sc.name, value: sc.area, isScad: false });
                             changed = true;
                         }
                    });
                    if (changed) return { ...ipo, commodities: newComs };
                }
                return ipo;
            }));
        }

        onBack();
    };

    const TabButton = ({ name, label }: { name: any, label: string }): React.ReactNode => (
        <button type="button" onClick={() => setActiveTab(name)} className={`data-tab ${activeTab === name ? 'is-active' : ''}`}>{label}</button>
    );

    return (
        <div className="form-card form-page animate-fadeIn">
            <div className="detail-header">
                <h3 className="detail-title">{subproject ? 'Edit Subproject' : 'Add New Subproject'}</h3>
                <button onClick={onBack} className="btn btn-secondary"><ArrowLeft className="btn-symbol" aria-hidden="true" />Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="mb-6">
                    <nav className="data-tabs">
                        <TabButton name="details" label="Subproject Details" />
                        <TabButton name="commodity" label="Subproject Commodity" />
                        <TabButton name="budget" label="Budget Items" />
                        {!subproject && <TabButton name="summary" label="Summary" />}
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                         <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="form-label">Subproject Name <span className="form-required">*</span></label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'form-control--invalid' : ''}`} required /></div>
                                <div>
                                    <label className="form-label">Operating Unit</label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit || ''} 
                                        onChange={handleInputChange} 
                                        className={commonInputClasses} 
                                        disabled={currentUser?.role !== 'Administrator'}
                                        title={currentUser?.role !== 'Administrator' ? "Only Administrators can edit the Operating Unit" : ""}
                                    >
                                        <option value="">Select Operating Unit</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div><label className="form-label">Region <span className="form-required">*</span></label><select value={selectedRegion} onChange={(e) => { setSelectedRegion(e.target.value); setFormData(prev => ({...prev, indigenousPeopleOrganization: ''})); }} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') && !selectedRegion ? 'form-control--invalid' : ''}`}><option value="">Select Region</option>{philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className="form-label">Indigenous People Organization <span className="form-required">*</span></label><select name="indigenousPeopleOrganization" value={formData.indigenousPeopleOrganization} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') ? 'form-control--invalid' : ''}`} disabled={!selectedRegion} required><option value="">Select IPO</option>{filteredIpos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}</select></div>
                                <div><label className="form-label">Status <span className="form-required">*</span></label><select name="status" value={formData.status} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('status') ? 'form-control--invalid' : ''}`}><option value="Proposed">Proposed</option><option value="Ongoing">Ongoing</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></div>
                                <div><label className="form-label">Package</label><select name="packageType" value={formData.packageType} onChange={handleInputChange} className={commonInputClasses}>{Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="form-label">Estimated Completion {!subproject && <span className="form-required">*</span>}</label>
                                    <MonthYearPicker
                                        value={formData.estimatedCompletionDate}
                                        onChange={(val) => {
                                            const year = parseInt(val.split('-')[0]);
                                            if (year > (formData.fundingYear || new Date().getFullYear())) {
                                                alert(`Estimated completion year cannot be beyond the funding year (${formData.fundingYear}).`);
                                                return;
                                            }
                                            setFormData(prev => ({ ...prev, estimatedCompletionDate: val }));
                                        }}
                                        placeholder="Select completion date"
                                        className={missingFields.includes('estimatedCompletionDate') ? 'form-control--invalid' : ''}
                                        defaultYear={formData.fundingYear}
                                    />
                                    {getYearFromDateStr(formData.estimatedCompletionDate) && getYearFromDateStr(formData.estimatedCompletionDate) !== (formData.fundingYear || new Date().getFullYear()).toString() && (
                                        <p className="form-help form-help--warning">Note: Estimated completion year is different from the funding year.</p>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div><label className="form-label">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="form-label">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="form-label">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div className="form-check-group">
                                    <label className="form-check">
                                        <input type="checkbox" checked={formData.isRealignment || false} onChange={e => setFormData(prev => ({ ...prev, isRealignment: e.target.checked, isSavings: e.target.checked ? false : prev.isSavings }))} className="form-checkbox" />
                                        <span>Realignment</span>
                                    </label>
                                    <label className="form-check">
                                        <input type="checkbox" checked={formData.isSavings || false} onChange={e => setFormData(prev => ({ ...prev, isSavings: e.target.checked, isRealignment: e.target.checked ? false : prev.isRealignment }))} className="form-checkbox" />
                                        <span>Savings</span>
                                    </label>
                                </div>
                            </div>
                            {isMonthTargetOverdue(formData.estimatedCompletionDate) && formData.status !== 'Completed' && (
                                <div className="notice notice--danger form-stack">
                                    <h4 className="notice__title">Catch Up Plan</h4>
                                    <p>Project is delayed. Please provide a catch-up plan.</p>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="form-label">Remarks / Justification</label>
                                            <textarea name="catchUpPlanRemarks" value={formData.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                        </div>
                                        <div>
                                            <label className="form-label">New Target Completion Date</label>
                                            <input type="date" name="newTargetCompletionDate" value={formData.newTargetCompletionDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                    )}
                    {activeTab === 'commodity' && (
                        <div className="space-y-4">
                            {formData.subprojectCommodities && formData.subprojectCommodities.length > 0 ? (
                                formData.subprojectCommodities.map((c, i) => (
                                    <div key={i} className={`form-record-card ${i === editingCommodityIndex ? 'is-editing' : ''}`}>
                                        <div className="form-record-card__content">
                                            <div className="form-record-card__heading">
                                                <span className="form-record-card__title">{c.name}</span>
                                                <span className="status-badge status-badge--approved status-badge--compact">{c.typeName}</span>
                                            </div>
                                            <div className="form-record-card__metrics">
                                                <div>
                                                    <span className="form-record-card__label">{c.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area'}</span>
                                                    <span className="form-record-card__value">{c.area} {c.typeName === 'Livestock' ? 'Heads' : 'Hectares'}</span>
                                                </div>
                                                {c.typeName === 'Crop' && (
                                                    <div>
                                                        <span className="form-record-card__label">Estimated Yield</span>
                                                        <span className="form-record-card__value">{c.averageYield?.toLocaleString()} Kilograms</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="form-record-card__actions">
                                            <button type="button" onClick={() => handleEditCommodity(i)} className="table-action table-action--primary" title="Edit commodity">
                                                <Pencil className="btn-symbol" aria-hidden="true" />
                                            </button>
                                            <button type="button" onClick={() => handleRemoveCommodity(i)} className="table-action table-action--danger" title="Remove commodity">
                                                <Trash2 className="btn-symbol" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="detail-empty">No commodities added yet. Use the form below to add one.</p>
                            )}
                            
                            <div className="detail-list-item mt-6">
                                <h4 className="detail-section-title">
                                    {editingCommodityIndex !== null ? 'Edit Commodity' : 'Add New Commodity'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="form-label form-label--compact">Commodity Type</label>
                                        <select 
                                            name="typeName" 
                                            value={currentCommodity.typeName} 
                                            onChange={handleCommodityChange} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Type</option>
                                            <option value="Crop">Crop</option>
                                            <option value="Livestock">Livestock</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label form-label--compact">Commodity Name</label>
                                        <select 
                                            name="name" 
                                            value={currentCommodity.name} 
                                            onChange={handleCommodityChange} 
                                            disabled={!currentCommodity.typeName} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Commodity</option>
                                            {currentCommodity.typeName === 'Crop' && groupedCommodities.names.map(groupName => (
                                                <optgroup key={groupName} label={groupName}>
                                                    {groupedCommodities.groups[groupName].map(c => (
                                                        <option key={c.id} value={c.name}>{c.name}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                            {currentCommodity.typeName === 'Livestock' && groupedLivestock.names.map(groupName => (
                                                <optgroup key={groupName} label={groupName}>
                                                    {groupedLivestock.groups[groupName].map(c => (
                                                        <option key={c.id} value={c.name}>{c.name}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label form-label--compact">
                                            {currentCommodity.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area (Hectares)'}
                                        </label>
                                        <input 
                                            type="number" 
                                            name="area" 
                                            value={currentCommodity.area} 
                                            onChange={handleCommodityChange} 
                                            className={commonInputClasses} 
                                            placeholder={currentCommodity.typeName === 'Livestock' ? "Enter number of heads" : "Enter hectares"}
                                        />
                                    </div>
                                </div>

                                {currentCommodity.name && (
                                    <div className="form-reference-card animate-fadeIn">
                                        <h5 className="form-reference-card__title">
                                            <Info className="h-3 w-3" />
                                            Reference Information
                                        </h5>
                                        {currentCommodity.typeName === 'Crop' ? (
                                            (() => {
                                                const ref = refCommodities.find(c => c.name === currentCommodity.name);
                                                if (!ref) return null;
                                                return (
                                                    <div className="form-reference-card__grid">
                                                        <div>
                                                            <span className="form-reference-card__label">Elevation Range</span>
                                                            <span className="form-reference-card__value">{ref.min_elevation_masl} - {ref.max_elevation_masl} MASL</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Slope</span>
                                                            <span className="form-reference-card__value">{ref.max_slope_percent}% Max</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Seasonality</span>
                                                            <span className="form-reference-card__value">Wet: {ref.wet_season_start}, Dry: {ref.dry_season_start}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Soil Type</span>
                                                            <span className="form-reference-card__value">{ref.recommended_soil}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Fertilizer</span>
                                                            <span className="form-reference-card__value">{ref.fertilizer_npk}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Watering</span>
                                                            <span className="form-reference-card__value">{ref.watering_method}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Harvest Period</span>
                                                            <span className="form-reference-card__value">{ref.harvest_period_days} Days</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">pH Range</span>
                                                            <span className="form-reference-card__value">{ref.ph_min} - {ref.ph_max}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Climate Suitability</span>
                                                            <span className="form-reference-card__value">{ref.climate_type_suitability}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                const ref = refLivestock.find(c => c.name === currentCommodity.name);
                                                if (!ref) return null;
                                                return (
                                                    <div className="form-reference-card__grid">
                                                        <div>
                                                            <span className="form-reference-card__label">Category</span>
                                                            <span className="form-reference-card__value">{ref.category}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Housing Type</span>
                                                            <span className="form-reference-card__value">{ref.housing_type}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Feed Type</span>
                                                            <span className="form-reference-card__value">{ref.feed_type}</span>
                                                        </div>
                                                        <div>
                                                            <span className="form-reference-card__label">Water Requirement</span>
                                                            <span className="form-reference-card__value">{ref.water_liters_per_day} Liters/Day</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        )}
                                    </div>
                                )}

                                <div className="form-action-layout">
                                    {currentCommodity.typeName === 'Crop' && (
                                        <div className="w-full md:w-1/3">
                                            <label className="form-label form-label--compact">Target Yield (Kilograms)</label>
                                            <div className="form-control-wrap">
                                                <input 
                                                    type="number" 
                                                    name="averageYield" 
                                                    value={currentCommodity.averageYield} 
                                                    readOnly
                                                    className={commonInputClasses + " form-control--readonly form-control--accent"}
                                                />
                                                <div className="form-control-end-icon">
                                                    <span>KG</span>
                                                </div>
                                            </div>
                                            <p className="form-help">Calculated based on area and reference target yield.</p>
                                        </div>
                                    )}
                                    <div className="form-action-row">
                                        {editingCommodityIndex !== null && (
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setEditingCommodityIndex(null);
                                                    setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
                                                }} 
                                                className="btn btn-secondary"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button 
                                            type="button" 
                                            onClick={handleAddCommodity} 
                                            className="btn btn-primary"
                                        >
                                            {editingCommodityIndex !== null ? 'Update Commodity' : 'Add to List'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'budget' && (
                        <div className="form-stack">
                             {formData.details.map((d, index) => (
                                <div key={d.id} className={`form-record-card ${editingDetailId === d.id ? 'is-editing' : ''}`}>
                                    <div>
                                        <span className="form-record-card__title">{d.particulars}</span>
                                        <div className="form-record-card__meta">
                                            <div>{d.uacsCode} {availableUacsCodes.find(c => c.code === d.uacsCode)?.desc ? `- ${availableUacsCodes.find(c => c.code === d.uacsCode)?.desc}` : ''}</div>
                                            <div>{d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(Number(d.pricePerUnit))}</div>
                                            <span className="block mt-1">Obligation: {formatMonthYear(d.obligationMonth)} | Disbursement: {formatMonthYear(d.disbursementMonth)}</span>
                                        </div>
                                    </div>
                                    <div className="form-record-card__actions">
                                        <span className="form-record-card__total">{formatCurrency(Number(d.numberOfUnits) * Number(d.pricePerUnit))}</span>
                                        <div className="form-action-row">
                                            <button type="button" onClick={() => handleEditDetail(d.id)} className="table-action table-action--primary" aria-label="Edit budget item">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                            </button>
                                            <button type="button" onClick={() => handleRemoveDetail(d.id)} className="table-action table-action--danger" aria-label="Remove budget item">&times;</button>
                                        </div>
                                    </div>
                                </div>
                             ))}
                             <div className="form-record-total">Total: {formatCurrency(calculateTotalBudget(formData.details))}</div>
                             
                             <div className="form-grid form-grid--compact form-grid--align-end form-divider">
                                <div><label className="form-label form-label--compact">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="form-label form-label--compact">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " form-control--compact"}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                
                                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div><label className="form-label form-label--compact">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="form-label form-label--compact">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType] || {}).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                </div>

                                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="form-label form-label--compact">UACS Code</label>
                                        <input 
                                            type="text"
                                            name="uacsCode" 
                                            value={currentDetail.uacsCode} 
                                            onChange={handleDetailChange} 
                                            list="uacs-codes-list-edit"
                                            placeholder="Search UACS..."
                                            className={commonInputClasses + " form-control--compact"}
                                        />
                                        <datalist id="uacs-codes-list-edit">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="form-label form-label--compact">Description</label>
                                        <input 
                                            type="text" 
                                            value={availableUacsCodes.find(c => c.code === currentDetail.uacsCode)?.desc || ''} 
                                            readOnly 
                                            className={commonInputClasses + " form-control--compact form-control--readonly"}
                                            placeholder="UACS Description"
                                        />
                                    </div>
                                </div>
 
                                <div>
                                    <label className="form-label form-label--compact">Delivery Month</label>
                                    <MonthYearPicker
                                        value={currentDetail.deliveryDate}
                                        onChange={(val) => {
                                            if (formData.estimatedCompletionDate && val > formData.estimatedCompletionDate) {
                                                setConfirmBudgetItemDate({ field: 'deliveryDate', dateStr: val });
                                                return;
                                            }
                                            setCurrentDetail(prev => ({ ...prev, deliveryDate: val }));
                                        }}
                                        placeholder="Select month"
                                        defaultYear={formData.fundingYear}
                                        className="form-control--compact"
                                    />
                                </div>
                                
                                <div>
                                    <label className="form-label form-label--compact">Obligation Month</label>
                                    <MonthYearPicker
                                        value={currentDetail.obligationMonth}
                                        onChange={(val) => {
                                            if (formData.estimatedCompletionDate && val > formData.estimatedCompletionDate) {
                                                setConfirmBudgetItemDate({ field: 'obligationMonth', dateStr: val });
                                                return;
                                            }
                                            setCurrentDetail(prev => ({ ...prev, obligationMonth: val }));
                                        }}
                                        placeholder="Select month"
                                        defaultYear={formData.fundingYear}
                                        className="form-control--compact"
                                    />
                                </div>
                                <div>
                                    <label className="form-label form-label--compact">Disbursement Month</label>
                                    <MonthYearPicker
                                        value={currentDetail.disbursementMonth}
                                        onChange={(val) => setCurrentDetail(prev => ({ ...prev, disbursementMonth: val }))}
                                        placeholder="Select month"
                                        defaultYear={formData.fundingYear}
                                        className="form-control--compact"
                                    />
                                </div>
                                
                                <div><label className="form-label form-label--compact">Price per Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"} /></div>
                                <div><label className="form-label form-label--compact">Number of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"} /></div>
                                <div><label className="form-label form-label--compact">Unit of Measure</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " form-control--compact"}><option value="pcs">pcs</option><option value="grams">grams</option><option value="kg">kg</option><option value="liters">liters</option><option value="boxes">boxes</option><option value="cans">cans</option><option value="sets">sets</option><option value="pax">pax</option><option value="heads">heads</option><option value="months">months</option><option value="days">days</option><option value="ha">ha</option><option value="bags">bags</option><option value="bottles">bottles</option><option value="sachets">sachets</option><option value="rolls">rolls</option><option value="meters">meters</option><option value="units">units</option><option value="packs">packs</option><option value="lots">lots</option></select></div>
                                
                                <div className="form-field--full form-action-row">
                                    {editingDetailId !== null && (
                                        <button type="button" onClick={handleCancelEditDetail} className="btn btn-secondary">Cancel</button>
                                    )}
                                    <button type="button" onClick={handleAddDetail} className="btn btn-primary">
                                        {editingDetailId !== null ? 'Update Item' : 'Add Item'}
                                    </button>
                                </div>
                             </div>
                        </div>
                    )}
                    {activeTab === 'summary' && (
                        <div className="form-stack form-stack--spacious animate-fadeIn">
                            {validationErrors.length > 0 && (
                                <div className="notice notice--danger">
                                    <h5 className="notice__title">Missing Required Information</h5>
                                    <p>The following fields are required before you can save:</p>
                                    <ul className="notice__list">
                                        {validationErrors.map(field => (
                                            <li key={field}>
                                                {field === 'indigenousPeopleOrganization' ? 'IPO' : 
                                                 field === 'details' ? 'Budget Items (at least one required)' :
                                                 field === 'commodities' ? 'Commodities (at least one required)' :
                                                 field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            <div className="notice notice--success">
                                <h4 className="notice__title">Subproject Summary</h4>
                                <p>Please review the details below before confirming the creation of this subproject.</p>
                            </div>

                            <div className="form-summary-grid">
                                <div className="form-stack">
                                    <h5 className="form-section__title">General Information</h5>
                                    <div className="form-summary-list">
                                        <span className="form-summary-label">Name:</span>
                                        <span className={`form-summary-value ${!formData.name ? 'is-missing' : ''}`}>
                                            {formData.name || 'Missing Name'}
                                        </span>
                                        
                                        <span className="form-summary-label">IPO:</span>
                                        <span className={`form-summary-value ${!formData.indigenousPeopleOrganization ? 'is-missing' : ''}`}>
                                            {formData.indigenousPeopleOrganization || 'Missing IPO'}
                                        </span>
                                        
                                        <span className="form-summary-label">Location:</span> <span className="form-summary-value">{formData.location}</span>
                                        <span className="form-summary-label">OU:</span> <span className="form-summary-value">{formData.operatingUnit}</span>
                                        
                                        <span className="form-summary-label">Status:</span>
                                        <span className={`form-summary-value ${!formData.status ? 'is-missing' : ''}`}>
                                            {formData.status || 'Missing Status'}
                                        </span>
                                        
                                        <span className="form-summary-label">Package:</span> <span className="form-summary-value">{formData.packageType}</span>
                                        
                                        <span className="form-summary-label">Est. Completion:</span>
                                        <span className={`form-summary-value ${!formData.estimatedCompletionDate ? 'is-missing' : ''}`}>
                                            {formData.estimatedCompletionDate ? formatMonthYear(formData.estimatedCompletionDate) : 'Missing Date'}
                                        </span>
                                        
                                        <span className="form-summary-label">Fund Year:</span> <span className="form-summary-value">{formData.fundingYear}</span>
                                        <span className="form-summary-label">Fund Type:</span> <span className="form-summary-value">{formData.fundType}</span>
                                        <span className="form-summary-label">Tier:</span> <span className="form-summary-value">{formData.tier}</span>
                                    </div>
                                </div>

                                <div className="form-stack">
                                    <h5 className="form-section__title">Commodities</h5>
                                    {formData.subprojectCommodities && formData.subprojectCommodities.length > 0 ? (
                                        <div className="form-repeat-list form-repeat-list--unbounded">
                                            {formData.subprojectCommodities.map((c, i) => (
                                                <div key={i} className="form-repeat-card">
                                                    <div><div className="form-repeat-card__title">{c.name} ({c.typeName})</div>
                                                    <div className="form-repeat-card__meta">{c.typeName === 'Livestock' ? 'Heads' : 'Area'}: {c.area}</div></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="form-error">Missing Commodities - Please add at least one commodity.</p>
                                    )}
                                </div>
                            </div>

                            <div className="form-stack">
                                <h5 className="form-section__title">Budget Items</h5>
                                <div className="data-table-shell">
                                    {formData.details.length > 0 ? (
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Particulars</th>
                                                    <th>Qty/Unit</th>
                                                    <th className="data-table__numeric">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {formData.details.map(d => (
                                                    <tr key={d.id}>
                                                        <td>{d.particulars}</td>
                                                        <td>{d.numberOfUnits} {d.unitOfMeasure}</td>
                                                        <td className="data-table__numeric">{formatCurrency(d.pricePerUnit * d.numberOfUnits)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="data-table__total-row">
                                                    <td colSpan={2} className="data-table__numeric">Grand Total:</td>
                                                    <td className="data-table__numeric">{formatCurrency(calculateTotalBudget(formData.details))}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="form-error">Missing Budget Items - Please add at least one budget item.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="form-footer">
                    {activeTab !== 'details' && (
                        <button type="button" onClick={handleBackSection} className="btn btn-secondary">Back Section</button>
                    )}
                    
                    {/* Navigation Buttons */}
                    {activeTab !== 'summary' && !(subproject && activeTab === 'budget') && (
                        <button 
                            type="button" 
                            onClick={handleNextSection} 
                            className="btn btn-primary"
                        >
                            Next Section
                        </button>
                    )}

                    {/* Confirmation/Update Buttons */}
                    {(activeTab === 'summary' || (subproject && activeTab === 'budget')) && (
                        <button 
                            type="submit" 
                            disabled={!subproject && validationErrors.length > 0}
                            className={`btn btn-primary ${(!subproject && validationErrors.length > 0) ? 'is-disabled' : ''}`}
                        >
                            {subproject ? 'Update Subproject' : 'Confirm & Save Subproject'}
                        </button>
                    )}
                </div>
            </form>

            {/* Budget Item Date Confirmation Modal */}
            {confirmBudgetItemDate && (
                <ConfirmDialog
                    title="Confirm Budget Item Date"
                    description={`The ${budgetItemFieldLabels[confirmBudgetItemDate.field].toLowerCase()} you selected is beyond the subproject's estimated completion date. Do you want to update the subproject's estimated completion date to match this month?`}
                    confirmLabel="Confirm & Update"
                    onConfirm={handleConfirmBudgetItemDate}
                    onCancel={handleCancelBudgetItemDate}
                />
            )}

            {budgetItemErrorFields.length > 0 && (
                <div className="modal-backdrop" role="presentation">
                    <section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="budget-fields-title">
                        <header className="modal-card__header"><h3 id="budget-fields-title">Complete Budget Item Fields</h3></header>
                        <div className="modal-card__body">
                        <p>
                            Please complete the following required fields before adding or updating this budget item:
                        </p>
                        <ul className="notice__list">
                            {budgetItemErrorFields.map(field => (
                                <li key={field}>{budgetItemFieldLabels[field] || field}</li>
                            ))}
                        </ul>
                        </div>
                        <footer className="modal-card__footer"><button type="button" onClick={() => setBudgetItemErrorFields([])} className="btn btn-primary">OK</button></footer>
                    </section>
                </div>
            )}
        </div>
    );
};

export default SubprojectEdit;

// --- End of SubprojectEdit.tsx ---
