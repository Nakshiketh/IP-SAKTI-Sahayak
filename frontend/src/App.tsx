import { type ComponentType, lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { FEATURES } from '@/config/features';
import { Shell } from '@/components/layout/Shell';
import { i18n } from '@/i18n';
import { ensureNamespace } from '@/i18n/resources';
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
/**
 * A route and the words it renders arrive together.
 *
 * Each namespace below is loaded beside its own chunk rather than in the first
 * paint, so a reader downloads the copy for the page they opened and not the
 * copy for the nine they did not. The Suspense boundary these already sit
 * behind covers the wait, and nothing renders before its namespace is present
 * — which matters, because there is no backend to fetch a missing one and the
 * failure would show as dotted keys on screen.
 */
/**
 * More than one namespace, because a route can render a component that belongs
 * to another page. /assess is the case that proved it: the IP protection map
 * lives in `sahayak`, is rendered on the analyst route, and showed its raw
 * dotted keys on screen because only `analyst` had been fetched. A component
 * cannot declare this for itself — there is no backend to fetch a missing
 * namespace on demand, so it has to be in place before anything renders.
 */
function route<P>(
  load: () => Promise<{ default: ComponentType<P> }>,
  ...namespaces: string[]
) {
  return lazy<ComponentType<P>>(async () => {
    const [module] = await Promise.all([
      load(),
      ...namespaces.map((namespace) => ensureNamespace(namespace, i18n.language)),
    ]);
    return module;
  });
}

const Login = route(() => import('@/routes/Login'));
const Sahayak = route(() => import('@/routes/Sahayak'), 'sahayak');
const Assessment = route(() => import('@/routes/Assessment'), 'assessment');
// `sahayak` too: the protection map and the roadmap are rendered here.
const Analyst = route(() => import('@/routes/Analyst'), 'analyst', 'sahayak');
const WhatIsCovered = route(() => import('@/routes/WhatIsCovered'), 'covered');
const HowItWorks = route(() => import('@/routes/HowItWorks'), 'howitworks');
const Sources = route(() => import('@/routes/Sources'), 'sources');
const About = route(() => import('@/routes/About'));
const Privacy = route(() => import('@/routes/Privacy'), 'privacy');
const DesignSystem = route(() => import('@/routes/DesignSystem'));
const AuditLog = route(() => import('@/routes/AuditLog'));
const Insights = route(() => import('@/routes/Insights'));

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
          {/* Not in the navigation. It is for whoever runs the deployment, and
              the server refuses it for everyone else whether or not a link
              exists — the flag removes the route, and the allowlist decides
              who may read it. */}
          {FEATURES.adminInsights ? <Route path="/insights" element={<Insights />} /> : null}
          <Route path="*" element={<NotFound />} />
        </Route>
        {import.meta.env.DEV ? <Route path="/design" element={<DesignSystem />} /> : null}
        {import.meta.env.DEV ? <Route path="/audit" element={<AuditLog />} /> : null}
      </Routes>
    </Suspense>
  );
}
