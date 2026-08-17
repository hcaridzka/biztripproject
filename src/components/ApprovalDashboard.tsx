import { useMemo, useState } from 'react';
import { CheckSquare, Check, X, RotateCcw, Filter, Trash2, Calculator, Truck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Field, Textarea, EmptyState, StatusBadge, Modal, formatIDR } from './ui-shared';
import { cn, formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip, TripStatus } from '../lib/types';
import type { ViewKey } from './Layout';

export function ApprovalDashboard({ setSelectedTrip, setView }: {
  setSelectedTrip: (id: string) => void;
  setView: (v: ViewKey) => void;
}) {
  const { profile } = useAuth();
  const { trips, updateTrip, deleteTrip, showToast, refresh, activePTMaster } = useApp();
  const [ptFilter, setPtFilter] = useState('');
  const [rejectTrip, setRejectTrip] = useState<BizTrip | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selected, setSelected] = useState<BizTrip | null>(null);

  const role = profile?.role ?? 'Employee';
  const ptAccess = profile?.pt_access ?? [];
  const isHR = role === 'HR Manager';
  const isSuperAdmin = profile?.is_super_admin === true || isHR;

  // Manager mengikuti PT pemohon; Direksi mengikuti PT beban biaya.
  const managerPtMatches = (t: BizTrip) =>
    isSuperAdmin || ptAccess.length === 0 || (!!t.requester_pt && ptAccess.includes(t.requester_pt));

  const burdenPtMatches = (t: BizTrip) =>
    isSuperAdmin || ptAccess.length === 0 || (t.company_burden ?? []).some((b) => ptAccess.includes(b));

  // Filter mengikuti konteks stage agar konsisten dengan routing approval.
  const ptFilterMatches = (t: BizTrip) => {
    if (!ptFilter) return true;
    if (t.status === 'Pending Manager Approval') return t.requester_pt === ptFilter;
    return (t.company_burden ?? []).includes(ptFilter);
  };

  const queue = useMemo(() => {
    let list: BizTrip[] = [];
    if (role === 'Manager') {
      list = trips.filter((t) => t.status === 'Pending Manager Approval' && managerPtMatches(t));
    } else if (role === 'Direksi') {
      list = trips.filter((t) => t.status === 'Pending Direksi Approval' && burdenPtMatches(t));
    } else if (role === 'HR Manager') {
      list = trips.filter((t) => [
        'Pending Manager Approval',
        'Pending PIC Obligo',
        'Pending Direksi Approval',
        'Pending HR Advance Review',
      ].includes(t.status));
    }
    return list.filter(ptFilterMatches);
  }, [trips, role, ptFilter, ptAccess, isSuperAdmin]);

  const ptFilterOptions = useMemo(() => {
    const active = activePTMaster.map((pt) => pt.name).filter(Boolean);
    const visible = isSuperAdmin ? active : ptAccess;
    return Array.from(new Set(visible)).sort();
  }, [activePTMaster, isSuperAdmin, ptAccess]);

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

  const approve = async (t: BizTrip) => {
    try {
      let nextStatus: TripStatus = t.status;
      const patch: Partial<BizTrip> = {};
      const requiresObligo =
        t.requires_vehicle === true || t.needs_vehicle === true ||
        t.requires_driver === true || t.needs_driver === true;

      if (t.status === 'Pending Manager Approval') {
        nextStatus = requiresObligo ? 'Pending PIC Obligo' : 'Pending Direksi Approval';
        patch.manager_approved_by = profile?.name ?? '';
        patch.manager_approved_at = new Date().toISOString();
      } else if (t.status === 'Pending Direksi Approval') {
        nextStatus = 'Pending HR Advance Review';
        patch.direksi_approved_by = profile?.name ?? '';
        patch.direksi_approved_at = new Date().toISOString();
      } else if (t.status === 'Pending PIC Obligo' || t.status === 'Pending HR Advance Review') {
        showToast('error', t.status === 'Pending PIC Obligo'
          ? 'Trip harus diproses melalui Vehicle & Driver Assignment.'
          : 'Trip harus diproses melalui Cost & Advance Review.');
        return;
      }

      if (nextStatus === t.status) {
        showToast('error', 'Status trip tidak dapat diproses melalui approval ini.');
        return;
      }

      patch.status = nextStatus;
      await updateTrip(t.id, patch);
      await supabase.from('trip_tracking').insert({
        trip_id: t.id,
        actor_name: profile?.name ?? '',
        actor_role: role,
        action: `Approved -> ${nextStatus}`,
        from_status: t.status,
        to_status: nextStatus,
      });
      showToast('success', 'Pengajuan berhasil disetujui');
      refresh();
      setSelected(null);
    } catch (e: any) {
      showToast('error', 'Gagal approve: ' + e.message);
    }
  };

  const doReject = async () => {
    if (!rejectTrip || !rejectReason.trim()) {
      showToast('error', 'Remarks alasan reject wajib diisi');
      return;
    }
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
        remarks: rejectReason,
      });
      showToast('success', 'Pengajuan ditolak dengan remarks');
      setRejectTrip(null);
      setRejectReason('');
      setSelected(null);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal reject: ' + e.message);
    }
  };

  const requestReReview = async (t: BizTrip) => {
    const justification = window.prompt('Tulis justifikasi permintaan Re-Review:');
    if (!justification?.trim()) return;
    try {
      await updateTrip(t.id, {
        status: 'Pending Manager Approval',
        review_justification: justification,
        reject_reason: null,
      });
      await supabase.from('trip_tracking').insert({
        trip_id: t.id,
        actor_name: profile?.name ?? '',
        actor_role: role,
        action: 'Request Re-Review',
        from_status: t.status,
        to_status: 'Pending Manager Approval',
        remarks: justification,
      });
      showToast('success', 'Re-Review diajukan');
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal: ' + e.message);
    }
  };

  const renderPrimaryAction = (t: BizTrip) => {
    if (isHR && t.status === 'Pending PIC Obligo') {
      return <Button size="sm" variant="secondary" icon={<Truck className="w-3.5 h-3.5" />} onClick={() => {
        setSelectedTrip(t.id); setView('pic-obligo');
      }}>Assign Vehicle & Driver</Button>;
    }
    if (isHR && t.status === 'Pending HR Advance Review') {
      return <Button size="sm" icon={<Calculator className="w-3.5 h-3.5" />} onClick={() => {
        setSelectedTrip(t.id); setView('cost-review');
      }}>Review & Calculate</Button>;
    }
    return <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => approve(t)}>Approve</Button>;
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><CheckSquare className="w-5 h-5" /></div>
        <div><h2 className="text-xl font-bold text-slate-900">Approval Queue</h2><p className="text-sm text-slate-500">{role} · {queue.length} pengajuan menunggu</p></div>
      </div>

      {(role === 'Manager' || role === 'Direksi' || role === 'HR Manager') && ptFilterOptions.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 shrink-0"><Filter className="w-4 h-4 text-brand-600" />Pilih PT:</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPtFilter('')} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', !ptFilter ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>Semua PT</button>
              {ptFilterOptions.map((pt) => <button key={pt} onClick={() => setPtFilter(pt)} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition', ptFilter === pt ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{pt}</button>)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Manager difilter berdasarkan PT Pemohon; Direksi berdasarkan PT Beban Biaya.</p>
        </Card>
      )}

      {queue.length === 0 ? (
        <EmptyState icon={<CheckSquare className="w-6 h-6" />} title="Tidak ada approval menunggu" message="Belum ada pengajuan pada antrean approval Anda." />
      ) : (
        <div className="space-y-3">
          {queue.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelected(t)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{t.requester_name}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{t.requester_pt || '-'} · {formatDate(t.departure_date)} s.d. {formatDate(t.return_date)}</div>
                  <div className="text-sm text-slate-700 mt-1 truncate">{t.purpose}</div>
                  <div className="text-[11px] text-slate-500 mt-1">Beban: {(t.company_burden ?? []).join(', ') || '-'}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button size="sm" variant="secondary" onClick={() => setSelected(t)}>Detail</Button>
                  {renderPrimaryAction(t)}
                  <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} onClick={() => { setRejectTrip(t); setRejectReason(''); }}>Reject</Button>
                  {isSuperAdmin && <button title="Delete" onClick={() => handleDelete(t.id)} className="p-2 text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Detail Pengajuan">
        {selected && <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Info label="Pemohon" value={selected.requester_name} />
            <Info label="PT Pemohon" value={selected.requester_pt || '-'} />
            <Info label="NIP" value={selected.requester_nip || '-'} />
            <Info label="Jabatan" value={selected.requester_jabatan || '-'} />
            <Info label="Periode" value={`${formatDate(selected.departure_date)} s.d. ${formatDate(selected.return_date)}`} />
            <Info label="Beban Biaya" value={(selected.company_burden ?? []).join(', ') || '-'} />
            <Info label="Tujuan" value={selected.purpose} />
            <Info label="Estimasi" value={formatIDR(selected.cost_grand_total ?? 0)} />
          </div>
          {selected.review_justification && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><strong>Justifikasi Re-Review:</strong> {selected.review_justification}</div>}
          <div className="flex justify-end gap-2 flex-wrap">
            {selected.status === 'Rejected' && <Button variant="secondary" icon={<RotateCcw className="w-4 h-4" />} onClick={() => requestReReview(selected)}>Request Re-Review</Button>}
            {renderPrimaryAction(selected)}
            <Button variant="danger" icon={<X className="w-4 h-4" />} onClick={() => { setRejectTrip(selected); setRejectReason(''); }}>Reject</Button>
          </div>
        </div>}
      </Modal>

      <Modal open={!!rejectTrip} onClose={() => setRejectTrip(null)} title="Reject Pengajuan">
        <div className="space-y-4">
          <Field label="Alasan Reject" required><Textarea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Tuliskan alasan penolakan..." /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRejectTrip(null)}>Cancel</Button><Button variant="danger" onClick={doReject}>Reject</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div><div className="text-slate-800 font-semibold mt-0.5">{value}</div></div>;
}
