
// Author: 4K 
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    Deadline, PlanningSchedule, Subproject, Activity, IPO,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import SystemHealthCard from './settings/SystemHealthCard';
import UserProfileTab from './settings/UserProfileTab';
import UserManagementTab from './settings/UserManagementTab';
import SystemManagementTab from './settings/SystemManagementTab';
import UserLogsTab from './settings/UserLogsTab';
import DCFManagementTab from './settings/DCFManagementTab';
import LODManagementTab from './settings/LODManagementTab';
import ArchiveManagementTab from './settings/ArchiveManagementTab';
import { ThemePreference } from '../lib/theme';
import UserControlCenterTab from './settings/UserControlCenterTab';
import GoogleDriveStorageTab from './settings/GoogleDriveStorageTab';
import { PageHeader } from './ui/enterprise';

interface SettingsProps {
    isDarkMode: boolean;
    themePreference: ThemePreference;
    onThemePreferenceChange: (preference: ThemePreference) => void;
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    
    // Props for DCF Management
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectIpo: (ipo: IPO) => void;
}

type TabName = 'profile' | 'management' | 'control_center' | 'drive' | 'system' | 'logs' | 'dcf' | 'lod' | 'archive';

const getInitialSettingsTab = (): TabName => {
    const hashPath = window.location.hash.replace(/^#/, '');
    const [, query = ''] = hashPath.split('?');
    const requestedTab = new URLSearchParams(query).get('tab') as TabName | null;
    const validTabs: TabName[] = ['profile', 'management', 'control_center', 'drive', 'system', 'logs', 'dcf', 'lod', 'archive'];
    if (requestedTab && validTabs.includes(requestedTab)) return requestedTab;
    return hashPath.includes('drive=') ? 'drive' : 'profile';
};

const Settings: React.FC<SettingsProps> = ({ 
    isDarkMode, themePreference, onThemePreferenceChange,
    deadlines, setDeadlines,
    subprojects, setSubprojects,
    activities, setActivities,
    ipos, setIpos,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    otherProgramExpenses, setOtherProgramExpenses,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo
}) => {
    const { currentUser, hasAccess } = useAuth();
    const [activeTab, setActiveTab] = useState<TabName>(getInitialSettingsTab);

    const canManageUsers = hasAccess('Settings - User Management', 'manage_users');
    const canManageAccess = hasAccess('Settings - Access Control', 'manage_permissions');
    const canManageDrive = hasAccess('Settings - Google Drive', 'manage_settings');
    const canManageDcfSettings = hasAccess('Settings - DCF and Status', 'manage_settings');
    const canManageDcfStatus = hasAccess('Settings - DCF and Status', 'manage_status');
    const canManageDcfBudget = hasAccess('Settings - Financial Accomplishment', 'manage_settings');
    const canManageDcf = canManageDcfSettings || canManageDcfStatus || canManageDcfBudget;
    const canManageLod = hasAccess('Settings - LOD', 'manage_settings');
    const canAccessSystem = hasAccess('Settings - System', 'view');
    const canViewAudit = hasAccess('Settings - Audit and Security', 'view');
    const canManageArchive = hasAccess('Settings - Archive', 'manage_settings');

    useEffect(() => {
        if (canManageDrive && window.location.hash.includes('drive=')) {
            setActiveTab('drive');
        }
    }, [canManageDrive]);

    const isTabAllowed = (name: TabName): boolean => {
        if (name === 'profile') return true;
        switch (name) {
            case 'management': return canManageUsers;
            case 'control_center': return canManageAccess;
            case 'drive': return canManageDrive;
            case 'dcf': return canManageDcf;
            case 'lod': return canManageLod;
            case 'system':
                return canAccessSystem;
            case 'logs': return canViewAudit;
            case 'archive': return canManageArchive;
            default:
                return false;
        }
    };

    useEffect(() => {
        if (!isTabAllowed(activeTab)) {
            setActiveTab('profile');
        }
    }, [activeTab, canManageUsers, canManageAccess, canManageDrive, canManageDcf, canManageLod, canAccessSystem, canViewAudit, canManageArchive]);

    if (!currentUser) return null;

    const TabButton: React.FC<{ name: TabName; label: string }> = ({ name, label }) => {
        const isActive = activeTab === name;
        return (
            <button
                type="button"
                onClick={() => isTabAllowed(name) && setActiveTab(name)}
                className={`settings-tabs__button ${isActive ? 'is-active' : ''}`}
                aria-selected={isActive}
                role="tab"
            >
                {label}
            </button>
        );
    };

    return (
        <div className="settings-page animate-fadeIn">
             <PageHeader title="Settings" metadata="Manage your profile, access controls, integrations, and system preferences." />

             {hasAccess('Settings - System', 'view') && <SystemHealthCard />}

             <section className="settings-panel">
                <div className="settings-tabs">
                    <nav className="settings-tabs__list" aria-label="Settings sections" role="tablist">
                        <TabButton name="profile" label="User Profile" />
                        {canManageUsers && <TabButton name="management" label="Users Management" />}
                        {canManageAccess && <TabButton name="control_center" label="User Control Center" />}
                        {canManageDrive && <TabButton name="drive" label="Google Drive Storage" />}
                        {canManageDcf && <TabButton name="dcf" label="DCF Management" />}
                        {canManageLod && <TabButton name="lod" label="LOD Management" />}
                        {canAccessSystem && <TabButton name="system" label="System Management" />}
                        {canViewAudit && <TabButton name="logs" label="User Logs" />}
                        {canManageArchive && <TabButton name="archive" label="Archive Management" />}
                    </nav>
                </div>

                <div className="settings-panel__content" role="tabpanel">
                    {activeTab === 'profile' && (
                        <UserProfileTab
                            isDarkMode={isDarkMode}
                            themePreference={themePreference}
                            onThemePreferenceChange={onThemePreferenceChange}
                        />
                    )}
                    
                    {activeTab === 'control_center' && canManageAccess && (
                        <UserControlCenterTab />
                    )}

                    {activeTab === 'drive' && canManageDrive && (
                        <GoogleDriveStorageTab />
                    )}

                    {activeTab === 'management' && canManageUsers && (
                        <UserManagementTab />
                    )}

                    {activeTab === 'dcf' && canManageDcf && (
                        <DCFManagementTab 
                            subprojects={subprojects} setSubprojects={setSubprojects}
                            activities={activities} setActivities={setActivities}
                            officeReqs={officeReqs} setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs} setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                            canManageStatus={canManageDcfStatus}
                            canManageBudget={canManageDcfBudget}
                        />
                    )}

                    {activeTab === 'lod' && canManageLod && (
                        <LODManagementTab />
                    )}

                    {activeTab === 'system' && canAccessSystem && (
                        <SystemManagementTab 
                            deadlines={deadlines}
                            setDeadlines={setDeadlines}
                        />
                    )}

                    {activeTab === 'logs' && canViewAudit && (
                        <UserLogsTab 
                            subprojects={subprojects}
                            activities={activities}
                            ipos={ipos}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                            onSelectIpo={onSelectIpo}
                        />
                    )}

                    {activeTab === 'archive' && canManageArchive && (
                        <ArchiveManagementTab />
                    )}
                </div>
             </section>
        </div>
    );
};

export default Settings;
