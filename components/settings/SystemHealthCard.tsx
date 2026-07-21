
// Author: 4K
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Activity, RefreshCw } from 'lucide-react';
import { ContentCard } from '../ui/enterprise';

const SystemHealthCard: React.FC = () => {
    const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
    const [latency, setLatency] = useState<number | null>(null);
    const [errorDetails, setErrorDetails] = useState<string>('');

    const testConnection = async () => {
        setConnectionStatus('checking');
        const start = performance.now();
        try {
            if (!supabase) throw new Error("Supabase client not initialized.");
            
            const { error } = await supabase.from('users').select('id').limit(1);
            
            if (error) throw error;
            
            const end = performance.now();
            setLatency(Math.round(end - start));
            setConnectionStatus('connected');
            setErrorDetails('');
        } catch (err: any) {
            console.error("Connection Test Failed:", err);
            setConnectionStatus('error');
            setErrorDetails(err.message || 'Unknown network error');
            setLatency(null);
        }
    };

    useEffect(() => {
        testConnection();
    }, []);

    return (
        <ContentCard className="system-health">
            <div className="system-health__header">
                <h3 className="system-health__title">
                    <Activity aria-hidden="true" />
                    System health
                </h3>
                <button 
                    type="button"
                    onClick={testConnection} 
                    disabled={connectionStatus === 'checking'}
                    className="btn btn-secondary btn-sm"
                >
                    <RefreshCw aria-hidden="true" className={connectionStatus === 'checking' ? 'ui-state__spinner' : ''} />
                    {connectionStatus === 'checking' ? 'Checking...' : 'Test Connection'}
                </button>
            </div>
            
            <div className={`system-health__status system-health__status--${connectionStatus}`}>
                <span className="system-health__dot" aria-hidden="true" />
                <div>
                        <p className="system-health__status-label">
                            {connectionStatus === 'connected' ? 'Connected to Database' :
                                connectionStatus === 'error' ? 'Connection Failed' :
                                'Checking Status...'}
                        </p>
                        {latency && (
                            <p className="system-health__detail">
                                Latency: {latency}ms
                            </p>
                        )}
                        {errorDetails && (
                            <p className="system-health__detail system-health__detail--error">
                                Error: {errorDetails}
                            </p>
                        )}
                </div>
            </div>
        </ContentCard>
    );
};

export default SystemHealthCard;
