import { useState, useMemo, useEffect } from 'react';
import {
  MapPin,
  FileText,
  RotateCcw,
  X,
  Calendar,
  CheckCircle2,
  Play,
  CalendarClock,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

import {
  Card,
  Button,
  EmptyState,
  StatusBadge,
  Modal,
  Textarea,
  Field,
  formatIDR,
} from './ui-shared';

import { formatDate, daysBetween } from '../lib/utils';
import { TripDetail } from './TripDetail';
import { supabase } from '../lib/supabase';

import type { BizTrip } from '../lib/types';

export function MyTrips({ onPrint }: { onPrint: (id: string) => void }) {useEffect(() => {
  if (!selectedTripId) return;

  const tripExists = myTrips.some(
    (t) => t.id === selectedTripId
  );

  if (tripExists) {
    setSelectedId(selectedTripId);
  }
}, [selectedTripId, myTrips]); 
  const { profile } = useAuth();

  const {
    trips,
    updateTrip,
    showToast,
    refresh,
  } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Cancel
  const [cancelTrip, setCancelTrip] = useState<BizTrip | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Reschedule
  const [rescheduleTrip, setRescheduleTrip] =
    useState<BizTrip | null>(null);

  const [rescheduleReason, setRescheduleReason] = useState('');

  const [newDepartureDate, setNewDepartureDate] = useState('');
  const [newDepartureTime, setNewDepartureTime] = useState('');
  const [newReturnDate, setNewReturnDate] = useState('');
  const [newReturnTime, setNewReturnTime] = useState('');

  const myTrips = useMemo(
    () => trips.filter((t) => t.user_id === profile?.id),
    [trips, profile]
  );

  const selected =
    myTrips.find((t) => t.id === selectedId) ?? null;

  /*
   * Auto start trip
   */
  useEffect(() => {
    myTrips.forEach((t) => {
      if (t.status !== 'Approved / Ready for Trip') return;

      const today = new Date().toISOString().slice(0, 10);

      if (t.departure_date <= today) {
        updateTrip(t.id, {
          status: 'On Trip',
        });

        supabase.from('trip_tracking').insert({
          trip_id: t.id,
          actor_name: 'System',
          actor_role: 'System',
          action: 'Auto Start Trip',
          from_status: 'Approved / Ready for Trip',
          to_status: 'On Trip',
          remarks: 'Auto-activated by date',
        });
      }
    });
  }, [myTrips]);

  /*
   * Re-review setelah reject
   */
  const requestReReview = async (t: BizTrip) => {
    const justification = window.prompt(
      'Tulis justifikasi permintaan Re-Review:'
    );

    if (!justification?.trim()) return;

    await updateTrip(t.id, {
      status: 'Pending Manager Approval',
      review_justification: justification,
      reject_reason: null,
    });

    await supabase.from('trip_tracking').insert({
      trip_id: t.id,
      actor_name: profile?.name ?? '',
      actor_role: 'Employee',
      action: 'Request Re-Review',
      from_status: t.status,
      to_status: 'Pending Manager Approval',
      remarks: justification,
    });

    showToast('success', 'Re-Review diajukan');

    refresh();
  };

  /*
   * Start trip manual
   */
  const startTrip = async (t: BizTrip) => {
    await updateTrip(t.id, {
      status: 'On Trip',
    });

    await supabase.from('trip_tracking').insert({
      trip_id: t.id,
      actor_name: profile?.name ?? '',
      actor_role: 'Employee',
      action: 'Start Trip',
      from_status: 'Approved / Ready for Trip',
      to_status: 'On Trip',
    });

    showToast('success', 'Trip dimulai');

    refresh();
  };

  /*
   * Cancel
   */
  const doCancel = async () => {
    if (!cancelTrip || !cancelReason.trim()) {
      showToast(
        'error',
        'Catatan alasan wajib diisi'
      );

      return;
    }

    await updateTrip(cancelTrip.id, {
      status: 'Rejected',

      cancel_reason_category: 'Cancel',

      cancel_reason_detail: cancelReason,

      reject_reason:
        `Cancelled by Employee: ${cancelReason}`,
    });

    await supabase.from('trip_tracking').insert({
      trip_id: cancelTrip.id,

      actor_name: profile?.name ?? '',

      actor_role: 'Employee',

      action: 'Cancel Trip',

      from_status: cancelTrip.status,

      to_status: 'Rejected',

      remarks: cancelReason,
    });

    showToast(
      'success',
      'Pengajuan berhasil dibatalkan'
    );

    setCancelTrip(null);
    setCancelReason('');

    refresh();
  };

  /*
   * Buka modal reschedule
   */
  const openReschedule = (trip: BizTrip) => {
    setRescheduleTrip(trip);

    setRescheduleReason('');

    setNewDepartureDate(
      trip.departure_date
    );

    setNewDepartureTime(
      trip.departure_time ?? ''
    );

    setNewReturnDate(
      trip.return_date
    );

    setNewReturnTime(
      trip.return_time ?? ''
    );
  };

  /*
   * Helper geser tanggal itinerary
   */
  const shiftDate = (
    dateString: string,
    diffDays: number
  ) => {
    const date = new Date(
      `${dateString}T00:00:00`
    );

    date.setDate(
      date.getDate() + diffDays
    );

    return date
      .toISOString()
      .slice(0, 10);
  };

  const dateDiffInDays = (
    oldDate: string,
    newDate: string
  ) => {
    const oldD = new Date(
      `${oldDate}T00:00:00`
    );

    const newD = new Date(
      `${newDate}T00:00:00`
    );

    return Math.round(
      (
        newD.getTime() -
        oldD.getTime()
      ) /
        (
          1000 *
          60 *
          60 *
          24
        )
    );
  };

  /*
   * Submit reschedule
   */
  const doReschedule = async () => {
    if (
      !rescheduleTrip ||
      !rescheduleReason.trim() ||
      !newDepartureDate ||
      !newReturnDate
    ) {
      showToast(
        'error',
        'Tanggal baru dan alasan reschedule wajib diisi'
      );

      return;
    }

    const newDepartureDateTime =
      new Date(
        `${newDepartureDate}T${newDepartureTime || '00:00'}`
      );

    const newReturnDateTime =
      new Date(
        `${newReturnDate}T${newReturnTime || '23:59'}`
      );

    if (
      newReturnDateTime <
      newDepartureDateTime
    ) {
      showToast(
        'error',
        'Tanggal dan jam kembali tidak boleh sebelum tanggal dan jam berangkat'
      );

      return;
    }

    const originalItinerary =
      rescheduleTrip.itinerary ?? [];

    if (
      originalItinerary.length === 0
    ) {
      showToast(
        'error',
        'Itinerary perjalanan tidak ditemukan'
      );

      return;
    }

    const departureDiff =
      dateDiffInDays(
        rescheduleTrip.departure_date,
        newDepartureDate
      );

    /*
     * Semua itinerary digeser
     * berdasarkan tanggal berangkat baru.
     *
     * Destination / rute / agenda tetap.
     */
    let shiftedItinerary =
      originalItinerary.map((leg) => ({
        ...leg,

        start_date:
          shiftDate(
            leg.start_date,
            departureDiff
          ),

        end_date:
          shiftDate(
            leg.end_date,
            departureDiff
          ),
      }));

    /*
     * Leg pertama mengikuti
     * tanggal dan jam berangkat baru.
     */
    shiftedItinerary =
      shiftedItinerary.map(
        (leg, index) => {
          if (index !== 0) return leg;

          return {
            ...leg,

            start_date:
              newDepartureDate,

            start_time:
              newDepartureTime ||
              leg.start_time,
          };
        }
      );

    /*
     * Leg terakhir mengikuti
     * tanggal dan jam kembali baru.
     */
    shiftedItinerary =
      shiftedItinerary.map(
        (leg, index) => {
          if (
            index !==
            shiftedItinerary.length - 1
          ) {
            return leg;
          }

          return {
            ...leg,

            end_date:
              newReturnDate,

            end_time:
              newReturnTime ||
              leg.end_time,
          };
        }
      );

    const oldSchedule =
      `${rescheduleTrip.departure_date} ` +
      `${rescheduleTrip.departure_time ?? ''} s/d ` +
      `${rescheduleTrip.return_date} ` +
      `${rescheduleTrip.return_time ?? ''}`;

    const newSchedule =
      `${newDepartureDate} ` +
      `${newDepartureTime || ''} s/d ` +
      `${newReturnDate} ` +
      `${newReturnTime || ''}`;

    try {
      await updateTrip(
        rescheduleTrip.id,
        {
          /*
           * Update jadwal
           */
          itinerary:
            shiftedItinerary,

          departure_date:
            newDepartureDate,

          departure_time:
            newDepartureTime || null,

          return_date:
            newReturnDate,

          return_time:
            newReturnTime || null,

          total_days:
            daysBetween(
              newDepartureDate,
              newReturnDate
            ),

          /*
           * Reschedule tidak mengulang
           * approval Manager / PIC / Direksi.
           *
           * Langsung ke HR Cost Review.
           */
          status:
            'Pending HR Advance Review',

          cancel_reason_category:
            'Reschedule',

          cancel_reason_detail:
            rescheduleReason,

          review_justification:
            `Reschedule dari ${oldSchedule} menjadi ${newSchedule}. ` +
            `Alasan: ${rescheduleReason}`,

          /*
           * SPD lama tidak berlaku.
           * HR akan hitung ulang advance
           * dan menerbitkan SPD kembali.
           */
          spd_number: null,

          spd_issued_at: null,

          approved_at: null,
        }
      );

      await supabase
        .from('trip_tracking')
        .insert({
          trip_id:
            rescheduleTrip.id,

          actor_name:
            profile?.name ?? '',

          actor_role:
            'Employee',

          action:
            'Reschedule Request',

          from_status:
            rescheduleTrip.status,

          to_status:
            'Pending HR Advance Review',

          remarks:
            `Jadwal lama: ${oldSchedule}. ` +
            `Jadwal baru: ${newSchedule}. ` +
            `Alasan: ${rescheduleReason}`,
        });

      showToast(
        'success',
        'Reschedule berhasil diajukan dan akan direview ulang oleh HR'
      );

      setRescheduleTrip(null);
      setRescheduleReason('');

      setNewDepartureDate('');
      setNewDepartureTime('');
      setNewReturnDate('');
      setNewReturnTime('');

      refresh();
    } catch (e: any) {
      showToast(
        'error',
        'Gagal mengajukan reschedule: ' +
          e.message
      );
    }
  };

  /*
   * DETAIL TRIP
   */
  if (selected) {
    const canCancel =
      ![
        'Completed',
        'Rejected',
      ].includes(
        selected.status
      );

    const canReschedule =
      selected.status ===
      'Approved / Ready for Trip';

    return (
      <div className="space-y-4 max-w-4xl mx-auto animate-slide-up">

        <div className="flex items-center justify-between">

          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setSelectedId(null)
            }
          >
            ← Back
          </Button>

          <div className="flex gap-2">

            {selected.status ===
              'Approved / Ready for Trip' && (
              <Button
                size="sm"
                icon={
                  <Play className="w-3.5 h-3.5" />
                }
                onClick={() =>
                  startTrip(selected)
                }
              >
                Start Trip
              </Button>
            )}

            {canReschedule && (
              <Button
                size="sm"
                variant="secondary"
                icon={
                  <CalendarClock className="w-3.5 h-3.5" />
                }
                onClick={() =>
                  openReschedule(selected)
                }
              >
                Reschedule
              </Button>
            )}

            {canCancel && (
              <Button
                size="sm"
                variant="danger"
                icon={
                  <X className="w-3.5 h-3.5" />
                }
                onClick={() => {
                  setCancelTrip(
                    selected
                  );

                  setCancelReason('');
                }}
              >
                Cancel Trip
              </Button>
            )}

          </div>
        </div>

        <TripDetail
          trip={selected}
          onPrint={onPrint}
        />

        {selected.status ===
          'Rejected' && (
          <Card className="p-4">
            <Button
              size="sm"
              variant="secondary"
              icon={
                <RotateCcw className="w-3.5 h-3.5" />
              }
              onClick={() =>
                requestReReview(
                  selected
                )
              }
            >
              Request Re-Review
            </Button>
          </Card>
        )}

      </div>
    );
  }

  /*
   * LIST TRIP
   */
  return (
    <div className="space-y-6 animate-slide-up max-w-4xl mx-auto">

      <div className="flex items-center gap-3">

        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <MapPin className="w-5 h-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            My Trips
          </h2>

          <p className="text-sm text-slate-500">
            {myTrips.length} pengajuan dinas
          </p>
        </div>

      </div>

      {myTrips.length === 0 ? (

        <Card className="p-6">
          <EmptyState
            icon={
              <MapPin className="w-6 h-6" />
            }
            title="Belum ada trip"
            message="Buat pengajuan dinas baru untuk memulai."
          />
        </Card>

      ) : (

        <div className="space-y-2">

          {myTrips.map((t) => {
            const canCancel =
              ![
                'Completed',
                'Rejected',
              ].includes(
                t.status
              );

            const canReschedule =
              t.status ===
              'Approved / Ready for Trip';

            return (
              <Card
                key={t.id}
                className="p-4 hover:ring-brand-200 transition cursor-pointer"
              >

                <div
                  className="flex items-start justify-between gap-4"
                  onClick={() =>
                    setSelectedId(t.id)
                  }
                >

                  <div className="flex-1 min-w-0">

                    <div className="text-sm font-semibold text-slate-800 truncate">
                      {t.purpose}
                    </div>

                    <div className="text-xs text-slate-400 mt-0.5">
                      {t.origin}
                      {' → '}
                      {t.itinerary?.[0]
                        ?.destination ??
                        '-'}
                      {' · '}
                      {formatDate(
                        t.departure_date
                      )}
                      {' · '}
                      {daysBetween(
                        t.departure_date,
                        t.return_date
                      )}
                      {' hari · '}
                      {formatIDR(
                        Number(
                          t.cost_grand_total
                        ) || 0
                      )}
                    </div>

                    {t.employee_remarks && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        Remarks:{' '}
                        {t.employee_remarks}
                      </div>
                    )}

                  </div>

                  <StatusBadge
                    status={t.status}
                  />

                </div>

                <div className="mt-3 flex gap-2 flex-wrap items-center">

                  {t.status ===
                    'Approved / Ready for Trip' && (
                    <Button
                      size="sm"
                      icon={
                        <Play className="w-3.5 h-3.5" />
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        startTrip(t);
                      }}
                    >
                      Start Trip
                    </Button>
                  )}

                  {t.status ===
                    'Rejected' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={
                        <RotateCcw className="w-3.5 h-3.5" />
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        requestReReview(t);
                      }}
                    >
                      Re-Review
                    </Button>
                  )}

                  {(
                    t.status ===
                      'Approved / Ready for Trip' ||
                    t.status ===
                      'On Trip' ||
                    t.status ===
                      'Completed'
                  ) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={
                        <FileText className="w-3.5 h-3.5" />
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        onPrint(t.id);
                      }}
                    >
                      Cetak PDF
                    </Button>
                  )}

                  {canReschedule && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={
                        <CalendarClock className="w-3.5 h-3.5 text-brand-600" />
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        openReschedule(t);
                      }}
                    >
                      Reschedule
                    </Button>
                  )}

                  {canCancel && (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={
                        <X className="w-3.5 h-3.5" />
                      }
                      onClick={(e) => {
                        e.stopPropagation();

                        setCancelTrip(t);

                        setCancelReason('');
                      }}
                    >
                      Cancel Trip
                    </Button>
                  )}

                </div>

              </Card>
            );
          })}

        </div>
      )}

      {/* CANCEL MODAL */}
      <Modal
        open={!!cancelTrip}
        onClose={() =>
          setCancelTrip(null)
        }
        title="Cancel Request"
      >

        <div className="space-y-4">

          <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 p-3 text-sm text-rose-700">
            Anda akan membatalkan pengajuan:{' '}
            <strong>
              {cancelTrip?.purpose}
            </strong>
          </div>

          <Field
            label="Catatan Alasan Pembatalan"
            required
          >

            <Textarea
              rows={3}
              value={cancelReason}
              onChange={(e) =>
                setCancelReason(
                  e.target.value
                )
              }
              placeholder="Jelaskan alasan pembatalan..."
            />

          </Field>

          <div className="flex gap-2 justify-end">

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setCancelTrip(null)
              }
            >
              Batal
            </Button>

            <Button
              variant="danger"
              size="sm"
              icon={
                <X className="w-3.5 h-3.5" />
              }
              onClick={doCancel}
            >
              Confirm Cancel
            </Button>

          </div>

        </div>

      </Modal>

      {/* RESCHEDULE MODAL */}
      <Modal
        open={!!rescheduleTrip}
        onClose={() =>
          setRescheduleTrip(null)
        }
        title="Reschedule Perjalanan"
      >

        <div className="space-y-4">

          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-800">
            Reschedule hanya untuk perubahan jadwal perjalanan.
            Tujuan dan rute perjalanan tidak dapat diubah.
            Jika tujuan atau rute berubah, silakan cancel dan buat pengajuan baru.
          </div>

          {rescheduleTrip && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">

              Jadwal sebelumnya:

              <strong className="ml-1">
                {formatDate(
                  rescheduleTrip.departure_date
                )}
                {' - '}
                {formatDate(
                  rescheduleTrip.return_date
                )}
              </strong>

            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            <Field
              label="Tanggal Berangkat Baru"
              required
            >

              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={newDepartureDate}
                onChange={(e) =>
                  setNewDepartureDate(
                    e.target.value
                  )
                }
              />

            </Field>

            <Field label="Jam Berangkat Baru">

              <input
                type="time"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={newDepartureTime}
                onChange={(e) =>
                  setNewDepartureTime(
                    e.target.value
                  )
                }
              />

            </Field>

            <Field
              label="Tanggal Kembali Baru"
              required
            >

              <input
                type="date"
                min={newDepartureDate}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={newReturnDate}
                onChange={(e) =>
                  setNewReturnDate(
                    e.target.value
                  )
                }
              />

            </Field>

            <Field label="Jam Kembali Baru">

              <input
                type="time"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={newReturnTime}
                onChange={(e) =>
                  setNewReturnTime(
                    e.target.value
                  )
                }
              />

            </Field>

          </div>

          <Field
            label="Alasan Reschedule"
            required
          >

            <Textarea
              rows={3}
              value={rescheduleReason}
              onChange={(e) =>
                setRescheduleReason(
                  e.target.value
                )
              }
              placeholder="Jelaskan alasan perubahan jadwal..."
            />

          </Field>

          <div className="flex gap-2 justify-end">

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setRescheduleTrip(null)
              }
            >
              Batal
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={
                <CalendarClock className="w-3.5 h-3.5" />
              }
              onClick={doReschedule}
            >
              Submit Reschedule
            </Button>

          </div>

        </div>

      </Modal>

    </div>
  );
}

void Calendar;
void CheckCircle2;
