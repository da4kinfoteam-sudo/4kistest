import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AuthorizationPolicyState, RoleConfig, User } from '../constants';
import { supabase } from '../supabaseClient';
import {
    legacyActionMap,
    resolveAccessDecision,
    type AccessAction,
    type AccessDecision,
    type RolePermissionRule,
    type UserPermissionRule,
    type UserScopeRule,
} from '../lib/accessControl';

type LegacyAction = 'view' | 'edit' | 'delete' | 'manage';

interface AuthContextType {
    currentUser: User | null;
    session: Session | null;
    signIn: (identifier: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    usersList: User[];
    setUsersList: React.Dispatch<React.SetStateAction<User[]>>;
    rolesConfigs: RoleConfig[];
    roleRules: RolePermissionRule[];
    userRules: UserPermissionRule[];
    userScopes: UserScopeRule[];
    policyState: AuthorizationPolicyState | null;
    hasAccess: (module: string, action: AccessAction | LegacyAction, recordOperatingUnit?: string | null) => boolean;
    getAccessDecision: (module: string, action: AccessAction | LegacyAction, recordOperatingUnit?: string | null) => AccessDecision;
    getVisibilityScope: (module: string) => 'All' | 'Own OU';
    refreshUsersList: () => Promise<void>;
    refreshUser: () => Promise<void>;
    refreshPermissions: () => Promise<void>;
    isAuthReady: boolean;
    authorizationError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_COLUMNS = 'id,auth_id,username,fullName,email,role,operatingUnit,visibility_scope,assigned_focal_id,requires_approver,approver_id,is_active,deactivated_at,permission_version,password_reset_required,created_at,updated_at';
const POLICY_PAGE_SIZE = 1000;

const fetchAllRoleRules = async (): Promise<RolePermissionRule[]> => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const rows: RolePermissionRule[] = [];
    for (let from = 0; ; from += POLICY_PAGE_SIZE) {
        const { data, error } = await supabase
            .from('authorization_role_rules')
            .select('role,module,action,allowed,visibility_scope')
            .order('role', { ascending: true })
            .order('module', { ascending: true })
            .order('action', { ascending: true })
            .range(from, from + POLICY_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as RolePermissionRule[];
        rows.push(...page);
        if (page.length < POLICY_PAGE_SIZE) break;
    }
    return rows;
};

const normalizeAction = (action: AccessAction | LegacyAction): AccessAction => (
    action in legacyActionMap ? legacyActionMap[action as LegacyAction] : action as AccessAction
);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [usersList, setUsersList] = useState<User[]>([]);
    const [roleRules, setRoleRules] = useState<RolePermissionRule[]>([]);
    const [userRules, setUserRules] = useState<UserPermissionRule[]>([]);
    const [userScopes, setUserScopes] = useState<UserScopeRule[]>([]);
    const [policyState, setPolicyState] = useState<AuthorizationPolicyState | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authorizationError, setAuthorizationError] = useState<string | null>(null);
    const bootstrapId = useRef(0);

    const clearAuthorizationState = useCallback(() => {
        setCurrentUser(null);
        setUsersList([]);
        setRoleRules([]);
        setUserRules([]);
        setUserScopes([]);
        setPolicyState(null);
        setAuthorizationError(null);
    }, []);

    const fetchProfile = useCallback(async (authUserId: string): Promise<User> => {
        if (!supabase) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase.from('users').select(PROFILE_COLUMNS).eq('auth_id', authUserId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('No active application profile is linked to this account.');
        if (data.is_active === false) throw new Error('This account is inactive.');
        return data as User;
    }, []);

    const fetchPolicy = useCallback(async (profile: User) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        const [roleResult, overrideResult, scopeResult, stateResult] = await Promise.all([
            fetchAllRoleRules(),
            supabase.from('authorization_user_rules').select('user_id,module,action,effect').eq('user_id', profile.id),
            supabase.from('authorization_user_scopes').select('user_id,module,visibility_scope').eq('user_id', profile.id),
            supabase.from('authorization_policy').select('policy_version,legacy_user_auto_approve_enabled,legacy_user_auto_approve_role,legacy_user_auto_approve_modules,legacy_user_auto_approve_owner,legacy_user_auto_approve_cutoff').eq('singleton', true).single(),
        ]);
        const firstError = overrideResult.error || scopeResult.error || stateResult.error;
        if (firstError) throw firstError;
        setRoleRules(roleResult);
        setUserRules((overrideResult.data || []) as UserPermissionRule[]);
        setUserScopes((scopeResult.data || []) as UserScopeRule[]);
        setPolicyState(stateResult.data as AuthorizationPolicyState);
    }, []);

    const refreshUsersListFor = useCallback(async (profile: User, rules: RolePermissionRule[] = roleRules, overrides: UserPermissionRule[] = userRules, scopes: UserScopeRule[] = userScopes) => {
        if (!supabase) return;
        const canManageUsers = resolveAccessDecision({
            user: profile,
            module: 'Settings - User Management',
            action: 'manage_users',
            roleRules: rules,
            userRules: overrides,
            userScopes: scopes,
            policyVersion: policyState?.policy_version || 0,
        }).allowed;
        if (!canManageUsers) {
            setUsersList([]);
            return;
        }
        const { data, error } = await supabase.from('users').select(PROFILE_COLUMNS).order('id', { ascending: true });
        if (error) throw error;
        setUsersList((data || []) as User[]);
    }, [policyState?.policy_version, roleRules, userRules, userScopes]);

