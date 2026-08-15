import { useState, useMemo } from 'react';
import { CheckSquare, MapPin, Check, X, RotateCcw, MessageSquare, Filter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Select, Field, Textarea, EmptyState, StatusBadge, Modal, formatIDR } from './ui-shared';
import { PT_OPTIONS } from '../lib/constants';
import { cn, formatDate, daysBetween } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip, TripStatus } from '../lib/types';
import type { ViewKey } from './Layout';

export function ApprovalDashboard({ setSelectedTrip, setView }: { setSelectedTrip: (id: string) => void; setView: (v: ViewKey) => void }) {
  const { profile } = useAuth();
  const { trips, updateTrip, showToast, refresh } = useApp();
  const [ptFilter, setPtFilter] = useState('');
  const [rejectTrip, setRejectTrip] = useState<BizTrip | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selected, setSelected] = useState<BizTrip | null>(null);

  const role = profile?.role ?? 'Employee';
  const ptAccess = profile?.pt_access ?? [];
  const isHR = role === 'HR Manager';
  const isSuperAdmin = profile?.is_super_admin === true || isHR;

  const ptMatches = (t: BizTrip) => isSuperAdmin || ptAccess.length === 0 || t.company_burden.some((b) => ptAccess.includes(b));
  const ptFilterMatches = (t: BizTrip) => !ptFilter || t.company_burden.includes(ptFilter);

  const queue = useMemo(() => {
    let list: BizTrip[];
    if (role === 'Manager') list = trips.filter((t) => (t.status === 'Pending Manager Approval') && ptMatches(t));
    else if (role === 'Direksi') list = trips.filter((t) => (t.status === 'Pending Direksi Approval') && ptMatches(t));
    else if (role === 'HR Manager') list = trips.filter((t) => ['Pending Manager Approval', 'Pending Direksi Approval', 'Pending HR Advance Review'].includes(t.status));
    else list = [];
    return list.filter(ptFilterMatches);
  }, [trips, role, ptFilter]);

  const ptFilterOptions = useMemo(() => {
    const set = new Set<string>(isSuperAdmin ? PT_OPTIONS : ptAccess);
    trips.forEach((t) => t.company_burden.forEach((b) => set.add(b)));
    return Array.from(set).sort();
  }, [isSuperAdmin, ptAccess, trips]);

  const approve = async (t: BizTrip) => {
    try {
      let nextStatus: TripStatus = t.status;
      const patch: Partial<BizTrip> = {};
      if (t.status === 'Pending Manager Approval') {
        nextStatus = 'Pending PIC Obligo';
        patch.manager_approved_by = profile?.name ?? '';
        patch.manager_approved_at = new Date().toISOString();
      } else if (t.status === 'Pending Direksi Approval') {
        nextStatus = 'Pending HR Advance Review';
        patch.direksi_approved_by = profile?.name ?? '';
        patch.direksi_approved_at = new Date().toISOString();
      }
      patch.status = nextStatus;
      await updateTrip(t.id, patch);
      await supabase.from('trip_tracking').insert({ trip_id: t.id, actor_name: profile?.name ?? '', actor_role: role, action: `Approved -> ${nextStatus}`, from_status: t.status, to_status: nextStatus });
      showToast('success', 'Pengajuan disetujui');
      refresh();
      setSelected(null);
    } catch (e: any) { showToast('error', 'Gagal approve: ' + e.message); }
  };

  const doReject = async () => {
    if (!rejectTrip || !rejectReason.trim()) { showToast('error', 'Remarks alasan reject wajib diisi'); return; }
    try {
      await updateTrip(rejectTrip.id, {
        status: 'Rejected',
        reject_reason: rejectReason,
        reject_by: profile?.name ?? '',
        rejection_stage: rejectTrip.status,
      });
      await supabase.from('trip_tracking').insert({ trip_id: rejectTrip.id, actor_name: profile?.name ?? '', actor_role: role, action: 'Rejected', from_status: rejectTrip.status, to_status: 'Rejected', remarks: rejectReason });
      showToast('success', 'Pengajuan ditolak dengan remarks');
      setRejectTrip(null);
      setRejectReason('');
      setSelected(null);
      refresh();
    } catch (e: any) { showToast('error', 'Gagal reject: ' + e.message); }
  };

  const requestReReview = async (t: BizTrip) => {
    const justification = window.prompt('Tulis justifikasi permintaan Re-Review:');
    if (!justification?.trim()) return;
    try {
      await updateTrip(t.id, { status: 'Pending Manager Approval', review_justification: justification, reject_reason: null });
      await supabase.from('trip_tracking').insert({ trip_id: t.id, actor_name: profile?.name ?? '', actor_role: role, action: 'Request Re-Review', from_status: t.status, to_status: 'Pending Manager Approval', remarks: justification });
      showToast('success', 'Re-Review diajukan');
      refresh();
    } catch (e: any) { showToast('error', 'Gagal: ' + e.message); }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><CheckSquare className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Approval Queue</h2>
          <p className="text-sm text-slate-500">{role} · {queue.length} pengajuan menunggu</p>
        </div>
      </div>

      {/* PT Filter */}
      {(role === 'Manager' || role === 'Direksi') && ptFilterOptions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 shrink-0">
              <Filter className="w-4 h-4 text-brand-600" /> Pilih PT:
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPtFilter('')} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', !ptFilter ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>Semua PT</button>
              {ptFilterOptions.map((pt) => (
                <button key={pt} onClick={() => setPtFilter(pt)} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', ptFilter === pt ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{pt}</button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Queue list */}
      <Card className="p-6">
        {queue.length === 0 ? (
          <EmptyState icon={<CheckSquare className="w-6 h-6" />} title="Tidak ada pengajuan menunggu" message="Antrean approval kosong untuk PT filter ini." />
        ) : (
          <div className="space-y-2">
            {queue.map((t) => (
              <div key={t.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-brand-200 transition p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelected(t); setSelectedTrip(t.id); }}>
                    <div className="text-sm font-semibold text-slate-800 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Pegawai Pemohon: {t.requester_name} · {t.origin} → {t.itinerary?.[0]?.destination ?? '-'} · {formatDate(t.departure_date)} · {daysBetween(t.departure_date, t.return_date)} hari</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.company_burden.map((pt) => <span key={pt} className="px-2 py-0.5 rounded-lg bg-brand-50 text-brand-700 text-[11px] font-bold">{pt}</span>)}
                    </div>
                    <div className="text-xs font-bold text-slate-700 mt-1">Estimasi Grand Total: {formatIDR(Number(t.cost_grand_total) || 0)}</div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => approve(t)}>Approve</Button>
                  <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setRejectTrip(t); setRejectReason(''); }}>Reject</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setSelected(t); setSelectedTrip(t.id); }}>Detail</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Selected detail */}
      {selected && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800">Detail Pengajuan</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">Tutup</button>
          </div>
          <div className="space-y-3 text-sm">
            <DetailRow label="Pegawai Pemohon" value={`${selected.requester_name} (${selected.requester_jabatan})`} />
            <DetailRow label="Tujuan" value={selected.purpose} />
            <DetailRow label="Itinerary" value={selected.itinerary?.map((l) => `${l.destination}${l.destination_custom ? ` (${l.destination_custom})` : ''}`).join(' → ') ?? '-'} />
            <DetailRow label="Partisipan" value={selected.participants?.map((p) => `${p.name} (${p.jabatan})`).join(', ') ?? '-'} />
            <DetailRow label="Estimasi Grand Total" value={formatIDR(Number(selected.cost_grand_total) || 0)} />
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => approve(selected)}>Approve</Button>
            <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setRejectTrip(selected); setRejectReason(''); }}>Reject</Button>
            {selected.status === 'Rejected' && <Button size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => requestReReview(selected)}>Request Re-Review</Button>}
          </div>
        </Card>
      )}

      {/* Reject modal */}
      <Modal open={!!rejectTrip} onClose={() => setRejectTrip(null)} title="Reject Pengajuan" size="sm">
        <div className="space-y-4">
          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-700">
            Anda akan menolak pengajuan: <strong>{rejectTrip?.purpose}</strong>
          </div>
          <Field label="Remarks Alasan Reject" required>
            <Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Tulis alasan penolakan dengan jelas..." />
          </Field>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setRejectTrip(null)}>Cancel</Button>
            <Button variant="danger" size="sm" icon={<X className="w-3.5 h-3.5" />} onClick={doReject}>Confirm Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <span className="text-xs text-slate-400 font-semibold">{label}</span>
      <span className="col-span-2 text-sm text-slate-700">{value}</span>
    </div>
  );
}

void MapPin; void MessageSquare;
