import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { DCF_POLICY_SETTINGS_KEY, DEFAULT_DCF_POLICY_SETTINGS, DcfPolicySettings, normalizeDcfPolicySettings } from '../lib/dcfPolicy';
import { useAuth } from './AuthContext';

interface DcfPolicyContextType {
    policy: DcfPolicySettings;
    serverDate: string;
    loading: boolean;
    error: string | null;
    refreshPolicy: () => Promise<void>;
}

const DcfPolicyContext = createContext<DcfPolicyContextType | undefined>(undefined);

const getLocalFallbackDate = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
};

export const DcfPolicyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser, isAuthReady } = useAuth();
    const [policy, setPolicy] = useState<DcfPolicySettings>(DEFAULT_DCF_POLICY_SETTINGS);
    const [serverDate, setServerDate] = useState(getLocalFallbackDate());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refreshPolicy = async () => {
        if (!supabase) {
            setPolicy(DEFAULT_DCF_POLICY_SETTINGS);
            setServerDate(getLocalFallbackDate());
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const [settingsResult, dateResult] = await Promise.all([
                supabase
                    .from('dcf_policy_settings')
                    .select('settings')
                    .eq('settings_key', DCF_POLICY_SETTINGS_KEY)
                    .maybeSingle(),
                supabase.rpc('get_app_current_date'),
            ]);

            if (settingsResult.error) {
                console.error('Unable to load DCF policy settings:', settingsResult.error);
                setError('DCF policy settings could not be loaded. Check that the DCF policy migration has been applied.');
            } else if (!settingsResult.data?.settings || typeof settingsResult.data.settings !== 'object' || Array.isArray(settingsResult.data.settings)) {
                setError('DCF policy settings are unavailable. DCF writes are blocked until an authorized administrator restores the policy.');
                setPolicy(DEFAULT_DCF_POLICY_SETTINGS);
            } else {
                setPolicy(normalizeDcfPolicySettings(settingsResult.data?.settings));
            }

            if (dateResult.error) {
                console.error('Unable to load app current date:', dateResult.error);
                setError('The server application date is unavailable. DCF period writes are blocked until it can be verified.');
                setServerDate(getLocalFallbackDate());
            } else if (dateResult.data) {
                setServerDate(String(dateResult.data));
            }
        } catch (err: any) {
            console.error('DCF policy load exception:', err);
            setError(err.message || 'Unable to load DCF policy settings.');
            setPolicy(DEFAULT_DCF_POLICY_SETTINGS);
            setServerDate(getLocalFallbackDate());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthReady && currentUser) {
            refreshPolicy();
        } else if (isAuthReady) {
            setPolicy(DEFAULT_DCF_POLICY_SETTINGS);
            setServerDate(getLocalFallbackDate());
            setLoading(false);
            setError(null);
        }
    }, [currentUser, isAuthReady]);

    return (
        <DcfPolicyContext.Provider value={{ policy, serverDate, loading, error, refreshPolicy }}>
            {children}
        </DcfPolicyContext.Provider>
    );
};

export const useDcfPolicy = () => {
    const context = useContext(DcfPolicyContext);
    if (!context) {
        throw new Error('useDcfPolicy must be used within a DcfPolicyProvider');
    }
    return context;
};
