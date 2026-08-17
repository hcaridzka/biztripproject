import { useMemo, useState } from 'react';
import { ListChecks, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Button, Card, EmptyState, Input, StatusBadge } from './ui-shared';
import { formatDate } from '../lib/utils';

export function TripManagement() {
  const { profile } = useAuth();
  const { trips, deleteTrip, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visibleTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...trips]
      .filter((trip) => !q || [trip.requester_name, trip.spd_number, trip.purpose, trip.requester_pt, trip.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
      .sort((a, b) => String(b.created_at ?? b.departure_date).localeCompare(String(a.created_at ?? a.departure_date)));
  }, [trips, search]);

  if (profile?.role !== 'HR Manager') {
    return <Card className="p-6"><EmptyState title="Akses ditolak" message="Trip Management hanya dapat diakses HR Manager." /></Card>;
  }

  const handleDelete = async (id: string, requester: string) => {
    const confirmed = window.confirm(
      `Hapus trip ${requester} secara permanen?\n\nGunakan untuk data dummy, perjalanan batal, atau data yang memang tidak perlu dipertahankan. Semua data terkait trip juga akan dihapus.`
    );
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await deleteTrip(id);
      showToast('success', 'Trip berhasil dihapus permanen');
    } catch (e: any) {
      showToast('error', 'Gagal menghapus trip: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><ListChecks className="w-5 h-5" /></div>
        <div><h2 className="text-xl font-bold text-slate-900">Trip Management</h2><p className="text-sm text-slate-500">Kelola seluruh perjalanan dan hapus data dummy/batal secara permanen.</p></div>
      </div>

      <Card className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari requester, nomor SPD, PT, tujuan atau status..." className="pl-10" /></div></Card>

      {visibleTrips.length === 0 ? <Card className="p-6"><EmptyState title="Trip tidak ditemukan" /></Card> : (
        <div className="space-y-3">
          {visibleTrips.map((trip) => (
            <Card key={trip.id} className="p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-bold text-sm text-slate-800">{trip.requester_name}</span><StatusBadge status={trip.status} /></div>
                  <div className="text-xs text-slate-500 mt-1">{trip.spd_number || 'Belum ada nomor SPD'} · {trip.requester_pt || '-'} · {formatDate(trip.departure_date)} - {formatDate(trip.return_date)}</div>
                  <div className="text-xs text-slate-600 mt-2">{trip.purpose || '-'}</div>
                </div>
                <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} disabled={deletingId === trip.id} onClick={() => handleDelete(trip.id, trip.requester_name)}>{deletingId === trip.id ? 'Deleting...' : 'Delete Trip'}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
