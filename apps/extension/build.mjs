import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir('dist', { recursive: true });

await build({
  entryPoints: {
    background: 'src/background.ts',
    'content-espn': 'src/content/espn.ts',
    'content-yahoo': 'src/content/yahoo.ts',
    popup: 'src/popup.ts',
  },
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  outdir: 'dist',
  logLevel: 'info',
  alias: {
    '@draft-overlay/shared': resolve('../../packages/shared/src/index.ts'),
  },
});

await copyFile('src/manifest.json', 'dist/manifest.json');
await copyFile('src/popup.html', 'dist/popup.html');
