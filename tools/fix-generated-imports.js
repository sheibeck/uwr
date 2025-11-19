#!/usr/bin/env node
// Fix generated TypeScript bindings to be runtime-friendly under Node ESM (NodeNext)
// - Add .js extensions to relative imports that lack them
// - Replace `from "."` with `from "./index.js"`

import fs from 'fs';
import path from 'path';

function walk(dir, cb) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, cb);
        else cb(full);
    }
}

const root = process.cwd();
const dir = path.resolve(root, 'services', 'orchestrator', 'src', 'module_bindings');

if (!fs.existsSync(dir)) {
    console.error('module_bindings directory not found at', dir);
    process.exit(0);
}

let patched = 0;

walk(dir, (file) => {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) return;
    let orig = fs.readFileSync(file, 'utf8');
    let s = orig;

    // Replace import from '.' with './index.js'
    s = s.replace(/from\s+(['"])\.\s*\1/g, 'from "./index.js"');

    // Add .js to relative imports that don't already have an extension
    // Matches: from './foo' or from "../bar/baz" (but not .ts/.tsx/.d.ts/.json/.js)
    s = s.replace(/(from\s+['"])(\.{1,2}\/[^'";\n\r]+)(['"])/g, (m, prefix, rel, suffix) => {
        // If it already ends with extension, leave it
        if (/\.(ts|tsx|js|d\.ts|json)$/.test(rel)) return `${prefix}${rel}${suffix}`;
        return `${prefix}${rel}.js${suffix}`;
    });

    if (s !== orig) {
        fs.writeFileSync(file, s, 'utf8');
        patched++;
    }
});

console.log(`patched ${patched} generated binding files`);
