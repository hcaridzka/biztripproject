import { Building2, Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, formatIDR } from './ui-shared';
import { formatDate, formatDateTime, daysBetween } from '../lib/utils';
import type { BizTrip } from '../lib/types';

export function PdfPrint({ tripId, mode, onClose }: { tripId: string | null; mode: 'advance' | 'settlement'; onClose: () => void }) {
  const { trips, disburseRows, settlementClaimRows } = useApp();
  if (!tripId) return null;
  const trip = trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const days = daysBetween(trip.departure_date, trip.return_date);
  const extras = disburseRows.filter((d) => d.trip_id === trip.id);
  const claims = settlementClaimRows.filter((c) => c.trip_id === trip.id);
  const advance = Number(trip.cost_grand_total) || 0;
  const actual = Number(trip.realization_total) || 0;
  const diff = actual - advance;

  const handlePrint = () => window.print();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="no-print flex items-center justify-between px-6 py-3 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-bold text-slate-800">{mode === 'advance' ? 'PDF Request & Advance SPD' : 'PDF Laporan & Settlement SPD'}</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Printer className="w-3.5 h-3.5" />} onClick={handlePrint}>Print / Save PDF</Button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-8 print:p-0" id="print-area">
          {/* Official Header */}
          <div className="flex items-center gap-4 pb-4 border-b-2 border-brand-600">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900">ARIDZKA GROUP</div>
              <div className="text-xs text-slate-500">Business Trip Management System</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-400">Pegawai Pemohon: {trip.requester_name}</div>

          {mode === 'advance' ? (
            <>
              <div className="mt-6 text-center">
                <h1 className="text-xl font-bold text-slate-900">SURAT PERINTAH PERJALANAN DINAS (SPD)</h1>
                <p className="text-sm text-slate-500 mt-1">Request & Advance Biaya</p>
              </div>
              <div className="mt-4 text-xs text-slate-500">Nomor SPD: <strong>{trip.spd_number ?? '-'}</strong></div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label="Nama Pegawai" value={trip.requester_name} />
                <Info label="Jabatan" value={trip.requester_jabatan} />
                <Info label="PT Utama" value={trip.company_burden?.[0] ?? '-'} />
                <Info label="Durasi" value={`${days} hari`} />
                <Info label="Berangkat" value={formatDate(trip.departure_date)} />
                <Info label="Pulang" value={formatDate(trip.return_date)} />
              </div>

              {/* Itinerary table */}
              <table className="w-full mt-6 text-xs border border-slate-200">
                <thead className="bg-slate-50"><tr>
                  <th className="py-2 px-3 text-left border border-slate-200">No</th><th className="py-2 px-3 text-left border border-slate-200">Tujuan</th><th className="py-2 px-3 text-left border border-slate-200">Tanggal</th><th className="py-2 px-3 text-left border border-slate-200">Agenda</th>
                </tr></thead>
                <tbody>{trip.itinerary?.map((leg, i) => (
                  <tr key={i}>
                    <td className="py-2 px-3 border border-slate-200">{i + 1}</td>
                    <td className="py-2 px-3 border border-slate-200">{leg.destination} {leg.destination_custom ? `(${leg.destination_custom})` : ''}</td>
                    <td className="py-2 px-3 border border-slate-200">{formatDate(leg.start_date)} - {formatDate(leg.end_date)}</td>
                    <td className="py-2 px-3 border border-slate-200">{leg.agenda}</td>
                  </tr>
                ))}</tbody>
              </table>

              {/* Cost summary table (Table 1 + Table 2 combined) */}
              <table className="w-full mt-6 text-xs border border-slate-200">
                <thead className="bg-slate-50"><tr>
                  <th className="py-2 px-3 text-left border border-slate-200">Komponen Biaya</th><th className="py-2 px-3 text-right border border-slate-200">Nominal (Rp)</th>
                </tr></thead>
                <tbody>
                  {trip.cost_data?.perParticipant?.map((pp: any, i: number) => (
                    <tr key={i}><td className="py-2 px-3 border border-slate-200">Tunjangan — {pp.name} ({pp.jabatan})</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(pp.total)}</td></tr>
                  ))}
                  {trip.cost_data?.perParticipant?.some((pp: any) => pp.hotel > 0) && (
                    <tr><td className="py-2 px-3 border border-slate-200">Akomodasi Hotel</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(trip.cost_data.perParticipant.reduce((s: number, p: any) => s + p.hotel, 0))}</td></tr>
                  )}
                  <tr><td className="py-2 px-3 border border-slate-200">BBM (Fuel)</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(Number(trip.fuel_cost) || 0)}</td></tr>
                  <tr><td className="py-2 px-3 border border-slate-200">E-Toll</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(Number(trip.etoll_cost) || 0)}</td></tr>
                  {extras.map((e) => (
                    <tr key={e.id}><td className="py-2 px-3 border border-slate-200">{e.name} ({e.pt_burden})</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(Number(e.nominal) || 0)}</td></tr>
                  ))}
                  <tr className="bg-brand-50 font-bold"><td className="py-2 px-3 border border-slate-200">GRAND TOTAL ADVANCE</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(advance)}</td></tr>
                </tbody>
              </table>

              <div className="mt-6 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-5 py-4 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-sm text-slate-800 mb-1">Status</div>
                <div>Approved</div>
                <div>Tgl Req: {formatDate(trip.submitted_at)}</div>
                <div>Tgl Approved: {formatDate(trip.approved_at)}</div>
              </div>
            </>
          ) : (
            <>
              <div className="mt-6 text-center">
                <h1 className="text-xl font-bold text-slate-900">LAPORAN HASIL & SETTLEMENT SPD</h1>
                <p className="text-sm text-slate-500 mt-1">Pertanggungjawaban Pengeluaran Dinas</p>
              </div>
              <div className="mt-4 text-xs text-slate-500">Nomor Laporan: <strong>Lap {trip.spd_number ?? trip.settlement_number ?? '-'}</strong></div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500 mb-1">Laporan Hasil Pekerjaan:</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{trip.work_result ?? '-'}</p>
              </div>

              {/* Comparison table: Advance vs Actual */}
              <table className="w-full mt-6 text-xs border border-slate-200">
                <thead className="bg-slate-50"><tr>
                  <th className="py-2 px-3 text-left border border-slate-200">Komponen</th><th className="py-2 px-3 text-right border border-slate-200">Nominal (Rp)</th><th className="py-2 px-3 text-left border border-slate-200">Status</th><th className="py-2 px-3 text-left border border-slate-200">Beban PT</th>
                </tr></thead>
                <tbody>
                  <tr><td className="py-2 px-3 border border-slate-200">Total Advance Diterima</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(advance)}</td><td className="py-2 px-3 border border-slate-200">-</td><td className="py-2 px-3 border border-slate-200">-</td></tr>
                  <tr><td className="py-2 px-3 border border-slate-200">Total Realisasi Aktual</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(actual)}</td><td className="py-2 px-3 border border-slate-200">-</td><td className="py-2 px-3 border border-slate-200">-</td></tr>
                  {claims.map((c) => (
                    <tr key={c.id}><td className="py-2 px-3 border border-slate-200">{c.name}</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(Number(c.nominal) || 0)}</td><td className="py-2 px-3 border border-slate-200">{c.claim_status}</td><td className="py-2 px-3 border border-slate-200">{c.pt_burden}</td></tr>
                  ))}
                  <tr className="bg-brand-50 font-bold"><td className="py-2 px-3 border border-slate-200">SELISIH ({diff > 0 ? 'REIMBURSE' : diff < 0 ? 'REFUND' : 'SETTLED'})</td><td className="py-2 px-3 text-right border border-slate-200">{formatIDR(Math.abs(diff))}</td><td className="py-2 px-3 border border-slate-200" colSpan={2}>{trip.settlement_result ?? '-'}</td></tr>
                </tbody>
              </table>

              <div className="mt-6 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-5 py-4 text-xs text-slate-700 space-y-1">
                <div className="font-bold text-sm text-slate-800 mb-1">Status</div>
                <div>Settled</div>
                <div>Tgl Req: {formatDate(trip.settlement_submitted_at)}</div>
                <div>Tgl Approved: {formatDate(trip.settlement_reviewed_at)}</div>
              </div>
            </>
          )}

          <div className="mt-6 text-[10px] text-slate-400 text-center pb-4">
            Dokumen ini sah secara digital. Tidak memerlukan tanda tangan manual/basah.
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div><div className="text-sm text-slate-700 font-medium">{value}</div></div>;
}
