import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Packages a reader needs before the first headline is drawn, and that only
// change when this repository's dependencies change. See the comment where
// they are used.
const READER_FOUNDATION = [
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'scheduler',
  'axios',
  'date-fns',
]

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        // React, the router, the HTTP client and the date formatter are the
        // part of a reader's download that never changes between releases of
        // the newsroom and that every page needs before anything is drawn.
        // Putting them in one named file means a returning reader keeps that
        // file cached through the next deploy and re-downloads only what was
        // actually written here.
        //
        // It is written as a list of package names rather than a bucket for
        // everything in node_modules because the rest of what is installed
        // belongs to a screen, not to the site: the charting library is the
        // admin's dashboard, the socket client is the TV studio, the icon set
        // is whatever imports it. Those stay unassigned and Rollup puts each
        // one in the chunk that asked for it, so a reader who never opens that
        // screen never downloads it.
        //
        // "react-dom/client" is spelled out next to "react-dom" because the
        // package's own entry point is a shim; the bulk of React's DOM code sits
        // behind the client path, and naming only the root would leave that bulk
        // in the file that changes on every deploy.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          const afterModules = id.slice(id.lastIndexOf('node_modules/') + 'node_modules/'.length)
          const separator = afterModules.includes('/') ? afterModules.indexOf('/') : afterModules.length
          const pkg = afterModules.startsWith('@')
            ? afterModules.slice(0, afterModules.indexOf('/', afterModules.indexOf('/') + 1))
            : afterModules.slice(0, separator)
          return READER_FOUNDATION.includes(pkg) ? 'vendor' : undefined
        },
      },
    },
  },
})