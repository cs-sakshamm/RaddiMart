import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8'));
}

describe('Vercel deployment configuration', () => {
  it('declares a Vite build with an SPA fallback rewrite', () => {
    const vercel = readJson('vercel.json');

    expect(vercel.framework).toBe('vite');
    expect(vercel.buildCommand).toBe('npm run build');
    expect(vercel.installCommand).toBe('npm ci');
    expect(vercel.outputDirectory).toBe('dist');
    expect(vercel.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });

  it('requires a Node version supported by Vite 8 and Vitest 5', () => {
    const pkg = readJson('package.json');

    expect(pkg.engines.node).toBe('>=22.12.0');
  });
});
