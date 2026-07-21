import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

const componentFiles = walk('components').filter(path => path.endsWith('.tsx'));
const sourceFiles = ['App.tsx', ...componentFiles];
const componentSource = sourceFiles.map(path => ({ path, source: read(path) }));
const css = read('styles/main.css');
const indexCss = read('index.css');
const enterprise = read('components/ui/enterprise.tsx');
const cssRoot = postcss.parse(css, { from: 'styles/main.css' });

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(/Inter:wght@400;500;600;700;800/.test(indexCss), 'Inter must load the approved 400–800 faces.');
assert(!/Inter:wght@[^\n"]*900/.test(indexCss), 'Inter 900 must not be loaded without a verified design requirement.');
assert(/--font-redesign-sans:\s*var\(--font-family-sans\)/.test(css), 'The legacy font alias must resolve to the canonical font token.');
assert(!/font-weight:\s*(?:8[1-9]\d|9\d\d)\b/.test(css), 'CSS contains an unsupported synthetic font weight above 800.');

for (const { path, source } of componentSource) {
  assert(!source.includes('font-black'), `${relative(root, join(root, path))} contains the legacy font-black utility.`);
  assert(!/font(?:Weight)?(?:-|:\s*)\[?(?:8[1-9]\d|9\d\d)\]?/.test(source), `${relative(root, join(root, path))} contains an unsupported synthetic font weight.`);
}

const legacySourcePatterns = [
  ['palette-specific visual utility', /\b(?:dark:)?(?:text|bg|border(?:-[lrtbxy])?|ring|hover:bg|hover:text|hover:border|focus:ring|focus:border|divide)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black)(?:-[\w/.]+)?\b/],
  ['legacy surface utility', /\bbg-white\b/],
  ['legacy type-size utility', /\b(?:text-xs|text-sm|text-\[(?:7|8|9|10|11)px\])/],
  ['legacy type-weight utility', /\bfont-(?:medium|semibold|bold|extrabold|black|mono)\b/],
  ['legacy tracking utility', /\btracking-(?:wide|wider|widest)\b/],
  ['legacy radius utility', /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/],
  ['legacy shadow utility', /\bshadow-(?:sm|md|lg|xl|2xl)\b/],
  ['legacy fixed table-width utility', /\bmin-w-\[[^\]]+\]/],
  ['legacy horizontal-scroll utility', /\boverflow-x-auto\b/],
  ['legacy marker', /\b(?:data-legacy|legacy-(?:ui|style|table|responsive|color))\b/],
];

for (const { path, source } of componentSource) {
  for (const [label, pattern] of legacySourcePatterns) {
    assert(!pattern.test(source), `${relative(root, join(root, path))} contains a ${label}.`);
  }
}

const importantDeclarations = [];
cssRoot.walkDecls(declaration => {
  if (declaration.important) importantDeclarations.push(`${declaration.prop} at line ${declaration.source?.start?.line ?? '?'}`);
});
assert(importantDeclarations.length === 0, `styles/main.css contains undocumented !important declarations: ${importantDeclarations.join(', ')}.`);

const selectorDefinitions = new Map();
const duplicateSelectors = [];
cssRoot.walkRules(rule => {
  const atRuleContext = [];
  let parent = rule.parent;
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') atRuleContext.unshift(`@${parent.name} ${parent.params}`);
    parent = parent.parent;
  }
  const key = `${atRuleContext.join(' > ')} || ${rule.selector}`;
  const firstLine = selectorDefinitions.get(key);
  if (firstLine) duplicateSelectors.push(`${rule.selector} at lines ${firstLine} and ${rule.source?.start?.line ?? '?'}`);
  else selectorDefinitions.set(key, rule.source?.start?.line ?? 0);
});
assert(duplicateSelectors.length === 0, `styles/main.css contains competing selector definitions in the same cascade context: ${duplicateSelectors.join('; ')}.`);

assert(!/\[class\*=["'](?:bg-|text-|font-|border-|rounded-|shadow-)/.test(css), 'styles/main.css contains a wildcard utility compatibility selector.');
assert(!/(?:\.text-\\\[|\.text-(?:3xl|xl|lg)|\.tracking-(?:wider|widest)|\.shadow-(?:sm|md|lg|xl|2xl)|\.rounded-(?:xl|2xl|3xl))/.test(css), 'styles/main.css contains a legacy utility compatibility selector.');
assert(!/--(?:legacy|old)-(?:[\w-]+)/.test(css), 'styles/main.css contains a deprecated legacy/old custom property.');
assert(!/(?:legacy|financial-dashboard|styles)\.css/i.test(indexCss), 'index.css imports an obsolete stylesheet.');
assert(!existsSync(join(root, 'styles/financial-dashboard.css')), 'The obsolete styles/financial-dashboard.css file still exists.');

const shellDefinitions = css.match(/^\.app-shell\s*\{/gm) || [];
assert(shellDefinitions.length === 1, `Expected one authoritative .app-shell definition; found ${shellDefinitions.length}.`);

for (const token of [
  '--font-size-page-title',
  '--font-size-section-title',
  '--font-size-body',
  '--font-size-label',
  '--font-weight-semibold',
  '--font-weight-bold',
  '--font-weight-display',
  '--tracking-display',
  '--tracking-label',
]) {
  assert(css.includes(`${token}:`), `Missing canonical design token ${token}.`);
}

for (const primitive of [
  'PageHeader',
  'SectionHeading',
  'ContentCard',
  'ChartCard',
  'MapCard',
  'FilterToolbar',
  'KpiCard',
  'TableShell',
  'StatusIndicator',
  'EmptyState',
  'ErrorState',
  'LoadingState',
]) {
  assert(enterprise.includes(`export const ${primitive}`), `Missing shared enterprise primitive ${primitive}.`);
}

for (const adapter of ['.leaflet-container', '.recharts-default-tooltip']) {
  assert(css.includes(adapter), `Missing scoped third-party adapter ${adapter}.`);
}

for (const consumer of ['components/Activities.tsx', 'components/Subprojects.tsx', 'components/IPO.tsx', 'components/LOD/LODPage.tsx']) {
  assert(read(consumer).includes('DataTablePagination'), `${consumer} must use the canonical DataTablePagination primitive.`);
}

assert(read('App.tsx').includes('LoadingState'), 'App route loading states must use the canonical LoadingState primitive.');
assert(read('components/accomplishment/FinancialAccomplishment.tsx').includes('financial-accomplishment-table'), 'Financial Accomplishment must use its canonical table adapter.');
assert(read('components/accomplishment/PhysicalAccomplishment.tsx').includes('physical-accomplishment-table'), 'Physical Accomplishment must use its canonical table adapter.');

if (failures.length) {
  console.error(`UI consistency audit failed with ${failures.length} issue${failures.length === 1 ? '' : 's'}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`UI consistency audit passed across ${componentFiles.length} component files.`);
