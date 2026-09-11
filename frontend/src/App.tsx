import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { Shell } from '@/components/layout/Shell';
import { AuthProvider } from '@/hooks/useAuth';
import { useAuth } from '@/hooks/authContext';
import Home from '@/routes/Home';
import NotFound from '@/routes/NotFound';

/**
 * Seven routes and nothing else. No team page, no sponsors, no sub-navigation.
 *
 * Six of them are in the header navigation. `/privacy` is the seventh and is
 * reached from the footer, where a reader looks for it — putting it in the
 * header would make it compete with the one path through the middle, and the
 * path is what the product is.
 *
 * **What loads when.** Home and the 404 are in the first chunk: one is what a
 * reader lands on, and the other has to render when nothing else could. Every
 * other route is fetched when it is first visited. The boundary that covers the
 * wait is inside `Shell`, so the header and footer stay put while a chunk
 * arrives.
 *
 * /design and /audit are development surfaces: neither is registered in a
 * production build, so neither can be reached from a deployed site. /audit has a
 * second gate behind it — the endpoint refuses to serve outside a development
 * environment — because a route whose safety rests on one build flag is a route
 * with one thing to get wrong.
 *
 * **The sign-in gate.** All seven routes sit behind it. It is a front door, not
 * a security boundary: it decides what this browser renders, and the boundary
 * that matters is the API refusing an unauthenticated request. Treat it as the
 * former and the design is honest; treat it as the latter and it is a hole.
 */
const Login = lazy(() => import('@/routes/Login'));
const Sahayak = lazy(() => import('@/routes/Sahayak'));
const Assessment = lazy(() => import('@/routes/Assessment'));
const Analyst = lazy(() => import('@/routes/Analyst'));
const WhatIsCovered = lazy(() => import('@/routes/WhatIsCovered'));
const HowItWorks = lazy(() => import('@/routes/HowItWorks'));
const Sources = lazy(() => import('@/routes/Sources'));
const About = lazy(() => import('@/routes/About'));
const Privacy = lazy(() => import('@/routes/Privacy'));
const DesignSystem = lazy(() => import('@/routes/DesignSystem'));
const AuditLog = lazy(() => import('@/routes/AuditLog'));

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

/**
 * The front door, or the site.
 *
 * A stored session renders the site straight away; the server check runs behind
 * it and can send a reader back here if the token is genuinely dead. See
 * `useAuth` for why that is the right way round.
 */
function Gate() {
  const { status, signedIn } = useAuth();

  if (status === 'anonymous') {
    return (
      <Suspense fallback={null}>
        <Login onSignedIn={signedIn} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/sahayak" element={<Sahayak />} />
          {/* The product check. Reached from the header's primary button and the
              homepage introduction rather than the six-item navigation. */}
          <Route path="/assess" element={<Analyst />} />
          <Route path="/assess/steps" element={<Assessment />} />
          <Route path="/what-is-covered" element={<WhatIsCovered />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {import.meta.env.DEV ? <Route path="/design" element={<DesignSystem />} /> : null}
        {import.meta.env.DEV ? <Route path="/audit" element={<AuditLog />} /> : null}
      </Routes>
    </Suspense>
  );
}
