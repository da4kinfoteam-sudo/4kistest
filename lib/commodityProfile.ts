import { Commodity } from '../constants';

type CommodityCapacityInput = {
    potentialExpansionArea?: number | string | null;
    numberOfFarmers?: number | string | null;
    numberOfTrees?: number | string | null;
};

const parseOptionalNumber = (
    rawValue: number | string | null | undefined,
    label: string,
    integerOnly = false
) => {
    if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return undefined;

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a non-negative number.`);
    }
    if (integerOnly && !Number.isInteger(value)) {
        throw new Error(`${label} must be a whole number.`);
    }
    return value;
};

export const getCommodityCapacityValues = (
    type: string,
    input: CommodityCapacityInput
): Pick<Commodity, 'potentialExpansionArea' | 'numberOfFarmers' | 'numberOfTrees'> => {
    const isCrop = type === 'Crop';
    return {
        potentialExpansionArea: isCrop
            ? parseOptionalNumber(input.potentialExpansionArea, 'Potential Expansion Area')
            : undefined,
        numberOfFarmers: parseOptionalNumber(input.numberOfFarmers, 'Number of Farmers', true),
        numberOfTrees: isCrop
            ? parseOptionalNumber(input.numberOfTrees, 'Number of Trees', true)
            : undefined,
    };
};

export const commodityCapacityToFormValue = (value: number | null | undefined) => (
    value === null || value === undefined ? '' : String(value)
);

export const normalizeImportedCommodity = (commodity: unknown): Commodity => {
    if (!commodity || typeof commodity !== 'object' || Array.isArray(commodity)) {
        throw new Error('Each commodity must be a JSON object.');
    }

    const raw = commodity as Record<string, unknown>;
    const type = String(raw.type || '').trim();
    const particular = String(raw.particular || '').trim();
    const value = Number(raw.value);

    if (!type || !particular || !Number.isFinite(value) || value < 0) {
        throw new Error('Each commodity requires a type, particular, and non-negative value.');
    }

    const capacity = getCommodityCapacityValues(type, {
        potentialExpansionArea: raw.potentialExpansionArea as number | string | null | undefined,
        numberOfFarmers: raw.numberOfFarmers as number | string | null | undefined,
        numberOfTrees: raw.numberOfTrees as number | string | null | undefined,
    });
    const normalized = {
        ...raw,
        type,
        particular,
        value,
        ...capacity,
    } as Commodity;

    if (capacity.potentialExpansionArea === undefined) delete normalized.potentialExpansionArea;
    if (capacity.numberOfFarmers === undefined) delete normalized.numberOfFarmers;
    if (capacity.numberOfTrees === undefined) delete normalized.numberOfTrees;

    return normalized;
};
