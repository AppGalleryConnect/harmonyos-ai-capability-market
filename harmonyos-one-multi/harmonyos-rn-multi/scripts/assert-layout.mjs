#!/usr/bin/env node
// Mechanical layout assertions over a device layout dump, so multi-column
// acceptance does not depend on reading coordinates by eye.
//
// Usage:
//   node scripts/assert-layout.mjs <layout.json> --expect <testID>=<columns>[@<containerTestID>] ...
//   node scripts/assert-layout.mjs <layout.json> --spec <spec.json>
//
// spec.json: { "top-grid-col": { "columns": 8, "container": "top-grid-row" } }
// Accepts `uitest dumpLayout` and `devecocli ui layout --format json` output,
// including log lines printed before the JSON. Bounds are physical px.
// Exit codes: 0 = all assertions pass, 1 = an assertion failed, 2 = usage or parse error.

import fs from 'node:fs';

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const [file, ...rest] = argv;
  if (!file) fail('Usage: assert-layout.mjs <layout.json> --expect <testID>=<columns>[@<container>] | --spec <spec.json> [--tolerance <px>]');
  const spec = {};
  let tolerance = 1;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === '--expect' && value) {
      const match = value.match(/^([^=]+)=(\d+)(?:@(.+))?$/);
      if (!match) fail(`Bad --expect value: ${value}`);
      spec[match[1]] = { columns: Number(match[2]), container: match[3] };
      i += 1;
    } else if (flag === '--spec' && value) {
      Object.assign(spec, JSON.parse(fs.readFileSync(value, 'utf8')));
      i += 1;
    } else if (flag === '--tolerance' && value) {
      tolerance = Number(value);
      i += 1;
    } else {
      fail(`Unknown argument: ${flag}`);
    }
  }
  if (!Object.keys(spec).length) fail('No expectations given (--expect or --spec).');
  return { file, spec, tolerance };
}

// Returns the end index of the JSON value that opens at `start`, matching
// brackets outside string literals, or -1 if it never closes.
function matchingEnd(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '[' || ch === '{') {
      depth += 1;
    } else if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Tolerate log lines before/after the JSON document, including trailing lines
// that contain brackets such as "[INFO] done".
export function parseDump(text) {
  // Device tools may print log lines such as "[INFO] ..." before the JSON, so try each line start.
  const starts = [...text.matchAll(/^[ \t]*[[{]/gm)].map((match) => match.index + match[0].length - 1);
  for (const start of starts) {
    const end = matchingEnd(text, start);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // Not the JSON payload; keep looking.
    }
  }
  throw new Error('No JSON found in layout dump.');
}

function toRect(bounds) {
  if (!bounds) return null;
  if (Array.isArray(bounds) && bounds.length === 4) return bounds.map(Number);
  if (typeof bounds === 'string') {
    const numbers = bounds.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
    return numbers?.length === 4 ? numbers : null;
  }
  if (typeof bounds === 'object' && 'left' in bounds) {
    return [bounds.left, bounds.top, bounds.right, bounds.bottom].map(Number);
  }
  return null;
}

const ID_KEYS = ['id', 'key', 'testID', 'testId', 'accessibilityId', 'inspectorKey'];

// Flattens both shapes: fields on the node itself, or under `attributes`.
export function collectNodes(root) {
  const nodes = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const attributes = { ...(node.attributes ?? {}), ...node };
    const ids = ID_KEYS.map((key) => attributes[key]).filter((value) => typeof value === 'string' && value);
    const rect = toRect(attributes.origBounds ?? attributes.bounds);
    if (ids.length && rect) nodes.push({ ids, rect });
    walk(node.children);
  };
  walk(root);
  return nodes;
}

// `grid-item-*` matches per-index ids such as grid-item-0, grid-item-1.
const matchesId = (pattern) => (pattern.endsWith('*')
  ? (id) => id.startsWith(pattern.slice(0, -1))
  : (id) => id === pattern);

