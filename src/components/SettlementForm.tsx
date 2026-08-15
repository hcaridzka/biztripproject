import { useState, useMemo } from 'react';
import { MapPin, Plus, Trash2, Upload, Camera, FileText, Send, AlertCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field, Textarea, EmptyState, StatusBadge, formatIDR } from './ui-shared';
import { RECEIPT_CATEGORIES } from '../lib/constants';
import { uid, formatDate, daysBetween } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip } from '../lib/types';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SettlementForm({ setSelectedTrip }: { setSelectedTrip: (id: string) => void }) {
  const { profile } = useAuth();
  const { trips, updateTrip, showToast, refresh } = useApp();
  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [workResult, setWorkResult] = useState('');
  const [realDays, setRealDays] = useState(1);
  const [pendingTask, setPendingTask] = useState('');
  const [nextProject, setNextProject] = useState('');
  const [receipts, setReceipts] = useState<{ id: string; category: string; description: string; amount: number; fileBase64: string | null; uploading: boolean }[]>([]);

  const queue = useMemo(() => trips.filter((t) => t.user_id === profile?.id && (t.status === 'On Trip' || t.status === 'Pending Settlement')), [trips, profile]);
  const bandingQueue = useMemo(() => trips.filter((t) => t.user_id === profile?.id && (t.status === 'Rejected' && t.settlement_result && t.settlement_result !== 'Approved')), [trips, profile]);

  const startReport = (t: BizTrip) => {
    setSelected(t);
    setWorkResult(t.work_result ?? '');
    setRealDays(t.total_days || daysBetween(t.departure_date, t.return_date));
    setPendingTask(t.pending_task ?? '');
    setNextProject(t.next_project ?? '');
    setReceipts([]);
  };

  const addReceipt = () => setReceipts((r) => [...r, { id: uid(), category: RECEIPT_CATEGORIES[0], description: '', amount: 0, fileBase64: null, uploading: false }]);
  const updateReceipt = (id: string, patch: any) => setReceipts((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeReceipt = (id: string) => setReceipts((r) => r.filter((x) => x.id !== id));

  const uploadReceiptImage = async (id: string, file: File | null) => {
    if (!file) return;
    updateReceipt(id, { uploading: true });
    try {
      const b64 = await fileToBase64(file);
      updateReceipt(id, { fileBase64: b64, uploading: false });
      showToast('success', 'Bukti terunggah (Base64)');
    } catch (e: any) { 
      showToast('error', 'Gagal: ' + e.message); 
      updateReceipt(id, { uploading: false }); 
    }
  };

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!workResult.trim()) errs.push('Laporan Hasil Pekerjaan wajib diisi');
    if (realDays < 1) errs.push('Total hari riil wajib diisi');
    for (let i = 0; i < receipts.length; i++) {
      if (receipts[i].amount > 0 && !receipts[i].fileBase64) errs.push(`Receipt ${i + 1}: nominal diisi tapi bukti gambar kosong`);
      if (!receipts[i].category) errs.push(`Receipt ${i + 1}: kategori wajib`);
    }
    return errs;
  }, [workResult, realDays, receipts]);

  const totalActual = receipts.reduce((s, r) => s + r.amount, 0);
  const canSubmit = validation.length === 0 && workResult.trim().length > 0;

  const submit = async () => {
    if (!selected || !canSubmit) { 
      showToast('error', `Form belum lengkap: ${validation.length} field`); 
      return; 
    }
    try {
      for (const r of receipts) {
        const { error: receiptError } = await supabase.from('settlement_receipts').insert({ 
          trip_id: selected.id, 
          category: r.category, 
          description: r.description, 
          amount: r.amount, 
          file_base64: r.fileBase64, 
          hr_status: 'pending' 
        });
        if (receiptError) throw receiptError;
      }

      await updateTrip(selected.id, {
        work_result: workResult,
        total_days: realDays,
        pending_task: pendingTask || null,
        next_project: nextProject || null,
        realization_total: totalActual,
        settlement_submitted_by: profile?.name ?? '',
        settlement_submitted_at: new Date().toISOString(),
        status: 'Pending HR Settlement Review',
      });

      await supabase.from('trip_tracking').insert({ 
        trip_id: selected.id, 
        actor_name: profile?.name ?? '', 
        actor_role: 'Employee', 
        action: 'Settlement submitted', 
        from_status: 'Pending Settlement', 
        to_status: 'Pending HR Settlement Review' 
      });

      showToast('success', 'Laporan settlement berhasil disubmit');
      setSelected(null);
      refresh();
    } catch (e: any) { 
      showToast('error', 'Gagal: ' + (e.message || 'Terjadi kesalahan sistem')); 
    }
  };

  const ajukanBanding = async (t: BizTrip) => {
    const reason = window.prompt('Tulis alasan banding dan penjelasan tambahan:');
    if (!reason?.trim()) return;
    
    try {
      await updateTrip(t.id, { banding_reason: reason, banding_at: new Date().toISOString(), status: 'Pending HR Settlement Review' });
      await supabase.from('trip_tracking').insert({ 
        trip_id: t.id, 
        actor_name: profile?.name ?? '', 
        actor_role: 'Employee', 
        action: 'Banding diajukan', 
        from_status: t.status, 
        to_status: 'Pending HR Settlement Review', 
        remarks: reason 
      });
      showToast('success', 'Banding diajukan ke HR');
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal mengajukan banding: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600"><FileText className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settlement Report</h2>
          <p className="text-sm text-slate-500">Laporan pertanggungjawaban pengeluaran dinas</p>
        </div>
      </div>

      {bandingQueue.length > 0 && (
        <Card className="p-6 ring-amber-200">
          <h3 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Banding Settlement</h3>
          <div className="space-y-2">
            {bandingQueue.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl ring-1 ring-amber-100 p-3">
                <div className="text-sm"><span className="font-semibold">{t.purpose}</span> <span className="text-xs text-slate-400">· {t.settlement_result}</span></div>
                <Button size="sm" variant="secondary" icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => ajukanBanding(t)}>Ajukan Banding</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState icon={<MapPin className="w-6 h-6" />} title="Tidak ada trip untuk settlement" message="Trip yang sedang berlangsung atau menunggu settlement akan muncul di sini." />
          ) : (
            <div className="space-y-2">
              {queue.map((t) => (
                <div key={t.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-purple-200 transition p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatDate(t.departure_date)} · Advance: {formatIDR(Number(t.cost_grand_total) || 0)}</div>
                  </div>
                  <div className="flex items-center gap-3"><StatusBadge status={t.status} /><Button size="sm" onClick={() => startReport(t)}>Isi Laporan</Button></div>
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
              <h3 className="text-sm font-bold text-slate-800">Form Laporan Pertanggungjawaban</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">Tutup</button>
            </div>
            <Field label="Laporan Hasil Pekerjaan" required>
              <Textarea rows={4} value={workResult} onChange={(e) => setWorkResult(e.target.value)} placeholder="Tulis laporan hasil pekerjaan selama dinas..." />
            </Field>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Tanggal Realisasi Selesai" required>
                <Input type="date" value={selected.return_date} disabled className="bg-slate-50" />
              </Field>
              <Field label="Total Hari Riil di Lapangan" required>
                <Input type="number" min={1} value={realDays} onChange={(e) => setRealDays(parseInt(e.target.value) || 1)} />
              </Field>
              <Field label="Advance Diterima">
                <Input value={formatIDR(Number(selected.cost_grand_total) || 0)} disabled className="bg-slate-50" />
              </Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Pending Task (opsional)"><Textarea rows={2} value={pendingTask} onChange={(e) => setPendingTask(e.target.value)} placeholder="Tugas tertunda..." /></Field>
              <Field label="Next Project (opsional)"><Textarea rows={2} value={nextProject} onChange={(e) => setNextProject(e.target.value)} placeholder="Rencana project berikutnya..." /></Field>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Camera className="w-4 h-4 text-slate-400" /> Rincian Pengeluaran Aktual + Bukti Gambar</h3>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addReceipt}>Add Row</Button>
            </div>
            <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Setiap item bernominal WAJIB disertai bukti gambar. Tombol submit disable jika gambar kosong.</p>
            {receipts.length === 0 ? (
              <EmptyState icon={<Upload className="w-6 h-6" />} title="Belum ada receipt" message="Klik Add Row untuk menambahkan pengeluaran." />
            ) : (
              <div className="space-y-2">
                {receipts.map((r, i) => (
                  <div key={r.id} className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Receipt {i + 1}</span>
                      <button onClick={() => removeReceipt(r.id)} className="text-rose-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid md:grid-cols-4 gap-2">
                      <Select value={r.category} onChange={(e) => updateReceipt(r.id, { category: e.target.value })}>{RECEIPT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
                      <Input value={r.description} onChange={(e) => updateReceipt(r.id, { description: e.target.value })} placeholder="Deskripsi" />
                      <Input type="number" value={r.amount} onChange={(e) => updateReceipt(r.id, { amount: parseFloat(e.target.value) || 0 })} placeholder="Nominal (Rp)" />
                      <div className={`rounded-xl px-3 py-2 text-xs font-semibold text-center ${r.fileBase64 ? 'bg-emerald-50 text-emerald-600' : r.amount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
                        {r.uploading ? 'Uploading...' : r.fileBase64 ? 'Bukti terunggah' : 'Belum ada bukti'}
                      </div>
                    </div>
                    <input type="file" accept="image/*" onChange={(e) => uploadReceiptImage(r.id, e.target.files?.[0] ?? null)}
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700" />
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-sm font-semibold text-slate-600">Total Pengeluaran Aktual</span>
              <span className="text-lg font-bold text-slate-800">{formatIDR(totalActual)}</span>
            </div>
          </Card>

          {validation.length > 0 && (
            <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4">
              <div className="text-sm font-bold text-amber-800">{validation.length} validasi belum terpenuhi:</div>
              <ul className="mt-1 text-xs text-amber-700">{validation.map((e, i) => <li key={i}>• {e}</li>)}</ul>
            </div>
          )}

          <div className="flex gap-2 justify-end pb-6">
            <Button variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit} icon={<Send className="w-4 h-4" />}>Submit Settlement</Button>
          </div>
        </>
      )}
    </div>
  );
}
