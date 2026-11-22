import { createElement, lazy, type ComponentType } from 'react';
import type { ModuleManifest, YearMonth } from '../core';

function createPlaceholderPage(title: string, stage: string): ComponentType {
  return function PlaceholderPage() {
    return createElement(
      'section',
      { className: 'rounded-2xl border border-slate-200 bg-white p-6 shadow-xs' },
      createElement(
        'span',
        { className: 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600' },
        stage,
      ),
      createElement('h2', { className: 'mt-2 text-lg font-semibold text-slate-900' }, title),
      createElement('p', { className: 'mt-1 text-sm text-slate-500' }, 'Dieses Modul wird in Phase 2 implementiert.'),
    );
  };
}

function createPlaceholderCard(title: string, stage: string): ComponentType<{ month: YearMonth }> {
  return function PlaceholderCard({ month }) {
    return createElement(
      'div',
      { className: 'rounded-2xl border border-slate-200 bg-white p-4 shadow-xs' },
      createElement(
        'div',
        { className: 'flex items-center justify-between' },
        createElement('h3', { className: 'text-sm font-semibold text-slate-900' }, title),
        createElement('span', { className: 'text-xs text-slate-400' }, stage),
      ),
      createElement('p', { className: 'mt-2 text-xs text-slate-500' }, `Platzhalter für ${month} – wird in Phase 2 aktiviert.`),
    );
  };
}

export const modules: ModuleManifest[] = [
  {
    id: 'ideas',
    title: 'Ideen',
    path: '/ideen',
    Page: lazy(() => Promise.resolve({ default: createPlaceholderPage('Ideen-Sammler', 'Stufe 1') })),
    DashboardCard: createPlaceholderCard('Ideen-Sammler', 'Stufe 1'),
  },
  {
    id: 'income',
    title: 'Einnahmen',
    path: '/einnahmen',
    Page: lazy(() => Promise.resolve({ default: createPlaceholderPage('Einkommens-Tracker', 'Stufe 2') })),
    DashboardCard: createPlaceholderCard('Einnahmen diesen Monat', 'Stufe 2'),
  },
  {
    id: 'fixedCosts',
    title: 'Abos',
    path: '/abos',
    Page: lazy(() => Promise.resolve({ default: createPlaceholderPage('Abo-Gegenfinanzierer', 'Stufe 3') })),
    DashboardCard: createPlaceholderCard('Abo-Gegenfinanzierer', 'Stufe 3'),
  },
  {
    id: 'debts',
    title: 'Schulden',
    path: '/schulden',
    Page: lazy(() => Promise.resolve({ default: createPlaceholderPage('Schuldentilger', 'Stufe 4') })),
    DashboardCard: createPlaceholderCard('Schuldentilger', 'Stufe 4'),
  },
];
