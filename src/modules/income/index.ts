import { lazy } from 'react';
import type { ModuleManifest } from '../../core';
import { IncomeDashboardCard } from './IncomeDashboardCard';

export const manifest: ModuleManifest = {
  id: 'income',
  title: 'Einnahmen',
  path: '/einnahmen',
  Page: lazy(() => import('./IncomePage')),
  DashboardCard: IncomeDashboardCard,
};
