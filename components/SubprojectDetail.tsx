
// Author: 4K
import React, { useState, FormEvent, useEffect, useMemo, useCallback } from 'react';
import { Subproject, SubprojectDetail as SubprojectDetailType, IPO, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, filterYears, operatingUnits, ouToRegionMap, RefCommodity, RefLivestock } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { MonthYearPicker } from './ui/MonthYearPicker';
import { ObligationsEditor } from './accomplishment/ObligationsEditor';
import { DisbursementsEditor } from './accomplishment/DisbursementsEditor';
import { supabase } from '../supabaseClient';
import { resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../lib/physicalAccomplishmentTimestamp';
import { resolveSubprojectCompletionRollup } from '../lib/subprojectCompletion';
import { resolveIpoByIdOrName } from '../lib/entityIdentity';
import { isMonthTargetOverdue } from '../lib/dateStatus';
import { ConfirmDialog } from './ui/enterprise';
import { getActualDisbursementSummary, getActualObligationSummary, hasFinancialActuals } from '../lib/financialActualSummary';
import {
    BudgetItemAdjustmentHistory,
    ensureOriginalBudgetSnapshot,
    getBudgetLineAmount,
    getBudgetLineTag,
    isBudgetLineExcludedFromTargets,
    normalizeBudgetLineStatus,
    requestAdjustmentReason,
    summarizeBudgetAdjustments,
    writeBudgetItemAdjustmentHistory
} from '../lib/budgetLineAdjustments';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Edit3, ExternalLink, Eye, FileText, HardDrive, ImageIcon, Info, Loader2, Pencil, Plus, Trash2, UploadCloud, X } from 'lucide-react';
import {
    canPreviewSubprojectDriveFile,
    deleteSubprojectDriveFile,
    formatFileSize,
    getGoogleDriveStatus,
    getSubprojectDriveImageUrl,
    getSubprojectDrivePreviewUrl,
    GoogleDriveStatus,
    isAllowedSubprojectDriveFile,
    isSubprojectDriveImageFile,
    listSubprojectDriveFiles,
    SUBPROJECT_DRIVE_FILE_ACCEPT,
    SubprojectDriveFile,
    uploadSubprojectDriveFile
} from '../lib/googleDriveStorage';

interface SubprojectDetailProps {
    subproject: Subproject;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateSubproject: (updatedSubproject: Subproject) => void;
    particularTypes: { [key: string]: string[] };
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    commodityCategories: { [key: string]: string[] };
    refCommodities: RefCommodity[];
    refLivestock: RefLivestock[];
}

