
// Author: 4K 
import React, { useState, useMemo, useEffect, useRef } from 'react';
import StatCard from './StatCard';
import { TrainingIcon, IpoIcon, ProjectsIcon, ActivitiesIcon, SubprojectDetail, tiers, fundTypes, operatingUnits, ouToRegionMap, SystemSettings, filterYears } from '../constants';
import { Subproject, IPO, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../constants';
import Calendar, { CalendarEvent } from './Calendar'; // Updated Import
import { useAuth } from '../contexts/AuthContext';
import { parseLocation } from './LocationPicker';
import { aggregateHomepageFinancials } from '../lib/financialAggregation';
import { aggregateHomepagePhysicalStats } from '../lib/physicalAggregation';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets } from '../lib/budgetLineAdjustments';
import type { DataScope } from '../lib/scopedDataFetch';
import {
    ContentCard,
    EmptyState,
    FilterToolbar,
    MapCard,
    PageHeader,
    StatusIndicator,
} from './ui/enterprise';

// Since Leaflet is loaded from a script tag, we need to declare it for TypeScript
declare const L: any;

// ... (Coordinate Lookup Table and resolveCoordinates function - no changes)
const PROVINCE_COORDINATES: {[key: string]: [number, number]} = {
    // Regions
    'National Capital Region (NCR)': [14.5995, 120.9842],
    'Cordillera Administrative Region (CAR)': [17.3513, 121.1719],
    'Region I (Ilocos Region)': [16.6159, 120.3209],
    'Region II (Cagayan Valley)': [17.6131, 121.7270],
    'Region III (Central Luzon)': [15.4828, 120.7120],
    'Region IV-A (CALABARZON)': [14.1008, 121.0794],
    'MIMAROPA Region': [13.1119, 121.0794], 
    'Region V (Bicol Region)': [13.4210, 123.4137],
    'Region VI (Western Visayas)': [11.0050, 122.5373],
    'Region VII (Central Visayas)': [10.3157, 123.8854],
    'Region VIII (Eastern Visayas)': [11.2433, 125.0086],
    'Region IX (Zamboanga Peninsula)': [7.8352, 122.3995],
    'Region X (Northern Mindanao)': [8.2280, 124.2452],
    'Region XI (Davao Region)': [7.1907, 125.4553],
    'Region XII (SOCCSKSARGEN)': [6.5073, 124.8390],
    'Region XIII (Caraga)': [8.8097, 125.5406],
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)': [7.2104, 124.2452],
    
    // Key Provinces
    'Abra': [17.5750, 120.7397], 'Agusan del Norte': [9.0270, 125.4833], 'Agusan del Sur': [8.5270, 125.7833],
    'Aklan': [11.6933, 122.3556], 'Albay': [13.1706, 123.6339], 'Antique': [11.0167, 122.0333], 'Apayao': [18.0833, 121.2167],
    'Aurora': [16.0000, 121.5833], 'Basilan': [6.5667, 122.0833], 'Bataan': [14.6667, 120.4167], 'Batanes': [20.4485, 121.9708],
    'Batangas': [13.9167, 121.0000], 'Benguet': [16.5667, 120.6667], 'Bohol': [9.8833, 124.2167], 'Bukidnon': [7.9167, 125.0000],
    'Bulacan': [14.9667, 121.0333], 'Cagayan': [18.0000, 121.8333], 'Camarines Norte': [14.1667, 122.7500], 'Camarines Sur': [13.5000, 123.3333],
    'Camiguin': [9.1833, 124.7167], 'Capiz': [11.4167, 122.7500], 'Catanduanes': [13.7500, 124.2500], 'Cavite': [14.2833, 120.9167],
    'Cebu': [10.3167, 123.8833], 'Cotabato': [7.2104, 124.2452], 'Davao de Oro': [7.6333, 126.0000], 'Davao del Norte': [7.5000, 125.6667],
    'Davao del Sur': [6.6667, 125.4167], 'Davao Occidental': [6.0833, 125.5000], 'Davao Oriental': [7.0000, 126.3333], 'Dinagat Islands': [10.1333, 125.6000],
    'Eastern Samar': [11.5000, 125.5000], 'Guimaras': [10.5667, 122.5833], 'Ifugao': [16.8333, 121.1667], 'Ilocos Norte': [18.1667, 120.7500],
    'Ilocos Sur': [17.2500, 120.5000], 'Iloilo': [11.0000, 122.6667], 'Isabela': [17.0000, 122.0000], 'Kalinga': [17.4167, 121.1667],
    'La Union': [16.5000, 120.4167], 'Laguna': [14.2833, 121.4167], 'Lanao del Norte': [8.0000, 124.0000], 'Lanao del Sur': [7.8333, 124.2500],
    'Leyte': [10.8333, 124.8333], 'Maguindanao': [7.0000, 124.5000], 'Marinduque': [13.4167, 121.9167], 'Masbate': [12.1667, 123.5000],
    'Misamis Occidental': [8.4167, 123.7500], 'Misamis Oriental': [8.6667, 124.7500], 'Mountain Province': [17.0833, 121.0000], 'Negros Occidental': [10.3333, 123.0000],
    'Negros Oriental': [9.5833, 123.1667], 'Northern Samar': [12.3333, 124.6667], 'Nueva Ecija': [15.5833, 121.0000], 'Nueva Vizcaya': [16.3333, 121.1667],
    'Occidental Mindoro': [13.0000, 120.9167], 'Oriental Mindoro': [13.0000, 121.4167], 'Palawan': [9.8333, 118.7500], 'Pampanga': [15.0667, 120.7000],
    'Pangasinan': [15.9167, 120.3333], 'Quezon': [14.0000, 121.9167], 'Quirino': [16.2500, 121.6667], 'Rizal': [14.5833, 121.2500],
    'Romblon': [12.5000, 122.2833], 'Samar': [11.8333, 125.0000], 'Sarangani': [6.0000, 125.1667], 'Siquijor': [9.2000, 123.5167],
    'Sorsogon': [12.8333, 124.0000], 'South Cotabato': [6.1667, 124.9167], 'Southern Leyte': [10.2500, 125.0000], 'Sultan Kudarat': [6.5500, 124.5000],
    'Sulu': [6.0000, 121.0000], 'Surigao del Norte': [9.6667, 125.5833], 'Surigao del Sur': [8.7500, 126.0000], 'Tarlac': [15.5000, 120.5000],
    'Tawi-Tawi': [5.1667, 119.9167], 'Zambales': [15.3333, 120.1667], 'Zamboanga del Norte': [8.0000, 122.6667], 'Zamboanga del Sur': [7.8333, 123.3333],
    'Zamboanga Sibugay': [7.7500, 122.7500], 'Metro Manila': [14.5995, 120.9842]
};

