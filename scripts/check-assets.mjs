#!/usr/bin/env node
// Checks the asset files pinned in .config/assets.toml: every listed file exists with its sha256,
// and every file under a root is listed. Run by `just assets` (part of `just ci`).
// Usage: node scripts/check-assets.mjs [manifest] (paths in the manifest are relative to the
// current directory, the repository root).
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const manifestPath = process.argv[2] ?? '.config/assets.toml';

/** Reads the small part of TOML the manifest uses: strings, arrays of strings, `[[tables]]`. */
function parse(text) {
  const doc = { roots: [], source: [], file: [] };
  let target = doc;
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const table = /^\[\[(source|file)\]\]$/.exec(line);
    if (table) {
      target = {};
      doc[table[1]].push(target);
      continue;
    }
    const pair = /^([a-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) throw new Error(`${manifestPath}:${index + 1}: cannot read this line`);
    try {
      target[pair[1]] = JSON.parse(pair[2]);
    } catch {
      throw new Error(`${manifestPath}:${index + 1}: the value is not a string or a list of strings`);
    }
  }
  return doc;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name).replaceAll('\\', '/');
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const problems = [];
let doc;
try {
  doc = parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`check-assets: ${error.message}`);
  process.exit(1);
}

const sources = new Set(doc.source.map((source) => source.id));
const listed = new Set();

for (const file of doc.file) {
  const { path, source, sha256 } = file;
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) {
    problems.push(`a [[file]] has no usable path: ${JSON.stringify(path)}`);
    continue;
  }
  if (listed.has(path)) problems.push(`${path}: listed twice`);
  listed.add(path);
  if (!sources.has(source)) problems.push(`${path}: unknown source ${JSON.stringify(source)}`);
  if (source !== 'rendered' && typeof file.from !== 'string') problems.push(`${path}: a copied file needs "from"`);
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    problems.push(`${path}: sha256 is not 64 hexadecimal digits`);
    continue;
  }
  if (!existsSync(path)) {
    problems.push(`${path}: missing`);
    continue;
  }
  if (lstatSync(path).isSymbolicLink()) {
    problems.push(`${path}: is a symbolic link`);
    continue;
  }
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (actual !== sha256) problems.push(`${path}: changed (sha256 is ${actual}, the pin says ${sha256})`);
}

for (const root of doc.roots) {
  for (const path of filesUnder(root)) {
    if (!listed.has(path)) problems.push(`${path}: under the root ${root} but not pinned`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-assets: ${problem}`);
  console.error(`check-assets: ${problems.length} problem(s) in ${manifestPath}`);
  process.exit(1);
}
console.log(`check-assets: ${doc.file.length} files match ${manifestPath}`);
