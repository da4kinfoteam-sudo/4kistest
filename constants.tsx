
export interface TrashItem {
    id: number;
    entity_type: string;
    original_id: number;
    data: any;
    deleted_by: string;
    deleted_at: string;
}

// Author: 4K 
import React from 'react';

// Icons
export const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const TrainingIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

export const IpoIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" />
    </svg>
);

export const ProjectsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

export const ActivitiesIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);

export const ManagementIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);

export const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

export const AccomplishmentIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

// Types
export interface BaseEntity {
    id: number;
    workflow_status?: WorkflowStatus;
    created_at?: string;
    updated_at?: string;
    physical_accomplishment_submitted_at?: string | null;
    deleted_at?: string; // For soft deletes
}

export type UserRole = 'Super Admin' | 'Administrator' | 'Guest' | 'Focal - User' | 'RFO - User' | 'User' | 'Management';
export type VisibilityScope = 'All OUs' | 'Own OU';
export type WorkflowStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RoleConfig {
    id?: number;
    role: string;
    module: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    visibility_scope?: VisibilityScope;
}

export const appModules = [
    'Dashboards',
    'Reports',
    'Subprojects',
    'Activities',
    'Program Management',
    'Accomplishment - Financial',
    'Accomplishment - Physical',
    'IPO Management',
    'Marketing Database',
    'Level of Development',
    'Commodity Mapping',
    'References',
    'System Management'
];

export interface User extends BaseEntity {
    username: string;
    fullName: string;
    email: string;
    role: UserRole;
    operatingUnit: string;
    visibility_scope?: VisibilityScope;
    assigned_focal_id?: number | string;
    requires_approver?: boolean;
    approver_id?: number | null;
    permissions_override?: any; // JSONB toggles
    password?: string;
}

export const tiers = ['Tier 1', 'Tier 2'] as const;
export type Tier = typeof tiers[number];

export const fundTypes = ['Current', 'Continuing', 'Insertion'] as const;
export type FundType = typeof fundTypes[number];

export const filterYears = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028'];

export const objectTypes = ['MOOE', 'CO'] as const;
export type ObjectType = typeof objectTypes[number];

export type ActivityComponentType = 'Social Preparation' | 'Production and Livelihood' | 'Marketing and Enterprise' | 'Program Management';

export interface HistoryEntry {
    date: string;
    event: string;
    user: string;
}

export interface ObligationRecord {
    id: number;
    amount: number;
    date: string;
    remarks?: string;
}

export interface DisbursementRecord {
    id: number;
    amount: number;
    date: string;
    remarks?: string;
}

export interface SubprojectDetail {
    id: number;
    type: string;
    particulars: string;
    deliveryDate: string;
    unitOfMeasure: string;
    pricePerUnit: number;
    numberOfUnits: number;
    objectType: ObjectType;
    expenseParticular: string;
    uacsCode: string;
    obligationMonth: string;
    disbursementMonth: string;
    actualDeliveryDate?: string;
    actualNumberOfUnits?: number;
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualAmount?: number; // Legacy total
    actualObligationAmount?: number; // New split field
    actualDisbursementAmount?: number; // New split field
    obligations?: ObligationRecord[];
    disbursements?: DisbursementRecord[];
    isCompleted?: boolean;
    isCancelled?: boolean;
    isRealignment?: boolean;
    isSavings?: boolean;
    originalPlannedAmount?: number;
    originalPricePerUnit?: number;
    originalNumberOfUnits?: number;
    originalCapturedAt?: string;
    sourceItemId?: number | string | null;
    adjustmentReason?: string | null;
}

export interface SubprojectCommodity {
    typeName: string;
    name: string;
    area: number; // or heads
    averageYield?: number;
    actualYield?: number;
    marketingPercentage?: number;
    foodSecurityPercentage?: number;
    income?: number;
}

