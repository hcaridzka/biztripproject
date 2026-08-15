import { MapPin, Users, Calendar, FileText, Truck, Calculator, RotateCcw, MessageSquare, Gauge } from 'lucide-react';
import { Card, StatusBadge, Button, formatIDR, EmptyState } from './ui-shared';
import { formatDate, formatDateTime, daysBetween } from '../lib/utils';
import type { BizTrip } from '../lib/types';

// Helper Formatter untuk Total Distance / Insentif Jarak
function formatDistanceLabel(dist?: string) {
  if (dist === 'gt200') return '> 200 km (Insentif Rp 50.000)';
  if (dist === 'gt400') return '> 400 km (Insentif Rp 100.000)';
  return '< 200 km (Tanpa Insentif)';
}

export function TripDetail({ trip, onPrint }: { trip: BizTrip | null; onPrint?: (id: string) => void }) {
  if (!trip) return <EmptyState icon={<MapPin className="w-6 h-6" />} title="Pilih trip untuk melihat detail" />;
  const days = daysBetween(trip.departure_date, trip.return_date);
  const internalPax = trip.participants.filter((p) => (p.category ?? 'Internal') !== 'Eksternal');
  const eksternalPax = trip.participants.filter((p) => p.category === 'Eksternal');

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{trip.purpose}</h3>
            <p className="text-sm text-slate-500 mt-0.5">{trip.requester_name} · {trip.requester_jabatan} · NIP {trip.requester_nip ?? '-'}</p>
          </div>
          <StatusBadge status={trip.status} />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <Info label="Origin" value={trip.origin + (trip.origin_custom ? ` (${trip.origin_custom})` : '')} />
          <Info label="Departure" value={`${formatDate(trip.departure_date)} ${trip.departure_time ?? ''}`} />
          <Info label="Return" value={`${formatDate(trip.return_date)} ${trip.return_time ?? ''}`} />
          <Info label="Duration" value={`${days} hari`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <Info label="KP Scheme" value={trip.kp_scheme} />
          <Info label="Transport" value={trip.vehicle_type_choice ?? '-'} />
          <Info label="Driver" value={trip.needs_driver ? 'Ya' : 'Tidak'} />
          <Info label="Grand Total" value={formatIDR(Number(trip.cost_grand_total) || 0)} />
        </div>

        {/* Tambahan Info Insentif Jarak (Driver) */}
        {trip.needs_driver && trip.total_distance && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500 font-medium">Insentif Jarak Driver:</span>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              {formatDistanceLabel(trip.total_distance)}
            </span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {trip.company_burden?.map((pt) => (
            <span key={pt} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">{pt}</span>
          ))}
        </div>
        {onPrint && (trip.status === 'Approved / Ready for Trip' || trip.status === 'On Trip' || trip.status === 'Completed') && (
          <div className="mt-4">
            <Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5" />} onClick={() => onPrint(trip.id)}>Cetak PDF SPD</Button>
          </div>
        )}
      </Card>

      {/* Itinerary */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> Itinerary</h4>
        <div className="space-y-2">
          {trip.itinerary?.map((leg, i) => (
            <div key={leg.id ?? i} className="rounded-xl ring-1 ring-slate-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Leg {i + 1}</span>
                <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">{leg.kpScheme}</span>
              </div>
              <div className="text-sm font-semibold text-slate-800 mt-1">{leg.destination} {leg.destination_custom ? `— ${leg.destination_custom}` : ''}</div>
              <div className="text-xs text-slate-400">{formatDate(leg.start_date)} → {formatDate(leg.end_date)}</div>
              {leg.agenda && <div className="text-xs text-slate-500 mt-1">{leg.agenda}</div>}
              {leg.isWithinCity && leg.dkTier && <div className="text-[10px] text-slate-400 mt-1">DK Tier: {leg.dkTier} KM</div>}
            </div>
          ))}
        </div>
      </Card>

      {/* Participants */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Partisipan</h4>
        <div className="space-y-1.5">
          {internalPax.map((p, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">{p.name.charAt(0).toUpperCase()}</div>
              <span className="font-medium text-slate-700">{p.name}</span>
              <span className="text-xs text-slate-400">{p.jabatan}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold">Internal</span>
            </div>
          ))}
          {eksternalPax.map((p, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">{p.name.charAt(0).toUpperCase()}</div>
              <span className="font-medium text-slate-700">{p.name}</span>
              <span className="text-xs text-slate-400">{p.keterangan}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold">Eksternal</span>
            </div>
          ))}
        </div>
      </Card>

      {/* PIC Obligo assignment */}
      {trip.obligo_vehicle_plate && (
        <Card className="p-5">
          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> Vehicle Assignment (PIC Obligo)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Info label="Vehicle" value={trip.obligo_vehicle_type ?? '-'} />
            <Info label="Plate" value={trip.obligo_vehicle_plate} />
            <Info label="Driver" value={trip.obligo_driver_name ?? '-'} />
            <Info label="KM" value={trip.obligo_vehicle_km ?? '-'} />
            <Info label="BBM (Fuel)" value={formatIDR(Number(trip.fuel_cost) || 0)} />
            <Info label="E-Toll" value={formatIDR(Number(trip.etoll_cost) || 0)} />
            <Info label="Insentif Jarak Driver" value={formatDistanceLabel(trip.total_distance)} />
          </div>
          {trip.obligo_note && <p className="text-xs text-slate-500 mt-3">{trip.obligo_note}</p>}
        </Card>
      )}

      {/* Reject / Re-review info */}
      {trip.status === 'Rejected' && (
        <Card className="p-5 ring-rose-200">
          <h4 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Reject Reason</h4>
          <p className="text-sm text-rose-600">{trip.reject_reason ?? '-'}</p>
          <p className="text-xs text-slate-400 mt-1">Rejected by: {trip.reject_by ?? '-'} · {trip.rejection_stage ?? '-'}</p>
          {trip.review_justification && (
            <div className="mt-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3">
              <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Re-Review Request</div>
              <p className="text-xs text-amber-600 mt-1">{trip.review_justification}</p>
            </div>
          )}
        </Card>
      )}

      {/* Settlement info */}
      {trip.work_result && (
        <Card className="p-5">
          <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2"><Calculator className="w-4 h-4 text-slate-400" /> Settlement Report</h4>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{trip.work_result}</p>
          {trip.realization_total != null && (
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <Info label="Realization Total" value={formatIDR(Number(trip.realization_total) || 0)} />
              <Info label="Approved Total" value={formatIDR(Number(trip.approved_total) || 0)} />
            </div>
          )}
          {trip.settlement_result && <p className="text-xs font-semibold text-slate-600 mt-2">Result: {trip.settlement_result}</p>}
          {trip.settlement_note && <p className="text-xs text-slate-400 mt-1">{trip.settlement_note}</p>}
        </Card>
      )}

      {/* Timeline */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400" /> Timeline</h4>
        <div className="text-xs text-slate-500 space-y-1">
          <div>Submitted: {formatDateTime(trip.submitted_at)}</div>
          {trip.manager_approved_at && <div>Manager Approved: {formatDateTime(trip.manager_approved_at)}</div>}
          {trip.obligo_approved_at && <div>PIC Obligo Verified: {formatDateTime(trip.obligo_approved_at)}</div>}
          {trip.direksi_approved_at && <div>Direksi Approved: {formatDateTime(trip.direksi_approved_at)}</div>}
          {trip.approved_at && <div>HR Advance Approved: {formatDateTime(trip.approved_at)}</div>}
          {trip.settlement_submitted_at && <div>Settlement Submitted: {formatDateTime(trip.settlement_submitted_at)}</div>}
          {trip.settlement_reviewed_at && <div>Settlement Reviewed: {formatDateTime(trip.settlement_reviewed_at)}</div>}
          {trip.completed_at && <div>Completed: {formatDateTime(trip.completed_at)}</div>}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className="text-sm text-slate-700 font-medium mt-0.5">{value}</div>
    </div>
  );
}
