export type GadPimmeVisibilityScope = 'All' | 'All OUs' | 'Own OU';

interface GadPimmeAccessInput {
    canView: boolean;
    canEdit: boolean;
    visibilityScope: GadPimmeVisibilityScope;
    userOperatingUnit?: string | null;
    targetOperatingUnit: string;
}

const hasOuVisibility = (
    visibilityScope: GadPimmeVisibilityScope,
    userOperatingUnit: string | null | undefined,
    targetOperatingUnit: string,
) => visibilityScope === 'All'
    || visibilityScope === 'All OUs'
    || Boolean(userOperatingUnit && userOperatingUnit === targetOperatingUnit);

export const getVisibleGadPimmeOperatingUnits = (
    operatingUnits: readonly string[],
    visibilityScope: GadPimmeVisibilityScope,
    userOperatingUnit?: string | null,
) => visibilityScope === 'All' || visibilityScope === 'All OUs'
    ? [...operatingUnits]
    : operatingUnits.filter(operatingUnit => operatingUnit === userOperatingUnit);

export const getGadPimmeAccess = ({
    canView,
    canEdit,
    visibilityScope,
    userOperatingUnit,
    targetOperatingUnit,
}: GadPimmeAccessInput) => {
    const inScope = hasOuVisibility(visibilityScope, userOperatingUnit, targetOperatingUnit);
    return {
        canView: canView && inScope,
        canEdit: canView && canEdit && inScope,
    };
};

export const buildGadPimmeDetailPath = (operatingUnit: string, year: number) =>
    `/gender-and-development/detail?ou=${encodeURIComponent(operatingUnit)}&year=${encodeURIComponent(String(year))}`;