export interface Subproject extends BaseEntity {
    uid: string;
    name: string;
    location: string;
    indigenousPeopleOrganization: string;
    ipo_id?: number;
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
    details: SubprojectDetail[];
    subprojectCommodities?: SubprojectCommodity[];
    packageType: string;
    startDate: string;
    estimatedCompletionDate: string;
    actualCompletionDate?: string;
    lat?: number;
    lng?: number;
    fundingYear?: number;
    fundType?: FundType;
    isRealignment?: boolean;
    isSavings?: boolean;
    tier?: Tier;
    operatingUnit: string;
    encodedBy: string;
    history?: HistoryEntry[];
    remarks?: string;
    catchUpPlanRemarks?: string;
    newTargetCompletionDate?: string;
    // Gender and Inclusivity Actuals
    actualPWD?: number;
    actualMuslim?: number;
    actualLGBTQ?: number;
    actualSoloParent?: number;
    actualSenior?: number;
    actualYouth?: number;
}

export interface Commodity {
    type: string;
    particular: string;
    value: number;
    yield?: number;
    isScad?: boolean;
    marketingPercentage?: number;
    foodSecurityPercentage?: number;
    averageIncome?: number;
}

export interface IPO extends BaseEntity {
    name: string;
    location: string;
    region: string;
    indigenousCulturalCommunity: string;
    ancestralDomainNo: string;
    registeringBody: string;
    contactPerson: string;
    contactNumber: string;
    registrationDate: string | null;
    isWomenLed: boolean;
    isWithinGida: boolean;
    isWithinElcac: boolean;
    isWithScad: boolean;
    commodities: Commodity[];
    levelOfDevelopment: 1 | 2 | 3 | 4 | 5;
    totalMembers: number;
    totalIpMembers: number;
    totalMaleMembers: number;
    totalFemaleMembers: number;
    totalYouthMembers: number;
    totalSeniorMembers: number;
    total4PsMembers: number;
    lat?: number;
    lng?: number;
}

export interface ActivityExpense {
    id: number;
    objectType: ObjectType;
    expenseParticular: string;
    uacsCode: string;
    obligationMonth: string;
    disbursementMonth: string;
    amount: number;
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualAmount?: number;
    actualObligationAmount?: number;
    actualDisbursementAmount?: number;
    obligations?: ObligationRecord[];
    disbursements?: DisbursementRecord[];
    isCancelled?: boolean;
    isRealignment?: boolean;
    isSavings?: boolean;
    originalPlannedAmount?: number;
    originalPricePerUnit?: number;
    originalNumberOfUnits?: number;
    originalCapturedAt?: string;
    sourceItemId?: number | string | null;
    adjustmentReason?: string | null;
}

export interface Activity extends BaseEntity {
    uid?: string;
    type: 'Training' | 'Activity'; // Database Discriminator
    reference_activity_id?: number | string | null;
    activity_title?: string | null;
    name: string;
    date: string; // Start Date
    endDate?: string; // End Date (Optional, same as date if single day)
    description: string;
    location: string;
    facilitator?: string; // Specific to Training
    participatingIpos: string[];
    participating_ipo_ids?: number[]; // Foreign Keys for participating IPOs
    lat?: number;
    lng?: number;
    participantsMale: number;
    participantsFemale: number;
    expenses: ActivityExpense[];
    component: ActivityComponentType;
    fundingYear?: number;
    fundType?: FundType;
    isRealignment?: boolean;
    isSavings?: boolean;
    tier?: Tier;
    operatingUnit: string;
    encodedBy: string;
    history?: HistoryEntry[];
    // Catch Up Plan
    catchUpPlanRemarks?: string;
    newTargetDate?: string;
    // Accomplishment Fields
    actualDate?: string;
    actualEndDate?: string;
    actualParticipantsMale?: number;
    actualParticipantsFemale?: number;
    // Gender and Inclusivity Actuals
    actualPWD?: number;
    actualMuslim?: number;
    actualLGBTQ?: number;
    actualSoloParent?: number;
    actualSenior?: number;
    actualYouth?: number;
    // Status
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
}

