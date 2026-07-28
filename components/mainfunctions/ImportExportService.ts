// Author: 4K
import React from 'react';
import { 
    Subproject, Activity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense,
    SubprojectDetail, ActivityExpense, fundTypes, tiers, objectTypes, ObjectType, philippineRegions, operatingUnits, Tier, FundType
} from '../../constants';
import { parseLocation } from '../LocationPicker';
import { supabase } from '../../supabaseClient';
import { parseOfficeRequirementRow } from '../program_management/OfficeRequirementsTab';
import { parseStaffingRequirementRow } from '../program_management/StaffingRequirementsTab';
import { parseOtherExpenseRow } from '../program_management/OtherExpensesTab';
import { getActivityDisplayTitle, resolveIpoByIdOrName } from '../../lib/entityIdentity';
import { replaceManyActivityIpoRelationships, resolveSelectedIpoIds } from '../../lib/activityIpoRelationships';

declare const XLSX: any;

// Helper to map short codes/numbers to full Region names
export const resolveRegion = (input: string | number | undefined): string => {
    if (!input) return '';
    const s = String(input).toUpperCase().trim();
    
    // Direct match check (case insensitive)
    const exactMatch = philippineRegions.find(r => r.toUpperCase() === s);
    if (exactMatch) return exactMatch;

    // Mapping for Short Codes / Numbers
    if (s === 'NCR' || s === '130000000') return 'National Capital Region (NCR)';
    if (s === 'CAR') return 'Cordillera Administrative Region (CAR)';
    if (s === '1' || s === 'I') return 'Region I (Ilocos Region)';
    if (s === '2' || s === 'II') return 'Region II (Cagayan Valley)';
    if (s === '3' || s === 'III') return 'Region III (Central Luzon)';
    if (['4A', '4-A', 'IV-A', 'IVA'].includes(s)) return 'Region IV-A (CALABARZON)';
    if (['4B', '4-B', 'IV-B', 'IVB', 'MIMAROPA'].includes(s)) return 'MIMAROPA Region';
    if (s === '5' || s === 'V') return 'Region V (Bicol Region)';
    if (s === '6' || s === 'VI') return 'Region VI (Western Visayas)';
    if (s === '7' || s === 'VII') return 'Region VII (Central Visayas)';
    if (s === '8' || s === 'VIII') return 'Region VIII (Eastern Visayas)';
    if (s === '9' || s === 'IX') return 'Region IX (Zamboanga Peninsula)';
    if (s === '10' || s === 'X') return 'Region X (Northern Mindanao)';
    if (s === '11' || s === 'XI') return 'Region XI (Davao Region)';
    if (s === '12' || s === 'XII') return 'Region XII (SOCCSKSARGEN)';
    if (['13', 'XIII', 'CARAGA'].includes(s)) return 'Region XIII (Caraga)';
    if (['BARMM', 'ARMM'].includes(s)) return 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)';
    if (s === 'NIR') return 'Negros Island Region (NIR)'; 

    return String(input).trim();
};

// Helper to map short codes/numbers to Operating Units
export const resolveOperatingUnit = (input: string | number | undefined): string => {
    if (!input) return '';
    const s = String(input).toUpperCase().trim();
    
    // Direct match check (case insensitive against existing operatingUnits)
    const exactMatch = operatingUnits.find(ou => ou.toUpperCase() === s);
    if (exactMatch) return exactMatch;

    // Mapping for Short Codes / Numbers
    if (s === 'NPMO') return 'NPMO';
    if (s === 'CAR') return 'RPMO CAR';
    if (s === '1' || s === 'I') return 'RPMO 1';
    if (s === '2' || s === 'II') return 'RPMO 2';
    if (s === '3' || s === 'III') return 'RPMO 3';
    if (['4A', '4-A', 'IV-A', 'IVA'].includes(s)) return 'RPMO 4A';
    if (['4B', '4-B', 'IV-B', 'IVB', 'MIMAROPA'].includes(s)) return 'RPMO 4B';
    if (s === '5' || s === 'V') return 'RPMO 5';
    if (s === '6' || s === 'VI') return 'RPMO 6';
    if (s === '7' || s === 'VII') return 'RPMO 7';
    if (s === '8' || s === 'VIII') return 'RPMO 8';
    if (s === '9' || s === 'IX') return 'RPMO 9';
    if (s === '10' || s === 'X') return 'RPMO 10';
    if (s === '11' || s === 'XI') return 'RPMO 11';
    if (s === '12' || s === 'XII') return 'RPMO 12';
    if (['13', 'XIII', 'CARAGA'].includes(s)) return 'RPMO 13';
    if (['NIR', 'NEGROS'].includes(s)) return 'RPMO NIR';

    return String(input).trim();
};

