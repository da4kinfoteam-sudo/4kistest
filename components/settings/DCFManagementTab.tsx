// Author: 4K
import React, { useState } from 'react';
import { 
    Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../../constants';
import PhysicalStatusManagement from './PhysicalStatusManagement';
import BudgetCeilingManagement from './BudgetCeilingManagement';

interface DCFManagementTabProps {
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
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    canManageStatus: boolean;
    canManageBudget: boolean;
}

const DCFManagementTab: React.FC<DCFManagementTabProps> = (props) => {
    const firstAvailableSection = props.canManageStatus ? 'physical' : props.canManageBudget ? 'budget' : null;
    const [activeSection, setActiveSection] = useState<'physical' | 'budget'>(firstAvailableSection || 'physical');

    React.useEffect(() => {
        if (activeSection === 'physical' && !props.canManageStatus) setActiveSection('budget');
        if (activeSection === 'budget' && !props.canManageBudget) setActiveSection('physical');
    }, [activeSection, props.canManageBudget, props.canManageStatus]);

    if (!firstAvailableSection) {
        return <div className="ui-state">No DCF or status management capability is enabled for your account.</div>;
    }

    return (
        <div className="form-stack form-stack--spacious">
            <div className="data-tabs__nav" role="tablist" aria-label="DCF management sections">
                {props.canManageStatus && <button
                    onClick={() => setActiveSection('physical')}
                    className={activeSection === 'physical' ? 'is-active' : undefined}
                    role="tab"
                    aria-selected={activeSection === 'physical'}
                >
                    Physical Status Management
                </button>}
                {props.canManageBudget && <button
                    onClick={() => setActiveSection('budget')}
                    className={activeSection === 'budget' ? 'is-active' : undefined}
                    role="tab"
                    aria-selected={activeSection === 'budget'}
                >
                    Budget Ceiling Management
                </button>}
            </div>

            {activeSection === 'physical' && props.canManageStatus ? (
                <PhysicalStatusManagement {...props} />
            ) : props.canManageBudget ? (
                <BudgetCeilingManagement 
                    subprojects={props.subprojects}
                    activities={props.activities}
                    officeReqs={props.officeReqs}
                    staffingReqs={props.staffingReqs}
                    otherProgramExpenses={props.otherProgramExpenses}
                />
            ) : null}
        </div>
    );
};

export default DCFManagementTab;
