
// Author: 4K
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, ObligationRecord, DisbursementRecord } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useUserAccess } from '../mainfunctions/TableHooks';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { getDcfModuleKeyForSourceType, normalizePolicyMonth, useDcfPolicyGuard } from '../../hooks/useDcfPolicyGuard';
import { Undo2, Loader2, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, WalletCards, Landmark, Banknote, Scale, Lock } from 'lucide-react';
import { getProgramManagementPhysicalDateBasis, resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../../lib/physicalAccomplishmentTimestamp';
import { resolveDisbursementEntries, summarizeDisbursements } from '../../lib/disbursementUtils';
import { getBudgetLineAmount } from '../../lib/budgetLineAdjustments';
import type { DataScope } from '../../lib/scopedDataFetch';
import { normalizeStaffingExpenses, staffingExpenseItemId } from '../../lib/staffingExpenseIdentity';
import { ConfirmDialog, LoadingState } from '../ui/enterprise';
import { DcfScopeFilterPanel, type DcfScopeFilterValue, useDcfScopeFilters } from '../ui/DcfScopeFilters';
import { FinancialAmountCell, FinancialMonthCell, formatFinancialMonth, normalizeFinancialMonthValue } from './FinancialInlineEditors';
import { FinancialActualsDialog } from './FinancialActualsDialog';

interface Props {
 subprojects: Subproject[];
 setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
 activities: Activity[];
 setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
 officeReqs: OfficeRequirement[];
 setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
 staffingReqs: StaffingRequirement[];
 setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
 otherProgramExpenses: OtherProgramExpense[];
 setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
 budgetCeilings?: Array<{ operating_unit: string; year: number; amount: number }>;
 uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
 onSelectSubproject: (subproject: Subproject) => void;
 onSelectActivity: (activity: Activity) => void;
 onSelectOfficeReq: (item: OfficeRequirement) => void;
 onSelectStaffingReq: (item: StaffingRequirement) => void;
 onSelectOtherExpense: (item: OtherProgramExpense) => void;
 onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

interface FinancialItem {
 uniqueId: string;
 sourceType: 'Subproject' | 'Activity' | 'Office' | 'Staffing' | 'Other';
 sourceId: number;
 detailId?: number; // For subprojects and activity expenses

 // Identifiers
 uacsCode: string;
 objectType: string;
 expenseParticular: string; // The group name basically

 // Display Info
 sourceName: string; // Project Name, Activity Name, etc.
 budgetParticular?: string; // For subprojects, the specific item name
 fundYear: string;

 // Financials
 targetObligationMonth: string;
 targetObligationAmount: number;
 targetDisbursementMonth: string;
 targetDisbursementAmount: number;

 actualObligationMonth: string;
 actualObligationAmount: number;
 actualDisbursementMonth: string;
 actualDisbursementAmount: number;

 obligations: ObligationRecord[];
 disbursements: DisbursementRecord[];

 // Monthly breakdown for actuals (specific to Staffing/Other)
 actualDisbursementJan: number;
 actualDisbursementFeb: number;
 actualDisbursementMar: number;
 actualDisbursementApr: number;
 actualDisbursementMay: number;
 actualDisbursementJun: number;
 actualDisbursementJul: number;
 actualDisbursementAug: number;
 actualDisbursementSep: number;
 actualDisbursementOct: number;
 actualDisbursementNov: number;
 actualDisbursementDec: number;

 status: string; // Added status field
 isRealignment?: boolean;
 isSavings?: boolean;
 isCancelled?: boolean;
 isConfirmed: boolean; // Just a UI state for this session (or could map to 'status')
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"
];

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Helper to get month index from YYYY-MM-DD
const getMonthFromDateStr = (dateStr: string | undefined) => {
 if (!dateStr) return '';
 const parts = dateStr.split('-');
 if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
 return '';
};

const toFiniteNumber = (value: unknown) => {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : 0;
};

const sumAmounts = (records: Array<{ amount?: number | string | null }> = []) => {
 return records.reduce((sum, record) => sum + toFiniteNumber(record.amount), 0);
};

const formatCurrency = (amount: number) => {
 // Round up to nearest whole number
 const rounded = Math.ceil(toFiniteNumber(amount));
 return new Intl.NumberFormat('en-PH', {
 style: 'currency',
 currency: 'PHP',
 minimumFractionDigits: 0,
 maximumFractionDigits: 0
 }).format(rounded);
}

// Helper to normalize legacy obligations to the new array structure
const getInitialObligations = (existingArr: ObligationRecord[] | undefined, date: string, amount: number) => {
 // If we have an existing array with elements, use it.
 // This preserves multiple entries if they were saved in the JSONB field.
 if (existingArr && existingArr.length > 0) return existingArr;

 // Fallback for truly legacy single-entry fields
 if (amount > 0) {
 return [{
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: date || '',
 amount: amount,
 remarks: 'Legacy Record'
 }];
 }
 return [];
};

const getInitialDisbursements = (existingArr: DisbursementRecord[] | undefined, date: string, amount: number) => {
 // Similarly for disbursements
 if (existingArr && existingArr.length > 0) return existingArr;

 if (amount > 0) {
 return [{
 id: Date.now() + Math.floor(Math.random() * 1000),
 date: date || '',
 amount: amount,
 remarks: 'Legacy Record'
 }];
 }
 return [];
};

const getContextDescription = (item: FinancialItem) => {
 if (item.sourceType === 'Subproject') {
 return item.budgetParticular && item.sourceName !== item.budgetParticular ? item.sourceName : '';
 }
 if (item.sourceType === 'Staffing') {
 return item.expenseParticular !== item.sourceName ? item.sourceName : '';
 }
 if (item.sourceType === 'Other') {
 return item.expenseParticular && item.expenseParticular !== item.sourceName ? item.expenseParticular : 'Other program expense';
 }
 if (item.sourceType === 'Activity') {
 return item.sourceName;
 }
 return item.expenseParticular;
};

const isTaggedExclusion = (item: FinancialItem) => !!(item.isRealignment || item.isSavings || item.isCancelled);

const getTargetObligationForTotals = (item: FinancialItem) =>
 isTaggedExclusion(item) ? 0 : toFiniteNumber(item.targetObligationAmount);

const getTargetDisbursementForTotals = (item: FinancialItem) =>
 isTaggedExclusion(item) ? 0 : toFiniteNumber(item.targetDisbursementAmount);

const getTaggedAllocationAmount = (item: FinancialItem) =>
 isTaggedExclusion(item) ? toFiniteNumber(item.targetObligationAmount) : 0;

const getUnobligatedAmount = (item: FinancialItem) =>
 toFiniteNumber(item.targetObligationAmount) - toFiniteNumber(item.actualObligationAmount);

const getObjectTypeLabel = (objectType: string) => {
 if (objectType === 'CO') return 'CO — Capital Outlays';
 if (objectType === 'MOOE') return 'MOOE — Maintenance & Other Operating Expenses';
 return objectType;
};

type FinancialCategory = 'All' | 'Capital Outlay' | 'MOOE' | 'Staffing Requirements';

const readLegacyFinancialScope = (): Partial<DcfScopeFilterValue> => {
 if (typeof window === 'undefined') return {};
 const read = (key: string) => {
 try {
 const raw = window.localStorage.getItem(key);
 return raw ? JSON.parse(raw) : undefined;
 } catch {
 return undefined;
 }
 };
 const year = read('fin_selectedYear');
 return {
 selectedYear: year ? String(year) : undefined,
 selectedOu: read('fin_selectedOu'),
 selectedTier: read('fin_selectedTier'),
 selectedFundType: read('fin_selectedFundType'),
 };
};

const FinancialAccomplishment: React.FC<Props> = ({
 subprojects, setSubprojects,
 activities, setActivities,
 officeReqs, setOfficeReqs,
 staffingReqs, setStaffingReqs,
 otherProgramExpenses, setOtherProgramExpenses,
 budgetCeilings = [],
 uacsCodes,
 onSelectSubproject, onSelectActivity,
 onSelectOfficeReq, onSelectStaffingReq, onSelectOtherExpense,
 onDataScopeChange
}) => {
 const { canEdit } = useUserAccess('Accomplishment - Financial');
 const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
 const defaultYear = new Date().getFullYear();
 const legacyScope = useMemo(readLegacyFinancialScope, []);
 const dcfFilters = useDcfScopeFilters({
 storageKey: 'financial_accomplishment_dcf_scope',
 moduleName: 'Accomplishment - Financial',
 onDataScopeChange,
 initialApplied: legacyScope,
 });
 const { selectedYear, selectedOu, selectedTier, selectedFundType } = dcfFilters.value;
 const [category, setCategory] = useState<FinancialCategory>('All');

 const [isLoading, setIsLoading] = useState(false);
 const [originalItems, setOriginalItems] = useState<FinancialItem[]>([]);
 const [items, setItems] = useState<FinancialItem[]>([]);
 const [changedItems, setChangedItems] = useState<Map<string, FinancialItem>>(new Map());
 const [isSavingAll, setIsSavingAll] = useState(false);
 const [localSavingIds, setLocalSavingIds] = useState<Set<string>>(new Set());
 const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
 const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
 const [monthLockMessage, setMonthLockMessage] = useState('');
 const [actualsDialog, setActualsDialog] = useState<{ itemId: string; kind: 'obligation' | 'disbursement' } | null>(null);
 const [actualsDialogSaving, setActualsDialogSaving] = useState(false);
 const [actualsDialogError, setActualsDialogError] = useState('');
 const skipNextFinancialReloadRef = useRef(false);
 type SortKey = 'targetObligationAmount' | 'targetObligationMonth' | 'actualObligationAmount' | 'unobligatedAmount' | 'targetDisbursementAmount' | 'targetDisbursementMonth' | 'actualDisbursementAmount';
 const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' } | null>(null);

 // Persistent Expansion States (Stored as Arrays in localStorage)
 const [expandedObjectTypes, setExpandedObjectTypes] = useLocalStorageState<string[]>('fin_expandedObjectTypes', ['MOOE', 'CO']);
 const [expandedGroups, setExpandedGroups] = useLocalStorageState<string[]>('fin_expandedGroups', []);
 const [expandedSubGroups, setExpandedSubGroups] = useLocalStorageState<string[]>('fin_expandedSubGroups', []);

 const getPolicySubjectForFinancialItem = (item: FinancialItem) => (
 item.sourceType === 'Staffing'
 ? { hiringStatus: item.status || 'Proposed' }
 : { status: item.status || 'Proposed' }
 );

 const getFinancialStatusDecision = (item: FinancialItem) => {
 const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
 if (!moduleKey) {
 return { allowed: false, code: 'blocked_by_status' as const, message: 'Unknown DCF source type.' };
 }
 return getStatusDecision({
 moduleKey,
 item: getPolicySubjectForFinancialItem(item),
 action: 'editFinancialAccomplishment',
 hasModuleAccess: canEdit,
 });
 };

 const ensureFinancialItemAllowed = async (item: FinancialItem) => {
 const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
 if (!moduleKey) {
 alert('Unknown DCF source type.');
 return false;
 }
 return ensureDecisionAllowed(getFinancialStatusDecision(item), {
 moduleKey,
 item: getPolicySubjectForFinancialItem(item),
 itemId: item.sourceId,
 itemName: item.sourceName,
 status: item.status as any,
 action: 'editFinancialAccomplishment',
 entityType: item.sourceType.toLowerCase(),
 });
 };

 const validateFinancialActualMonth = async (item: FinancialItem, month: string) => {
 if (!month) return true;
 const moduleKey = getDcfModuleKeyForSourceType(item.sourceType);
 if (!moduleKey) {
 alert('Unknown DCF source type.');
 return false;
 }
 if (!(await ensureFinancialItemAllowed(item))) return false;
 const monthDecision = getMonthDecision(month);
 if (isMonthSelectionAllowed(monthDecision)) {
 setMonthLockMessage('');
 return true;
 }
 setMonthLockMessage(getMonthLockMessage(monthDecision));
 return false;
 };

 const hasMonthChanged = (current?: string | null, original?: string | null) => (
 normalizePolicyMonth(current) !== normalizePolicyMonth(original)
 );

 const getChangedRecordMonths = (
 currentRecords: Array<{ id?: number | string; date?: string | null }> = [],
 originalRecords: Array<{ id?: number | string; date?: string | null }> = []
 ) => currentRecords
 .filter((record, index) => {
 const originalRecord = record.id !== undefined
 ? originalRecords.find(item => item.id === record.id)
 : originalRecords[index];
 return !!record.date && (!originalRecord || hasMonthChanged(record.date, originalRecord.date));
 })
 .map(record => record.date)
 .filter(Boolean) as string[];

 const validateFinancialItemForSave = async (item: FinancialItem) => {
 if (!(await ensureFinancialItemAllowed(item))) return false;
 const originalItem = originalItems.find(original => original.uniqueId === item.uniqueId);
 const months = [
 ...getChangedRecordMonths(item.obligations || [], originalItem?.obligations || []),
 ...getChangedRecordMonths(item.disbursements || [], originalItem?.disbursements || []),
 ...SHORT_MONTHS
 .map((month, index) => {
 const field = `actualDisbursement${month}`;
 const currentAmount = toFiniteNumber((item as any)[field]);
 const originalAmount = toFiniteNumber((originalItem as any)?.[field]);
 return currentAmount > 0 && !valuesDiffer(currentAmount, originalAmount)
 ? ''
 : currentAmount > 0
 ? `${item.fundYear || defaultYear}-${String(index + 1).padStart(2, '0')}`
 : '';
 })
 .filter(Boolean),
 ] as string[];
 for (const month of months) {
 if (!(await validateFinancialActualMonth(item, month))) return false;
 }
 return true;
 };

 useEffect(() => {
 ['fin_selectedYear', 'fin_selectedOu', 'fin_selectedTier', 'fin_selectedFundType'].forEach(key => {
 try { window.localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
 });
 }, []);

 // --- 1. Load and Normalize Data ---
 useEffect(() => {
 if (skipNextFinancialReloadRef.current) {
 skipNextFinancialReloadRef.current = false;
 return;
 }
 setIsLoading(true);

 const fetchData = async () => {
 try {
 const matchesFilters = (item: any) => {
 const itemYear = item.fundingYear || item.fundYear;
 if (selectedYear !== 'All' && String(itemYear) !== String(selectedYear)) return false;
 if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
 if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
 if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
 return true;
 };

 const filteredSubprojects = (subprojects || []).filter(matchesFilters);
 const filteredActivities = (activities || []).filter(matchesFilters);
 const filteredOfficeReqs = (officeReqs || []).filter(matchesFilters);
 const filteredStaffingReqs = (staffingReqs || []).filter(matchesFilters);
 const filteredOtherProgramExpenses = (otherProgramExpenses || []).filter(matchesFilters);

 const uniqueIds = (values: unknown[]) =>
 Array.from(new Set(values.map(Number).filter(Number.isFinite)));

 const financialGroups = [
 { entityType: 'subproject_detail', ids: uniqueIds(filteredSubprojects.map(item => item.id)) },
 { entityType: 'activity_expense', ids: uniqueIds(filteredActivities.map(item => item.id)) },
 { entityType: 'office_requirement', ids: uniqueIds(filteredOfficeReqs.map(item => item.id)) },
 { entityType: 'staffing_expense', ids: uniqueIds(filteredStaffingReqs.map(item => item.id)) },
 { entityType: 'other_program_expense', ids: uniqueIds(filteredOtherProgramExpenses.map(item => item.id)) },
 ];

 const fetchFinancialRows = async (
 tableName: 'financial_obligations' | 'financial_disbursements',
 groups: Array<{ entityType: string; ids: number[] }>
 ) => {
 const chunkSize = 100;
 const queries = groups.flatMap(group => {
 const chunks: number[][] = [];
 for (let index = 0; index < group.ids.length; index += chunkSize) {
 chunks.push(group.ids.slice(index, index + chunkSize));
 }
 return chunks.map(chunk =>
 supabase
 .from(tableName)
 .select('*')
 .eq('entity_type', group.entityType)
 .in('parent_id', chunk)
 );
 });

 if (queries.length === 0) return [];
 const responses = await Promise.all(queries);
 const error = responses.find(response => response.error)?.error;
 if (error) throw error;
 return responses.flatMap(response => response.data || []);
 };

 const [obliRes, disbRes] = await Promise.all([
 fetchFinancialRows('financial_obligations', financialGroups),
 fetchFinancialRows('financial_disbursements', financialGroups)
 ]);

 const centralizedObligations = obliRes || [];
 const centralizedDisbursements = disbRes || [];

 // Helper to get obligations for a specific item
 const matchesCentralItemId = (sourceType: string, rowItemId: string | number | null | undefined, detailId?: number) => {
 const itemId = sourceType === 'Staffing'
 ? staffingExpenseItemId(detailId)
 : detailId !== undefined && detailId !== null
 ? detailId.toString()
 : null;

 if (itemId) return rowItemId?.toString() === itemId;
 if (sourceType === 'Staffing') return rowItemId === null || rowItemId === undefined || rowItemId === '';
 return true;
 };

 const getObligations = (sourceType: string, parentId: number, detailId?: number) => {
 const entityType = sourceType === 'Subproject' ? 'subproject_detail' :
 sourceType === 'Activity' ? 'activity_expense' :
 sourceType === 'Staffing' ? 'staffing_expense' :
 sourceType === 'Office' ? 'office_requirement' : 'other_program_expense';

 const matches = centralizedObligations.filter(o =>
 o.entity_type === entityType &&
 o.parent_id === parentId &&
 matchesCentralItemId(sourceType, o.item_id, detailId)
 );

 return matches.map(o => ({
 id: o.id,
 date: o.obligation_date,
 amount: o.amount,
 remarks: o.remarks
 }));
 };

 const getDisbursements = (sourceType: string, parentId: number, detailId?: number) => {
 const entityType = sourceType === 'Subproject' ? 'subproject_detail' :
 sourceType === 'Activity' ? 'activity_expense' :
 sourceType === 'Staffing' ? 'staffing_expense' :
 sourceType === 'Office' ? 'office_requirement' : 'other_program_expense';

 const matches = centralizedDisbursements.filter(d =>
 d.entity_type === entityType &&
 d.parent_id === parentId &&
 matchesCentralItemId(sourceType, d.item_id, detailId)
 );

 return matches.map(d => ({
 id: d.id,
 date: d.disbursement_date,
 amount: d.amount,
 remarks: d.remarks
 }));
 };

 const loadedItems: FinancialItem[] = [];
 const defaultMonthly = {
 actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0,
 actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
 actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0,
 actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
 };

 // Subprojects
 filteredSubprojects.forEach(sp => {
 (sp.details || []).forEach(d => {
 const obs = getObligations('Subproject', sp.id, d.id);
 const dibs = getDisbursements('Subproject', sp.id, d.id);

 loadedItems.push({
 uniqueId: `sp-${sp.id}-${d.id}`,
 sourceType: 'Subproject',
 sourceId: sp.id,
 fundYear: String(sp.fundingYear || selectedYear || defaultYear),
 detailId: d.id,
 uacsCode: d.uacsCode,
 objectType: d.objectType || 'MOOE',
 expenseParticular: d.expenseParticular || 'Unspecified',
 sourceName: sp.name,
 budgetParticular: d.particulars,
 targetObligationMonth: d.obligationMonth,
 targetObligationAmount: getBudgetLineAmount(d),
 targetDisbursementMonth: d.disbursementMonth,
 targetDisbursementAmount: getBudgetLineAmount(d),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (d.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(d.actualObligationAmount),
 actualDisbursementMonth: dibs.length > 0 ? dibs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (d.actualDisbursementDate || ''),
 actualDisbursementAmount: dibs.length > 0 ? sumAmounts(dibs) : toFiniteNumber(d.actualDisbursementAmount),
 obligations: obs.length > 0 ? obs : getInitialObligations(d.obligations, d.actualObligationDate || '', toFiniteNumber(d.actualObligationAmount)),
 disbursements: dibs.length > 0 ? dibs : getInitialDisbursements(d.disbursements, d.actualDisbursementDate || '', toFiniteNumber(d.actualDisbursementAmount)),
 status: sp.status,
 isRealignment: sp.isRealignment || d.isRealignment,
 isSavings: sp.isSavings || d.isSavings,
 isCancelled: sp.status === 'Cancelled' || d.isCancelled,
 ...defaultMonthly,
 isConfirmed: false
 });
 });
 });

 // Activities
 filteredActivities.forEach(act => {
 (act.expenses || []).forEach(e => {
 const obs = getObligations('Activity', act.id, e.id);
 const dibs = getDisbursements('Activity', act.id, e.id);

 loadedItems.push({
 uniqueId: `act-${act.id}-${e.id}`,
 sourceType: 'Activity',
 sourceId: act.id,
 fundYear: String(act.fundingYear || selectedYear || defaultYear),
 detailId: e.id,
 uacsCode: e.uacsCode,
 objectType: e.objectType || 'MOOE',
 expenseParticular: e.expenseParticular || 'Unspecified',
 sourceName: act.name || `${act.type} (${act.component})`,
 targetObligationMonth: e.obligationMonth,
 targetObligationAmount: getBudgetLineAmount(e),
 targetDisbursementMonth: e.disbursementMonth,
 targetDisbursementAmount: getBudgetLineAmount(e),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (e.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(e.actualObligationAmount),
 actualDisbursementMonth: dibs.length > 0 ? dibs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (e.actualDisbursementDate || ''),
 actualDisbursementAmount: dibs.length > 0 ? sumAmounts(dibs) : toFiniteNumber(e.actualDisbursementAmount),
 obligations: obs.length > 0 ? obs : getInitialObligations(e.obligations, e.actualObligationDate || '', toFiniteNumber(e.actualObligationAmount)),
 disbursements: dibs.length > 0 ? dibs : getInitialDisbursements(e.disbursements, e.actualDisbursementDate || '', toFiniteNumber(e.actualDisbursementAmount)),
 status: act.status,
 isRealignment: act.isRealignment || e.isRealignment,
 isSavings: act.isSavings || e.isSavings,
 isCancelled: act.status === 'Cancelled' || e.isCancelled,
 ...defaultMonthly,
 isConfirmed: false
 });
 });
 });

 // Office Requirements
 filteredOfficeReqs.forEach(o => {
 const obs = getObligations('Office', o.id);
 const dibs = getDisbursements('Office', o.id);

 loadedItems.push({
 uniqueId: `office-${o.id}`,
 sourceType: 'Office',
 sourceId: o.id,
 fundYear: String(o.fundYear || selectedYear || defaultYear),
 uacsCode: o.uacsCode,
 objectType: 'MOOE',
 expenseParticular: 'Office Requirements',
 sourceName: o.equipment,
 targetObligationMonth: o.obligationDate,
 targetObligationAmount: toFiniteNumber(o.pricePerUnit) * toFiniteNumber(o.numberOfUnits),
 targetDisbursementMonth: o.disbursementDate,
 targetDisbursementAmount: toFiniteNumber(o.pricePerUnit) * toFiniteNumber(o.numberOfUnits),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (o.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(o.actualObligationAmount),
 actualDisbursementMonth: dibs.length > 0 ? dibs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (o.actualDisbursementDate || ''),
 actualDisbursementAmount: dibs.length > 0 ? sumAmounts(dibs) : toFiniteNumber(o.actualDisbursementAmount),
 obligations: obs.length > 0 ? obs : getInitialObligations(o.obligations, o.actualObligationDate || '', toFiniteNumber(o.actualObligationAmount)),
 disbursements: dibs.length > 0 ? dibs : getInitialDisbursements(o.disbursements, o.actualDisbursementDate || '', toFiniteNumber(o.actualDisbursementAmount)),
 status: o.status,
 isRealignment: o.isRealignment,
 isSavings: o.isSavings,
 ...defaultMonthly,
 isConfirmed: false
 });
 });

 // Staffing
 const staffingNormalizationUpdates: Array<{ id: number; expenses: StaffingRequirement['expenses'] }> = [];

 filteredStaffingReqs.forEach(s => {
 if (s.expenses && s.expenses.length > 0) {
 const normalizedExpenses = normalizeStaffingExpenses(s.expenses);
 const hasNormalizedIds = normalizedExpenses.some((expense, index) => expense.id !== s.expenses?.[index]?.id);

 if (hasNormalizedIds) {
 staffingNormalizationUpdates.push({ id: s.id, expenses: normalizedExpenses });
 }

 normalizedExpenses.forEach(e => {
 const obs = getObligations('Staffing', s.id, e.id);
 const centralDibs = getDisbursements('Staffing', s.id, e.id);
 const disbursements = centralDibs.length > 0
 ? centralDibs
 : resolveDisbursementEntries({ ...e, disbursements: undefined }, String(s.fundYear || selectedYear || defaultYear));
 const disbursementSummary = summarizeDisbursements(disbursements, String(s.fundYear || selectedYear || defaultYear));

 loadedItems.push({
 uniqueId: `staff-${s.id}-${e.id}`,
 sourceType: 'Staffing',
 sourceId: s.id,
 fundYear: String(s.fundYear || selectedYear || defaultYear),
 detailId: e.id,
 uacsCode: e.uacsCode,
 objectType: e.objectType || 'MOOE',
 expenseParticular: e.expenseParticular || 'Salaries & Wages',
 sourceName: s.personnelPosition,
 targetObligationMonth: e.obligationDate,
 targetObligationAmount: getBudgetLineAmount(e),
 targetDisbursementMonth: 'Monthly',
 targetDisbursementAmount: getBudgetLineAmount(e),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (e.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(e.actualObligationAmount),
 actualDisbursementMonth: disbursementSummary.latestDate || e.actualDisbursementDate || '',
 actualDisbursementAmount: disbursementSummary.total,
 obligations: obs.length > 0 ? obs : getInitialObligations(e.obligations, e.actualObligationDate || '', toFiniteNumber(e.actualObligationAmount)),
 disbursements,
 status: s.hiringStatus,
 isRealignment: s.isRealignment || e.isRealignment,
 isSavings: s.isSavings || e.isSavings,
 isCancelled: s.status === 'Cancelled' || e.isCancelled,
 ...defaultMonthly,
 ...disbursementSummary.monthlyFields,
 isConfirmed: false
 });
 });
 } else {
 const obs = getObligations('Staffing', s.id);
 const centralDibs = getDisbursements('Staffing', s.id);
 const disbursements = centralDibs.length > 0
 ? centralDibs
 : resolveDisbursementEntries({ ...s, disbursements: undefined }, String(s.fundYear || selectedYear || defaultYear));
 const disbursementSummary = summarizeDisbursements(disbursements, String(s.fundYear || selectedYear || defaultYear));

 loadedItems.push({
 uniqueId: `staff-${s.id}`,
 sourceType: 'Staffing',
 sourceId: s.id,
 fundYear: String(s.fundYear || selectedYear || defaultYear),
 uacsCode: s.uacsCode,
 objectType: 'MOOE',
 expenseParticular: 'Salaries & Wages',
 sourceName: s.personnelPosition,
 targetObligationMonth: s.obligationDate,
 targetObligationAmount: toFiniteNumber(s.annualSalary),
 targetDisbursementMonth: 'Monthly',
 targetDisbursementAmount: toFiniteNumber(s.annualSalary),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (s.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(s.actualObligationAmount),
 actualDisbursementMonth: disbursementSummary.latestDate || s.actualDisbursementDate || '',
 actualDisbursementAmount: disbursementSummary.total,
 obligations: obs.length > 0 ? obs : getInitialObligations(s.obligations, s.actualObligationDate || '', toFiniteNumber(s.actualObligationAmount)),
 disbursements,
 status: s.hiringStatus,
 isRealignment: s.isRealignment,
 isSavings: s.isSavings,
 ...defaultMonthly,
 ...disbursementSummary.monthlyFields,
 isConfirmed: false
 });
 }
 });

 // Other
 filteredOtherProgramExpenses.forEach(ope => {
 const obs = getObligations('Other', ope.id);
 const centralDibs = getDisbursements('Other', ope.id);
 const disbursements = centralDibs.length > 0
 ? centralDibs
 : resolveDisbursementEntries({ ...ope, disbursements: undefined }, String(ope.fundYear || selectedYear || defaultYear));
 const disbursementSummary = summarizeDisbursements(disbursements, String(ope.fundYear || selectedYear || defaultYear));

 loadedItems.push({
 uniqueId: `other-${ope.id}`,
 sourceType: 'Other',
 sourceId: ope.id,
 fundYear: String(ope.fundYear || selectedYear || defaultYear),
 uacsCode: ope.uacsCode,
 objectType: 'MOOE',
 expenseParticular: 'Other Expenses',
 sourceName: ope.particulars,
 targetObligationMonth: ope.obligationDate,
 targetObligationAmount: toFiniteNumber(ope.amount),
 targetDisbursementMonth: ope.disbursementDate,
 targetDisbursementAmount: toFiniteNumber(ope.amount),
 actualObligationMonth: obs.length > 0 ? obs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date : (ope.actualObligationDate || ''),
 actualObligationAmount: obs.length > 0 ? sumAmounts(obs) : toFiniteNumber(ope.actualObligationAmount),
 actualDisbursementMonth: disbursementSummary.latestDate || ope.actualDisbursementDate || '',
 actualDisbursementAmount: disbursementSummary.total,
 obligations: obs.length > 0 ? obs : getInitialObligations(ope.obligations, ope.actualObligationDate || '', toFiniteNumber(ope.actualObligationAmount)),
 disbursements,
 status: ope.status,
 isRealignment: ope.isRealignment,
 isSavings: ope.isSavings,
 ...defaultMonthly,
 ...disbursementSummary.monthlyFields,
 isConfirmed: false
 });
 });

 if (staffingNormalizationUpdates.length > 0) {
 setStaffingReqs(prev => prev.map(req => {
 const update = staffingNormalizationUpdates.find(item => item.id === req.id);
 return update ? { ...req, expenses: update.expenses } : req;
 }));
 }

 setItems(loadedItems);
 setOriginalItems(loadedItems);
 } catch (error) {
 console.error("Error loading data:", error);
 } finally {
 setIsLoading(false);
 }
 };

 fetchData();
 }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, activities, officeReqs, staffingReqs, otherProgramExpenses]);


 const visibleItems = useMemo(() => items.filter(item => {
 if (category === 'All') return true;
 if (category === 'Capital Outlay') return item.objectType === 'CO';
 if (category === 'MOOE') return item.objectType === 'MOOE';
 return item.sourceType === 'Staffing';
 }), [category, items]);

 const categories: FinancialCategory[] = ['All', 'Capital Outlay', 'MOOE', 'Staffing Requirements'];

 // --- 2. Grouping Logic ---
 const groupedItems = useMemo(() => {
 const typeGroups: { [key: string]: { uacsMap: { [code: string]: { items: FinancialItem[], description: string, totalTargetObli: number, totalActualObli: number, totalTargetDisb: number, totalActualDisb: number } } } } = {};

 visibleItems.forEach(item => {
 const type = item.objectType || 'Unspecified';
 const code = item.uacsCode || 'No Code';

 if (!typeGroups[type]) {
 typeGroups[type] = { uacsMap: {} };
 }

 if (!typeGroups[type].uacsMap[code]) {
 // Find description from UACS Codes prop
 let desc = '';
 if (uacsCodes[type]) {
 for (const part in uacsCodes[type]) {
 if (uacsCodes[type][part][code]) {
 desc = uacsCodes[type][part][code];
 break;
 }
 }
 }

 typeGroups[type].uacsMap[code] = {
 items: [],
 description: desc,
 totalTargetObli: 0,
 totalActualObli: 0,
 totalTargetDisb: 0,
 totalActualDisb: 0
 };
 }

 const group = typeGroups[type].uacsMap[code];
 group.items.push(item);
 group.totalTargetObli += getTargetObligationForTotals(item);
 group.totalActualObli += toFiniteNumber(item.actualObligationAmount);
 group.totalTargetDisb += getTargetDisbursementForTotals(item);
 group.totalActualDisb += toFiniteNumber(item.actualDisbursementAmount);
 });

 // Convert to array structure for rendering
 const groupItemsBySource = (items: FinancialItem[]) => {
 const map = new Map<number, { sourceId: number, sourceName: string, items: FinancialItem[], targetObligationAmount: number, actualObligationAmount: number, targetDisbursementAmount: number, actualDisbursementAmount: number }>();
 items.forEach(item => {
 if (!map.has(item.sourceId)) {
 map.set(item.sourceId, {
 sourceId: item.sourceId,
 sourceName: item.sourceName,
 items: [],
 targetObligationAmount: 0,
 actualObligationAmount: 0,
 targetDisbursementAmount: 0,
 actualDisbursementAmount: 0,
 });
 }
 const g = map.get(item.sourceId)!;
 g.items.push(item);
 g.targetObligationAmount += getTargetObligationForTotals(item);
 g.actualObligationAmount += toFiniteNumber(item.actualObligationAmount);
 g.targetDisbursementAmount += getTargetDisbursementForTotals(item);
 g.actualDisbursementAmount += toFiniteNumber(item.actualDisbursementAmount);
 });
 return Array.from(map.values());
 };

 return Object.entries(typeGroups).map(([type, data]) => ({
 objectType: type,
 uacsGroups: Object.entries(data.uacsMap).map(([code, groupData]) => ({
 uacsCode: code,
 description: groupData.description,
 particular: groupData.items[0]?.expenseParticular || groupData.description,
 key: `${type}-${code}`,
 items: groupData.items,
 totalTargetObli: groupData.totalTargetObli,
 totalActualObli: groupData.totalActualObli,
 totalTargetDisb: groupData.totalTargetDisb,
 totalActualDisb: groupData.totalActualDisb,
 subGroups: {
 'Subprojects': groupItemsBySource(groupData.items.filter(i => i.sourceType === 'Subproject')),
 'Activities': groupItemsBySource(groupData.items.filter(i => i.sourceType === 'Activity')),
 'Program Management': groupItemsBySource(groupData.items.filter(i => ['Office', 'Staffing', 'Other'].includes(i.sourceType)))
 }
 })).sort((a, b) => a.uacsCode.localeCompare(b.uacsCode))
 })).sort((a, b) => a.objectType.localeCompare(b.objectType));
 }, [uacsCodes, visibleItems]);

 // --- 2.1 Grand Total Calculation ---
 const grandTotals = useMemo(() => {
 return visibleItems.reduce((acc, item) => ({
 targetObli: acc.targetObli + getTargetObligationForTotals(item),
 actualObli: acc.actualObli + toFiniteNumber(item.actualObligationAmount),
 unobligated: acc.unobligated + getUnobligatedAmount(item),
 targetDisb: acc.targetDisb + getTargetDisbursementForTotals(item),
 actualDisb: acc.actualDisb + toFiniteNumber(item.actualDisbursementAmount)
 }), { targetObli: 0, actualObli: 0, unobligated: 0, targetDisb: 0, actualDisb: 0 });
 }, [visibleItems]);

 const summaryCards = useMemo(() => {
 const selectedYearNumber = Number(selectedYear);
 const hasBudgetCeilingScope = selectedTier === 'Tier 1' && selectedFundType === 'Current';
 const budgetCeiling = hasBudgetCeilingScope
 ? budgetCeilings.reduce((sum, ceiling) => {
 if (selectedYear !== 'All' && Number(ceiling.year) !== selectedYearNumber) return sum;
 if (selectedOu !== 'All' && ceiling.operating_unit !== selectedOu) return sum;
 return sum + toFiniteNumber(ceiling.amount);
 }, 0)
 : 0;

 return items.reduce((acc, item) => {
 const targetObligation = getTargetObligationForTotals(item);
 const targetDisbursement = getTargetDisbursementForTotals(item);
 const actualObligation = toFiniteNumber(item.actualObligationAmount);
 const actualDisbursement = toFiniteNumber(item.actualDisbursementAmount);

 acc.actualObligation += actualObligation;
 acc.actualDisbursement += actualDisbursement;
 acc.realignedSavings += getTaggedAllocationAmount(item);
 acc.totalAllocation += targetObligation;
 acc.targetObligation += targetObligation;
 acc.targetDisbursement += targetDisbursement;

 return acc;
 }, {
 budgetCeiling,
 totalAllocation: 0,
 targetObligation: 0,
 actualObligation: 0,
 targetDisbursement: 0,
 actualDisbursement: 0,
 realignedSavings: 0,
 hasBudgetCeilingScope
 });
 }, [budgetCeilings, items, selectedFundType, selectedOu, selectedTier, selectedYear]);

 const getPercent = (value: number, target: number) => {
 if (!target) return null;
 return Math.round((value / target) * 100);
 };

 const allocationCeilingPercent = getPercent(summaryCards.totalAllocation, summaryCards.budgetCeiling);
 const obligationUtilizationPercent = getPercent(summaryCards.actualObligation, summaryCards.targetObligation);
 const disbursementUtilizationPercent = getPercent(summaryCards.actualDisbursement, summaryCards.targetDisbursement);
 const taggedAllocationPercent = getPercent(summaryCards.realignedSavings, summaryCards.totalAllocation);
 const ceilingVariance = summaryCards.budgetCeiling - summaryCards.totalAllocation;

 const financialSummaryCards = [
 {
 label: 'Total Allocation',
 icon: WalletCards,
 value: summaryCards.totalAllocation,
 indicator: !summaryCards.hasBudgetCeilingScope
 ? 'Budget ceiling applies to Tier 1 Current only'
 : summaryCards.budgetCeiling <= 0
 ? 'No budget ceiling set'
 : ceilingVariance < 0
 ? `Ceiling ${formatCurrency(summaryCards.budgetCeiling)} · ${allocationCeilingPercent}% used · ${formatCurrency(Math.abs(ceilingVariance))} exceeded`
 : `Ceiling ${formatCurrency(summaryCards.budgetCeiling)} · ${allocationCeilingPercent}% used · ${formatCurrency(ceilingVariance)} remaining`,
 tone: summaryCards.hasBudgetCeilingScope && ceilingVariance < 0 ? 'danger' : 'neutral'
 },
 {
 label: 'Obligation',
 icon: Landmark,
 value: summaryCards.actualObligation,
 indicator: obligationUtilizationPercent === null
 ? `Target ${formatCurrency(summaryCards.targetObligation)} · No target set`
 : `Target ${formatCurrency(summaryCards.targetObligation)} · ${obligationUtilizationPercent}% utilized`,
 tone: obligationUtilizationPercent !== null && obligationUtilizationPercent > 100 ? 'danger' : 'neutral'
 },
 {
 label: 'Disbursement',
 icon: Banknote,
 value: summaryCards.actualDisbursement,
 indicator: disbursementUtilizationPercent === null
 ? `Target ${formatCurrency(summaryCards.targetDisbursement)} · No target set`
 : `Target ${formatCurrency(summaryCards.targetDisbursement)} · ${disbursementUtilizationPercent}% utilized`,
 tone: disbursementUtilizationPercent !== null && disbursementUtilizationPercent > 100 ? 'danger' : 'neutral'
 },
 {
 label: 'Realigned/Savings',
 icon: Scale,
 value: summaryCards.realignedSavings,
 indicator: taggedAllocationPercent === null ? '0% of allocation' : `${taggedAllocationPercent}% of allocation`,
 tone: summaryCards.realignedSavings > 0 ? 'warning' : 'neutral'
 },
 ];

 const financialProgress = [
 {
 label: 'Allocation Used',
 value: allocationCeilingPercent,
 detail: summaryCards.budgetCeiling > 0
 ? `${formatCurrency(summaryCards.totalAllocation)} of ${formatCurrency(summaryCards.budgetCeiling)}`
 : 'No applicable budget ceiling',
 },
 {
 label: 'Obligation vs Target',
 value: obligationUtilizationPercent,
 detail: `${formatCurrency(summaryCards.actualObligation)} of ${formatCurrency(summaryCards.targetObligation)}`,
 },
 {
 label: 'Disbursement vs Target',
 value: disbursementUtilizationPercent,
 detail: `${formatCurrency(summaryCards.actualDisbursement)} of ${formatCurrency(summaryCards.targetDisbursement)}`,
 },
 ];

 // --- 3. Handlers ---

 const toggleObjectType = (type: string) => {
 setExpandedObjectTypes(prev => {
 if (prev.includes(type)) return prev.filter(t => t !== type);
 return [...prev, type];
 });
 };

 const toggleGroup = (key: string) => {
 setExpandedGroups(prev => {
 if (prev.includes(key)) return prev.filter(k => k !== key);
 return [...prev, key];
 });
 };

 const toggleSubGroup = (key: string) => {
 setExpandedSubGroups(prev => {
 if (prev.includes(key)) return prev.filter(k => k !== key);
 return [...prev, key];
 });
 };

 // Update Local State for any field
 const updateLocalItem = (uniqueId: string, updates: Partial<FinancialItem>) => {
 setItems(prev => prev.map(item => {
 if (item.uniqueId === uniqueId) {
 const newItem = { ...item, ...updates };

 // If obligations were updated, auto-sum amount and update month
 if (updates.obligations) {
 const total = sumAmounts(updates.obligations);
 newItem.actualObligationAmount = total;

 if (updates.obligations.length > 0) {
 const sorted = [...updates.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
 newItem.actualObligationMonth = sorted[0].date;
 }
 }

 // If disbursements were updated, auto-sum amount and update month
 if (updates.disbursements) {
 const summary = summarizeDisbursements(updates.disbursements, item.fundYear);
 newItem.actualDisbursementAmount = summary.total;
 newItem.actualDisbursementMonth = summary.latestDate;
 Object.assign(newItem, summary.monthlyFields);
 }

 setChangedItems(prevMap => {
 const newMap = new Map(prevMap);
 newMap.set(uniqueId, newItem);
 return newMap;
 });
 return newItem;
 }
 return item;
 }));
 };

 // Special handler for monthly disbursement updates to auto-sum total
 const updateLocalMonthly = (uniqueId: string, month: string, value: number) => {
 setItems(prev => prev.map(item => {
 if (item.uniqueId === uniqueId) {
 // Construct new item state
 const newItem: any = { ...item, [`actualDisbursement${month}`]: value };
 // Recalculate total
 let total = 0;
 SHORT_MONTHS.forEach(m => {
 total += toFiniteNumber(newItem[`actualDisbursement${m}`]);
 });
 newItem.actualDisbursementAmount = total;

 setChangedItems(prevMap => {
 const newMap = new Map(prevMap);
 newMap.set(uniqueId, newItem);
 return newMap;
 });

 return newItem;
 }
 return item;
 }));
 };

 // Group level month update
 const handleGroupMonthChange = (groupKey: string, field: 'actualObligationMonth' | 'actualDisbursementMonth', dateStr: string) => {
 let targetGroupItems: FinancialItem[] = [];
 for (const typeGroup of groupedItems) {
 const found = typeGroup.uacsGroups.find(ug => ug.key === groupKey);
 if (found) {
 targetGroupItems = found.items;
 break;
 }
 }
 if (targetGroupItems.length === 0) return;

 setItems(prev => prev.map(item => {
 if (targetGroupItems.some(gi => gi.uniqueId === item.uniqueId)) {
 const updated = { ...item, [field]: dateStr };
 setChangedItems(prevMap => {
 const newMap = new Map(prevMap);
 newMap.set(item.uniqueId, updated);
 return newMap;
 });
 return updated;
 }
 return item;
 }));
 };

 const handleTitleClick = (item: FinancialItem) => {
 if (item.sourceType === 'Subproject') {
 const sp = subprojects.find(s => s.id === item.sourceId);
 if (sp) onSelectSubproject(sp);
 } else if (item.sourceType === 'Activity') {
 const act = activities.find(a => a.id === item.sourceId);
 if (act) onSelectActivity(act);
 } else if (item.sourceType === 'Office') {
 const req = officeReqs.find(r => r.id === item.sourceId);
 if (req) onSelectOfficeReq(req);
 } else if (item.sourceType === 'Staffing') {
 const req = staffingReqs.find(r => r.id === item.sourceId);
 if (req) onSelectStaffingReq(req);
 } else if (item.sourceType === 'Other') {
 const req = otherProgramExpenses.find(r => r.id === item.sourceId);
 if (req) onSelectOtherExpense(req);
 }
 };

 const syncObligationsToCentralTable = async (item: FinancialItem) => {
 if (!supabase) return;

 const entityType = item.sourceType === 'Subproject' ? 'subproject_detail' :
 item.sourceType === 'Activity' ? 'activity_expense' :
 item.sourceType === 'Staffing' ? 'staffing_expense' :
 item.sourceType === 'Office' ? 'office_requirement' : 'other_program_expense';

 const parentId = item.sourceId;
 const itemId = item.sourceType === 'Staffing'
 ? staffingExpenseItemId(item.detailId)
 : item.detailId?.toString() || null;

 // 1. Delete existing records for this specific item
 let deleteQuery = supabase.from('financial_obligations')
 .delete()
 .eq('entity_type', entityType)
 .eq('parent_id', parentId);

 if (itemId === null) {
 deleteQuery = deleteQuery.is('item_id', null);
 } else {
 deleteQuery = deleteQuery.eq('item_id', itemId);
 }

 const { error: deleteError } = await deleteQuery;

 if (deleteError) {
 console.error("Error deleting old obligations:", deleteError);
 throw deleteError;
 }

 if (!item.obligations || item.obligations.length === 0) return;

 // 2. Insert new records
 const payload = item.obligations.map(o => ({
 entity_type: entityType,
 parent_id: parentId,
 item_id: itemId,
 obligation_date: o.date,
 amount: toFiniteNumber(o.amount),
 remarks: o.remarks || ''
 }));

 const { error: insertError } = await supabase.from('financial_obligations').insert(payload);
 if (insertError) {
 console.error("Error inserting obligations:", insertError);
 throw insertError;
 }
 };

 const syncDisbursementsToCentralTable = async (item: FinancialItem) => {
 if (!supabase) return;

 const entityType = item.sourceType === 'Subproject' ? 'subproject_detail' :
 item.sourceType === 'Activity' ? 'activity_expense' :
 item.sourceType === 'Staffing' ? 'staffing_expense' :
 item.sourceType === 'Office' ? 'office_requirement' : 'other_program_expense';

 const parentId = item.sourceId;
 const itemId = item.sourceType === 'Staffing'
 ? staffingExpenseItemId(item.detailId)
 : item.detailId?.toString() || null;

 let deleteQuery = supabase.from('financial_disbursements')
 .delete()
 .eq('entity_type', entityType)
 .eq('parent_id', parentId);

 if (itemId === null) {
 deleteQuery = deleteQuery.is('item_id', null);
 } else {
 deleteQuery = deleteQuery.eq('item_id', itemId);
 }

 const { error: deleteError } = await deleteQuery;

 if (deleteError) {
 console.error("Error deleting old disbursements:", deleteError);
 throw deleteError;
 }

 if (!item.disbursements || item.disbursements.length === 0) return;

 const payload = item.disbursements.map(d => ({
 entity_type: entityType,
 parent_id: parentId,
 item_id: itemId,
 disbursement_date: d.date,
 amount: toFiniteNumber(d.amount),
 remarks: d.remarks || ''
 }));

 const { error: insertError } = await supabase.from('financial_disbursements').insert(payload);
 if (insertError) {
 console.error("Error inserting disbursements:", insertError);
 throw insertError;
 }
 };

 const saveItemToDB = async (
 item: FinancialItem,
 options: { includeTargets?: boolean; sync?: 'both' | 'obligation' | 'disbursement' } = {}
 ) => {
 const includeTargets = options.includeTargets ?? true;
 const sync = options.sync ?? 'both';
 const submittedAt = new Date().toISOString();
 let commitSourceState = () => {};
 if (item.sourceType === 'Subproject') {
 const sp = subprojects.find(s => s.id === item.sourceId);
 if (!sp) throw new Error("Subproject not found");

 const updatedDetails = sp.details.map(d => {
 if (d.id === item.detailId) {
 const updated = {
 ...d,
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: item.actualDisbursementMonth,
 actualDisbursementAmount: item.actualDisbursementAmount,
 obligations: item.obligations,
 disbursements: item.disbursements
 };
 // Update targets if Proposed
 if (includeTargets && item.status === 'Proposed') {
 updated.obligationMonth = item.targetObligationMonth;
 updated.disbursementMonth = item.targetDisbursementMonth;
 updated.pricePerUnit = item.targetObligationAmount;
 updated.numberOfUnits = 1;
 }
 return updated;
 }
 return d;
 });

 if (supabase) {
 const { error: updateError } = await supabase.from('subprojects').update({ details: updatedDetails }).eq('id', sp.id);
 if (updateError) throw updateError;
 }
 commitSourceState = () => setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, details: updatedDetails } : s));

 } else if (item.sourceType === 'Activity') {
 const act = activities.find(a => a.id === item.sourceId);
 if (!act) throw new Error("Activity not found");

 const updatedExpenses = act.expenses.map(e => {
 if (e.id === item.detailId) {
 const updated = {
 ...e,
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: item.actualDisbursementMonth,
 actualDisbursementAmount: item.actualDisbursementAmount
 };
 // Update targets if Proposed
 if (includeTargets && item.status === 'Proposed') {
 updated.obligationMonth = item.targetObligationMonth;
 updated.disbursementMonth = item.targetDisbursementMonth;
 updated.amount = item.targetObligationAmount;
 }
 return updated;
 }
 return e;
 });

 if (supabase) {
 // Don't include obligations/disbursements in the direct update of activities table
 // as they are stored in the centralized tables and causing schema cache errors
 const { error: updateError } = await supabase.from('activities').update({ expenses: updatedExpenses }).eq('id', act.id);
 if (updateError) throw updateError;
 }
 commitSourceState = () => setActivities(prev => prev.map(a => a.id === act.id ? { ...a, expenses: updatedExpenses } : a));

 } else if (item.sourceType === 'Staffing') {
 const s = staffingReqs.find(req => req.id === item.sourceId);
 if (!s) throw new Error("Staffing Requirement not found");

 let payload: any = {};
 let updatedExpenses = normalizeStaffingExpenses(s.expenses || []);

 if (staffingExpenseItemId(item.detailId)) {
 updatedExpenses = updatedExpenses.map(e => {
 if (e.id === item.detailId) {
 const disbursementSummary = summarizeDisbursements(item.disbursements || [], item.fundYear);
 const updatedExpense: any = {
 ...e,
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: disbursementSummary.latestDate || item.actualDisbursementMonth,
 actualDisbursementAmount: disbursementSummary.total,
 disbursements: item.disbursements || []
 };
 SHORT_MONTHS.forEach(m => {
 updatedExpense[`actualDisbursement${m}`] = disbursementSummary.monthlyFields[`actualDisbursement${m}`];
 });
 // Update targets if Proposed
 if (includeTargets && item.status === 'Proposed') {
 updatedExpense.obligationDate = item.targetObligationMonth;
 updatedExpense.amount = item.targetObligationAmount;
 }
 return updatedExpense;
 }
 return e;
 });

 // Aggregate totals for the root
 let totalActualObli = 0;
 let totalActualDisb = 0;
 const monthlyTotals: any = {};
 SHORT_MONTHS.forEach(m => monthlyTotals[`actualDisbursement${m}`] = 0);

 updatedExpenses.forEach(e => {
 totalActualObli += toFiniteNumber(e.actualObligationAmount);
 totalActualDisb += toFiniteNumber(e.actualDisbursementAmount);
 SHORT_MONTHS.forEach(m => {
 monthlyTotals[`actualDisbursement${m}`] += toFiniteNumber((e as any)[`actualDisbursement${m}`]);
 });
 });

 payload = {
 expenses: updatedExpenses,
 actualObligationAmount: totalActualObli,
 actualDisbursementAmount: totalActualDisb,
 actualObligationDate: item.actualObligationMonth || s.actualObligationDate,
 actualDisbursementDate: item.actualDisbursementMonth || s.actualDisbursementDate,
 ...monthlyTotals
 };

 if (includeTargets && item.status === 'Proposed') {
 payload.obligationDate = item.targetObligationMonth;
 payload.annualSalary = item.targetObligationAmount;
 }

 } else {
 const disbursementSummary = summarizeDisbursements(item.disbursements || [], item.fundYear);
 payload = {
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: disbursementSummary.latestDate || item.actualDisbursementMonth,
 actualDisbursementAmount: disbursementSummary.total
 };
 SHORT_MONTHS.forEach(m => {
 payload[`actualDisbursement${m}`] = disbursementSummary.monthlyFields[`actualDisbursement${m}`];
 });
 if (includeTargets && item.status === 'Proposed') {
 payload.obligationDate = item.targetObligationMonth;
 payload.annualSalary = item.targetObligationAmount;
 }
 }

 const actualDateBasis = getProgramManagementPhysicalDateBasis(payload);
 const previousActualDateBasis = getProgramManagementPhysicalDateBasis(s);
 payload.physical_accomplishment_submitted_at = resolvePhysicalAccomplishmentSubmittedAt({
 hasPhysicalAccomplishment: !!actualDateBasis,
 hasChanged: valuesDiffer(previousActualDateBasis, actualDateBasis),
 previousSubmittedAt: s.physical_accomplishment_submitted_at,
 submittedAt
 });

 if (supabase) {
 const { error: updateError } = await supabase.from('staffing_requirements').update(payload).eq('id', item.sourceId);
 if (updateError) throw updateError;
 }
 commitSourceState = () => setStaffingReqs(prev => prev.map(req => req.id === item.sourceId ? { ...req, ...payload } : req));

 } else if (item.sourceType === 'Other') {
 const disbursementSummary = summarizeDisbursements(item.disbursements || [], item.fundYear);
 const payload: any = {
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: disbursementSummary.latestDate || item.actualDisbursementMonth,
 actualDisbursementAmount: disbursementSummary.total
 };

 SHORT_MONTHS.forEach(m => {
 payload[`actualDisbursement${m}`] = disbursementSummary.monthlyFields[`actualDisbursement${m}`];
 });

 if (includeTargets && item.status === 'Proposed') {
 payload.obligationDate = item.targetObligationMonth;
 payload.disbursementDate = item.targetDisbursementMonth;
 payload.amount = item.targetObligationAmount;
 }

 if (supabase) {
 const { error: updateError } = await supabase.from('other_program_expenses').update(payload).eq('id', item.sourceId);
 if (updateError) throw updateError;
 }
 commitSourceState = () => setOtherProgramExpenses(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
 } else if (item.sourceType === 'Office') {
 const payload: any = {
 actualObligationDate: item.actualObligationMonth,
 actualObligationAmount: item.actualObligationAmount,
 actualDisbursementDate: item.actualDisbursementMonth,
 actualDisbursementAmount: item.actualDisbursementAmount,
 obligations: item.obligations,
 disbursements: item.disbursements
 };
 if (includeTargets && item.status === 'Proposed') {
 payload.obligationDate = item.targetObligationMonth;
 payload.disbursementDate = item.targetDisbursementMonth;
 payload.pricePerUnit = item.targetObligationAmount;
 payload.numberOfUnits = 1;
 }
 const o = officeReqs.find(req => req.id === item.sourceId);
 const actualDateBasis = getProgramManagementPhysicalDateBasis(payload);
 const previousActualDateBasis = getProgramManagementPhysicalDateBasis(o || {});
 payload.physical_accomplishment_submitted_at = resolvePhysicalAccomplishmentSubmittedAt({
 hasPhysicalAccomplishment: !!actualDateBasis,
 hasChanged: valuesDiffer(previousActualDateBasis, actualDateBasis),
 previousSubmittedAt: o?.physical_accomplishment_submitted_at,
 submittedAt
 });
 if (supabase) {
 const { error: updateError } = await supabase.from('office_requirements').update(payload).eq('id', item.sourceId);
 if (updateError) throw updateError;
 }
 commitSourceState = () => setOfficeReqs(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
 }

 // Sync with centralized obligations table
 if (sync === 'both' || sync === 'obligation') await syncObligationsToCentralTable(item);
 if (sync === 'both' || sync === 'disbursement') await syncDisbursementsToCentralTable(item);
 commitSourceState();
 };

 const undoLocalItem = (uniqueId: string) => {
 const original = originalItems.find(i => i.uniqueId === uniqueId);
 if (original) {
 setItems(prev => prev.map(item => item.uniqueId === uniqueId ? original : item));
 setChangedItems(prev => {
 const next = new Map(prev);
 next.delete(uniqueId);
 return next;
 });
 }
 };

 const handleSort = (key: SortKey) => {
 setSortConfig(prev => {
 if (prev?.key === key) {
 if (prev.direction === 'asc') return { key, direction: 'desc' };
 return null; // clear sort
 }
 return { key, direction: 'asc' };
 });
 };

 const SortIcon = (key: SortKey) => {
 if (sortConfig?.key !== key) return <ArrowUpDown className="fac-sort-icon" />;
 return sortConfig.direction === 'asc' ? <ArrowUp className="fac-sort-icon is-active" /> : <ArrowDown className="fac-sort-icon is-active" />;
 };

 const handleSaveAllClick = () => {
 if (!canEdit || changedItems.size === 0) return;
 setIsSaveConfirmOpen(true);
 };

 const confirmSaveAll = async () => {
 setIsSaveConfirmOpen(false);
 setIsSavingAll(true);
 try {
 const itemsToSave: FinancialItem[] = Array.from(changedItems.values() as Iterable<FinancialItem>);
 for (const item of itemsToSave) {
 if (!(await validateFinancialItemForSave(item))) {
 setIsSavingAll(false);
 return;
 }
 }
 await Promise.all(itemsToSave.map((item: FinancialItem) => saveItemToDB(item)));

 // Mark as saved and clear changes (but don't lock)
 setItems(prev => prev.map(item => {
 if (changedItems.has(item.uniqueId)) {
 return { ...item, isConfirmed: false };
 }
 return item;
 }));
 setChangedItems(new Map());
 setSaveSuccessMessage('Changes saved successfully!');
 setTimeout(() => setSaveSuccessMessage(''), 3000);
 } catch (error: any) {
 console.error("Error saving all changes:", error);
 alert("Failed to save some changes." + error.message);
 } finally {
 setIsSavingAll(false);
 }
 };

 const handleConfirmItem = async (item: FinancialItem) => {
 if (!canEdit) return;
 if (!(await validateFinancialItemForSave(item))) return;

 setLocalSavingIds(prev => new Set(prev).add(item.uniqueId));
 try {
 await saveItemToDB(item);

 updateLocalItem(item.uniqueId, { isConfirmed: false });
 setChangedItems(prev => {
 const newMap = new Map(prev);
 newMap.delete(item.uniqueId);
 return newMap;
 });

 } catch (error: any) {
 console.error("Error saving accomplishment:", error);
 alert("Failed to save changes:" + (error.message ||"Unknown error"));
 } finally {
 setLocalSavingIds(prev => {
 const newSet = new Set(prev);
 newSet.delete(item.uniqueId);
 return newSet;
 });
 }
 };

 const mergeActualRecords = (
 item: FinancialItem,
 kind: 'obligation' | 'disbursement',
 records: ObligationRecord[] | DisbursementRecord[]
 ): FinancialItem => {
 if (kind === 'obligation') {
 const obligations = records as ObligationRecord[];
 const latest = [...obligations]
 .filter(record => record.date)
 .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || '';
 return {
 ...item,
 obligations,
 actualObligationAmount: sumAmounts(obligations),
 actualObligationMonth: latest,
 };
 }
 const disbursements = records as DisbursementRecord[];
 const summary = summarizeDisbursements(disbursements, item.fundYear);
 return {
 ...item,
 disbursements,
 actualDisbursementAmount: summary.total,
 actualDisbursementMonth: summary.latestDate,
 ...summary.monthlyFields,
 };
 };

 const openActualsDialog = (item: FinancialItem, kind: 'obligation' | 'disbursement') => {
 setActualsDialogError('');
 setActualsDialog({ itemId: item.uniqueId, kind });
 };

 const closeActualsDialog = () => {
 if (actualsDialogSaving) return;
 setActualsDialog(null);
 setActualsDialogError('');
 };

 const handleCategoryKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentCategory: FinancialCategory) => {
 if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
 event.preventDefault();
 const currentIndex = categories.indexOf(currentCategory);
 const nextIndex = event.key === 'Home'
 ? 0
 : event.key === 'End'
 ? categories.length - 1
 : event.key === 'ArrowRight'
 ? (currentIndex + 1) % categories.length
 : (currentIndex - 1 + categories.length) % categories.length;
 const nextCategory = categories[nextIndex];
 setCategory(nextCategory);
 document.getElementById(`financial-category-${nextIndex}`)?.focus();
 };

 const saveActualRecords = async (draftRecords: ObligationRecord[] | DisbursementRecord[]) => {
 if (!actualsDialog) return;
 const item = items.find(candidate => candidate.uniqueId === actualsDialog.itemId);
 if (!item) {
 setActualsDialogError('This financial line is no longer available. Close the dialog and try again.');
 return;
 }

 const normalizedRecords = draftRecords.map((record, index) => ({
 ...record,
 id: Number(record.id) < 0 ? Date.now() + index : record.id,
 amount: toFiniteNumber(record.amount),
 date: normalizeFinancialMonthValue(record.date, item.fundYear),
 }));
 const invalidRecord = normalizedRecords.find(record => record.amount <= 0 || !record.date);
 if (invalidRecord) {
 setActualsDialogError('Each entry requires an amount greater than zero and a month/year.');
 return;
 }
 if (!(await ensureFinancialItemAllowed(item))) {
 setActualsDialogError(getFinancialStatusDecision(item).message || 'You do not have permission to edit this financial line.');
 return;
 }

 const currentRecords = actualsDialog.kind === 'obligation' ? item.obligations : item.disbursements;
 const changedMonths = getChangedRecordMonths(normalizedRecords, currentRecords);
 for (const month of changedMonths) {
 if (!(await validateFinancialActualMonth(item, month))) {
 setActualsDialogError(getMonthLockMessage(getMonthDecision(month)) || 'The selected month is locked.');
 return;
 }
 }

 setActualsDialogSaving(true);
 setActualsDialogError('');
 skipNextFinancialReloadRef.current = true;
 try {
 const savedItem = mergeActualRecords(item, actualsDialog.kind, normalizedRecords);
 await saveItemToDB(savedItem, { includeTargets: false, sync: actualsDialog.kind });
 const mergeSavedActuals = (candidate: FinancialItem) => candidate.uniqueId === savedItem.uniqueId
 ? mergeActualRecords(candidate, actualsDialog.kind, normalizedRecords)
 : candidate;
 setItems(previous => previous.map(mergeSavedActuals));
 setOriginalItems(previous => previous.map(mergeSavedActuals));
 setChangedItems(previous => {
 const next = new Map<string, FinancialItem>(previous);
 const changed = next.get(savedItem.uniqueId);
 if (changed) next.set(savedItem.uniqueId, mergeActualRecords(changed, actualsDialog.kind, normalizedRecords));
 return next;
 });
 setSaveSuccessMessage(`Actual ${actualsDialog.kind === 'obligation' ? 'obligations' : 'disbursements'} saved successfully.`);
 setTimeout(() => setSaveSuccessMessage(''), 3000);
 setActualsDialog(null);
 } catch (error: any) {
 skipNextFinancialReloadRef.current = false;
 console.error(`Error saving actual ${actualsDialog.kind}s:`, error);
 setActualsDialogError(error?.message || `Failed to save actual ${actualsDialog.kind}s. Your draft has been kept.`);
 } finally {
 setActualsDialogSaving(false);
 }
 };

 const activeActualsItem = actualsDialog
 ? items.find(candidate => candidate.uniqueId === actualsDialog.itemId) || null
 : null;
 const activeActualsCanEdit = activeActualsItem
 ? canEdit && getFinancialStatusDecision(activeActualsItem).allowed
 : false;

 // --- Render ---

 return (
 <div className="data-list-page financial-accomplishment-page">
 <div className="data-list-header">
 <div>
 <h2 className="data-list-title">Financial Accomplishment Collection Form</h2>
 <p className="data-list-subtitle">Track obligation and disbursement accomplishments across the applied funding scope.</p>
 </div>
 </div>
 <DcfScopeFilterPanel idPrefix="financial-accomplishment" filters={dcfFilters} />

 {isLoading ? (
 <LoadingState label="Loading financial data..." />
 ) : (
 <>
 <section className="financial-accomplishment-summary-grid" aria-label="Financial accomplishment summary">
 {financialSummaryCards.map(card => (
 <div key={card.label} className={`financial-accomplishment-summary-card financial-accomplishment-summary-card--${card.tone}`}>
 <div className="financial-accomplishment-summary-card__header">
 <span>{card.label}</span>
 <card.icon aria-hidden="true" />
 </div>
 <strong>{formatCurrency(card.value)}</strong>
 <small>{card.indicator}</small>
 </div>
 ))}
 </section>
 <section className="financial-accomplishment-progress" aria-label="Financial progress">
 {financialProgress.map(progress => {
 const displayValue = progress.value === null ? 0 : progress.value;
 const clampedValue = Math.min(100, Math.max(0, displayValue));
 return (
 <div className="financial-accomplishment-progress__item" key={progress.label}>
 <div className="financial-accomplishment-progress__header">
 <span>{progress.label}</span>
 <strong>{progress.value === null ? 'No target' : `${progress.value}%`}</strong>
 </div>
 <div className="financial-accomplishment-progress__track" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clampedValue}>
 <span style={{ width: `${clampedValue}%` }} />
 </div>
 <small>{progress.detail}</small>
 </div>
 );
 })}
 </section>
 <div className="financial-accomplishment-category-tabs" role="tablist" aria-label="Financial category">
 {categories.map(option => (
 <button key={option} id={`financial-category-${categories.indexOf(option)}`} type="button" role="tab" tabIndex={category === option ? 0 : -1} onClick={() => setCategory(option)} onKeyDown={event => handleCategoryKeyDown(event, option)} className={category === option ? 'is-active' : ''} aria-selected={category === option} aria-controls="financial-accomplishment-table-panel">
 <span>{option}</span>
 </button>
 ))}
 </div>
 <div id="financial-accomplishment-table-panel" className="data-table-card financial-accomplishment-table-card" role="tabpanel">
 <div className="data-table-scroll financial-accomplishment-table-scroll custom-scrollbar">
 <table className="data-table financial-accomplishment-table ">
 <colgroup>
 <col className="fac-width-particulars" />
 <col className="fac-width-money" />
 <col className="fac-width-month" />
 <col className="fac-width-money" />
 <col className="fac-width-money" />
 <col className="fac-width-money" />
 <col className="fac-width-month" />
 <col className="fac-width-money" />
 <col className="fac-width-action" />
 </colgroup>
 <thead>
 <tr>
 <th className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars financial-accomplishment-sticky-head fac-header-particulars">Particulars / UACS</th>
 {/* Target Obligation */}
 <th colSpan={2} className="fac-col-target-obligation px-4 py-2 text-center border-l border-b ">Target Obligation</th>

 {/* Actual Obligation */}
 <th className="fac-col-actual-obligation">Actual Obligation</th>

 {/* Unobligated */}
 <th className="fac-col-unobligated">Unobligated Amount</th>

 {/* Target Disbursement */}
 <th colSpan={2} className="fac-col-target-disbursement px-4 py-2 text-center border-l border-b ">Target Disbursement</th>

 {/* Actual Disbursement */}
 <th className="fac-col-actual-disbursement">Actual Disbursement</th>

 <th className="fac-header-action fac-col-action">Action</th>
 </tr>
 <tr>
 <th className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars financial-accomplishment-sticky-head fac-header-spacer" aria-hidden="true"></th>
 {/* Target Obligation */}
 <th className="fac-col-target-obligation px-2 py-2 text-center border-l ">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('targetObligationAmount')}>Amount {SortIcon('targetObligationAmount')}</button>
 </th>
 <th className="fac-col-target-obligation px-2 py-2 text-center ">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('targetObligationMonth')}>Date {SortIcon('targetObligationMonth')}</button>
 </th>

 <th className="fac-col-actual-obligation border-l">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('actualObligationAmount')}>Obligations {SortIcon('actualObligationAmount')}</button>
 </th>

 <th className="fac-col-unobligated border-l">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('unobligatedAmount')}>Amount {SortIcon('unobligatedAmount')}</button>
 </th>

 {/* Target Disbursement */}
 <th className="fac-col-target-disbursement px-2 py-2 text-center border-l ">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('targetDisbursementAmount')}>Amount {SortIcon('targetDisbursementAmount')}</button>
 </th>
 <th className="fac-col-target-disbursement px-2 py-2 text-center ">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('targetDisbursementMonth')}>Date {SortIcon('targetDisbursementMonth')}</button>
 </th>

 {/* Actual Disbursement */}
 <th className="fac-col-actual-disbursement border-l">
 <button type="button" className="fac-sort-button" onClick={() => handleSort('actualDisbursementAmount')}>Disbursements {SortIcon('actualDisbursementAmount')}</button>
 </th>
 <th className="fac-header-action fac-col-action fac-header-spacer" aria-hidden="true"></th>
 </tr>
 </thead>
 <tbody className="fac-table-body">
 {groupedItems.map((typeGroup) => {
 const isTypeExpanded = expandedObjectTypes.includes(typeGroup.objectType);
 const objectTypeTotalTargetObli = typeGroup.uacsGroups.reduce((sum, group) => sum + toFiniteNumber(group.totalTargetObli), 0);
 const objectTypeTotalActualObli = typeGroup.uacsGroups.reduce((sum, group) => sum + toFiniteNumber(group.totalActualObli), 0);
 const objectTypeTotalUnobligated = typeGroup.uacsGroups.reduce((sum, group) => sum + group.items.reduce((itemSum, item) => itemSum + getUnobligatedAmount(item), 0), 0);
 const objectTypeTotalTargetDisb = typeGroup.uacsGroups.reduce((sum, group) => sum + toFiniteNumber(group.totalTargetDisb), 0);
 const objectTypeTotalActualDisb = typeGroup.uacsGroups.reduce((sum, group) => sum + toFiniteNumber(group.totalActualDisb), 0);
 return (
 <React.Fragment key={typeGroup.objectType}>
 {/* Level 1: Object Type Header (Container) */}
 <tr className="fac-row-object">
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-4 py-3">
 <button onClick={() => toggleObjectType(typeGroup.objectType)} className="fac-drill-button group w-full" aria-expanded={isTypeExpanded}>
 <span className="fac-expand-toggle" aria-hidden="true">{isTypeExpanded ? <ChevronDown /> : <ChevronRight />}</span>
 <span className="fac-drill-text">{getObjectTypeLabel(typeGroup.objectType)}</span>
 </button>
 </td>
 <td className="fac-col-target-obligation fac-collapsed-total px-4 py-3 text-center border-l ">
 {formatCurrency(objectTypeTotalTargetObli)}
 </td>
 <td className="fac-col-target-obligation px-4 py-3 text-center ">—</td>
 <td className="fac-col-actual-obligation fac-collapsed-total">{formatCurrency(objectTypeTotalActualObli)}</td>
 <td className={`fac-col-unobligated fac-collapsed-total ${objectTypeTotalUnobligated < 0 ? 'is-negative' : ''}`}>{formatCurrency(objectTypeTotalUnobligated)}</td>
 <td className="fac-col-target-disbursement fac-collapsed-total px-4 py-3 text-center border-l ">{formatCurrency(objectTypeTotalTargetDisb)}</td>
 <td className="fac-col-target-disbursement px-4 py-3 text-center ">—</td>
 <td className="fac-col-actual-disbursement fac-collapsed-total">{formatCurrency(objectTypeTotalActualDisb)}</td>
 <td className="fac-col-action px-4 py-3"></td>
 </tr>

 {/* Level 2: UACS Groups */}
 {isTypeExpanded && typeGroup.uacsGroups.map((group) => {
 const isExpanded = expandedGroups.includes(group.key);
 const groupUnobligated = group.items.reduce((sum, item) => sum + getUnobligatedAmount(item), 0);
 // Determine if all items have same month to display in group header
 return (
 <React.Fragment key={group.key}>
 {/* Group Header Row (UACS) */}
 <tr className="fac-row-uacs">
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-4 py-3">
 <button onClick={() => toggleGroup(group.key)} className="fac-drill-button group text-left w-full" title={`${group.uacsCode} ${group.particular}`} aria-expanded={isExpanded}>
 <span className="fac-expand-toggle" aria-hidden="true">{isExpanded ? <ChevronDown /> : <ChevronRight />}</span>
 <span className="fac-drill-text" title={`${group.uacsCode} ${group.particular}`}>
 <span className="fac-uacs-primary">
 <span className="fac-uacs-code">{group.uacsCode}</span>
 <span className="fac-uacs-copy">
 <span className="fac-uacs-particular">{group.particular}</span>
 {group.description && group.description !== group.particular && <span className="fac-uacs-description">{group.description}</span>}
 </span>
 <Lock className="fac-rollup-lock" aria-label="Roll-up total" />
 </span>
 </span>
 </button>
 </td>
 {/* Targets Total */}
 <td className="fac-col-target-obligation fac-collapsed-total px-4 py-3 text-center border-l ">{formatCurrency(group.totalTargetObli)}</td>
 <td className="fac-col-target-obligation px-4 py-3 text-center ">—</td>

 {/* Actual Obli Total & Batch */}
 <td className="fac-col-actual-obligation">
 {formatCurrency(group.totalActualObli)}
 </td>
 <td className={`fac-col-unobligated fac-collapsed-total ${groupUnobligated < 0 ? 'is-negative' : ''}`}>{formatCurrency(groupUnobligated)}</td>

 {/* Target Disb Total */}
 <td className="fac-col-target-disbursement fac-collapsed-total px-4 py-3 text-center border-l ">{formatCurrency(group.totalTargetDisb)}</td>
 <td className="fac-col-target-disbursement px-4 py-3 text-center ">—</td>

 {/* Actual Disb Total & Batch */}
 <td className="fac-col-actual-disbursement fac-collapsed-total">{formatCurrency(group.totalActualDisb)}</td>
 <td className="fac-col-action px-4 py-3"></td>
 </tr>

 {/* Expanded Content (Subgroups) */}
 {isExpanded && Object.entries(group.subGroups).map(([subKey, sourceGroups]) => {
 // Fix: Explicitly cast items to FinancialItem[] to resolve unknown type errors (length, map, etc.)
 const typedSourceGroups = sourceGroups as { sourceId: number, sourceName: string, items: FinancialItem[], targetObligationAmount: number, actualObligationAmount: number, targetDisbursementAmount: number, actualDisbursementAmount: number }[];
 if (typedSourceGroups.length === 0) return null;
 const subId = `${group.key}-${subKey}`;
 const isSubExpanded = expandedSubGroups.includes(subId);
 const subGroupTotalTargetObli = typedSourceGroups.reduce((sum, sourceGroup) => sum + toFiniteNumber(sourceGroup.targetObligationAmount), 0);
 const subGroupTotalActualObli = typedSourceGroups.reduce((sum, sourceGroup) => sum + toFiniteNumber(sourceGroup.actualObligationAmount), 0);
 const subGroupTotalUnobligated = typedSourceGroups.reduce((sum, sourceGroup) => sum + sourceGroup.items.reduce((itemSum, item) => itemSum + getUnobligatedAmount(item), 0), 0);
 const subGroupTotalTargetDisb = typedSourceGroups.reduce((sum, sourceGroup) => sum + toFiniteNumber(sourceGroup.targetDisbursementAmount), 0);
 const subGroupTotalActualDisb = typedSourceGroups.reduce((sum, sourceGroup) => sum + toFiniteNumber(sourceGroup.actualDisbursementAmount), 0);

 return (
 <React.Fragment key={subId}>
 <tr className="fac-row-category border-b ">
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-4 py-2">
 <button onClick={() => toggleSubGroup(subId)} className="fac-drill-button " aria-expanded={isSubExpanded}>
 <span className="fac-expand-toggle fac-expand-toggle--small" aria-hidden="true">{isSubExpanded ? <ChevronDown /> : <ChevronRight />}</span>
 <span className="fac-drill-text">{subKey}</span>
 </button>
 </td>
 <td className="fac-col-target-obligation fac-collapsed-total px-4 py-2 text-center border-l ">
 {formatCurrency(subGroupTotalTargetObli)}
 </td>
 <td className="fac-col-target-obligation px-4 py-2 text-center ">—</td>
 <td className="fac-col-actual-obligation fac-collapsed-total">{formatCurrency(subGroupTotalActualObli)}</td>
 <td className={`fac-col-unobligated fac-collapsed-total ${subGroupTotalUnobligated < 0 ? 'is-negative' : ''}`}>{formatCurrency(subGroupTotalUnobligated)}</td>
 <td className="fac-col-target-disbursement fac-collapsed-total px-4 py-2 text-center border-l ">{formatCurrency(subGroupTotalTargetDisb)}</td>
 <td className="fac-col-target-disbursement px-4 py-2 text-center ">—</td>
 <td className="fac-col-actual-disbursement fac-collapsed-total">{formatCurrency(subGroupTotalActualDisb)}</td>
 <td className="fac-col-action px-4 py-2"></td>
 </tr>
 {isSubExpanded && typedSourceGroups.map(sourceGroup => {
 const sourceId = `${subId}-${sourceGroup.sourceId}`;

 const sortedItems = sortConfig ? [...sourceGroup.items].sort((a, b) => {
 let valA = sortConfig.key === 'unobligatedAmount' ? getUnobligatedAmount(a) : a[sortConfig.key];
 let valB = sortConfig.key === 'unobligatedAmount' ? getUnobligatedAmount(b) : b[sortConfig.key];
 if (valA === valB) return 0;
 if (valA === undefined || valA === null) return 1;
 if (valB === undefined || valB === null) return -1;
 if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
 if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
 return 0;
 }) : sourceGroup.items;

 return (
 <React.Fragment key={sourceId}>
 {sortedItems.map(item => {
 const isChanged = changedItems.has(item.uniqueId);
 const contextDescription = getContextDescription(item);
 const isTagged = isTaggedExclusion(item);
 const taggedLabel = item.isCancelled ? 'Cancelled' : item.isSavings ? 'Savings' : item.isRealignment ? 'Realignment' : '';
 const itemFinancialDecision = getFinancialStatusDecision(item);
 const canEditFinancialItem = canEdit && itemFinancialDecision.allowed;

 return (
 <React.Fragment key={item.uniqueId}>
 <tr className={`fac-row-item border-b ${isTagged ? 'is-tagged-exclusion' : ''} ${isChanged ? 'is-changed ' : ''}`}>
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-3 py-1.5 ">
 <button
 onClick={() => handleTitleClick(item)}
 className="fac-item-title text-left "
 title={`${item.sourceType === 'Subproject' && item.budgetParticular ? item.budgetParticular : item.expenseParticular}${contextDescription ? ` - ${contextDescription}` : ''}${taggedLabel ? ` (${taggedLabel})` : ''}`}
 >
 <span className="fac-item-primary block leading-tight">
 <span>{item.sourceType === 'Subproject' && item.budgetParticular ? item.budgetParticular : item.expenseParticular}</span>
 {taggedLabel && <span className="fac-tagged-badge">{taggedLabel}</span>}
 </span>
 {contextDescription && (
 <span className="fac-item-description mt-0.5 block leading-tight no-underline">
 {contextDescription}
 </span>
 )}
 </button>
 </td>

 {/* Target Obli */}
 <td className={`fac-col-target-obligation px-2 py-1.5 text-center border-l ${isTagged ? 'fac-target-excluded fac-target-excluded-amount' : ''}`}>
 {item.status === 'Proposed' ? (
 <FinancialAmountCell
 value={toFiniteNumber(item.targetObligationAmount)}
 onChange={(value) => updateLocalItem(item.uniqueId, { targetObligationAmount: value })}
 disabled={!canEditFinancialItem}
 ariaLabel={`${item.sourceName} target obligation amount`}
 emptyWhenZero
 />
 ) : (
 formatCurrency(item.targetObligationAmount)
 )}
 </td>
 <td className={`fac-col-target-obligation px-2 py-1.5 text-center ${isTagged ? 'fac-target-excluded' : ''}`}>
 {item.targetObligationMonth === 'Monthly' ? (
 'Monthly'
 ) : item.status === 'Proposed' ? (
 <FinancialMonthCell
 value={item.targetObligationMonth}
 onChange={(val) => updateLocalItem(item.uniqueId, { targetObligationMonth: val })}
 disabled={!canEditFinancialItem}
 ariaLabel={`${item.sourceName} target obligation month`}
 fallbackYear={item.fundYear}
 />
 ) : (
 formatFinancialMonth(item.targetObligationMonth, item.fundYear)
 )}
 </td>

 {/* Actual Obli */}
 <td className="fac-col-actual-obligation">
 <button
 type="button"
 className={`fac-actuals-trigger ${item.actualObligationAmount > 0 ? 'has-value' : ''}`}
 onClick={() => openActualsDialog(item, 'obligation')}
 aria-label={`${item.actualObligationAmount > 0 ? 'Manage' : 'Add'} actual obligations for ${item.sourceName}`}
 >
 {item.actualObligationAmount > 0 ? formatCurrency(item.actualObligationAmount) : '+ Add obligation'}
 </button>
 </td>

 <td className={`fac-col-unobligated fac-collapsed-total ${getUnobligatedAmount(item) < 0 ? 'is-negative' : ''}`}>
 {formatCurrency(getUnobligatedAmount(item))}
 </td>

 {/* Target Disb */}
 <td className={`fac-col-target-disbursement px-2 py-1.5 text-center border-l ${isTagged ? 'fac-target-excluded fac-target-excluded-amount' : ''}`}>
 {item.status === 'Proposed' ? (
 <FinancialAmountCell
 value={toFiniteNumber(item.targetDisbursementAmount)}
 onChange={(value) => updateLocalItem(item.uniqueId, { targetDisbursementAmount: value })}
 disabled={!canEditFinancialItem}
 ariaLabel={`${item.sourceName} target disbursement amount`}
 emptyWhenZero
 />
 ) : (
 formatCurrency(item.targetDisbursementAmount)
 )}
 </td>
 <td className={`fac-col-target-disbursement px-2 py-1.5 text-center ${isTagged ? 'fac-target-excluded' : ''}`}>
 {item.targetDisbursementMonth === 'Monthly' ? (
 'Monthly'
 ) : item.status === 'Proposed' ? (
 <FinancialMonthCell
 value={item.targetDisbursementMonth}
 onChange={(val) => updateLocalItem(item.uniqueId, { targetDisbursementMonth: val })}
 disabled={!canEditFinancialItem}
 ariaLabel={`${item.sourceName} target disbursement month`}
 fallbackYear={item.fundYear}
 />
 ) : (
 formatFinancialMonth(item.targetDisbursementMonth, item.fundYear)
 )}
 </td>

 {/* Actual Disbursement */}
 <td className="fac-col-actual-disbursement">
 <button
 type="button"
 className={`fac-actuals-trigger ${item.actualDisbursementAmount > 0 ? 'has-value' : ''}`}
 onClick={() => openActualsDialog(item, 'disbursement')}
 aria-label={`${item.actualDisbursementAmount > 0 ? 'Manage' : 'Add'} actual disbursements for ${item.sourceName}`}
 >
 {item.actualDisbursementAmount > 0 ? formatCurrency(item.actualDisbursementAmount) : '+ Add disbursement'}
 </button>
 </td>

 <td className="fac-col-action px-4 py-1.5 text-right">
 <div className="flex items-center gap-1 justify-end">
 {canEdit && (
 <>
 {isChanged && !localSavingIds.has(item.uniqueId) && (
 <button
 onClick={() => undoLocalItem(item.uniqueId)}
 className="table-action table-action--warning table-action--icon"
 title="Undo changes"
 >
 <Undo2 className="w-4 h-4" />
 </button>
 )}
 <button
 onClick={() => handleConfirmItem(item)}
 disabled={localSavingIds.has(item.uniqueId) || !canEditFinancialItem}
 className="btn btn-primary btn-sm fac-save-button"
 title={canEditFinancialItem ? 'Save row' : itemFinancialDecision.message}
 >
 {localSavingIds.has(item.uniqueId) ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
 </button>
 </>
 )}
 </div>
 </td>
 </tr>
 </React.Fragment>
 );
 })}
 </React.Fragment>
 );
 })}
 </React.Fragment>
 );
 })}
 </React.Fragment>
 );
 })}
 </React.Fragment>
 )
 })}
 {groupedItems.length === 0 && (
 <tr>
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-4 py-8"></td>
 <td colSpan={8} className="px-6 py-8 text-center italic">No financial items found for the selected criteria.</td>
 </tr>
 )}
 </tbody>
 <tfoot>
 <tr>
 <td className="financial-accomplishment-sticky-col financial-accomplishment-sticky-particulars px-4 py-3 text-right ">{category === 'All' ? 'GRAND TOTAL' : `${category.toUpperCase()} SUBTOTAL`}</td>
 <td className="fac-col-target-obligation px-4 py-3 text-center border-l ">{formatCurrency(grandTotals.targetObli)}</td>
 <td className="fac-col-target-obligation px-4 py-3"></td>
 <td className="fac-col-actual-obligation px-4 py-3 text-center border-l ">{formatCurrency(grandTotals.actualObli)}</td>
 <td className={`fac-col-unobligated px-4 py-3 text-center border-l ${grandTotals.unobligated < 0 ? 'is-negative' : ''}`}>{formatCurrency(grandTotals.unobligated)}</td>
 <td className="fac-col-target-disbursement px-4 py-3 text-center border-l ">{formatCurrency(grandTotals.targetDisb)}</td>
 <td className="fac-col-target-disbursement px-4 py-3"></td>
 <td className="fac-col-actual-disbursement px-4 py-3 text-center border-l ">{formatCurrency(grandTotals.actualDisb)}</td>
 <td className="fac-col-action px-4 py-3"></td>
 </tr>
 <tr className="fac-table-meta-row">
 <td colSpan={9}>{visibleItems.length} line {visibleItems.length === 1 ? 'item' : 'items'} shown <span aria-hidden="true">·</span> All amounts in Philippine Peso (₱)</td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>
 </>
 )}

 {/* Global Save Bar */}
 {changedItems.size > 0 && (
 <div className="financial-savebar animate-in slide-in-from-bottom duration-300">
 <div className="financial-savebar__status">
 <span>
 <span className="status-badge status-badge--approved status-badge--compact">
 {changedItems.size}
 </span>
 Unsaved changes in financial accomplishments
 </span>
 </div>
 <div className="financial-savebar__actions">
 <button
 onClick={() => {
 setChangedItems(new Map());
 // We don't reload items here to avoid losing all progress,
 // but we clear the highlight
 setItems(prev => prev.map(item => ({ ...item })));
 }}
 className="btn btn-secondary"
 >
 Discard Changes
 </button>
 <button
 onClick={handleSaveAllClick}
 disabled={isSavingAll}
 className="btn btn-primary"
 >
 {isSavingAll ? (
 <>
 <svg className="animate-spin h-4 w-4 " xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
 </svg>
 Saving Changes...
 </>
 ) : 'Save All Changes'}
 </button>
 </div>
 </div>
 )}

 {/* Save Confirmation Modal */}
 {isSaveConfirmOpen && (
 <ConfirmDialog
 title="Confirm Save"
 description={`Are you sure you want to save ${changedItems.size} changes? This action will update the database.`}
 confirmLabel="Yes, Save Changes"
 onConfirm={confirmSaveAll}
 onCancel={() => setIsSaveConfirmOpen(false)}
 />
 )}

 {actualsDialog && activeActualsItem && (
 <FinancialActualsDialog
 open
 kind={actualsDialog.kind}
 lineItemName={activeActualsItem.sourceType === 'Subproject' && activeActualsItem.budgetParticular ? activeActualsItem.budgetParticular : activeActualsItem.expenseParticular}
 fallbackYear={activeActualsItem.fundYear}
 records={actualsDialog.kind === 'obligation' ? activeActualsItem.obligations : activeActualsItem.disbursements}
 readOnly={!activeActualsCanEdit}
 saving={actualsDialogSaving}
 error={actualsDialogError}
 onClose={closeActualsDialog}
 onSave={saveActualRecords}
 />
 )}

 {/* Success Message Toast */}
 {saveSuccessMessage && (
 <div className="app-toast app-toast--success animate-in slide-in-from-bottom-5">
 <CheckCircle className="w-5 h-5" />
 <span>{saveSuccessMessage}</span>
 </div>
 )}
 {monthLockMessage && (
 <div className="app-toast app-toast--warning animate-in slide-in-from-bottom-5" role="status">
 <span>{monthLockMessage}</span>
 </div>
 )}
 </div>
 );
};

export default FinancialAccomplishment;
