import { useState, useMemo } from 'react';
import { Calculator, Plus, Trash2, Check, Save, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field, Textarea, EmptyState, formatIDR } from './ui-shared';
import { PT_OPTIONS, SCHEME_OVERRIDE_OPTIONS } from '../lib/constants';
import { computeCost, defaultKPScheme, daysBetween, generateSpdNumber } from '../lib/costCalc';
import { uid, formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip, KPScheme, TripCategory } from '../lib/types';

export function CostCalculation({ onPrint }: { onPrint: (id: string) => void }) {
  const { profile } = useAuth();
  const { trips, disburseRows, updateTrip, showToast, refresh } = useApp();
  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [totalDays, setTotalDays] = useState(1);
  const [kpScheme, setKpScheme] = useState<KPScheme>('KP2');
  const [schemeOverride, setSchemeOverride] = useState('');
  const [hotelByHR, setHotelByHR] = useState(true);
  const [manualFuel, setManualFuel] = useState(0);
  const [manualEtoll, setManualEtoll] = useState(0);
  const [perPersonOverride, setPerPersonOverride] = useState<Record<string, number>>({});
  const [hotelOverride, setHotelOverride] = useState<Record<string, number>>({});
  const [spdNumber, setSpdNumber] = useState('');
  const [hrNotes, setHrNotes] = useState('');
  
  // Tabel B: Rangkuman Pembiayaan (Split Cost Center & Beban Perusahaan Manual)
  const [extraRows, setExtraRows] = useState<{ id: string; name: string; nominal: number; keterangan: string; pt_burden: string }[]>([]);

  const queue = useMemo(() => trips.filter((t) => t.status === 'Pending HR Advance Review'), [trips]);

  const startReview = (t: BizTrip) => {
    setSelected(t);
    const activeScheme = t.kp_scheme ?? defaultKPScheme(t.itinerary ?? []);
    setKpScheme(activeScheme);
    setSchemeOverride('');
    setTotalDays(t.total_days || daysBetween(t.departure_date, t.return_date));
    setManualFuel(Number(t.fuel_cost) || 0);
    setManualEtoll(Number(t.etoll_cost) || 0);
    setPerPersonOverride({});
    setHotelOverride({});
    
    // Auto & Editable Nomor SPD sesuai Format Matriks [SKEMA]-[NO]/[NAMA PEGAWAI]
    const defaultSpd = generateSpdNumber(activeScheme, queue.length + 1, t.requester_name);
    setSpdNumber(t.spd_number ?? defaultSpd);
    
    setHrNotes(t.hr_notes ?? '');
    const existing = disburseRows.filter((d) => d.trip_id === t.id);
    setExtraRows(existing.length > 0 ? existing.map((d) => ({ id: d.id, name: d.name, nominal: Number(d.nominal), keterangan: d.component_note, pt_burden: d.pt_burden })) : []);
  };

  const cost = useMemo(() => {
    if (!selected) return null;
    const effectiveTripCategory: TripCategory = schemeOverride.startsWith('within_city') || schemeOverride === 'luar_kota' ? (schemeOverride as TripCategory) : selected.trip_category;
    const effectiveKpScheme: KPScheme = (['KP1', 'KP2', 'KPO'].includes(schemeOverride) ? schemeOverride : kpScheme) as KPScheme;
    const c = computeCost({
      participants: selected.participants ?? [], days: totalDays, itinerary: selected.itinerary ?? [],
      origin: selected.origin, tripCategory: effectiveTripCategory, kpScheme: effectiveKpScheme,
      needsDriver: selected.needs_driver, fuelCost: manualFuel, etollCost: manualEtoll, hotelByHR,
    });
    
    // Apply per-person overrides oleh HR di Tabel A
    const adjustedPP = c.perParticipant.map((pp) => ({
      ...pp,
      total: perPersonOverride[pp.name] ?? pp.total,
      hotel: hotelOverride[pp.name] ?? pp.hotel,
    }));
    const perDiemTotal = adjustedPP.reduce((s, p) => s + p.total, 0);
    const hotelTotal = adjustedPP.reduce((s, p) => s + p.hotel, 0);
    const extraTotal = extraRows.reduce((s, r) => s + r.nominal, 0);
    
    // Grand Total Advance diambil murni dari kalkulasi riil Tabel A
    const grandTotal = perDiemTotal + hotelTotal + c.driverTotal + c.pettyCashTotal + manualFuel + manualEtoll;
    return { ...c, perParticipant: adjustedPP, perDiemTotal, hotelTotal, grandTotal, extraTotal, effectiveKpScheme };
  }, [selected, schemeOverride, kpScheme, totalDays, manualFuel, manualEtoll, hotelByHR, perPersonOverride, hotelOverride, extraRows]);

  // Fungsi menyalin data Tabel A ke Tabel B untuk di-breakdown HR
  const generateCostSplitFromTableA = () => {
    if (!selected || !cost) return;

    const rows: { id: string; name: string; nominal: number; keterangan: string; pt_burden: string }[] = [];

    // Breakdown Tunjangan & Pettycash per orang dari Tabel A ke Tabel B
    cost.perParticipant.forEach((pp) => {
      if (pp.total > 0) {
        rows.push({
          id: uid(),
          name: pp.name,
          nominal: pp.total,
          keterangan: 'Tunjangan',
          pt_burden: PT_OPTIONS[0],
        });
      }
      if (pp.pettyCash > 0) {
        rows.push({
          id: uid(),
          name: pp.name,
          nominal: pp.pettyCash,
          keterangan: 'Pettycash',
          pt_burden: PT_OPTIONS[0],
        });
      }
    });

    // Masukkan operasional armada jika ada
    if (manualFuel + manualEtoll > 0) {
      rows.push({
        id: uid(),
        name: selected.requester_name,
        nominal: manualFuel + manualEtoll,
        keterangan: 'BBM & E-Toll',
        pt_burden: PT_OPTIONS[0],
      });
    }

    setExtraRows(rows);
    showToast('info', 'Data Tabel A berhasil disalin ke Tabel B. Silakan pecah nominal & atur Beban Perusahaan.');
  };

  const addExtraRow = () => setExtraRows((r) => [...r, { id: uid(), name: selected?.requester_name ?? '', nominal: 0, keterangan: '', pt_burden: PT_OPTIONS[0] }]);
  const updateExtraRow = (id: string, patch: Partial<{ name: string; nominal: number; keterangan: string; pt_burden: string }>) =>
    setExtraRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeExtraRow = (id: string) => setExtraRows((r) => r.filter((x) => x.id !== id));

  const approve = async () => {
    if (!selected || !cost) return;
    try {
      await updateTrip(selected.id, {
        spd_number: spdNumber,
        hr_notes: hrNotes || null,
        kp_scheme: cost.effectiveKpScheme,
        total_days: totalDays,
        cost_grand_total: cost.grandTotal,
        fuel_cost: manualFuel,
        etoll_cost: manualEtoll,
        cost_data: { perParticipant: cost.perParticipant, extraRows, pettyCashHolder: cost.pettyCashHolder },
        status: 'Approved / Ready for Trip',
        approved_at: new Date().toISOString(),
        spd_issued_at: new Date().toISOString(),
      });

      // Simpan Rangkuman Pembiayaan (Tabel B) ke database disburse_rows
      await supabase.from('disburse_rows').delete().eq('trip_id', selected.id);
      for (let i = 0; i < extraRows.length; i++) {
        const r = extraRows[i];
        await supabase.from('disburse_rows').insert({ id: r.id, trip_id: selected.id, name: r.name, nominal: r.nominal, component_note: r.keterangan, pt_burden: r.pt_burden, sort_order: i });
      }

      await supabase.from('trip_tracking').insert({ 
        trip_id: selected.id, 
        actor_name: profile?.name ?? '', 
        actor_role: 'HR Manager', 
        action: 'HR Advance Approved -> Ready for Trip', 
        from_status: 'Pending HR Advance Review', 
        to_status: 'Approved / Ready for Trip', 
        remarks: hrNotes || 'Auto-approved by HR' 
      });
      showToast('success', 'Advance disetujui. SPD siap dicetak.');
      setSelected(null);
      refresh();
    } catch (e: any) { showToast('error', 'Gagal approve: ' + e.message); }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Calculator className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Cost & Advance Review</h2>
          <p className="text-sm text-slate-500">HR Manager · Hak Edit Absolut · {queue.length} pengajuan menunggu</p>
        </div>
      </div>

      {/* Antrean Review HR */}
      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState icon={<Calculator className="w-6 h-6" />} title="Tidak ada pengajuan menunggu" message="Tidak ada trip yang menunggu review advance dari HR." />
          ) : (
            <div className="space-y-2">
              {queue.map((t) => (
                <div key={t.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-brand-200 transition p-4 flex items-center justify-between bg-white shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-extrabold text-slate-900">{t.requester_name}</div>
                    <div className="text-sm font-semibold text-slate-700 truncate mt-0.5">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {formatDate(t.departure_date)} · Estimasi: {formatIDR(Number(t.cost_grand_total) || 0)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => startReview(t)}>Review Advance</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* HR Review Panel */}
      {selected && cost && (
        <>
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">HR Override Editor — Pegawai Pemohon: {selected.requester_name}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs font-semibold">Tutup</button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Total Hari Dinas">
                <Input type="number" min={1} value={totalDays} onChange={(e) => setTotalDays(parseInt(e.target.value) || 1)} />
              </Field>
              <Field label="BBM Manual (Rp)">
                <Input type="number" value={manualFuel} onChange={(e) => setManualFuel(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="E-Toll Manual (Rp)">
                <Input type="number" value={manualEtoll} onChange={(e) => setManualEtoll(parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
            <Field label="Override Skema Perhitungan">
              <Select value={schemeOverride} onChange={(e) => setSchemeOverride(e.target.value)}>
                <option value="">Auto (dari itinerary)</option>
                {SCHEME_OVERRIDE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer bg-amber-50/60 p-3 rounded-xl border border-amber-200">
              <input type="checkbox" checked={hotelByHR} onChange={(e) => setHotelByHR(e.target.checked)} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
              <span className="text-xs font-bold text-amber-900">Akomodasi Hotel Dipesan HR (Centang = nilai hotel Rp 0 & tidak cair ke Advance karyawan)</span>
            </label>
          </Card>

          {/* TABEL A: Rincian Perhitungan Pembiayaan (Hitungan Otomatis Sistem) */}
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-brand-500" /> A. Rincian Perhitungan Pembiayaan
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <th className="py-2 px-3 border border-slate-200 font-bold" rowSpan={2}>Nama</th>
                    <th className="py-2 px-3 border border-slate-200 font-bold text-center" colSpan={3}>Tunjangan</th>
                    <th className="py-2 px-3 border border-slate-200 font-bold" rowSpan={2}>BBM</th>
                    <th className="py-2 px-3 border border-slate-200 font-bold" rowSpan={2}>E-Toll</th>
                    <th className="py-2 px-3 border border-slate-200 font-bold" rowSpan={2}>Pettycash</th>
                    <th className="py-2 px-3 border border-slate-200 font-bold" rowSpan={2}>Subtotal</th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                    <th className="py-1 px-2 border border-slate-200 text-center">Per Hari</th>
                    <th className="py-1 px-2 border border-slate-200 text-center">Hari</th>
                    <th className="py-1 px-2 border border-slate-200 text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.perParticipant.map((pp, i) => {
                    const dailyRate = totalDays > 0 ? (perPersonOverride[pp.name] ?? pp.total) / totalDays : 0;
                    const subtotalPerson = (perPersonOverride[pp.name] ?? pp.total) + pp.pettyCash;
                    return (
                      <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                        <td className="py-2 px-3 border border-slate-200 font-semibold text-slate-800">{pp.name}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right">{formatIDR(dailyRate)}</td>
                        <td className="py-2 px-3 border border-slate-200 text-center">{totalDays}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right font-medium">{formatIDR(perPersonOverride[pp.name] ?? pp.total)}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right">{i === 0 && manualFuel > 0 ? formatIDR(manualFuel) : '-'}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right">{i === 0 && manualEtoll > 0 ? formatIDR(manualEtoll) : '-'}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right font-medium">{pp.pettyCash > 0 ? formatIDR(pp.pettyCash) : '-'}</td>
                        <td className="py-2 px-3 border border-slate-200 text-right font-bold text-slate-900">{formatIDR(subtotalPerson)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td className="py-2 px-3 border border-slate-200 text-center">Total</td>
                    <td className="py-2 px-3 border border-slate-200" colSpan={2}></td>
                    <td className="py-2 px-3 border border-slate-200 text-right">{formatIDR(cost.perDiemTotal)}</td>
                    <td className="py-2 px-3 border border-slate-200 text-right">{manualFuel > 0 ? formatIDR(manualFuel) : '-'}</td>
                    <td className="py-2 px-3 border border-slate-200 text-right">{manualEtoll > 0 ? formatIDR(manualEtoll) : '-'}</td>
                    <td className="py-2 px-3 border border-slate-200 text-right">{formatIDR(cost.pettyCashTotal)}</td>
                    <td className="py-2 px-3 border border-slate-200 text-right font-black text-brand-800">{formatIDR(cost.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* TABEL B: Rangkuman Pembiayaan (Split Cost Center & Beban Perusahaan Manual) */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">B. Rangkuman Pembiayaan (Split Cost Center Manual)</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  HR memecah nominal biaya per baris dan menentukan Beban Perusahaan (PT) terkait.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={generateCostSplitFromTableA}>
                  Auto-Fill dari Tabel A
                </Button>
                <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addExtraRow}>
                  Add Row Biaya
                </Button>
              </div>
            </div>

            {extraRows.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Belum ada rincian pemecahan biaya. Klik "Auto-Fill dari Tabel A" atau "Add Row Biaya".
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-200">
                  <thead>
                    <tr className="text-left bg-slate-50 text-slate-700 border-b border-slate-200">
                      <th className="py-2 px-3 border border-slate-200 font-bold w-1/4">Nama</th>
                      <th className="py-2 px-3 border border-slate-200 font-bold w-1/5">Nominal (Rp)</th>
                      <th className="py-2 px-3 border border-slate-200 font-bold w-1/4">Keterangan</th>
                      <th className="py-2 px-3 border border-slate-200 font-bold w-1/4">Beban Perusahaan</th>
                      <th className="py-2 px-2 border border-slate-200 w-10 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraRows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50/50">
                        <td className="p-1.5 border border-slate-200">
                          <Input
                            className="w-full py-1 text-xs"
                            value={r.name}
                            onChange={(e) => updateExtraRow(r.id, { name: e.target.value })}
                            placeholder="misal: Idris"
                          />
                        </td>
                        <td className="p-1.5 border border-slate-200">
                          <Input
                            type="number"
                            className="w-full py-1 text-xs font-semibold"
                            value={r.nominal}
                            onChange={(e) => updateExtraRow(r.id, { nominal: parseFloat(e.target.value) || 0 })}
                            placeholder="Nominal"
                          />
                        </td>
                        <td className="p-1.5 border border-slate-200">
                          <Input
                            className="w-full py-1 text-xs"
                            value={r.keterangan}
                            onChange={(e) => updateExtraRow(r.id, { keterangan: e.target.value })}
                            placeholder="misal: Tunjangan / Pettycash TMB"
                          />
                        </td>
                        <td className="p-1.5 border border-slate-200">
                          <Select
                            className="w-full py-1 text-xs"
                            value={r.pt_burden}
                            onChange={(e) => updateExtraRow(r.id, { pt_burden: e.target.value })}
                          >
                            {PT_OPTIONS.map((pt) => (
                              <option key={pt} value={pt}>{pt}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="p-1.5 border border-slate-200 text-center">
                          <button
                            onClick={() => removeExtraRow(r.id)}
                            className="text-rose-400 hover:text-rose-600 inline-flex items-center justify-center p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 font-semibold text-slate-700">
              <span>Total Alokasi Rangkuman Pembiayaan (Tabel B)</span>
              <span className="font-bold text-slate-900">{formatIDR(cost.extraTotal)}</span>
            </div>
          </Card>

          {/* Form Akhir & Simpan */}
          <Card className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nomor SPD" hint="Format: [SKEMA]-[NO]/[NAMA]" required>
                <Input value={spdNumber} onChange={(e) => setSpdNumber(e.target.value)} placeholder="KP2-172/Idris" />
              </Field>
              <Field label="HR Notes" hint="Opsional">
                <Textarea rows={2} value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} placeholder="Catatan modifikasi HR..." />
              </Field>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-base font-bold text-brand-800">Grand Total Advance Biaya SPD</span>
              <span className="text-2xl font-black text-brand-800">{formatIDR(cost.grandTotal)}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Cancel</Button>
              <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={() => { updateTrip(selected.id, { cost_grand_total: cost.grandTotal, hr_notes: hrNotes }); showToast('success', 'Disimpan sementara'); }}>Save Draft</Button>
              <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={approve}>Approve Advance</Button>
            </div>
          </Card>

          {selected.status === 'Approved / Ready for Trip' && (
            <Card className="p-6">
              <Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5" />} onClick={() => onPrint(selected.id)}>Cetak PDF SPD</Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
