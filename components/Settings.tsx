
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
    const [activeTab, setActiveTab] = useState<TabName>(() => (
        window.location.hash.includes('drive=') ? 'drive' : 'profile'
    ));

    // We keep these legacy admin checks as absolute fallbacks for settings only
    const isAdmin = currentUser?.role === 'Administrator' || currentUser?.role === 'Super Admin';
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    const isGuest = currentUser?.role === 'Guest';

    useEffect(() => {
        if (isSuperAdmin && window.location.hash.includes('drive=')) {
            setActiveTab('drive');
        }
    }, [isSuperAdmin]);

    // Use granular rules from user overrides/roles config where applicable
    const canAccessSystem = !isGuest && (hasAccess('System Management', 'view') || isAdmin);

    const isTabAllowed = (name: TabName): boolean => {
        if (name === 'profile') return true;
        if (isGuest) return false;

        switch (name) {
            case 'management':
            case 'dcf':
            case 'lod':
            case 'logs':
            case 'archive':
                return isAdmin;
            case 'control_center':
            case 'drive':
                return isSuperAdmin;
            case 'system':
                return canAccessSystem;
            default:
                return false;
        }
    };

    useEffect(() => {
        if (!isTabAllowed(activeTab)) {
            setActiveTab('profile');
        }
    }, [activeTab, isAdmin, isSuperAdmin, isGuest, canAccessSystem]);

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

             {!isGuest && <SystemHealthCard />}

             <section className="settings-panel">
                <div className="settings-tabs">
                    <nav className="settings-tabs__list" aria-label="Settings sections" role="tablist">
                        <TabButton name="profile" label="User Profile" />
                        {isAdmin && <TabButton name="management" label="Users Management" />}
                        {isSuperAdmin && <TabButton name="control_center" label="User Control Center" />}
                        {isSuperAdmin && <TabButton name="drive" label="Google Drive Storage" />}
                        {isAdmin && <TabButton name="dcf" label="DCF Management" />}
                        {isAdmin && <TabButton name="lod" label="LOD Management" />}
                        {canAccessSystem && <TabButton name="system" label="System Management" />}
                        {isAdmin && <TabButton name="logs" label="User Logs" />}
                        {isAdmin && <TabButton name="archive" label="Archive Management" />}
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
                    
                    {activeTab === 'control_center' && isSuperAdmin && (
                        <UserControlCenterTab />
                    )}

                    {activeTab === 'drive' && isSuperAdmin && (
                        <GoogleDriveStorageTab />
                    )}

                    {activeTab === 'management' && isAdmin && (
                        <UserManagementTab />
                    )}

                    {activeTab === 'dcf' && isAdmin && (
                        <DCFManagementTab 
                            subprojects={subprojects} setSubprojects={setSubprojects}
                            activities={activities} setActivities={setActivities}
                            officeReqs={officeReqs} setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs} setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                        />
                    )}

                    {activeTab === 'lod' && isAdmin && (
                        <LODManagementTab />
                    )}

                    {activeTab === 'system' && canAccessSystem && (
                        <SystemManagementTab 
                            deadlines={deadlines}
                            setDeadlines={setDeadlines}
                        />
                    )}

                    {activeTab === 'logs' && isAdmin && (
                        <UserLogsTab 
                            subprojects={subprojects}
                            activities={activities}
                            ipos={ipos}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                            onSelectIpo={onSelectIpo}
                        />
                    )}

                    {activeTab === 'archive' && isAdmin && (
                        <ArchiveManagementTab />
                    )}
                </div>
             </section>
        </div>
    );
};

export default Settings;