// Aliases for compatibility
export type Training = Activity;
export type OtherActivity = Activity;
export type OtherActivityExpense = ActivityExpense;
export type OtherActivityComponentType = ActivityComponentType;
export type TrainingComponentType = ActivityComponentType;

export interface BaseProgramManagementItem extends BaseEntity {
    id: number;
    uid: string;
    operatingUnit: string;
    uacsCode: string;
    obligationDate: string;
    disbursementDate: string;
    physicalDeliveryDate?: string;
    fundType: FundType;
    isRealignment?: boolean;
    isSavings?: boolean;
    fundYear: number;
    tier: Tier;
    encodedBy: string;
    // Accomlishment Fields
    actualDate?: string;
    actualAmount?: number;
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualObligationAmount?: number;
    actualDisbursementAmount?: number;
    obligations?: ObligationRecord[];
    disbursements?: DisbursementRecord[];
}

export interface OfficeRequirement extends BaseProgramManagementItem {
    equipment: string;
    specs: string;
    purpose: string;
    numberOfUnits: number;
    pricePerUnit: number;
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
}

export interface StaffingExpense {
    id: number;
    objectType: ObjectType;
    expenseParticular: string;
    uacsCode: string;
    obligationDate: string;
    amount: number;
    disbursementJan?: number;
    disbursementFeb?: number;
    disbursementMar?: number;
    disbursementApr?: number;
    disbursementMay?: number;
    disbursementJun?: number;
    disbursementJul?: number;
    disbursementAug?: number;
    disbursementSep?: number;
    disbursementOct?: number;
    disbursementNov?: number;
    disbursementDec?: number;
    // Actuals
    actualObligationAmount?: number;
    actualObligationDate?: string;
    actualDisbursementAmount?: number;
    actualDisbursementDate?: string;
    obligations?: ObligationRecord[];
    disbursements?: DisbursementRecord[];
    // Actual Monthly Disbursement
    actualDisbursementJan?: number;
    actualDisbursementFeb?: number;
    actualDisbursementMar?: number;
    actualDisbursementApr?: number;
    actualDisbursementMay?: number;
    actualDisbursementJun?: number;
    actualDisbursementJul?: number;
    actualDisbursementAug?: number;
    actualDisbursementSep?: number;
    actualDisbursementOct?: number;
    actualDisbursementNov?: number;
    actualDisbursementDec?: number;
    isCancelled?: boolean;
    isRealignment?: boolean;
    isSavings?: boolean;
    originalPlannedAmount?: number;
    originalPricePerUnit?: number;
    originalNumberOfUnits?: number;
    originalCapturedAt?: string;
    sourceItemId?: number | string | null;
    adjustmentReason?: string | null;
}

export interface StaffingRequirement extends BaseProgramManagementItem {
    personnelPosition: string;
    component: ActivityComponentType; // Added field
    status: string; // Employment Status (Permanent, Contractual, etc.)
    salaryGrade: number;
    annualSalary: number;
    personnelType: 'Technical' | 'Administrative' | 'Support';
    expenses?: StaffingExpense[]; // Nested structure for multiple object codes
    hiringStatus: 'Proposed' | 'Filled' | 'Unfilled'; // Workflow Status
    // Target Disbursement (Legacy/Aggregate)
    disbursementJan?: number;
    disbursementFeb?: number;
    disbursementMar?: number;
    disbursementApr?: number;
    disbursementMay?: number;
    disbursementJun?: number;
    disbursementJul?: number;
    disbursementAug?: number;
    disbursementSep?: number;
    disbursementOct?: number;
    disbursementNov?: number;
    disbursementDec?: number;
    // Actual Disbursement (Legacy/Aggregate)
    actualDisbursementJan?: number;
    actualDisbursementFeb?: number;
    actualDisbursementMar?: number;
    actualDisbursementApr?: number;
    actualDisbursementMay?: number;
    actualDisbursementJun?: number;
    actualDisbursementJul?: number;
    actualDisbursementAug?: number;
    actualDisbursementSep?: number;
    actualDisbursementOct?: number;
    actualDisbursementNov?: number;
    actualDisbursementDec?: number;
}

