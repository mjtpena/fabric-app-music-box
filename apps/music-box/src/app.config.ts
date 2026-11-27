/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-lead-morgan', name: 'Morgan Chen', email: 'morgan@example.com', isAdmin: true, role: 'Messaging lead' },
  { sub: 'demo-owner-dana', name: 'Dana Patel', email: 'dana@example.com', isAdmin: false, role: 'Campaign owner' },
  { sub: 'demo-viewer-riley', name: 'Riley Brooks', email: 'riley@example.com', isAdmin: false, role: 'Viewer' },
];

export const config: AppConfig<Schema> = {
  appId: 'music-box',
  title: 'Music Box',
  tagline: 'Shared campaign send calendar, fatigue caps & quiet-hour guard',
  accent: 'plum',
  logoPaths: [
    'M4 8C4 6.3 7.6 5 12 5C16.4 5 20 6.3 20 8V14C20 15.7 16.4 17 12 17C7.6 17 4 15.7 4 14V8Z',
    'M4 8C4 9.7 7.6 11 12 11C16.4 11 20 9.7 20 8',
    'M8 17V21M12 17V21M16 17V21',
    'M9 13H9.01M14 14H14.01M16 12H16.01',
  ],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Cylinder', end: true },
    { to: '/pinning', label: 'Pinning' },
    { to: '/comb', label: 'Comb' },
    { to: '/tuning-fork', label: 'Tuning fork' },
    { to: '/stop', label: 'Stop' },
    { to: '/about', label: 'About' },
  ],
};
