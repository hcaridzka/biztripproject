import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  StatusBadge,
  Textarea,
  formatIDR,
} from './ui-shared';
import { supabase } from '../lib/supabase';
import { uid } from '../lib/utils';
import type { BizTrip } from '../lib/types';

type ReceiptReviewStatus = 'pending' | 'approved' | 'partial' | 'rejected';

type ReviewRow = {
  id: string;
  receiptId: string;
  category: string;
  description: string;
  claimed: number;
  approved: number;
  status: ReceiptReviewStatus;
  note: string;
  fileUrl: string | null;
};

type SettlementCostRow = {
  id: string;
  name: string;
  component: string;
  nominal: number;
  ptBurden: string;
};

export function SettlementReview({ onPrint }: { onPrint: (id: string) => void }) {
  const { profile } = useAuth();
  const {
    trips,
    settlementReceipts,
    settlementClaimRows,
    disburseRows,
    activePTMaster,
    updateTrip,
    showToast,
    refresh,
  } = useApp();

  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [costRows, setCostRows] = useState<SettlementCostRow[]>([]);
  const [settleNote, setSettleNote] = useState('');
  const [saving, setSaving] = useState(false);

  const queue = useMemo(
    () => trips.filter((t) =>
      t.status === 'Pending HR Settlement Review' ||
      t.status === 'Pending Refund Verification'
    ),
    [trips]
  );

  const isRefundVerification = selected?.status === 'Pending Refund Verification';

  const getTransactionReceipts = (tripId: string) =>
    settlementReceipts.filter((r) =>
      r.trip_id === tripId && r.category !== 'Refund Transfer Proof'
    );

  const getRefundProof = (tripId: string) =>
    settlementReceipts.find((r) =>
      r.trip_id === tripId && r.category === 'Refund Transfer Proof'
    );

  const getPTOptions = (currentPT?: string) => {
    const activeNames = activePTMaster.map((pt) => pt.name);
    const current = currentPT?.trim();
    if (current && !activeNames.includes(current)) return [current, ...activeNames];
    return activeNames;
  };

  const getAdvanceRowsForCategory = (trip: BizTrip, category: string) => {
    const advanceRows = disburseRows.filter((row) => row.trip_id === trip.id);
    const normalized = category.trim().toLowerCase();
    const aliases: Record<string, string[]> = {
      bbm: ['bbm'],
      'e-toll': ['e-toll', 'e toll', 'etoll', 'toll'],
      akomodasi: ['akomodasi', 'hotel'],
      pettycash: ['pettycash', 'petty cash'],
    };
    const keywords = aliases[normalized] ?? [normalized];
    return advanceRows.filter((row) => {
      const note = String(row.component_note ?? '').trim().toLowerCase();
      return keywords.some((keyword) => keyword && note.includes(keyword));
    });
  };

  const defaultPT = (trip: BizTrip) =>
    trip.company_burden?.[0] || activePTMaster[0]?.name || '';

  const buildCostRowsFromApproved = (trip: BizTrip, rows: ReviewRow[]) => {
    const next: SettlementCostRow[] = [];

    rows.forEach((row) => {
      const approved = Number(row.approved) || 0;
      if (approved <= 0) return;

      const matchedAdvance = getAdvanceRowsForCategory(trip, row.category)
        .filter((advanceRow) => Number(advanceRow.nominal) > 0);

      if (matchedAdvance.length === 0) {
        next.push({
          id: uid(),
          name: row.description || row.category,
          component: row.category,
          nominal: approved,
          ptBurden: defaultPT(trip),
        });
        return;
      }

      const advanceTotal = matchedAdvance.reduce(
        (sum, advanceRow) => sum + (Number(advanceRow.nominal) || 0),
        0
      );

      let allocated = 0;
      matchedAdvance.forEach((advanceRow, index) => {
        const isLast = index === matchedAdvance.length - 1;
        const nominal = isLast
          ? Math.max(0, approved - allocated)
          : Math.round(approved * ((Number(advanceRow.nominal) || 0) / advanceTotal));
        allocated += nominal;
        next.push({
          id: uid(),
          name: row.description || row.category,
          component: row.category,
          nominal,
          ptBurden: advanceRow.pt_burden || defaultPT(trip),
        });
      });
    });

    return next;
  };

  const startReview = (trip: BizTrip) => {
    setSelected(trip);
    setSettleNote(trip.settlement_note ?? '');

    if (trip.status === 'Pending Refund Verification') {
      setReviewRows([]);
      setCostRows([]);
      return;
    }

    const receipts = getTransactionReceipts(trip.id);
    const rows: ReviewRow[] = receipts.map((receipt) => ({
      id: receipt.id,
      receiptId: receipt.id,
      category: receipt.category,
      description: receipt.description || '',
      claimed: Number(receipt.amount) || 0,
      approved:
        receipt.hr_approved_amount !== null && receipt.hr_approved_amount !== undefined
          ? Number(receipt.hr_approved_amount)
          : Number(receipt.amount) || 0,
      status: (receipt.hr_status as ReceiptReviewStatus) || 'pending',
      note: receipt.hr_note || '',
      fileUrl: receipt.file_base64 || null,
    }));
    setReviewRows(rows);

    const existingCostRows = settlementClaimRows.filter((row) => row.trip_id === trip.id);
    if (existingCostRows.length > 0) {
      setCostRows(existingCostRows.map((row) => ({
        id: row.id,
        name: row.name,
        component: row.name,
        nominal: Number(row.nominal) || 0,
        ptBurden: row.pt_burden,
      })));
    } else {
      setCostRows(buildCostRowsFromApproved(trip, rows));
    }
  };

  const updateReviewRow = (id: string, patch: Partial<ReviewRow>) => {
    setReviewRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const updateStatus = (row: ReviewRow, status: ReceiptReviewStatus) => {
    let approved = row.approved;
    if (status === 'approved') approved = row.claimed;
    if (status === 'rejected') approved = 0;
    updateReviewRow(row.id, { status, approved });
  };

  const advanceTotal = Number(selected?.cost_grand_total) || 0;
  const advanceAccountable = Number(selected?.cost_data?.accountable?.total) || 0;
  const nonAccountable = Number(selected?.cost_data?.nonAccountable?.total) || 0;
  const claimedActual = reviewRows.reduce((sum, row) => sum + Number(row.claimed || 0), 0);
  const approvedActual = reviewRows.reduce((sum, row) => sum + Number(row.approved || 0), 0);
  const diff = approvedActual - advanceAccountable;
  const category = diff > 0 ? 'Reimbursement' : diff < 0 ? 'Refund' : 'Settled';
  const settlementAmount = Math.abs(diff);
  const costCenterTotal = costRows.reduce((sum, row) => sum + Number(row.nominal || 0), 0);
  const costCenterDifference = costCenterTotal - approvedActual;

  const refundAmount = selected
    ? Math.max(0, Number(selected.cost_data?.accountable?.total || 0) - Number(selected.approved_total || 0))
    : 0;
  const refundProof = selected ? getRefundProof(selected.id) : undefined;
  const allReceiptsReviewed =
    reviewRows.length === 0 || reviewRows.every((row) => row.status !== 'pending');

  const autoFillSettlementCostCenter = () => {
    if (!selected) return;
    setCostRows(buildCostRowsFromApproved(selected, reviewRows));
    showToast('info', 'Table A Actual Approved disalin ke Table B. HR dapat melakukan split atau override PT dan nominal.');
  };

  const addCostRow = () => {
    if (!selected) return;
    setCostRows((rows) => [...rows, {
      id: uid(),
      name: selected.requester_name,
      component: '',
      nominal: 0,
      ptBurden: defaultPT(selected),
    }]);
  };

  const updateCostRow = (id: string, patch: Partial<SettlementCostRow>) => {
    setCostRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const removeCostRow = (id: string) => {
    setCostRows((rows) => rows.filter((row) => row.id !== id));
  };

  const persistReceiptReview = async () => {
    for (const row of reviewRows) {
      const { error } = await supabase.from('settlement_receipts').update({
        hr_status: row.status,
        hr_approved_amount: Number(row.approved) || 0,
        hr_note: row.note || null,
      }).eq('id', row.receiptId);
      if (error) throw error;
    }
  };

  const persistSettlementCostCenter = async () => {
    if (!selected) return;
    const { error: deleteError } = await supabase
      .from('settlement_claim_rows')
      .delete()
      .eq('trip_id', selected.id);
    if (deleteError) throw deleteError;

    const claimStatus = diff < 0 ? 'Refund' : diff > 0 ? 'Reimburse' : 'Settled';
    for (let i = 0; i < costRows.length; i++) {
      const row = costRows[i];
      if (Number(row.nominal) <= 0) continue;
      const { error } = await supabase.from('settlement_claim_rows').insert({
        id: crypto.randomUUID(),
        trip_id: selected.id,
        name: row.component
          ? `${row.name} — ${row.component}`
          : row.name,
        nominal: Number(row.nominal) || 0,
        claim_status: claimStatus,
        pt_burden: row.ptBurden,
        sort_order: i,
      });
      if (error) throw error;
    }
  };

  const finalizeSettlement = async () => {
    if (!selected) return;
    if (!allReceiptsReviewed) {
      showToast('error', 'Semua receipt harus direview terlebih dahulu');
      return;
    }

    const partialInvalid = reviewRows.some((row) =>
      row.status === 'partial' && (row.approved <= 0 || row.approved >= row.claimed)
    );
    if (partialInvalid) {
      showToast('error', 'Nominal Partial harus lebih dari Rp0 dan lebih kecil dari nominal klaim');
      return;
    }

    if (Math.abs(costCenterDifference) > 0.01) {
      showToast(
        'error',
        `Total Table B (${formatIDR(costCenterTotal)}) harus sama dengan Actual Approved (${formatIDR(approvedActual)}).`
      );
      return;
    }

    if (costRows.some((row) => Number(row.nominal) > 0 && !row.ptBurden?.trim())) {
      showToast('error', 'Seluruh baris Table B wajib memiliki Beban PT.');
      return;
    }

    setSaving(true);
    try {
      await persistReceiptReview();
      await persistSettlementCostCenter();

      const nextStatus: BizTrip['status'] = diff < 0 ? 'Pending Refund' : 'Completed';
      const now = new Date().toISOString();
      await updateTrip(selected.id, {
        status: nextStatus,
        realization_total: claimedActual,
        approved_total: approvedActual,
        settlement_result:
          category === 'Reimbursement'
            ? `Reimbursement - ${settlementAmount}`
            : category === 'Refund'
              ? `Refund - ${settlementAmount}`
              : 'Settled',
        settlement_note: settleNote || null,
        settlement_reviewed_by: profile?.name ?? '',
        settlement_reviewed_at: now,
        settlement_number:
          selected.settlement_number ||
          `STL-${new Date().getFullYear()}-${selected.id.slice(0, 4).toUpperCase()}`,
        completed_at: nextStatus === 'Completed' ? now : null,
      });

      const { error: trackingError } = await supabase.from('trip_tracking').insert({
        trip_id: selected.id,
        actor_name: profile?.name ?? '',
        actor_role: 'HR Manager',
        action: 'Settlement reviewed',
        from_status: selected.status,
        to_status: nextStatus,
        remarks: `${category} ${formatIDR(settlementAmount)}${settleNote ? ` · ${settleNote}` : ''}`,
      });
      if (trackingError) throw trackingError;

      showToast(
        'success',
        category === 'Reimbursement'
          ? `Settlement selesai. Reimbursement ${formatIDR(settlementAmount)} diteruskan HR ke Finance.`
          : category === 'Refund'
            ? `Settlement direview. Pegawai perlu refund ${formatIDR(settlementAmount)}.`
            : 'Settlement selesai tanpa refund/reimbursement'
      );
      setSelected(null);
      setReviewRows([]);
      setCostRows([]);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal menyelesaikan settlement: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const rejectSettlement = async () => {
    if (!selected) return;
    const reason = settleNote.trim() || window.prompt('Masukkan alasan reject settlement:');
    if (!reason?.trim()) {
      showToast('error', 'Alasan reject wajib diisi');
      return;
    }
    setSaving(true);
    try {
      await persistReceiptReview();
      await updateTrip(selected.id, {
        status: 'Rejected',
        settlement_result: 'Rejected',
        settlement_note: reason,
        settlement_reviewed_by: profile?.name ?? '',
        settlement_reviewed_at: new Date().toISOString(),
      });
      await supabase.from('trip_tracking').insert({
        trip_id: selected.id,
        actor_name: profile?.name ?? '',
        actor_role: 'HR Manager',
        action: 'Settlement rejected',
        from_status: selected.status,
        to_status: 'Rejected',
        remarks: reason,
      });
      showToast('success', 'Settlement ditolak');
      setSelected(null);
      setReviewRows([]);
      setCostRows([]);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal reject settlement: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const verifyRefund = async () => {
    if (!selected || !refundProof) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: receiptError } = await supabase.from('settlement_receipts').update({
        hr_status: 'approved',
        hr_approved_amount: Number(refundProof.amount) || refundAmount,
        hr_note: settleNote || 'Refund verified by HR',
      }).eq('id', refundProof.id);
      if (receiptError) throw receiptError;

      await updateTrip(selected.id, {
        status: 'Completed',
        settlement_result: `Refund Completed - ${refundAmount}`,
        settlement_note: settleNote || selected.settlement_note,
        completed_at: now,
      });
      const { error: trackingError } = await supabase.from('trip_tracking').insert({
        trip_id: selected.id,
        actor_name: profile?.name ?? '',
        actor_role: 'HR Manager',
        action: 'Refund verified',
        from_status: 'Pending Refund Verification',
        to_status: 'Completed',
        remarks: `Refund ${formatIDR(refundAmount)} verified`,
      });
      if (trackingError) throw trackingError;
      showToast('success', 'Bukti refund terverifikasi. Settlement Completed.');
      setSelected(null);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal verifikasi refund: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const rejectRefundProof = async () => {
    if (!selected || !refundProof) return;
    const reason = settleNote.trim() || window.prompt('Masukkan alasan penolakan bukti refund:');
    if (!reason?.trim()) {
      showToast('error', 'Alasan penolakan wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const { error: receiptError } = await supabase.from('settlement_receipts').update({
        hr_status: 'rejected',
        hr_approved_amount: 0,
        hr_note: reason,
      }).eq('id', refundProof.id);
      if (receiptError) throw receiptError;
      await updateTrip(selected.id, { status: 'Pending Refund', settlement_note: reason });
      const { error: trackingError } = await supabase.from('trip_tracking').insert({
        trip_id: selected.id,
        actor_name: profile?.name ?? '',
        actor_role: 'HR Manager',
        action: 'Refund proof rejected',
        from_status: 'Pending Refund Verification',
        to_status: 'Pending Refund',
        remarks: reason,
      });
      if (trackingError) throw trackingError;
      showToast('success', 'Bukti refund ditolak. Pegawai diminta upload ulang.');
      setSelected(null);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal reject bukti refund: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settlement Review</h2>
          <p className="text-sm text-slate-500">HR Manager · {queue.length} menunggu review</p>
        </div>
      </div>

      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-6 h-6" />} title="Tidak ada settlement menunggu" message="Tidak ada settlement atau refund yang perlu direview." />
          ) : (
            <div className="space-y-2">
              {queue.map((trip) => (
                <div key={trip.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-cyan-200 transition p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{trip.purpose}</div>
                    <div className="text-xs text-slate-400 mt-1">{trip.requester_name} · Advance {formatIDR(Number(trip.cost_grand_total) || 0)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={trip.status} />
                    <Button size="sm" onClick={() => startReview(trip)}>{trip.status === 'Pending Refund Verification' ? 'Verify Refund' : 'Review'}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {selected && isRefundVerification && (
        <>
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Banknote className="w-4 h-4 text-rose-500" />Refund Verification</h3>
                <p className="text-xs text-slate-500 mt-1">{selected.requester_name} · {selected.purpose}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600">Tutup</button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <SummaryBox label="Advance Accountable" value={Number(selected.cost_data?.accountable?.total) || 0} />
              <SummaryBox label="Actual Approved" value={Number(selected.approved_total) || 0} />
              <SummaryBox label="Refund" value={refundAmount} />
            </div>
            {!refundProof ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">Bukti transfer refund belum ditemukan.</div>
            ) : (
              <div className="rounded-xl ring-1 ring-slate-200 p-4 flex items-center justify-between gap-4">
                <div><div className="text-xs font-semibold text-slate-500">Bukti Transfer Pegawai</div><div className="text-sm font-bold text-slate-800 mt-1">{formatIDR(Number(refundProof.amount) || refundAmount)}</div></div>
                {refundProof.file_base64 && <a href={refundProof.file_base64} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Lihat Bukti</a>}
              </div>
            )}
            <Field label="HR Verification Notes"><Textarea rows={3} value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Catatan verifikasi refund..." /></Field>
          </Card>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} disabled={saving || !refundProof} onClick={rejectRefundProof}>Reject Proof</Button>
            <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} disabled={saving || !refundProof} onClick={verifyRefund}>Verify & Complete</Button>
          </div>
        </>
      )}

      {selected && !isRefundVerification && (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Settlement Review — {selected.requester_name}</h3>
                <p className="text-xs text-slate-500 mt-1">{selected.purpose}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600">Tutup</button>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              <SummaryBox label="Grand Advance" value={advanceTotal} />
              <SummaryBox label="Non-Accountable" value={nonAccountable} />
              <SummaryBox label="Advance Accountable" value={advanceAccountable} />
              <SummaryBox label="Actual Approved" value={approvedActual} />
            </div>
            <div className={`rounded-xl p-4 ${diff > 0 ? 'bg-amber-50' : diff < 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <div className="text-xs text-slate-500">Settlement Result</div>
              <div className="text-lg font-bold text-slate-800 mt-1">{category} · {formatIDR(settlementAmount)}</div>
              <div className="text-[11px] text-slate-500 mt-1">Tunjangan perjalanan dan insentif jarak Driver bersifat non-accountable. Akomodasi, pettycash, BBM, dan E-Toll menjadi basis settlement bila masuk advance.</div>
            </div>
            {selected.work_result && <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500 mb-1">Laporan Hasil Pekerjaan</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.work_result}</p></div>}
          </Card>

          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">A. Review Pengeluaran Aktual</h3>
              <p className="text-[11px] text-slate-500 mt-1">HR dapat approve, partial approve, reject, dan override nominal receipt. PT tidak ditentukan di Table A.</p>
            </div>
            {reviewRows.length === 0 ? (
              <EmptyState icon={<FileText className="w-5 h-5" />} title="Tidak ada receipt" message="Pegawai tidak mengajukan pengeluaran aktual." />
            ) : (
              <div className="space-y-3">
                {reviewRows.map((row) => (
                  <div key={row.id} className="rounded-xl ring-1 ring-slate-200 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="text-xs font-bold text-slate-700">{row.category}</div><div className="text-xs text-slate-400 mt-0.5">{row.description || '-'}</div></div>
                      {row.fileUrl && <a href={row.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600 hover:underline flex items-center gap-1"><ExternalLink className="w-3.5 h-3.5" />Lihat Bukti</a>}
                    </div>
                    <div className="grid md:grid-cols-4 gap-2">
                      <Field label="Claim"><Input value={formatIDR(row.claimed)} disabled className="bg-slate-50" /></Field>
                      <Field label="Approved HR"><Input type="number" min={0} value={row.approved} disabled={row.status === 'approved' || row.status === 'rejected'} onChange={(e) => updateReviewRow(row.id, { approved: parseFloat(e.target.value) || 0 })} /></Field>
                      <Field label="Status"><Select value={row.status} onChange={(e) => updateStatus(row, e.target.value as ReceiptReviewStatus)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="partial">Partial</option><option value="rejected">Rejected</option></Select></Field>
                      <Field label="HR Note"><Input value={row.note} onChange={(e) => updateReviewRow(row.id, { note: e.target.value })} placeholder="Catatan..." /></Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <SummaryBox label="Actual Claimed" value={claimedActual} />
              <SummaryBox label="Actual Approved" value={approvedActual} />
              <SummaryBox label="Advance Accountable" value={advanceAccountable} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-slate-800">B. Actual Cost Center / PT Burden</h3>
                <p className="text-[11px] text-slate-500 mt-1">Default mengikuti alokasi advance bila komponen memiliki pasangan. HR tetap dapat split, mengganti PT, dan mengubah nominal secara manual.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={autoFillSettlementCostCenter}>Auto-Fill Actual Approved</Button>
                <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addCostRow}>Add Row</Button>
              </div>
            </div>

            {costRows.length === 0 ? (
              <EmptyState icon={<ClipboardList className="w-5 h-5" />} title="Cost center belum diisi" message="Klik Auto-Fill Actual Approved untuk membentuk Table B." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-200">
                  <thead><tr className="bg-slate-50"><th className="border border-slate-200 px-2 py-2">Nama</th><th className="border border-slate-200 px-2 py-2">Komponen</th><th className="border border-slate-200 px-2 py-2">Nominal</th><th className="border border-slate-200 px-2 py-2">Beban PT</th><th className="border border-slate-200 px-2 py-2 w-10">Aksi</th></tr></thead>
                  <tbody>
                    {costRows.map((row) => (
                      <tr key={row.id}>
                        <td className="border border-slate-200 p-1.5"><Input value={row.name} onChange={(e) => updateCostRow(row.id, { name: e.target.value })} className="text-xs" /></td>
                        <td className="border border-slate-200 p-1.5"><Input value={row.component} onChange={(e) => updateCostRow(row.id, { component: e.target.value })} className="text-xs" /></td>
                        <td className="border border-slate-200 p-1.5"><Input type="number" min={0} value={row.nominal} onChange={(e) => updateCostRow(row.id, { nominal: parseFloat(e.target.value) || 0 })} className="text-xs" /></td>
                        <td className="border border-slate-200 p-1.5"><Select value={row.ptBurden} onChange={(e) => updateCostRow(row.id, { ptBurden: e.target.value })} className="text-xs">{getPTOptions(row.ptBurden).map((pt) => <option key={pt} value={pt}>{pt}</option>)}</Select></td>
                        <td className="border border-slate-200 p-1.5 text-center"><button onClick={() => removeCostRow(row.id)} className="text-rose-500 hover:text-rose-700"><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-3">
              <SummaryBox label="Total Table B" value={costCenterTotal} />
              <SummaryBox label="Actual Approved" value={approvedActual} />
              <SummaryBox label="Selisih" value={costCenterDifference} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            {!allReceiptsReviewed && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Masih ada receipt berstatus Pending.</div>}
            {Math.abs(costCenterDifference) > 0.01 && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Total Table B belum sama dengan Actual Approved.</div>}
            <Field label="HR Settlement Notes"><Textarea rows={3} value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Catatan settlement HR..." /></Field>
            <div className="flex justify-between gap-2 flex-wrap">
              <Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5" />} onClick={() => onPrint(selected.id)}>Cetak PDF Settlement</Button>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" icon={<X className="w-3.5 h-3.5" />} disabled={saving} onClick={rejectSettlement}>Reject Settlement</Button>
                <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} disabled={saving || !allReceiptsReviewed || Math.abs(costCenterDifference) > 0.01} onClick={finalizeSettlement}>Approve Settlement</Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-base font-bold text-slate-800 mt-1">{formatIDR(value)}</div>
    </div>
  );
}
