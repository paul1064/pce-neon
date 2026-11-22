import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MonthProvider, ensureSettings } from '../core';
import { DashboardPage } from './DashboardPage';
import { Layout } from './Layout';
import { SettingsPage } from './SettingsPage';
import { initPwaListeners, requestPersistentStorage } from './pwa';
import { modules } from './registry';

function ModuleLoadingFallback() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
      Modul wird geladen …
    </div>
  );
}

export function App() {
  useEffect(() => {
    initPwaListeners();
    void ensureSettings();
    void requestPersistentStorage();
  }, []);

  return (
    <BrowserRouter>
      <MonthProvider>
        <Layout>
          <Suspense fallback={<ModuleLoadingFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/einstellungen" element={<SettingsPage />} />
              {modules.map((mod) => {
                const Page = mod.Page;
                return <Route key={mod.id} path={mod.path} element={<Page />} />;
              })}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </MonthProvider>
    </BrowserRouter>
  );
}
