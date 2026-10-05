import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static guards for the v3.0 client cutover (Phase 45, plan 01): the old browser UI is gone,
// the toolchain is the new one, and nothing in production source reaches back to the old
// directories. The local `v2.2-client` tag is checked at plan level, not here (tags are local only).

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, 'utf8');
}

const SKIPPED_DIRS = new Set(['module_bindings', 'node_modules']);
const SOURCE_EXTENSIONS = ['.ts', '.vue', '.js'];

function walkProduction(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walkProduction(`${dir}/${entry.name}`, out);
      continue;
    }
    const name = entry.name;
    if (name.endsWith('.test.ts')) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    out.push(`${dir}/${name}`);
  }
  return out;
}

describe('old client removal', () => {
  it('the old UI paths are gone', () => {
    for (const gone of [
      'src/components',
      'src/composables',
      'src/composables/useLlm.ts',
      'src/ui',
      'src/data',
      'temp_all_panels.txt',
      'public/assets/logo_old.png',
    ]) {
      expect(existsSync(`${ROOT}${gone}`), gone).toBe(false);
    }
  });

  it('runtime dependencies are exactly vue, spacetimedb and the Phosphor icons', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@phosphor-icons/vue', 'spacetimedb', 'vue']);
  });

  it('dev dependencies hold nothing beyond the current set plus the new test toolchain', () => {
    const pkg = JSON.parse(read('package.json'));
    const allowed = [
      '@types/node',
      '@vitejs/plugin-vue',
      '@vue/test-utils',
      'happy-dom',
      'postcss',
      'typescript',
      'vite',
      'vitest',
      'vue-tsc',
    ];
    const extra = Object.keys(pkg.devDependencies).filter((name) => !allowed.includes(name));
    expect(extra).toEqual([]);
  });

  it('the dev, build, test and generate scripts are unchanged', () => {
    const { scripts } = JSON.parse(read('package.json'));
    expect(scripts.dev).toBe('vite');
    expect(scripts.test).toBe('vitest run');
    expect(scripts.build).toBe('vue-tsc -b && vite build && node scripts/check-bundle.mjs');
    expect(scripts['spacetime:generate']).toBe(
      'spacetime generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb'
    );
  });

  it('the dev server holds port 5173 strictly', () => {
    const vite = read('vite.config.ts');
    expect(vite).toContain('port: 5173');
    expect(vite).toContain('strictPort: true');
  });

  it('index.html mounts the new entry with a safe-area viewport and no inline style', () => {
    const html = read('index.html');
    expect(html).toContain('id="app"');
    expect(html).toContain('src="/src/main.ts"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).not.toContain('<style');
  });

  it('the README structure block no longer lists the old directories', () => {
    const readme = read('README.md');
    expect(readme).not.toContain('components/');
    expect(readme).not.toContain('composables/');
  });
});

describe('production source', () => {
  const files = walkProduction(`${ROOT}src`);

  it('scans a meaningful number of source files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no import reaches the Vue provider package path, the screenshot library or the old directories', () => {
    const specifier = /(?:from\s+|import\s*\(\s*)'([^']+)'/g;
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(specifier)) {
        const spec = match[1];
        if (spec === 'spacetimedb/vue' || spec === 'html2canvas' || /(^|\/)(components|composables|ui)\//.test(spec)) {
          offenders.push(`${file.slice(ROOT.length)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no file uses a snake_case table handle (generated handles are camelCase)', () => {
    const handle = /\b(?:tables|db)\.[a-z]+_[a-z0-9_]+\b/;
    const offenders = files.filter((file) => handle.test(readFileSync(file, 'utf8'))).map((file) => file.slice(ROOT.length));
    expect(offenders).toEqual([]);
  });
});