export function assertGrid(nodes, testID, { columns, container }, tolerance = 1) {
  const results = [];
  const check = (name, pass, detail) => results.push({ testID, name, pass, detail });
  const isItem = matchesId(testID);
  // A prefix pattern such as `grid-*` must not pick up the container itself.
  const items = nodes
    .filter((node) => node.ids.some(isItem) && !(container && node.ids.includes(container)))
    .map((node) => node.rect)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (!items.length) {
    check('nodes found', false, `no node with id ${testID}; confirm the page fingerprint and testID mapping`);
    return results;
  }

  // Group into rows by vertical centre, so cards of different heights with
  // alignItems center/flex-end still land in the same row.
  const rows = [];
  for (const rect of items) {
    const centre = (rect[1] + rect[3]) / 2;
    const row = rows.find(([first]) => centre > first[1] && centre < first[3]);
    if (row) row.push(rect);
    else rows.push([rect]);
  }
  rows.forEach((row) => row.sort((a, b) => a[0] - b[0]));

  const expectedRows = Math.ceil(items.length / columns);
  const counts = rows.map((row) => row.length);
  const rowsOk = rows.length === expectedRows && counts.every((count, index) =>
    index < rows.length - 1 ? count === columns : count <= columns && count > 0);
  check('columns per row', rowsOk, `expected ${expectedRows} row(s) of ${columns}; got [${counts.join(', ')}]`);

  const widths = items.map((rect) => rect[2] - rect[0]);
  const spread = Math.max(...widths) - Math.min(...widths);
  check('equal widths', spread <= tolerance, `width ${Math.min(...widths)}..${Math.max(...widths)} px (spread ${spread}, tolerance ${tolerance})`);

  const overlaps = rows.some((row) => row.some((rect, index) => index > 0 && rect[0] < row[index - 1][2] - tolerance));
  check('no overlap in row', !overlaps, overlaps ? 'columns overlap horizontally' : 'ok');

  if (container) {
    const parent = nodes.find((node) => node.ids.includes(container))?.rect;
    if (!parent) {
      check('container found', false, `no node with id ${container}`);
    } else {
      // Gaps, margins and padding are allowed; a full row must not leave room
      // for another column, and its gaps between columns must be even.
      const fullRows = rows.filter((row) => row.length === columns);
      const column = Math.min(...widths);
      const spare = fullRows.map((row) => (parent[2] - parent[0]) - (row[row.length - 1][2] - row[0][0]));
      const roomy = spare.filter((space) => space >= column);
      check('full rows fill container', roomy.length === 0, `unused width per full row: [${spare.join(', ')}] px; column ${column} px`);
      const gaps = fullRows.flatMap((row) => row.slice(1).map((rect, index) => rect[0] - row[index][2]));
      const gapSpread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
      check('even gaps', gapSpread <= tolerance, gaps.length ? `gap ${Math.min(...gaps)}..${Math.max(...gaps)} px` : 'no full row');
      const outside = items.filter((rect) => rect[0] < parent[0] - tolerance || rect[2] > parent[2] + tolerance);
      check('inside container', outside.length === 0, outside.length ? `${outside.length} node(s) exceed container x-range` : 'ok');
    }
  }
  return results;
}

function main() {
  const { file, spec, tolerance } = parseArgs(process.argv.slice(2));
  let nodes;
  try {
    nodes = collectNodes(parseDump(fs.readFileSync(file, 'utf8')));
  } catch (error) {
    fail(`Cannot read layout dump ${file}: ${error.message}`);
  }
  const results = Object.entries(spec).flatMap(([testID, expectation]) =>
    assertGrid(nodes, testID, expectation, tolerance));
  for (const { testID, name, pass, detail } of results) {
    console.log(`${pass ? 'PASS' : 'FAIL'} ${testID} ${name}: ${detail}`);
  }
  const failed = results.filter(({ pass }) => !pass).length;
  console.log(`${results.length - failed}/${results.length} assertion(s) passed.`);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('assert-layout.mjs')) main();
