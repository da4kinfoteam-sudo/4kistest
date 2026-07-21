// Author: 4K
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../constants';
import { supabase } from '../../supabaseClient';
import { User as UserIcon, ShieldCheck, Mail, Key, Eye, EyeOff, Save, Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference } from '../../lib/theme';

interface UserProfileTabProps {
    isDarkMode: boolean;
    themePreference: ThemePreference;
    onThemePreferenceChange: (preference: ThemePreference) => void;
}

const commonInputClasses = "form-control";

const UserProfileTab: React.FC<UserProfileTabProps> = ({ isDarkMode, themePreference, onThemePreferenceChange }) => {
    const { currentUser, setUsersList, login } = useAuth();
    const [profileData, setProfileData] = useState<User | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);

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
                        fullName: profileData.fullName,
                        email: profileData.email,
                        password: profileData.password
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

        setUsersList(prev => prev.map(u => u.id === profileData.id ? profileData : u));
        login(profileData);
        setSaving(false);
        alert("Success: Your profile and account credentials have been updated.");
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
                                    <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} className={`${commonInputClasses} pl-10`} />
                                </div>
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
                        
                        <p className="settings-copy">Change your system password. Changes take effect immediately upon saving.</p>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="form-label">Update password</label>
                                <div className="relative">
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        name="password" 
                                        value={profileData.password || ''} 
                                        onChange={handleProfileChange} 
                                        className={commonInputClasses} 
                                        placeholder="Enter new password"
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="profile-settings__password-toggle"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
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
