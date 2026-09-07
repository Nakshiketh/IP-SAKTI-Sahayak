import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

/**
 * Phase 1 builds the design system only. Product routes, the shell and i18n
 * arrive in Phase 2.
 *
 * /design is a development surface: it is not registered in a production build,
 * so the specimen page cannot be reached from a deployed site.
 */
const DesignSystem = lazy(() => import('@/routes/DesignSystem'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {import.meta.env.DEV ? <Route path="/design" element={<DesignSystem />} /> : null}
        <Route path="*" element={<Scaffold />} />
      </Routes>
    </Suspense>
  );
}

function Scaffold() {
  return (
    <main className="mx-auto max-w-measure px-5 py-10">
      <h1 className="text-xl">IP-SAKTI Sahayak</h1>
      <p className="mt-2 text-muted">
        Scaffold. Pages arrive in Phase 2.
        {import.meta.env.DEV ? (
          <>
            {' '}
            The design system is at{' '}
            <a className="text-stamp underline" href="/design">
              /design
            </a>
            .
          </>
        ) : null}
      </p>
    </main>
  );
}