// Extended interface for local editing including completion flag
interface SubprojectDetailInput extends Omit<SubprojectDetailType, 'id'> {
    id?: number; // Optional locally until saved
    isCompleted?: boolean;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    switch (status) {
        case 'Completed': return 'status-badge status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--cancelled';
        default: return 'status-badge status-badge--neutral';
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value">{value || 'N/A'}</dd>
    </div>
);

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

type SubprojectDetailSectionKey = 'commodities' | 'budget' | 'accomplishment' | 'gallery' | 'files';

const CollapsibleDetailCard: React.FC<{
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}> = ({ title, isOpen, onToggle, children }) => (
    <section className="detail-card detail-card--collapsible">
        <button
            type="button"
            className="detail-card__toggle-header"
            onClick={onToggle}
            aria-expanded={isOpen}
        >
            <span className="detail-card-title mb-0">{title}</span>
            <ChevronDown className={`detail-card__collapse-icon ${isOpen ? 'is-open' : ''}`} aria-hidden="true" />
        </button>
        {isOpen && <div className="detail-card__collapsible-body">{children}</div>}
    </section>
);

const SubprojectDetail: React.FC<SubprojectDetailProps> = ({ subproject, ipos, onBack, previousPageName, onUpdateSubproject, particularTypes, uacsCodes, commodityCategories, refCommodities, refLivestock }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Subprojects');
    const { canEdit: canEditFinancial } = useUserAccess('Accomplishment - Financial');
    const { canEdit: canEditPhysical } = useUserAccess('Accomplishment - Physical');
    const { addIpoHistory } = useIpoHistory();
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const isAdmin = currentUser?.role === 'Administrator';
    const canDeleteDriveFiles = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';

    // Edit Modes: 'full' (legacy), 'details' (exclusive), 'commodity' (exclusive), 'budget' (exclusive), 'accomplishment'
    const [editMode, setEditMode] = useState<'none' | 'full' | 'details' | 'commodity' | 'budget' | 'accomplishment'>('none');

    const [editedSubproject, setEditedSubproject] = useState(subproject);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget'>('details');
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
    const [monthLockMessage, setMonthLockMessage] = useState('');

    // Form Inputs
    const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetailType['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
        isRealignment: false,
        isSavings: false,
        isCancelled: false,
        adjustmentReason: '',
    });
    const [budgetAdjustmentHistory, setBudgetAdjustmentHistory] = useState<BudgetItemAdjustmentHistory[]>([]);

    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '',
        name: '',
        area: 0,
        averageYield: 0
    });

    const [editingDetailIndex, setEditingDetailIndex] = useState<number | null>(null);
    const [confirmBudgetItemDate, setConfirmBudgetItemDate] = useState<{index?: number, field: 'deliveryDate' | 'obligationMonth', dateStr: string} | null>(null);
    const [historyLimit, setHistoryLimit] = useState<number>(5);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [budgetItemErrorFields, setBudgetItemErrorFields] = useState<string[]>([]);
    const [budgetItemFormMessage, setBudgetItemFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
    const [driveFiles, setDriveFiles] = useState<SubprojectDriveFile[]>([]);
    const [isDriveLoading, setIsDriveLoading] = useState(true);
    const [isDriveUploading, setIsDriveUploading] = useState(false);
    const [deletingDriveFileId, setDeletingDriveFileId] = useState<number | null>(null);
    const [driveMessage, setDriveMessage] = useState<string | null>(null);
    const [previewDriveFile, setPreviewDriveFile] = useState<SubprojectDriveFile | null>(null);
    const [driveFilePendingDelete, setDriveFilePendingDelete] = useState<SubprojectDriveFile | null>(null);
    const [expandedSections, setExpandedSections] = useState<Record<SubprojectDetailSectionKey, boolean>>({
        commodities: false,
        budget: false,
        accomplishment: true,
        gallery: false,
        files: false
    });
    const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
    const [galleryImageFailed, setGalleryImageFailed] = useState(false);

    const isUserRole = currentUser?.role === 'User';

    const detailsDecision = getStatusDecision({
        moduleKey: 'subprojects',
        item: subproject,
        action: 'editDetails',
        hasModuleAccess: canEdit,
    });
    const commodityDecision = detailsDecision;
    const budgetDecision = getStatusDecision({
        moduleKey: 'subprojects',
        item: subproject,
        action: 'editBudget',
        hasModuleAccess: canEdit,
    });
    const physicalAccomplishmentDecision = getStatusDecision({
        moduleKey: 'subprojects',
        item: subproject,
        action: 'editPhysicalAccomplishment',
        hasModuleAccess: canEditPhysical,
    });
    const financialAccomplishmentDecision = getStatusDecision({
        moduleKey: 'subprojects',
        item: subproject,
        action: 'editFinancialAccomplishment',
        hasModuleAccess: canEditFinancial,
    });
    const accomplishmentDecision = physicalAccomplishmentDecision.allowed ? physicalAccomplishmentDecision : financialAccomplishmentDecision;

    // Toggle Flags for Edit Buttons (Role + DCF policy based access)
    const canEditProjectDetails = detailsDecision.allowed;
    const canEditCommodity = commodityDecision.allowed;
    const canEditBudget = budgetDecision.allowed;
    const canEditAccomplishment = physicalAccomplishmentDecision.allowed || financialAccomplishmentDecision.allowed;

    const getEditModeDecision = (mode: typeof editMode) => {
        if (mode === 'details') return { decision: detailsDecision, action: 'editDetails' as const };
        if (mode === 'commodity') return { decision: commodityDecision, action: 'editDetails' as const };
        if (mode === 'budget') return { decision: budgetDecision, action: 'editBudget' as const };
        if (mode === 'accomplishment') {
            return {
                decision: accomplishmentDecision,
                action: physicalAccomplishmentDecision.allowed ? 'editPhysicalAccomplishment' as const : 'editFinancialAccomplishment' as const,
            };
        }
        return { decision: detailsDecision, action: 'editDetails' as const };
    };

    const handlePolicyEditMode = async (mode: 'details' | 'commodity' | 'budget' | 'accomplishment') => {
        const { decision, action } = getEditModeDecision(mode);
        const allowed = await ensureDecisionAllowed(decision, {
            moduleKey: 'subprojects',
            item: subproject,
            itemId: subproject.id,
            itemName: subproject.name,
            status: subproject.status,
            action,
            entityType: 'subproject',
        });
        if (allowed) setEditMode(mode);
    };

    const validateSubprojectActualMonth = async (month?: string) => {
        if (!month) return true;
        const decision = getMonthDecision(month);
        if (isMonthSelectionAllowed(decision)) {
            setMonthLockMessage('');
            return true;
        }
        setMonthLockMessage(getMonthLockMessage(decision));
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

    const validateSubprojectAccomplishmentMonthsForSave = async () => {
        if (editMode !== 'accomplishment') return true;
        const months = detailItems.flatMap((detail, index) => {
            const originalDetail = subproject.details?.find(item => item.id === detail.id) || subproject.details?.[index];
            return [
                ...(hasMonthChanged(detail.actualDeliveryDate, originalDetail?.actualDeliveryDate) ? [detail.actualDeliveryDate] : []),
                ...getChangedRecordMonths(detail.obligations || [], originalDetail?.obligations || []),
                ...getChangedRecordMonths(detail.disbursements || [], originalDetail?.disbursements || []),
            ];
        }).filter(Boolean) as string[];
        for (const month of months) {
            if (!(await validateSubprojectActualMonth(month))) return false;
        }
        return true;
    };

    const resetCurrentDetail = () => {
        setCurrentDetail({
            type: '',
            particulars: '',
            deliveryDate: '',
            unitOfMeasure: 'pcs',
            pricePerUnit: '',
            numberOfUnits: '',
            objectType: 'MOOE',
            expenseParticular: '',
            uacsCode: '',
            obligationMonth: '',
            disbursementMonth: '',
            isRealignment: false,
            isSavings: false,
            isCancelled: false,
            adjustmentReason: '',
        });
        setBudgetItemFormMessage(null);
    };

    const toggleSection = (section: SubprojectDetailSectionKey) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Helper for Funding Year selection range
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = currentYear - 5; i <= currentYear + 5; i++) {
            years.push(i);
        }
        return years;
    }, []);

    useEffect(() => {
        setEditedSubproject(subproject);
        // Map details and preserve ID for tracking, plus virtualize logic
        setDetailItems((subproject.details || []).map(d => ensureOriginalBudgetSnapshot({
            ...d,
            obligations: (d.obligations && d.obligations.length > 0) ? d.obligations : (
                ((d.actualObligationAmount || 0) > 0) ? [{
                    id: Date.now() + Math.random(),
                    date: d.actualObligationDate || '',
                    amount: d.actualObligationAmount || 0,
                    remarks: 'Legacy Record'
                }] : []
            )
        })));

        if (editMode === 'details') setActiveTab('details');
        if (editMode === 'commodity') setActiveTab('commodity');
        if (editMode === 'budget') setActiveTab('budget');

        // Reset local editing states
        setEditingDetailIndex(null);
        resetCurrentDetail();
    }, [subproject, editMode]);

    useEffect(() => {
        let isMounted = true;
        const loadHistory = async () => {
            if (!supabase) {
                setBudgetAdjustmentHistory([]);
                return;
            }

            const { data, error } = await supabase
                .from('budget_item_adjustment_history')
                .select('*')
                .eq('source_type', 'subproject_detail')
                .eq('parent_id', subproject.id)
                .order('created_at', { ascending: false });

            if (!isMounted) return;
            if (error) {
                console.warn('Unable to load subproject budget adjustment history', error);
                setBudgetAdjustmentHistory([]);
                return;
            }
            setBudgetAdjustmentHistory((data || []) as BudgetItemAdjustmentHistory[]);
        };
        loadHistory();
        return () => {
            isMounted = false;
        };
    }, [subproject.id]);

    const loadDriveFiles = useCallback(async () => {
        if (!currentUser?.id || !subproject.id) return;
        setIsDriveLoading(true);
        setDriveMessage(null);
        try {
            const [status, files] = await Promise.all([
                getGoogleDriveStatus(currentUser),
                listSubprojectDriveFiles(currentUser, subproject.id)
            ]);
            setDriveStatus(status);
            setDriveFiles(files);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to load Subproject files.');
        } finally {
            setIsDriveLoading(false);
        }
    }, [currentUser, subproject.id]);

    useEffect(() => {
        loadDriveFiles();
    }, [loadDriveFiles]);

    const handleDriveFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        if (!isAllowedSubprojectDriveFile(file)) {
            setDriveMessage('Only PDF and image files are allowed. Please upload a PDF, PNG, JPG, WEBP, or GIF file.');
            return;
        }
        if (!canEdit) {
            setDriveMessage('You do not have permission to upload Subproject files.');
            return;
        }
        if (!driveStatus?.isConnected) {
            setDriveMessage(driveStatus?.connectionMessage || 'Ask an Admin to reconnect Google Drive storage.');
            return;
        }
        if (!subproject.operatingUnit) {
            setDriveMessage('This subproject needs an operating unit before files can be uploaded.');
            return;
        }
        if (!subproject.indigenousPeopleOrganization) {
            setDriveMessage('This subproject needs a linked IPO before files can be uploaded.');
            return;
        }

        setIsDriveUploading(true);
        setDriveMessage(null);
        try {
            const uploaded = await uploadSubprojectDriveFile(currentUser, subproject.id, file);
            setDriveFiles(prev => [uploaded, ...prev]);
            setDriveMessage(`${uploaded.file_name} uploaded successfully.`);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to upload Subproject file.');
        } finally {
            setIsDriveUploading(false);
        }
    };

    const requestDriveFileDelete = (file: SubprojectDriveFile) => {
        if (!canDeleteDriveFiles) return;
        setDriveFilePendingDelete(file);
    };

    const handleDriveFileDelete = async () => {
        const file = driveFilePendingDelete;
        if (!canDeleteDriveFiles || !file) return;
        setDeletingDriveFileId(file.id);
        setDriveMessage(null);
        try {
            await deleteSubprojectDriveFile(currentUser, file.id);
            setDriveFiles(prev => prev.filter(item => item.id !== file.id));
            setDriveMessage(`${file.file_name} deleted.`);
            setDriveFilePendingDelete(null);
        } catch (error: any) {
            setDriveMessage(error.message || 'Unable to delete Subproject file.');
        } finally {
            setDeletingDriveFileId(null);
        }
    };

    const galleryFiles = useMemo(() => driveFiles.filter(isSubprojectDriveImageFile), [driveFiles]);
    const selectedGalleryFile = galleryIndex !== null ? galleryFiles[galleryIndex] : null;

    useEffect(() => {
        if (galleryIndex !== null && galleryIndex >= galleryFiles.length) {
            setGalleryIndex(galleryFiles.length > 0 ? galleryFiles.length - 1 : null);
        }
    }, [galleryFiles.length, galleryIndex]);

    useEffect(() => {
        setGalleryImageFailed(false);
    }, [galleryIndex]);

    const showPreviousGalleryImage = () => {
        if (galleryFiles.length === 0) return;
        setGalleryIndex(current => current === null ? 0 : (current - 1 + galleryFiles.length) % galleryFiles.length);
    };

    const showNextGalleryImage = () => {
        if (galleryFiles.length === 0) return;
        setGalleryIndex(current => current === null ? 0 : (current + 1) % galleryFiles.length);
    };

    const projectCompletionStats = useMemo(() => {
        const rollup = resolveSubprojectCompletionRollup(subproject.details);
        if (rollup.activeCount === 0) return { percent: 0, text: '0%' };
        const percent = (rollup.completedCount / rollup.activeCount) * 100;
        return { percent, text: `${percent.toFixed(0)}%` };
    }, [subproject.details]);

    useEffect(() => {
        if (editMode !== 'accomplishment' || detailItems.length === 0) return;
        const rollup = resolveSubprojectCompletionRollup(detailItems as SubprojectDetailType[]);
        setEditedSubproject(prev => {
            if (prev.status === 'Cancelled') return prev;
            const nextStatus = rollup.isComplete ? 'Completed' : 'Ongoing';
            const nextCompletionDate = rollup.actualCompletionDate || '';
            if (prev.status === nextStatus && (prev.actualCompletionDate || '') === nextCompletionDate) return prev;
            return { ...prev, status: nextStatus, actualCompletionDate: nextCompletionDate };
        });
    }, [detailItems, editMode]);

    const totalBudget = useMemo(() => {
       return detailItems.reduce((acc, item) => acc + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)), 0);
    }, [detailItems]);

    const calculateTotalBudget = (details: SubprojectDetailType[]) => {
        return details.reduce((total, item) => total + (isBudgetLineExcludedFromTargets(item) ? 0 : getBudgetLineAmount(item)), 0);
    }

    const budgetAdjustmentSummary = useMemo(() => summarizeBudgetAdjustments(detailItems), [detailItems]);

    const persistBudgetAdjustmentHistory = async (
        action: BudgetItemAdjustmentHistory['action'],
        beforeSnapshot: any,
        afterSnapshot: any,
        reason: string
    ) => {
        try {
            const saved = await writeBudgetItemAdjustmentHistory({
                sourceType: 'subproject_detail',
                parentId: subproject.id,
                itemId: afterSnapshot?.id || beforeSnapshot?.id,
                action,
                beforeSnapshot,
                afterSnapshot,
                sourceItemId: afterSnapshot?.sourceItemId || beforeSnapshot?.sourceItemId || null,
                reason,
                currentUser,
            });
            setBudgetAdjustmentHistory(prev => [saved, ...prev]);
        } catch {
            // History failure should not block editing the nested budget line.
        }
    };

    // Helper to get month index from YYYY-MM-DD string
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
    }, [currentDetail.expenseParticular, currentDetail.objectType]);

    const getMonthFromDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    const getYearFromDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 0) return parts[0];
        return '';
    };

    const handleConfirmBudgetItemDate = () => {
        if (confirmBudgetItemDate) {
            setEditedSubproject(prev => ({ ...prev, estimatedCompletionDate: confirmBudgetItemDate.dateStr }));
            if (confirmBudgetItemDate.index !== undefined) {
                handleDetailAccomplishmentChange(confirmBudgetItemDate.index, confirmBudgetItemDate.field as keyof SubprojectDetailInput, confirmBudgetItemDate.dateStr);
            } else {
                setCurrentDetail(prev => ({ ...prev, [confirmBudgetItemDate.field]: confirmBudgetItemDate.dateStr }));
            }
            setBudgetItemErrorFields(prev => prev.filter(field => field !== confirmBudgetItemDate.field));
            setBudgetItemFormMessage(null);
            setConfirmBudgetItemDate(null);
        }
    };

    const handleCancelBudgetItemDate = () => {
        setConfirmBudgetItemDate(null);
        setBudgetItemFormMessage({
            type: 'error',
            text: 'The selected budget item month was not applied. Confirm the month first or choose a month within the subproject estimated completion.',
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (missingFields.includes(name)) {
            setMissingFields(prev => prev.filter(f => f !== name));
        }

        if (name === 'status') {
            const newStatus = value as Subproject['status'];
            if (newStatus === 'Completed') {
                const rollup = resolveSubprojectCompletionRollup(detailItems as SubprojectDetailType[]);
                if (!rollup.isComplete) {
                    alert('A subproject can only be marked Completed after all non-cancelled delivery items have an actual delivery date and are marked completed.');
                    return;
                }
                setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: rollup.actualCompletionDate || '' }));
            } else {
                setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: '' }));
            }
        } else if (name === 'indigenousPeopleOrganization') {
             const selectedIpo = resolveIpoByIdOrName(ipos, undefined, value);
             setEditedSubproject(prev => ({
                 ...prev,
                 [name]: value,
                 ipo_id: selectedIpo?.id,
                 location: selectedIpo ? selectedIpo.location : ''
             }));
        } else if (name === 'fundingYear') {
            const year = parseInt(value) || new Date().getFullYear();
            setEditedSubproject(prev => {
                const newData = { ...prev, fundingYear: year, startDate: `${year}-01-01` };
                if (newData.estimatedCompletionDate) {
                    const month = getMonthFromDateStr(newData.estimatedCompletionDate);
                    if (month !== '') {
                        newData.estimatedCompletionDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                    }
                }
                return newData;
            });

            // Sync details if fundingYear changes
            setDetailItems(prev => prev.map(d => {
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
            }));
        } else if (name === 'operatingUnit') {
            const mappedRegion = ouToRegionMap[value];
            setEditedSubproject(prev => ({
                ...prev,
                [name]: value,
                // We don't have a region field on Subproject, it's derived from IPO.
                // But we can clear the IPO if the OU changes to force them to re-select.
                 indigenousPeopleOrganization: mappedRegion ? '' : prev.indigenousPeopleOrganization,
                 ipo_id: mappedRegion ? undefined : prev.ipo_id,
            }));
        } else {
            setEditedSubproject(prev => ({ ...prev, [name]: value }));
        }
    };

    // New handler for top-level numeric fields (Gender/Inclusivity)
    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditedSubproject(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setBudgetItemFormMessage(null);
        setBudgetItemErrorFields(prev => prev.filter(field => field !== name));
        if (name === 'type') {
            setBudgetItemErrorFields(prev => prev.filter(field => field !== 'particulars'));
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else if (name === 'objectType') {
            setBudgetItemErrorFields(prev => prev.filter(field => field !== 'uacsCode'));
            setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setBudgetItemErrorFields(prev => prev.filter(field => field !== 'uacsCode'));
            setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else if (name === 'uacsCode') {
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
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddDetail = async () => {
        try {
            setBudgetItemFormMessage(null);
            const requiredDetailFields = ['type', 'particulars', 'deliveryDate', 'pricePerUnit', 'numberOfUnits', 'obligationMonth', 'disbursementMonth', 'uacsCode'];
            const missingDetailFields = requiredDetailFields.filter(field => {
                const value = currentDetail[field as keyof typeof currentDetail];
                return value === undefined || value === null || String(value).trim() === '';
            });
            if (missingDetailFields.length > 0) {
                setBudgetItemErrorFields(missingDetailFields);
                setBudgetItemFormMessage({
                    type: 'error',
                    text: `Complete these required fields first: ${missingDetailFields.map(field => budgetItemFieldLabels[field] || field).join(', ')}.`,
                });
                return;
            }

            const parsedPricePerUnit = Number(currentDetail.pricePerUnit);
            const parsedNumberOfUnits = Number(currentDetail.numberOfUnits);
            const invalidNumberFields = [
                ...(!Number.isFinite(parsedPricePerUnit) || parsedPricePerUnit <= 0 ? ['pricePerUnit'] : []),
                ...(!Number.isFinite(parsedNumberOfUnits) || parsedNumberOfUnits <= 0 ? ['numberOfUnits'] : []),
            ];
            if (invalidNumberFields.length > 0) {
                setBudgetItemErrorFields(invalidNumberFields);
                setBudgetItemFormMessage({
                    type: 'error',
                    text: 'Price per Unit and Number of Units must be greater than zero.',
                });
                return;
            }

            // Removed start date validation

            if ((currentDetail.isCancelled || currentDetail.isRealignment || currentDetail.isSavings) && !currentDetail.adjustmentReason.trim()) {
                setBudgetItemFormMessage({
                    type: 'error',
                    text: 'A short reason is required when adding a cancelled, realignment, or savings budget item.',
                });
                return;
            }

            const newItem: SubprojectDetailInput = ensureOriginalBudgetSnapshot(normalizeBudgetLineStatus({
                ...currentDetail,
                pricePerUnit: parsedPricePerUnit,
                numberOfUnits: parsedNumberOfUnits,
                // Ensure ID is generated for new items so tracking works later
                id: Date.now() + Math.random(),
                // Default accomplishment fields
                actualNumberOfUnits: 0,
                actualDeliveryDate: '',
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualAmount: 0,
                actualObligationAmount: 0,
                actualDisbursementAmount: 0
            }));

            let updatedDetailItems: SubprojectDetailInput[] = [];

            if (editingDetailIndex !== null) {
                const beforeItem = detailItems[editingDetailIndex];
                updatedDetailItems = detailItems.map((item, index) => index === editingDetailIndex ? { ...item, ...newItem, id: item.id } : item);
                if (currentDetail.isCancelled || currentDetail.isRealignment || currentDetail.isSavings || beforeItem.isRealignment || beforeItem.isSavings || beforeItem.isCancelled) {
                    await persistBudgetAdjustmentHistory(
                        currentDetail.isCancelled ? 'cancel'
                            : currentDetail.isRealignment ? 'tag_realignment'
                                : currentDetail.isSavings ? 'tag_savings'
                                    : beforeItem.isCancelled ? 'restore'
                                        : 'clear_tag',
                        beforeItem,
                        { ...beforeItem, ...newItem, id: beforeItem.id },
                        currentDetail.adjustmentReason.trim() || 'Updated budget item metadata.'
                    );
                }
                setEditingDetailIndex(null);
            } else {
                updatedDetailItems = [...detailItems, newItem];
                if (newItem.isRealignment || newItem.isSavings) {
                    await persistBudgetAdjustmentHistory(
                        'create_adjustment_item',
                        null,
                        newItem,
                        newItem.adjustmentReason?.trim() || 'Created budget adjustment item.'
                    );
                }
            }

            // Rule: Automatically update Estimated Completion Date to the farthest delivery date of budget items
            let newEstimatedCompletionDate = editedSubproject.estimatedCompletionDate;
            const deliveryDates = updatedDetailItems
                .map(d => d.deliveryDate)
                .filter(d => d && d.trim() !== '')
                .map(d => new Date(d).getTime())
                .filter(t => !isNaN(t));

            if (deliveryDates.length > 0) {
                const maxDateTimestamp = Math.max(...deliveryDates);
                const farthestDate = new Date(maxDateTimestamp).toISOString().split('T')[0];
                if (!newEstimatedCompletionDate || new Date(farthestDate) > new Date(newEstimatedCompletionDate)) {
                    newEstimatedCompletionDate = farthestDate;
                }
            }

            setDetailItems(updatedDetailItems);
            setEditedSubproject(prev => ({
                ...prev,
                estimatedCompletionDate: newEstimatedCompletionDate
            }));

            resetCurrentDetail();
            setBudgetItemFormMessage({
                type: 'success',
                text: editingDetailIndex !== null
                    ? 'Budget item updated. Click Save Changes to persist this update.'
                    : 'Budget item added to the list above. Click Save Changes to persist this new item.',
            });
        } catch (error) {
            console.error('Unable to add budget item', error);
            setBudgetItemFormMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Unable to add this budget item. Please review the fields and try again.',
            });
        }
    };

    const handleRemoveDetail = async (indexToRemove: number) => {
        const item = detailItems[indexToRemove];
        const isSavedLine = !!(item.id && (subproject.details || []).some(detail => detail.id === item.id));
        const hasActuals = ((item.obligations?.length || 0) > 0) || ((item.disbursements?.length || 0) > 0) || Number(item.actualObligationAmount) > 0 || Number(item.actualDisbursementAmount) > 0;
        if (isSavedLine || hasActuals) {
            const reason = requestAdjustmentReason('cancelling this budget item');
            if (!reason) return;
            const afterItem = { ...item, isCancelled: true, isRealignment: false, isSavings: false, adjustmentReason: reason };
            setDetailItems(prev => prev.map((detail, index) => index === indexToRemove ? afterItem : detail));
            await persistBudgetAdjustmentHistory('cancel', item, afterItem, reason);
            return;
        }

        setDetailItems(prev => prev.filter((_, index) => index !== indexToRemove));
        if (editingDetailIndex === indexToRemove) {
            handleCancelDetailEdit();
        } else if (editingDetailIndex !== null && editingDetailIndex > indexToRemove) {
            setEditingDetailIndex(editingDetailIndex - 1);
        }
    };

    const handleEditParticular = (indexToEdit: number) => {
        const itemToEdit = normalizeBudgetLineStatus(detailItems[indexToEdit]);
        setCurrentDetail({
            ...itemToEdit,
            pricePerUnit: String(itemToEdit.pricePerUnit),
            numberOfUnits: String(itemToEdit.numberOfUnits),
            isCancelled: !!itemToEdit.isCancelled,
            isRealignment: !!itemToEdit.isRealignment,
            isSavings: !!itemToEdit.isSavings,
            adjustmentReason: itemToEdit.adjustmentReason || '',
        });
        setEditingDetailIndex(indexToEdit);
    };

    const handleCancelDetailEdit = () => {
        setEditingDetailIndex(null);
        resetCurrentDetail();
    };

    const handleBudgetLineTagChange = async (index: number, tag: 'Cancelled' | 'Realignment' | 'Savings' | null) => {
        const item = detailItems[index];
        const actionLabel = tag ? `marking this item as ${tag}` : 'clearing this budget item tag';
        const reason = requestAdjustmentReason(actionLabel);
        if (!reason) return;

        const afterItem = {
            ...item,
            isCancelled: tag === 'Cancelled',
            isRealignment: tag === 'Realignment',
            isSavings: tag === 'Savings',
            adjustmentReason: reason,
        };
        const action: BudgetItemAdjustmentHistory['action'] =
            tag === 'Cancelled' ? 'cancel'
                : tag === 'Realignment' ? 'tag_realignment'
                    : tag === 'Savings' ? 'tag_savings'
                        : item.isCancelled ? 'restore'
                            : 'clear_tag';

        setDetailItems(prev => prev.map((detail, itemIndex) => itemIndex === index ? afterItem : detail));
        await persistBudgetAdjustmentHistory(action, item, afterItem, reason);
    };

    const handleDetailAccomplishmentChange = (index: number, field: keyof SubprojectDetailInput, value: any) => {
        setDetailItems(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };

    const handleActualDeliveryDateChange = (index: number, value: string) => {
        setDetailItems(prev => prev.map((d, i) => (
            i === index
                ? { ...d, actualDeliveryDate: value, ...(value ? {} : { isCompleted: false }) }
                : d
        )));
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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

    const handleAddCommodity = () => {
        const isLivestock = currentCommodity.typeName === 'Livestock';
        const isCrop = currentCommodity.typeName === 'Crop';

        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area || (isCrop && !currentCommodity.averageYield)) {
            alert(`Please fill in all commodity fields (Type, Name, ${isLivestock ? 'Number of Heads' : 'Area, Yield'}).`);
            return;
        }
        const newCommodity: SubprojectCommodity = {
            ...currentCommodity,
            area: Number(currentCommodity.area),
            averageYield: isLivestock ? undefined : Number(currentCommodity.averageYield)
        };
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: [...(prev.subprojectCommodities || []), newCommodity]
        }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (index: number) => {
        const commodityToEdit = editedSubproject.subprojectCommodities?.[index];
        if (commodityToEdit) {
            setCurrentCommodity({
                typeName: commodityToEdit.typeName || '',
                name: commodityToEdit.name,
                area: commodityToEdit.area,
                averageYield: commodityToEdit.averageYield || 0
            });
            setEditedSubproject(prev => ({
                ...prev,
                subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
            }));
        }
    };

    const handleRemoveCommodity = (index: number) => {
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
        }));
    };

    const handleCommodityAccomplishmentChange = (index: number, field: keyof SubprojectCommodity, value: any) => {
        if (field === 'marketingPercentage' || field === 'foodSecurityPercentage') {
            const numValue = parseFloat(value);
            if (value !== '' && (isNaN(numValue) || numValue < 0)) return;
            const newValue = value === '' ? 0 : numValue;
            const currentItem = editedSubproject.subprojectCommodities?.[index];
            if (currentItem) {
                const otherKey = field === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                const otherValue = parseFloat(String(currentItem[otherKey]) || '0');
                if (newValue + otherValue > 100) return;
            }
        }
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: prev.subprojectCommodities?.map((c, i) => i === index ? { ...c, [field]: value } : c)
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (editMode !== 'none' && editMode !== 'full') {
            const { decision, action } = getEditModeDecision(editMode);
            const allowed = await ensureDecisionAllowed(decision, {
                moduleKey: 'subprojects',
                item: subproject,
                itemId: subproject.id,
                itemName: subproject.name,
                status: subproject.status,
                action,
                entityType: 'subproject',
            });
            if (!allowed) return;
        }

        if (!(await validateSubprojectAccomplishmentMonthsForSave())) return;

        if (editMode === 'details') {
            const requiredFields = ['name', 'indigenousPeopleOrganization', 'status'];
            const missing = requiredFields.filter(field => !editedSubproject[field as keyof Subproject]);

            if (missing.length > 0) {
                setMissingFields(missing);
                alert("Please fill in all required fields marked with an asterisk (*).");
                return;
            }
        }

        let eventType = "Updated via Detail View";
        if (editMode === 'details') eventType = "Updated Details";
        if (editMode === 'commodity') eventType = "Updated Commodities";
        if (editMode === 'budget') eventType = "Updated Budget";
        if (editMode === 'accomplishment') eventType = "Updated Accomplishment";

        if (editedSubproject.status === 'Completed' && subproject.status !== 'Completed') {
            eventType = "Subproject Completed";
        }

        const historyEntry = {
            date: new Date().toISOString(),
            event: eventType,
            user: currentUser?.fullName || "System"
        };

        let resolvedIpoId = editedSubproject.ipo_id;
        if (!resolvedIpoId && editedSubproject.indigenousPeopleOrganization) {
            const matchedIpo = resolveIpoByIdOrName(ipos, undefined, editedSubproject.indigenousPeopleOrganization);
            if (matchedIpo) resolvedIpoId = matchedIpo.id;
        }

        if (resolvedIpoId) {
             addIpoHistory(resolvedIpoId, `${eventType}: ${editedSubproject.name}`);
        }

        // Logic to track accomplishment history in new table
        if (editMode === 'accomplishment' && supabase) {
            // Find changed items that are newly delivered or quantity changed
            const changes = detailItems.filter((item, index) => {
                const original = subproject.details[index];
                if (!original) return true; // New item (shouldn't happen in accomplishment mode usually)

                // Track if actual delivery happened or quantity updated
                const deliveredNow = !!item.actualDeliveryDate;
                const deliveredBefore = !!original.actualDeliveryDate;

                // If just marked delivered, or quantity updated
                if ((deliveredNow && !deliveredBefore) || (deliveredNow && item.actualNumberOfUnits !== original.actualNumberOfUnits)) {
                    return true;
                }
                return false;
            });

            if (changes.length > 0) {
                const historyRecords = changes.map(item => ({
                    subproject_id: subproject.id,
                    detail_id: item.id || 0, // Fallback 0 if id missing (should not happen for saved items)
                    delivery_date: item.actualDeliveryDate,
                    quantity: item.actualNumberOfUnits,
                    remarks: `Delivered: ${item.particulars}`,
                    created_by: currentUser?.fullName || 'System',
                    created_at: new Date().toISOString()
                }));

                // Insert into tracking table
                const { error: histError } = await supabase.from('subproject_accomplishments').insert(historyRecords);
                if (histError) console.error("Error logging accomplishment history:", histError);
            }
        }

        // Add 'id' back to details if missing (from new adds)
        const cleanDetails = detailItems.map((d, i) => {
            const detailWithSnapshot = ensureOriginalBudgetSnapshot(d);
            const cleanD = {
                ...detailWithSnapshot,
                id: detailWithSnapshot.id || (Date.now() + i) // Ensure ID
            };
            if (cleanD.deliveryDate === '') (cleanD as any).deliveryDate = null;
            if (cleanD.actualDeliveryDate === '') (cleanD as any).actualDeliveryDate = null;
            if (cleanD.obligationMonth === '') (cleanD as any).obligationMonth = null;
            if (cleanD.disbursementMonth === '') (cleanD as any).disbursementMonth = null;
            if (cleanD.obligations && cleanD.obligations.length === 0) {
                 cleanD.actualObligationAmount = 0;
                 cleanD.actualObligationDate = undefined;
            } else if (cleanD.obligations && cleanD.obligations.length > 0) {
                 const latestOb = [...cleanD.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                 cleanD.actualObligationAmount = cleanD.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                 cleanD.actualObligationDate = latestOb.date;
            }
            if (cleanD.disbursements && cleanD.disbursements.length === 0) {
                 cleanD.actualDisbursementAmount = 0;
                 cleanD.actualDisbursementDate = undefined;
            } else if (cleanD.disbursements && cleanD.disbursements.length > 0) {
                 const latestDb = [...cleanD.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                 cleanD.actualDisbursementAmount = cleanD.disbursements.reduce((sum, d) => sum + (d.amount || 0), 0);
                 cleanD.actualDisbursementDate = latestDb.date;
            }
            return cleanD;
        });

        const completionRollup = resolveSubprojectCompletionRollup(cleanDetails as SubprojectDetailType[]);
        const normalizedCleanDetails = completionRollup.details;
        const nextStatus = editedSubproject.status === 'Cancelled'
            ? 'Cancelled'
            : completionRollup.isComplete
                ? 'Completed'
                : (editedSubproject.status === 'Completed' || editMode === 'accomplishment')
                    ? 'Ongoing'
                    : editedSubproject.status;
        const nextActualCompletionDate = nextStatus === 'Completed' ? completionRollup.actualCompletionDate : null;

        const detailActualsChanged = normalizedCleanDetails.some(detail => {
            const original = (subproject.details || []).find(item => item.id === detail.id);
            if (!original) return !!detail.actualDeliveryDate || !!detail.actualNumberOfUnits;
            return valuesDiffer(original.actualDeliveryDate, detail.actualDeliveryDate)
                || valuesDiffer(original.actualNumberOfUnits, detail.actualNumberOfUnits)
                || valuesDiffer(original.isCompleted, detail.isCompleted);
        });
        const submittedAt = historyEntry.date;
        const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
            hasPhysicalAccomplishment: !!nextActualCompletionDate,
            hasChanged: valuesDiffer(subproject.actualCompletionDate, nextActualCompletionDate)
                || valuesDiffer(subproject.status, nextStatus)
                || (editMode === 'accomplishment' && detailActualsChanged),
            previousSubmittedAt: subproject.physical_accomplishment_submitted_at,
            submittedAt
        });

        const updatedSubprojectWithDetails = {
            ...editedSubproject,
            ipo_id: resolvedIpoId,
            status: nextStatus,
            actualCompletionDate: nextActualCompletionDate,
            physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
            details: normalizedCleanDetails as SubprojectDetailType[],
            history: [...(subproject.history || []), historyEntry]
        };

        const dateFields = ['startDate', 'estimatedCompletionDate', 'actualCompletionDate'];
        dateFields.forEach(field => {
            if (updatedSubprojectWithDetails[field as keyof Subproject] === '') {
                (updatedSubprojectWithDetails as any)[field] = null;
            }
        });

        onUpdateSubproject(updatedSubprojectWithDetails);

        // Sync obligations to central table if supabase is available
        if (supabase) {
             syncSubprojectObligations(subproject.id, normalizedCleanDetails as SubprojectDetailType[]);
             syncSubprojectDisbursements(subproject.id, normalizedCleanDetails as SubprojectDetailType[]);
        }

        setEditMode('none');
    };

    const syncSubprojectObligations = async (parentId: number, details: SubprojectDetailType[]) => {
        if (!supabase) return;
        const entityType = 'subproject_detail';

        // Delete all for this parent first
        await supabase.from('financial_obligations')
            .delete()
            .eq('entity_type', entityType)
            .eq('parent_id', parentId);

        // Insert all from all detail items
        const syncPayload: any[] = [];
        details.forEach(item => {
            if (item.obligations && item.obligations.length > 0) {
                // Update legacy fields for fallback reporting
                const latestOb = [...item.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                item.actualObligationAmount = item.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                item.actualObligationDate = latestOb.date;

                item.obligations.forEach(o => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: item.id?.toString() || null,
                        obligation_date: o.date,
                        amount: o.amount || 0,
                        remarks: o.remarks || ''
                    });
                });
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_obligations').insert(syncPayload);
        }
    };

    const syncSubprojectDisbursements = async (parentId: number, details: SubprojectDetailType[]) => {
        if (!supabase) return;
        const entityType = 'subproject_detail';

        await supabase.from('financial_disbursements').delete().eq('entity_type', entityType).eq('parent_id', parentId);

        const syncPayload: any[] = [];
        details.forEach(item => {
            if (item.disbursements && item.disbursements.length > 0) {
                const latestDb = [...item.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                item.actualDisbursementAmount = item.disbursements.reduce((sum, d) => sum + (d.amount || 0), 0);
                item.actualDisbursementDate = latestDb.date;

                item.disbursements.forEach(d => {
                    syncPayload.push({
                        entity_type: entityType,
                        parent_id: parentId,
                        item_id: item.id?.toString() || null,
                        disbursement_date: d.date,
                        amount: d.amount || 0,
                        remarks: d.remarks || ''
                    });
                });
            } else if (item.actualDisbursementAmount && item.actualDisbursementAmount > 0) {
                 syncPayload.push({
                     entity_type: entityType,
                     parent_id: parentId,
                     item_id: item.id?.toString() || null,
                     disbursement_date: item.actualDisbursementDate || new Date().toISOString().split('T')[0],
                     amount: item.actualDisbursementAmount || 0,
                     remarks: 'Migrated missing'
                 });
            }
        });

        if (syncPayload.length > 0) {
            await supabase.from('financial_disbursements').insert(syncPayload);
        }
    };

    const commonInputClasses = "form-control";

    if (editMode !== 'none') {
        return (
            <div className="form-page animate-fadeIn">
                <div className="detail-header">
                    <h1 className="detail-title">
                        {editMode === 'budget' ? 'Editing Budget: ' : editMode === 'accomplishment' ? 'Editing Accomplishment: ' : editMode === 'commodity' ? 'Editing Commodities: ' : 'Editing Details: '}{subproject.name}
                    </h1>
                    <button onClick={() => setEditMode('none')} className="btn btn-secondary"><X className="btn-symbol" aria-hidden="true" />Cancel Editing</button>
                </div>

                <div className="form-card">
                    <form onSubmit={handleSubmit}>
                        {monthLockMessage && (
                            <div className="notice notice--warning" role="status">
                                {monthLockMessage}
                            </div>
                        )}
                        <div className="min-h-[400px]">
                            {/* DETAILS EDIT MODE */}
                            {editMode === 'details' && (
                                <div className="space-y-6">
                                    <fieldset className="form-section">
                                        <legend>Project Details</legend>
                                        <div className="form-grid">
                                            <div>
                                                <label className="form-label">Subproject Name <span className="form-required">*</span></label>
                                                <input type="text" name="name" value={editedSubproject.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'form-control--invalid' : ''}`} />
                                            </div>
                                            <div>
                                                <label className="form-label">Operating Unit</label>
                                                <select
                                                    name="operatingUnit"
                                                    value={editedSubproject.operatingUnit || ''}
                                                    onChange={handleInputChange}
                                                    className={commonInputClasses}
                                                    disabled={currentUser?.role !== 'Administrator'}
                                                    title={currentUser?.role !== 'Administrator' ? "Only Administrators can edit the Operating Unit" : ""}
                                                >
                                                    <option value="">Select Operating Unit</option>
                                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">IPO <span className="form-required">*</span></label>
                                                <select name="indigenousPeopleOrganization" value={editedSubproject.indigenousPeopleOrganization} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') ? 'form-control--invalid' : ''}`}>
                                                    <option value="">Select IPO</option>
                                                    {ipos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Status <span className="form-required">*</span></label>
                                                <select name="status" value={editedSubproject.status} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('status') ? 'form-control--invalid' : ''}`}>
                                                    <option value="Proposed">Proposed</option>
                                                    <option value="Ongoing">Ongoing</option>
                                                    {(isAdmin || editedSubproject.status === 'Completed') && <option value="Completed">Completed</option>}
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            </div>
                                            <div>
                                                 <label className="form-label">Package</label>
                                                 <select name="packageType" value={editedSubproject.packageType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}
                                                 </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                     <fieldset className="form-section">
                                        <legend>Location & Timeline</legend>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="form-label">Location</label>
                                                <input
                                                    type="text"
                                                    value={editedSubproject.location}
                                                    readOnly
                                                    className={commonInputClasses}
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="form-label">Estimated Completion</label>
                                                    <MonthYearPicker
                                                        value={editedSubproject.estimatedCompletionDate}
                                                        onChange={(val) => {
                                                            setEditedSubproject(prev => ({ ...prev, estimatedCompletionDate: val }));
                                                            if (!currentDetail.deliveryDate) {
                                                                setCurrentDetail(prev => ({ ...prev, deliveryDate: val }));
                                                            }
                                                        }}
                                                        placeholder="Select month"
                                                        defaultYear={editedSubproject.fundingYear}
                                                        className="h-10"
                                                    />
                                                    {getYearFromDateStr(editedSubproject.estimatedCompletionDate) && parseInt(getYearFromDateStr(editedSubproject.estimatedCompletionDate)) !== editedSubproject.fundingYear && (
                                                        <p className="form-help form-help--warning">Note: Estimated completion year is different from the funding year.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </fieldset>
                                    <fieldset className="form-section">
                                        <legend>Funding</legend>
                                        <div className="form-grid">
                                            <div>
                                                <label className="form-label">Year</label>
                                                <select name="fundingYear" value={editedSubproject.fundingYear} onChange={handleInputChange} className={commonInputClasses}>
                                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Type</label>
                                                <select name="fundType" value={editedSubproject.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="form-label">Tier</label>
                                                <select name="tier" value={editedSubproject.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                    <fieldset className="form-section">
                                        <legend>Remarks</legend>
                                        <div>
                                            <textarea name="remarks" id="remarks" value={editedSubproject.remarks} onChange={handleInputChange} rows={4} className={commonInputClasses} />
                                        </div>
                                    </fieldset>
                                 </div>
                            )}

                            {/* COMMODITY EDIT MODE */}
                            {editMode === 'commodity' && (
                                <div className="space-y-6">
                                    <fieldset className="form-section">
                                        <legend>Subproject Commodities</legend>
                                        <div className="commodity-edit-list">
                                            {editedSubproject.subprojectCommodities && editedSubproject.subprojectCommodities.length > 0 ? (
                                                editedSubproject.subprojectCommodities.map((c, index) => (
                                                    <div key={index} className="commodity-edit-card">
                                                        <div className="commodity-edit-card__summary">
                                                            <div className="commodity-edit-card__header">
                                                                <span className="commodity-edit-card__title">{c.name}</span>
                                                                <span className="status-badge status-badge--completed status-badge--compact">{c.typeName}</span>
                                                            </div>
                                                            <div className="commodity-edit-metrics">
                                                                <div>
                                                                    <span className="commodity-edit-label">{c.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area'}</span>
                                                                    <span className="commodity-edit-value">{c.area} {c.typeName === 'Livestock' ? 'Heads' : 'Hectares'}</span>
                                                                </div>
                                                                {c.typeName === 'Crop' && (
                                                                    <div>
                                                                        <span className="commodity-edit-label">Estimated Yield</span>
                                                                        <span className="commodity-edit-value">{c.averageYield?.toLocaleString()} Kilograms</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="commodity-edit-card__actions">
                                                            <button type="button" onClick={() => handleEditCommodity(index)} className="table-action table-action--primary" title="Edit commodity">
                                                                <Pencil className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveCommodity(index)} className="table-action table-action--danger" title="Remove commodity">
                                                                <Trash2 className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="detail-empty">No commodities added yet. Use the form below to add one.</p>
                                            )}
                                        </div>

                                        <div className="commodity-edit-form">
                                            <h4 className="commodity-edit-form__title">
                                                <span className="commodity-edit-form__marker"></span>
                                                Add New Commodity
                                            </h4>
                                            <div className="form-grid">
                                                <div>
                                                    <label className="form-label">Commodity Type</label>
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
                                                    <label className="form-label">Commodity Name</label>
                                                    <select
                                                        name="name"
                                                        value={currentCommodity.name}
                                                        onChange={handleCommodityChange}
                                                        disabled={!currentCommodity.typeName}
                                                        className={commonInputClasses}
                                                    >
                                                        <option value="">Select Commodity</option>
                                                        {currentCommodity.typeName === 'Crop' && refCommodities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                        {currentCommodity.typeName === 'Livestock' && refLivestock.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="form-label">
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
                                                <div className="commodity-reference animate-fadeIn">
                                                    <h5 className="commodity-reference__title">
                                                        <Info className="h-3 w-3" />
                                                        Reference Information
                                                    </h5>
                                                    {currentCommodity.typeName === 'Crop' ? (
                                                        (() => {
                                                            const ref = refCommodities.find(c => c.name === currentCommodity.name);
                                                            if (!ref) return null;
                                                            return (
                                                                <div className="commodity-reference__grid">
                                                                    <div>
                                                                        <span className="commodity-edit-label">Banner Program</span>
                                                                        <span className="commodity-edit-value">{ref.banner_program}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Commodity Group</span>
                                                                        <span className="commodity-edit-value">{ref.commodity_group}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Elevation Range</span>
                                                                        <span className="commodity-edit-value">{ref.min_elevation_masl} - {ref.max_elevation_masl} MASL</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Target Yield</span>
                                                                        <span className="commodity-edit-value">{ref.target_yield_ha?.toLocaleString()} Kilograms/Hectares</span>
                                                                    </div>
                                                                    <div className="commodity-reference__full">
                                                                        <div className="commodity-reference__inline">
                                                                            <div>
                                                                                <span className="commodity-edit-label">Recommended Soil</span>
                                                                                <span className="commodity-edit-value">{ref.recommended_soil}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="commodity-edit-label">Climate Type</span>
                                                                                <span className="commodity-edit-value">{ref.climate_type_suitability}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    ) : (
                                                        (() => {
                                                            const ref = refLivestock.find(c => c.name === currentCommodity.name);
                                                            if (!ref) return null;
                                                            return (
                                                                <div className="commodity-reference__grid">
                                                                    <div>
                                                                        <span className="commodity-edit-label">Category</span>
                                                                        <span className="commodity-edit-value">{ref.category}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Housing Type</span>
                                                                        <span className="commodity-edit-value">{ref.housing_type}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Feed Type</span>
                                                                        <span className="commodity-edit-value">{ref.feed_type}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="commodity-edit-label">Water Requirement</span>
                                                                        <span className="commodity-edit-value">{ref.water_requirement_liters_day} Liters/Day</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                </div>
                                            )}

                                            <div className="commodity-edit-footer">
                                                {currentCommodity.typeName === 'Crop' && (
                                                    <div className="commodity-edit-yield">
                                                        <label className="form-label">Auto-Computed Yield (Kilograms)</label>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                name="averageYield"
                                                                value={currentCommodity.averageYield}
                                                                readOnly
                                                                className={`${commonInputClasses} commodity-edit-yield__input`}
                                                            />
                                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                                <span className="commodity-edit-yield__unit">KG</span>
                                                            </div>
                                                        </div>
                                                        <p className="commodity-edit-note">Calculated based on area and reference target yield.</p>
                                                    </div>
                                                )}
                                                <div className="commodity-edit-footer__actions">
                                                    <button
                                                        type="button"
                                                        onClick={handleAddCommodity}
                                                        className="btn btn-primary"
                                                    >
                                                        Add to List
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            )}

                            {/* BUDGET EDIT MODE */}
                            {editMode === 'budget' && (
                                <div className="space-y-6">
                                     <fieldset className="form-section">
                                        <legend>Budget Items</legend>
                                        <div className="budget-item-list">
                                            {detailItems.map((d, index) => (
                                                <div key={index} className={`budget-item-card ${editingDetailIndex === index ? 'budget-item-card--editing' : ''} ${isBudgetLineExcludedFromTargets(d) ? 'budget-item-card--excluded' : ''} ${d.isCancelled ? 'budget-item-card--cancelled' : ''} ${d.isRealignment ? 'budget-item-card--realignment' : ''} ${d.isSavings ? 'budget-item-card--savings' : ''}`}>
                                                    <div className="budget-item-card__summary">
                                                        <span className="budget-item-card__title">
                                                            {d.particulars}
                                                            {getBudgetLineTag(d) && (
                                                                <span className={`budget-line-badge budget-line-badge--${getBudgetLineTag(d)?.toLowerCase()}`}>
                                                                    {getBudgetLineTag(d)}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <div className="budget-item-card__meta">
                                                            <div>{d.uacsCode} {availableUacsCodes.find(c => c.code === d.uacsCode)?.desc ? `- ${availableUacsCodes.find(c => c.code === d.uacsCode)?.desc}` : ''}</div>
                                                            <div>{d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(Number(d.pricePerUnit))}</div>
                                                            <span className="block mt-1">Obligation: {formatMonthYear(d.obligationMonth)} | Disbursement: {formatMonthYear(d.disbursementMonth)}</span>
                                                            {isBudgetLineExcludedFromTargets(d) && (
                                                                <span className="budget-line-exclusion-note">{d.adjustmentReason || 'No adjustment justification recorded.'}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="budget-item-card__actions">
                                                        <span className="budget-item-card__total">{formatCurrency(getBudgetLineAmount(d))}</span>
                                                        <div className="budget-item-card__buttons">
                                                            <button type="button" onClick={() => handleEditParticular(index)} className="table-action table-action--primary" title="Edit item">
                                                                <Pencil className="btn-symbol" aria-hidden="true" />
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveDetail(index)} className="table-action table-action--danger" title="Remove item"><Trash2 className="btn-symbol" aria-hidden="true" /></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="budget-item-list__total">Total: {formatCurrency(totalBudget)}</div>
                                        </div>

                                        <div className="budget-item-form-grid">
                                            <div className="budget-item-form-grid__wide"><label className="form-label">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                            <div className="budget-item-form-grid__wide"><label className="form-label">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={`${commonInputClasses} form-control--compact`}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>

                                            <div className="budget-item-form-grid__full budget-item-form-grid budget-item-form-grid--nested">
                                                <div><label className="form-label">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                                <div><label className="form-label">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType] || {}).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                                <div>
                                                    <label className="form-label">UACS Code</label>
                                                    <input
                                                        type="text"
                                                        name="uacsCode"
                                                        value={currentDetail.uacsCode}
                                                        onChange={handleDetailChange}
                                                        list="uacs-codes-list"
                                                        placeholder="Search UACS..."
                                                        className={`${commonInputClasses} form-control--compact`}
                                                    />
                                                    <datalist id="uacs-codes-list">
                                                        {availableUacsCodes.map((item) => (
                                                            <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                                        ))}
                                                    </datalist>
                                                    {currentDetail.uacsCode && availableUacsCodes.find(c => c.code === currentDetail.uacsCode) && (
                                                        <p className="form-help">
                                                            {availableUacsCodes.find(c => c.code === currentDetail.uacsCode)?.desc}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="form-label">Delivery Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.deliveryDate}
                                                    onChange={(val) => {
                                                        setBudgetItemFormMessage(null);
                                                        setBudgetItemErrorFields(prev => prev.filter(field => field !== 'deliveryDate'));
                                                        if (editedSubproject.estimatedCompletionDate && val > editedSubproject.estimatedCompletionDate) {
                                                            setConfirmBudgetItemDate({ field: 'deliveryDate', dateStr: val });
                                                            return;
                                                        }
                                                        setCurrentDetail(prev => ({ ...prev, deliveryDate: val }));
                                                    }}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>

                                            <div>
                                                <label className="form-label">Obligation Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.obligationMonth}
                                                    onChange={(val) => {
                                                        setBudgetItemFormMessage(null);
                                                        setBudgetItemErrorFields(prev => prev.filter(field => field !== 'obligationMonth'));
                                                        if (editedSubproject.estimatedCompletionDate && val > editedSubproject.estimatedCompletionDate) {
                                                            setConfirmBudgetItemDate({ field: 'obligationMonth', dateStr: val });
                                                            return;
                                                        }
                                                        setCurrentDetail(prev => ({ ...prev, obligationMonth: val }));
                                                    }}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>
                                            <div>
                                                <label className="form-label">Disbursement Month</label>
                                                <MonthYearPicker
                                                    value={currentDetail.disbursementMonth}
                                                    onChange={(val) => {
                                                        setBudgetItemFormMessage(null);
                                                        setBudgetItemErrorFields(prev => prev.filter(field => field !== 'disbursementMonth'));
                                                        setCurrentDetail(prev => ({ ...prev, disbursementMonth: val }));
                                                    }}
                                                    placeholder="Select month"
                                                    defaultYear={editedSubproject.fundingYear}
                                                    className="h-9"
                                                />
                                            </div>

                                            <div><label className="form-label">Price/Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`} /></div>
                                            <div><label className="form-label">Number of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`} /></div>
                                            <div><label className="form-label">Unit of Measure</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={`${commonInputClasses} form-control--compact`}><option value="pcs">pcs</option><option value="grams">grams</option><option value="kg">kg</option><option value="liters">liters</option><option value="boxes">boxes</option><option value="cans">cans</option><option value="sets">sets</option><option value="pax">pax</option><option value="heads">heads</option><option value="months">months</option><option value="days">days</option><option value="ha">ha</option><option value="bags">bags</option><option value="bottles">bottles</option><option value="sachets">sachets</option><option value="rolls">rolls</option><option value="meters">meters</option><option value="units">units</option><option value="packs">packs</option><option value="lots">lots</option></select></div>
                                            {budgetItemFormMessage && (
                                                <div className={`budget-item-form-grid__full budget-item-form-message budget-item-form-message--${budgetItemFormMessage.type}`} role={budgetItemFormMessage.type === 'error' ? 'alert' : 'status'}>
                                                    {budgetItemFormMessage.text}
                                                </div>
                                            )}
                                            <div className="budget-item-form-grid__full budget-line-adjustment-options">
                                                {editingDetailIndex !== null && (
                                                    <label className="form-check">
                                                        <input
                                                            type="checkbox"
                                                            checked={currentDetail.isCancelled}
                                                            onChange={(e) => setCurrentDetail(prev => ({
                                                                ...prev,
                                                                isCancelled: e.target.checked,
                                                                isRealignment: e.target.checked ? false : prev.isRealignment,
                                                                isSavings: e.target.checked ? false : prev.isSavings,
                                                            }))}
                                                            className="form-checkbox"
                                                        />
                                                        Cancelled
                                                    </label>
                                                )}
                                                <label className="form-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={currentDetail.isRealignment}
                                                        onChange={(e) => setCurrentDetail(prev => ({
                                                            ...prev,
                                                            isRealignment: e.target.checked,
                                                            isCancelled: e.target.checked ? false : prev.isCancelled,
                                                            isSavings: e.target.checked ? false : prev.isSavings,
                                                        }))}
                                                        className="form-checkbox"
                                                    />
                                                    Realignment
                                                </label>
                                                <label className="form-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={currentDetail.isSavings}
                                                        onChange={(e) => setCurrentDetail(prev => ({
                                                            ...prev,
                                                            isSavings: e.target.checked,
                                                            isCancelled: e.target.checked ? false : prev.isCancelled,
                                                            isRealignment: e.target.checked ? false : prev.isRealignment,
                                                        }))}
                                                        className="form-checkbox"
                                                    />
                                                    Savings
                                                </label>
                                                {(currentDetail.isCancelled || currentDetail.isRealignment || currentDetail.isSavings) && (
                                                    <input
                                                        type="text"
                                                        name="adjustmentReason"
                                                        value={currentDetail.adjustmentReason}
                                                        onChange={handleDetailChange}
                                                        placeholder="Reason for this adjustment"
                                                        className={`${commonInputClasses} form-control--compact budget-line-adjustment-options__reason`}
                                                    />
                                                )}
                                            </div>

                                            {editingDetailIndex !== null ? (
                                                <div className="budget-item-form-grid__actions">
                                                    <button type="button" onClick={handleAddDetail} className="btn btn-primary">Update Item</button>
                                                    <button type="button" onClick={handleCancelDetailEdit} className="btn btn-secondary">Cancel</button>
                                                </div>
                                            ) : (
                                                <div className="budget-item-form-grid__actions">
                                                    <button type="button" onClick={handleAddDetail} className="btn btn-primary w-full">
                                                        <Plus className="btn-symbol" aria-hidden="true" />
                                                        Add Item
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="budget-adjustment-summary">
                                            <div className="budget-adjustment-summary__header">
                                                <h4>Expense Calculator</h4>
                                            </div>
                                            <div className="budget-adjustment-summary__grid">
                                                <div><span>Allocation</span><strong>{formatCurrency(budgetAdjustmentSummary.originalPlannedBudget)}</strong></div>
                                                <div><span>Active Target</span><strong>{formatCurrency(budgetAdjustmentSummary.activeTargetBudget)}</strong></div>
                                                <div><span>Cancelled</span><strong>{formatCurrency(budgetAdjustmentSummary.cancelledAmount)}</strong></div>
                                                <div><span>Realigned</span><strong>{formatCurrency(budgetAdjustmentSummary.realignedAmount)}</strong></div>
                                                <div><span>Savings</span><strong>{formatCurrency(budgetAdjustmentSummary.savingsAmount)}</strong></div>
                                                <div><span>Actual Obligated</span><strong>{formatCurrency(budgetAdjustmentSummary.actualObligated)}</strong></div>
                                                <div><span>Actual Disbursed</span><strong>{formatCurrency(budgetAdjustmentSummary.actualDisbursed)}</strong></div>
                                            </div>
                                            <div className="budget-adjustment-history">
                                                {budgetAdjustmentHistory.slice(0, 6).map(entry => (
                                                    <div key={entry.id || `${entry.item_id}-${entry.created_at}`} className="budget-adjustment-history__row">
                                                        <strong>{entry.action.replace(/_/g, ' ')}</strong>
                                                        <span>{entry.reason}</span>
                                                        <small>{entry.created_by_name || entry.created_by || 'System'} · {formatDate(entry.created_at)}</small>
                                                    </div>
                                                ))}
                                                {budgetAdjustmentHistory.length === 0 && <p className="detail-empty detail-empty--compact">No budget adjustment history recorded yet.</p>}
                                            </div>
                                        </div>
                                     </fieldset>
                                </div>
                            )}

                            {/* ACCOMPLISHMENT EDIT MODE */}
                            {editMode === 'accomplishment' && (
                                <div className="form-stack form-stack--spacious">
                                    <fieldset className="form-section">
                                        <legend>Budget Items Accomplishment</legend>
                                        <div className="data-table-scroll">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Completed</th>
                                                        <th>Particulars</th>
                                                        <th>Actual Units</th>
                                                        <th>Actual Delivery</th>
                                                        <th colSpan={2}>Obligation</th>
                                                        <th colSpan={2}>Disbursement</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailItems.map((detail, idx) => {
                                                        const originalDetail = subproject.details.find(d => d.id === detail.id);
                                                        const wasCompleted = originalDetail?.isCompleted || false;
                                                        const hasDeliveryDate = !!detail.actualDeliveryDate;

                                                        // Checkbox disabled if no delivery date
                                                        const isCheckboxDisabled = !hasDeliveryDate;

                                                        return (
                                                            <tr key={idx} className={wasCompleted ? 'data-table__row--muted' : ''}>
                                                                <td className="data-table__selection">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={detail.isCompleted || false}
                                                                        onChange={(e) => handleDetailAccomplishmentChange(idx, 'isCompleted', e.target.checked)}
                                                                        disabled={isCheckboxDisabled} // Only clickable if date exists and not already locked (unless admin)
                                                                        className="form-checkbox"
                                                                    />
                                                                </td>
                                                                <td className="data-table__primary">
                                                                    {detail.particulars}
                                                                    <div className="data-table__secondary">Target: {detail.numberOfUnits} {detail.unitOfMeasure}</div>
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        type="number"
                                                                        value={(detail as any).actualNumberOfUnits || ''}
                                                                        onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualNumberOfUnits', parseFloat(e.target.value))}
                                                                        className="form-control form-control--compact"
                                                                        placeholder={`0 ${detail.unitOfMeasure}`}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <MonthYearPicker
                                                                        value={(detail as any).actualDeliveryDate}
                                                                        onChange={async (val) => {
                                                                            if (val && !(await validateSubprojectActualMonth(val))) return;
                                                                            handleActualDeliveryDateChange(idx, val);
                                                                        }}
                                                                        placeholder="Select month"
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                        className="form-control--compact"
                                                                        allowClear
                                                                    />
                                                                </td>
                                                                <td colSpan={2}>
                                                                    <ObligationsEditor
                                                                        obligations={detail.obligations || []}
                                                                        onChange={(newObs, total) => {
                                                                            handleDetailAccomplishmentChange(idx, 'obligations', newObs);
                                                                            handleDetailAccomplishmentChange(idx, 'actualObligationAmount', total);
                                                                        }}
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                        validateMonthChange={validateSubprojectActualMonth}
                                                                    />
                                                                </td>
                                                                <td colSpan={2}>
                                                                    <DisbursementsEditor
                                                                        disbursements={detail.disbursements || []}
                                                                        onChange={(newDb, total) => {
                                                                            handleDetailAccomplishmentChange(idx, 'disbursements', newDb);
                                                                            handleDetailAccomplishmentChange(idx, 'actualDisbursementAmount', total);
                                                                        }}
                                                                        defaultYear={editedSubproject.fundingYear}
                                                                        validateMonthChange={validateSubprojectActualMonth}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </fieldset>

                                    {/* Section 2: Customer Satisfaction */}
                                    <fieldset className="form-fieldset">
                                        <legend className="form-legend">Customer Satisfaction</legend>
                                        <p className="detail-empty detail-empty--compact">Placeholder for Customer Satisfaction Survey data.</p>
                                    </fieldset>

                                    {/* Section 3: Gender and Inclusivity (Added) */}
                                    <fieldset className="form-fieldset">
                                        <legend className="form-legend">Gender and Inclusivity</legend>
                                        <div className="form-grid form-grid--compact">
                                            <div>
                                                <label className="form-label form-label--compact">PWD</label>
                                                <input type="number" name="actualPWD" value={editedSubproject.actualPWD || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="form-label form-label--compact">Muslim</label>
                                                <input type="number" name="actualMuslim" value={editedSubproject.actualMuslim || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="form-label form-label--compact">LGBTQ+</label>
                                                <input type="number" name="actualLGBTQ" value={editedSubproject.actualLGBTQ || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="form-label form-label--compact">Solo Parents</label>
                                                <input type="number" name="actualSoloParent" value={editedSubproject.actualSoloParent || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="form-label form-label--compact">Senior</label>
                                                <input type="number" name="actualSenior" value={editedSubproject.actualSenior || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                            <div>
                                                <label className="form-label form-label--compact">Youth</label>
                                                <input type="number" name="actualYouth" value={editedSubproject.actualYouth || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" />
                                            </div>
                                        </div>
                                    </fieldset>

                                    {/* Section 4: Outcome of Subproject */}
                                    <fieldset className="form-fieldset">
                                        <legend className="form-legend">Outcome of Subproject</legend>
                                        <div className="outcome-edit-list">
                                            {editedSubproject.subprojectCommodities?.map((commodity, index) => {
                                                const isCrop = commodity.typeName === 'Crop';
                                                return (
                                                    <div key={index} className="outcome-edit-card">
                                                        <div className="outcome-edit-card__meta">
                                                            <span className="outcome-edit-card__label">Commodity</span>
                                                            <strong>{commodity.name}</strong>
                                                            <span>{commodity.typeName}</span>
                                                        </div>
                                                        <div className="outcome-edit-card__meta">
                                                            <span className="outcome-edit-card__label">Target</span>
                                                            <strong>{commodity.averageYield || '-'}</strong>
                                                            <span>{isCrop ? (commodity.averageYield ? 'Yield Kg/Ha' : '') : 'Heads'}</span>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Actual</label>
                                                            <div className="outcome-edit-inline">
                                                                <input type="number" value={commodity.actualYield || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'actualYield', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="0" />
                                                                <span>{isCrop ? 'Yield Kg/Ha' : 'Heads'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Usage</label>
                                                            <div className="outcome-edit-controls">
                                                                <div className="outcome-edit-inline">
                                                                    <input type="number" value={commodity.marketingPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'marketingPercentage', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="%" />
                                                                    <span>Marketing</span>
                                                                </div>
                                                                <div className="outcome-edit-inline">
                                                                    <input type="number" value={commodity.foodSecurityPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'foodSecurityPercentage', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="%" />
                                                                    <span>Food Security</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="outcome-edit-card__field">
                                                            <label className="form-label">Income (PHP)</label>
                                                            {(commodity.marketingPercentage || 0) > 0 ? (
                                                                <div className="outcome-edit-controls">
                                                                    <input type="number" value={commodity.income || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'income', parseFloat(e.target.value))} className={`${commonInputClasses} form-control--compact`} placeholder="0.00" />
                                                                    <span className="outcome-edit-note">
                                                                        {isCrop ? 'Per Harvest Season' : 'Annual Income'}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="outcome-edit-empty">-</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {(!editedSubproject.subprojectCommodities || editedSubproject.subprojectCommodities.length === 0) && (
                                                <p className="detail-empty">No commodities linked.</p>
                                            )}
                                        </div>
                                    </fieldset>

                                    {/* Section 5: Catch Up Plan (Conditional) */}
                                    {isMonthTargetOverdue(editedSubproject.estimatedCompletionDate) && editedSubproject.status !== 'Completed' && (
                                        <fieldset className="form-fieldset form-fieldset--danger">
                                            <legend className="form-legend">Catch Up Plan</legend>
                                            <p className="form-error">Project is delayed. Please provide a catch-up plan.</p>
                                            <div className="form-stack">
                                                <div>
                                                    <label className="form-label">Remarks / Justification</label>
                                                    <textarea name="catchUpPlanRemarks" value={editedSubproject.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                                </div>
                                                <div>
                                                    <label className="form-label">New Target Completion Date</label>
                                                    <MonthYearPicker
                                                        value={editedSubproject.newTargetCompletionDate}
                                                        onChange={(val) => setEditedSubproject({...editedSubproject, newTargetCompletionDate: val})}
                                                        placeholder="Select month"
                                                        defaultYear={new Date().getFullYear()}
                                                        className="form-control"
                                                    />
                                                </div>
                                            </div>
                                        </fieldset>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="detail-edit-footer">
                            <button type="button" onClick={() => setEditMode('none')} className="btn btn-secondary">Cancel</button>
                            <button type="submit" className="btn btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="detail-page">
            {previewDriveFile && (
                <div className="dashboard-modal-backdrop" onClick={() => setPreviewDriveFile(null)}>
                    <div className="dashboard-modal dashboard-modal--wide drive-preview-modal" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>{previewDriveFile.file_name}</h3>
                                <p className="dashboard-modal__metric-subtext">
                                    {formatFileSize(previewDriveFile.file_size)} - {previewDriveFile.mime_type || 'File preview'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setPreviewDriveFile(null)} className="dashboard-modal__close" aria-label="Close preview">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="drive-preview-modal__body">
                            {canPreviewSubprojectDriveFile(previewDriveFile) ? (
                                <iframe
                                    src={getSubprojectDrivePreviewUrl(previewDriveFile)}
                                    title={`Preview ${previewDriveFile.file_name}`}
                                    className="drive-preview-modal__frame"
                                    allow="autoplay"
                                />
                            ) : (
                                <div className="drive-preview-modal__empty">
                                    <FileText aria-hidden="true" />
                                    <p>This file type cannot be previewed in 4KIS.</p>
                                </div>
                            )}
                        </div>
                        <div className="drive-preview-modal__footer">
                            <p>If the preview does not load, open the file directly in Google Drive.</p>
                            {previewDriveFile.web_view_link && (
                                <a className="btn btn-secondary" href={previewDriveFile.web_view_link} target="_blank" rel="noreferrer">
                                    <ExternalLink aria-hidden="true" />
                                    Open in Drive
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {driveFilePendingDelete && (
                <div className="dashboard-modal-backdrop" onClick={() => !deletingDriveFileId && setDriveFilePendingDelete(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>Delete Drive File</h3>
                                <p className="dashboard-modal__metric-subtext">This removes the file from the 4KIS file list and attempts to delete it from Google Drive.</p>
                            </div>
                            <button type="button" onClick={() => setDriveFilePendingDelete(null)} className="dashboard-modal__close" aria-label="Close delete confirmation" disabled={!!deletingDriveFileId}>
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="dashboard-modal__body">
                            <div className="dashboard-modal__event">
                                <p className="dashboard-modal__metric-label">File</p>
                                <p className="dashboard-modal__metric-value">{driveFilePendingDelete.file_name}</p>
                                <p className="dashboard-modal__metric-subtext">{formatFileSize(driveFilePendingDelete.file_size)} - Uploaded by {driveFilePendingDelete.uploaded_by_name || 'Unknown user'}</p>
                            </div>
                        </div>
                        <div className="dashboard-modal__actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDriveFilePendingDelete(null)} disabled={!!deletingDriveFileId}>Cancel</button>
                            <button type="button" className="btn btn-danger" onClick={handleDriveFileDelete} disabled={!!deletingDriveFileId}>
                                {deletingDriveFileId ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                                Delete File
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedGalleryFile && (
                <div className="dashboard-modal-backdrop" onClick={() => setGalleryIndex(null)}>
                    <div className="dashboard-modal dashboard-modal--wide ipo-gallery-modal" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>{selectedGalleryFile.file_name}</h3>
                                <p className="dashboard-modal__metric-subtext">
                                    {galleryIndex !== null ? `${galleryIndex + 1} of ${galleryFiles.length}` : 'Image preview'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setGalleryIndex(null)} className="dashboard-modal__close" aria-label="Close gallery">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="ipo-gallery-modal__body">
                            <button type="button" className="ipo-gallery-modal__nav ipo-gallery-modal__nav--prev" onClick={showPreviousGalleryImage} aria-label="Previous image">
                                <ChevronLeft aria-hidden="true" />
                            </button>
                            {galleryImageFailed ? (
                                <div className="drive-preview-modal__empty">
                                    <ImageIcon aria-hidden="true" />
                                    <p>This image could not be loaded in 4KIS.</p>
                                    {selectedGalleryFile.web_view_link && (
                                        <a className="btn btn-secondary" href={selectedGalleryFile.web_view_link} target="_blank" rel="noreferrer">
                                            <ExternalLink aria-hidden="true" />
                                            Open in Drive
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <img
                                    src={getSubprojectDriveImageUrl(selectedGalleryFile, 1600)}
                                    alt={selectedGalleryFile.file_name}
                                    onError={() => setGalleryImageFailed(true)}
                                />
                            )}
                            <button type="button" className="ipo-gallery-modal__nav ipo-gallery-modal__nav--next" onClick={showNextGalleryImage} aria-label="Next image">
                                <ChevronRight aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
             <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">{subproject.name}</h1>
                    <p className="detail-meta">{subproject.location}</p>
                </div>
                <div className="detail-actions">
                    {/* Granular Buttons - Prepare for individual role toggles */}
                    {(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) && (
                        <button onClick={() => handlePolicyEditMode('accomplishment')} disabled={!canEditAccomplishment} className={`btn btn-primary btn-responsive ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                            <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Edit Accomplishment</span>
                        </button>
                    )}
                    <button onClick={onBack} className="btn btn-secondary btn-responsive" title={`Back to ${previousPageName}`}>
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back to {previousPageName}</span>
                    </button>
                </div>
            </header>

            {/* Main Content Grid */}
            <div className="detail-grid">
                {/* Left Column */}
                <div className="detail-main">
                     <div className="detail-card">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="detail-card-title mb-0">Project Details</h3>
                            {(canEdit || canEditProjectDetails) && (
                                <button onClick={() => handlePolicyEditMode('details')} disabled={!canEditProjectDetails} className={`table-action table-action--primary ${!canEditProjectDetails ? 'is-disabled' : ''}`} title={canEditProjectDetails ? 'Edit Details' : detailsDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Details
                                </button>
                            )}
                        </div>
                         <div className="detail-dl">
                            <DetailItem label="Status" value={<span className={getStatusBadge(subproject.status)}>{subproject.status}</span>} />
                            <DetailItem label="UID" value={subproject.uid} />
                            <DetailItem label="Operating Unit" value={subproject.operatingUnit || 'N/A'} />
                            <DetailItem label="Package" value={subproject.packageType} />
                            <DetailItem label="IPO" value={subproject.indigenousPeopleOrganization} />
                            <DetailItem label="Estimated Completion" value={formatMonthYear(subproject.estimatedCompletionDate)} />
                            <DetailItem label="Actual Completion" value={formatMonthYear(subproject.actualCompletionDate)} />
                            <DetailItem label="Funding Year" value={subproject.fundingYear?.toString()} />
                            <DetailItem label="Fund Type" value={subproject.fundType} />
                            <DetailItem label="Tier" value={subproject.tier} />
                         </div>

                         {/* Completion Progress Bar */}
                         <div className="detail-progress">
                             <div className="detail-progress__header">
                                 <span>Project Completion (Items Delivered)</span>
                                 <strong>{projectCompletionStats.text}</strong>
                             </div>
                             <div className="detail-progress__track">
                                 <div
                                    className="detail-progress__fill"
                                    style={{ width: `${projectCompletionStats.percent}%` }}
                                 ></div>
                             </div>
                         </div>

                         <div className="detail-subsection">
                             <h4 className="detail-section-title">Remarks</h4>
                             <p className="detail-note">{subproject.remarks || 'No remarks provided.'}</p>
                         </div>
                     </div>

                     {/* New Target Commodities Section */}
                     <CollapsibleDetailCard title="Target Commodities" isOpen={expandedSections.commodities} onToggle={() => toggleSection('commodities')}>
                        <div className="flex justify-end mb-4">
                            {(canEdit || canEditCommodity) && (
                                <button onClick={() => handlePolicyEditMode('commodity')} disabled={!canEditCommodity} className={`table-action table-action--primary ${!canEditCommodity ? 'is-disabled' : ''}`} title={canEditCommodity ? 'Edit Commodities' : commodityDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Commodity
                                </button>
                            )}
                        </div>
                         {subproject.subprojectCommodities && subproject.subprojectCommodities.length > 0 ? (
                            <ul className="detail-list">
                                {subproject.subprojectCommodities.map((c, idx) => (
                                    <li key={idx} className="detail-list-item flex justify-between items-center">
                                        <div>
                                            <span className="detail-list-name">{c.name}</span>
                                            <span className="detail-list-copy">({c.typeName || 'N/A'})</span>
                                        </div>
                                        <span className="detail-list-copy">
                                            {c.typeName === 'Livestock' ? 'Heads' : 'Area'}: {c.area} {c.typeName === 'Crop' && `| Yield: ${c.averageYield} kg`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No commodities recorded.</p>
                        )}
                     </CollapsibleDetailCard>

                     <CollapsibleDetailCard title="Budget Breakdown" isOpen={expandedSections.budget} onToggle={() => toggleSection('budget')}>
                        <div className="flex justify-end mb-4">
                            {(canEdit || canEditBudget) && (
                                <button onClick={() => handlePolicyEditMode('budget')} disabled={!canEditBudget} className={`table-action table-action--primary ${!canEditBudget ? 'is-disabled' : ''}`} title={canEditBudget ? 'Edit Budget' : budgetDecision.message}>
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Budget
                                </button>
                            )}
                        </div>
                        <div className="data-table-scroll">
                           <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Particulars</th>
                                        <th>Status</th>
                                        <th>Delivery Date</th>
                                        <th>UACS Code</th>
                                        <th>Obligation</th>
                                        <th>Disbursement</th>
                                        <th className="data-table__numeric"># of Units</th>
                                        <th className="data-table__numeric">Subtotal</th>
                                        <th>% Comp.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subproject.details.map(detail => {
                                        const actualUnits = detail.actualNumberOfUnits || 0;
                                        const targetUnits = detail.numberOfUnits || 1; // Avoid division by zero
                                        const completionPct = (actualUnits / targetUnits) * 100;

                                        return (
                                            <tr key={detail.id} className={`${isBudgetLineExcludedFromTargets(detail) ? 'budget-item-card--excluded' : ''} ${detail.isCancelled ? 'budget-item-card--cancelled' : ''} ${detail.isRealignment ? 'budget-item-card--realignment' : ''} ${detail.isSavings ? 'budget-item-card--savings' : ''}`}>
                                                <td className="data-table__primary">{detail.particulars}</td>
                                                <td>
                                                    {getBudgetLineTag(detail) ? (
                                                        <span className={`budget-line-badge budget-line-badge--${getBudgetLineTag(detail)?.toLowerCase()}`}>
                                                            {getBudgetLineTag(detail)}
                                                        </span>
                                                    ) : (
                                                        <span className="detail-empty">-</span>
                                                    )}
                                                </td>
                                                <td>{formatMonthYear(detail.deliveryDate)}</td>
                                                <td>{detail.uacsCode}</td>
                                                <td>{formatMonthYear(detail.obligationMonth)}</td>
                                                <td>{formatMonthYear(detail.disbursementMonth)}</td>
                                                <td className="data-table__numeric">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                                <td className="data-table__numeric">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                                <td>
                                                    <span className={`status-badge status-badge--compact ${completionPct >= 100 ? 'status-badge--completed' : 'status-badge--neutral'}`}>
                                                        {Math.min(completionPct, 100).toFixed(0)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="data-table__total-row">
                                        <td colSpan={7} className="data-table__numeric">Total Budget</td>
                                        <td className="data-table__numeric">{formatCurrency(calculateTotalBudget(subproject.details))}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </CollapsibleDetailCard>

                    {/* NEW: Accomplishment Report Section (Read-Only) */}
                    <CollapsibleDetailCard title="Accomplishment Report" isOpen={expandedSections.accomplishment} onToggle={() => toggleSection('accomplishment')}>
                        <div className="flex justify-end mb-4">
                            {(canEdit || canEditFinancial || canEditPhysical || canEditAccomplishment) && (
                                <button onClick={() => handlePolicyEditMode('accomplishment')} disabled={!canEditAccomplishment} className={`table-action table-action--primary ${!canEditAccomplishment ? 'is-disabled' : ''}`} title={canEditAccomplishment ? 'Edit Accomplishment' : accomplishmentDecision.message}>
                                    <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="detail-stack">
                            <div>
                                <h4 className="detail-section-title">Item Delivery Status</h4>
                                {subproject.details.some(d => d.actualDeliveryDate) ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Item</th>
                                                    <th>Actual Delivery</th>
                                                    <th className="data-table__numeric">Actual Units</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {subproject.details.filter(d => d.actualDeliveryDate).map(d => (
                                                    <tr key={d.id}>
                                                        <td className="data-table__primary">{d.particulars}</td>
                                                        <td className="data-table__positive">{formatMonthYear(d.actualDeliveryDate)}</td>
                                                        <td className="data-table__numeric">{d.actualNumberOfUnits || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No items delivered yet.</p>
                                )}
                            </div>

                            {/* Financial Performance (Read-Only) */}
                            <div className="detail-subsection">
                                <h4 className="detail-section-title">Financial Performance</h4>
                                {subproject.details.some(hasFinancialActuals) ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Expense Item</th>
                                                    <th className="data-table__numeric">Target Budget</th>
                                                    <th className="data-table__numeric">Actual Obligation</th>
                                                    <th className="data-table__numeric">Actual Disbursement</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {subproject.details.map(d => {
                                                    const obligationSummary = getActualObligationSummary(d);
                                                    const disbursementSummary = getActualDisbursementSummary(d);

                                                    return (
                                                        <tr key={d.id}>
                                                            <td className="data-table__primary">{d.particulars}</td>
                                                            <td className="data-table__numeric">{formatCurrency(d.pricePerUnit * d.numberOfUnits)}</td>
                                                            <td className="data-table__numeric data-table__info">{formatCurrency(obligationSummary.amount)}</td>
                                                            <td className="data-table__numeric data-table__positive">{formatCurrency(disbursementSummary.amount)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No financial data recorded yet.</p>
                                )}
                            </div>

                            {/* Gender and Inclusivity (Read-Only) */}
                            <div>
                                <h4 className="detail-section-title">Gender and Inclusivity</h4>
                                <div className="detail-dl">
                                    <DetailItem label="PWD" value={subproject.actualPWD} />
                                    <DetailItem label="Muslim" value={subproject.actualMuslim} />
                                    <DetailItem label="LGBTQ+" value={subproject.actualLGBTQ} />
                                    <DetailItem label="Solo Parents" value={subproject.actualSoloParent} />
                                    <DetailItem label="Senior" value={subproject.actualSenior} />
                                    <DetailItem label="Youth" value={subproject.actualYouth} />
                                </div>
                            </div>

                            <div>
                                 <h4 className="detail-section-title">Project Outcome</h4>
                                 {subproject.subprojectCommodities && subproject.subprojectCommodities.some(c => c.actualYield || c.income) ? (
                                     <div className="detail-outcome-grid">
                                         {subproject.subprojectCommodities.map((c, i) => {
                                             const hasData = c.actualYield || c.income;
                                             if (!hasData) return null;

                                             const unit = c.typeName === 'Livestock' ? 'Heads' : 'Kilograms';
                                             const marketingVal = c.actualYield ? (c.actualYield * (c.marketingPercentage || 0) / 100) : 0;
                                             const foodSecVal = c.actualYield ? (c.actualYield * (c.foodSecurityPercentage || 0) / 100) : 0;

                                             return (
                                                 <div key={i} className="detail-outcome-card">
                                                     <div className="detail-outcome-card__header">
                                                         <p className="detail-outcome-title">{c.name}</p>
                                                         <span className="detail-outcome-pill">{c.typeName}</span>
                                                     </div>

                                                     <div className="detail-stack detail-stack--compact">
                                                         <div className="detail-outcome-row">
                                                             <span className="detail-outcome-label">Total Actual Yield</span>
                                                             <span className="detail-outcome-value">{c.actualYield?.toLocaleString() || 0} <span className="detail-outcome-unit">{unit}</span></span>
                                                         </div>

                                                         <div className="detail-stack detail-stack--compact">
                                                             {/* Marketing Section */}
                                                             <div className="detail-outcome-row detail-outcome-row--marketing detail-outcome-row--stack">
                                                                 <div className="detail-outcome-row__content">
                                                                     <span className="detail-outcome-label">Marketing ({c.marketingPercentage || 0}%)</span>
                                                                     <span className="detail-outcome-value">{marketingVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</span>
                                                                 </div>
                                                                 {c.income && (
                                                                     <div className="detail-outcome-income">
                                                                         <span className="detail-outcome-label">Actual Income</span>
                                                                         <span className="detail-outcome-value">{formatCurrency(c.income)}</span>
                                                                     </div>
                                                                 )}
                                                             </div>

                                                             {/* Food Security Section */}
                                                             <div className="detail-outcome-row detail-outcome-row--food">
                                                                 <div className="detail-outcome-row__content">
                                                                     <span className="detail-outcome-label">Food Security ({c.foodSecurityPercentage || 0}%)</span>
                                                                     <span className="detail-outcome-value">{foodSecVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</span>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                     </div>
                                 ) : (
                                     <p className="detail-empty">No outcome data recorded yet.</p>
                                 )}
                            </div>
                        </div>
                    </CollapsibleDetailCard>

                    <CollapsibleDetailCard title="Gallery" isOpen={expandedSections.gallery} onToggle={() => toggleSection('gallery')}>
                        {galleryFiles.length > 0 ? (
                            <div className="ipo-gallery-grid">
                                {galleryFiles.map((file, index) => (
                                    <button
                                        key={file.id}
                                        type="button"
                                        className="ipo-gallery-tile"
                                        onClick={() => setGalleryIndex(index)}
                                        title={`Preview ${file.file_name}`}
                                    >
                                        <img
                                            src={getSubprojectDriveImageUrl(file, 420)}
                                            alt={file.file_name}
                                            loading="lazy"
                                            onError={(event) => {
                                                event.currentTarget.style.display = 'none';
                                            }}
                                        />
                                        <span className="ipo-gallery-tile__fallback">
                                            <ImageIcon aria-hidden="true" />
                                        </span>
                                        <span className="ipo-gallery-tile__caption">{file.file_name}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="detail-empty">No image files have been uploaded for this subproject yet.</p>
                        )}
                    </CollapsibleDetailCard>

                    <CollapsibleDetailCard title="Subproject Files" isOpen={expandedSections.files} onToggle={() => toggleSection('files')}>
                        <div className="drive-file-card__header">
                            <div>
                                <p className="drive-file-card__copy">PDF and image documentation is stored by upload year under this subproject's Google Drive folder.</p>
                            </div>
                            <span className={`status-badge ${driveStatus?.isConnected ? 'status-badge--completed' : driveStatus?.tokenStatus === 'expired' ? 'status-badge--cancelled' : 'status-badge--neutral'}`}>
                                <HardDrive aria-hidden="true" />
                                {driveStatus?.isConnected ? 'Drive connected' : driveStatus?.tokenStatus === 'expired' ? 'Reconnect required' : 'Drive not connected'}
                            </span>
                        </div>

                        {driveMessage && <p className="drive-file-card__message" role="status">{driveMessage}</p>}

                        <div className="drive-file-card__toolbar">
                            <label
                                htmlFor={`subproject-drive-upload-${subproject.id}`}
                                className={`btn btn-primary ${(!canEdit || !driveStatus?.isConnected || isDriveUploading) ? 'is-disabled' : 'cursor-pointer'}`}
                                title={!driveStatus?.isConnected ? 'Ask an Admin to reconnect Google Drive storage' : 'Upload Subproject file'}
                            >
                                {isDriveUploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
                                {isDriveUploading ? 'Uploading...' : 'Upload File'}
                            </label>
                            <input
                                id={`subproject-drive-upload-${subproject.id}`}
                                type="file"
                                className="hidden"
                                accept={SUBPROJECT_DRIVE_FILE_ACCEPT}
                                onChange={handleDriveFileUpload}
                                disabled={!canEdit || !driveStatus?.isConnected || isDriveUploading}
                            />
                            <button type="button" className="btn btn-secondary" onClick={loadDriveFiles} disabled={isDriveLoading || isDriveUploading}>
                                {isDriveLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <HardDrive aria-hidden="true" />}
                                Refresh
                            </button>
                        </div>

                        {isDriveLoading ? (
                            <div className="drive-file-card__loading">
                                <Loader2 className="animate-spin" aria-hidden="true" />
                                <span>Loading Subproject files...</span>
                            </div>
                        ) : driveFiles.length > 0 ? (
                            <ul className="detail-list">
                                {driveFiles.map(file => (
                                    <li key={file.id} className="detail-list-item drive-file-card__item">
                                        <div className="drive-file-card__file">
                                            <FileText aria-hidden="true" />
                                            <div className="min-w-0">
                                                <p className="detail-list-title">{file.file_name}</p>
                                                <p className="detail-list-copy">
                                                    {formatFileSize(file.file_size)} - Uploaded by {file.uploaded_by_name || 'Unknown user'} - {formatDate(file.uploaded_at)}
                                                    {file.folder_year ? ` - ${file.folder_year}` : ''}
                                                </p>
                                                <p className="detail-list-copy">
                                                    Subprojects / {file.folder_year || 'Year'} / {file.operating_unit || 'Operating Unit'} / {file.ipo_name || 'IPO'} / {file.subproject_name || 'Subproject'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="drive-file-card__actions">
                                            {canPreviewSubprojectDriveFile(file) && (
                                                <button
                                                    type="button"
                                                    className="table-action table-action--primary"
                                                    onClick={() => setPreviewDriveFile(file)}
                                                >
                                                    <Eye aria-hidden="true" />
                                                    Preview
                                                </button>
                                            )}
                                            {file.web_view_link && (
                                                <a className="table-action table-action--primary" href={file.web_view_link} target="_blank" rel="noreferrer">
                                                    <ExternalLink aria-hidden="true" />
                                                    Open
                                                </a>
                                            )}
                                            {canDeleteDriveFiles && (
                                                <button
                                                    type="button"
                                                    className="table-action table-action--danger"
                                                    onClick={() => requestDriveFileDelete(file)}
                                                    disabled={deletingDriveFileId === file.id}
                                                >
                                                    {deletingDriveFileId === file.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No files have been uploaded for this subproject yet.</p>
                        )}
                    </CollapsibleDetailCard>

                </div>
                 {/* Right Column */}
                <div className="detail-aside">
                     <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">History</h3>
                            {subproject.history && subproject.history.length > 5 && (
                                <select
                                    value={historyLimit}
                                    onChange={(e) => setHistoryLimit(Number(e.target.value))}
                                    className="form-control"
                                >
                                    <option value={5}>5</option>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={subproject.history.length}>All</option>
                                </select>
                            )}
                        </div>
                        {subproject.history && subproject.history.length > 0 ? (
                            <div className="detail-timeline">
                                <ul className="detail-timeline__list">
                                    {subproject.history.slice(0, historyLimit).map((entry, index) => (
                                        <li key={index} className="detail-timeline__item">
                                            <span className="detail-timeline__marker"></span>
                                            <time className="detail-timeline__time">{formatDate(entry.date)}</time>
                                            <p className="detail-list-name">{entry.event}</p>
                                            <p className="detail-timeline__byline">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="detail-empty">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
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
                    <section className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="detail-budget-fields-title">
                        <header className="modal-card__header"><h3 id="detail-budget-fields-title">Complete Budget Item Fields</h3></header>
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

export default SubprojectDetail;
