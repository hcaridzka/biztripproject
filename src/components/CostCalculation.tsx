import { useState, useMemo } from 'react';
import { Calculator, Plus, Trash2, Check, Save, AlertCircle, FileText } from 'lucide-react';
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
  // Table 2: additional cost rows
  const [extraRows, setExtraRows] = useState<{ id: string; name: string; nominal: number; keterangan: string; pt_burden: string }[]>([]);

  const queue = useMemo(() => trips.filter((t) => t.status === 'Pending HR Advance Review'), [trips]);

  const startReview = (t: BizTrip) => {
    setSelected(t);
    setKpScheme(t.kp_scheme ?? defaultKPScheme(t.itinerary ?? []));
    setSchemeOverride('');
    setTotalDays(t.total_days || daysBetween(t.departure_date, t.return_date));
    setManualFuel(Number(t.fuel_cost) || 0);
    setManualEtoll(Number(t.etoll_cost) || 0);
    setPerPersonOverride({});
    setHotelOverride({});
    setSpdNumber(t.spd_number ?? generateSpdNumber(t.kp_scheme ?? 'KP1', queue.length + 1, t.requester_name));
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
    // Apply per-person overrides
    const adjustedPP = c.perParticipant.map((pp) => ({
      ...pp,
      total: perPersonOverride[pp.name] ?? pp.total,
      hotel: hotelOverride[pp.name] ?? pp.hotel,
    }));
    const perDiemTotal = adjustedPP.reduce((s, p) => s + p.total, 0);
    const hotelTotal = adjustedPP.reduce((s, p) => s + p.hotel, 0);
    const extraTotal = extraRows.reduce((s, r) => s + r.nominal, 0);
    const grandTotal = perDiemTotal + hotelTotal + c.driverTotal + c.pettyCashTotal + manualFuel + manualEtoll;
    return { ...c, perParticipant: adjustedPP, perDiemTotal, hotelTotal, grandTotal, extraTotal, effectiveKpScheme };
  }, [selected, schemeOverride, kpScheme, totalDays, manualFuel, manualEtoll, hotelByHR, perPersonOverride, hotelOverride, extraRows]);

  const addExtraRow = () => setExtraRows((r) => [...r, { id: uid(), name: '', nominal: 0, keterangan: '', pt_burden: PT_OPTIONS[0] }]);
  const updateExtraRow = (id: string, patch: Partial<{ name: string; nominal: number; keterangan: string; pt_burden: string }>) =>
    setExtraRows((r) => r.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeExtraRow = (id: string) => setExtraRows((r) => r.filter((x) => x.id !== id));

  const hasOverride = Object.keys(perPersonOverride).length > 0 || Object.keys(hotelOverride).length > 0 || schemeOverride !== '';
  const canApprove = true; // HR Notes optional

  const approve = async () => {
    if (!selected || !cost) return;
    if (!canApprove) { showToast('error', 'Tidak bisa approve'); return; }
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
      // Save extra rows (Table 2) to disburse_rows
      await supabase.from('disburse_rows').delete().eq('trip_id', selected.id);
      for (let i = 0; i < extraRows.length; i++) {
        const r = extraRows[i];
        await supabase.from('disburse_rows').insert({ id: r.id, trip_id: selected.id, name: r.name, nominal: r.nominal, component_note: r.keterangan, pt_burden: r.pt_burden, sort_order: i });
      }
      await supabase.from('trip_tracking').insert({ trip_id: selected.id, actor_name: profile?.name ?? '', actor_role: 'HR Manager', action: 'HR Advance Approved -> Ready for Trip', from_status: 'Pending HR Advance Review', to_status: 'Approved / Ready for Trip', remarks: hrNotes || 'Auto-approved' });
      showToast('success', 'Advance disetujui. SPD siap dicetak.');
      setSelected(null);
      refresh();
    } catch (e: any) { showToast('error', 'Gagal: ' + e.message); }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><Calculator className="w-5 h-5" /></div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Cost & Advance Review</h2>
          <p className="text-sm text-slate-500">HR Manager · Hak Edit Absolut · {queue.length} menunggu</p>
        </div>
      </div>

      {/* Queue */}
      {!selected && (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState icon={<Calculator className="w-6 h-6" />} title="Tidak ada pengajuan menunggu" message="Tidak ada trip yang menunggu review advance." />
          ) : (
            <div className="space-y-2">
              {queue.map((t) => (
                <div key={t.id} className="rounded-xl ring-1 ring-slate-100 hover:ring-brand-200 transition p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{t.purpose}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t.requester_name} · {formatDate(t.departure_date)} · {formatIDR(Number(t.cost_grand_total) || 0)}</div>
                  </div>
                  <Button size="sm" onClick={() => startReview(t)}>Review</Button>
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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">HR Override Editor — {selected.requester_name}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xs">Tutup</button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Total Hari Dinas (Adjustable)">
                <Input type="number" min={1} value={totalDays} onChange={(e) => setTotalDays(parseInt(e.target.value) || 1)} />
              </Field>
              <Field label="BBM Manual (Rp) — Database Armada">
                <Input type="number" value={manualFuel} onChange={(e) => setManualFuel(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="E-Toll Manual (Rp) — Database Armada">
                <Input type="number" value={manualEtoll} onChange={(e) => setManualEtoll(parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
            <Field label="Override Skema Perhitungan">
              <Select value={schemeOverride} onChange={(e) => setSchemeOverride(e.target.value)}>
                <option value="">Auto (dari itinerary)</option>
                {SCHEME_OVERRIDE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={hotelByHR} onChange={(e) => setHotelByHR(e.target.checked)} className="w-4 h-4 rounded text-brand-600" />
              <span className="text-sm text-slate-700">Akomodasi Hotel Dipesan HR (centang = hotel tidak cair ke karyawan)</span>
            </label>
          </Card>

          {/* TABEL 1: Rincian Utama Harga Sistem (Editable by HR) */}
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Calculator className="w-4 h-4 text-brand-500" /> TABEL 1: Rincian Utama Harga Sistem (Editable)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3">Nama</th>
                    <th className="py-2 pr-3">Jabatan</th>
                    <th className="py-2 pr-3">Breakdown</th>
                    <th className="py-2 pr-3">Tunjangan (Rp)</th>
                    <th className="py-2 pr-3">Hotel (Rp)</th>
                    <th className="py-2 pr-3">Petty Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.perParticipant.map((pp, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-2 pr-3 font-semibold text-slate-700">{pp.name}</td>
                      <td className="py-2 pr-3 text-slate-500">{pp.jabatan}</td>
                      <td className="py-2 pr-3 text-slate-500">{pp.breakdown}</td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={perPersonOverride[pp.name] ?? pp.total} onChange={(e) => setPerPersonOverride((o) => ({ ...o, [pp.name]: parseFloat(e.target.value) || 0 }))} className="w-28 py-1.5 text-xs" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={hotelOverride[pp.name] ?? pp.hotel} onChange={(e) => setHotelOverride((o) => ({ ...o, [pp.name]: parseFloat(e.target.value) || 0 }))} className="w-28 py-1.5 text-xs" />
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{formatIDR(pp.pettyCash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-2">
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Total Tunjangan</div><div className="font-bold text-slate-800 mt-1">{formatIDR(cost.perDiemTotal)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Total Hotel</div><div className="font-bold text-slate-800 mt-1">{formatIDR(cost.hotelTotal)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">Total Petty Cash</div><div className="font-bold text-slate-800 mt-1">{formatIDR(cost.pettyCashTotal)}</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="text-slate-400">BBM + Toll</div><div className="font-bold text-slate-800 mt-1">{formatIDR(manualFuel + manualEtoll)}</div></div>
            </div>
            {cost.pettyCashHolder && (
              <div className="rounded-xl bg-brand-50 ring-1 ring-brand-200 px-4 py-2.5 text-sm font-bold text-brand-800">
                Petty Cash dipegang oleh: {cost.pettyCashHolder} ({cost.pettyCashTrips} trips)
              </div>
            )}
          </Card>

          {/* TABEL 2: Summary Pembagian Beban PT (TIDAK mempengaruhi Grand Total) */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">TABEL 2: Summary Pembagian Beban PT</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Alokasi beban antar PT — tidak menambah Grand Total Advance</p>
              </div>
              <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addExtraRow}>Add Row</Button>
            </div>
            {extraRows.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Belum ada baris biaya tambahan. Klik Add Row.</p>
            ) : (
              <div className="space-y-2">
                {extraRows.map((r) => (
                  <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl ring-1 ring-slate-200 p-2.5">
                    <Input className="md:col-span-4" value={r.name} onChange={(e) => updateExtraRow(r.id, { name: e.target.value })} placeholder="Nama Komponen Biaya" />
                    <Input className="md:col-span-2" type="number" value={r.nominal} onChange={(e) => updateExtraRow(r.id, { nominal: parseFloat(e.target.value) || 0 })} placeholder="Nominal" />
                    <Input className="md:col-span-3" value={r.keterangan} onChange={(e) => updateExtraRow(r.id, { keterangan: e.target.value })} placeholder="Keterangan" />
                    <Select className="md:col-span-2" value={r.pt_burden} onChange={(e) => updateExtraRow(r.id, { pt_burden: e.target.value })}>
                      {PT_OPTIONS.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                    </Select>
                    <button onClick={() => removeExtraRow(r.id)} className="md:col-span-1 text-rose-400 hover:text-rose-600 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100">
              <span className="text-slate-500">Total Alokasi Beban PT (reference only)</span>
              <span className="font-bold text-slate-600">{formatIDR(cost.extraTotal)}</span>
            </div>
          </Card>

          {/* HR Notes + Grand Total */}
          <Card className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nomor SPD" required>
                <Input value={spdNumber} onChange={(e) => setSpdNumber(e.target.value)} placeholder="SPD-2025-0001" />
              </Field>
              <Field label="HR Notes" hint="Opsional">
                <Textarea rows={2} value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} placeholder="Catatan modifikasi HR..." />
              </Field>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-base font-bold text-brand-800">Grand Total Advance</span>
              <span className="text-2xl font-bold text-brand-800">{formatIDR(cost.grandTotal)}</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Cancel</Button>
              <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={() => { updateTrip(selected.id, { cost_grand_total: cost.grandTotal, hr_notes: hrNotes }); showToast('success', 'Disimpan sementara'); }}>Save Draft</Button>
              <Button size="sm" icon={<Check className="w-3.5 h-3.5" />} onClick={approve} disabled={!canApprove}>Approve Advance</Button>
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
