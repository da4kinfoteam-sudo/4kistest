
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
import { CalendarDays, ChevronLeft, ChevronRight, Ellipsis, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
    ContentCard,
    EmptyState,
    FilterToolbar,
    MapCard,
    PageHeader,
    SectionHeading,
    StatusIndicator,
} from './ui/enterprise';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { getActivityDisplayTitle, getSubprojectIpo } from '../lib/entityIdentity';

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
            mapRef.current = L.map(mapContainerRef.current, {
                zoomAnimation: false,
                fadeAnimation: false,
                markerZoomAnimation: false
            }).setView([12.8797, 121.7740], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);
        }
        
        return () => {
            if (mapRef.current) {
                mapRef.current.stop();
                mapRef.current.off();
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

            (subprojects || []).forEach(project => {
                let coords: [number, number] | null = null;
                const linkedIpo = getSubprojectIpo(project, ipos);
                
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
                        .bindPopup(`<b>${getActivityDisplayTitle(training, [], ipos)}</b><br>Type: Training<br>Location: ${training.location}`);
                    markersRef.current.push(marker);
                }
            });

            if (markersRef.current.length > 0) {
                const group = new L.featureGroup(markersRef.current);
                mapRef.current.fitBounds(group.getBounds().pad(0.2), { animate: false });
            } else {
                 mapRef.current.setView([12.8797, 121.7740], 6); 
            }
        }
    }, [ipos, subprojects, trainings]);

    return <div ref={mapContainerRef} className="dashboard-map" />;
};


type ActivityDateView = 'Today' | 'This Week' | 'This Month' | 'This Quarter' | 'All';

type ActivityItem = (
    (Subproject & { activityType: 'Subproject' }) |
    (Activity & { activityType: 'Training' | 'Activity' })
) & {
    activityDate: string;
    activityEndDate: string;
    activityOu: string;
    activityStatus: Subproject['status'] | Activity['status'];
};

interface PanelMenuItem {
    label: string;
    onSelect: () => void;
}