export interface OtherProgramExpense extends BaseProgramManagementItem {
    particulars: string;
    amount: number;
    obligatedAmount?: number;
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
    disbursementJan?: number;
    disbursementFeb?: number;
    disbursementMar?: number;
    disbursementApr?: number;
    disbursementMay?: number;
    disbursementJun?: number;
    disbursementJul?: number;
    disbursementAug?: number;
    disbursementSep?: number;
    disbursementOct?: number;
    disbursementNov?: number;
    disbursementDec?: number;
    // Monthly Disbursement Schedule (Actual)
    actualDisbursementJan?: number;
    actualDisbursementFeb?: number;
    actualDisbursementMar?: number;
    actualDisbursementApr?: number;
    actualDisbursementMay?: number;
    actualDisbursementJun?: number;
    actualDisbursementJul?: number;
    actualDisbursementAug?: number;
    actualDisbursementSep?: number;
    actualDisbursementOct?: number;
    actualDisbursementNov?: number;
    actualDisbursementDec?: number;
}

// NEW: Marketing Partner
export interface CommodityNeed {
    id: number | string;
    name: string;
    type: string; // Add Type
    sourceRegion: string; // Add Region selection
    sourceProvince: string;
    qualityStandard: string;
    volumeJan: number;
    volumeFeb: number;
    volumeMar: number;
    volumeApr: number;
    volumeMay: number;
    volumeJun: number;
    volumeJul: number;
    volumeAug: number;
    volumeSep: number;
    volumeOct: number;
    volumeNov: number;
    volumeDec: number;
}

export const marketLinkageUnits = ['KG', 'PCS', 'sack', 'bundle', 'box', 'crate', 'head'] as const;
export type MarketLinkageUnit = typeof marketLinkageUnits[number];

export interface MarketLinkage {
    id: number | string;
    region: string;
    ipoId?: number | null;
    ipoName: string;
    commodityNeedId: string | number | null;
    commodityName: string;
    commodityType: string;
    negotiationStatus: 'Agreed' | 'Contract Signed' | 'Pending Test Buy';
    unitOfMeasure?: MarketLinkageUnit;
    agreedQuantityValue: number;
    agreedQuantityTimeframe: 'Per Week' | 'Monthly' | 'One-time Transaction';
    agreedPricePerKg: number;
    agreementType: 'Verbal' | 'Contract' | 'Warehouse Delivery Receipt';
    agreementDate: string;
    testBuyConducted: boolean;
    testBuyDate?: string;
    testBuyQuantity?: number;
    testBuyFeedback?: string;
}

export interface MarketingPartner extends BaseEntity {
    uid: string;
    companyName: string;
    ownerName: string;
    contactNumber: string;
    email: string;
    location: string;
    region: string;
    commodityNeeds: CommodityNeed[]; 
    buyerType: 'Private Company' | 'Government';
    paymentMethods: string[]; 
    linkedIpoNames: string[]; 
    remarks?: string;
    encodedBy: string;
    history?: HistoryEntry[]; // Added for tracking updates/deals
    marketingLinkages?: MarketLinkage[]; // Added for actual established linkages
}

export interface Deadline {
    id: number;
    name: string;
    date: string;
}

export interface PlanningSchedule {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
}

export interface SystemSettings {
    deadlines: Deadline[];
}

export const defaultSystemSettings: SystemSettings = {
    deadlines: [
        { id: 1, name: "Budget Proposal Submission", date: "2024-03-31" }
    ]
};

// References Interfaces
export interface ReferenceUacs {
    id: string;
    objectType: string;
    particular: string;
    uacsCode: string;
    description: string;
}

export interface ReferenceParticular {
    id: string;
    type: string;
    particular: string;
}

export interface ReferenceCommodity {
    id: string;
    type: string;
    particular: string;
}

