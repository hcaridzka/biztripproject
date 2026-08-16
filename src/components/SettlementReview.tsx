import { useState, useMemo } from 'react';
import { ClipboardList, Plus, Trash2, Check, X, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field, Textarea, EmptyState, StatusBadge, formatIDR } from './ui-shared';
import { PT_OPTIONS } from '../lib/constants';
import { uid } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip } from '../lib/types';

export function SettlementReview({ onPrint }: { onPrint: (id: string) => void }) {
  const { profile } = useAuth();
  const { trips, settlementReceipts, updateTrip, showToast, refresh } = useApp();
  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [claimRows, setClaimRows] = useState<{ id: string; name: string; nominal: number; claim_status: 'Refund' | 'Reimburse'; pt_burden: string }[]>([]);
  const [settleNote, setSettleNote] = useState('');

  const queue = useMemo(
  () => trips.filter((t) =>
    t.status === 'Pending HR Settlement Review' ||
    t.status === 'Pending Refund Verification'
  ),
  [trips]
);

  cconst startReview = (t: BizTrip) => {
  setSelected(t);

  const receipts = settlementReceipts.filter(
    (r) => r.trip_id === t.id && r.category !== 'Refund Transfer Proof'
  );

  setClaimRows(
    receipts.map((r) => ({
      id: r.id,
      name: r.description || r.category,
      nominal: Number(r.hr_approved_amount ?? r.amount) || 0,
      claim_status: 'Reimburse',
      pt_burden: t.company_burden?.[0] ?? PT_OPTIONS[0],
    }))
  );
  setSettleNote(t.settlement_note ?? '');
};

  const addRow = () => setClaimRows((r) => [...r, { id: uid(), name: '', nominal: 0, claim_status: 'Reimburse', pt_burden: PT_OPTIONS[0] }]);
  const updateRow = (id: string, patch: any) => setClaimRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeRow = (id: string) => setClaimRows((r) => r.filter((x) => x.id !== id));

  const advanceTotal = Number(selected?.cost_grand_total) || 0;
  const advanceAccountable =
  Number(selected?.cost_data?.accountable?.total) || 0;
  const nonAccountable =
  Number(selected?.cost_data?.nonAccountable?.total) || 0;
  const approvedActual = claimRows.reduce(
  (sum, row) => sum + (Number(row.nominal) || 0),
  0
);
  
const diff = approvedActual - advanceAccountable;

const category =
  diff > 0
    ? 'Reimburse'
    : diff < 0
    ? 'Refund'
    : 'Settled';

const settlementAmount = Math.abs(diff);

  const finalize = async (action: 'approve' | 'partial' | 'reject') => {
    if (!selected) return;
    try {
      let nextStatus: BizTrip['status'] = 'Completed';
      let nextStatus: BizTrip['status'];
      if (action === 'reject') { nextStatus = 'Rejected'; } 
      else if (diff < 0) { nextStatus = 'Pending Refund'; } 
      else { nextStatus = 'Completed'; }

      await updateTrip(selected.id, {
        status: nextStatus,
        settlement_result: action === 'approve' ? 'Approved' : action === 'partial' ? 'Partial Approved' : 'Rejected',
        settlement_note: settleNote,
        approved_total: approvedActual,
settlement_result:
  action === 'reject'
    ? 'Rejected'
    : category === 'Reimburse'
    ? `Reimbursement - ${settlementAmount}`
    : category === 'Refund'
    ? `Refund - ${settlementAmount}`
    : 'Settled',
completed_at: nextStatus === 'Completed' ? new Date().toISOString() : null,
        settlement_reviewed_by: profile?.name ?? '',
        settlement_reviewed_at: new Date().toISOString(),
        settlement_number: `STL-${new Date().getFullYear()}-${selected.id.slice(0, 4).toUpperCase()}`,
      });

      // Save claim rows
      await supabase.from('settlement_claim_rows').delete().eq('trip_id', selected.id);
      for (let i = 0; i < claimRows.length; i++) {
        const r = claimRows[i];
        await supabase.from('settlement_claim_rows').insert({ 
          id: r.id, 
          trip_id: selected.id, 
          name: r.name, 
          nominal: r.nominal, 
          claim_status: r.claim_status, 
          pt_burden: r.pt_burden, 
          sort_order: i 
        });
      }

      await supabase.from('trip_tracking').insert({ 
        trip_id: selected.id, 
        actor_name: profile?.name ?? '', 
        actor_role: 'HR Manager', 
        action: `Settlement ${action}`, 
        from_status: selected.status, 
        to_status: nextStatus, 
        remarks: settleNote 
      });

      showToast('success', `Settlement ${action}. Status -> ${nextStatus}`);
      setSelected(null);
      refresh();
    } catch (e: any) { 
      showToast('error', 'Gagal: ' + e.message); 
    }
  };

  const tripReceipts = selected ? settlementReceipts.filter((r) => r.trip_id === selected.id) : [];

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600"><ClipboardList className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settlement Review</h2>
          <p className="text-sm text-slate-500">HR Manager · Override nominal akhir · {queue.length} menunggu</p>
        </div>
      </div>

      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-6 h-6" />} title="Tidak ada settlement menunggu" message="Tidak ada laporan settlement yang perlu direview." />
          ) : (
            <div className="space-y-2">
              {queue.map((t) => (
                <div key={t.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-cyan-200 transition p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.requester_name} · Advance {formatIDR(Number(t.cost_grand_total) || 0)} · Actual {formatIDR(Number(t.realization_total) || 0)}</div>
                  </div>
                  <div className="flex items-center gap-3"><StatusBadge status={t.status} /><Button size="sm" onClick={() => startReview(t)}>Review</Button></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {selected && (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Settlement Review — {selected.requester_name}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">Tutup</button>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
  <SummaryBox label="Grand Advance" value={advanceTotal} />
  <SummaryBox label="Non-Accountable" value={nonAccountable} />
  <SummaryBox label="Advance Accountable" value={advanceAccountable} />
  <SummaryBox label="Actual Approved" value={approvedActual} />
</div>

<div className={`rounded-xl p-4 ${
  diff > 0
    ? 'bg-amber-50'
    : diff < 0
    ? 'bg-rose-50'
    : 'bg-emerald-50'
}`}>
  <div className="text-xs text-slate-500">Settlement Result</div>

  <div className="text-lg font-bold mt-1">
    {category} · {formatIDR(settlementAmount)}
  </div>
</div>
            {selected.work_result && (
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500 mb-1">Laporan Hasil Pekerjaan:</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.work_result}</p>
              </div>
            )}
          </Card>

          {/* Bukti Pengeluaran & Nota Karyawan (Dari database settlement_receipts) */}
          {tripReceipts.length > 0 && (
            <Card className="p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Bukti Pengeluaran & Nota Karyawan</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {tripReceipts.map((r) => (
                  <div key={r.id} className="rounded-xl ring-1 ring-slate-100 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-700">{r.category}</div>
                        <div className="text-[11px] text-slate-400">{r.description}</div>
                      </div>
                      <div className="text-sm font-bold text-slate-800">{formatIDR(Number(r.amount) || 0)}</div>
                    </div>
                    {r.file_base64 && (
                      <div className="mt-2">
                        <a href={r.file_base64} target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:underline flex items-center gap-1 font-medium">
                          <FileText className="w-3.5 h-3.5" /> Lihat Nota / Lampiran
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* TABEL DETAIL OVERRIDE LAPORAN AKHIR SETTLEMENT DENGAN PT BURDEN */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Tabel Detail Override Settlement & Cost Center (Editable by HR)</h3>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addRow}>Add Row</Button>
            </div>
            <div className="space-y-2">
              {claimRows.map((r) => (
                <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl ring-1 ring-slate-200 p-2.5">
                  <Input className="md:col-span-4" value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} placeholder="Nama Komponen" />
                  <Input className="md:col-span-2" type="number" value={r.nominal} onChange={(e) => updateRow(r.id, { nominal: parseFloat(e.target.value) || 0 })} placeholder="Nominal" />
                  <Select className="md:col-span-2" value={r.claim_status} onChange={(e) => updateRow(r.id, { claim_status: e.target.value })}>
                    <option value="Refund">Refund</option>
                    <option value="Reimburse">Reimburse</option>
                  </Select>
                  <Select className="md:col-span-3" value={r.pt_burden} onChange={(e) => updateRow(r.id, { pt_burden: e.target.value })}>
                    {PT_OPTIONS.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                  </Select>
                  <button onClick={() => removeRow(r.id)} className="md:col-span-1 text-rose-400 hover:text-rose-600 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <Field label="HR Settlement Notes">
              <Textarea rows={2} value={settleNote} onChange={(e) => setSettleNote(e.target.value)} placeholder="Catatan settlement HR..." />
            </Field>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Kategori Klaim Akhir</span>
              <span className="font-bold text-slate-800">{category} · {formatIDR(Math.abs(diff))}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="danger" size="sm" icon={<X className="w-3.5 h-3.5" />} onClick={() => finalize('reject')}>Reject Settlement</Button>
              <Button variant="secondary" size="sm" icon={<AlertCircle className="w-3.5 h-3.5" />} onClick={() => finalize('partial')}>Partial Approve</Button>
              <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={() => finalize('approve')}>Approve Settlement</Button>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5" />} onClick={() => onPrint(selected.id)}>Cetak PDF Settlement</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-base font-bold text-slate-800 mt-1">
        {formatIDR(value)}
      </div>
    </div>
  );
}
