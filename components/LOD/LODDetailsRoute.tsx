import React, { useEffect, useState } from 'react';
import { IPO, ouToRegionMap } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { ErrorState, LoadingState } from '../ui/enterprise';
import LODDetails from './LODDetails';

interface LODDetailsRouteProps {
    ipoId: number | null;
    selectedIpo?: IPO | null;
    initialYear?: number | null;
    onBack: () => void;
}

const LODDetailsRoute: React.FC<LODDetailsRouteProps> = ({ ipoId, selectedIpo, initialYear, onBack }) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const visibilityScope = getVisibilityScope('Level of Development');
    const ownRegion = currentUser?.operatingUnit ? ouToRegionMap[currentUser.operatingUnit] : '';
    const selectedIpoIsVisible = selectedIpo?.id === ipoId && (
        visibilityScope === 'All' || Boolean(ownRegion && selectedIpo.region === ownRegion)
    );
    const [ipo, setIpo] = useState<IPO | null>(selectedIpoIsVisible ? selectedIpo : null);
    const [loading, setLoading] = useState(Boolean(ipoId && !selectedIpoIsVisible));
    const [error, setError] = useState('');

    useEffect(() => {
        if (!ipoId || !supabase || !currentUser) {
            setLoading(false);
            return;
        }
        if (selectedIpoIsVisible) {
            setIpo(selectedIpo);
            setLoading(false);
            setError('');
            return;
        }

        let cancelled = false;
        const loadIpo = async () => {
            setLoading(true);
            setError('');
            let query = supabase.from('ipos').select('id,name,location,region').eq('id', ipoId);
            if (visibilityScope === 'Own OU') {
                if (!ownRegion) {
                    setError('Your operating unit is not mapped to an IPO region.');
                    setLoading(false);
                    return;
                }
                query = query.eq('region', ownRegion);
            }
            const result = await query.maybeSingle();
            if (cancelled) return;
            if (result.error) setError(result.error.message || 'Unable to load the selected IPO.');
            else if (!result.data) setError('LOD record not found or not accessible under your configured visibility scope.');
            else setIpo(result.data as IPO);
            setLoading(false);
        };
        loadIpo();
        return () => { cancelled = true; };
    }, [ipoId, selectedIpo, selectedIpoIsVisible, currentUser?.id, visibilityScope, ownRegion]);

    if (!ipoId) return <ErrorState title="Select an IPO" message="Open an IPO assessment from the Level of Development list." />;
    if (loading) return <LoadingState title="Loading LOD assessment" message="Resolving the selected IPO and assessment year." />;
    if (error || !ipo) return <ErrorState title="LOD record unavailable" message={error || 'The selected IPO could not be loaded.'} action={<button type="button" className="btn btn-secondary" onClick={onBack}>Back to Level of Development</button>} />;
    return <LODDetails ipo={ipo} onBack={onBack} initialYear={initialYear} />;
};

export default LODDetailsRoute;