const resolveCoordinates = (locationStr: string, operatingUnit?: string): [number, number] | null => {
    if (!locationStr && !operatingUnit) return null;

    if (locationStr && locationStr !== "Online") {
        const { province, region } = parseLocation(locationStr);
        if (province && PROVINCE_COORDINATES[province]) {
            return PROVINCE_COORDINATES[province];
        }
        if (region && PROVINCE_COORDINATES[region]) {
            return PROVINCE_COORDINATES[region];
        }
        const parts = locationStr.split(',').map(p => p.trim());
        for (const part of parts) {
            if (PROVINCE_COORDINATES[part]) return PROVINCE_COORDINATES[part];
        }
    }

    if (operatingUnit) {
        const regionName = ouToRegionMap[operatingUnit];
        if (regionName && PROVINCE_COORDINATES[regionName]) {
            return PROVINCE_COORDINATES[regionName];
        }
    }

    return null;
};

interface MapDisplayProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Activity[];
}

const MapDisplay: React.FC<MapDisplayProps> = ({ ipos, subprojects, trainings }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null); 
    const markersRef = useRef<any[]>([]); 

    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current).setView([12.8797, 121.7740], 6); 
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);
        }
        
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (mapRef.current) {
            markersRef.current.forEach(marker => marker.remove());
            markersRef.current = [];

            const blueIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            const greenIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            const redIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            (ipos || []).forEach(ipo => {
                let coords = resolveCoordinates(ipo.location);
                if (!coords && ipo.region && PROVINCE_COORDINATES[ipo.region]) {
                    coords = PROVINCE_COORDINATES[ipo.region];
                }

                if (coords) {
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                     const marker = L.marker([jitterLat, jitterLng], { icon: redIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${ipo.name}</b><br>Type: IPO<br>Location: ${ipo.location}`);
                    markersRef.current.push(marker);
                }
            });

            const ipoMap = new Map<string, IPO>(ipos.map(i => [i.name, i]));

            (subprojects || []).forEach(project => {
                let coords: [number, number] | null = null;
                const linkedIpo = ipoMap.get(project.indigenousPeopleOrganization);
                
                if (linkedIpo) {
                    coords = resolveCoordinates(linkedIpo.location);
                    if (!coords && linkedIpo.region && PROVINCE_COORDINATES[linkedIpo.region]) {
                        coords = PROVINCE_COORDINATES[linkedIpo.region];
                    }
                }

                if (!coords) {
                    coords = resolveCoordinates(project.location, project.operatingUnit);
                }

                if (coords) {
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                    const marker = L.marker([jitterLat, jitterLng], { icon: blueIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${project.name}</b><br>Type: Subproject<br>Status: ${project.status}<br>Linked IPO: ${project.indigenousPeopleOrganization}`);
                    markersRef.current.push(marker);
                }
            });
            
            (trainings || []).forEach(training => {
                const coords = resolveCoordinates(training.location, training.operatingUnit);

                if (coords) {
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                     const marker = L.marker([jitterLat, jitterLng], { icon: greenIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${training.name}</b><br>Type: Training<br>Location: ${training.location}`);
                    markersRef.current.push(marker);
                }
            });

            if (markersRef.current.length > 0) {
                const group = new L.featureGroup(markersRef.current);
                mapRef.current.fitBounds(group.getBounds().pad(0.2));
            } else {
                 mapRef.current.setView([12.8797, 121.7740], 6); 
            }
        }
    }, [ipos, subprojects, trainings]);

    return <div ref={mapContainerRef} className="dashboard-map" />;
};


type ActivityDateView = 'Current Date' | 'All';

type ActivityItem = (
    (Subproject & { activityType: 'Subproject' }) |
    (Activity & { activityType: 'Training' | 'Activity' })
) & {
    activityDate: string;
    activityOu: string;
    activityStatus: Subproject['status'] | Activity['status'];
};

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const parseLocalDate = (dateString?: string) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const isTodayOrLater = (dateString?: string) => {
    const date = parseLocalDate(dateString);
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date >= today;
};

const isWithinDeadlineWindow = (dateString?: string) => {
    if (!dateString) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const deadline = new Date(dateString);
    deadline.setHours(0, 0, 0, 0);

    const daysUntilDeadline = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDeadline >= 0 && daysUntilDeadline <= 5;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce((total, item) => total + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)), 0);
}

// ... Icons (FinancialsIcon, AdIcon) remain same ...

// Added props for navigation
interface DashboardProps {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
    systemSettings: SystemSettings;
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    externalFilters?: { region?: string; year?: string; search?: string } | null;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    subprojects, ipos, activities, systemSettings,
    officeReqs, staffingReqs, otherProgramExpenses,
    onSelectSubproject, onSelectActivity, externalFilters, onDataScopeChange
}) => {
    const { currentUser, getVisibilityScope } = useAuth();
    
    // Check Reports & Dashboards visibility scope
    const visibilityScope = getVisibilityScope('Dashboards');
    const isLockedToOwnOu = visibilityScope === 'Own OU';

    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedOu, setSelectedOu] = useState<string>(isLockedToOwnOu ? (currentUser?.operatingUnit || 'All') : 'All');
    const [selectedTier, setSelectedTier] = useState<string>('Tier 1');
    const [selectedFundType, setSelectedFundType] = useState<string>('Current');
    const [totalBudgetView, setTotalBudgetView] = useState<'Obligated' | 'Disbursed'>('Obligated');

    useEffect(() => {
        onDataScopeChange?.({
            year: selectedYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
            canViewAllOus: !isLockedToOwnOu,
            requestedBy: currentUser?.id ?? null
        });
    }, [currentUser?.id, isLockedToOwnOu, onDataScopeChange, selectedFundType, selectedOu, selectedTier, selectedYear]);
    const [spBudgetView, setSpBudgetView] = useState<'Obligated' | 'Disbursed'>('Obligated');
    const [trBudgetView, setTrBudgetView] = useState<'Obligated' | 'Disbursed'>('Obligated');
    
    // Modal States
    const [modalData, setModalData] = useState<ActivityItem | null>(null);
    const [dayModalData, setDayModalData] = useState<{ date: Date, items: CalendarEvent[] } | null>(null);
    const [cardModal, setCardModal] = useState<{ title: string; metrics: { label: string; value: number | string; isCurrency?: boolean; subtext?: string }[] } | null>(null);

    useEffect(() => {
        if (!cardModal && !dayModalData) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setCardModal(null);
            setDayModalData(null);
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [cardModal, dayModalData]);

    const [mapFilters, setMapFilters] = useState({
        ipos: true,
        subprojects: true,
        trainings: true,
    });
    
    // Activities Section State
    const [activitiesFilter, setActivitiesFilter] = useState<'All' | 'Subprojects' | 'Trainings'>('All');
    const [activitiesDateView, setActivitiesDateView] = useState<ActivityDateView>('Current Date');
    const [activitiesPage, setActivitiesPage] = useState(1);
    const itemsPerPageActivities = 9;

    // React to external filters
    useEffect(() => {
        if (externalFilters?.year) {
            setSelectedYear(externalFilters.year);
        }
    }, [externalFilters]);

    // ... (Filter Effects and Calculations remain same) ...

    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

    const handleMapFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setMapFilters(prev => ({ ...prev, [name]: checked }));
    };

    const handleDateClick = (date: Date, events: CalendarEvent[]) => {
        if (events.length > 0) {
            setDayModalData({ date, items: events });
        }
    };

    const handleCalendarEventClick = (event: CalendarEvent) => {
        // Close the day modal if it's open
        setDayModalData(null);

        if (event.originalData) {
            if (event.dataType === 'Subproject') {
                onSelectSubproject(event.originalData);
            } else if (event.dataType === 'Training' || event.dataType === 'Activity') {
                onSelectActivity(event.originalData);
            }
        }
    };

    const availableYears = useMemo(() => {
        return [...filterYears].sort((a, b) => parseInt(b) - parseInt(a));
    }, []);
    
    const filteredData = useMemo(() => {
        // ... (Filtering Logic remains same)
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        let dataToFilter = { 
            subprojects, ipos, activities,
            officeReqs, staffingReqs, otherProgramExpenses
        };

        const filterItem = (item: any) => {
            let matches = true;
            if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
            const year = item.fundingYear || item.fundYear;
            if (selectedYear !== 'All' && year?.toString() !== selectedYear) matches = false;
            if (selectedTier !== 'All' && item.tier !== selectedTier) matches = false;
            if (selectedFundType !== 'All' && item.fundType !== selectedFundType) matches = false;
            if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) matches = false;
            return matches;
        }

        const filterIpo = (item: IPO) => {
            if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
            if (selectedOu !== 'All') {
                const targetRegion = ouToRegionMap[selectedOu];
                if (item.region !== targetRegion) return false;
            }
            if (selectedYear !== 'All') {
                if (!item.registrationDate) return false;
                const regYear = new Date(item.registrationDate).getFullYear().toString();
                if (regYear !== selectedYear) return false;
            }
            return true;
        }

        return {
            subprojects: dataToFilter.subprojects.filter(filterItem).map(sp => ({ ...sp, details: sanitizeDetails(sp.details) })),
            ipos: dataToFilter.ipos.filter(filterIpo),
            activities: dataToFilter.activities.filter(filterItem).map(act => ({ ...act, expenses: sanitizeExpenses(act.expenses) })),
            officeReqs: dataToFilter.officeReqs.filter(filterItem),
            staffingReqs: dataToFilter.staffingReqs.filter(filterItem).map(sr => ({ ...sr, expenses: sanitizeExpenses(sr.expenses) })),
            otherProgramExpenses: dataToFilter.otherProgramExpenses.filter(filterItem),
        };

    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, activities, officeReqs, staffingReqs, otherProgramExpenses]);

    // ... (Dashboard Calculations and Helper functions remain same)

    const dashboardStats = useMemo(() => {
        const aggregationFilters = {
            year: selectedYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
        };

        return {
            financials: aggregateHomepageFinancials({
                subprojects: filteredData.subprojects,
                activities: filteredData.activities,
                officeReqs: filteredData.officeReqs,
                staffingReqs: filteredData.staffingReqs,
                otherProgramExpenses: filteredData.otherProgramExpenses,
            }, aggregationFilters),
            physical: aggregateHomepagePhysicalStats({
                subprojects: filteredData.subprojects,
                ipos,
                activities: filteredData.activities,
                officeReqs: filteredData.officeReqs,
                staffingReqs: filteredData.staffingReqs,
            }, aggregationFilters),
        };
    }, [
        selectedYear,
        selectedOu,
        selectedTier,
        selectedFundType,
        filteredData,
        ipos,
    ]);

    // ... (allActivities, displayedActivities, pagination logic) ...

    const allActivities = useMemo(() => {
        const combined: ActivityItem[] = [
            ...filteredData.subprojects.map(p => ({
                ...p,
                activityType: 'Subproject' as const,
                activityDate: p.estimatedCompletionDate || '',
                activityOu: p.operatingUnit,
                activityStatus: p.status,
            })),
            ...filteredData.activities.map(a => ({
                ...a,
                activityType: a.type as 'Training' | 'Activity',
                activityDate: a.date || '',
                activityOu: a.operatingUnit,
                activityStatus: a.status,
            })),
        ];
        // Sort chronologically from January to December (ascending)
        return combined.sort((a, b) => {
            const dateA = parseLocalDate(a.activityDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const dateB = parseLocalDate(b.activityDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return dateA - dateB;
        });
    }, [filteredData]);

    const displayedActivities = useMemo(() => {
        let items = allActivities;
        if (activitiesFilter === 'Subprojects') {
            items = items.filter(a => a.activityType === 'Subproject');
        } else if (activitiesFilter === 'Trainings') {
            items = items.filter(a => a.activityType === 'Training');
        }
        if (activitiesDateView === 'Current Date') {
            items = items.filter(a => isTodayOrLater(a.activityDate));
        }
        return items;
    }, [allActivities, activitiesFilter, activitiesDateView]);

    useEffect(() => {
        setActivitiesPage(1);
    }, [activitiesFilter, activitiesDateView, displayedActivities.length]);
    
    const paginatedActivitiesList = useMemo(() => {
        const startIndex = (activitiesPage - 1) * itemsPerPageActivities;
        return displayedActivities.slice(startIndex, startIndex + itemsPerPageActivities);
    }, [displayedActivities, activitiesPage]);

    const totalActivityPages = Math.ceil(displayedActivities.length / itemsPerPageActivities);
    
    const filteredIposForMap = mapFilters.ipos ? filteredData.ipos : [];
    const filteredSubprojectsForMap = mapFilters.subprojects ? filteredData.subprojects : [];
    const filteredTrainingsForMap = mapFilters.trainings ? filteredData.activities.filter(a => a.type === 'Training') : [];

    // ... (Card Click Handlers - Show Modal logic remains mostly same but uses the modal state) ...
    const FinancialsIcon = (props: React.SVGProps<SVGSVGElement>) => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
    );

    const AdIcon = (props: React.SVGProps<SVGSVGElement>) => (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );

    const formatRate = (value: number, total: number) => {
        if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return '0%';
        return `${Math.round((value / total) * 100)}%`;
    };

    const getBudgetMetrics = (bucket: { disb: number; obli: number; alloc: number }) => [
        { label: "FY Item Actual Disbursed", value: bucket.disb, isCurrency: true },
        { label: "FY Item Actual Obligated", value: bucket.obli, isCurrency: true },
        { label: "Allocation", value: bucket.alloc, isCurrency: true },
        { label: "Utilization Rate", value: formatRate(bucket.obli, bucket.alloc), subtext: "Obligation vs Allotment" },
        { label: "Disbursement Rate", value: formatRate(bucket.disb, bucket.obli), subtext: "Disbursement vs Obligation" },
    ];

    const showTotalBudget = () => {
        const metrics = getBudgetMetrics(dashboardStats.financials.total).map(metric =>
            metric.label === 'FY Item Actual Disbursed'
                ? { ...metric, label: 'Total FY Item Actual Disbursed' }
                : metric.label === 'FY Item Actual Obligated'
                    ? { ...metric, label: 'Total FY Item Actual Obligated' }
                    : metric.label === 'Allocation'
                        ? { ...metric, label: 'Total Allocation' }
                        : metric
        );

        setCardModal({ title: `Total Budget Performance (${totalBudgetView})`, metrics });
    };
    const showSpBudget = () => { setCardModal({ title: `Subprojects Budget Performance (${spBudgetView})`, metrics: getBudgetMetrics(dashboardStats.financials.subprojects) }); };
    const showTrBudget = () => { setCardModal({ title: `Trainings Budget Performance (${trBudgetView})`, metrics: getBudgetMetrics(dashboardStats.financials.trainings) }); };
    const showSpCount = () => { setCardModal({ title: "Subprojects Count", metrics: [ { label: "Completed Subprojects", value: dashboardStats.physical.subprojects.actual }, { label: "Total Target Subprojects", value: dashboardStats.physical.subprojects.target }, { label: "Completion Rate", value: dashboardStats.physical.subprojects.target > 0 ? `${Math.round((dashboardStats.physical.subprojects.actual / dashboardStats.physical.subprojects.target) * 100)}%` : "0%" } ] }); };
    const showTrCount = () => { setCardModal({ title: "Trainings Count", metrics: [ { label: "Completed Trainings", value: dashboardStats.physical.trainings.actual }, { label: "Total Target Trainings", value: dashboardStats.physical.trainings.target }, { label: "Completion Rate", value: dashboardStats.physical.trainings.target > 0 ? `${Math.round((dashboardStats.physical.trainings.actual / dashboardStats.physical.trainings.target) * 100)}%` : "0%" } ] }); };
    const showIposAssisted = () => { setCardModal({ title: "IPOs Assisted (Subprojects + Trainings)", metrics: [ { label: "IPOs with Completed SPs/Trainings", value: dashboardStats.physical.iposAssisted.actual }, { label: "Total Target IPOs", value: dashboardStats.physical.iposAssisted.target, subtext: "Linked to any SP/Training" } ] }); };
    const showIposWithSp = () => { setCardModal({ title: "IPOs with Subprojects", metrics: [ { label: "IPOs with Completed SPs", value: dashboardStats.physical.iposWithSp.actual }, { label: "Total Target IPOs", value: dashboardStats.physical.iposWithSp.target, subtext: "Linked to any SP" } ] }); };
    const showAdsAssisted = () => { setCardModal({ title: "Ancestral Domains Assisted", metrics: [ { label: "ADs with Completed SPs/Trainings", value: dashboardStats.physical.adsAssisted.actual }, { label: "Total Target ADs", value: dashboardStats.physical.adsAssisted.target, subtext: "Linked via IPOs" } ] }); };


    return (
        <div className="dashboard-page">
            {/* Card Detail Modal */}
            {cardModal && (
                <div 
                    className="dashboard-modal-backdrop animate-fadeIn"
                    onClick={() => setCardModal(null)}
                >
                    <div 
                        className="dashboard-modal dashboard-modal--day"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dashboard-card-dialog-title"
                    >
                        <div className="dashboard-modal__header">
                            <h3 id="dashboard-card-dialog-title">{cardModal.title}</h3>
                            <button onClick={() => setCardModal(null)} className="dashboard-modal__close" aria-label="Close details">&times;</button>
                        </div>
                        <div className="dashboard-modal__stack">
                            {cardModal.metrics.map((metric, idx) => (
                                <div key={idx} className="dashboard-modal__metric">
                                    <div>
                                        <p className="dashboard-modal__metric-label">{metric.label}</p>
                                        {metric.subtext && <p className="dashboard-modal__metric-subtext">{metric.subtext}</p>}
                                    </div>
                                    <p className="dashboard-modal__metric-value">
                                        {metric.isCurrency && typeof metric.value === 'number' ? formatCurrency(metric.value) : metric.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Day Detail Modal (List of Events) */}
            {dayModalData && (
                <div 
                    className="dashboard-modal-backdrop dashboard-modal-backdrop--lower"
                    onClick={() => setDayModalData(null)}
                >
                    <div 
                        className="dashboard-modal"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dashboard-day-dialog-title"
                    >
                        <div className="dashboard-modal__header">
                            <h3 id="dashboard-day-dialog-title">
                                {dayModalData.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </h3>
                            <button onClick={() => setDayModalData(null)} className="dashboard-modal__close" aria-label="Close day details">&times;</button>
                        </div>
                        
                        <div className="dashboard-modal__body dashboard-day-modal__body custom-scrollbar">
                        <div className="dashboard-modal__stack">
                            {dayModalData.items.map((event, index) => (
                                <div 
                                    key={`${event.id}-${index}`} 
                                    onClick={() => handleCalendarEventClick(event)}
                                    className={`dashboard-modal__event ${event.originalData ? 'dashboard-modal__event--clickable' : ''}`}
                                >
                                    <p className="dashboard-modal__event-title">{event.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="dashboard-modal__event-type">{event.type}</p>
                                        {event.originalData?.operatingUnit && (
                                            <span className="status-badge status-badge--compact status-badge--completed">
                                                {event.originalData.operatingUnit}
                                            </span>
                                        )}
                                    </div>
                                    {event.originalData?.description && (
                                        <p className="dashboard-modal__event-description">
                                            {event.originalData.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        </div>
                    </div>
                </div>
            )}

            <PageHeader
                title="4K Information System Overview"
                metadata="Program performance, schedules, mapped activities, and delivery progress."
            />

            <FilterToolbar className="dashboard-filter-bar">
                     <div className="dashboard-filter">
                        <label htmlFor="ou-filter">OU</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            disabled={isLockedToOwnOu}
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="tier-filter">Tier</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => setSelectedTier(e.target.value)}
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="fund-type-filter">Fund Type</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => setSelectedFundType(e.target.value)}
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="year-filter">Fund Year</label>
                        <select 
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
            </FilterToolbar>

            <div className="dashboard-metric-grid">
                <StatCard 
                    title={`Total Budget (${totalBudgetView})`} 
                    value={formatCurrency(totalBudgetView === 'Obligated' ? dashboardStats.financials.total.obli : dashboardStats.financials.total.disb)} 
                    icon={<FinancialsIcon />} 
                    onClick={showTotalBudget}
                    onToggle={() => setTotalBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                />
                <StatCard 
                    title={`Total Budget for Subprojects (${spBudgetView})`} 
                    value={formatCurrency(spBudgetView === 'Obligated' ? dashboardStats.financials.subprojects.obli : dashboardStats.financials.subprojects.disb)} 
                    icon={<FinancialsIcon />} 
                    onClick={showSpBudget}
                    onToggle={() => setSpBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                />
                <StatCard 
                    title={`Total Budget for Trainings (${trBudgetView})`} 
                    value={formatCurrency(trBudgetView === 'Obligated' ? dashboardStats.financials.trainings.obli : dashboardStats.financials.trainings.disb)} 
                    icon={<FinancialsIcon />} 
                    onClick={showTrBudget}
                    onToggle={() => setTrBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                />
                <StatCard title="Number of Subprojects (Completed)" value={dashboardStats.physical.subprojects.actual.toString()} icon={<ProjectsIcon className="h-8 w-8" />} onClick={showSpCount} />
                <StatCard title="Number of Trainings (Completed)" value={dashboardStats.physical.trainings.actual.toString()} icon={<TrainingIcon className="h-8 w-8" />} onClick={showTrCount} />
                <StatCard title="Number of IPOs assisted" value={dashboardStats.physical.iposAssisted.actual.toString()} icon={<IpoIcon className="h-8 w-8" />} onClick={showIposAssisted} />
                <StatCard title="Number of IPOs with subprojects" value={dashboardStats.physical.iposWithSp.actual.toString()} icon={<IpoIcon className="h-8 w-8" />} onClick={showIposWithSp} />
                <StatCard title="Number of Ancestral Domains assisted" value={dashboardStats.physical.adsAssisted.actual.toString()} icon={<AdIcon className="h-8 w-8" />} onClick={showAdsAssisted} />
            </div>

            {/* System Schedule Summary Card */}
            <ContentCard className="dashboard-panel">
                <div className="dashboard-panel__header">
                    <div>
                        <h3 className="dashboard-panel__title">System Schedule</h3>
                    </div>
                </div>
                <div className="dashboard-schedule-grid">
                    <div>
                        <h4 className="dashboard-list__heading">Upcoming Deadlines</h4>
                        {systemSettings.deadlines.length > 0 ? (
                            <ul className="dashboard-list">
                                {systemSettings.deadlines
                                    .filter(d => new Date(d.date) >= new Date(new Date().setHours(0,0,0,0)))
                                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                    .slice(0, 5)
                                    .map(d => (
                                        <li
                                            key={d.id}
                                            className={`dashboard-list__item ${isWithinDeadlineWindow(d.date) ? 'dashboard-list__item--urgent' : ''}`}
                                        >
                                            <div className="dashboard-list__row">
                                                <span className="dashboard-list__name">{d.name}</span>
                                                <span className="dashboard-list__date">{formatDate(d.date)}</span>
                                            </div>
                                        </li>
                                    ))}
                            </ul>
                        ) : <p className="dashboard-empty">No upcoming deadlines.</p>}
                    </div>
                    <div>
                        <h4 className="dashboard-list__heading">NPMO Schedules</h4>
                        {activities.filter(a => a.operatingUnit === 'NPMO').length > 0 ? (
                            <ul className="dashboard-list">
                                {activities
                                    .filter(a => a.operatingUnit === 'NPMO' && new Date(a.date) >= new Date(new Date().setHours(0,0,0,0)))
                                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                    .slice(0, 5)
                                    .map(s => (
                                        <li key={s.id}>
                                            <button
                                                type="button"
                                                onClick={() => onSelectActivity(s)}
                                                className="dashboard-list__button"
                                                aria-label={`View details for ${s.name}`}
                                            >
                                                <div className="dashboard-list__row">
                                                    <span className="dashboard-list__name">{s.name}</span>
                                                    <span className="dashboard-list__date">{formatDate(s.date)}</span>
                                                </div>
                                                {s.description && (
                                                    <p className="dashboard-list__description line-clamp-2">
                                                        {s.description}
                                                    </p>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                            </ul>
                        ) : <p className="dashboard-empty">No active NPMO schedules.</p>}
                    </div>
                </div>
            </ContentCard>

            <MapCard className="dashboard-panel">
                <div className="dashboard-panel__header">
                    <div>
                        <h3 className="dashboard-panel__title">4K Map</h3>
                    </div>
                    <div className="dashboard-map-controls">
                        <span className="dashboard-map-controls__label">Show:</span>
                        <label className="dashboard-check dashboard-check--red">
                            <input type="checkbox" name="ipos" checked={mapFilters.ipos} onChange={handleMapFilterChange} />
                            <span>IPOs</span>
                        </label>
                         <label className="dashboard-check dashboard-check--blue">
                            <input type="checkbox" name="subprojects" checked={mapFilters.subprojects} onChange={handleMapFilterChange} />
                            <span>Subprojects</span>
                        </label>
                         <label className="dashboard-check dashboard-check--green">
                            <input type="checkbox" name="trainings" checked={mapFilters.trainings} onChange={handleMapFilterChange} />
                            <span>Trainings</span>
                        </label>
                    </div>
                </div>
                <MapDisplay ipos={filteredIposForMap} subprojects={filteredSubprojectsForMap} trainings={filteredTrainingsForMap} />
            </MapCard>

            <ContentCard className="dashboard-panel">
                <div className="dashboard-panel__header">
                    <div>
                        <h3 className="dashboard-panel__title">4K Calendar</h3>
                    </div>
                </div>
                <Calendar 
                    activities={filteredData.activities}
                    systemSettings={systemSettings}
                    onDateClick={handleDateClick}
                    onEventClick={handleCalendarEventClick}
                />
            </ContentCard>

            {/* Activities List Section (with Cards) */}
            <ContentCard className="dashboard-panel">
                <div className="dashboard-panel__header">
                    <div>
                        <h3 className="dashboard-panel__title">4K Activities</h3>
                    </div>
                    <div className="dashboard-activity-controls">
                        <div className="dashboard-filter dashboard-filter--compact">
                            <label htmlFor="activity-date-view">Date View</label>
                            <select
                                id="activity-date-view"
                                value={activitiesDateView}
                                onChange={(event) => setActivitiesDateView(event.target.value as ActivityDateView)}
                            >
                                <option value="Current Date">Current Date</option>
                                <option value="All">All</option>
                            </select>
                        </div>
                        <div className="dashboard-segmented">
                            <button 
                                onClick={() => setActivitiesFilter('All')} 
                                className={activitiesFilter === 'All' ? 'is-active' : ''}
                            >
                                All
                            </button>
                            <button 
                                onClick={() => setActivitiesFilter('Subprojects')} 
                                className={activitiesFilter === 'Subprojects' ? 'is-active' : ''}
                            >
                                Subprojects
                            </button>
                            <button 
                                onClick={() => setActivitiesFilter('Trainings')} 
                                className={activitiesFilter === 'Trainings' ? 'is-active' : ''}
                            >
                                Trainings
                            </button>
                        </div>
                    </div>
                </div>
                 {paginatedActivitiesList.length > 0 ? (
                 <div className="dashboard-activity-grid">
                    {paginatedActivitiesList.map(activity => (
                        <div 
                            key={`${activity.activityType}-${activity.id}`} 
                            className="dashboard-activity-card"
                            onClick={() => activity.activityType === 'Subproject' ? onSelectSubproject(activity as Subproject) : onSelectActivity(activity as Activity)}
                        >
                            <div className="dashboard-activity-card__meta">
                                <span className="dashboard-activity-card__type">{activity.activityType}</span>
                                <span className="dashboard-activity-card__date">{formatDate(activity.activityDate)}</span>
                            </div>
                            <h4>{activity.name}</h4>
                            <div className="dashboard-activity-card__context">
                                <span className="dashboard-activity-card__ou">{activity.activityOu || 'No OU'}</span>
                                <StatusIndicator status={activity.activityStatus} compact />
                            </div>
                            <p className="line-clamp-2">
                                {activity.activityType === 'Subproject' ? activity.location : activity.description}
                            </p>
                        </div>
                    ))}
                 </div>
                 ) : (
                    <EmptyState
                        title="No activities found"
                        message="Try another date view or activity type."
                    />
                 )}
                 
                 {/* Pagination Controls */}
                 {totalActivityPages > 1 && (
                     <div className="dashboard-pagination">
                         <button 
                            onClick={() => setActivitiesPage(p => Math.max(1, p - 1))}
                            disabled={activitiesPage === 1}
                         >
                             Previous
                         </button>
                         <span>
                             Page {activitiesPage} of {totalActivityPages}
                         </span>
                         <button 
                            onClick={() => setActivitiesPage(p => Math.min(totalActivityPages, p + 1))}
                            disabled={activitiesPage === totalActivityPages}
                         >
                             Next
                         </button>
                     </div>
                 )}
            </ContentCard>
        </div>
    );
};

export default Dashboard;
