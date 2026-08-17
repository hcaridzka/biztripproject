import type { ReactNode } from 'react';
import { Printer, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, formatIDR } from './ui-shared';
import { daysBetween, formatDate } from '../lib/utils';

const receiptStatusLabel = (status?: string) => {
  if (status === 'approved') return 'APPROVED';
  if (status === 'partial') return 'PARTIAL';
  if (status === 'rejected') return 'REJECTED';
  return 'PENDING';
};

const isImageAttachment = (value?: string | null, fileName?: string | null) => {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(value)) return true;
  return !!fileName && /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName);
};

const isPdfAttachment = (value?: string | null, fileName?: string | null) => {
  if (!value) return false;
  if (value.startsWith('data:application/pdf')) return true;
  if (/\.pdf(\?|$)/i.test(value)) return true;
  return !!fileName && /\.pdf$/i.test(fileName);
};

export function PdfPrint({ tripId, mode, onClose }: { tripId: string | null; mode: 'advance' | 'settlement'; onClose: () => void }) {
  const { trips, disburseRows, settlementClaimRows, settlementReceipts } = useApp();
  if (!tripId) return null;
  const trip = trips.find((item) => item.id === tripId);
  if (!trip) return null;

  const costData: any = trip.cost_data ?? {};
  const days = daysBetween(trip.departure_date, trip.return_date);
  const advanceRows = disburseRows.filter((row) => row.trip_id === trip.id);
  const settlementRows = settlementClaimRows.filter((row) => row.trip_id === trip.id);
  const receipts = settlementReceipts
    .filter((row) => row.trip_id === trip.id)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  const participants: any[] = Array.isArray(costData.perParticipant) ? costData.perParticipant : [];

  const advanceTotal = Number(trip.cost_grand_total) || 0;
  const allowanceTotal = Number(costData?.totals?.allowance) || 0;
  const accommodationTotal = Number(costData?.totals?.accommodation) || 0;
  const pettyCashTotal = Number(costData?.totals?.pettyCash) || 0;
  const driverDistanceIncentive = Number(costData?.driverDistanceIncentive ?? costData?.totals?.driverCost ?? costData?.totals?.driverIncentive ?? costData?.assignedDriverCost ?? costData?.externalDriverIncentive) || 0;
  const fuelTotal = Number(costData?.totals?.fuel ?? trip.fuel_cost) || 0;
  const etollTotal = Number(costData?.totals?.etoll ?? trip.etoll_cost) || 0;
  const assignedDriverName = costData?.assignedDriverName ?? trip.obligo_driver_name ?? null;
  const nonAccountable = Number(costData?.nonAccountable?.total) || 0;
  const accountableAdvance = Number(costData?.accountable?.total) || 0;
  const actualClaimed = Number(trip.realization_total) || 0;
  const actualApproved = Number(trip.approved_total) || 0;
  const reimbursementTotal = settlementRows.filter((r) => r.claim_status === 'Reimburse').reduce((s, r) => s + Number(r.nominal || 0), 0);
  const refundTotal = settlementRows.filter((r) => r.claim_status === 'Refund').reduce((s, r) => s + Number(r.nominal || 0), 0);
  const netMovement = reimbursementTotal - refundTotal;
  const settlementCategory = netMovement > 0 ? 'REIMBURSEMENT' : netMovement < 0 ? 'REFUND' : 'SETTLED';
  const settlementAmount = Math.abs(netMovement);
  const advanceAllocationTotal = advanceRows.reduce((s, r) => s + Number(r.nominal || 0), 0);
  const settlementAllocationTotal = settlementRows.reduce((s, r) => s + Number(r.nominal || 0), 0);

  return <div className="fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto p-4 md:p-8" onClick={onClose}>
    <style>{`
      @page { size: A4; margin: 0; }
      @media print {
        html,body{background:#fff!important}
        body *{visibility:hidden!important}
        #print-area,#print-area *{visibility:visible!important}
        #print-area{position:absolute!important;left:0!important;top:0!important;width:210mm!important;margin:0!important;padding:14mm 14mm 12mm!important;box-shadow:none!important;border:0!important}
        .no-print{display:none!important}
        .print-break-avoid{break-inside:avoid;page-break-inside:avoid}
        .attachment-page{break-before:page;page-break-before:always;min-height:270mm;display:flex;flex-direction:column}
        .attachment-image{max-width:100%;max-height:235mm;object-fit:contain;margin:auto}
        .attachment-pdf{width:100%;height:235mm;border:0}
        table{break-inside:auto} tr{break-inside:avoid;page-break-inside:avoid}
      }
    `}</style>

    <div className="no-print max-w-[210mm] mx-auto mb-3 flex items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
      <div className="text-sm font-semibold text-white">{mode === 'advance' ? 'Preview Surat Perjalanan Dinas' : 'Preview Laporan & Settlement'}</div>
      <div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>Print / Save PDF</Button><button onClick={onClose} className="p-2 rounded-lg bg-white text-slate-600"><X className="w-4 h-4" /></button></div>
    </div>

    <main id="print-area" onClick={(e) => e.stopPropagation()} className="mx-auto bg-white w-full max-w-[210mm] min-h-[297mm] px-[14mm] py-[12mm] text-slate-900">
      <DocumentHeader title={mode === 'advance' ? 'SURAT PERJALANAN DINAS' : 'LAPORAN HASIL & SETTLEMENT PERJALANAN DINAS'} subtitle={mode === 'advance' ? 'Perintah Perjalanan & Advance Biaya Dinas' : 'Pertanggungjawaban Perjalanan Dinas'} number={mode === 'advance' ? trip.spd_number ?? '-' : trip.settlement_number ?? `Lap ${trip.spd_number ?? '-'}`} />
      <Section title="Informasi Perjalanan"><InfoGrid><Info label="Pemohon" value={trip.requester_name} /><Info label="Jabatan" value={trip.requester_jabatan || '-'} /><Info label="PT Pemohon" value={trip.requester_pt || '-'} /><Info label="Cost Center" value={(trip.company_burden ?? []).join(', ') || '-'} /><Info label="Berangkat" value={formatDate(trip.departure_date)} /><Info label="Pulang" value={formatDate(trip.return_date)} /><Info label="Durasi" value={`${days} hari`} /><Info label="Tujuan" value={trip.purpose || '-'} />{assignedDriverName && <Info label="Driver" value={assignedDriverName} />}{trip.obligo_vehicle_plate && <Info label="Kendaraan" value={trip.obligo_vehicle_plate} />}</InfoGrid></Section>
      <Section title="Itinerary"><Table headers={['No', 'Tujuan', 'Tanggal', 'Agenda']}>{(trip.itinerary ?? []).map((leg, index) => <tr key={leg.id ?? index}><TD>{index + 1}</TD><TD>{leg.destination}{leg.destination_custom ? ` (${leg.destination_custom})` : ''}</TD><TD>{formatDate(leg.start_date)} - {formatDate(leg.end_date)}</TD><TD>{leg.agenda || '-'}</TD></tr>)}</Table></Section>

      {mode === 'advance' ? <>
        <Section title="A. Rincian Biaya Advance"><Table headers={['Nama / Komponen', 'Keterangan', 'Nominal']} rightLast>{participants.flatMap((p, index) => { const rows: ReactNode[] = []; if (Number(p.total) > 0) rows.push(<tr key={`a-${index}`}><TD>{p.name}</TD><TD>Tunjangan Perjalanan · {p.jabatan}{p.grade ? ` · ${p.grade}` : ''}</TD><TDRight>{formatIDR(Number(p.total) || 0)}</TDRight></tr>); if (Number(p.hotel) > 0) rows.push(<tr key={`h-${index}`}><TD>{p.name}</TD><TD>Akomodasi</TD><TDRight>{formatIDR(Number(p.hotel) || 0)}</TDRight></tr>); if (Number(p.pettyCash) > 0) rows.push(<tr key={`p-${index}`}><TD>{p.name}</TD><TD>Pettycash</TD><TDRight>{formatIDR(Number(p.pettyCash) || 0)}</TDRight></tr>); return rows; })}{driverDistanceIncentive > 0 && <tr><TD>{assignedDriverName || 'Driver'}</TD><TD>Insentif Jarak Driver</TD><TDRight>{formatIDR(driverDistanceIncentive)}</TDRight></tr>}{fuelTotal > 0 && <tr><TD>{trip.requester_name}</TD><TD>BBM</TD><TDRight>{formatIDR(fuelTotal)}</TDRight></tr>}{etollTotal > 0 && <tr><TD>{trip.requester_name}</TD><TD>E-Toll</TD><TDRight>{formatIDR(etollTotal)}</TDRight></tr>}<tr className="font-bold bg-slate-100"><TD colSpan={2}>GRAND TOTAL ADVANCE</TD><TDRight>{formatIDR(advanceTotal)}</TDRight></tr></Table><div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-500"><div>Tunjangan: {formatIDR(allowanceTotal)}</div><div>Akomodasi: {formatIDR(accommodationTotal)}</div><div>Pettycash: {formatIDR(pettyCashTotal)}</div></div></Section>
        <Section title="B. Alokasi Cost Center"><p className="text-[10px] text-slate-500 mb-2">Alokasi berikut menunjukkan pembagian Grand Total Advance per Cost Center dan bukan biaya tambahan.</p><Table headers={['Nama', 'Komponen', 'Cost Center', 'Nominal']} rightLast>{advanceRows.map((r) => <tr key={r.id}><TD>{r.name}</TD><TD>{r.component_note || '-'}</TD><TD>{r.pt_burden || '-'}</TD><TDRight>{formatIDR(Number(r.nominal) || 0)}</TDRight></tr>)}<tr className="font-bold bg-slate-100"><TD colSpan={3}>TOTAL ALOKASI ADVANCE</TD><TDRight>{formatIDR(advanceAllocationTotal)}</TDRight></tr></Table></Section>
      </> : <>
        <Section title="Laporan Hasil Pekerjaan"><div className="border border-slate-300 p-3 text-[11px] whitespace-pre-wrap min-h-[28mm]">{trip.work_result || '-'}</div></Section>
        <Section title="A. Ringkasan Settlement"><Table headers={['Komponen', 'Nominal']} rightLast><tr><TD>Total Advance</TD><TDRight>{formatIDR(advanceTotal)}</TDRight></tr><tr><TD>Non-Accountable Advance</TD><TDRight>{formatIDR(nonAccountable)}</TDRight></tr><tr><TD>Accountable Advance</TD><TDRight>{formatIDR(accountableAdvance)}</TDRight></tr><tr><TD>Actual Claimed</TD><TDRight>{formatIDR(actualClaimed)}</TDRight></tr><tr><TD>Actual Approved</TD><TDRight>{formatIDR(actualApproved)}</TDRight></tr><tr><TD>Total Reimbursement</TD><TDRight>{formatIDR(reimbursementTotal)}</TDRight></tr><tr><TD>Total Refund</TD><TDRight>{formatIDR(refundTotal)}</TDRight></tr><tr className="font-bold bg-slate-100"><TD>NET {settlementCategory}</TD><TDRight>{formatIDR(settlementAmount)}</TDRight></tr></Table></Section>
        <Section title="B. Alokasi Refund / Reimbursement"><Table headers={['Penerima / Pengembali', 'Movement', 'Cost Center', 'Nominal']} rightLast>{settlementRows.map((r) => <tr key={r.id}><TD>{r.name}</TD><TD>{r.claim_status}</TD><TD>{r.pt_burden || '-'}</TD><TDRight>{formatIDR(Number(r.nominal) || 0)}</TDRight></tr>)}<tr className="font-bold bg-slate-100"><TD colSpan={3}>TOTAL FINANCIAL MOVEMENT</TD><TDRight>{formatIDR(settlementAllocationTotal)}</TDRight></tr></Table></Section>

        <Section title="C. Audit Trail Review Receipt / Invoice">
          <Table headers={['No', 'Kategori / Invoice', 'Claimed', 'Approved', 'Status', 'HR Note']} rightLast={false}>
            {receipts.map((receipt, index) => <tr key={receipt.id}><TD>{index + 1}</TD><TD><div>{receipt.category}</div><div className="text-[9px] text-slate-500">{receipt.description || receipt.file_name || '-'}</div></TD><TD>{formatIDR(Number(receipt.amount) || 0)}</TD><TD>{formatIDR(receipt.hr_approved_amount == null ? 0 : Number(receipt.hr_approved_amount) || 0)}</TD><TD><strong>{receiptStatusLabel(receipt.hr_status)}</strong></TD><TD>{receipt.hr_note || '-'}</TD></tr>)}
            {receipts.length === 0 && <tr><TD colSpan={6}>Tidak ada attachment/receipt settlement.</TD></tr>}
          </Table>
          <p className="text-[9px] text-slate-500 mt-2">Status review menjadi jejak audit atas dokumen settlement: Approved = disetujui penuh, Partial = sebagian nominal disetujui, Rejected = tidak diakui dalam settlement.</p>
        </Section>
      </>}

      <section className="print-break-avoid mt-7 border-t border-slate-400 pt-4"><div className="grid grid-cols-2 gap-6 text-[10px]"><div><div className="font-semibold text-slate-700">Status Dokumen</div><div className="mt-1">Status: {trip.status}</div>{mode === 'advance' && <div>Disetujui: {formatDate(trip.approved_at)}</div>}{mode === 'settlement' && <div>Direview HR: {formatDate(trip.settlement_reviewed_at)}</div>}</div><div className="text-right text-slate-500">Dokumen ini diterbitkan melalui Business Trip Management System dan sah secara digital.</div></div></section>

      {mode === 'settlement' && receipts.map((receipt, index) => receipt.file_base64 ? <section key={`attachment-${receipt.id}`} className="attachment-page pt-3">
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="text-[10px] tracking-[0.2em] text-slate-500 font-semibold">LAMPIRAN {index + 1} · SETTLEMENT</div>
          <div className="text-sm font-bold mt-1">{receipt.category} — {receipt.file_name || receipt.description || 'Attachment'}</div>
          <div className="grid grid-cols-4 gap-2 mt-2 text-[9px]"><div>Claimed<br /><strong>{formatIDR(Number(receipt.amount) || 0)}</strong></div><div>Approved<br /><strong>{formatIDR(receipt.hr_approved_amount == null ? 0 : Number(receipt.hr_approved_amount) || 0)}</strong></div><div>Status<br /><strong>{receiptStatusLabel(receipt.hr_status)}</strong></div><div>HR Note<br /><strong>{receipt.hr_note || '-'}</strong></div></div>
        </div>
        {isImageAttachment(receipt.file_base64, receipt.file_name) ? <img src={receipt.file_base64} alt={receipt.file_name || receipt.category} className="attachment-image" /> : isPdfAttachment(receipt.file_base64, receipt.file_name) ? <iframe src={receipt.file_base64} title={receipt.file_name || receipt.category} className="attachment-pdf" /> : <div className="m-auto text-center text-xs text-slate-500"><div>Attachment tidak dapat dirender langsung pada preview.</div><div className="mt-1">File: {receipt.file_name || receipt.category}</div></div>}
      </section> : null)}
    </main>
  </div>;
}

