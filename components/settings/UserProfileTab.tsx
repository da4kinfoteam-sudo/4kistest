// Author: 4K
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../constants';
import { supabase } from '../../supabaseClient';
import { User as UserIcon, ShieldCheck, Mail, Key, Save, Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference } from '../../lib/theme';

interface UserProfileTabProps {
    isDarkMode: boolean;
    themePreference: ThemePreference;
    onThemePreferenceChange: (preference: ThemePreference) => void;
}

const commonInputClasses = "form-control";

const UserProfileTab: React.FC<UserProfileTabProps> = ({ isDarkMode, themePreference, onThemePreferenceChange }) => {
    const { currentUser, refreshUser } = useAuth();
    const [profileData, setProfileData] = useState<User | null>(null);
    const [saving, setSaving] = useState(false);
    const [resetSending, setResetSending] = useState(false);

    useEffect(() => {
        if (currentUser) {
            setProfileData({ ...currentUser });
        }
    }, [currentUser]);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (!profileData) return;
        const { name, value } = e.target;
        setProfileData(prev => prev ? ({ ...prev, [name]: value }) : null);
    };

    const handleSaveProfile = async () => {
        if (!profileData) return;
        setSaving(true);

        if (supabase) {
            try {
                const { error } = await supabase
                    .from('users')
                    .update({
                        username: profileData.username,
                        fullName: profileData.fullName
                    })
                    .eq('id', profileData.id);

                if (error) {
                    console.error("Error updating profile in database:", error);
                    alert("Failed to update profile: " + error.message);
                    setSaving(false);
                    return;
                }
            } catch (error: any) {
                console.error("Error updating profile:", error);
                alert("An unexpected error occurred: " + error.message);
                setSaving(false);
                return;
            }
        }

        await refreshUser();
        setSaving(false);
        alert("Success: Your profile has been updated.");
    };

    const handleSendPasswordReset = async () => {
        if (!supabase || !currentUser?.email) return;
        setResetSending(true);
        const { error } = await supabase.auth.resetPasswordForEmail(currentUser.email, {
            redirectTo: `${window.location.origin}/#/settings?tab=profile`,
        });
        setResetSending(false);
        if (error) alert(`Unable to send the secure reset email: ${error.message}`);
        else alert('A secure password reset link was sent to your account email.');
    };

    if (!profileData) return null;

    return (
        <div className="profile-settings">
            <div className="profile-settings__layout">
                {/* Left Column: Personal Info */}
                <div className="profile-settings__main">
                    <section className="content-card profile-settings__card">
                        <div className="profile-settings__heading">
                            <div className="profile-settings__icon">
                                <UserIcon className="h-5 w-5" />
                            </div>
                            <h3>Personal identity</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="form-label">Full name</label>
                                <input type="text" name="fullName" value={profileData.fullName} onChange={handleProfileChange} className={commonInputClasses} placeholder="Your display name" />
                            </div>
                            <div>
                                <label className="form-label">Username</label>
                                <div className="profile-settings__input-wrap">
                                    <span className="profile-settings__input-adornment">@</span>
                                    <input type="text" name="username" value={profileData.username || ''} onChange={handleProfileChange} className={`${commonInputClasses} pl-8`} />
                                </div>
                            </div>
                            <div>
                                <label className="form-label">Email address</label>
                                <div className="profile-settings__input-wrap">
                                    <Mail className="profile-settings__input-adornment profile-settings__input-adornment--icon" />
                                    <input type="email" name="email" value={profileData.email} readOnly className={`${commonInputClasses} pl-10`} aria-describedby="profile-email-help" />
                                </div>
                                <p id="profile-email-help" className="form-help">Email changes require an authorized account administrator so the Supabase Auth identity remains synchronized.</p>
                            </div>
                        </div>
                    </section>

                    <section className="content-card profile-settings__card">
                        <div className="profile-settings__heading">
                            <div className="profile-settings__icon">
                                <Key className="h-5 w-5" />
                            </div>
                            <h3>Account security</h3>
                        </div>
                        
                        <p className="settings-copy">Passwords are managed by Supabase Auth and are never stored in the application profile.</p>
                        <button type="button" className="btn btn-secondary" onClick={handleSendPasswordReset} disabled={resetSending}>
                            <Key className="h-4 w-4" /> {resetSending ? 'Sending...' : 'Send secure password reset'}
                        </button>
                    </section>
                </div>

                {/* Right Column: Roles & Appearance */}
                <aside className="profile-settings__aside">
                    <section className="content-card profile-settings__card profile-settings__access">
                        <div className="profile-settings__heading">
                            <ShieldCheck className="profile-settings__access-icon" />
                            <h3>Access level</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="profile-fact">
                                <p className="profile-settings__eyebrow">System role</p>
                                <p className="profile-fact__value profile-fact__value--role">{profileData.role}</p>
                            </div>
                            <div className="profile-fact">
                                <p className="profile-settings__eyebrow">Operating unit</p>
                                <p className="profile-fact__value">{profileData.operatingUnit}</p>
                            </div>
                        </div>
                    </section>

                    <section className="content-card profile-settings__card">
                        <h3 className="profile-settings__section-title">Interface preferences</h3>
                        <div className="theme-preference-card">
                            <div className="theme-preference-card__status">
                                {themePreference === 'system'
                                    ? <Monitor aria-hidden="true" />
                                    : isDarkMode
                                        ? <Moon aria-hidden="true" />
                                        : <Sun aria-hidden="true" />}
                                <span>{themePreference === 'system' ? `System · ${isDarkMode ? 'Dark' : 'Light'}` : `${themePreference === 'dark' ? 'Dark' : 'Light'} theme`}</span>
                            </div>
                            <div className="theme-preference-card__options" role="group" aria-label="Theme preference">
                                {([
                                    { value: 'light' as const, label: 'Light', icon: Sun },
                                    { value: 'dark' as const, label: 'Dark', icon: Moon },
                                    { value: 'system' as const, label: 'System', icon: Monitor },
                                ]).map(option => {
                                    const Icon = option.icon;
                                    const active = themePreference === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => onThemePreferenceChange(option.value)}
                                            className={active ? 'is-active' : ''}
                                            aria-pressed={active}
                                        >
                                            <Icon aria-hidden="true" />
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                    
                    <button 
                        onClick={handleSaveProfile} 
                        disabled={saving}
                        className="btn btn-primary btn-lg profile-settings__save"
                    >
                        <Save className="h-4 w-4" />
                        {saving ? 'Updating...' : 'Save All Changes'}
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default UserProfileTab;
