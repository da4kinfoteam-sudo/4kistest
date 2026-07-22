
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Download, FileSpreadsheet, Plus, SlidersHorizontal, Upload, X } from 'lucide-react';
import { IPO, Subproject, Activity, philippineRegions, Commodity, referenceCommodityTypes, LodAssessment, GidaArea, ElcacArea, normalizeRegionName } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { supabase } from '../supabaseClient';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, useUserAccess } from './mainfunctions/TableHooks';
import { downloadIposReport, downloadIposTemplate, handleIposUpload } from './mainfunctions/ImportExportService';
import { useAuth } from '../contexts/AuthContext';
import { fetchAll } from '../hooks/useSupabaseTable';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { ConfirmDialog, DataTablePagination, SortableTableHeader as CanonicalSortableTableHeader } from './ui/enterprise';
import { BulkSelectionBar, ColumnFilterDialog, MajorTableToolbar, SelectionCheckbox, TruncatedTableCell } from './ui/MajorDataTable';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface IPOsProps {
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    subprojects: Subproject[];
    activities: Activity[];
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
    externalFilters?: { region?: string; year?: string; search?: string; ancestralDomainNo?: string } | null;
    onClearExternalFilters?: () => void;
    gidaAreas: GidaArea[];
    elcacAreas: ElcacArea[];
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const defaultFormData = {
    name: '',
    location: '',
    region: '',
    indigenousCulturalCommunity: '',
    ancestralDomainNo: '',
    registeringBody: 'SEC',
    contactPerson: '',
    contactNumber: '',
    registrationDate: '',
    isWomenLed: false,
    isWithinGida: false,
    isWithinElcac: false,
    isWithScad: false,
    commodities: [] as Commodity[],
    levelOfDevelopment: 1 as IPO['levelOfDevelopment'],
    totalMembers: 0,
    totalIpMembers: 0,
    totalMaleMembers: 0,
    totalFemaleMembers: 0,
    totalYouthMembers: 0,
    totalSeniorMembers: 0,
    total4PsMembers: 0,
};

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];

