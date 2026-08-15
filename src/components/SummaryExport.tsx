import { useState, useMemo } from 'react';
import { BarChart3, Download, Users, Building2, Truck, FileSpreadsheet, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Field } from './ui-shared';
import { PT_OPTIONS } from '../lib/constants';
import { formatIDR } from '../lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function SummaryExport() {
  const { trips } = useApp();
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

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const empData = perEmployee.map((e: any) => ({
      'Nama Pegawai': e.name,
      'Jabatan': e.jabatan,
      'Jumlah Hari Dinas': e.days,
      'Frekuensi': e.freq,
      'Total Advance': e.advance,
      'Total Aktual': e.actual,
      'Selisih Varian': e.variance
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), 'Summary Employee');

    const ptData = perPT.map((p) => ({
      'Nama Unit PT': p.pt,
      'Total Transaksi': p.trips,
      'Akumulasi Advance': p.advance,
      'Akumulasi Aktual': p.actual
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ptData), 'Summary PT');

    const vehData = perVehicle.map((v) => ({
      'Plat Nomor': v.plate,
      'Jenis Mobil': v.type,
      'Total BBM': v.fuel,
      'Total E-Toll': v.toll,
      'KM Awal': v.kmStart,
      'KM Akhir': v.kmEnd,
      'Selisih Mileage': v.mileage
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vehData), 'Summary Kendaraan');

    XLSX.writeFile(wb, `Monthly-Summary-${month}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    doc.setFontSize(14);
    doc.text(`Monthly Summary Report — Periode ${month}`, 14, 15);

    doc.setFontSize(11);
    doc.text('1. Summary Per Employee', 14, 25);
    autoTable(doc, {
      startY: 28,
      head: [['Nama Pegawai', 'Jabatan', 'Hari', 'Frek', 'Advance', 'Aktual', 'Varian']],
      body: perEmployee.map((e) => [e.name, e.jabatan, e.days, e.freq, formatIDR(e.advance), formatIDR(e.actual), formatIDR(e.variance)]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;
    if (finalY > 170) { doc.addPage(); finalY = 20; }

    doc.text('2. Summary Per PT (Beban Unit)', 14, finalY);
    autoTable(doc, {
      startY: finalY + 3,
      head: [['Nama PT', 'Total Transaksi', 'Advance', 'Aktual']],
      body: perPT.map((p) => [p.pt, p.trips, formatIDR(p.advance), formatIDR(p.actual)]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    finalY = (doc as any).lastAutoTable.finalY + 10;
    if (finalY > 170) { doc.addPage(); finalY = 20; }

    doc.text('3. Summary Per Kendaraan (PIC Obligo)', 14, finalY);
    autoTable(doc, {
      startY: finalY + 3,
      head: [['Plat Nomor', 'Jenis', 'BBM', 'E-Toll', 'KM Awal', 'KM Akhir', 'Mileage']],
      body: perVehicle.map((v) => [v.plate, v.type, formatIDR(v.fuel), formatIDR(v.toll), v.kmStart, v.kmEnd, `${v.mileage} km`]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`Monthly-Summary-${month}.pdf`);
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600"><BarChart3 className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Monthly Summary</h2>
          <p className="text-sm text-slate-500">Rekapitulasi 3-tier: Employee, PT, Kendaraan</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />} onClick={exportExcel}>Export Excel</Button>
          <Button variant="secondary" icon={<FileText className="w-4 h-4 text-rose-600" />} onClick={exportPDF}>Export PDF</Button>
        </div>
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
