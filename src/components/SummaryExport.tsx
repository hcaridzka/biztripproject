import { useState, useMemo } from 'react';
import { BarChart3, Download, Users, Building2, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, Button, Select, Field } from './ui-shared';
import { PT_OPTIONS } from '../lib/constants';
import { formatIDR, downloadCSV } from '../lib/utils';
import type { BizTrip } from '../lib/types';

export function SummaryExport() {
  const { trips, vehicles } = useApp();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const monthTrips = useMemo(() => trips.filter((t) => t.created_at?.slice(0, 7) === month), [trips, month]);

  // Summary 1: Per Employee
  const perEmployee = useMemo(() => {
    const map: Record<string, { name: string; jabatan: string; days: number; freq: number; advance: number; actual: number }> = {};
    monthTrips.forEach((t) => {
      const key = t.requester_name;
      if (!map[key]) map[key] = { name: t.requester_name, jabatan: t.requester_jabatan, days: 0, freq: 0, advance: 0, actual: 0 };
      map[key].days += t.total_days || 0;
      map[key].freq += 1;
      map[key].advance += Number(t.cost_grand_total) || 0;
      map[key].actual += Number(t.realization_total) || 0;
    });
    return Object.values(map).map((e) => ({ ...e, variance: e.advance - e.actual }));
  }, [monthTrips]);

  // Summary 2: Per PT
  const perPT = useMemo(() => {
    const map: Record<string, { pt: string; trips: number; advance: number; actual: number }> = {};
    PT_OPTIONS.forEach((pt) => { map[pt] = { pt, trips: 0, advance: 0, actual: 0 }; });
    monthTrips.forEach((t) => {
      t.company_burden?.forEach((pt) => {
        if (!map[pt]) map[pt] = { pt, trips: 0, advance: 0, actual: 0 };
        map[pt].trips += 1;
        map[pt].advance += Number(t.cost_grand_total) || 0;
        map[pt].actual += Number(t.realization_total) || 0;
      });
    });
    return Object.values(map).filter((p) => p.trips > 0);
  }, [monthTrips]);

  // Summary 3: Per Vehicle (PIC Obligo)
  const perVehicle = useMemo(() => {
    const map: Record<string, { plate: string; type: string; fuel: number; toll: number; kmStart: number; kmEnd: number }> = {};
    monthTrips.forEach((t) => {
      if (t.obligo_vehicle_plate) {
        const key = t.obligo_vehicle_plate;
        if (!map[key]) map[key] = { plate: t.obligo_vehicle_plate, type: t.obligo_vehicle_type ?? '-', fuel: 0, toll: 0, kmStart: 0, kmEnd: 0 };
        map[key].fuel += Number(t.fuel_cost) || 0;
        map[key].toll += Number(t.etoll_cost) || 0;
        const km = parseInt(t.obligo_vehicle_km ?? '0') || 0;
        if (km > 0) { if (map[key].kmStart === 0 || km < map[key].kmStart) map[key].kmStart = km; if (km > map[key].kmEnd) map[key].kmEnd = km; }
      }
    });
    return Object.values(map).map((v) => ({ ...v, mileage: v.kmEnd - v.kmStart }));
  }, [monthTrips]);

  const exportCSV = () => {
    const rows: (string | number)[][] = [];
    rows.push(['SUMMARY BULANAN — Aridzka Group Business Trips']);
    rows.push(['Periode', month]);
    rows.push([]);
    rows.push(['=== SUMMARY PER EMPLOYEE ===']);
    rows.push(['Nama Pegawai', 'Jabatan', 'Jumlah Hari Dinas', 'Frekuensi Perjalanan', 'Total Advance', 'Total Aktual', 'Selisih Varian']);
    perEmployee.forEach((e: any) => rows.push([e.name, e.jabatan, e.days, e.freq, e.advance, e.actual, e.variance]));
    rows.push([]);
    rows.push(['=== SUMMARY PER PT ===']);
    rows.push(['Nama Unit PT', 'Total Transaksi', 'Akumulasi Advance', 'Akumulasi Aktual']);
    perPT.forEach((p) => rows.push([p.pt, p.trips, p.advance, p.actual]));
    rows.push([]);
    rows.push(['=== SUMMARY PER KENDARAAN (PIC OBLIGO) ===']);
    rows.push(['Plat Nomor', 'Jenis Mobil', 'Total BBM', 'Total E-Toll', 'KM Awal', 'KM Akhir', 'Selisih Mileage']);
    perVehicle.forEach((v) => rows.push([v.plate, v.type, v.fuel, v.toll, v.kmStart, v.kmEnd, v.mileage]));
    downloadCSV(`summary-${month}.csv`, rows);
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600"><BarChart3 className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Monthly Summary</h2>
          <p className="text-sm text-slate-500">Rekapitulasi 3-tier: Employee, PT, Kendaraan</p>
        </div>
        <Button icon={<Download className="w-4 h-4" />} onClick={exportCSV}>Export to CSV</Button>
      </div>

      <Card className="p-4">
        <div className="flex items-end gap-4">
          <Field label="Pilih Bulan"><Input type="month" value={month} onChange={(e: any) => setMonth(e.target.value)} className="w-48" /></Field>
          <div className="text-sm text-slate-500">{monthTrips.length} trips in period</div>
        </div>
      </Card>

      {/* Tier 1: Per Employee */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-brand-500" /> Summary Per Employee</h3>
        {perEmployee.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">Tidak ada data</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Nama</th><th className="py-2 pr-3">Jabatan</th><th className="py-2 pr-3">Hari</th><th className="py-2 pr-3">Frek</th><th className="py-2 pr-3">Advance</th><th className="py-2 pr-3">Aktual</th><th className="py-2 pr-3">Varian</th>
            </tr></thead>
            <tbody>{perEmployee.map((e, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-2 pr-3 font-semibold text-slate-700">{e.name}</td><td className="py-2 pr-3 text-slate-500">{e.jabatan}</td><td className="py-2 pr-3">{e.days}</td><td className="py-2 pr-3">{e.freq}</td>
                <td className="py-2 pr-3">{formatIDR(e.advance)}</td><td className="py-2 pr-3">{formatIDR(e.actual)}</td><td className="py-2 pr-3 font-semibold">{formatIDR(e.variance)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {/* Tier 2: Per PT */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4 text-brand-500" /> Summary Per PT (Beban Unit)</h3>
        {perPT.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">Tidak ada data</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Nama PT</th><th className="py-2 pr-3">Total Transaksi</th><th className="py-2 pr-3">Advance</th><th className="py-2 pr-3">Aktual</th>
            </tr></thead>
            <tbody>{perPT.map((p, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-2 pr-3 font-semibold text-slate-700">{p.pt}</td><td className="py-2 pr-3">{p.trips}</td><td className="py-2 pr-3">{formatIDR(p.advance)}</td><td className="py-2 pr-3">{formatIDR(p.actual)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      {/* Tier 3: Per Vehicle */}
      <Card className="p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-brand-500" /> Summary Per Kendaraan (PIC Obligo)</h3>
        {perVehicle.length === 0 ? <p className="text-xs text-slate-400 py-4 text-center">Tidak ada data</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-2 pr-3">Plat</th><th className="py-2 pr-3">Jenis</th><th className="py-2 pr-3">BBM</th><th className="py-2 pr-3">E-Toll</th><th className="py-2 pr-3">KM Awal</th><th className="py-2 pr-3">KM Akhir</th><th className="py-2 pr-3">Mileage</th>
            </tr></thead>
            <tbody>{perVehicle.map((v, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-2 pr-3 font-semibold text-slate-700">{v.plate}</td><td className="py-2 pr-3 text-slate-500">{v.type}</td><td className="py-2 pr-3">{formatIDR(v.fuel)}</td><td className="py-2 pr-3">{formatIDR(v.toll)}</td><td className="py-2 pr-3">{v.kmStart}</td><td className="py-2 pr-3">{v.kmEnd}</td><td className="py-2 pr-3 font-semibold">{v.mileage} km</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Input(props: any) {
  return <input {...props} className="w-full rounded-xl border-0 ring-1 ring-slate-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 transition" />;
}
