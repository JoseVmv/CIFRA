import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { FinanceProvider } from './context/FinanceContext';
import { ToastProvider } from './context/ToastContext';
import { TransactionDialogProvider } from './context/TransactionDialogContext';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { TransactionsPage } from './pages/TransactionsPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <FinanceProvider>
          <TransactionDialogProvider>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transacoes" element={<TransactionsPage />} />
                <Route path="/analises" element={<AnalyticsPage />} />
                <Route path="/usuario" element={<ProfilePage />} />
                <Route path="/ajustes" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </TransactionDialogProvider>
        </FinanceProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
