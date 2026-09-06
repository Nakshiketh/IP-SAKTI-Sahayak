import { Route, Routes } from 'react-router-dom';

/**
 * Phase 0 has no screens. Routes, shell, navigation and i18n arrive in Phase 2;
 * the design system in Phase 1. This placeholder exists so the app boots and the
 * router is wired.
 */
export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Scaffold />} />
    </Routes>
  );
}

function Scaffold() {
  return (
    <main>
      <h1>IP-SAKTI Sahayak</h1>
      <p>Scaffold. No screens yet.</p>
    </main>
  );
}
