import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { CombPage } from './pages/CombPage';
import { HomePage } from './pages/HomePage';
import { PinningPage } from './pages/PinningPage';
import { StopPage } from './pages/StopPage';
import { TuningForkPage } from './pages/TuningForkPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell immersive><HomePage /></AppShell>} />
      <Route path="/pinning" element={<AppShell><PinningPage /></AppShell>} />
      <Route path="/comb" element={<AppShell><CombPage /></AppShell>} />
      <Route path="/tuning-fork" element={<AppShell><TuningForkPage /></AppShell>} />
      <Route path="/stop" element={<AppShell><StopPage /></AppShell>} />
      <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
