import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { Login } from './components/Login';
import { Layout, ViewKey } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { RequestForm } from './components/RequestForm';
import { MyTrips } from './components/MyTrips';
import { ApprovalDashboard } from './components/ApprovalDashboard';
import { PicObligo } from './components/PicObligo';
import { CostCalculation } from './components/CostCalculation';
import { SettlementForm } from './components/SettlementForm';
import { SettlementReview } from './components/SettlementReview';
import { SummaryExport } from './components/SummaryExport';
import { UserManagement } from './components/UserManagement';
import { FleetManagement } from './components/FleetManagement';
import { TripManagement } from './components/TripManagement';
import { PdfPrint } from './components/PdfPrint';
import { ToastHost } from './components/ui-shared';
import { AccountSettings } from './components/AccountSettings';
import { MatrixManagement } from './components/MatrixManagement';

function Shell() {
  const { profile, loading } = useAuth();
  const { toasts, dismissToast, refresh } = useApp();
  const [view, setView] = useState<ViewKey>('dashboard');
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [printTrip, setPrintTrip] = useState<{ id: string; mode: 'advance' | 'settlement' } | null>(null);

  useEffect(() => {
    if (profile) refresh();
  }, [profile, refresh]);

  useEffect(() => {
    const handleSettlementEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string }>;
      const id = customEvent.detail?.id;
      if (id) setPrintTrip({ id, mode: 'settlement' });
    };

    window.addEventListener('biztrip:print-settlement', handleSettlementEvent);
    return () => window.removeEventListener('biztrip:print-settlement', handleSettlementEvent);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <Login />
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const handlePrint = (id: string) => setPrintTrip({ id, mode: 'advance' });
  const handleSettlementPrint = (id: string) => setPrintTrip({ id, mode: 'settlement' });

  return (
    <>
      <Layout view={view} setView={setView}>
        {view === 'dashboard' && <Dashboard setView={setView} setSelectedTrip={setSelectedTrip} />}
        {view === 'new-request' && <RequestForm onDone={() => setView('my-trips')} />}
        {view === 'my-trips' && <MyTrips onPrint={handlePrint} selectedTripId={selectedTrip} />}
        {view === 'approval' && <ApprovalDashboard setSelectedTrip={setSelectedTrip} setView={setView} />}
        {view === 'pic-obligo' && <PicObligo selectedTripId={selectedTrip} />}
        {view === 'cost-review' && <CostCalculation onPrint={handlePrint} selectedTripId={selectedTrip} />}
        {view === 'settlement' && <SettlementForm setSelectedTrip={setSelectedTrip} />}
        {view === 'settlement-review' && <SettlementReview onPrint={handleSettlementPrint} />}
        {view === 'trip-management' && <TripManagement />}
        {view === 'summary' && <SummaryExport />}
        {view === 'user-management' && <UserManagement />}
        {view === 'matrix-management' && <MatrixManagement />}
        {view === 'account' && <AccountSettings />}
        {view === 'vehicles' && <FleetManagement />}
      </Layout>

      {printTrip && (
        <PdfPrint
          tripId={printTrip.id}
          mode={printTrip.mode}
          onClose={() => setPrintTrip(null)}
        />
      )}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </AuthProvider>
  );
}
