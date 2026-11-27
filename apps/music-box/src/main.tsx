import { Disc3, Grid2x2, Info, OctagonPause, Pin, SlidersHorizontal } from 'lucide-react';

import { mountApp } from '@x10/shared/runtime';

import { App } from './App';
import { config } from './app.config';
import './index.css';

const icons: Record<string, React.ReactNode> = {
  '/': <Disc3 size={16} />,
  '/pinning': <Pin size={16} />,
  '/comb': <SlidersHorizontal size={16} />,
  '/tuning-fork': <Grid2x2 size={16} />,
  '/stop': <OctagonPause size={16} />,
  '/about': <Info size={16} />,
};

mountApp(
  {
    ...config,
    nav: config.nav.map((item) => ({ ...item, icon: icons[item.to] })),
  },
  <App />,
);
