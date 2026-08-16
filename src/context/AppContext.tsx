import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { BizTrip, DisburseRow, SettlementClaimRow, SettlementReceipt, Vehicle, Driver, TripTracking } from '../lib/types';

interface Toast { id: string; type: 'success' | 'error' | 'info'; message: string; }

interface AppCtx {
  trips: BizTrip[];
  disburseRows: DisburseRow[];
  settlementClaimRows: SettlementClaimRow[];
  settlementReceipts: SettlementReceipt[];
  vehicles: Vehicle[];
  drivers: Driver[];
  tracking: TripTracking[];
  toasts: Toast[];
  loading: boolean;
  refresh: () => Promise<void>;
  updateTrip: (id: string, patch: Partial<BizTrip>) => Promise<void>;
  setTripStatus: (id: string, status: BizTrip['status'], remarks?: string) => Promise<void>;
  showToast: (type: Toast['type'], message: string) => void;
  dismissToast: (id: string) => void;
  deleteTrip: (id: string) => Promise<void>;
}

const Ctx = createContext<AppCtx>({} as any);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [trips, setTrips] = useState<BizTrip[]>([]);
  const [disburseRows, setDisburseRows] = useState<DisburseRow[]>([]);
  const [settlementClaimRows, setSettlementClaimRows] = useState<SettlementClaimRow[]>([]);
  const [settlementReceipts, setSettlementReceipts] = useState<SettlementReceipt[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tracking, setTracking] = useState<TripTracking[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(true);

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d, scr, sr, v, dr, tr] = await Promise.all([
        supabase.from('biz_trips').select('*').order('created_at', { ascending: false }),
        supabase.from('disburse_rows').select('*').order('sort_order', { ascending: true }),
        supabase.from('settlement_claim_rows').select('*').order('sort_order', { ascending: true }),
        supabase.from('settlement_receipts').select('*').order('created_at', { ascending: false }),
        supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
        supabase.from('drivers').select('*').order('created_at', { ascending: false }),
        supabase.from('trip_tracking').select('*').order('created_at', { ascending: false }),
      ]);
      setTrips((t.data ?? []) as BizTrip[]);
      setDisburseRows((d.data ?? []) as DisburseRow[]);
      setSettlementClaimRows((scr.data ?? []) as SettlementClaimRow[]);
      setSettlementReceipts((sr.data ?? []) as SettlementReceipt[]);
      setVehicles((v.data ?? []) as Vehicle[]);
      setDrivers((dr.data ?? []) as Driver[]);
      setTracking((tr.data ?? []) as TripTracking[]);
    } catch (e) {
      console.error('refresh error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTrip = useCallback(async (id: string, patch: Partial<BizTrip>) => {
    const { error } = await supabase.from('biz_trips').update(patch).eq('id', id);
    if (error) throw error;
    setTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const deleteTrip = useCallback(async (id: string) => {
  const { error } = await supabase.from('biz_trips').delete().eq('id', id);
  if (error) throw error;
  setTrips((prev) => prev.filter((t) => t.id !== id));
}, []);

  const setTripStatus = useCallback(async (id: string, status: BizTrip['status'], remarks?: string) => {
    const trip = trips.find((t) => t.id === id);
    if (!trip) return;
    const patch: Partial<BizTrip> = { status };
    if (status === 'Approved / Ready for Trip') patch.approved_at = new Date().toISOString();
    if (status === 'Completed') patch.completed_at = new Date().toISOString();
    await updateTrip(id, patch);
    await supabase.from('trip_tracking').insert({
      trip_id: id,
      actor_name: trip.requester_name,
      action: `Status changed to ${status}`,
      from_status: trip.status,
      to_status: status,
      remarks: remarks ?? null,
    });
  }, [trips, updateTrip]);

  return (
  <Ctx.Provider value={{
    trips, disburseRows, settlementClaimRows, settlementReceipts, vehicles, drivers,
    tracking, toasts, loading, refresh, updateTrip, setTripStatus, deleteTrip, showToast, dismissToast,
  }}>
    {children}
  </Ctx.Provider>
  );
}
