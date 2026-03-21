/** @type {import('vite').UserConfig} */
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { Buffer } from 'buffer';
import inject from '@rollup/plugin-inject';

export default defineConfig({
  root: 'src',
  envDir: '../',
  publicDir: '../public',
  base: '/',

  server: {
    open: '/index.html', // Updated to reflect the new default file
  },

  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },

  optimizeDeps: {
    include: [
      'buffer',
      'ethers',
      '@solana/spl-token',
      '@solana/web3.js',
      '@viaprotocol/web3-wallets',
      '@solana/spl-name-service'
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env': '{}',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
      ],
    },
  },

  resolve: {
    alias: {
      buffer: 'buffer',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
    },
  },

  define: {
    'global.Buffer': 'Buffer',
    'global': 'globalThis',
    'process.env': {},
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/index.html', // Updated from addVolume: 'src/add-volume.html'
      },
      external: [],
      plugins: [
        inject({
          Buffer: ['buffer', 'Buffer'],
        }),
      ],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },

  esbuild: {
    target: 'esnext',
  },
});