// Helper to resolve Tier input (1 -> Tier 1, 2 -> Tier 2)
export const resolveTier = (input: string | number | undefined): Tier | undefined => {
    if (input === undefined || input === null) return undefined;
    const s = String(input).trim().toLowerCase();
    
    if (s === '1' || s === 'tier 1' || s === 'tier1') return 'Tier 1';
    if (s === '2' || s === 'tier 2' || s === 'tier2') return 'Tier 2';
    
    // Check if it matches existing types exactly (case sensitive fallback)
    if (tiers.includes(input as Tier)) return input as Tier;
    
    return undefined;
};

// Helper to parse various date/month formats to YYYY-MM-01
const parseMonthToDate = (input: any): string => {
    if (!input) return '';
    
    // If it's a number (Excel serial date)
    if (typeof input === 'number') {
        // Excel base date is 1899-12-30
        const date = new Date(Math.round((input - 25569) * 86400 * 1000));
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }
    
    const str = String(input).trim();
    
    // Try YYYY-MM-DD or YYYY-MM
    if (str.match(/^\d{4}-\d{2}/)) {
        return str.substring(0, 7) + '-01';
    }
    
    // Try Month Year (e.g. "January 2024", "Jan 2024", "Jan-24")
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }
    
    return '';
};

// --- SUBPROJECTS ---