    const bootstrapSession = useCallback(async (nextSession: Session | null) => {
        const requestId = ++bootstrapId.current;
        setIsAuthReady(false);
        setAuthorizationError(null);
        setSession(nextSession);
        if (!nextSession?.user) {
            clearAuthorizationState();
            setIsAuthReady(true);
            return;
        }
        try {
            const profile = await fetchProfile(nextSession.user.id);
            if (requestId !== bootstrapId.current) return;
            setCurrentUser(profile);
            await fetchPolicy(profile);
            if (requestId !== bootstrapId.current) return;
        } catch (error: any) {
            if (requestId !== bootstrapId.current) return;
            clearAuthorizationState();
            setSession(null);
            setAuthorizationError(error?.message || 'Unable to load authorization policy.');
            if (supabase) await supabase.auth.signOut();
        } finally {
            if (requestId === bootstrapId.current) setIsAuthReady(true);
        }
    }, [clearAuthorizationState, fetchPolicy, fetchProfile]);

    useEffect(() => {
        if (!supabase) {
            setAuthorizationError('Supabase is not configured.');
            setIsAuthReady(true);
            return;
        }
        supabase.auth.getSession().then(({ data, error }) => {
            if (error) {
                setAuthorizationError(error.message);
                setIsAuthReady(true);
                return;
            }
            void bootstrapSession(data.session);
        });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            void bootstrapSession(nextSession);
        });
        return () => listener.subscription.unsubscribe();
    }, [bootstrapSession]);

    useEffect(() => {
        if (!currentUser || !policyState) return;
        void refreshUsersListFor(currentUser).catch(error => console.error('Unable to load authorized user directory:', error));
    }, [currentUser, policyState, refreshUsersListFor]);

    useEffect(() => {
        if (!supabase || !currentUser) return;
        const channel = supabase.channel(`authorization-${currentUser.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'authorization_policy' }, () => void fetchPolicy(currentUser))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'authorization_user_rules', filter: `user_id=eq.${currentUser.id}` }, () => void fetchPolicy(currentUser))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'authorization_user_scopes', filter: `user_id=eq.${currentUser.id}` }, () => void fetchPolicy(currentUser))
            .subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [currentUser, fetchPolicy]);

    const signIn = useCallback(async (identifier: string, password: string) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        let email = identifier.trim();
        if (!email.includes('@')) {
            const { data, error } = await supabase.rpc('resolve_login_identifier', { p_identifier: email });
            if (error) throw new Error('Unable to resolve this username.');
            if (!data) throw new Error('Invalid credentials.');
            email = data;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Invalid credentials.');
    }, []);

    const logout = useCallback(async () => {
        clearAuthorizationState();
        setSession(null);
        if (supabase) await supabase.auth.signOut();
    }, [clearAuthorizationState]);

    const getAccessDecision = useCallback((module: string, action: AccessAction | LegacyAction, recordOperatingUnit?: string | null) => resolveAccessDecision({
        user: currentUser,
        module,
        action: normalizeAction(action),
        roleRules,
        userRules,
        userScopes,
        policyVersion: policyState?.policy_version || 0,
        recordOperatingUnit,
    }), [currentUser, policyState?.policy_version, roleRules, userRules, userScopes]);

    const hasAccess = useCallback((module: string, action: AccessAction | LegacyAction, recordOperatingUnit?: string | null) => (
        getAccessDecision(module, action, recordOperatingUnit).allowed
    ), [getAccessDecision]);

    const getVisibilityScope = useCallback((module: string): 'All' | 'Own OU' => (
        getAccessDecision(module, 'view').scope
    ), [getAccessDecision]);

    const refreshPermissions = useCallback(async () => {
        if (!currentUser) return;
        await fetchPolicy(currentUser);
    }, [currentUser, fetchPolicy]);

    const refreshUser = useCallback(async () => {
        if (!session?.user) return;
        const profile = await fetchProfile(session.user.id);
        setCurrentUser(profile);
        await fetchPolicy(profile);
    }, [fetchPolicy, fetchProfile, session?.user]);

    const refreshUsersList = useCallback(async () => {
        if (!currentUser) return;
        await refreshUsersListFor(currentUser);
    }, [currentUser, refreshUsersListFor]);

    const rolesConfigs = useMemo<RoleConfig[]>(() => {
        const grouped = new Map<string, RoleConfig>();
        for (const rule of roleRules) {
            const key = `${rule.role}::${rule.module}`;
            const existing = grouped.get(key) || {
                role: rule.role,
                module: rule.module,
                can_view: false,
                can_edit: false,
                can_delete: false,
                can_manage: false,
                visibility_scope: rule.visibility_scope || 'Own OU',
            };
            if (rule.action === 'view') existing.can_view = rule.allowed;
            if (rule.action === 'edit') existing.can_edit = rule.allowed;
            if (rule.action === 'delete') existing.can_delete = rule.allowed;
            if (rule.action === 'manage_settings') existing.can_manage = rule.allowed;
            grouped.set(key, existing);
        }
        return [...grouped.values()];
    }, [roleRules]);

    return (
        <AuthContext.Provider value={{
            currentUser,
            session,
            signIn,
            logout,
            usersList,
            setUsersList,
            rolesConfigs,
            roleRules,
            userRules,
            userScopes,
            policyState,
            hasAccess,
            getAccessDecision,
            getVisibilityScope,
            refreshUsersList,
            refreshUser,
            refreshPermissions,
            isAuthReady,
            authorizationError,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
