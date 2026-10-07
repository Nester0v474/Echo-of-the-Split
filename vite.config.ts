import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

function yandexHtml(): Plugin {
  return {
    name: 'yandex-html',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<script src="[^"]*sdk\.js"><\/script>/g, '')
        .replace(
          /<script type="module"/,
          '    <script src="/sdk.js"></script>\n    <script type="module"',
        );
    },
  };
}

function copyGameAssets(): Plugin {
  const files: Array<[string, string]> = [
    ['assets/backgrounds/asteroids.png', 'dist/assets/backgrounds/asteroids.png'],
    ['assets/atlases/units.png', 'dist/assets/atlases/units.png'],
    ['assets/atlases/units.json', 'dist/assets/atlases/units.json'],
  ];
  for (const name of readdirSync(resolve('assets/audio'))) {
    if (name === '.gitkeep') {
      continue;
    }
    files.push([`assets/audio/${name}`, `dist/assets/audio/${name}`]);
  }

  return {
    name: 'copy-game-assets',
    closeBundle() {
      for (const [from, to] of files) {
        const dest = resolve(to);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(resolve(from)));
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [copyGameAssets(), yandexHtml()],
  build: {
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    open: true,
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
