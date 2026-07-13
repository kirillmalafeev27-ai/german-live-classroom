import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('public/assets', { recursive: true });

await build({
  entryPoints: ['src/client/teacher.js', 'src/client/student.js', 'src/client/practice.js'],
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  outdir: 'public/assets',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  logLevel: 'info'
});
