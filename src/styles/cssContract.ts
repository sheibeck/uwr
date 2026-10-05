// Static CSS/SFC scanning helpers shared by the design-contract tests (45-02).
// Test-support module: node:fs + postcss + vue/compiler-sfc. App code never imports it.
import { readdirSync, readFileSync } from 'node:fs';
import postcss from 'postcss';
import { parse as parseSfc } from 'vue/compiler-sfc';

export interface CssDecl {
  file: string;
  selector: string | null;
  atRule: string | null;
  prop: string;
  value: string;
}

export interface ClientFiles {
  css: string[];
  vue: string[];
  ts: string[];
}

export const NAMED_COLORS: ReadonlySet<string> = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen',
]);

const SKIPPED_DIRS = new Set(['module_bindings', 'node_modules']);

export function listClientFiles(srcRoot: string): ClientFiles {
  const out: ClientFiles = { css: [], vue: [], ts: [] };
  const root = srcRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(path);
        continue;
      }
      if (entry.name.endsWith('.test.ts')) continue;
      if (entry.name.endsWith('.css')) out.css.push(path);
      else if (entry.name.endsWith('.vue')) out.vue.push(path);
      else if (entry.name.endsWith('.ts')) out.ts.push(path);
    }
  };
  walk(root);
  out.css.sort();
  out.vue.sort();
  out.ts.sort();
  return out;
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function sfcStyleBlocks(source: string): string[] {
  return parseSfc(source).descriptor.styles.map((style) => style.content);
}

export function sfcTemplateAndScript(source: string): string {
  const { descriptor } = parseSfc(source);
  return [
    descriptor.template?.content ?? '',
    descriptor.script?.content ?? '',
    descriptor.scriptSetup?.content ?? '',
  ].join('\n');
}

export function parseDecls(css: string, file: string): CssDecl[] {
  const root = postcss.parse(css, { from: file });
  const decls: CssDecl[] = [];
  root.walkDecls((decl) => {
    let selector: string | null = null;
    let atRule: string | null = null;
    for (let node = decl.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type === 'rule' && selector === null) selector = (node as postcss.Rule).selector;
      if (node.type === 'atrule' && atRule === null) {
        const at = node as postcss.AtRule;
        atRule = `@${at.name} ${at.params}`.trim();
      }
    }
    decls.push({ file, selector, atRule, prop: decl.prop, value: decl.value });
  });
  return decls;
}

const COLOR_PROP = /^(color|background.*|border.*|outline.*|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration-color|column-rule.*)$/i;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/i;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const ALLOWED_WORDS = new Set(['transparent', 'currentcolor', 'inherit', 'none']);

// Replace every var(...) group (nested parentheses included) so fallback values never count.
function stripVarGroups(value: string): string {
  let out = '';
  let i = 0;
  while (i < value.length) {
    if (/var\(/i.test(value.slice(i, i + 4)) && (i === 0 || !/[\w-]/.test(value[i - 1]))) {
      let depth = 0;
      let j = i + 3;
      for (; j < value.length; j++) {
        if (value[j] === '(') depth++;
        else if (value[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      out += ' ';
      i = j + 1;
      continue;
    }
    out += value[i];
    i++;
  }
  return out;
}

function valueOffends(value: string): boolean {
  if (HEX.test(value) || FUNCTIONAL.test(value)) return true;
  const words = stripVarGroups(value).toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? [];
  return words.some((word) => !ALLOWED_WORDS.has(word) && NAMED_COLORS.has(word));
}

export function colorOffenders(css: string, file: string): string[] {
  return parseDecls(css, file)
    .filter((decl) => COLOR_PROP.test(decl.prop) && valueOffends(decl.value))
    .map((decl) => `${file}: ${decl.prop}: ${decl.value}`);
}

// Comments may cite PR or issue numbers ("#5707") that parse as hex, so they are not scanned.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

export function textColorOffenders(source: string, file: string): string[] {
  const text = stripComments(source);
  const offenders: string[] = [];
  const hex = new RegExp(HEX.source, 'gi');
  const fn = new RegExp(FUNCTIONAL.source, 'gi');
  for (const match of text.matchAll(hex)) offenders.push(`${file}: ${match[0]}`);
  for (const match of text.matchAll(fn)) offenders.push(`${file}: ${match[0]}`);
  return offenders;
}

export function definedCustomProperties(css: string): Set<string> {
  const names = new Set<string>();
  postcss.parse(css).walkDecls((decl) => {
    if (decl.prop.startsWith('--')) names.add(decl.prop);
  });
  return names;
}

export function usedCustomProperties(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) names.add(match[1]);
  return names;
}
