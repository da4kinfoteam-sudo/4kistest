import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, HardDrive, Loader2, PlugZap, RefreshCw, Unplug, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { disconnectGoogleDrive, getGoogleDriveStatus, GoogleDriveStatus, startGoogleDriveConnection } from '../../lib/googleDriveStorage';

const formatConnectionDate = (value?: string | null) => {
    if (!value) return 'Not connected';
    return new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const GoogleDriveStorageTab: React.FC = () => {
    const { currentUser } = useAuth();
    const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const isDriveExpired = status?.tokenStatus === 'expired';
    const statusLabel = isDriveExpired ? 'Reconnect required' : status?.isConnected ? 'Connected' : 'Not connected';
    const statusClass = status?.isConnected ? 'status-badge--completed' : isDriveExpired ? 'status-badge--cancelled' : 'status-badge--neutral';

    const callbackMessage = useMemo(() => {
        const hash = window.location.hash || '';
        if (!hash.includes('drive=')) return null;
        const paramsText = hash.split('?')[1] || '';
        const params = new URLSearchParams(paramsText);
        const driveStatus = params.get('drive');
        const callbackText = params.get('message');
        if (driveStatus === 'connected') return 'Google Drive storage connected.';
        if (driveStatus === 'error') return callbackText ? `Google Drive connection failed: ${callbackText}` : 'Google Drive connection failed.';
        return null;
    }, []);

    const loadStatus = async () => {
        setIsLoading(true);
        setMessage(callbackMessage);
        try {
            setStatus(await getGoogleDriveStatus(currentUser));
        } catch (error: any) {
            setMessage(error.message || 'Unable to load Google Drive status.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, [currentUser?.id]);

    const handleConnect = async () => {
        setIsWorking(true);
        setMessage(null);
        try {
            const authUrl = await startGoogleDriveConnection(currentUser);
            window.location.href = authUrl;
        } catch (error: any) {
            setMessage(error.message || 'Unable to start Google Drive connection.');
            setIsWorking(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Disconnect Google Drive storage? Existing file metadata stays in 4KIS, but new uploads will be disabled until storage is reconnected.')) {
            return;
        }

        setIsWorking(true);
        setMessage(null);
        try {
            const result = await disconnectGoogleDrive(currentUser);
            setMessage(result.message);
            setStatus(await getGoogleDriveStatus(currentUser));
        } catch (error: any) {
            setMessage(error.message || 'Unable to disconnect Google Drive.');
        } finally {
            setIsWorking(false);
        }
    };

    if (isLoading) {
        return (
            <div className="drive-panel">
                <Loader2 className="drive-panel__spinner" aria-hidden="true" />
                <p>Loading Google Drive storage status...</p>
            </div>
        );
    }

    return (
        <div className="drive-panel">
            <div className="drive-panel__header">
                <div>
                    <h3 className="drive-panel__title">
                        <HardDrive aria-hidden="true" />
                        Google Drive Storage
                    </h3>
                    <p className="drive-panel__copy">Connect one Super Admin-owned Google Drive folder for IPO file uploads.</p>
                </div>
                <span className={`status-badge ${statusClass}`}>
                    {status?.isConnected ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
                    {statusLabel}
                </span>
            </div>

            {message && <p className="drive-panel__message" role="status">{message}</p>}
            {isDriveExpired && (
                <div className="drive-panel__warning drive-panel__warning--danger" role="alert">
                    <p className="notice__title">Google Drive connection expired.</p>
                    <p>{status?.connectionMessage || 'Ask an Admin to reconnect Google Drive storage.'}</p>
                </div>
            )}

            {!status?.isConfigured && (
                <div className="drive-panel__warning">
                    <p className="notice__title">Configuration needed before connecting Google Drive.</p>
                    <p>Add these Edge Function environment variables: {status?.missingEnv.join(', ') || 'Google Drive configuration'}.</p>
                </div>
            )}

            <dl className="drive-panel__grid">
                <div>
                    <dt>Master folder</dt>
                    <dd>{status?.rootFolderName || '4KIS Master File Storage'}</dd>
                </div>
                <div>
                    <dt>Connected account</dt>
                    <dd>{status?.accountEmail || 'Not connected'}</dd>
                </div>
                <div>
                    <dt>Folder ID</dt>
                    <dd className="break-all">{status?.rootFolderId || 'Created during connection'}</dd>
                </div>
                <div>
                    <dt>Connected date</dt>
                    <dd>{formatConnectionDate(status?.connectedAt)}</dd>
                </div>
                <div>
                    <dt>Token status</dt>
                    <dd>{isDriveExpired ? 'Expired - reconnect required' : status?.isConnected ? 'Valid' : 'Not connected'}</dd>
                </div>
            </dl>

            <div className="drive-panel__actions">
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConnect}
                    disabled={!status?.isConfigured || isWorking}
                >
                    {isWorking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
                    {status?.isConnected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                    <ExternalLink aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={loadStatus}
                    disabled={isWorking}
                >
                    <RefreshCw aria-hidden="true" />
                    Refresh
                </button>
                <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDisconnect}
                    disabled={!status?.isConnected || isWorking}
                >
                    <Unplug aria-hidden="true" />
                    Disconnect
                </button>
            </div>
        </div>
    );
};

export default GoogleDriveStorageTab;
