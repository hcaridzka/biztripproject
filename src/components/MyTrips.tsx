import { useState, useMemo, useEffect } from 'react';
import { MapPin, FileText, RotateCcw, X, Calendar, CheckCircle2, Play, CalendarClock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, EmptyState, StatusBadge, Modal, Textarea, Field, formatIDR } from './ui-shared';
import { formatDate, daysBetween } from '../lib/utils';
import { TripDetail } from './TripDetail';
import { supabase } from '../lib/supabase';
import type { BizTrip } from '../lib/types';

export function MyTrips({ onPrint }: { onPrint: (id: string) => void }) {
  const { profile } = useAuth();
  const { trips, updateTrip, showToast, refresh } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTrip, setCancelTrip] = useState<BizTrip | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  
  const [rescheduleTrip, setRescheduleTrip] = useState<BizTrip | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');

  const myTrips = useMemo(() => trips.filter((t) => t.user_id === profile?.id), [trips, profile]);
  const selected = myTrips.find((t) => t.id === selectedId) ?? null;

  // Auto start-trip: if today >= departure date and status is Approved
  useEffect(() => {
    myTrips.forEach((t) => {
      if (t.status === 'Approved / Ready for Trip') {
        const today = new Date().toISOString().slice(0, 10);
        if (t.departure_date <= today) {
          updateTrip(t.id, { status: 'On Trip' });
          supabase.from('trip_tracking').insert({ 
            trip_id: t.id, 
            actor_name: 'System', 
            actor_role: 'System', 
            action: 'Auto Start Trip', 
            from_status: 'Approved / Ready for Trip', 
            to_status: 'On Trip', 
            remarks: 'Auto-activated by date' 
          });
        }
      }
    });
  }, [myTrips]);

  const requestReReview = async (t: BizTrip) => {
    const justification = window.prompt('Tulis justifikasi permintaan Re-Review:');
    if (!justification?.trim()) return;
    await updateTrip(t.id, { status: 'Pending Manager Approval', review_justification: justification, reject_reason: null });
    await supabase.from('trip_tracking').insert({ 
      trip_id: t.id, 
      actor_name: profile?.name ?? '', 
      actor_role: 'Employee', 
      action: 'Request Re-Review', 
      from_status: t.status, 
      to_status: 'Pending Manager Approval', 
      remarks: justification 
    });
    showToast('success', 'Re-Review diajukan');
    refresh();
  };

  const startTrip = async (t: BizTrip) => {
    await updateTrip(t.id, { status: 'On Trip' });
    await supabase.from('trip_tracking').insert({ 
      trip_id: t.id, 
      actor_name: profile?.name ?? '', 
      actor_role: 'Employee', 
      action: 'Start Trip', 
      from_status: 'Approved / Ready for Trip', 
      to_status: 'On Trip' 
    });
    showToast('success', 'Trip dimulai');
    refresh();
  };

  const doCancel = async () => {
    if (!cancelTrip || !cancelReason.trim()) { 
      showToast('error', 'Catatan alasan wajib diisi'); 
      return; 
    }
    await updateTrip(cancelTrip.id, { 
      status: 'Rejected', 
      cancel_reason_category: 'Cancel', 
      cancel_reason_detail: cancelReason, 
      reject_reason: `Cancelled by Employee: ${cancelReason}` 
    });
    await supabase.from('trip_tracking').insert({ 
      trip_id: cancelTrip.id, 
      actor_name: profile?.name ?? '', 
      actor_role: 'Employee', 
      action: 'Cancel Trip', 
      from_status: cancelTrip.status, 
      to_status: 'Rejected', 
      remarks: cancelReason 
    });
    showToast('success', 'Pengajuan berhasil dibatalkan');
    setCancelTrip(null); 
    setCancelReason('');
    refresh();
  };

  const doReschedule = async () => {
    if (!rescheduleTrip || !rescheduleReason.trim()) { 
      showToast('error', 'Catatan alasan reschedule wajib diisi'); 
      return; 
    }
    await updateTrip(rescheduleTrip.id, { 
      status: 'Pending Manager Approval', 
      cancel_reason_category: 'Reschedule', 
      cancel_reason_detail: rescheduleReason, 
      review_justification: `Permohonan Reschedule: ${rescheduleReason}` 
    });
    await supabase.from('trip_tracking').insert({ 
      trip_id: rescheduleTrip.id, 
      actor_name: profile?.name ?? '', 
      actor_role: 'Employee', 
      action: 'Reschedule Request', 
      from_status: rescheduleTrip.status, 
      to_status: 'Pending Manager Approval', 
      remarks: rescheduleReason 
    });
    showToast('success', 'Permohonan reschedule dikirim ke Manager');
    setRescheduleTrip(null); 
    setRescheduleReason('');
    refresh();
  };

  if (selected) {
    const canCancel = !['Completed', 'Rejected'].includes(selected.status);
    return (
      <div className="space-y-4 max-w-4xl mx-auto animate-slide-up">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={() => setSelectedId(null)}>← Back</Button>
          <div className="flex gap-2">
            {selected.status === 'Approved / Ready for Trip' && (
              <Button size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={() => startTrip(selected)}>Start Trip</Button>
            )}
            {canCancel && (
              <>
                <Button size="sm" variant="secondary" icon={<CalendarClock className="w-3.5 h-3.5" />} onClick={() => { setRescheduleTrip(selected); setRescheduleReason(''); }}>Reschedule</Button>
                <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setCancelTrip(selected); setCancelReason(''); }}>Cancel Trip</Button>
              </>
            )}
          </div>
        </div>
        <TripDetail trip={selected} onPrint={onPrint} />
        {selected.status === 'Rejected' && (
          <Card className="p-4">
            <Button size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => requestReReview(selected)}>Request Re-Review</Button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><MapPin className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Trips</h2>
          <p className="text-sm text-slate-500">{myTrips.length} pengajuan dinas</p>
        </div>
      </div>

      {myTrips.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<MapPin className="w-6 h-6" />} title="Belum ada trip" message="Buat pengajuan dinas baru untuk memulai." /></Card>
      ) : (
        <div className="space-y-2">
          {myTrips.map((t) => {
            const canCancel = !['Completed', 'Rejected'].includes(t.status);
            return (
              <Card key={t.id} className="p-4 hover:ring-brand-200 transition cursor-pointer">
                <div className="flex items-start justify-between gap-4" onClick={() => setSelectedId(t.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.origin} → {t.itinerary?.[0]?.destination ?? '-'} · {formatDate(t.departure_date)} · {daysBetween(t.departure_date, t.return_date)} hari · {formatIDR(Number(t.cost_grand_total) || 0)}</div>
                    {t.employee_remarks && <div className="text-[11px] text-slate-500 mt-1">Remarks: {t.employee_remarks}</div>}
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-3 flex gap-2 flex-wrap items-center">
                  {t.status === 'Approved / Ready for Trip' && (
                    <Button size="sm" icon={<Play className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); startTrip(t); }}>Start Trip</Button>
                  )}
                  {t.status === 'Rejected' && (
                    <Button size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); requestReReview(t); }}>Re-Review</Button>
                  )}
                  {(t.status === 'Approved / Ready for Trip' || t.status === 'On Trip' || t.status === 'Completed') && (
                    <Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); onPrint(t.id); }}>Cetak PDF</Button>
                  )}
                  {canCancel && (
                    <>
                      <Button size="sm" variant="secondary" icon={<CalendarClock className="w-3.5 h-3.5 text-brand-600" />} onClick={(e) => { e.stopPropagation(); setRescheduleTrip(t); setRescheduleReason(''); }}>Reschedule</Button>
                      <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={(e) => { e.stopPropagation(); setCancelTrip(t); setCancelReason(''); }}>Cancel Trip</Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancel modal */}
      <Modal open={!!cancelTrip} onClose={() => setCancelTrip(null)} title="Cancel Request">
        <div className="space-y-4">
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-700">
            Anda akan membatalkan pengajuan: <strong>{cancelTrip?.purpose}</strong>
          </div>
          <Field label="Catatan Alasan Pembatalan" required>
            <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Jelaskan alasan pembatalan..." />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setCancelTrip(null)}>Batal</Button>
            <Button variant="danger" size="sm" icon={<X className="w-3.5 h-3.5" />} onClick={doCancel}>Confirm Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Reschedule modal */}
      <Modal open={!!rescheduleTrip} onClose={() => setRescheduleTrip(null)} title="Reschedule Request">
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-800">
            Anda akan mengajukan penjadwalan ulang (Reschedule): <strong>{rescheduleTrip?.purpose}</strong>
          </div>
          <Field label="Catatan & Usulan Tanggal Baru Reschedule" required>
            <Textarea rows={3} value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} placeholder="Jelaskan detail usulan jadwal baru..." />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setRescheduleTrip(null)}>Batal</Button>
            <Button variant="primary" size="sm" icon={<CalendarClock className="w-3.5 h-3.5" />} onClick={doReschedule}>Submit Reschedule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

void Calendar; void CheckCircle2;