export interface RefCommodity {
    id: string;
    name: string;
    banner_program: string;
    commodity_group: string;
    min_elevation_masl: number;
    max_elevation_masl: number;
    max_slope_percent: number;
    wet_season_start: string;
    dry_season_start: string;
    recommended_soil: string;
    fertilizer_npk: string;
    watering_method: string;
    harvest_period_days: number;
    ph_min: number;
    ph_max: number;
    climate_type_suitability: string;
    target_yield_ha: number;
}

export interface RefLivestock {
    id: string;
    name: string;
    category: 'Poultry' | 'Ruminant' | 'Swine' | 'Small Livestock';
    breed_type: string;
    min_space_sqm_per_head: number;
    housing_type: string;
    min_temp_celsius: number;
    max_temp_celsius: number;
    gestation_incubation_days: number;
    maturity_days: number;
    productive_years: number;
    feed_type: string;
    target_fcr: number;
    water_liters_per_day: number;
    target_weight_kg: number;
    avg_eggs_per_year: number;
}

export interface RefEquipment {
    id: string;
    name: string;
    category: string;
    equipment_type: string;
    power_source: string;
    capacity_rating: string;
    fuel_consumption_rate: number;
    estimated_useful_life_years: number;
    unit_cost_estimate: number;
    maintenance_interval_months: number;
    required_operators: number;
    safety_gear_required: string;
}

export interface RefInput {
    id: string;
    input_type: string;
    sub_type: string;
    name: string;
    standard_uom: string;
    avg_price_2026: number;
    fpa_registration_no: string;
    shelf_life_months: number;
    application_rate_per_ha: number;
    hazchem_rating: string;
}

export interface RefInfrastructure {
    id: string;
    name: string;
    category: string;
    structure_type: string;
    capacity_rating: string;
    estimated_useful_life_years: number;
    unit_cost_estimate: number;
    maintenance_interval_months: number;
    required_permits: string;
}

export interface RefTrainingReference {
    id: string;
    title: string;
    category: string;
    standard_duration_days: number;
    delivery_mode: string;
    target_audience: string;
    accrediting_body: string;
    minimum_participants: number;
    required_facilities: string;
    key_modules: string;
    expected_competency: string;
    certification_type: string;
}

export const equipmentCategories = [
    'Land Preparation',
    'Crop Establishment',
    'Crop Care & Protection',
    'Harvesting',
    'Post-Harvest & Processing',
    'Transport & Logistics',
    'Livestock & Poultry',
    'Garden & Nursery'
];

export interface ReferenceActivity {
    id: string;
    component: string;
    activity_name: string;
    type: 'Activity' | 'Training';
}

export type ActivityMonitoringStatus = 'Pending' | 'Ongoing' | 'Completed';

export interface ActivityMonitoringReport {
    id: number;
    activity_id: number;
    ipo_id: number;
    status: ActivityMonitoringStatus;
    findings?: string | null;
    issues?: string | null;
    recommendations?: string | null;
    reported_by?: number | null;
    reported_by_name?: string | null;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
    deleted_by?: number | null;
    deleted_by_name?: string | null;
}

export interface ActivityMonitoringAction {
    id: number;
    monitoring_report_id: number;
    action_taken: string;
    created_by?: number | null;
    created_by_name?: string | null;
    created_at: string;
    updated_at: string;
    edited_by?: number | null;
    edited_by_name?: string | null;
    edited_at?: string | null;
    deleted_by?: number | null;
    deleted_by_name?: string | null;
    deleted_at?: string | null;
}

export interface GidaArea {
    id: string;
    region: string;
    province: string;
    municipality: string;
    barangay: string;
}

export interface ElcacArea {
    id: string;
    region: string;
    province: string;
    municipality: string;
    barangay: string;
}

// LOD Interfaces
export interface LodSection {
    id: number;
    title: string;
    description?: string;
    order: number;
}

export interface LodQuestion {
    id: number;
    section_id: number;
    text: string;
    weight: number;
    order: number;
    choices?: LodChoice[];
}

export interface LodChoice {
    id: number;
    question_id: number;
    text: string;
    points: number;
    order: number;
}

export interface LodAssessment {
    id: number;
    ipo_id: number;
    year: number;
    total_score: number;
    computed_level: number;
    manual_level?: number;
    remarks?: string;
    created_at?: string;
    updated_at?: string;
}

