import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDirectory = await mkdtemp(path.join(tmpdir(), '4kis-financial-breakdown-'));
const outputFile = path.join(tempDirectory, 'hierarchy-check.mjs');

try {
    await build({
        entryPoints: ['scripts/financial-breakdown-hierarchy-check.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: outputFile,
        logLevel: 'silent',
    });
    await import(pathToFileURL(outputFile).href);
} finally {
    await rm(tempDirectory, { recursive: true, force: true });
}
