import {
  useState,
  useMemo,
  useEffect,
} from 'react';

import {
  Truck,
  Check,
  Fuel,
  Gauge,
  Car,
  UserCheck,
  Printer,
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

import {
  formatDate,
  daysBetween,
} from '../lib/utils';

import { supabase } from '../lib/supabase';
import { PdfPrint } from './PdfPrint';

import type { BizTrip } from '../lib/types';

export function PicObligo({
  selectedTripId,
}: {
  selectedTripId?: string | null;
}) {
  const { profile } = useAuth();

  const {
    trips,
    vehicles,
    drivers,
    updateTrip,
    showToast,
    refresh,
  } = useApp();

  const [
    selected,
    setSelected,
  ] = useState<BizTrip | null>(
    null
  );

  const [
    printTripId,
    setPrintTripId,
  ] = useState<string | null>(
    null
  );

  const [
    vehicleType,
    setVehicleType,
  ] = useState('');

  const [
    vehiclePlate,
    setVehiclePlate,
  ] = useState('');

  const [
    vehicleKm,
    setVehicleKm,
  ] = useState('');

  const [
    driverName,
    setDriverName,
  ] = useState('');

  const [
    fuelCost,
    setFuelCost,
  ] = useState(0);

  const [
    etollCost,
    setEtollCost,
  ] = useState(0);

  const [
    note,
    setNote,
  ] = useState('');

  /*
   * QUEUE PIC OBLIGO
   *
   * Status resmi flow:
   * Pending PIC Obligo
   */
  const queue = useMemo(() => {
    return trips.filter(
      (t) =>
        t.status ===
        'Pending PIC Obligo'
    );
  }, [trips]);

  /*
   * OPEN ASSIGNMENT
   */
  const startReview = (
    t: BizTrip
  ) => {
    setSelected(t);

    setVehicleType(
      t.obligo_vehicle_type ??
        ''
    );

    setVehiclePlate(
      t.obligo_vehicle_plate ??
        ''
    );

    setVehicleKm(
      t.obligo_vehicle_km ??
        ''
    );

    setDriverName(
      t.obligo_driver_name ??
        ''
    );

    setFuelCost(
      Number(
        t.fuel_cost
      ) || 0
    );

    setEtollCost(
      Number(
        t.etoll_cost
      ) || 0
    );

    setNote(
      t.obligo_note ??
        ''
    );
  };

  /*
   * AUTO OPEN
   *
   * Jika masuk dari Dashboard
   * atau Approval Queue,
   * trip yang dipilih langsung
   * membuka form assignment.
   */
  useEffect(() => {
    if (
      !selectedTripId
    ) {
      return;
    }

    /*
     * Jangan reset form berkali-kali
     * jika trip yang sama sudah dibuka.
     */
    if (
      selected?.id ===
      selectedTripId
    ) {
      return;
    }

    const trip =
      trips.find(
        (t) =>
          t.id ===
            selectedTripId &&
          t.status ===
            'Pending PIC Obligo'
      );

    if (trip) {
      startReview(trip);
    }
  }, [
    selectedTripId,
    trips,
    selected?.id,
  ]);

  /*
   * SUBMIT ASSIGNMENT
   */
  const needsVehicle =
  selected.requires_vehicle === true ||
  selected.needs_vehicle === true;

const needsDriver =
  selected.requires_driver === true ||
  selected.needs_driver === true;

if (needsVehicle && !vehiclePlate.trim()) {
  showToast(
    'error',
    'Kendaraan wajib diassign untuk perjalanan ini'
  );
  return;
}

if (needsDriver && !driverName.trim()) {
  showToast(
    'error',
    'Driver wajib diassign untuk perjalanan ini'
  );
  return;
}

    try {
      await updateTrip(
        selected.id,
        {
          obligo_vehicle_type:
            vehicleType,

          obligo_vehicle_plate:
            vehiclePlate,

          obligo_vehicle_km:
            vehicleKm,

          obligo_driver_name:
            driverName,

          obligo_note:
            note,

          /*
           * Operasional kendaraan
           */
          fuel_cost:
            fuelCost,

          etoll_cost:
            etollCost,

          cost_fuel:
            fuelCost,

          cost_toll:
            etollCost,

          /*
           * Approval PIC
           */
          obligo_approved_by:
            profile?.name ??
            '',

          obligo_approved_at:
            new Date()
              .toISOString(),

          /*
           * Setelah assignment
           * lanjut ke Direksi.
           */
          status:
            'Pending Direksi Approval',
        }
      );

      /*
       * TRACKING
       */
      await supabase
        .from(
          'trip_tracking'
        )
        .insert({
          trip_id:
            selected.id,

          actor_name:
            profile?.name ??
            '',

          actor_role:
            'PIC Obligo',

          action:
            'Vehicle assigned -> Pending Direksi',

          from_status:
            'Pending PIC Obligo',

          to_status:
            'Pending Direksi Approval',

          remarks:
            `${vehiclePlate} · ` +
            `Driver ${driverName || '-'} · ` +
            `BBM ${fuelCost} · ` +
            `Toll ${etollCost}`,
        });

      showToast(
        'success',
        'Penugasan kendaraan berhasil disubmit dan dilanjutkan ke Direksi'
      );

      setSelected(null);

      /*
       * Reset form
       */
      setVehicleType('');
      setVehiclePlate('');
      setVehicleKm('');
      setDriverName('');
      setFuelCost(0);
      setEtollCost(0);
      setNote('');

      refresh();
    } catch (e: any) {
      showToast(
        'error',
        'Gagal: ' +
          e.message
      );
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center gap-3">

        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
          <Truck className="w-5 h-5" />
        </div>

        <div>

          <h2 className="text-xl font-bold text-slate-900">
            Vehicle & Driver Assignment
          </h2>

          <p className="text-sm text-slate-500">
            PIC Obligo ·{' '}
            {queue.length}{' '}
            pengajuan menunggu penugasan
          </p>

        </div>

      </div>

      {/* QUEUE */}
      {!selected && (
        <Card className="p-6">

          {queue.length === 0 ? (

            <EmptyState
              icon={
                <Truck className="w-6 h-6" />
              }
              title="Tidak ada pengajuan menunggu"
              message="Tidak ada trip yang perlu penugasan kendaraan saat ini."
            />

          ) : (

            <div className="space-y-3">

              {queue.map((t) => (

                <div
                  key={t.id}
                  className="rounded-xl ring-1 ring-slate-200 hover:ring-sky-300 transition p-4 bg-white shadow-sm"
                >

                  <div className="flex items-start justify-between gap-4">

                    <div className="flex-1 min-w-0">

                      <div className="flex items-center gap-2 flex-wrap mb-1">

                        <span className="text-sm font-bold text-slate-900">
                          {t.requester_name}
                        </span>

                        <div className="flex flex-wrap gap-1">

                          {t.company_burden.map(
                            (pt) => (

                              <span
                                key={pt}
                                className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-xs font-black border border-sky-200"
                              >
                                {pt}
                              </span>

                            )
                          )}

                        </div>

                      </div>

                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {t.purpose}
                      </div>

                      <div className="text-xs text-slate-500 mt-0.5">

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

                        {' hari'}

                      </div>

                      <div className="text-xs text-slate-600 mt-1 font-medium">

                        Transport:{' '}

                        <span className="font-bold">
                          {t.transport_type ??
                            '-'}
                        </span>

                        {' · '}

                        Butuh Kendaraan/Driver:{' '}

                        <span className="font-bold text-sky-700">
                          Ya
                        </span>

                      </div>

                    </div>

                    <StatusBadge
                      status={t.status}
                    />

                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        startReview(t)
                      }
                    >
                      Assign Vehicle
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      icon={
                        <Printer className="w-3.5 h-3.5" />
                      }
                      onClick={() =>
                        setPrintTripId(
                          t.id
                        )
                      }
                    >
                      Cetak PDF SPD
                    </Button>

                  </div>

                </div>

              ))}

            </div>
          )}

        </Card>
      )}

      {/* ASSIGNMENT FORM */}
      {selected && (

        <Card className="p-6 space-y-4 ring-2 ring-sky-500">

          <div className="flex items-center justify-between border-b border-slate-100 pb-3">

            <div>

              <h3 className="text-sm font-bold text-slate-900">
                Assign Vehicle & Driver
              </h3>

              <p className="text-xs text-slate-500 mt-0.5">
                Pemohon:{' '}
                {selected.requester_name}
                {' — '}
                {selected.purpose}
              </p>

            </div>

            <button
              onClick={() =>
                setSelected(null)
              }
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
            >
              Tutup
            </button>

          </div>

          {/* TRIP INFO */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">

              <div>
                <div className="text-slate-400 font-semibold">
                  Rute
                </div>

                <div className="text-slate-700 font-bold mt-0.5">
                  {selected.origin}
                  {' → '}
                  {selected.itinerary?.[0]
                    ?.destination ??
                    '-'}
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold">
                  Tanggal
                </div>

                <div className="text-slate-700 font-bold mt-0.5">
                  {formatDate(
                    selected.departure_date
                  )}
                  {' - '}
                  {formatDate(
                    selected.return_date
                  )}
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold">
                  Durasi
                </div>

                <div className="text-slate-700 font-bold mt-0.5">
                  {daysBetween(
                    selected.departure_date,
                    selected.return_date
                  )}
                  {' hari'}
                </div>
              </div>

            </div>

          </div>

          {/* VEHICLE */}
          <div className="grid md:grid-cols-2 gap-4">

            <Field
              label="Pilih Kendaraan Dinas"
              hint="Pilih dari daftar atau ketik manual"
            >

              <Select
                value={vehiclePlate}
                onChange={(e) => {
                  setVehiclePlate(
                    e.target.value
                  );

                  const v =
                    vehicles.find(
                      (vv) =>
                        vv.plate_number ===
                        e.target.value
                    );

                  if (v) {
                    setVehicleType(
                      v.vehicle_type
                    );

                    setVehicleKm(
                      String(
                        v.current_km ??
                          ''
                      )
                    );

                    /*
                     * Jika kendaraan sudah
                     * punya assigned driver,
                     * otomatis isi driver.
                     */
                    setDriverName(
                      v.assigned_driver ??
                        ''
                    );
                  }
                }}
              >

                <option value="">
                  Pilih kendaraan...
                </option>

                {vehicles.map(
                  (v) => (

                    <option
                      key={v.id}
                      value={
                        v.plate_number
                      }
                    >
                      {v.plate_number}
                      {' — '}
                      {v.vehicle_type}
                    </option>

                  )
                )}

              </Select>

              <Input
                className="mt-2"
                value={vehiclePlate}
                onChange={(e) =>
                  setVehiclePlate(
                    e.target.value
                  )
                }
                placeholder="Atau ketik nomor plat manual"
              />

            </Field>

            <Field label="Jenis Kendaraan">

              <Input
                value={vehicleType}
                onChange={(e) =>
                  setVehicleType(
                    e.target.value
                  )
                }
                placeholder="Mis: Toyota Innova"
              />

            </Field>

          </div>

          {/* DRIVER & KM */}
          <div className="grid md:grid-cols-2 gap-4">

            <Field
              label="Driver"
              hint="Pilih dari daftar atau ketik manual"
            >

              <Select
                value={driverName}
                onChange={(e) =>
                  setDriverName(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Pilih driver...
                </option>

                {drivers.map(
                  (d) => (

                    <option
                      key={d.id}
                      value={d.name}
                    >
                      {d.name}
                    </option>

                  )
                )}

              </Select>

              <Input
                className="mt-2"
                value={driverName}
                onChange={(e) =>
                  setDriverName(
                    e.target.value
                  )
                }
                placeholder="Atau ketik nama driver manual"
              />

            </Field>

            <Field label="KM Awal">

              <Input
                value={vehicleKm}
                onChange={(e) =>
                  setVehicleKm(
                    e.target.value
                  )
                }
                placeholder="Mis: 45000"
              />

            </Field>

          </div>

          {/* OPERATIONAL COST */}
          <div className="grid md:grid-cols-2 gap-4">

            <Field label="Estimasi BBM (Rp)">

              <Input
                type="number"
                value={fuelCost}
                onChange={(e) =>
                  setFuelCost(
                    parseFloat(
                      e.target.value
                    ) || 0
                  )
                }
              />

            </Field>

            <Field label="Estimasi E-Toll (Rp)">

              <Input
                type="number"
                value={etollCost}
                onChange={(e) =>
                  setEtollCost(
                    parseFloat(
                      e.target.value
                    ) || 0
                  )
                }
              />

            </Field>

          </div>

          {/* NOTES */}
          <Field label="Catatan PIC Obligo">

            <Textarea
              rows={2}
              value={note}
              onChange={(e) =>
                setNote(
                  e.target.value
                )
              }
              placeholder="Catatan tambahan..."
            />

          </Field>

          {/* ACTION */}
          <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">

            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setSelected(null)
              }
            >
              Cancel
            </Button>

            <Button
              size="sm"
              icon={
                <Check className="w-3.5 h-3.5" />
              }
              onClick={submit}
            >
              Submit Assignment
            </Button>

          </div>

        </Card>
      )}

      {/* PDF */}
      {printTripId && (
        <PdfPrint
          tripId={printTripId}
          mode="advance"
          onClose={() =>
            setPrintTripId(null)
          }
        />
      )}

    </div>
  );
}

/*
 * Existing imports yang belum digunakan
 * tetap dinetralkan agar build tidak warning/error
 * tergantung tsconfig.
 */
void Fuel;
void Gauge;
void Car;
void UserCheck;
void formatIDR;