export interface LodAnswer {
    id: number;
    assessment_id: number;
    question_id: number;
    choice_id: number;
    points_earned: number;
}

// Data Lists
export const operatingUnits = [
    'NPMO',
    'RPMO CAR',
    'RPMO 1',
    'RPMO 2',
    'RPMO 3',
    'RPMO 4A',
    'RPMO 4B',
    'RPMO 5',
    'RPMO 6',
    'RPMO 7',
    'RPMO 8',
    'RPMO 9',
    'RPMO 10',
    'RPMO 11',
    'RPMO 12',
    'RPMO 13',
    'RPMO NIR'
];

// Helper for Region Normalization
export const normalizeRegionName = (inputRegion: string) => {
    const map: { [key: string]: string } = {
        'Ilocos Region': 'Region I (Ilocos Region)',
        'Cagayan Valley': 'Region II (Cagayan Valley)',
        'Central Luzon': 'Region III (Central Luzon)',
        'CALABARZON': 'Region IV-A (CALABARZON)',
        'MIMAROPA': 'MIMAROPA Region',
        'MIMAROPA Region': 'MIMAROPA Region',
        'Bicol Region': 'Region V (Bicol Region)',
        'Western Visayas': 'Region VI (Western Visayas)',
        'Central Visayas': 'Region VII (Central Visayas)',
        'Eastern Visayas': 'Region VIII (Eastern Visayas)',
        'Zamboanga Peninsula': 'Region IX (Zamboanga Peninsula)',
        'Northern Mindanao': 'Region X (Northern Mindanao)',
        'Davao Region': 'Region XI (Davao Region)',
        'SOCCSKSARGEN': 'Region XII (SOCCSKSARGEN)',
        'Caraga': 'Region XIII (Caraga)',
        'NCR': 'National Capital Region (NCR)',
        'National Capital Region': 'National Capital Region (NCR)',
        'CAR': 'Cordillera Administrative Region (CAR)',
        'Cordillera Administrative Region': 'Cordillera Administrative Region (CAR)',
        'BARMM': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
        'Bangsamoro Autonomous Region in Muslim Mindanao': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
        'Region 1': 'Region I (Ilocos Region)',
        'Region 2': 'Region II (Cagayan Valley)',
        'Region 3': 'Region III (Central Luzon)',
        'Region 4A': 'Region IV-A (CALABARZON)',
        'Region 4-A': 'Region IV-A (CALABARZON)',
        'Region 5': 'Region V (Bicol Region)',
        'Region 6': 'Region VI (Western Visayas)',
        'Region 7': 'Region VII (Central Visayas)',
        'Region 8': 'Region VIII (Eastern Visayas)',
        'Region 9': 'Region IX (Zamboanga Peninsula)',
        'Region 10': 'Region X (Northern Mindanao)',
        'Region 11': 'Region XI (Davao Region)',
        'Region 12': 'Region XII (SOCCSKSARGEN)',
        'Region 13': 'Region XIII (Caraga)',
        'Region I': 'Region I (Ilocos Region)',
        'Region II': 'Region II (Cagayan Valley)',
        'Region III': 'Region III (Central Luzon)',
        'Region IV-A': 'Region IV-A (CALABARZON)',
        'Region IV-B': 'MIMAROPA Region',
        'Region V': 'Region V (Bicol Region)',
        'Region VI': 'Region VI (Western Visayas)',
        'Region VII': 'Region VII (Central Visayas)',
        'Region VIII': 'Region VIII (Eastern Visayas)',
        'Region IX': 'Region IX (Zamboanga Peninsula)',
        'Region X': 'Region X (Northern Mindanao)',
        'Region XI': 'Region XI (Davao Region)',
        'Region XII': 'Region XII (SOCCSKSARGEN)',
        'Region XIII': 'Region XIII (Caraga)',
    };
    return map[inputRegion] || inputRegion;
};