export const downloadSubprojectsReport = (subprojects: Subproject[]) => {
    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    };

    const data = subprojects.map(s => ({
        UID: s.uid,
        Name: s.name,
        IPO: s.indigenousPeopleOrganization,
        Location: s.location,
        Status: s.status,
        'Fund Year': s.fundingYear,
        'Fund Type': s.fundType,
        'Tier': s.tier,
        Budget: calculateTotalBudget(s.details),
        'End Date': s.estimatedCompletionDate,
        'Operating Unit': s.operatingUnit
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Subprojects");
    XLSX.writeFile(wb, "Subprojects_Report.xlsx");
};

export const downloadSubprojectsTemplate = () => {
    const headers = [
        'uid', 'name', 'indigenousPeopleOrganization', 'status', 'packageType', 
        'estimatedCompletionDate', 'actualCompletionDate', 'fundingYear', 'fundType', 'tier', 'operatingUnit', 'remarks',
        'detail_type', 'detail_particulars', 'detail_deliveryDate', 'detail_unitOfMeasure', 'detail_pricePerUnit', 'detail_numberOfUnits', 
        'detail_uacsCode', 'detail_obligationMonth', 'detail_disbursementMonth'
    ];

    const exampleData = [
        {
            uid: 'SP-TEMP-001',
            name: 'Sample Coffee Production',
            indigenousPeopleOrganization: 'Samahan ng mga Katutubong Dumagat',
            status: 'Ongoing',
            packageType: 'Package 1',
            estimatedCompletionDate: 'June 2024',
            actualCompletionDate: '',
            fundingYear: 2024,
            fundType: 'Current',
            tier: 'Tier 1',
            operatingUnit: 'RPMO 4A',
            remarks: 'Sample upload with multiple items',
            detail_type: 'Equipment',
            detail_particulars: 'Coffee Roaster',
            detail_deliveryDate: 'March 2024',
            detail_unitOfMeasure: 'unit',
            detail_pricePerUnit: 150000,
            detail_numberOfUnits: 1,
            detail_uacsCode: '10605030-00',
            detail_obligationMonth: 'February 2024',
            detail_disbursementMonth: 'March 2024'
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["uid", "Unique Identifier. REQUIRED. Rows with the same UID will be grouped into one subproject."],
        ["name", "Name of the subproject."],
        ["indigenousPeopleOrganization", "Name of the IPO. Location will be automatically derived from the system's IPO list."],
        ["status", "Proposed, Ongoing, Completed, or Cancelled."],
        ["packageType", "Package 1, Package 2, etc."],
        ["estimatedCompletionDate", "Month Year (e.g., June 2024)"],
        ["actualCompletionDate", "Month Year (Optional)"],
        ["fundingYear", "Year (e.g., 2024)"],
        ["fundType", "Current, Continuing, or Insertion"],
        ["tier", "Tier 1 or Tier 2"],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["remarks", "Optional remarks"],
        ["detail_type", "Item Type (e.g., Equipment, Livestock, etc.)"],
        ["detail_particulars", "Specific item name."],
        ["detail_deliveryDate", "Month Year (e.g., March 2024)"],
        ["detail_unitOfMeasure", "pcs, kgs, unit, lot, heads"],
        ["detail_pricePerUnit", "Number"],
        ["detail_numberOfUnits", "Number"],
        ["detail_uacsCode", "Specific UACS Code. Object Type and Expense Particular will be derived from this code."],
        ["detail_obligationMonth", "Month Year (e.g., February 2024)"],
        ["detail_disbursementMonth", "Month Year (e.g., March 2024)"]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);

    XLSX.utils.book_append_sheet(wb, ws_data, "Subprojects Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

    XLSX.writeFile(wb, "Subprojects_Upload_Template.xlsx");
};

export const handleSubprojectsUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    subprojects: Subproject[],
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>,
    ipos: IPO[],
    logAction: (action: string, details: string, ipoName?: string) => void,
    setIsUploading: (val: boolean) => void,
    uacsCodes: any,
    currentUser: any
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            const groupedData = new Map<string, any>();
            let maxId = subprojects.reduce((max, s) => Math.max(max, s.id), 0);
            const currentTimestamp = new Date().toISOString();

            // Track existing UIDs to prevent duplicates
            const existingUids = new Set(subprojects.map(s => s.uid));
            let skippedCount = 0;

            jsonData.forEach((row: any, index: number) => {
                const uid = String(row.uid || '').trim();
                if (!uid) return; 
                
                // Skip rows that belong to already existing subprojects
                if (existingUids.has(uid)) {
                    // Only increment count if we haven't seen this UID in this loop yet
                    // (since multiple rows can have same UID)
                    if (!groupedData.has(uid)) skippedCount++;
                    return; 
                }

                if (!groupedData.has(uid)) {
                    maxId++;
                    
                    // Lookup IPO for Location
                    const ipoName = String(row.indigenousPeopleOrganization || '').trim();
                    const matchedIpo = resolveIpoByIdOrName(ipos, undefined, ipoName);
                    const locationString = matchedIpo ? matchedIpo.location : '';

                    // Prioritize row.operatingUnit from Excel with resolution
                    const rawOU = row.operatingUnit ? String(row.operatingUnit) : undefined;
                    const operatingUnit = rawOU ? resolveOperatingUnit(rawOU) : (currentUser?.operatingUnit || '');

                    groupedData.set(uid, {
                        id: maxId, // Only for offline use, stripped before Supabase insert
                        uid: uid,
                        name: String(row.name),
                        location: locationString,
                        indigenousPeopleOrganization: ipoName,
                        ipo_id: matchedIpo?.id,
                        status: row.status,
                        packageType: row.packageType,
                        startDate: `${row.fundingYear || new Date().getFullYear()}-01-01`, // Default since start date is removed
                        estimatedCompletionDate: parseMonthToDate(row.estimatedCompletionDate),
                        actualCompletionDate: row.actualCompletionDate ? parseMonthToDate(row.actualCompletionDate) : undefined,
                        fundingYear: Number(row.fundingYear),
                        fundType: row.fundType,
                        tier: resolveTier(row.tier),
                        operatingUnit: operatingUnit,
                        encodedBy: currentUser?.fullName || 'System Upload',
                        remarks: row.remarks,
                        lat: matchedIpo?.lat || 14.5995 + (Math.random() * 0.1 - 0.05), 
                        lng: matchedIpo?.lng || 120.9842 + (Math.random() * 0.1 - 0.05),
                        details: [],
                        subprojectCommodities: [],
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    });
                }

                const subproject = groupedData.get(uid);
                
                if (row.detail_particulars && subproject) {
                    let uacsCode = String(row.detail_uacsCode || '').trim();
                    let objectType = 'MOOE'; // Default
                    let expenseParticular = '';

                    // Derive Object Type and Expense Particular from UACS Code
                    if (uacsCodes && uacsCode) {
                        const normalizedUpload = uacsCode.replace(/[^a-zA-Z0-9]/g, '');
                        let matchFound = false;

                        outerLoop:
                        for (const ot of Object.keys(uacsCodes)) {
                            for (const part of Object.keys(uacsCodes[ot])) {
                                const validCodes = Object.keys(uacsCodes[ot][part]);
                                const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                                if (match) {
                                    uacsCode = match; // Canonical code
                                    objectType = ot;
                                    expenseParticular = part;
                                    matchFound = true;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    subproject.details.push({
                        id: Date.now() + index, 
                        type: row.detail_type,
                        particulars: row.detail_particulars,
                        deliveryDate: parseMonthToDate(row.detail_deliveryDate),
                        unitOfMeasure: row.detail_unitOfMeasure,
                        pricePerUnit: Number(row.detail_pricePerUnit),
                        numberOfUnits: Number(row.detail_numberOfUnits),
                        objectType: objectType,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        obligationMonth: parseMonthToDate(row.detail_obligationMonth),
                        disbursementMonth: parseMonthToDate(row.detail_disbursementMonth)
                    });
                }
            });

            const newSubprojects = Array.from(groupedData.values());

            if (newSubprojects.length > 0) {
                logAction('Imported Subprojects', `Imported ${newSubprojects.length} subprojects from Excel`);
                
                if (supabase) {
                    // Explicit insert to prevent doubling and ID issues
                    // Remove ID so Postgres auto-generates it based on sequence
                    const payload = newSubprojects.map(({ id, ...rest }) => rest);
                    const { data, error } = await supabase.from('subprojects').insert(payload).select();
                    
                    if (error) {
                        console.error("Error inserting subprojects:", error);
                        alert(`Error inserting data: ${error.message}`);
                    } else if (data) {
                        // Update local state with returned data (containing correct IDs)
                        // This will trigger useSupabaseTable upsert but it will be a no-op/update
                        setSubprojects(prev => [...prev, ...(data as Subproject[])]);
                        let msg = `${data.length} subprojects imported successfully!`;
                        if (skippedCount > 0) msg += ` (${skippedCount} duplicates skipped)`;
                        alert(msg);
                    }
                } else {
                    setSubprojects(prev => [...prev, ...newSubprojects]);
                    let msg = `${newSubprojects.length} subprojects imported locally!`;
                    if (skippedCount > 0) msg += ` (${skippedCount} duplicates skipped)`;
                    alert(msg);
                }
            } else if (skippedCount > 0) {
                alert(`All ${skippedCount} items in the file were skipped because they already exist in the system (Duplicate UIDs).`);
            } else {
                alert("No valid data found to import.");
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if(e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- ACTIVITIES ---

export const downloadActivitiesReport = (activities: Activity[]) => {
    const dataToExport = activities.map(a => ({
        'UID': a.uid || '',
        'Type': a.type,
        'Component': a.component,
        'Activity Type': a.name,
        'Activity Title': getActivityDisplayTitle(a),
        'Date': a.date,
        'Location': a.location,
        'Male Participants': a.participantsMale,
        'Female Participants': a.participantsFemale,
        'Total Budget': a.expenses.reduce((sum, e) => sum + e.amount, 0),
        'Funding Year': a.fundingYear,
        'Fund Type': a.fundType,
        'Tier': a.tier,
        'Operating Unit': a.operatingUnit,
        'Encoded By': a.encodedBy,
        'Participating IPOs': a.participatingIpos.join(', '),
        'Facilitator': a.type === 'Training' ? a.facilitator : 'N/A',
        'Description': a.description,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activities Report");
    XLSX.writeFile(wb, "Activities_Report.xlsx");
};

export const downloadActivitiesTemplate = () => {
    const headers = [
        'uid', 'type', 'component', 'name', 'activity_title', 'date', 'province', 'municipality', 'facilitator', 'description',
        'participatingIpos', 'participantsMale', 'participantsFemale',
        'fundingYear', 'fundType', 'tier', 'operatingUnit',
        'expense_uacsCode', 'expense_obligationMonth', 'expense_disbursementMonth', 'expense_amount'
    ];
    const exampleData = [
        {
            uid: 'TRN-2024-001',
            type: 'Training',
            component: 'Social Preparation',
            name: 'Basic Leadership Training',
            activity_title: 'Basic Leadership Training for the 2024 Officers',
            date: '2024-03-15',
            province: 'Rizal',
            municipality: 'Tanay',
            facilitator: 'John Doe',
            description: 'Leadership skills training.',
            participatingIpos: 'San Isidro Farmers Association; Other IPO',
            participantsMale: 10,
            participantsFemale: 15,
            fundingYear: 2024,
            fundType: 'Current',
            tier: 'Tier 1',
            operatingUnit: 'RPMO 4A',
            expense_uacsCode: '50202010-01',
            expense_obligationMonth: '2024-03-01',
            expense_disbursementMonth: '2024-03-20',
            expense_amount: 25000
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["name", "Configured generic Activity Type or the legacy Training name."],
        ["activity_title", "Required specific title for this Activity occurrence."],
        ["participatingIpos", "Names of IPOs. Separate multiple IPOs with a semicolon (;). Example: 'IPO One; IPO Two'"],
        ["province", "Province name."],
        ["municipality", "City or Municipality name."],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["expense_uacsCode", "UACS Code used to identify Expense Particular and Object Type."],
        ["expense_amount", "Amount for the expense entry."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, ws_data, "Activities Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");
    XLSX.writeFile(wb, "Activities_Upload_Template.xlsx");
};

export const handleActivitiesUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    activities: Activity[],
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>,
    ipos: IPO[],
    logAction: (action: string, details: string) => void,
    setIsUploading: (val: boolean) => void,
    uacsCodes: any,
    currentUser: any
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            let currentId = activities.reduce((max, a) => Math.max(max, a.id), 0);
            const existingIpoNames = new Set(ipos.map(ipo => ipo.name));

            const groupedData = new Map<string, any>();

            jsonData.forEach((row: any, index: number) => {
                const rowNum = index + 2;
                const uid = String(row.uid || '').trim();
                if (!uid) return; // Skip empty rows

                // Extract participating IPOs for this row (moved out of new entry block to support merging)
                let rowParticipatingIpos: string[] = [];
                const rawIpos = (row.participatingIpos || '').toString().trim();

                if (rawIpos) {
                    // 1. Exact match check (handles "Name, Inc" single entry)
                    if (existingIpoNames.has(rawIpos)) {
                        rowParticipatingIpos = [rawIpos];
                    } 
                    // 2. Semicolon delimiter check (Preferred for multiple)
                    else if (rawIpos.includes(';')) {
                        rowParticipatingIpos = rawIpos.split(';').map((s: string) => s.trim()).filter(Boolean);
                    } 
                    // 3. Fallback to comma (Legacy, risky for names with Inc.)
                    else {
                        rowParticipatingIpos = rawIpos.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }
                }

                // Verify IPOs
                for (const ipoName of rowParticipatingIpos) {
                    if (!existingIpoNames.has(ipoName)) throw new Error(`Row ${rowNum}: IPO "${ipoName}" not found in system.`);
                }

                if (!groupedData.has(uid)) {
                    // Removed required check for province and municipality
                    const activityTitle = String(
                        row.activity_title || (row.type === 'Training' ? row.name : '')
                    ).trim();
                    if (!row.type || !row.component || !row.name || !activityTitle || !row.date) {
                        throw new Error(`Row ${rowNum} (UID: ${uid}): Missing required common fields (type, component, name, activity_title, date).`);
                    }

                    const municipality = String(row.municipality || '').trim();
                    const province = String(row.province || '').trim();
                    // Handle empty location fields gracefully
                    const locationString = (municipality && province) ? `${municipality}, ${province}` : (municipality || province || '');

                    // Prioritize row.operatingUnit
                    const rawOU = row.operatingUnit ? String(row.operatingUnit) : undefined;
                    const operatingUnit = rawOU ? resolveOperatingUnit(rawOU) : (currentUser?.operatingUnit || 'NPMO');

                    groupedData.set(uid, {
                        common: {
                            uid: uid,
                            type: row.type,
                            component: row.component as any,
                            name: String(row.name),
                            activity_title: activityTitle,
                            date: String(row.date),
                            description: String(row.description || ''),
                            location: locationString,
                            participatingIpos: rowParticipatingIpos, // Use row's IPOs for initial entry
                            participating_ipo_ids: resolveSelectedIpoIds(rowParticipatingIpos, ipos),
                            participantsMale: Number(row.participantsMale) || 0,
                            participantsFemale: Number(row.participantsFemale) || 0,
                            fundingYear: Number(row.fundingYear) || undefined,
                            fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                            tier: resolveTier(row.tier),
                            operatingUnit: operatingUnit,
                            encodedBy: currentUser?.fullName || 'System',
                            facilitator: String(row.facilitator || ''),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        },
                        expenses: []
                    });
                } else {
                    // Entry exists, merge participating IPOs
                    const entry = groupedData.get(uid);
                    const currentIpos = new Set(entry.common.participatingIpos);
                    rowParticipatingIpos.forEach(ipo => currentIpos.add(ipo));
                    entry.common.participatingIpos = Array.from(currentIpos);
                }

                if (row.expense_amount !== undefined) {
                    let uacsCode = String(row.expense_uacsCode || '').trim();
                    let objectType = 'MOOE'; // Default
                    let expenseParticular = '';

                    // Look up details from uacsCodes reference
                    if (uacsCodes && uacsCode) {
                        const normalizedUpload = uacsCode.replace(/[^a-zA-Z0-9]/g, '');
                        let matchFound = false;

                        outerLoop:
                        for (const ot of Object.keys(uacsCodes)) {
                            for (const part of Object.keys(uacsCodes[ot])) {
                                const validCodes = Object.keys(uacsCodes[ot][part]);
                                const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                                if (match) {
                                    uacsCode = match; // Canonical code
                                    objectType = ot;
                                    expenseParticular = part;
                                    matchFound = true;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    groupedData.get(uid).expenses.push({
                        id: Date.now() + index * 10,
                        objectType: objectType as any,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        obligationMonth: String(row.expense_obligationMonth || ''),
                        disbursementMonth: String(row.expense_disbursementMonth || ''),
                        amount: Number(row.expense_amount)
                    });
                }
            });

            const newActivities: any[] = [];
            groupedData.forEach((group) => {
                newActivities.push({
                    ...group.common,
                    participating_ipo_ids: resolveSelectedIpoIds(group.common.participatingIpos || [], ipos),
                    expenses: group.expenses,
                });
            });

            if (newActivities.length > 0) {
                logAction('Imported Activities', `Imported ${newActivities.length} activities from Excel`);

                if (supabase) {
                    // Explicit insert to generate proper IDs
                    const { data, error } = await supabase.from('activities').insert(newActivities).select();
                    if (error) {
                        console.error("Error inserting activities:", error);
                        alert(`Error inserting data: ${error.message}`);
                    } else if (data) {
                        const createdActivities = (data as Activity[]).map(created => ({
                            ...created,
                            participating_ipo_ids: resolveSelectedIpoIds(created.participatingIpos || [], ipos),
                        }));
                        await replaceManyActivityIpoRelationships(
                            createdActivities.map(created => ({
                                id: Number(created.id),
                                ipoIds: created.participating_ipo_ids || [],
                            })),
                            currentUser?.fullName || currentUser?.email
                        );
                        setActivities(prev => [...prev, ...createdActivities]);
                        alert(`${data.length} activities imported successfully!`);
                    }
                } else {
                    const localActivities = newActivities.map((act, i) => ({ id: currentId + i + 1, ...act }));
                    setActivities(prev => [...prev, ...localActivities]);
                    alert(`${newActivities.length} activities imported locally!`);
                }
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if(e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- IPOS ---

export const downloadIposReport = (ipos: IPO[]) => {
    const dataToExport = ipos.map(ipo => ({
        'Name': ipo.name,
        'Location': ipo.location,
        'Region': ipo.region,
        'ICC': ipo.indigenousCulturalCommunity,
        'AD No.': ipo.ancestralDomainNo,
        'Registering Body': ipo.registeringBody,
        'Women-Led': ipo.isWomenLed ? 'Yes' : 'No',
        'GIDA': ipo.isWithinGida ? 'Yes' : 'No',
        'ELCAC': ipo.isWithinElcac ? 'Yes' : 'No',
        'With SCAD': ipo.isWithScad ? 'Yes' : 'No',
        'Contact Person': ipo.contactPerson,
        'Contact Number': ipo.contactNumber,
        'Registration Date': ipo.registrationDate,
        'Commodities': JSON.stringify(ipo.commodities),
        'Level of Development': ipo.levelOfDevelopment
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPO Report");
    XLSX.writeFile(wb, "IPO_Report.xlsx");
};

export const downloadIposTemplate = () => {
    const headers = [
        'name', 'region', 'province', 'municipality', 'barangay', 'indigenousCulturalCommunity', 
        'ancestralDomainNo', 'registeringBody', 'isWomenLed', 'isWithinGida', 'isWithinElcac', 'isWithScad',
        'contactPerson', 'contactNumber', 'registrationDate', 'commodities', 
        'levelOfDevelopment'
    ];
    
    const exampleData = [{
        name: 'Sample Farmers Association',
        region: 'Region IV-A (CALABARZON)',
        province: 'Rizal',
        municipality: 'Tanay',
        barangay: 'Brgy. Daraitan',
        indigenousCulturalCommunity: 'Dumagat',
        ancestralDomainNo: 'AD-12345',
        registeringBody: 'CDA',
        isWomenLed: 'TRUE',
        isWithinGida: 'FALSE',
        isWithinElcac: 'TRUE',
        isWithScad: 'TRUE',
        contactPerson: 'Juan Dela Cruz',
        contactNumber: '09171234567',
        registrationDate: '2023-01-15',
        commodities: '[{"type":"Crop","particular":"Rice Seeds","value":50,"isScad":true}]',
        levelOfDevelopment: 2
    }];

    const instructions = [
        ["Column", "Description"],
        ["name", "Full name of the IPO. (Required)"],
        ["region", "Region. You can enter the full name or short codes: '1'-'13', 'NCR', 'CAR', 'BARMM', 'NIR', '4A', '4B'. (Required)"],
        ["province", "Province name. (Required)"],
        ["municipality", "City or Municipality name. (Required)"],
        ["barangay", "Barangay name(s). Optional. Separate multiple barangays with a comma (e.g., 'Brgy A, Brgy B')."],
        ["indigenousCulturalCommunity", "The name of the indigenous cultural community."],
        ["ancestralDomainNo", "The ancestral domain number, if any."],
        ["registeringBody", "e.g., SEC, DOLE, CDA, National Commission on Indigenous Peoples."],
        ["isWomenLed", "Enter TRUE or FALSE."],
        ["isWithinGida", "Enter TRUE or FALSE."],
        ["isWithinElcac", "Enter TRUE or FALSE."],
        ["isWithScad", "Enter TRUE or FALSE. Note: This will be auto-recalculated based on commodities upon upload to ensure consistency."],
        ["contactPerson", "Name of the contact person."],
        ["contactNumber", "Contact phone number."],
        ["registrationDate", "Date in YYYY-MM-DD format."],
        ["commodities", `A JSON string for commodities. Format: '[{"type":"Type","particular":"Name","value":Number,"isScad":boolean}]'. Example: '[{"type":"Livestock","particular":"Goats","value":100,"isScad":false}]'. Use '[]' for none.`],
        ["levelOfDevelopment", "A number from 1 to 5."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
    
    XLSX.utils.book_append_sheet(wb, ws_data, "IPO Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

    XLSX.writeFile(wb, "IPO_Upload_Template.xlsx");
};

export const handleIposUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    ipos: IPO[],
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>,
    logAction: (action: string, details: string) => void,
    setIsUploading: (val: boolean) => void,
    gidaAreas: any[],
    elcacAreas: any[]
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            let currentMaxId = ipos.reduce((max, ipo) => Math.max(max, ipo.id), 0);
            
            const newIpos: Omit<IPO, 'id'>[] = jsonData.map((row: any, index: number) => {
                if (!row.name || !row.region || !row.province || !row.municipality) {
                    throw new Error(`Row ${index + 2} is missing required fields (name, region, province, municipality).`);
                }

                let commodities: any[];
                try {
                    commodities = typeof row.commodities === 'string' ? JSON.parse(row.commodities) : [];
                } catch {
                    console.warn(`Row ${index + 2}: Invalid JSON in 'commodities' column. Defaulting to empty.`);
                    commodities = [];
                }

                let locationString = '';
                const brgy = row.barangay ? String(row.barangay).trim() : '';
                const municipality = String(row.municipality).trim();
                const province = String(row.province).trim();
                const region = resolveRegion(row.region);

                if (brgy) {
                    const brgyList = brgy.split(',').map((b: string) => b.trim()).filter((b: string) => b !== '');
                    const formattedBrgys = brgyList.map((b: string) => b.startsWith('Brgy.') || b.startsWith('Sitio') ? b : `Brgy. ${b}`);
                    locationString = `${formattedBrgys.join(', ')}, ${municipality}, ${province}`;
                } else {
                    locationString = `${municipality}, ${province}`;
                }

                const isWithScad = commodities.some((c: any) => c.isScad);

                // Auto-check GIDA status
                const { province: parsedProvince, municipality: parsedMunicipality, barangays: parsedBarangays } = parseLocation(locationString);
                const matchedGida = gidaAreas.some(g => 
                    g.region === region &&
                    g.province.toLowerCase() === parsedProvince.toLowerCase() &&
                    g.municipality.toLowerCase() === parsedMunicipality.toLowerCase() &&
                    parsedBarangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
                );
                const isWithinGida = String(row.isWithinGida).toUpperCase() === 'TRUE' || matchedGida;

                // Auto-check ELCAC status
                const matchedElcac = elcacAreas.some(e => 
                    e.region === region &&
                    e.province.toLowerCase() === parsedProvince.toLowerCase() &&
                    e.municipality.toLowerCase() === parsedMunicipality.toLowerCase() &&
                    parsedBarangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
                );
                const isWithinElcac = String(row.isWithinElcac).toUpperCase() === 'TRUE' || matchedElcac;

                return {
                    name: String(row.name),
                    location: locationString,
                    region: region,
                    indigenousCulturalCommunity: String(row.indigenousCulturalCommunity || ''),
                    ancestralDomainNo: String(row.ancestralDomainNo || ''),
                    registeringBody: String(row.registeringBody || ''),
                    isWomenLed: String(row.isWomenLed).toUpperCase() === 'TRUE',
                    isWithinGida: isWithinGida,
                    isWithinElcac: isWithinElcac,
                    isWithScad: isWithScad,
                    contactPerson: String(row.contactPerson || ''),
                    contactNumber: String(row.contactNumber || ''),
                    registrationDate: row.registrationDate ? String(row.registrationDate) : null,
                    commodities: commodities,
                    levelOfDevelopment: parseInt(row.levelOfDevelopment, 10) as IPO['levelOfDevelopment'] || 1,
                    totalMembers: Number(row.totalMembers) || 0,
                    totalIpMembers: Number(row.totalIpMembers) || 0,
                    totalMaleMembers: Number(row.totalMaleMembers) || 0,
                    totalFemaleMembers: Number(row.totalFemaleMembers) || 0,
                    totalYouthMembers: Number(row.totalYouthMembers) || 0,
                    totalSeniorMembers: Number(row.totalSeniorMembers) || 0,
                    total4PsMembers: Number(row.total4PsMembers) || 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });

            logAction('Imported IPOs', `Imported ${newIpos.length} IPOs from Excel`);
            
            if (supabase) {
                // Insert to DB directly to generate correct IDs and avoid conflict
                const { data, error } = await supabase.from('ipos').insert(newIpos).select();
                if (error) {
                    console.error("Error inserting IPOs:", error);
                    alert(`Error inserting data: ${error.message}`);
                } else if (data) {
                    setIpos(prev => [...prev, ...(data as IPO[])]);
                    alert(`${data.length} IPO(s) imported successfully!`);
                }
            } else {
                const localIpos = newIpos.map((ipo, idx) => ({ id: currentMaxId + idx + 1, ...ipo }));
                setIpos(prev => [...prev, ...localIpos]);
                alert(`${newIpos.length} IPO(s) imported locally!`);
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if(e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};
