import { useState, useMemo } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Upload,
  Camera,
  FileText,
  Send,
  AlertCircle,
  RotateCcw,
  Banknote,
  CheckCircle2,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

import {
  Card,
  Button,
  Input,
  Select,
  Field,
  Textarea,
  EmptyState,
  StatusBadge,
  formatIDR,
} from './ui-shared';

import { RECEIPT_CATEGORIES } from '../lib/constants';
import { uid, formatDate, daysBetween } from '../lib/utils';
import { supabase } from '../lib/supabase';

import type { BizTrip } from '../lib/types';

type ReceiptInput = {
  id: string;
  category: string;
  description: string;
  amount: number;
  fileUrl: string | null;
  uploading: boolean;
};

export function SettlementForm({
  setSelectedTrip,
}: {
  setSelectedTrip: (id: string) => void;
}) {
  const { profile } = useAuth();
  const { trips, updateTrip, showToast, refresh } = useApp();

  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [workResult, setWorkResult] = useState('');
  const [realDays, setRealDays] = useState(1);
  const [pendingTask, setPendingTask] = useState('');
  const [nextProject, setNextProject] = useState('');
  const [receipts, setReceipts] = useState<ReceiptInput[]>([]);

  const [refundProofs, setRefundProofs] = useState<Record<string, string | null>>({});
  const [refundUploadingTrip, setRefundUploadingTrip] = useState<string | null>(null);
  const [refundSubmittingTrip, setRefundSubmittingTrip] = useState<string | null>(null);

  const queue = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.user_id === profile?.id &&
          (t.status === 'On Trip' || t.status === 'Pending Settlement')
      ),
    [trips, profile]
  );

  const refundQueue = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.user_id === profile?.id &&
          t.status === 'Pending Refund'
      ),
    [trips, profile]
  );

  const bandingQueue = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.user_id === profile?.id &&
          t.status === 'Rejected' &&
          !!t.settlement_result
      ),
    [trips, profile]
  );

  const startReport = (t: BizTrip) => {
    setSelectedTrip(t.id);
    setSelected(t);
    setWorkResult(t.work_result ?? '');
    setRealDays(t.total_days || daysBetween(t.departure_date, t.return_date));
    setPendingTask(t.pending_task ?? '');
    setNextProject(t.next_project ?? '');
    setReceipts([]);
  };

  const addReceipt = () => {
    setReceipts((rows) => [
      ...rows,
      {
        id: uid(),
        category: RECEIPT_CATEGORIES[0],
        description: '',
        amount: 0,
        fileUrl: null,
        uploading: false,
      },
    ]);
  };

  const updateReceipt = (id: string, patch: Partial<ReceiptInput>) => {
    setReceipts((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const removeReceipt = (id: string) => {
    setReceipts((rows) => rows.filter((row) => row.id !== id));
  };

  const uploadReceiptImage = async (id: string, file: File | null) => {
    if (!file) return;

    updateReceipt(id, { uploading: true });

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${selected?.id || 'settlement'}_${Date.now()}_${uid()}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);

      updateReceipt(id, {
        fileUrl: data.publicUrl,
        uploading: false,
      });

      showToast('success', 'Bukti pengeluaran berhasil diunggah');
    } catch (e: any) {
      updateReceipt(id, { uploading: false });
      showToast('error', 'Gagal upload bukti: ' + e.message);
    }
  };

  const validation = useMemo(() => {
    const errors: string[] = [];

    if (!workResult.trim()) {
      errors.push('Laporan Hasil Pekerjaan wajib diisi');
    }

    if (realDays < 1) {
      errors.push('Total hari riil wajib diisi');
    }

    receipts.forEach((receipt, index) => {
      if (!receipt.category) {
        errors.push(`Receipt ${index + 1}: kategori wajib diisi`);
      }

      if (receipt.amount > 0 && !receipt.fileUrl) {
        errors.push(`Receipt ${index + 1}: nominal diisi tetapi bukti belum diunggah`);
      }
    });

    return errors;
  }, [workResult, realDays, receipts]);

  const totalActual = receipts.reduce(
    (sum, receipt) => sum + Number(receipt.amount || 0),
    0
  );

  const canSubmit =
    validation.length === 0 &&
    workResult.trim().length > 0;

  const submit = async () => {
    if (!selected || !canSubmit) {
      showToast('error', `Form belum lengkap: ${validation.length} validasi`);
      return;
    }

    try {
      /*
       * Jika settlement pernah disubmit ulang,
       * bersihkan receipt transaksi sebelumnya.
       *
       * Refund proof tidak ikut dihapus.
       */
      const { error: deleteError } = await supabase
        .from('settlement_receipts')
        .delete()
        .eq('trip_id', selected.id)
        .neq('category', 'Refund Transfer Proof');

      if (deleteError) throw deleteError;

      for (const receipt of receipts) {
        const { error } = await supabase.from('settlement_receipts').insert({
          trip_id: selected.id,
          category: receipt.category,
          description: receipt.description,
          amount: receipt.amount,
          file_base64: receipt.fileUrl,
          hr_status: 'pending',
          hr_approved_amount: null,
          hr_note: null,
        });

        if (error) throw error;
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

      const { error: trackingError } = await supabase
        .from('trip_tracking')
        .insert({
          trip_id: selected.id,
          actor_name: profile?.name ?? '',
          actor_role: 'Employee',
          action: 'Settlement submitted',
          from_status: selected.status,
          to_status: 'Pending HR Settlement Review',
          remarks: `Realisasi diajukan ${formatIDR(totalActual)}`,
        });

      if (trackingError) throw trackingError;

      showToast('success', 'Laporan settlement berhasil dikirim ke HR');

      setSelected(null);
      setReceipts([]);
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal submit settlement: ' + (e.message || 'Terjadi kesalahan'));
    }
  };

  /*
   * REFUND FLOW
   */
  const getRefundAmount = (trip: BizTrip) => {
    const accountableAdvance = Number(trip.cost_data?.accountable?.total) || 0;
    const approvedActual = Number(trip.approved_total) || 0;

    return Math.max(0, accountableAdvance - approvedActual);
  };

  const uploadRefundProof = async (trip: BizTrip, file: File | null) => {
    if (!file) return;

    setRefundUploadingTrip(trip.id);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${trip.id}_refund_${Date.now()}.${fileExt}`;
      const filePath = `refunds/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);

      setRefundProofs((prev) => ({
        ...prev,
        [trip.id]: data.publicUrl,
      }));

      showToast('success', 'Bukti transfer refund berhasil diunggah');
    } catch (e: any) {
      showToast('error', 'Gagal upload bukti refund: ' + e.message);
    } finally {
      setRefundUploadingTrip(null);
    }
  };

  const submitRefundProof = async (trip: BizTrip) => {
    const proofUrl = refundProofs[trip.id];

    if (!proofUrl) {
      showToast('error', 'Bukti transfer refund wajib diunggah');
      return;
    }

    const refundAmount = getRefundAmount(trip);

    if (refundAmount <= 0) {
      showToast('error', 'Nominal refund tidak ditemukan');
      return;
    }

    setRefundSubmittingTrip(trip.id);

    try {
      /*
       * Hapus proof lama jika sebelumnya ditolak,
       * supaya hanya ada satu proof aktif terbaru.
       */
      const { error: deleteError } = await supabase
        .from('settlement_receipts')
        .delete()
        .eq('trip_id', trip.id)
        .eq('category', 'Refund Transfer Proof');

      if (deleteError) throw deleteError;

      const { error: receiptError } = await supabase
        .from('settlement_receipts')
        .insert({
          trip_id: trip.id,
          category: 'Refund Transfer Proof',
          description: 'Bukti transfer pengembalian dana perjalanan dinas',
          amount: refundAmount,
          file_base64: proofUrl,
          hr_status: 'pending',
          hr_approved_amount: null,
          hr_note: null,
        });

      if (receiptError) throw receiptError;

      await updateTrip(trip.id, {
        status: 'Pending Refund Verification',
      });

      const { error: trackingError } = await supabase
        .from('trip_tracking')
        .insert({
          trip_id: trip.id,
          actor_name: profile?.name ?? '',
          actor_role: 'Employee',
          action: 'Refund transfer proof submitted',
          from_status: 'Pending Refund',
          to_status: 'Pending Refund Verification',
          remarks: `Refund ${formatIDR(refundAmount)}`,
        });

      if (trackingError) throw trackingError;

      setRefundProofs((prev) => ({
        ...prev,
        [trip.id]: null,
      }));

      showToast(
        'success',
        'Bukti refund berhasil dikirim dan menunggu verifikasi HR'
      );

      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal submit bukti refund: ' + e.message);
    } finally {
      setRefundSubmittingTrip(null);
    }
  };

  const ajukanBanding = async (t: BizTrip) => {
    const reason = window.prompt(
      'Tulis alasan banding dan penjelasan tambahan:'
    );

    if (!reason?.trim()) return;

    try {
      await updateTrip(t.id, {
        banding_reason: reason,
        banding_at: new Date().toISOString(),
        status: 'Pending HR Settlement Review',
      });

      await supabase.from('trip_tracking').insert({
        trip_id: t.id,
        actor_name: profile?.name ?? '',
        actor_role: 'Employee',
        action: 'Settlement appeal submitted',
        from_status: t.status,
        to_status: 'Pending HR Settlement Review',
        remarks: reason,
      });

      showToast('success', 'Banding settlement berhasil diajukan');
      refresh();
    } catch (e: any) {
      showToast('error', 'Gagal mengajukan banding: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
          <FileText className="w-5 h-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Settlement Report
          </h2>
          <p className="text-sm text-slate-500">
            Laporan pertanggungjawaban perjalanan dinas
          </p>
        </div>
      </div>

      {/* REFUND */}
      {refundQueue.length > 0 && (
        <Card className="p-6 ring-1 ring-rose-200">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-bold text-rose-700">
              Pengembalian Dana Perjalanan Dinas
            </h3>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Terdapat selisih dana yang perlu dikembalikan. Upload bukti
            transfer untuk diverifikasi HR.
          </p>

          <div className="space-y-3">
            {refundQueue.map((t) => {
              const accountableAdvance =
                Number(t.cost_data?.accountable?.total) || 0;

              const approvedActual =
                Number(t.approved_total) || 0;

              const refundAmount = getRefundAmount(t);
              const proofUrl = refundProofs[t.id];
              const uploading = refundUploadingTrip === t.id;
              const submitting = refundSubmittingTrip === t.id;

              return (
                <div
                  key={t.id}
                  className="rounded-xl ring-1 ring-rose-100 p-4 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">
                        {t.purpose}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {t.settlement_number || 'Settlement'} · {t.requester_name}
                      </div>
                    </div>

                    <StatusBadge status={t.status} />
                  </div>

                  <div className="grid md:grid-cols-3 gap-3">
                    <SummaryBox
                      label="Advance Accountable"
                      value={accountableAdvance}
                    />

                    <SummaryBox
                      label="Actual Approved"
                      value={approvedActual}
                    />

                    <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                      <div className="text-[10px] uppercase tracking-wide font-bold text-rose-500">
                        Refund
                      </div>
                      <div className="text-base font-bold text-rose-700 mt-1">
                        {formatIDR(refundAmount)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2">
                      Bukti Transfer Refund
                    </div>

                    <input
                      type="file"
                      accept="image/*,.pdf"
                      disabled={uploading || submitting}
                      onChange={(e) =>
                        uploadRefundProof(t, e.target.files?.[0] ?? null)
                      }
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700"
                    />

                    {uploading && (
                      <div className="text-xs text-slate-500 mt-2">
                        Uploading...
                      </div>
                    )}

                    {proofUrl && !uploading && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mt-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Bukti transfer sudah terunggah
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      icon={<Send className="w-3.5 h-3.5" />}
                      disabled={!proofUrl || uploading || submitting}
                      onClick={() => submitRefundProof(t)}
                    >
                      {submitting ? 'Mengirim...' : 'Kirim ke HR'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* BANDING */}
      {bandingQueue.length > 0 && (
        <Card className="p-6 ring-1 ring-amber-200">
          <h3 className="text-sm font-bold text-amber-700 mb-3 flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Banding Settlement
          </h3>

          <div className="space-y-2">
            {bandingQueue.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl ring-1 ring-amber-100 p-3"
              >
                <div className="text-sm">
                  <span className="font-semibold">{t.purpose}</span>
                  <span className="text-xs text-slate-400">
                    {' '}· {t.settlement_result}
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={() => ajukanBanding(t)}
                >
                  Ajukan Banding
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* SETTLEMENT QUEUE */}
      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState
              icon={<MapPin className="w-6 h-6" />}
              title="Tidak ada trip untuk settlement"
              message="Trip yang sedang berlangsung atau menunggu settlement akan muncul di sini."
            />
          ) : (
            <div className="space-y-2">
              {queue.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl ring-1 ring-slate-100 hover:ring-purple-200 transition p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">
                      {t.purpose}
                    </div>

                    <div className="text-xs text-slate-400 mt-0.5">
                      {formatDate(t.departure_date)} · Advance:{' '}
                      {formatIDR(Number(t.cost_grand_total) || 0)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={t.status} />

                    <Button
                      size="sm"
                      onClick={() => startReport(t)}
                    >
                      Isi Laporan
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* SETTLEMENT FORM */}
      {selected && (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                Form Laporan Pertanggungjawaban
              </h3>

              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Tutup
              </button>
            </div>

            <Field label="Laporan Hasil Pekerjaan" required>
              <Textarea
                rows={4}
                value={workResult}
                onChange={(e) => setWorkResult(e.target.value)}
                placeholder="Tulis laporan hasil pekerjaan selama dinas..."
              />
            </Field>

            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Tanggal Realisasi Selesai" required>
                <Input
                  type="date"
                  value={selected.return_date}
                  disabled
                  className="bg-slate-50"
                />
              </Field>

              <Field label="Total Hari Riil di Lapangan" required>
                <Input
                  type="number"
                  min={1}
                  value={realDays}
                  onChange={(e) =>
                    setRealDays(parseInt(e.target.value) || 1)
                  }
                />
              </Field>

              <Field label="Advance Diterima">
                <Input
                  value={formatIDR(Number(selected.cost_grand_total) || 0)}
                  disabled
                  className="bg-slate-50"
                />
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Pending Task (opsional)">
                <Textarea
                  rows={2}
                  value={pendingTask}
                  onChange={(e) => setPendingTask(e.target.value)}
                  placeholder="Tugas tertunda..."
                />
              </Field>

              <Field label="Next Project (opsional)">
                <Textarea
                  rows={2}
                  value={nextProject}
                  onChange={(e) => setNextProject(e.target.value)}
                  placeholder="Rencana project berikutnya..."
                />
              </Field>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-slate-400" />
                Rincian Pengeluaran Aktual + Bukti
              </h3>

              <Button
                size="sm"
                variant="secondary"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={addReceipt}
              >
                Add Row
              </Button>
            </div>

            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Setiap item bernominal wajib disertai bukti.
            </p>

            {receipts.length === 0 ? (
              <EmptyState
                icon={<Upload className="w-6 h-6" />}
                title="Belum ada receipt"
                message="Klik Add Row untuk menambahkan pengeluaran aktual."
              />
            ) : (
              <div className="space-y-2">
                {receipts.map((receipt, index) => (
                  <div
                    key={receipt.id}
                    className="rounded-xl ring-1 ring-slate-200 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">
                        Receipt {index + 1}
                      </span>

                      <button
                        onClick={() => removeReceipt(receipt.id)}
                        className="text-rose-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid md:grid-cols-4 gap-2">
                      <Select
                        value={receipt.category}
                        onChange={(e) =>
                          updateReceipt(receipt.id, {
                            category: e.target.value,
                          })
                        }
                      >
                        {RECEIPT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </Select>

                      <Input
                        value={receipt.description}
                        onChange={(e) =>
                          updateReceipt(receipt.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Deskripsi"
                      />

                      <Input
                        type="number"
                        min={0}
                        value={receipt.amount}
                        onChange={(e) =>
                          updateReceipt(receipt.id, {
                            amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="Nominal (Rp)"
                      />

                      <div
                        className={`rounded-xl px-3 py-2 text-xs font-semibold text-center ${
                          receipt.fileUrl
                            ? 'bg-emerald-50 text-emerald-600'
                            : receipt.amount > 0
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {receipt.uploading
                          ? 'Uploading...'
                          : receipt.fileUrl
                          ? 'Bukti terunggah'
                          : 'Belum ada bukti'}
                      </div>
                    </div>

                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) =>
                        uploadReceiptImage(
                          receipt.id,
                          e.target.files?.[0] ?? null
                        )
                      }
                      className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-sm font-semibold text-slate-600">
                Total Pengeluaran Aktual
              </span>

              <span className="text-lg font-bold text-slate-800">
                {formatIDR(totalActual)}
              </span>
            </div>
          </Card>

          {validation.length > 0 && (
            <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4">
              <div className="text-sm font-bold text-amber-800">
                {validation.length} validasi belum terpenuhi:
              </div>

              <ul className="mt-1 text-xs text-amber-700">
                {validation.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 justify-end pb-6">
            <Button
              variant="secondary"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>

            <Button
              onClick={submit}
              disabled={!canSubmit}
              icon={<Send className="w-4 h-4" />}
            >
              Submit Settlement
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
        {label}
      </div>

      <div className="text-base font-bold text-slate-800 mt-1">
        {formatIDR(value)}
      </div>
    </div>
  );
}