export const philippineRegions = [
    'National Capital Region (NCR)',
    'Cordillera Administrative Region (CAR)',
    'Region I (Ilocos Region)',
    'Region II (Cagayan Valley)',
    'Region III (Central Luzon)',
    'Region IV-A (CALABARZON)',
    'MIMAROPA Region',
    'Region V (Bicol Region)',
    'Region VI (Western Visayas)',
    'Region VII (Central Visayas)',
    'Region VIII (Eastern Visayas)',
    'Region IX (Zamboanga Peninsula)',
    'Region X (Northern Mindanao)',
    'Region XI (Davao Region)',
    'Region XII (SOCCSKSARGEN)',
    'Region XIII (Caraga)',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
    'Negros Island Region (NIR)'
];

export const ouToRegionMap: { [key: string]: string } = {
    'NPMO': 'National Capital Region (NCR)', // Default to NCR
    'RPMO CAR': 'Cordillera Administrative Region (CAR)',
    'RPMO 1': 'Region I (Ilocos Region)',
    'RPMO 2': 'Region II (Cagayan Valley)',
    'RPMO 3': 'Region III (Central Luzon)',
    'RPMO 4A': 'Region IV-A (CALABARZON)',
    'RPMO 4B': 'MIMAROPA Region',
    'RPMO 5': 'Region V (Bicol Region)',
    'RPMO 6': 'Region VI (Western Visayas)',
    'RPMO 7': 'Region VII (Central Visayas)',
    'RPMO 8': 'Region VIII (Eastern Visayas)',
    'RPMO 9': 'Region IX (Zamboanga Peninsula)',
    'RPMO 10': 'Region X (Northern Mindanao)',
    'RPMO 11': 'Region XI (Davao Region)',
    'RPMO 12': 'Region XII (SOCCSKSARGEN)',
    'RPMO 13': 'Region XIII (Caraga)',
    'RPMO NIR': 'Negros Island Region (NIR)'
};

export const referenceCommodityTypes = [
    'Crop',
    'Livestock'
];

export const otherActivityComponents: ActivityComponentType[] = [
    'Social Preparation',
    'Production and Livelihood',
    'Marketing and Enterprise',
    'Program Management'
];

// Initial Data (Empty as per new instruction, but structure required)
export const initialUacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } } = {
    'MOOE': {},
    'CO': {}
};

export const initialParticularTypes: { [key: string]: string[] } = {};

// LOD Interfaces
export interface LodLevelConfig {
    id: number;
    level: number;
    min_score: number;
    max_score: number;
    updated_at?: string;
}

export interface LodSection {
    id: number;
    title: string;
    code?: string;
    order: number;
    weight: number;
    created_at?: string;
}

export interface LodQuestion {
    id: number;
    section_id: number;
    text: string;
    code?: string;
    description?: string;
    weight: number;
    order: number;
    is_calculation_mode?: boolean;
    actual_label?: string;
    total_label?: string;
    is_specific_answer_mode?: boolean;
    specific_answer_label?: string;
    created_at?: string;
}

export interface LodChoice {
    id: number;
    question_id: number;
    text: string;
    points: number;
    order: number;
    created_at?: string;
}

export interface LodAssessment {
    id: number;
    ipo_id: number;
    year: number;
    total_score: number;
    computed_level: number;
    manual_level?: number | null;
    remarks?: string | null;
    is_carried_over?: boolean;
    is_dropped?: boolean;
    assessed_by?: string | null;
    assessor_name?: string | null;
    updated_at?: string;
}

export interface LodAnswer {
    id: number;
    assessment_id: number;
    question_id: number;
    choice_id: number;
    points_earned: number;
    remarks?: string;
    actual_value?: number | null;
    total_value?: number | null;
    specific_answer_value?: string | null;
    updated_at?: string;
}

export interface BAR1Snapshot {
    id: string;
    operating_unit: string;
    fund_year: number;
    fund_type: string;
    tier: string;
    snapshot_date: string;
    report_data: any;
    created_at?: string;
}

// Author: 4K 
// --- End of constants.tsx ---
