import { useState, useMemo } from 'react';
import { CheckSquare, MapPin, Check, X, RotateCcw, MessageSquare, Filter, Trash2 } from 'lucide-react';
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
  const { trips, updateTrip, deleteTrip, showToast, refresh } = useApp();
  const [ptFilter, setPtFilter] = useState('');
  const [rejectTrip, setRejectTrip] = useState<BizTrip | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selected, setSelected] = useState<BizTrip | null>(null);

  const role = profile?.role ?? 'Employee';
  const ptAccess = profile?.pt_access ?? [];
  const isHR = role === 'HR Manager';
  const isSuperAdmin = profile?.is_super_admin === true || isHR;

  // Fungsi untuk menghapus pengajuan trip
  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pengajuan trip ini?')) return;
    try {
      await deleteTrip(id);
      showToast('success', 'Pengajuan trip berhasil dihapus');
      if (selected?.id === id) setSelected(null);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal menghapus: ' + e.message);
    }
  };

  const ptMatches = (t: BizTrip) => isSuperAdmin || ptAccess.length === 0 || t.company_burden.some((b) => ptAccess.includes(b));
  const ptFilterMatches = (t: BizTrip) => !ptFilter || t.company_burden.includes(ptFilter);

  // Perbaikan antrean: Manager hanya memproses Pending Manager, Direksi hanya Pending Direksi
  const queue = useMemo(() => {
    let list: BizTrip[];
    if (role === 'Manager') {
      list = trips.filter((t) => t.status === 'Pending Manager Approval' && ptMatches(t));
    } else if (role === 'Direksi') {
      list = trips.filter((t) => t.status === 'Pending Direksi Approval' && ptMatches(t));
    } else if (role === 'HR Manager') {
      // HR Manager dapat memantau seluruh tahapan review
      list = trips.filter((t) => ['Pending Manager Approval', 'Pending PIC Obligo', 'Pending Direksi Approval', 'Pending HR Advance Review'].includes(t.status) && ptMatches(t));
    } else {
      list = [];
    }
    return list.filter(ptFilterMatches);
  }, [trips, role, ptFilter, ptAccess, isSuperAdmin]);

  const ptFilterOptions = useMemo(() => {
    const set = new Set<string>(isSuperAdmin ? PT_OPTIONS : ptAccess);
    trips.forEach((t) => t.company_burden.forEach((b) => set.add(b)));
    return Array.from(set).sort();
  }, [isSuperAdmin, ptAccess, trips]);

  const approve = async (t: BizTrip) => {
    try {
      let nextStatus: TripStatus = t.status;
      const patch: Partial<BizTrip> = {};

      // Evaluasi apakah trip butuh kendaraan atau driver
      const requiresObligo = t.requires_vehicle === true || t.needs_vehicle === true || t.requires_driver === true || t.needs_driver === true;

      if (t.status === 'Pending Manager Approval') {
        // Jika butuh kendaraan/driver -> Wajib ke Pending PIC Obligo. Jika tidak -> Langsung ke Direksi.
        nextStatus = requiresObligo ? 'Pending PIC Obligo' : 'Pending Direksi Approval';
        patch.manager_approved_by = profile?.name ?? '';
        patch.manager_approved_at = new Date().toISOString();
      } else if (t.status === 'Pending Direksi Approval') {
        // Dari Direksi -> Lanjut ke HR Review
        nextStatus = 'Pending HR Advance Review';
        patch.direksi_approved_by = profile?.name ?? '';
        patch.direksi_approved_at = new Date().toISOString();
      } else if (t.status === 'Pending HR Advance Review' && role === 'HR Manager') {
        // Dari HR Manager -> Siap Berangkat
        nextStatus = 'Approved / Ready for Trip';
        patch.hr_approved_by = profile?.name ?? '';
        patch.hr_approved_at = new Date().toISOString();
      }

      patch.status = nextStatus;
      await updateTrip(t.id, patch);
      await supabase.from('trip_tracking').insert({ 
        trip_id: t.id, 
        actor_name: profile?.name ?? '', 
        actor_role: role, 
        action: `Approved -> ${nextStatus}`, 
        from_status: t.status, 
        to_status: nextStatus 
      });

      showToast('success', 'Pengajuan berhasil disetujui');
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
      await supabase.from('trip_tracking').insert({ 
        trip_id: rejectTrip.id, 
        actor_name: profile?.name ?? '', 
        actor_role: role, 
        action: 'Rejected', 
        from_status: rejectTrip.status, 
        to_status: 'Rejected', 
        remarks: rejectReason 
      });
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
      await supabase.from('trip_tracking').insert({ 
        trip_id: t.id, 
        actor_name: profile?.name ?? '', 
        actor_role: role, 
        action: 'Request Re-Review', 
        from_status: t.status, 
        to_status: 'Pending Manager Approval', 
        remarks: justification 
      });
      showToast('success', 'Re-Review diajukan');
      refresh();
    } catch (e: any) { showToast('error', 'Gagal: ' + e.message); }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <CheckSquare className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Approval Queue</h2>
          <p className="text-sm text-slate-500">{role} · {queue.length} pengajuan menunggu</p>
        </div>
      </div>

      {/* PT Filter */}
      {(role === 'Manager' || role === 'Direksi' || role === 'HR Manager') && ptFilterOptions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 shrink-0">
              <Filter className="w-4 h-4 text-brand-600" /> Pilih PT:
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setPtFilter('')} 
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', !ptFilter ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}
              >
                Semua PT
              </button>
              {ptFilterOptions.map((pt) => (
                <button 
                  key={pt} 
                  onClick={() => setPtFilter(pt)} 
                  className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', ptFilter === pt ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}
                >
                  {pt}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Queue list */}
      <Card className="p-6">
        {queue.length === 0 ? (
          <EmptyState icon={<CheckSquare className="w-6 h-6" />} title="Tidak ada pengajuan menunggu" message="Antrean approval kosong untuk filter ini." />
        ) : (
          <div className="space-y-3">
            {queue.map((t) => (
              <div key={t.id} className="rounded-xl ring-1 ring-slate-200 hover:ring-brand-400 transition p-4 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setSelected(t); setSelectedTrip(t.id); }}>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-base font-extrabold text-slate-900">{t.requester_name}</span>
                      <span className="text-xs font-medium text-slate-500">({t.requester_jabatan ?? 'Pegawai Pemohon'})</span>
                      <div className="flex flex-wrap gap-1 ml-1">
                        {t.company_burden.map((pt) => (
                          <span key={pt} className="px-2.5 py-0.5 rounded-md bg-brand-100 text-brand-800 text-xs font-black border border-brand-300">{pt}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-700 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.origin} → {t.itinerary?.[0]?.destination ?? '-'} · {formatDate(t.departure_date)} · {daysBetween(t.departure_date, t.return_date)} hari
                    </div>
                    <div className="text-xs font-bold text-brand-700 mt-2 bg-brand-50/60 inline-block px-2.5 py-1 rounded-md border border-brand-200">
                      Estimasi Grand Total: {formatIDR(Number(t.cost_grand_total) || 0)}
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => approve(t)}>Approve</Button>
                  <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setRejectTrip(t); setRejectReason(''); }}>Reject</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setSelected(t); setSelectedTrip(t.id); }}>Detail</Button>
                  {isHR && (
                    <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => handleDelete(t.id)}>
                      Hapus
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Selected detail */}
      {selected && (
        <Card className="p-6 ring-2 ring-brand-500">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Detail Pengajuan Dinas</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs font-semibold">Tutup</button>
          </div>
          <div className="space-y-3 text-sm">
            <DetailRow label="Pegawai Pemohon" value={`${selected.requester_name} (${selected.requester_jabatan ?? 'Pegawai'})`} isBold />
            <DetailRow label="Unit PT Beban" value={selected.company_burden.join(', ')} isBold />
            <DetailRow label="Keperluan / Tujuan" value={selected.purpose} />
            <DetailRow label="Rute Itinerary" value={selected.itinerary?.map((l) => `${l.destination}${l.destination_custom ? ` (${l.destination_custom})` : ''}`).join(' → ') ?? '-'} />
            <DetailRow label="Estimasi Grand Total" value={formatIDR(Number(selected.cost_grand_total) || 0)} isBold />
          </div>
          <div className="flex gap-2 mt-5 pt-3 border-t border-slate-100">
            <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => approve(selected)}>Approve</Button>
            <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setRejectTrip(selected); setRejectReason(''); }}>Reject</Button>
            {selected.status === 'Rejected' && <Button size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => requestReReview(selected)}>Request Re-Review</Button>}
            {isHR && (
              <Button size="sm" variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => handleDelete(selected.id)}>
                Hapus Trip
              </Button>
            )}
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

function DetailRow({ label, value, isBold }: { label: string; value: string; isBold?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <span className="text-xs text-slate-500 font-semibold">{label}</span>
      <span className={cn('col-span-2 text-sm text-slate-800', isBold && 'font-extrabold text-slate-900')}>{value}</span>
    </div>
  );
}

void MapPin; void MessageSquare;