const PanelActionMenu: React.FC<{ label: string; items: PanelMenuItem[] }> = ({ label, items }) => {
    const [open, setOpen] = useState(false);

    const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const menuItems = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
        if (menuItems.length === 0) return;
        event.preventDefault();
        const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? menuItems.length - 1
                : event.key === 'ArrowDown'
                    ? (currentIndex + 1) % menuItems.length
                    : (currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1);
        menuItems[nextIndex].focus();
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className="dashboard-panel-menu__trigger" aria-label={label}>
                    <Ellipsis aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="dashboard-panel-menu">
                <div role="menu" aria-label={label} onKeyDown={handleMenuKeyDown}>
                    {items.map(item => (
                        <button
                            type="button"
                            role="menuitem"
                            key={item.label}
                            onClick={() => {
                                item.onSelect();
                                setOpen(false);
                            }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

const parseLocalDate = (dateString?: string) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const startOfLocalDay = (date: Date) => {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
};

const isSameLocalDate = (left: Date | null, right: Date | null) => (
    !!left && !!right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
);

const getPeriodBounds = (view: ActivityDateView, anchor: Date) => {
    const today = startOfLocalDay(anchor);
    if (view === 'Today') return { start: today, end: today };
    if (view === 'This Week') {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start, end };
    }
    if (view === 'This Month') {
        return {
            start: new Date(today.getFullYear(), today.getMonth(), 1),
            end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
        };
    }
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    return {
        start: new Date(today.getFullYear(), quarterStartMonth, 1),
        end: new Date(today.getFullYear(), quarterStartMonth + 3, 0),
    };
};

const activityIntersectsRange = (item: ActivityItem, start: Date, end: Date) => {
    const itemStart = parseLocalDate(item.activityDate);
    const itemEnd = parseLocalDate(item.activityEndDate) || itemStart;
    if (!itemStart || !itemEnd) return false;
    return itemStart <= end && itemEnd >= start;
};

const formatFeedDate = (startDate?: string, endDate?: string) => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate) || start;
    if (!start || !end) return 'Date unavailable';
    if (isSameLocalDate(start, end)) {
        return start.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    }
    const sameYear = start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: sameYear ? undefined : 'numeric' });
    const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    return `${startLabel} – ${endLabel}`;
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
    navigateTo: (page: string) => void;
    externalFilters?: { region?: string; year?: string; search?: string } | null;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    subprojects, ipos, activities, systemSettings,
    officeReqs, staffingReqs, otherProgramExpenses,
    onSelectSubproject, onSelectActivity, navigateTo, externalFilters, onDataScopeChange
}) => {
    const { currentUser, getVisibilityScope, hasAccess } = useAuth();
    
    // Check Reports & Dashboards visibility scope
    const visibilityScope = getVisibilityScope('Dashboards');
    const isLockedToOwnOu = visibilityScope === 'Own OU';
    const defaultYear = new Date().getFullYear().toString();
    const defaultOu = isLockedToOwnOu ? (currentUser?.operatingUnit || 'All') : 'All';

    const scopeStoragePrefix = `homepage_scope_${currentUser?.id || 'anonymous'}`;
    const [selectedYear, setSelectedYear] = useLocalStorageState<string>(`${scopeStoragePrefix}_year`, defaultYear);
    const [selectedOu, setSelectedOu] = useLocalStorageState<string>(`${scopeStoragePrefix}_ou`, defaultOu);
    const [selectedTier, setSelectedTier] = useLocalStorageState<string>(`${scopeStoragePrefix}_tier`, 'Tier 1');
    const [selectedFundType, setSelectedFundType] = useLocalStorageState<string>(`${scopeStoragePrefix}_fundType`, 'Current');
    const [draftYear, setDraftYear] = useState<string>(selectedYear);
    const [draftOu, setDraftOu] = useState<string>(selectedOu);
    const [draftTier, setDraftTier] = useState<string>(selectedTier);
    const [draftFundType, setDraftFundType] = useState<string>(selectedFundType);
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
    const [activitiesDateView, setActivitiesDateView] = useState<ActivityDateView>('Today');
    const [selectedActivityDate, setSelectedActivityDate] = useState<Date | null>(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [activitiesPage, setActivitiesPage] = useState(1);
    const activitiesPanelRef = useRef<HTMLDivElement>(null);
    const itemsPerPageActivities = 6;

    // React to external filters
    useEffect(() => {
        if (externalFilters?.year) {
            setSelectedYear(externalFilters.year);
            setDraftYear(externalFilters.year);
        }
    }, [externalFilters?.year]);

    // ... (Filter Effects and Calculations remain same) ...

    useEffect(() => {
        if (!isLockedToOwnOu) return;
        const lockedOu = currentUser?.operatingUnit || 'All';
        setSelectedOu(lockedOu);
        setDraftOu(lockedOu);
    }, [currentUser?.operatingUnit, isLockedToOwnOu]);

    const hasPendingFilterChanges = draftYear !== selectedYear
        || draftOu !== selectedOu
        || draftTier !== selectedTier
        || draftFundType !== selectedFundType;
    const filtersAreAtDefaults = selectedYear === defaultYear
        && selectedOu === defaultOu
        && selectedTier === 'Tier 1'
        && selectedFundType === 'Current'
        && draftYear === defaultYear
        && draftOu === defaultOu
        && draftTier === 'Tier 1'
        && draftFundType === 'Current';

    const applyFilters = () => {
        setSelectedYear(draftYear);
        setSelectedOu(isLockedToOwnOu ? defaultOu : draftOu);
        setSelectedTier(draftTier);
        setSelectedFundType(draftFundType);
    };

    const resetFilters = () => {
        setDraftYear(defaultYear);
        setDraftOu(defaultOu);
        setDraftTier('Tier 1');
        setDraftFundType('Current');
        setSelectedYear(defaultYear);
        setSelectedOu(defaultOu);
        setSelectedTier('Tier 1');
        setSelectedFundType('Current');
    };

    const handleMapFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setMapFilters(prev => ({ ...prev, [name]: checked }));
    };

    const handleDateClick = (date: Date, events: CalendarEvent[]) => {
        const selectedDate = startOfLocalDay(date);
        setSelectedActivityDate(selectedDate);
        setActivitiesPage(1);

        const nonFeedEvents = events.filter(event => !event.originalData);
        if (nonFeedEvents.length > 0) {
            setDayModalData({ date: selectedDate, items: nonFeedEvents });
        } else {
            setDayModalData(null);
        }

        if (window.matchMedia('(max-width: 1279px)').matches) {
            window.requestAnimationFrame(() => {
                activitiesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    const handleActivityDateViewChange = (view: ActivityDateView) => {
        setActivitiesDateView(view);
        setSelectedActivityDate(null);
        setActivitiesPage(1);
    };

    const handleCalendarToday = () => {
        setCalendarMonth(new Date());
        setSelectedActivityDate(null);
        setActivitiesDateView('Today');
        setActivitiesPage(1);
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
                activityEndDate: p.estimatedCompletionDate || '',
                activityOu: p.operatingUnit,
                activityStatus: p.status,
            })),
            ...filteredData.activities.map(a => {
                const isCompleted = a.status === 'Completed' || !!a.actualDate;
                const startDate = isCompleted && a.actualDate ? a.actualDate : a.date;
                const endDate = isCompleted && a.actualDate
                    ? (a.actualEndDate || a.actualDate)
                    : (a.endDate || a.date);
                return {
                    ...a,
                    activityType: a.type as 'Training' | 'Activity',
                    activityDate: startDate || '',
                    activityEndDate: endDate || startDate || '',
                    activityOu: a.operatingUnit,
                    activityStatus: a.status,
                };
            }),
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
        if (selectedActivityDate) {
            items = items.filter(item => activityIntersectsRange(item, selectedActivityDate, selectedActivityDate));
        } else if (activitiesDateView !== 'All') {
            const bounds = getPeriodBounds(activitiesDateView, new Date());
            items = items.filter(item => activityIntersectsRange(item, bounds.start, bounds.end));
        }
        return items;
    }, [allActivities, activitiesFilter, activitiesDateView, selectedActivityDate]);

    useEffect(() => {
        setActivitiesPage(1);
    }, [activitiesFilter, activitiesDateView, selectedActivityDate, displayedActivities.length]);
    
    const paginatedActivitiesList = useMemo(() => {
        const startIndex = (activitiesPage - 1) * itemsPerPageActivities;
        return displayedActivities.slice(startIndex, startIndex + itemsPerPageActivities);
    }, [displayedActivities, activitiesPage]);

    const totalActivityPages = Math.ceil(displayedActivities.length / itemsPerPageActivities);
    const activityRangeStart = displayedActivities.length === 0 ? 0 : (activitiesPage - 1) * itemsPerPageActivities + 1;
    const activityRangeEnd = Math.min(activitiesPage * itemsPerPageActivities, displayedActivities.length);

    const upcomingDeadlines = useMemo(() => {
        const today = startOfLocalDay(new Date());
        return (systemSettings.deadlines || [])
            .filter(deadline => {
                const date = parseLocalDate(deadline.date);
                return !!date && date >= today;
            })
            .sort((left, right) => (parseLocalDate(left.date)?.getTime() || 0) - (parseLocalDate(right.date)?.getTime() || 0))
            .slice(0, 5);
    }, [systemSettings.deadlines]);

    const npmoSchedules = useMemo(() => {
        const today = startOfLocalDay(new Date());
        return activities
            .filter(activity => {
                const date = parseLocalDate(activity.date);
                return activity.operatingUnit === 'NPMO' && !!date && date >= today;
            })
            .sort((left, right) => (parseLocalDate(left.date)?.getTime() || 0) - (parseLocalDate(right.date)?.getTime() || 0))
            .slice(0, 5);
    }, [activities]);

    const canManageDeadlines = currentUser?.role !== 'Guest'
        && (hasAccess('System Management', 'view')
            || currentUser?.role === 'Administrator'
            || currentUser?.role === 'Super Admin');
    
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

    const getBudgetValue = (bucket: { obli: number; disb: number }, view: 'Obligated' | 'Disbursed') => (
        view === 'Obligated' ? bucket.obli : bucket.disb
    );
    const totalBudgetValue = getBudgetValue(dashboardStats.financials.total, totalBudgetView);
    const subprojectsBudgetValue = getBudgetValue(dashboardStats.financials.subprojects, spBudgetView);
    const trainingsBudgetValue = getBudgetValue(dashboardStats.financials.trainings, trBudgetView);
    const selectedYearLabel = selectedYear === 'All' ? 'All fund years' : `FY ${selectedYear}`;

    return (
        <div className="dashboard-page">
            {/* Card Detail Modal */}
            {cardModal && (
                <div
                    className="modal-backdrop animate-fadeIn"
                    onClick={() => setCardModal(null)}
                    role="presentation"
                >
                    <section
                        className="modal-card dashboard-card-modal"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dashboard-card-dialog-title"
                    >
                        <header className="modal-card__header">
                            <h3 id="dashboard-card-dialog-title">{cardModal.title}</h3>
                            <button type="button" onClick={() => setCardModal(null)} className="modal-card__close" aria-label="Close details">&times;</button>
                        </header>
                        <div className="modal-card__body dashboard-card-modal__body custom-scrollbar">
                            <div className="dashboard-modal__stack">
                                {cardModal.metrics.map(metric => (
                                    <div key={metric.label} className="dashboard-modal__metric">
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
                    </section>
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
                                    className="dashboard-modal__event"
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
                className="dashboard-page-header"
                title="4K Information System Overview"
                metadata="Program performance, schedules, mapped activities, and delivery progress."
            />

            <FilterToolbar
                className="dashboard-filter-bar"
                actions={(
                    <>
                        <button type="button" className="btn btn-secondary btn-compact" onClick={resetFilters} disabled={filtersAreAtDefaults}>
                            Reset
                        </button>
                        <button type="button" className="btn btn-primary btn-compact" onClick={applyFilters} disabled={!hasPendingFilterChanges}>
                            Apply
                        </button>
                    </>
                )}
            >
                     <div className="dashboard-filter">
                        <label htmlFor="ou-filter">Operating Unit</label>
                        <select 
                            id="ou-filter"
                            value={draftOu}
                            onChange={(e) => setDraftOu(e.target.value)}
                            disabled={isLockedToOwnOu}
                        >
                            <option value="All">All Operating Units</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="fund-type-filter">Fund Type</label>
                        <select 
                            id="fund-type-filter"
                            value={draftFundType}
                            onChange={(e) => setDraftFundType(e.target.value)}
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="tier-filter">Tier</label>
                        <select
                            id="tier-filter"
                            value={draftTier}
                            onChange={(e) => setDraftTier(e.target.value)}
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dashboard-filter">
                        <label htmlFor="year-filter">Fund Year</label>
                        <select 
                            id="year-filter"
                            value={draftYear}
                            onChange={(e) => setDraftYear(e.target.value)}
                        >
                            <option value="All">All Fund Years</option>
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
            </FilterToolbar>

            <div className="dashboard-metric-grid">
                <StatCard 
                    title="Total Budget"
                    value={formatCurrency(totalBudgetValue)}
                    icon={<FinancialsIcon />} 
                    supportingText={`${selectedYearLabel} · ${totalBudgetView}`}
                    onClick={showTotalBudget}
                    onToggle={() => setTotalBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                    toggleLabel={totalBudgetView}
                    toggleAriaLabel={`Switch Total Budget to ${totalBudgetView === 'Obligated' ? 'Disbursed' : 'Obligated'} view`}
                />
                <StatCard 
                    title="Budget · Subprojects"
                    value={formatCurrency(subprojectsBudgetValue)}
                    icon={<FinancialsIcon />} 
                    supportingText={`${formatRate(subprojectsBudgetValue, getBudgetValue(dashboardStats.financials.total, spBudgetView))} of total`}
                    onClick={showSpBudget}
                    onToggle={() => setSpBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                    toggleLabel={spBudgetView}
                    toggleAriaLabel={`Switch Subprojects Budget to ${spBudgetView === 'Obligated' ? 'Disbursed' : 'Obligated'} view`}
                />
                <StatCard 
                    title="Budget · Trainings"
                    value={formatCurrency(trainingsBudgetValue)}
                    icon={<FinancialsIcon />} 
                    supportingText={`${formatRate(trainingsBudgetValue, getBudgetValue(dashboardStats.financials.total, trBudgetView))} of total`}
                    onClick={showTrBudget}
                    onToggle={() => setTrBudgetView(prev => prev === 'Obligated' ? 'Disbursed' : 'Obligated')}
                    toggleLabel={trBudgetView}
                    toggleAriaLabel={`Switch Trainings Budget to ${trBudgetView === 'Obligated' ? 'Disbursed' : 'Obligated'} view`}
                />
                <StatCard title="Subprojects Completed" value={dashboardStats.physical.subprojects.actual.toString()} icon={<ProjectsIcon />} supportingText={`of ${dashboardStats.physical.subprojects.target} target`} onClick={showSpCount} />
                <StatCard title="Trainings Completed" value={dashboardStats.physical.trainings.actual.toString()} icon={<TrainingIcon />} supportingText={`of ${dashboardStats.physical.trainings.target} target`} onClick={showTrCount} />
                <StatCard title="IPOs Assisted" value={dashboardStats.physical.iposAssisted.actual.toString()} icon={<IpoIcon />} supportingText={`of ${dashboardStats.physical.iposAssisted.target} target`} onClick={showIposAssisted} />
                <StatCard title="IPOs With Subprojects" value={dashboardStats.physical.iposWithSp.actual.toString()} icon={<IpoIcon />} supportingText={`${formatRate(dashboardStats.physical.iposWithSp.actual, dashboardStats.physical.iposWithSp.target)} coverage`} onClick={showIposWithSp} />
                <StatCard title="Ancestral Domains Assisted" value={dashboardStats.physical.adsAssisted.actual.toString()} icon={<AdIcon />} supportingText={`of ${dashboardStats.physical.adsAssisted.target} target`} onClick={showAdsAssisted} />
            </div>

            <div className="dashboard-home-grid">
            <ContentCard className="dashboard-panel dashboard-panel--schedule">
                <SectionHeading
                    title="System Schedule"
                    helper="Deadlines & NPMO calendar"
                    actions={(
                        <PanelActionMenu
                            label="System Schedule menu"
                            items={[
                                { label: 'View all activities', onSelect: () => navigateTo('/activities') },
                                ...(canManageDeadlines
                                    ? [{ label: 'Manage deadlines', onSelect: () => navigateTo('/settings?tab=system') }]
                                    : []),
                            ]}
                        />
                    )}
                />
                <div className="dashboard-schedule-grid">
                    <div>
                        <h4 className="dashboard-list__heading">Upcoming Deadlines</h4>
                        {upcomingDeadlines.length > 0 ? (
                            <ul className="dashboard-list">
                                {upcomingDeadlines.map(deadline => (
                                    <li
                                        key={deadline.id}
                                        className={`dashboard-list__item dashboard-deadline-row ${isWithinDeadlineWindow(deadline.date) ? 'dashboard-list__item--urgent' : ''}`}
                                    >
                                        <span className="dashboard-deadline-row__icon" aria-hidden="true">
                                            <CalendarDays />
                                        </span>
                                        <span className="dashboard-deadline-row__content">
                                            <span className="dashboard-list__name">{deadline.name}</span>
                                        </span>
                                        <time className="dashboard-list__date" dateTime={deadline.date}>{formatFeedDate(deadline.date, deadline.date)}</time>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="dashboard-empty">No upcoming deadlines.</p>}
                    </div>
                    <div>
                        <h4 className="dashboard-list__heading">NPMO Schedules</h4>
                        {npmoSchedules.length > 0 ? (
                            <ul className="dashboard-list dashboard-list--npmo">
                                {npmoSchedules.map(schedule => (
                                    <li key={schedule.id}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectActivity(schedule)}
                                            className="dashboard-list__button dashboard-npmo-row"
                                            aria-label={`View details for ${schedule.name}`}
                                        >
                                            <span className="dashboard-list__name">{schedule.name}</span>
                                            <span className="dashboard-list__description">
                                                {[formatFeedDate(schedule.date, schedule.endDate || schedule.date), schedule.location].filter(Boolean).join(' · ')}
                                            </span>
                                            {schedule.description && (
                                                <span className="dashboard-list__description dashboard-list__description--detail">
                                                    {schedule.description}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="dashboard-empty">No active NPMO schedules.</p>}
                    </div>
                </div>
            </ContentCard>

            <MapCard className="dashboard-panel dashboard-panel--map">
                <SectionHeading
                    title="4K Map"
                    helper="Geographic view of program interventions"
                    actions={<div className="dashboard-map-controls" aria-label="Map layers">
                        <span className="dashboard-map-controls__label">Show</span>
                        <label className={`dashboard-check dashboard-check--red ${mapFilters.ipos ? 'is-active' : ''}`}>
                            <input type="checkbox" name="ipos" checked={mapFilters.ipos} onChange={handleMapFilterChange} />
                            <span>IPOs</span>
                        </label>
                         <label className={`dashboard-check dashboard-check--blue ${mapFilters.subprojects ? 'is-active' : ''}`}>
                            <input type="checkbox" name="subprojects" checked={mapFilters.subprojects} onChange={handleMapFilterChange} />
                            <span>Subprojects</span>
                        </label>
                         <label className={`dashboard-check dashboard-check--green ${mapFilters.trainings ? 'is-active' : ''}`}>
                            <input type="checkbox" name="trainings" checked={mapFilters.trainings} onChange={handleMapFilterChange} />
                            <span>Trainings</span>
                        </label>
                    </div>}
                />
                <MapDisplay ipos={filteredIposForMap} subprojects={filteredSubprojectsForMap} trainings={filteredTrainingsForMap} />
            </MapCard>
            </div>

            <div className="dashboard-home-grid">
            <ContentCard className="dashboard-panel dashboard-panel--calendar">
                <SectionHeading
                    title="4K Calendar"
                    helper="Activities and deadlines"
                    actions={(
                        <PanelActionMenu
                            label="4K Calendar menu"
                            items={[
                                { label: 'Go to today', onSelect: handleCalendarToday },
                                { label: 'View all activities', onSelect: () => navigateTo('/activities') },
                            ]}
                        />
                    )}
                />
                <Calendar 
                    activities={filteredData.activities}
                    systemSettings={systemSettings}
                    onDateClick={handleDateClick}
                    onEventClick={handleCalendarEventClick}
                    selectedDate={selectedActivityDate}
                    visibleMonth={calendarMonth}
                    onVisibleMonthChange={setCalendarMonth}
                    onToday={handleCalendarToday}
                    compact
                />
            </ContentCard>

            <ContentCard className="dashboard-panel dashboard-panel--activities">
                <div ref={activitiesPanelRef} className="dashboard-activities-scroll-anchor" />
                <SectionHeading
                    title="4K Activities"
                    helper="Field & operational activity feed"
                    actions={<div className="dashboard-activity-header-actions">
                        <div className="dashboard-activity-controls">
                            <select
                                id="activity-date-view"
                                className="dashboard-activity-period"
                                aria-label="Activity period"
                                value={activitiesDateView}
                                onChange={(event) => handleActivityDateViewChange(event.target.value as ActivityDateView)}
                            >
                                <option value="Today">Today</option>
                                <option value="This Week">This week</option>
                                <option value="This Month">This month</option>
                                <option value="This Quarter">This quarter</option>
                                <option value="All">All</option>
                            </select>
                        <div className="dashboard-segmented" role="group" aria-label="Activity type">
                            <button 
                                type="button"
                                onClick={() => setActivitiesFilter('All')} 
                                className={activitiesFilter === 'All' ? 'is-active' : ''}
                                aria-pressed={activitiesFilter === 'All'}
                            >
                                All
                            </button>
                            <button 
                                type="button"
                                onClick={() => setActivitiesFilter('Subprojects')} 
                                className={activitiesFilter === 'Subprojects' ? 'is-active' : ''}
                                aria-pressed={activitiesFilter === 'Subprojects'}
                            >
                                Subprojects
                            </button>
                            <button 
                                type="button"
                                onClick={() => setActivitiesFilter('Trainings')} 
                                className={activitiesFilter === 'Trainings' ? 'is-active' : ''}
                                aria-pressed={activitiesFilter === 'Trainings'}
                            >
                                Trainings
                            </button>
                        </div>
                        </div>
                        <PanelActionMenu
                            label="4K Activities menu"
                            items={[
                                { label: 'View all activities', onSelect: () => navigateTo('/activities') },
                                { label: 'View subprojects', onSelect: () => navigateTo('/subprojects') },
                            ]}
                        />
                    </div>}
                />
                {selectedActivityDate && (
                    <div className="dashboard-selected-date" role="status">
                        <CalendarDays aria-hidden="true" />
                        <span>Selected: {selectedActivityDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        <button type="button" onClick={() => setSelectedActivityDate(null)} aria-label="Clear selected calendar date">
                            <X aria-hidden="true" />
                        </button>
                    </div>
                )}
                 {paginatedActivitiesList.length > 0 ? (
                 <div className="dashboard-activity-feed">
                    {paginatedActivitiesList.map(activity => {
                        const typeCode = activity.activityType === 'Subproject' ? 'SP' : activity.activityType === 'Training' ? 'TR' : 'AC';
                        const activityCode = activity.uid || `${typeCode}-${activity.id}`;
                        return (
                            <button
                                type="button"
                                key={`${activity.activityType}-${activity.id}`}
                                className="dashboard-activity-card"
                                onClick={() => activity.activityType === 'Subproject' ? onSelectSubproject(activity as Subproject) : onSelectActivity(activity as Activity)}
                            >
                                <span className={`dashboard-activity-card__type-tile dashboard-activity-card__type-tile--${typeCode.toLowerCase()}`} aria-hidden="true">
                                    {typeCode}
                                </span>
                                <span className="dashboard-activity-card__content">
                                    <span className="dashboard-activity-card__meta">
                                        <span className="dashboard-activity-card__code">{activityCode}</span>
                                        <StatusIndicator status={activity.activityStatus} compact />
                                    </span>
                                    <span className="dashboard-activity-card__title">
                                        {activity.activityType === 'Subproject'
                                            ? activity.name
                                            : getActivityDisplayTitle(activity as Activity, [], ipos)}
                                    </span>
                                    <span className="dashboard-activity-card__details">
                                        {activity.activityOu || 'No OU'} · {formatFeedDate(activity.activityDate, activity.activityEndDate)}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                 </div>
                 ) : (
                    <EmptyState
                        title="No activities found"
                        message="Try another date view or activity type."
                    />
                 )}
                 
                 {/* Pagination Controls */}
                 {displayedActivities.length > 0 && (
                     <div className="dashboard-pagination">
                         <span className="dashboard-pagination__summary">
                             {activityRangeStart}–{activityRangeEnd} of {displayedActivities.length} activities
                         </span>
                         <div className="dashboard-pagination__controls">
                         <button
                            type="button"
                            onClick={() => setActivitiesPage(p => Math.max(1, p - 1))}
                            disabled={activitiesPage === 1}
                            aria-label="Previous activities page"
                         >
                             <ChevronLeft aria-hidden="true" />
                         </button>
                         <span>
                             {activitiesPage} / {totalActivityPages}
                         </span>
                         <button
                            type="button"
                            onClick={() => setActivitiesPage(p => Math.min(totalActivityPages, p + 1))}
                            disabled={activitiesPage === totalActivityPages}
                            aria-label="Next activities page"
                         >
                             <ChevronRight aria-hidden="true" />
                         </button>
                         </div>
                     </div>
                 )}
            </ContentCard>
            </div>
        </div>
    );
};

export default Dashboard;
