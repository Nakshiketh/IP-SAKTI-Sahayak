import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { Shell } from '@/components/layout/Shell';
import About from '@/routes/About';
import Home from '@/routes/Home';
import HowItWorks from '@/routes/HowItWorks';
import NotFound from '@/routes/NotFound';
import Sahayak from '@/routes/Sahayak';
import Sources from '@/routes/Sources';
import WhatIsCovered from '@/routes/WhatIsCovered';

/**
 * Six routes and nothing else. No team page, no sponsors, no sub-navigation.
 *
 * /design is a development surface for the design system: it is not registered
 * in a production build, so it cannot be reached from a deployed site.
 */
const DesignSystem = lazy(() => import('@/routes/DesignSystem'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/sahayak" element={<Sahayak />} />
          <Route path="/what-is-covered" element={<WhatIsCovered />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {import.meta.env.DEV ? <Route path="/design" element={<DesignSystem />} /> : null}
      </Routes>
    </Suspense>
  );
}
