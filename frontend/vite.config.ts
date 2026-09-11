/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The content policy for the built app.
 *
 * `default-src 'none'` and then only what this app actually needs. It loads no
 * third-party script, no web font, no analytics and no image from anywhere but
 * itself, so almost every directive is a refusal — and each refusal is a class
 * of injected content that cannot execute even if it reaches the page.
 *
 * `style-src` carries `'unsafe-inline'` and that is a real weakening, stated
 * rather than hidden: a handful of components set a `style` attribute to carry
 * an animation delay or a bar height, and a style attribute is inline style. The
 * alternative is a nonce, which needs a server rendering the document; this app
 * is static files. Injected CSS can restyle a page and cannot run code, so the
 * trade is worth naming and taking.
 *
 * `frame-ancestors` is absent on purpose: it is ignored in a meta element and
 * has to be a real response header. `docs/SECURITY.md` carries the header set a
 * deployment must add, so a policy that cannot work here is not written here as
 * though it did.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // The sign-in hero plays a video from this origin. Without this directive
  // `default-src 'none'` blocks it, and the failure is quiet in exactly the
  // way that costs an afternoon: no console error the page can see, no media
  // error code, just a <video> that never leaves its poster — and only in a
  // built bundle, because the policy is injected at build time and the dev
  // server never carries it.
  "media-src 'self'",
  "font-src 'self'",
  // The API, same origin. A deployment serving the API elsewhere adds that
  // origin here, and adding one is then a visible decision.
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
  // Registry portals open in a new tab. They are navigations, not loads.
  "frame-src 'none'",
  "object-src 'none'",
].join('; ');

/**
 * Inject the policy into the built `index.html`, and only the built one.
 *
 * Not in the source file: the dev server needs inline script and a websocket for
 * hot reloading, so a policy strict enough to be worth having would make the app
 * undevelopable — and a policy loose enough to develop under is not the one that
 * should ship. `apply: 'build'` is what keeps those two facts from being traded
 * against each other.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'sahayak-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The corpus manifest is repo-level data, not frontend source. Aliased so
      // there is one copy of it rather than a duplicate under src/.
      '@corpus': fileURLToPath(new URL('../corpus', import.meta.url)),
      // The classification graph lives with the service that will walk it in
      // Phase 10. The frontend reads the same file rather than a copy.
      '@classification': fileURLToPath(
        new URL('../backend/app/services/classification', import.meta.url),
      ),
      // The ingredient vocabulary is read by the invention analyst and by the
      // step-by-step product check. One file, so the two never disagree.
      '@analyst': fileURLToPath(new URL('../backend/app/analyst/data', import.meta.url)),
      // Demo fixtures are read by the backend's fixture generator and by the
      // mock service here. One copy, aliased, rather than two that drift.
      '@fixtures': fileURLToPath(new URL('../data/fixtures', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Where the dev server forwards /api. Override with SAHAYAK_API_TARGET when
      // the backend is not on its default port — port 8000 is popular.
      '/api': {
        target: process.env.SAHAYAK_API_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    testTimeout: 15000,
  },
});
