// Author: 4K
import React from 'react';
import {
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import { OfficeRequirementsTab } from './program_management/OfficeRequirementsTab';
import { StaffingRequirementsTab } from './program_management/StaffingRequirementsTab';
import { OtherExpensesTab } from './program_management/OtherExpensesTab';
import type { DataScope } from '../lib/scopedDataFetch';
import type { ProgramManagementPageKey } from '../lib/appNavigation';
import { DcfScopeFilterPanel, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';

interface ProgramManagementProps {
    activePage: ProgramManagementPageKey;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelectOfficeReq: (item: OfficeRequirement) => void;
    onSelectStaffingReq: (item: StaffingRequirement) => void;
    onSelectOtherExpense: (item: OtherProgramExpense) => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

const ProgramManagement: React.FC<ProgramManagementProps> = ({
    activePage,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense,
    onDataScopeChange
}) => {
    const activeTab = activePage;
    const dcfFilters = useDcfScopeFilters({
        storageKey: 'program_management_dcf_scope',
        moduleName: 'Program Management',
        onDataScopeChange
    });

    const scopedOfficeReqs = React.useMemo(
        () => officeReqs.filter(item => matchesDcfScope(item as any, dcfFilters.value, 'fundYear')),
        [officeReqs, dcfFilters.value]
    );
    const scopedStaffingReqs = React.useMemo(
        () => staffingReqs.filter(item => matchesDcfScope(item as any, dcfFilters.value, 'fundYear')),
        [staffingReqs, dcfFilters.value]
    );
    const scopedOtherProgramExpenses = React.useMemo(
        () => otherProgramExpenses.filter(item => matchesDcfScope(item as any, dcfFilters.value, 'fundYear')),
        [otherProgramExpenses, dcfFilters.value]
    );

    return (
        <div className="data-list-page">
            <div className="data-list-header">
                <h2 className="data-list-title">Program Management</h2>
            </div>
            <DcfScopeFilterPanel idPrefix="program-management-dcf" filters={dcfFilters} />

            <div className="animate-fadeIn">
                {activeTab === 'Office' && (
                    <OfficeRequirementsTab
                        items={scopedOfficeReqs}
                        setItems={setOfficeReqs}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectOfficeReq}
                    />
                )}
                {activeTab === 'Staffing' && (
                    <StaffingRequirementsTab
                        items={scopedStaffingReqs}
                        setItems={setStaffingReqs}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectStaffingReq}
                    />
                )}
                {activeTab === 'Other' && (
                    <OtherExpensesTab
                        items={scopedOtherProgramExpenses}
                        setItems={setOtherProgramExpenses}
                        uacsCodes={uacsCodes}
                        onSelect={onSelectOtherExpense}
                    />
                )}
            </div>
        </div>
    );
};

export default ProgramManagement;