const IPOs: React.FC<IPOsProps> = ({ ipos, setIpos, subprojects, activities, onSelectIpo, onSelectSubproject, particularTypes, commodityCategories, externalFilters, onClearExternalFilters, gidaAreas, elcacAreas }) => {
    const { currentUser } = useAuth();
    const tableStoragePrefix = `ipos_${currentUser?.id || 'anonymous'}`;
    const { canEdit } = useUserAccess('IPO Management');
    const isAdmin = currentUser?.role === 'Administrator' || currentUser?.role === 'Super Admin';
    const { logAction } = useLogAction();
    const [formData, setFormData] = useState(defaultFormData);
    const [baseRegion, setBaseRegion] = useState(''); // Track base region from dropdown
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [editingIpo, setEditingIpo] = useState<IPO | null>(null); 
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [latestLevels, setLatestLevels] = useState<Record<number, number>>({});

    useEffect(() => {
        const fetchLevels = async () => {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('lod_assessments')
                .select('ipo_id, year, manual_level, computed_level')
                .order('year', { ascending: false });
            
            if (error) {
                console.error("Error fetching LOD levels:", error);
                return;
            }

            const levels: Record<number, number> = {};
            data?.forEach((assessment: any) => {
                if (!levels[assessment.ipo_id]) {
                    levels[assessment.ipo_id] = assessment.manual_level || assessment.computed_level || 0;
                }
            });
            setLatestLevels(levels);
        };
        fetchLevels();
    }, [ipos]);
    const [ipoToDelete, setIpoToDelete] = useState<IPO | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Persistent Filters using useLocalStorageState
    const [searchTerm, setSearchTerm] = useLocalStorageState(`${tableStoragePrefix}_searchTerm`, '');
    const [regionFilter, setRegionFilter] = useLocalStorageState(`${tableStoragePrefix}_regionFilter`, 'All');
    const [flagFilter, setFlagFilter] = useLocalStorageState(`${tableStoragePrefix}_flagFilter`, {
        womenLed: false, 
        withinGida: false, 
        withinElcac: false, 
        withScad: false,
        withSubprojects: false,
        withTrainings: false
    });
    const [areFlagFiltersOpen, setAreFlagFiltersOpen] = useState(false);
    const [isColumnFilterOpen, setIsColumnFilterOpen] = useState(false);
    const [ipoColumnFilters, setIpoColumnFilters] = useLocalStorageState<Record<string, string[]>>(`${tableStoragePrefix}_columnFilters`, {});

    type SortKeys = keyof IPO | 'totalInvested';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'registrationDate', direction: 'descending' });
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');

    const [currentCommodity, setCurrentCommodity] = useState({
        type: '',
        particular: '',
        value: '',
        yield: '',
        isScad: false,
        marketingPercentage: '',
        foodSecurityPercentage: '',
        averageIncome: ''
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);

    // React to external filters (e.g. from Chatbot)
    useEffect(() => {
        if (externalFilters) {
            if (externalFilters.region) {
                // Try to find exact match or normalized match
                const target = externalFilters.region;
                if (philippineRegions.includes(target)) {
                    setRegionFilter(target);
                } else {
                    // Try normalizing or finding closest match
                    const normalized = normalizeRegionName(target);
                    if (philippineRegions.includes(normalized)) {
                        setRegionFilter(normalized);
                    }
                }
            }
            if (externalFilters.search) {
                setSearchTerm(externalFilters.search);
            }
            if (externalFilters.ancestralDomainNo) {
                setSearchTerm(externalFilters.ancestralDomainNo);
            }
            
            // Clear the external filters so they don't re-apply on remount
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [externalFilters, setRegionFilter, setSearchTerm, onClearExternalFilters]);

    // Helper to refresh data from Supabase
    const refreshData = async () => {
        if (!supabase) return;
        const data = await fetchAll('ipos', 'id', true);
        if (data) {
            setIpos(data as IPO[]);
        }
    };

    // Calculate derived data from activities
    const calculateTotalInvestment = useMemo(() => {
        const investmentMap = new Map<string, number>();

        // Calculate from subprojects
        (subprojects || []).forEach(sp => {
            if (sp.status === 'Completed') {
                const budget = (sp.details || []).reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
                const currentInvestment = investmentMap.get(sp.indigenousPeopleOrganization) || 0;
                investmentMap.set(sp.indigenousPeopleOrganization, currentInvestment + budget);
            }
        });

        // Calculate from trainings (filtered from activities)
        (activities || []).filter(a => a.type === 'Training' && a.status === 'Completed').forEach(t => {
            const cost = (t.expenses || []).reduce((s, e) => s + e.amount, 0);
            (t.participatingIpos || []).forEach(ipoName => {
                const currentInvestment = investmentMap.get(ipoName) || 0;
                investmentMap.set(ipoName, currentInvestment + cost);
            });
        });

        return (ipoName: string) => investmentMap.get(ipoName) || 0;
    }, [subprojects, activities]);

    const calculateTotalAllocation = useMemo(() => {
        const allocationMap = new Map<string, number>();

        // Calculate from subprojects (regardless of status)
        (subprojects || []).forEach(sp => {
            const budget = (sp.details || []).reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
            const currentAllocation = allocationMap.get(sp.indigenousPeopleOrganization) || 0;
            allocationMap.set(sp.indigenousPeopleOrganization, currentAllocation + budget);
        });

        // Calculate from trainings (regardless of status)
        (activities || []).filter(a => a.type === 'Training').forEach(t => {
            const cost = (t.expenses || []).reduce((s, e) => s + e.amount, 0);
            (t.participatingIpos || []).forEach(ipoName => {
                const currentAllocation = allocationMap.get(ipoName) || 0;
                allocationMap.set(ipoName, currentAllocation + cost);
            });
        });

        return (ipoName: string) => allocationMap.get(ipoName) || 0;
    }, [subprojects, activities]);

    useEffect(() => {
        // Logic kept for "Add" mode or internal updates, though Edit button is removed from list
        if (editingIpo) {
             setFormData({
                name: editingIpo.name,
                location: editingIpo.location,
                region: editingIpo.region,
                indigenousCulturalCommunity: editingIpo.indigenousCulturalCommunity,
                ancestralDomainNo: editingIpo.ancestralDomainNo,
                registeringBody: registeringBodyOptions.includes(editingIpo.registeringBody) ? editingIpo.registeringBody : 'Others',
                contactPerson: editingIpo.contactPerson,
                contactNumber: editingIpo.contactNumber,
                registrationDate: editingIpo.registrationDate || '',
                isWomenLed: editingIpo.isWomenLed,
                isWithinGida: editingIpo.isWithinGida,
                isWithinElcac: editingIpo.isWithinElcac,
                isWithScad: editingIpo.isWithScad,
                commodities: editingIpo.commodities || [],
                levelOfDevelopment: editingIpo.levelOfDevelopment || 1,
                totalMembers: editingIpo.totalMembers || 0,
                totalIpMembers: editingIpo.totalIpMembers || 0,
                totalMaleMembers: editingIpo.totalMaleMembers || 0,
                totalFemaleMembers: editingIpo.totalFemaleMembers || 0,
                totalYouthMembers: editingIpo.totalYouthMembers || 0,
                totalSeniorMembers: editingIpo.totalSeniorMembers || 0,
                total4PsMembers: editingIpo.total4PsMembers || 0,
            });
            setBaseRegion(editingIpo.region); // Init base region
            if (!registeringBodyOptions.includes(editingIpo.registeringBody)) {
                setOtherRegisteringBody(editingIpo.registeringBody);
            } else {
                setOtherRegisteringBody('');
            }
        } else {
            setFormData(defaultFormData);
            setBaseRegion('');
        }
    }, [editingIpo]);
    
    const processedIpos = useMemo(() => {
        let filteredIpos = [...ipos];

        if (regionFilter !== 'All') {
            filteredIpos = filteredIpos.filter(ipo => ipo.region === regionFilter);
        }
        if ((ipoColumnFilters.region || []).length > 0) {
            filteredIpos = filteredIpos.filter(ipo => ipoColumnFilters.region.includes(ipo.region));
        }
        
        if (flagFilter.womenLed) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWomenLed);
        }
        if (flagFilter.withinGida) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithinGida);
        }
        if (flagFilter.withinElcac) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithinElcac);
        }
        if (flagFilter.withScad) {
            filteredIpos = filteredIpos.filter(ipo => ipo.isWithScad);
        }

        // New Filters
        if (flagFilter.withSubprojects) {
            const iposWithSP = new Set((subprojects || []).map(sp => sp.indigenousPeopleOrganization));
            filteredIpos = filteredIpos.filter(ipo => iposWithSP.has(ipo.name));
        }

        if (flagFilter.withTrainings) {
            const iposWithTr = new Set();
            (activities || []).filter(a => a.type === 'Training').forEach(t => {
                (t.participatingIpos || []).forEach(p => iposWithTr.add(p));
            });
            filteredIpos = filteredIpos.filter(ipo => iposWithTr.has(ipo.name));
        }

        const commodityFilters = ipoColumnFilters.commodities || [];
        if (commodityFilters.length > 0) {
            filteredIpos = filteredIpos.filter(ipo => (ipo.commodities || []).some(commodity => commodityFilters.includes(commodity.particular)));
        }
        const levelFilters = ipoColumnFilters.levelOfDevelopment || [];
        if (levelFilters.length > 0) {
            filteredIpos = filteredIpos.filter(ipo => levelFilters.includes(String(latestLevels[ipo.id] || ipo.levelOfDevelopment || '')));
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filteredIpos = filteredIpos.filter(ipo =>
                ipo.name.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.contactPerson.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.location.toLowerCase().includes(lowercasedSearchTerm) ||
                (ipo.ancestralDomainNo || '').toLowerCase().includes(lowercasedSearchTerm) ||
                // Integrated Commodity Search
                (ipo.commodities || []).some(c => 
                    c.particular.toLowerCase().includes(lowercasedSearchTerm) ||
                    c.type.toLowerCase().includes(lowercasedSearchTerm)
                )
            );
        }

        if (sortConfig !== null) {
            filteredIpos.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalInvested') {
                    aValue = calculateTotalInvestment(a.name);
                    bValue = calculateTotalInvestment(b.name);
                } else {
                    aValue = a[sortConfig.key as keyof IPO];
                    bValue = b[sortConfig.key as keyof IPO];
                }
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        return filteredIpos;
    }, [ipos, searchTerm, regionFilter, sortConfig, flagFilter, ipoColumnFilters, latestLevels, calculateTotalInvestment, subprojects, activities]);

    useEffect(() => {
        if (!isSelectionMode) return;
        const visibleIds = new Set(processedIpos.map(item => item.id));
        setSelectedIds(previous => {
            const next = previous.filter(id => visibleIds.has(id));
            return next.length === previous.length ? previous : next;
        });
    }, [isSelectionMode, processedIpos]);
    
    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedIpos 
    } = usePagination(processedIpos, [searchTerm, regionFilter, flagFilter, ipoColumnFilters, sortConfig]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleFlagFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setFlagFilter(prev => ({ ...prev, [name]: checked }));
    };

    // --- Multi-Delete Handlers ---
    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const ids = paginatedIpos.map(i => i.id);
            setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            const idsToRemove = new Set(paginatedIpos.map(i => i.id));
            setSelectedIds(prev => prev.filter(id => !idsToRemove.has(id)));
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const confirmMultiDelete = async () => {
        if (supabase) {
            const itemsToDelete = ipos.filter(i => selectedIds.includes(i.id));
            const deletedNames = itemsToDelete.map(i => i.name).join(', ');
            logAction('Deleted IPOs', `Bulk deleted ${selectedIds.length} IPOs: ${deletedNames}`);

            try {
                // Archive each item
                const archivePayload = itemsToDelete.map(item => ({
                    entity_type: 'ipo',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('ipos').delete().in('id', selectedIds);
                if (deleteError) throw deleteError;

                refreshData();
            } catch (error: any) {
                console.error("Error archiving/deleting IPOs:", error);
                alert("Failed to delete selected IPOs: " + error.message);
            }
        } else {
            setIpos(prev => prev.filter(ipo => !selectedIds.includes(ipo.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'levelOfDevelopment' || name.startsWith('total')) {
            setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
        }
         else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    // ... [Commodity handlers omitted for brevity, logic remains for Adding New IPO] ...
    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrentCommodity(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'type') {
            setCurrentCommodity({ 
                type: value, 
                particular: '', 
                value: '', 
                yield: '', 
                isScad: false, 
                marketingPercentage: '', 
                foodSecurityPercentage: '', 
                averageIncome: ''
            });
        } else {
            if (name === 'marketingPercentage' || name === 'foodSecurityPercentage') {
                const numValue = parseFloat(value);
                if (value !== '' && (isNaN(numValue) || numValue < 0)) return; 

                const newValue = value === '' ? 0 : numValue;
                const otherKey = name === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                const otherValue = parseFloat(String((currentCommodity as any)[otherKey]) || '0');

                if (newValue + otherValue > 100) {
                    return; 
                }
            }
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.type === 'Livestock';
        if (!currentCommodity.type || !currentCommodity.particular || !currentCommodity.value || (!isAnimal && !currentCommodity.yield)) {
            alert(`Please fill out all commodity fields including ${isAnimal ? 'Number of Heads' : 'Area and Yield'}.`);
            return;
        }
        const newCommodity: Commodity = {
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
            yield: isAnimal ? undefined : parseFloat(currentCommodity.yield),
            isScad: currentCommodity.isScad,
            marketingPercentage: currentCommodity.marketingPercentage ? parseFloat(currentCommodity.marketingPercentage) : undefined,
            foodSecurityPercentage: currentCommodity.foodSecurityPercentage ? parseFloat(currentCommodity.foodSecurityPercentage) : undefined,
            averageIncome: currentCommodity.averageIncome ? parseFloat(currentCommodity.averageIncome) : undefined,
        };

        if (editingCommodityIndex !== null) {
            const updatedCommodities = [...formData.commodities];
            updatedCommodities[editingCommodityIndex] = newCommodity;
            const hasScad = updatedCommodities.some(c => c.isScad);
            setFormData(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
            setEditingCommodityIndex(null);
        } else {
            const updatedCommodities = [...formData.commodities, newCommodity];
            const hasScad = updatedCommodities.some(c => c.isScad);
            setFormData(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
        }

        setCurrentCommodity({ 
            type: '', particular: '', value: '', yield: '', isScad: false, 
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: '' 
        });
    };

    const handleEditCommodity = (index: number) => {
        const commodity = formData.commodities[index];
        setCurrentCommodity({
            type: commodity.type,
            particular: commodity.particular,
            value: String(commodity.value),
            yield: commodity.yield ? String(commodity.yield) : '',
            isScad: commodity.isScad || false,
            marketingPercentage: commodity.marketingPercentage ? String(commodity.marketingPercentage) : '',
            foodSecurityPercentage: commodity.foodSecurityPercentage ? String(commodity.foodSecurityPercentage) : '',
            averageIncome: commodity.averageIncome ? String(commodity.averageIncome) : ''
        });
        setEditingCommodityIndex(index);
    };

    const handleCancelCommodityEdit = () => {
        setEditingCommodityIndex(null);
        setCurrentCommodity({ 
            type: '', particular: '', value: '', yield: '', isScad: false, 
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: '' 
        });
    };

    const handleRemoveCommodity = (indexToRemove: number) => {
        const updatedCommodities = formData.commodities.filter((_, index) => index !== indexToRemove);
        const hasScad = updatedCommodities.some(c => c.isScad);
        setFormData(prev => ({
            ...prev,
            commodities: updatedCommodities,
            isWithScad: hasScad,
        }));
        if (editingCommodityIndex === indexToRemove) {
            handleCancelCommodityEdit();
        }
    };


    const handleLocationChange = (locationString: string) => {
        const { province, municipality, barangays } = parseLocation(locationString);
        let region = formData.region;
        
        // NIR Exception
        if (province) {
            const p = province.toLowerCase();
            if (p.includes('negros occidental') || p.includes('negros oriental') || p.includes('siquijor')) {
                region = 'Negros Island Region (NIR)';
            } else if (baseRegion) {
                // If switching away from NIR province, revert to base region selected
                region = baseRegion;
            }
        }

        // Auto-check GIDA
        const isWithinGida = gidaAreas.some(g => 
            g.region === region &&
            g.province.toLowerCase() === province.toLowerCase() &&
            g.municipality.toLowerCase() === municipality.toLowerCase() &&
            barangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
        );

        // Auto-check ELCAC
        const isWithinElcac = elcacAreas.some(e => 
            e.region === region &&
            e.province.toLowerCase() === province.toLowerCase() &&
            e.municipality.toLowerCase() === municipality.toLowerCase() &&
            barangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
        );

        setFormData(prev => ({
            ...prev,
            location: locationString,
            region: region,
            isWithinGida: isWithinGida || prev.isWithinGida, // Keep true if already true, or set if match
            isWithinElcac: isWithinElcac || prev.isWithinElcac
        }));
    };
    
    const handleRegionChange = (region: string) => {
        const normalized = normalizeRegionName(region);
        setBaseRegion(normalized); // Update base region
        
        const { province, municipality, barangays } = parseLocation(formData.location);
        const isWithinGida = gidaAreas.some(g => 
            g.region === normalized &&
            g.province.toLowerCase() === province.toLowerCase() &&
            g.municipality.toLowerCase() === municipality.toLowerCase() &&
            barangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
        );

        const isWithinElcac = elcacAreas.some(e => 
            e.region === normalized &&
            e.province.toLowerCase() === province.toLowerCase() &&
            e.municipality.toLowerCase() === municipality.toLowerCase() &&
            barangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
        );

        setFormData(prev => ({
            ...prev,
            region: normalized,
            isWithinGida: isWithinGida || prev.isWithinGida,
            isWithinElcac: isWithinElcac || prev.isWithinElcac
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const finalRegisteringBody = formData.registeringBody === 'Others' ? otherRegisteringBody : formData.registeringBody;
        
        if (!formData.name || !formData.location) {
            alert('Please fill out all required fields: Name and Location.');
            return;
        }
        
        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';
        const submissionData = { 
            ...formData, 
            registeringBody: finalRegisteringBody,
            registrationDate: formData.registrationDate || null,
            workflow_status,
            updated_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                // Remove generated fields if creating new
                const { data, error } = await supabase
                    .from('ipos')
                    .insert([{ ...submissionData, created_at: new Date().toISOString() }])
                    .select()
                    .single();
                
                if (error) throw error;
                
                if (data) {
                    // Log Create
                    logAction('Created IPO', formData.name, undefined, 'IPO', String(data.id));
                }
                
                refreshData();
            } catch (error: any) {
                console.error("Error saving IPO:", error);
                alert("Failed to save IPO. " + error.message);
                return;
            }
        } else {
            // Offline fallback
            const newIpo: IPO = {
                id: ipos.length > 0 ? Math.max(...ipos.map(ipo => ipo.id)) + 1 : 1,
                ...submissionData,
                created_at: new Date().toISOString()
            };
            setIpos(prev => [newIpo, ...prev]);
        }
        handleCancelEdit();
    };

    // Renamed to clarify: Only used for NEW IPOs now
    const handleAddNewClick = () => {
        setEditingIpo(null);
        setBaseRegion(''); // Reset base region
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingIpo(null);
        setFormData(defaultFormData);
        setBaseRegion('');
        setOtherRegisteringBody('');
        handleCancelCommodityEdit();
        setView('list');
    };

    const handleDeleteClick = (ipo: IPO, e: React.MouseEvent) => {
        e.stopPropagation();
        setIpoToDelete(ipo);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (ipoToDelete) {
            logAction('Deleted IPO', ipoToDelete.name, undefined, 'IPO', String(ipoToDelete.id));

            if (supabase) {
                try {
                    const { error: archiveError } = await supabase.from('trash_bin').insert([{
                        entity_type: 'ipo',
                        original_id: ipoToDelete.id,
                        data: ipoToDelete,
                        deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                        deleted_at: new Date().toISOString()
                    }]);
                    if (archiveError) throw archiveError;

                    const { error: deleteError } = await supabase.from('ipos').delete().eq('id', ipoToDelete.id);
                    if (deleteError) throw deleteError;

                    refreshData();
                } catch (error: any) {
                    console.error("Error archiving/deleting IPO:", error);
                    alert("Failed to delete IPO: " + error.message);
                }
            } else {
                setIpos(prev => prev.filter(p => p.id !== ipoToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setIpoToDelete(null);
        }
    };
    
    const formatDate = (dateString?: string | null) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const handleToggleRow = (ipoId: number) => {
        setExpandedRowId(prevId => (prevId === ipoId ? null : ipoId));
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }
    
    const commonInputClasses = "form-control";
    
    const SortableHeader: React.FC<{ sortKey: SortKeys; label: string; className?: string; }> = ({ sortKey, label, className }) => {
      return (
        <CanonicalSortableTableHeader
            label={label}
            columnKey={sortKey}
            sortConfig={sortConfig}
            onSort={requestSort}
            className={className}
        />
      )
    }

    // Filter activities for display
    const linkedTrainings = useMemo(() => (activities || []).filter(a => a.type === 'Training'), [activities]);
    const activeFlagFilterCount = Object.values(flagFilter).filter(Boolean).length;

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

    const getProjectStatusBadgeClass = (status?: string) => {
        switch (status) {
            case 'Completed': return 'status-badge status-badge--compact status-badge--completed';
            case 'Ongoing': return 'status-badge status-badge--compact status-badge--ongoing';
            case 'Proposed': return 'status-badge status-badge--compact status-badge--proposed';
            case 'Cancelled': return 'status-badge status-badge--compact status-badge--cancelled';
            default: return 'status-badge status-badge--compact status-badge--neutral';
        }
    };

    const canApprove = (role?: string) => {
        return ['Super Admin', 'Administrator', 'Focal - User', 'Management'].includes(role || '');
    };

    const handleApprove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to approve this IPO?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('ipos').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setIpos(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setIpos(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('ipos').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setIpos(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setIpos(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    const ipoFilterFields = [
        { key: 'region', label: 'Location', values: Array.from(new Set(ipos.map(ipo => ipo.region).filter(Boolean))).sort() },
        { key: 'flags', label: 'Flags', values: ['Women-Led', 'GIDA', 'ELCAC', 'SCAD', 'With Subprojects', 'With Trainings'] },
        { key: 'commodities', label: 'Commodities', values: Array.from(new Set(ipos.flatMap(ipo => (ipo.commodities || []).map(commodity => commodity.particular)).filter(Boolean))).sort() },
        { key: 'levelOfDevelopment', label: 'Level of Development', values: ['1', '2', '3', '4', '5'] }
    ];
    const selectedFlagNames = [
        flagFilter.womenLed && 'Women-Led',
        flagFilter.withinGida && 'GIDA',
        flagFilter.withinElcac && 'ELCAC',
        flagFilter.withScad && 'SCAD',
        flagFilter.withSubprojects && 'With Subprojects',
        flagFilter.withTrainings && 'With Trainings'
    ].filter(Boolean) as string[];
    const dialogFilters = {
        ...ipoColumnFilters,
        ...(regionFilter !== 'All' && !(ipoColumnFilters.region || []).length ? { region: [regionFilter] } : {}),
        ...(selectedFlagNames.length ? { flags: selectedFlagNames } : {})
    };
    const applyIpoFilters = (filters: Record<string, string[]>) => {
        const flags = filters.flags || [];
        setFlagFilter({
            womenLed: flags.includes('Women-Led'),
            withinGida: flags.includes('GIDA'),
            withinElcac: flags.includes('ELCAC'),
            withScad: flags.includes('SCAD'),
            withSubprojects: flags.includes('With Subprojects'),
            withTrainings: flags.includes('With Trainings')
        });
        setRegionFilter('All');
        const { flags: _flags, ...persistentFilters } = filters;
        setIpoColumnFilters(persistentFilters);
    };
    const activeIpoFilterCount = Object.keys(dialogFilters).filter(key => dialogFilters[key]?.length).length;

    const renderListView = () => (
        <div className="data-list-page">
            <ColumnFilterDialog open={isColumnFilterOpen} fields={ipoFilterFields} filters={dialogFilters} onApply={applyIpoFilters} onClose={() => setIsColumnFilterOpen(false)} />
            <div className="data-list-header">
                <h2 className="data-list-title">IPO Management</h2>
                {canEdit && <button onClick={handleAddNewClick} className="btn btn-primary"><Plus aria-hidden="true" /> Add New IPO</button>}
            </div>
            <div className="data-table-card major-table-card">
                <MajorTableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search IPOs..."
                    activeFilterCount={activeIpoFilterCount}
                    onOpenFilters={() => setIsColumnFilterOpen(true)}
                    actions={isSelectionMode
                        ? <BulkSelectionBar intent="delete" count={selectedIds.length} onConfirm={() => setIsMultiDeleteModalOpen(true)} onClear={() => setSelectedIds([])} onCancel={handleToggleSelectionMode} />
                        : <>
                        <button onClick={() => downloadIposReport(processedIpos)} className="btn btn-secondary"><Download aria-hidden="true" /> Export</button>
                        {canEdit && <>
                            <button onClick={downloadIposTemplate} className="btn btn-secondary"><FileSpreadsheet aria-hidden="true" /> Template</button>
                            <label htmlFor="ipo-upload-major" className={`btn btn-secondary ${isUploading ? 'is-disabled' : ''}`}><Upload aria-hidden="true" /> {isUploading ? 'Uploading...' : 'Import'}</label>
                            <input id="ipo-upload-major" type="file" className="hidden" onChange={(event) => handleIposUpload(event, ipos, setIpos, logAction, setIsUploading, gidaAreas, elcacAreas)} accept=".xlsx,.xls" disabled={isUploading} />
                            {isAdmin && <button onClick={handleToggleSelectionMode} className="btn btn-secondary" aria-label="Delete multiple IPOs"><TrashIcon /> Delete</button>}
                        </>}
                    </>}
                />
                <div className="data-table-scroll">
                    <table className="data-table">
                        <thead><tr>
                            {isSelectionMode && <th className="data-table__cell--selection"><SelectionCheckbox aria-label="Select all IPOs on this page" onChange={handleSelectAll} checked={paginatedIpos.length > 0 && paginatedIpos.every(ipo => selectedIds.includes(ipo.id))} indeterminate={paginatedIpos.some(ipo => selectedIds.includes(ipo.id)) && !paginatedIpos.every(ipo => selectedIds.includes(ipo.id))} /></th>}
                            <CanonicalSortableTableHeader label="IPO ID" columnKey="id" sortConfig={sortConfig} onSort={requestSort} />
                            <CanonicalSortableTableHeader label="IPO Name" columnKey="name" sortConfig={sortConfig} onSort={requestSort} />
                            <CanonicalSortableTableHeader label="Location" columnKey="location" sortConfig={sortConfig} onSort={requestSort} />
                            <th>Flags</th><th>Commodities</th>
                            <CanonicalSortableTableHeader label="Level of Development" columnKey="levelOfDevelopment" sortConfig={sortConfig} onSort={requestSort} />
                        </tr></thead>
                        <tbody>
                            {paginatedIpos.map(ipo => {
                                const flags = [ipo.isWomenLed && 'Women-Led', ipo.isWithinGida && 'GIDA', ipo.isWithinElcac && 'ELCAC', ipo.isWithScad && 'SCAD'].filter(Boolean) as string[];
                                const commodities = (ipo.commodities || []).map(commodity => commodity.particular).filter(Boolean);
                                const flagPreview = flags.length ? `${flags[0]}${flags.length > 1 ? ` +${flags.length - 1}` : ''}` : '—';
                                const commodityPreview = commodities.length ? `${commodities[0]}${commodities.length > 1 ? ` +${commodities.length - 1}` : ''}` : '—';
                                return <tr
                                    key={ipo.id}
                                    className={isSelectionMode ? (selectedIds.includes(ipo.id) ? 'data-table__row--selected data-table__row--selected-danger' : undefined) : 'data-table__row--interactive'}
                                    tabIndex={isSelectionMode ? undefined : 0}
                                    aria-label={isSelectionMode ? undefined : `View details for ${ipo.name}`}
                                    onClick={isSelectionMode ? undefined : () => onSelectIpo(ipo)}
                                    onKeyDown={isSelectionMode ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectIpo(ipo); } }}
                                >
                                    {isSelectionMode && <td className="data-table__cell--selection"><SelectionCheckbox aria-label={`Select ${ipo.name}`} checked={selectedIds.includes(ipo.id)} onChange={() => handleSelectRow(ipo.id)} /></td>}
                                    <td className="data-table__cell--mono">{ipo.id}</td>
                                    <td className="data-table__cell--primary"><TruncatedTableCell value={ipo.name} /></td>
                                    <td><TruncatedTableCell value={ipo.location} /></td>
                                    <td><TruncatedTableCell className="status-badge status-badge--compact status-badge--info" value={flagPreview} fullText={flags.join(', ') || 'No flags'} /></td>
                                    <td><TruncatedTableCell value={commodityPreview} fullText={commodities.join(', ') || 'No commodities'} /></td>
                                    <td><span className="data-table-level">{latestLevels[ipo.id] || ipo.levelOfDevelopment || '—'}</span></td>
                                </tr>;
                            })}
                            {paginatedIpos.length === 0 && <tr><td className="data-table__empty-cell" colSpan={isSelectionMode ? 7 : 6}>No IPOs match the current filters.</td></tr>}
                        </tbody>
                    </table>
                </div>
                <DataTablePagination currentPage={currentPage} totalPages={totalPages} totalItems={processedIpos.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} onItemsPerPageChange={setItemsPerPage} />
            </div>
        </div>
    );

    const renderFormView = () => (
        <div className="form-page">
            <div className="data-list-header">
                <h2 className="data-list-title">{view === 'edit' ? 'Edit IPO' : 'Add New IPO'}</h2>
                <button type="button" onClick={handleCancelEdit} className="btn btn-secondary">Back to list</button>
            </div>
            <form onSubmit={handleSubmit} className="form-stack form-stack--spacious">
                <fieldset className="form-fieldset">
                    <legend className="form-legend">IPO Profile</legend>
                    <div className="form-grid">
                        <div className="form-field--full">
                            <label htmlFor="name" className="form-label">IPO Name</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                         <div className="form-field--full">
                            <label htmlFor="indigenousCulturalCommunity" className="form-label">Indigenous Cultural Community (ICC)</label>
                            <input type="text" name="indigenousCulturalCommunity" id="indigenousCulturalCommunity" value={formData.indigenousCulturalCommunity} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        
                        <div className="form-field--full">
                            <label htmlFor="location" className="form-label">IPO Location</label>
                            <LocationPicker 
                                value={formData.location} 
                                onChange={handleLocationChange} 
                                onRegionChange={handleRegionChange} 
                                required 
                            />
                        </div>
                        <div className="form-field--full">
                            <label htmlFor="ancestralDomainNo" className="form-label">Ancestral Domain No.</label>
                            <input type="text" name="ancestralDomainNo" id="ancestralDomainNo" value={formData.ancestralDomainNo} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                         <div>
                            <label htmlFor="registeringBody" className="form-label">Registering Body</label>
                            <select name="registeringBody" id="registeringBody" value={formData.registeringBody} onChange={handleInputChange} className={commonInputClasses}>
                                {registeringBodyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                <option value="Others">Others</option>
                            </select>
                         </div>
                         {formData.registeringBody === 'Others' && (
                            <div>
                                <label htmlFor="otherRegisteringBody" className="form-label">Please Specify</label>
                                <input type="text" name="otherRegisteringBody" id="otherRegisteringBody" value={otherRegisteringBody} onChange={(e) => setOtherRegisteringBody(e.target.value)} required className={commonInputClasses} />
                            </div>
                         )}
                          <div>
                            <label htmlFor="registrationDate" className="form-label">Registration Date</label>
                            <input type="date" name="registrationDate" id="registrationDate" value={formData.registrationDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                         <div>
                            <label htmlFor="contactPerson" className="form-label">Contact Person</label>
                            <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="contactNumber" className="form-label">Contact Number</label>
                            <input type="text" name="contactNumber" id="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                        </div>

                        <div className="form-field--full form-check-group">
                             <label htmlFor="isWomenLed" className="form-check">
                                <input type="checkbox" name="isWomenLed" id="isWomenLed" checked={formData.isWomenLed} onChange={handleInputChange} className="form-checkbox" />
                                <span>Women-led</span>
                            </label>
                            <label htmlFor="isWithinGida" className="form-check">
                                <input type="checkbox" name="isWithinGida" id="isWithinGida" checked={formData.isWithinGida} onChange={handleInputChange} className="form-checkbox" />
                                <span>Within GIDA area</span>
                            </label>
                            <label htmlFor="isWithinElcac" className="form-check">
                                <input type="checkbox" name="isWithinElcac" id="isWithinElcac" checked={formData.isWithinElcac} onChange={handleInputChange} className="form-checkbox" />
                                <span>Within ELCAC area</span>
                            </label>
                            <label className="form-check is-disabled">
                                <input type="checkbox" name="isWithScad" checked={formData.isWithScad} disabled className="form-checkbox" />
                                <span>With SCAD</span>
                            </label>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="form-fieldset">
                    <legend className="form-legend">Commodities</legend>
                    <div className="form-repeat-list form-repeat-list--unbounded">
                        {formData.commodities.map((commodity, index) => (
                            <div key={index} className={`form-repeat-card ${editingCommodityIndex === index ? 'is-editing' : ''}`}>
                                <div>
                                    <div className="form-repeat-card__title">
                                        <span>{commodity.particular}</span>
                                        <span className="form-repeat-card__type"> ({commodity.type}) — </span>
                                        <span>
                                            {commodity.value.toLocaleString()} {commodity.type === 'Livestock' ? 'heads' : 'ha'}
                                            {commodity.yield ? ` | Yield: ${commodity.yield}` : ''}
                                        </span>
                                        {commodity.isScad && <span className="status-badge status-badge--compact status-badge--cyan">SCAD</span>}
                                    </div>
                                    <div className="form-repeat-card__meta form-repeat-card__meta--inline">
                                        {(commodity.marketingPercentage || 0) > 0 && <span>Mktg: {commodity.marketingPercentage}%</span>}
                                        {(commodity.foodSecurityPercentage || 0) > 0 && <span>FS: {commodity.foodSecurityPercentage}%</span>}
                                        {(commodity.averageIncome || 0) > 0 && <span>Inc: ₱{commodity.averageIncome?.toLocaleString()}</span>}
                                    </div>
                                </div>
                                <div className="form-repeat-card__actions">
                                    <button type="button" onClick={() => handleEditCommodity(index)} className="table-action" aria-label={`Edit ${commodity.particular}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                    </button>
                                    <button type="button" onClick={() => handleRemoveCommodity(index)} className="table-action table-action--danger" aria-label={`Remove ${commodity.particular}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="form-grid form-grid--four form-grid--compact form-grid--align-end">
                         <div>
                            <label className="form-label">Type</label>
                            <select name="type" value={currentCommodity.type} onChange={handleCommodityChange} className="form-control form-control--compact">
                                <option value="">Select Type</option>
                                {referenceCommodityTypes.map(type => ( <option key={type} value={type}>{type}</option> ))}
                            </select>
                        </div>
                        <div className="form-field--span-two">
                            <label className="form-label">Particular</label>
                            <select name="particular" value={currentCommodity.particular} onChange={handleCommodityChange} disabled={!currentCommodity.type} className="form-control form-control--compact">
                                <option value="">Select Particular</option>
                                {currentCommodity.type && commodityCategories[currentCommodity.type] && commodityCategories[currentCommodity.type].map(item => ( <option key={item} value={item}>{item}</option> ))}
                            </select>
                        </div>
                         <div className="form-grid form-grid--two form-grid--compact form-grid--align-end">
                            <div>
                                <label className="form-label">{currentCommodity.type === 'Livestock' ? 'Number of Heads' : 'Area (Hectares)'}</label>
                                <input type="number" name="value" value={currentCommodity.value} onChange={handleCommodityChange} min="0" step="any" className="form-control form-control--compact" />
                            </div>
                            {currentCommodity.type !== 'Livestock' && (
                                <div>
                                    <label className="form-label">Avg Yield</label>
                                    <input type="number" name="yield" value={currentCommodity.yield} onChange={handleCommodityChange} min="0" step="any" className="form-control form-control--compact" />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="form-grid form-grid--four form-grid--compact form-grid--align-end form-divider">
                        <div>
                            <label className="form-label">Marketing %</label>
                            <input type="number" name="marketingPercentage" value={currentCommodity.marketingPercentage} onChange={handleCommodityChange} min="0" max="100" className="form-control form-control--compact" placeholder="0-100" />
                        </div>
                        <div>
                            <label className="form-label">Food Security %</label>
                            <input type="number" name="foodSecurityPercentage" value={currentCommodity.foodSecurityPercentage} onChange={handleCommodityChange} min="0" max="100" className="form-control form-control--compact" placeholder="0-100" />
                        </div>
                        <div>
                            {Number(currentCommodity.marketingPercentage) > 0 && (
                                <div>
                                    <label className="form-label">Average Income (PHP)</label>
                                    <input type="number" name="averageIncome" value={currentCommodity.averageIncome} onChange={handleCommodityChange} min="0" className="form-control form-control--compact" placeholder="0.00" />
                                </div>
                            )}
                        </div>
                        <div className="form-action-row">
                            {editingCommodityIndex !== null ? (
                                <div className="form-action-row">
                                    <button type="button" onClick={handleAddCommodity} className="btn btn-primary btn-compact">Update</button>
                                    <button type="button" onClick={handleCancelCommodityEdit} className="btn btn-secondary btn-compact">Cancel</button>
                                </div>
                            ) : (
                                <button type="button" onClick={handleAddCommodity} className="btn btn-primary btn-icon" aria-label="Add commodity">+</button>
                            )}
                        </div>
                    </div>
                    <div className="form-check-group">
                        <label className="form-check">
                            <input type="checkbox" name="isScad" checked={currentCommodity.isScad} onChange={handleCommodityChange} className="form-checkbox" />
                            <span>SCAD commodity</span>
                        </label>
                    </div>
                </fieldset>
                

                <fieldset className="form-fieldset">
                    <legend className="form-legend">Membership Information</legend>
                    <div className="form-grid">
                        <div>
                            <label htmlFor="totalMembers" className="form-label">Total Members</label>
                            <input type="number" name="totalMembers" id="totalMembers" value={formData.totalMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalIpMembers" className="form-label">Total IP Members</label>
                            <input type="number" name="totalIpMembers" id="totalIpMembers" value={formData.totalIpMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="total4PsMembers" className="form-label">Total 4Ps Beneficiaries</label>
                            <input type="number" name="total4PsMembers" id="total4PsMembers" value={formData.total4PsMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalMaleMembers" className="form-label">Male Members</label>
                            <input type="number" name="totalMaleMembers" id="totalMaleMembers" value={formData.totalMaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalFemaleMembers" className="form-label">Female Members</label>
                            <input type="number" name="totalFemaleMembers" id="totalFemaleMembers" value={formData.totalFemaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <span className="form-label">Gender total</span>
                            <span className="form-summary-value">{(formData.totalMaleMembers || 0) + (formData.totalFemaleMembers || 0)}</span>
                        </div>
                        <div>
                            <label htmlFor="totalYouthMembers" className="form-label">Youth Members</label>
                            <input type="number" name="totalYouthMembers" id="totalYouthMembers" value={formData.totalYouthMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label htmlFor="totalSeniorMembers" className="form-label">Senior Citizen Members</label>
                            <input type="number" name="totalSeniorMembers" id="totalSeniorMembers" value={formData.totalSeniorMembers} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                    </div>
                </fieldset>

                <div className="form-footer">
                    <button type="button" onClick={handleCancelEdit} className="btn btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                        Save Changes
                    </button>
                </div>
             </form>
        </div>
    );

    return (
        <div>
            {isDeleteModalOpen && (
                <ConfirmDialog
                    title="Confirm deletion"
                    description={`Delete ${ipoToDelete?.name || 'this IPO'}? This action cannot be undone.`}
                    confirmLabel="Delete IPO"
                    onCancel={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                />
            )}
            
            {isMultiDeleteModalOpen && (
                <ConfirmDialog
                    title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? 'entry' : 'entries'}?`}
                    description="This action cannot be undone. The selected records will be permanently removed."
                    confirmLabel="Delete"
                    onCancel={() => setIsMultiDeleteModalOpen(false)}
                    onConfirm={confirmMultiDelete}
                />
            )}

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

export default IPOs;