function DocumentHeader({ title, subtitle, number }: { title: string; subtitle: string; number: string }) { return <header className="border-b-2 border-slate-900 pb-4 text-center"><div className="text-[10px] tracking-[0.28em] font-semibold text-slate-500">ARIDZKA GROUP</div><h1 className="mt-2 text-[16px] font-bold tracking-wide">{title}</h1><div className="mt-1 text-[10px] text-slate-500">{subtitle}</div><div className="mt-2 text-[10px]">Nomor: <strong>{number}</strong></div></header>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="mt-5"><h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-800">{title}</h2>{children}</section>; }
function InfoGrid({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-x-8 gap-y-2 border border-slate-300 p-3">{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="text-[10px]"><span className="text-slate-500">{label}: </span><strong>{value}</strong></div>; }
function Table({ headers, children, rightLast = false }: { headers: string[]; children: ReactNode; rightLast?: boolean }) { return <table className="w-full border-collapse text-[10px]"><thead><tr className="bg-slate-100">{headers.map((h, i) => <th key={h} className={`border border-slate-300 px-2 py-1.5 text-left font-semibold ${rightLast && i === headers.length - 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table>; }
function TD({ children, colSpan }: { children: ReactNode; colSpan?: number }) { return <td colSpan={colSpan} className="border border-slate-300 px-2 py-1.5 align-top">{children}</td>; }
function TDRight({ children }: { children: ReactNode }) { return <td className="border border-slate-300 px-2 py-1.5 text-right align-top whitespace-nowrap">{children}</td>; }
