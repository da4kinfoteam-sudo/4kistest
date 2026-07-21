import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = path => readFileSync(join(root, path), 'utf8');

const walk = directory => readdirSync(join(root, directory)).flatMap(name => {
    const absolute = join(root, directory, name);
    const projectPath = join(directory, name);
    return statSync(absolute).isDirectory() ? walk(projectPath) : [projectPath];
});

const sourceFiles = ['App.tsx', ...walk('components').filter(path => path.endsWith('.tsx'))];
const sources = sourceFiles.map(path => ({ path, source: read(path) }));
const cssSource = read('styles/main.css');
const cssRoot = postcss.parse(cssSource, { from: 'styles/main.css' });

const legacyPatterns = [
    {
        id: 'legacy-surface',
        regex: /\bbg-white\b/g,
        replacement: 'Use a named Agri Vista surface or component class.',
    },
    {
        id: 'legacy-type-size',
        regex: /\b(?:text-xs|text-sm|text-\[(?:7|8|9|10|11)px\])/g,
        replacement: 'Use the canonical body, label, or caption semantic class.',
    },
    {
        id: 'legacy-type-weight',
        regex: /\bfont-(?:medium|semibold|bold|extrabold|black|mono)\b/g,
        replacement: 'Use the semantic strong, title, or display treatment.',
    },
    {
        id: 'legacy-palette',
        regex: /\b(?:dark:)?(?:text|bg|border(?:-[lrtbxy])?|ring|hover:bg|hover:text|hover:border|focus:ring|focus:border|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-[\w/.]+)?\b/g,
        replacement: 'Use a named Agri Vista semantic color, state, or component class.',
    },
    {
        id: 'legacy-tracking',
        regex: /\btracking-(?:wider|widest)\b/g,
        replacement: 'Use the canonical label tracking token through a semantic class.',
    },
    {
        id: 'legacy-radius',
        regex: /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b/g,
        replacement: 'Use the radius owned by the canonical component primitive.',
    },
    {
        id: 'legacy-shadow',
        regex: /\bshadow-(?:sm|md|lg|xl|2xl)\b/g,
        replacement: 'Use the canonical card, panel, or elevated-surface shadow token.',
    },
];

const patternResults = legacyPatterns.map(pattern => {
    const consumers = sources.flatMap(({ path, source }) => {
        const count = [...source.matchAll(pattern.regex)].length;
        return count ? [{ path, count }] : [];
    }).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
    return {
        ...pattern,
        count: consumers.reduce((sum, consumer) => sum + consumer.count, 0),
        consumers,
    };
});

const importantRules = [];
cssRoot.walkRules(rule => {
    const declarations = [];
    rule.walkDecls(declaration => {
        if (declaration.important) declarations.push(declaration.prop);
    });
    if (!declarations.length) return;

    const classNames = [...new Set([...rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]))];
    const consumers = sources.filter(({ source }) => classNames.some(className => source.includes(className))).map(({ path }) => path);
    importantRules.push({
        selector: rule.selector,
        line: rule.source?.start?.line ?? 0,
        declarations,
        consumers,
    });
});

const selectors = new Map();
cssRoot.walkRules(rule => {
    const context = [];
    let parent = rule.parent;
    while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule') context.unshift(`@${parent.name} ${parent.params}`);
        parent = parent.parent;
    }
    const key = `${context.join(' > ')} || ${rule.selector}`;
    const entries = selectors.get(key) || [];
    entries.push(rule.source?.start?.line ?? 0);
    selectors.set(key, entries);
});
const duplicateSelectors = [...selectors.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([contextualSelector, lines]) => ({ selector: contextualSelector.replace(/^ \|\| /, ''), lines }))
    .sort((a, b) => b.lines.length - a.lines.length || a.selector.localeCompare(b.selector));

const inlineStyleConsumers = sources.flatMap(({ path, source }) => {
    const count = [...source.matchAll(/style=\{\{/g)].length;
    return count ? [{ path, count }] : [];
}).sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

const formatConsumers = consumers => consumers.length
    ? consumers.map(consumer => `${consumer.path} (${consumer.count})`).join(', ')
    : 'None';

console.log('# Legacy UI inventory');
console.log();
console.log('## Summary');
console.log();
for (const result of patternResults) console.log(`- ${result.id}: ${result.count} occurrence(s) across ${result.consumers.length} file(s).`);
console.log(`- CSS !important declarations: ${importantRules.reduce((sum, rule) => sum + rule.declarations.length, 0)} across ${importantRules.length} selector rule(s).`);
console.log(`- Duplicate selector definitions: ${duplicateSelectors.length}.`);
console.log(`- JSX inline style attributes: ${inlineStyleConsumers.reduce((sum, consumer) => sum + consumer.count, 0)} across ${inlineStyleConsumers.length} file(s).`);
console.log();
console.log('## Legacy utility consumers');
console.log();
for (const result of patternResults) {
    console.log(`### ${result.id}`);
    console.log();
    console.log(`Replacement: ${result.replacement}`);
    console.log();
    console.log(formatConsumers(result.consumers));
    console.log();
}
console.log('## Important-rule consumers');
console.log();
for (const rule of importantRules) {
    console.log(`- Line ${rule.line}: \`${rule.selector}\` — ${rule.declarations.join(', ')} — consumers: ${rule.consumers.join(', ') || 'no static consumer found'}`);
}
console.log();
console.log('## Duplicate selectors');
console.log();
for (const duplicate of duplicateSelectors) console.log(`- \`${duplicate.selector}\`: lines ${duplicate.lines.join(', ')}`);
console.log();
console.log('## Inline-style consumers');
console.log();
console.log(formatConsumers(inlineStyleConsumers));
