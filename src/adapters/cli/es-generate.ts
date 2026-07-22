#!/usr/bin/env node
/**
 * Generate views from the canonical flows.json:
 *   1. flows.dot      - Graphviz digraph, one cluster per flow, event-storming colors
 *   2. explorer.html  - self-contained interactive explorer (no external deps)
 *
 * Usage: node generate-views.js <flows.json> <outDir> [--repo-root <path>] [--title <text>]
 *
 *   --repo-root  absolute path to the analyzed checkout, so the explorer's
 *                vscode:// deep links open the right local files. Defaults to the
 *                model's meta.repoRoot if present, else "." (links resolve relative
 *                to wherever the viewer opens them).
 *   --title      heading shown in the explorer + <title>. Defaults to the model's
 *                meta.title if present, else "Event Storming Explorer".
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Model } from '../../domain/model/types.js';
import { generateViews } from '../../application/commands/generate-views.js';
import { writeViews } from '../fs/generator-writer.js';

const args = process.argv.slice(2);
const flowsFile = args[0];
const outDir = args[1];
if (!flowsFile || !outDir) { console.error('usage: node generate-views.js <flows.json> <outDir> [--repo-root <path>] [--title <text>]'); process.exit(2); }

const model: Model = JSON.parse(fs.readFileSync(flowsFile, 'utf8'));

function argVal(flag: string, fallback: string): string { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1]! : fallback; }
const repoRoot = argVal('--repo-root', (model.meta && model.meta.repoRoot) || '.');
const title = argVal('--title', (model.meta && model.meta.title) || 'Event Storming Explorer');

const views = generateViews(model, { repoRoot, title });
writeViews(outDir, views);

console.log(`wrote ${path.join(outDir, 'flows.dot')} and ${path.join(outDir, 'explorer.html')}`);
console.log(`flows: ${model.flows.length}, nodes: ${model.nodes.length}, hotspots: ${model.hotspots.length}`);
