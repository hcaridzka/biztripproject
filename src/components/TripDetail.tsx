import {
  MapPin,
  Users,
  Calendar,
  FileText,
  Truck,
  Calculator,
  RotateCcw,
  MessageSquare,
  Gauge,
  UserRound,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  Card,
  StatusBadge,
  Button,
  formatIDR,
  EmptyState,
} from './ui-shared';

import {
  formatDate,
  formatDateTime,
  daysBetween,
} from '../lib/utils';

import type { BizTrip } from '../lib/types';

function formatDistanceLabel(
  dist?: string
) {
  if (dist === 'gt200') {
    return '> 200 km (Insentif Rp 50.000)';
  }

  if (dist === 'gt400') {
    return '> 400 km (Insentif Rp 100.000)';
  }

  return '< 200 km (Tanpa Insentif)';
}

export function TripDetail({
  trip,
  onPrint,
  onPrintSettlement,
}: {
  trip: BizTrip | null;
  onPrint?: (id: string) => void;
  onPrintSettlement?: (
    id: string
  ) => void;
}) {
  const { tracking } =
    useApp();

  if (!trip) {
    return (
      <EmptyState
        icon={
          <MapPin className="w-6 h-6" />
        }
        title="Pilih trip untuk melihat detail"
      />
    );
  }

  const days =
    daysBetween(
      trip.departure_date,
      trip.return_date
    );

  /**
   * Traveler utama memang disimpan juga
   * di participants untuk calculation.
   *
   * Tetapi pada UI tidak boleh tampil dua kali.
   */
  const additionalParticipants =
    (trip.participants ?? []).filter(
      (participant) =>
        participant.id !==
          'main-applicant' &&
        !(
          participant.name ===
            trip.requester_name &&
          participant.nip &&
          participant.nip ===
            trip.requester_nip
        )
    );

  const internalPax =
    additionalParticipants.filter(
      (participant) =>
        (
          participant.category ??
          'Internal'
        ) !== 'Eksternal'
    );

  const eksternalPax =
    additionalParticipants.filter(
      (participant) =>
        participant.category ===
        'Eksternal'
    );

  /**
   * Submitted By dibaca dari event pertama
   * trip_tracking.
   *
   * Ini memungkinkan:
   * PIC APN submit untuk pegawai lain,
   * tetapi Traveler tetap pegawai sebenarnya.
   */
  const submitTracking =
    tracking
      .filter(
        (row) =>
          row.trip_id ===
            trip.id &&
          (
            row.action ===
              'Trip request submitted' ||
            row.action ===
              'Trip request submitted on behalf of employee'
          )
      )
      .sort(
        (a, b) =>
          new Date(
            a.created_at
          ).getTime() -
          new Date(
            b.created_at
          ).getTime()
      )[0];

  const submittedBy =
    submitTracking?.actor_name ||
    trip.requester_name;

  const submittedRole =
    submitTracking?.actor_role ||
    '-';

  const driverAssigned =
    Boolean(
      trip.obligo_driver_name
    );

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {trip.purpose}
            </h3>

            <p className="text-sm text-slate-500 mt-0.5">
              Traveler:{' '}
              {trip.requester_name}{' '}
              ·{' '}
              {
                trip.requester_jabatan
              }{' '}
              · NIP{' '}
              {trip.requester_nip ??
                '-'}
            </p>
          </div>

          <StatusBadge
            status={trip.status}
          />
        </div>

        {/* SUBMITTER VS TRAVELER */}
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
              <UserRound className="w-3.5 h-3.5" />
              Submitted By
            </div>

            <div className="text-sm font-semibold text-slate-800 mt-1">
              {submittedBy}
            </div>

            <div className="text-[11px] text-slate-400">
              {submittedRole}
            </div>
          </div>

          <div className="rounded-xl bg-brand-50 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-brand-500 font-semibold">
              <Users className="w-3.5 h-3.5" />
              Traveler Utama
            </div>

            <div className="text-sm font-semibold text-slate-800 mt-1">
              {trip.requester_name}
            </div>

            <div className="text-[11px] text-slate-500">
              {trip.requester_jabatan}
              {' · '}
              {trip.requester_pt ||
                '-'}
              {' · NIP '}
              {trip.requester_nip ||
                '-'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-xs">
          <Info
            label="Origin"
            value={
              trip.origin +
              (
                trip.origin_custom
                  ? ` (${trip.origin_custom})`
                  : ''
              )
            }
          />

          <Info
            label="Departure"
            value={`${formatDate(
              trip.departure_date
            )} ${
              trip.departure_time ??
              ''
            }`}
          />

          <Info
            label="Return"
            value={`${formatDate(
              trip.return_date
            )} ${
              trip.return_time ??
              ''
            }`}
          />

          <Info
            label="Duration"
            value={`${days} hari`}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <Info
            label="KP Scheme"
            value={
              trip.kp_scheme
            }
          />

          <Info
            label="Transport"
            value={
              trip.vehicle_type_choice ??
              '-'
            }
          />

          <Info
            label="Driver Request"
            value={
              trip.needs_driver
                ? 'Ya'
                : 'Tidak'
            }
          />

          <Info
            label="Grand Total"
            value={formatIDR(
              Number(
                trip.cost_grand_total
              ) || 0
            )}
          />
        </div>

        {trip.needs_driver &&
          trip.total_distance && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-amber-500" />

            <span className="text-xs text-slate-500 font-medium">
              Insentif Jarak Driver:
            </span>

            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              {formatDistanceLabel(
                trip.total_distance
              )}
            </span>
          </div>
        )}

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
            Cost Center
          </div>

          <div className="flex flex-wrap gap-1.5">
            {trip.company_burden?.map(
              (pt) => (
                <span
                  key={pt}
                  className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold"
                >
                  {pt}
                </span>
              )
            )}
          </div>
        </div>

        {onPrint &&
          [
            'Approved / Ready for Trip',
            'On Trip',
            'Completed',
          ].includes(
            trip.status
          ) && (
          <div className="mt-4">
            <Button
              size="sm"
              variant="secondary"
              icon={
                <FileText className="w-3.5 h-3.5" />
              }
              onClick={() =>
                onPrint(
                  trip.id
                )
              }
            >
              PDF SPD
            </Button>
          </div>
        )}
      </Card>

      {/* ITINERARY */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-slate-400" />
          Itinerary
        </h4>

        <div className="space-y-2">
          {trip.itinerary?.map(
            (
              leg,
              index
            ) => (
              <div
                key={
                  leg.id ??
                  index
                }
                className="rounded-xl ring-1 ring-slate-100 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">
                    Leg{' '}
                    {index +
                      1}
                  </span>

                  <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                    {
                      leg.kpScheme
                    }
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-800 mt-1">
                  {
                    leg.destination
                  }{' '}
                  {leg.destination_custom
                    ? `— ${leg.destination_custom}`
                    : ''}
                </div>

                <div className="text-xs text-slate-400">
                  {formatDate(
                    leg.start_date
                  )}{' '}
                  →{' '}
                  {formatDate(
                    leg.end_date
                  )}
                </div>

                {leg.agenda && (
                  <div className="text-xs text-slate-500 mt-1">
                    {
                      leg.agenda
                    }
                  </div>
                )}

                {leg.isWithinCity &&
                  leg.dkTier && (
                  <div className="text-[10px] text-slate-400 mt-1">
                    DK Tier:{' '}
                    {
                      leg.dkTier
                    }{' '}
                    KM
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </Card>

      {/* ADDITIONAL PARTICIPANTS */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          Partisipan Tambahan
        </h4>

        {internalPax.length ===
          0 &&
        eksternalPax.length ===
          0 ? (
          <p className="text-xs text-slate-400">
            Tidak ada partisipan tambahan.
          </p>
        ) : (
          <div className="space-y-2">
            {internalPax.map(
              (
                participant,
                index
              ) => (
                <div
                  key={`internal-${index}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold">
                    {participant.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="flex-1">
                    <div className="font-medium text-slate-700">
                      {
                        participant.name
                      }
                    </div>

                    <div className="text-[11px] text-slate-400">
                      {
                        participant.jabatan
                      }
                      {' · '}
                      {participant.pt_unit ||
                        '-'}
                      {participant.nip
                        ? ` · NIP ${participant.nip}`
                        : ''}
                    </div>
                  </div>

                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold">
                    Internal
                  </span>
                </div>
              )
            )}

            {eksternalPax.map(
              (
                participant,
                index
              ) => (
                <div
                  key={`external-${index}`}
                  className="flex items-center gap-3 text-sm"
                >
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">
                    {participant.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="flex-1">
                    <div className="font-medium text-slate-700">
                      {
                        participant.name
                      }
                    </div>

                    <div className="text-[11px] text-slate-400">
                      {participant.keterangan ||
                        '-'}
                    </div>
                  </div>

                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold">
                    Eksternal
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </Card>

      {/* VEHICLE / DRIVER ASSIGNMENT */}
      {(trip.needs_vehicle ||
        trip.needs_driver) && (
        <Card className="p-5">
          <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            Vehicle & Driver Assignment
          </h4>

          {!trip.obligo_vehicle_plate &&
          !driverAssigned ? (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-100 p-3 text-xs text-amber-700">
              Kendaraan / driver belum di-assign oleh PIC Obligo.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Info
                  label="Vehicle"
                  value={
                    trip.obligo_vehicle_type ??
                    '-'
                  }
                />

                <Info
                  label="Plate"
                  value={
                    trip.obligo_vehicle_plate ??
                    '-'
                  }
                />

                <Info
                  label="Driver"
                  value={
                    trip.obligo_driver_name ??
                    '-'
                  }
                />

                <Info
                  label="KM"
                  value={
                    trip.obligo_vehicle_km ??
                    '-'
                  }
                />

                <Info
                  label="BBM"
                  value={formatIDR(
                    Number(
                      trip.fuel_cost
                    ) || 0
                  )}
                />

                <Info
                  label="E-Toll"
                  value={formatIDR(
                    Number(
                      trip.etoll_cost
                    ) || 0
                  )}
                />

                {driverAssigned && (
                  <Info
                    label="Driver Distance"
                    value={formatDistanceLabel(
                      trip.total_distance
                    )}
                  />
                )}
              </div>

              {trip.obligo_note && (
                <p className="text-xs text-slate-500 mt-3">
                  {
                    trip.obligo_note
                  }
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {/* REJECT */}
      {trip.status ===
        'Rejected' && (
        <Card className="p-5 ring-rose-200">
          <h4 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Reject Reason
          </h4>

          <p className="text-sm text-rose-600">
            {trip.reject_reason ??
              '-'}
          </p>

          <p className="text-xs text-slate-400 mt-1">
            Rejected by:{' '}
            {trip.reject_by ??
              '-'}{' '}
            ·{' '}
            {trip.rejection_stage ??
              '-'}
          </p>

          {trip.review_justification && (
            <div className="mt-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3">
              <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Re-Review Request
              </div>

              <p className="text-xs text-amber-600 mt-1">
                {
                  trip.review_justification
                }
              </p>
            </div>
          )}
        </Card>
      )}

      {/* SETTLEMENT */}
      {trip.work_result && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-slate-400" />
              Settlement Report
            </h4>

            {trip.status ===
              'Completed' &&
              onPrintSettlement && (
              <Button
                size="sm"
                variant="secondary"
                icon={
                  <FileText className="w-3.5 h-3.5" />
                }
                onClick={() =>
                  onPrintSettlement(
                    trip.id
                  )
                }
              >
                PDF Settlement
              </Button>
            )}
          </div>

          <p className="text-sm text-slate-600 whitespace-pre-wrap mt-2">
            {trip.work_result}
          </p>

          {trip.realization_total !=
            null && (
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <Info
                label="Realization Total"
                value={formatIDR(
                  Number(
                    trip.realization_total
                  ) || 0
                )}
              />

              <Info
                label="Approved Total"
                value={formatIDR(
                  Number(
                    trip.approved_total
                  ) || 0
                )}
              />
            </div>
          )}

          {trip.settlement_result && (
            <p className="text-xs font-semibold text-slate-600 mt-2">
              Result:{' '}
              {
                trip.settlement_result
              }
            </p>
          )}

          {trip.settlement_note && (
            <p className="text-xs text-slate-400 mt-1">
              {
                trip.settlement_note
              }
            </p>
          )}
        </Card>
      )}

      {/* TIMELINE */}
      <Card className="p-5">
        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          Timeline
        </h4>

        <div className="text-xs text-slate-500 space-y-1">
          <div>
            Submitted:{' '}
            {formatDateTime(
              trip.submitted_at
            )}
            {' · '}
            {submittedBy}
          </div>

          {trip.manager_approved_at && (
            <div>
              Manager Approved:{' '}
              {formatDateTime(
                trip.manager_approved_at
              )}
              {' · '}
              {trip.manager_approved_by ||
                '-'}
            </div>
          )}

          {trip.obligo_approved_at && (
            <div>
              PIC Obligo Verified:{' '}
              {formatDateTime(
                trip.obligo_approved_at
              )}
              {' · '}
              {trip.obligo_approved_by ||
                '-'}
            </div>
          )}

          {trip.direksi_approved_at && (
            <div>
              Direksi Approved:{' '}
              {formatDateTime(
                trip.direksi_approved_at
              )}
              {' · '}
              {trip.direksi_approved_by ||
                '-'}
            </div>
          )}

          {trip.approved_at && (
            <div>
              HR Advance Approved:{' '}
              {formatDateTime(
                trip.approved_at
              )}
            </div>
          )}

          {trip.settlement_submitted_at && (
            <div>
              Settlement Submitted:{' '}
              {formatDateTime(
                trip.settlement_submitted_at
              )}
              {' · '}
              {trip.settlement_submitted_by ||
                '-'}
            </div>
          )}

          {trip.settlement_reviewed_at && (
            <div>
              Settlement Reviewed:{' '}
              {formatDateTime(
                trip.settlement_reviewed_at
              )}
              {' · '}
              {trip.settlement_reviewed_by ||
                '-'}
            </div>
          )}

          {trip.completed_at && (
            <div>
              Completed:{' '}
              {formatDateTime(
                trip.completed_at
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
        {label}
      </div>

      <div className="text-sm text-slate-700 font-medium mt-0.5">
        {value}
      </div>
    </div>
  );
}
