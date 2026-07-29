import { IPO } from '../constants';
import { parseLocation } from '../components/LocationPicker';
import { FinancialLineItem } from './financialAggregation';

export type FinancialGeographicLevel = 'province' | 'municipality' | 'ancestralDomain' | 'ipo';

export interface FinancialHierarchyNode {
    key: string;
    level: FinancialGeographicLevel;
    label: string;
    operatingUnit: string;
    allocation: number;
    obligation: number;
    disbursement: number;
    children: FinancialHierarchyNode[];
}

export interface VisibleFinancialHierarchyRow {
    node: FinancialHierarchyNode;
    depth: number;
}

type MutableHierarchyNode = FinancialHierarchyNode & {
    childMap: Map<string, MutableHierarchyNode>;
};

type FinancialGeography = Record<FinancialGeographicLevel, string> & {
    operatingUnit: string;
};

const LEVELS: FinancialGeographicLevel[] = ['province', 'municipality', 'ancestralDomain', 'ipo'];

const normalizeText = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const normalizedKey = (level: FinancialGeographicLevel, label: string) =>
    `${level}:${normalizeText(label)}`;

const uniqueNumbers = (values: Array<number | string | null | undefined>) =>
    Array.from(new Set(values.map(Number).filter(value => Number.isFinite(value) && value > 0)));

const uniqueText = (values: Array<string | null | undefined>) => {
    const byNormalizedValue = new Map<string, string>();
    values.forEach(value => {
        const cleanValue = String(value || '').trim().replace(/\s+/g, ' ');
        const key = normalizeText(cleanValue);
        if (key && !byNormalizedValue.has(key)) byNormalizedValue.set(key, cleanValue);
    });
    return Array.from(byNormalizedValue.values());
};

const getLinkedIpos = (
    item: FinancialLineItem,
    ipoById: Map<number, IPO>,
    ipoByName: Map<string, IPO>
) => {
    const linkedById = uniqueNumbers(item.ipoIds || [])
        .map(id => ipoById.get(id))
        .filter((ipo): ipo is IPO => !!ipo);
    if (linkedById.length > 0) return linkedById;

    return uniqueText(item.ipoNames || [])
        .map(name => ipoByName.get(normalizeText(name)))
        .filter((ipo): ipo is IPO => !!ipo);
};

const getFinancialGeography = (
    item: FinancialLineItem,
    ipoById: Map<number, IPO>,
    ipoByName: Map<string, IPO>
): FinancialGeography => {
    const parsedLocation = parseLocation(item.location || '');
    const linkedIpos = getLinkedIpos(item, ipoById, ipoByName);
    const legacyIpoNames = uniqueText(item.ipoNames || []);

    let ipo = 'Not IPO-Specific';
    if (linkedIpos.length === 1) {
        ipo = linkedIpos[0].name;
    } else if (linkedIpos.length > 1 || legacyIpoNames.length > 1) {
        ipo = 'Multiple IPOs';
    } else if (legacyIpoNames.length === 1) {
        ipo = legacyIpoNames[0];
    }

    const ancestralDomains = uniqueText(linkedIpos.map(linkedIpo => linkedIpo.ancestralDomainNo));
    let ancestralDomain = 'No Ancestral Domain';
    if (ancestralDomains.length === 1) {
        ancestralDomain = ancestralDomains[0];
    } else if (ancestralDomains.length > 1) {
        ancestralDomain = 'Multiple Ancestral Domains';
    }

    return {
        operatingUnit: item.operatingUnit || 'Unspecified OU',
        province: parsedLocation.province || 'Unspecified Province',
        municipality: parsedLocation.municipality || 'Unspecified Municipality',
        ancestralDomain,
        ipo,
    };
};

const addItemValues = (node: MutableHierarchyNode, item: FinancialLineItem) => {
    node.allocation += item.alloc;
    node.obligation += item.obli;
    node.disbursement += item.disb;
};

const compareNodes = (left: FinancialHierarchyNode, right: FinancialHierarchyNode) => {
    const leftIsFallback = /^(Unspecified|No |Not IPO-Specific|Multiple )/i.test(left.label);
    const rightIsFallback = /^(Unspecified|No |Not IPO-Specific|Multiple )/i.test(right.label);
    if (leftIsFallback !== rightIsFallback) return leftIsFallback ? 1 : -1;
    return right.allocation - left.allocation || left.label.localeCompare(right.label);
};

const finalizeNodes = (nodes: MutableHierarchyNode[]): FinancialHierarchyNode[] =>
    nodes
        .map(({ childMap, ...node }) => ({
            ...node,
            children: finalizeNodes(Array.from(childMap.values())),
        }))
        .sort(compareNodes);

export const buildFinancialGeographicHierarchy = (
    items: FinancialLineItem[],
    ipos: IPO[],
    startLevel: FinancialGeographicLevel
): FinancialHierarchyNode[] => {
    const ipoById = new Map(ipos.map(ipo => [Number(ipo.id), ipo]));
    const ipoByName = new Map(ipos.map(ipo => [normalizeText(ipo.name), ipo]));
    const startIndex = LEVELS.indexOf(startLevel);
    const levels = LEVELS.slice(startIndex);
    const rootMap = new Map<string, MutableHierarchyNode>();

    items.forEach(item => {
        const geography = getFinancialGeography(item, ipoById, ipoByName);
        let siblings = rootMap;
        let parentPath = normalizeText(geography.operatingUnit);

        levels.forEach(level => {
            const label = geography[level];
            const segment = normalizedKey(level, label);
            const mapKey = `${parentPath}|${segment}`;
            let node = siblings.get(mapKey);

            if (!node) {
                node = {
                    key: mapKey,
                    level,
                    label,
                    operatingUnit: geography.operatingUnit,
                    allocation: 0,
                    obligation: 0,
                    disbursement: 0,
                    children: [],
                    childMap: new Map<string, MutableHierarchyNode>(),
                };
                siblings.set(mapKey, node);
            }

            addItemValues(node, item);
            siblings = node.childMap;
            parentPath = mapKey;
        });
    });

    return finalizeNodes(Array.from(rootMap.values()));
};

export const flattenFinancialHierarchy = (
    nodes: FinancialHierarchyNode[],
    expandedKeys: Set<string>,
    depth = 0
): VisibleFinancialHierarchyRow[] => nodes.flatMap(node => [
    { node, depth },
    ...(expandedKeys.has(node.key)
        ? flattenFinancialHierarchy(node.children, expandedKeys, depth + 1)
        : []),
]);

export const getFinancialHierarchyTotals = (nodes: FinancialHierarchyNode[]) =>
    nodes.reduce((totals, node) => ({
        allocation: totals.allocation + node.allocation,
        obligation: totals.obligation + node.obligation,
        disbursement: totals.disbursement + node.disbursement,
    }), { allocation: 0, obligation: 0, disbursement: 0 });
