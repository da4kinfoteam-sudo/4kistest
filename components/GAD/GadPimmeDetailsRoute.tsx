import React from 'react';
import { operatingUnits } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { getGadPimmeAccess } from '../../lib/gadPimmeAccess';
import { ErrorState } from '../ui/enterprise';
import GadPimmeDetails from './GadPimmeDetails';

interface Props {
    operatingUnit: string | null;
    year: number | null;
    onBack: () => void;
    onSelectYear: (year: number) => void;
}

const GadPimmeDetailsRoute: React.FC<Props> = ({ operatingUnit, year, onBack, onSelectYear }) => {
    const { currentUser, getVisibilityScope, hasAccess } = useAuth();
    const visibilityScope = getVisibilityScope('Gender and Development');
    const currentYear = new Date().getFullYear();
    const validOu = Boolean(operatingUnit && operatingUnits.includes(operatingUnit as any));
    const access = getGadPimmeAccess({
        canView: hasAccess('Gender and Development', 'view'),
        canEdit: hasAccess('Gender and Development', 'edit'),
        visibilityScope,
        userOperatingUnit: currentUser?.operatingUnit,
        targetOperatingUnit: operatingUnit || '',
    });
    const validYear = Boolean(year && year >= 2019 && year <= currentYear);

    if (!validOu || !validYear || !access.canView) {
        return <ErrorState title="GAD PIMME record unavailable" message="The selected Operating Unit or year was not found or is outside your configured visibility scope."
            action={<button type="button" className="btn btn-secondary" onClick={onBack}>Back to Gender and Development</button>} />;
    }
    return <GadPimmeDetails operatingUnit={operatingUnit!} initialYear={year!} canEdit={access.canEdit} onBack={onBack} onSelectYear={onSelectYear} />;
};

export default GadPimmeDetailsRoute;
