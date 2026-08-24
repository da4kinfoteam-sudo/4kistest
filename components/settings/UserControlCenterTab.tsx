import React from 'react';
import CentralRoleRulesEditor from './CentralRoleRulesEditor';
import WorkflowGovernanceEditor from './WorkflowGovernanceEditor';
import DcfPolicyEditor from './DcfPolicyEditor';

const UserControlCenterTab: React.FC = () => (
    <div className="access-control form-stack form-stack--spacious">
        <CentralRoleRulesEditor />
        <WorkflowGovernanceEditor />
        <DcfPolicyEditor />
    </div>
);

export default UserControlCenterTab;
