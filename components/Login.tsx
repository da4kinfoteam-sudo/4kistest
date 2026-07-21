// Author: 4K
import React, { useEffect, useState } from 'react';
import { Database, LoaderCircle, LogIn } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

const Login: React.FC = () => {
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('offline');
    const [connError, setConnError] = useState<string | null>(null);

    const checkConnection = async () => {
        if (!supabase) {
            setDbStatus('offline');
            setConnError('Database client not initialized.');
            return;
        }

        try {
            const { error: dbError } = await supabase.from('users').select('id', { head: true, count: 'exact' }).limit(1);
            if (!dbError) {
                setDbStatus('online');
                setConnError(null);
            } else {
                setDbStatus('offline');
                setConnError(dbError.message);
            }
        } catch (connectionError: any) {
            setDbStatus('offline');
            setConnError(connectionError.message);
        }
    };

    useEffect(() => {
        checkConnection();
    }, []);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            let user = null;

            if (supabase) {
                const { data, error: dbError } = await supabase
                    .from('users')
                    .select('*')
                    .or(`username.eq."${identifier}",email.eq."${identifier}"`)
                    .eq('password', password)
                    .maybeSingle();

                if (dbError) {
                    console.error('Direct Auth Error:', dbError);
                } else if (data) {
                    user = data;
                }
            }

            // Preserve the existing local fallback for test environments.
            if (!user && identifier === 'admin' && password === 'admin') {
                user = {
                    id: 99999,
                    username: 'admin',
                    fullName: 'System Administrator',
                    email: 'admin@system.local',
                    role: 'Super Admin' as any,
                    operatingUnit: 'NPMO',
                    password: 'admin',
                };
            }

            if (user) {
                login(user);
            } else {
                setError('Invalid credentials. Access denied.');
            }
        } catch (loginError) {
            console.error('Login exception:', loginError);
            setError('System error during validation.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="login-page">
            <section className="login-brand" aria-label="4K Information System">
                <div className="login-brand__identity">
                    <img src="/assets/4klogo.png" alt="DA 4K Logo" />
                    <span>Department of Agriculture</span>
                </div>
                <div className="login-brand__message">
                    <p className="login-brand__eyebrow">Kabuhayan at Kaunlaran ng Kababayang Katutubo</p>
                    <h1>One workspace for 4K program delivery.</h1>
                    <p>Monitor investments, field activities, partner organizations, and accomplishments from a consistent national view.</p>
                </div>
                <p className="login-brand__footer">4K Program Management Office</p>
            </section>

            <section className="login-panel animate-fadeIn">
                <div className="login-card">
                    <div className="login-card__header">
                        <div>
                            <p className="login-card__eyebrow">Secure access</p>
                            <h2>Sign in to 4KIS</h2>
                            <p>Use your assigned username or email address.</p>
                        </div>
                        <div className={`login-connection login-connection--${dbStatus}`} role="status">
                            <Database aria-hidden="true" />
                            <span>{dbStatus === 'online' ? 'Connected' : 'Offline'}</span>
                        </div>
                    </div>

                    {connError && <p className="login-connection-error">{connError}</p>}
                    {error && <div className="login-alert" role="alert">{error}</div>}

                    <form onSubmit={handleSubmit} className="login-form">
                        <label className="login-field">
                            <span>Username or email</span>
                            <input
                                type="text"
                                required
                                value={identifier}
                                onChange={event => setIdentifier(event.target.value)}
                                placeholder="Username or Email"
                                autoComplete="username"
                            />
                        </label>
                        <label className="login-field">
                            <span>Password</span>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={event => setPassword(event.target.value)}
                                placeholder="Password"
                                autoComplete="current-password"
                            />
                        </label>
                        <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg login-submit">
                            {isLoading ? <LoaderCircle className="login-submit__spinner" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                            {isLoading ? 'Verifying…' : 'Sign in'}
                        </button>
                    </form>
                    <p className="login-card__footnote">Protected information system · Authorized personnel only</p>
                </div>
            </section>
        </main>
    );
};

export default Login;
