import {
  useState,
  useMemo,
  useEffect,
} from 'react';

import {
  Calculator,
  Plus,
  Trash2,
  Check,
  Save,
  FileText,
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
  formatIDR,
} from './ui-shared';

import {
  PT_OPTIONS,
  SCHEME_OVERRIDE_OPTIONS,
} from '../lib/constants';

import {
  computeCost,
  defaultKPScheme,
  daysBetween,
  generateSpdNumber,
} from '../lib/costCalc';

import {
  uid,
  formatDate,
} from '../lib/utils';

import { supabase } from '../lib/supabase';

import type {
  BizTrip,
  KPScheme,
  TripCategory,
} from '../lib/types';

type CostSplitRow = {
  id: string;
  name: string;
  nominal: number;
  keterangan: string;
  pt_burden: string;
};

export function CostCalculation({
  onPrint,
  selectedTripId,
}: {
  onPrint: (id: string) => void;
  selectedTripId?: string | null;
}) {
  const { profile } = useAuth();

  const {
    trips,
    disburseRows,
    
    updateTrip,
    showToast,
    refresh,
    
    travelMatrix,
    travelDKMatrix,
    driverIncentive
  } = useApp();

  const [selected, setSelected] =
    useState<BizTrip | null>(null);

  const [totalDays, setTotalDays] =
    useState(1);

  const [kpScheme, setKpScheme] =
    useState<KPScheme>('KP2');

  const [
    schemeOverride,
    setSchemeOverride,
  ] = useState('');

  const [hotelByHR, setHotelByHR] =
    useState(true);

  const [manualFuel, setManualFuel] =
    useState(0);

  const [manualEtoll, setManualEtoll] =
    useState(0);

  /*
   * HR ABSOLUTE OVERRIDE
   */
  const [
    allowanceOverride,
    setAllowanceOverride,
  ] = useState<
    Record<string, number>
  >({});

  const [
    hotelOverride,
    setHotelOverride,
  ] = useState<
    Record<string, number>
  >({});

  const [
    driverOverride,
    setDriverOverride,
  ] = useState<
    Record<string, number>
  >({});

  const [
    pettyOverride,
    setPettyOverride,
  ] = useState<
    Record<string, number>
  >({});

  /*
   * Driver dari PIC Obligo
   * yang tidak menjadi participant.
   */
  const [
    externalDriverOverride,
    setExternalDriverOverride,
  ] = useState<number | null>(
    null
  );

  const [
    spdNumber,
    setSpdNumber,
  ] = useState('');

  const [
    hrNotes,
    setHrNotes,
  ] = useState('');

  /*
   * TABLE B
   */
  const [
    extraRows,
    setExtraRows,
  ] = useState<CostSplitRow[]>(
    []
  );

  /*
   * QUEUE
   */
  const queue = useMemo(
    () =>
      trips.filter(
        (t) =>
          t.status ===
          'Pending HR Advance Review'
      ),
    [trips]
  );

  /*
   * START REVIEW
   */
  const startReview = (
    t: BizTrip
  ) => {
    setSelected(t);

    const activeScheme =
      t.kp_scheme ??
      defaultKPScheme(
        t.itinerary ?? []
      );

    setKpScheme(
      activeScheme
    );

    setSchemeOverride(
      ''
    );

    setTotalDays(
      t.total_days ||
        daysBetween(
          t.departure_date,
          t.return_date
        )
    );

    setManualFuel(
      Number(
        t.fuel_cost
      ) || 0
    );

    setManualEtoll(
      Number(
        t.etoll_cost
      ) || 0
    );

    const saved =
      t.cost_data ?? {};

    /*
     * Default:
     * HR yang menentukan
     * apakah hotel dipesankan.
     */
    setHotelByHR(
      saved.hotelByHR ??
        true
    );

    const savedPP =
      Array.isArray(
        saved.perParticipant
      )
        ? saved.perParticipant
        : [];

    const allowanceMap:
      Record<string, number> =
        {};

    const hotelMap:
      Record<string, number> =
        {};

    const driverMap:
      Record<string, number> =
        {};

    const pettyMap:
      Record<string, number> =
        {};

    savedPP.forEach(
      (p: any) => {
        if (!p?.name) {
          return;
        }

        if (
          p.total !== undefined
        ) {
          allowanceMap[p.name] =
            Number(
              p.total
            ) || 0;
        }

        if (
          p.hotel !== undefined
        ) {
          hotelMap[p.name] =
            Number(
              p.hotel
            ) || 0;
        }

        if (
          p.driver !== undefined
        ) {
          driverMap[p.name] =
            Number(
              p.driver
            ) || 0;
        }

        if (
          p.pettyCash !== undefined
        ) {
          pettyMap[p.name] =
            Number(
              p.pettyCash
            ) || 0;
        }
      }
    );

    setAllowanceOverride(
      allowanceMap
    );

    setHotelOverride(
      hotelMap
    );

    setDriverOverride(
      driverMap
    );

    setPettyOverride(
      pettyMap
    );

    setExternalDriverOverride(
      saved.externalDriverIncentive !==
        undefined
        ? Number(
            saved.externalDriverIncentive
          ) || 0
        : null
    );

    const defaultSpd =
      generateSpdNumber(
        activeScheme,
        queue.length + 1,
        t.requester_name
      );

    setSpdNumber(
      t.spd_number ??
        defaultSpd
    );

    setHrNotes(
      t.hr_notes ?? ''
    );

    /*
     * LOAD TABLE B
     */
    const existing =
      disburseRows.filter(
        (d) =>
          d.trip_id ===
          t.id
      );

    setExtraRows(
      existing.length > 0
        ? existing.map(
            (d) => ({
              id: d.id,

              name:
                d.name,

              nominal:
                Number(
                  d.nominal
                ),

              keterangan:
                d.component_note,

              pt_burden:
                d.pt_burden,
            })
          )
        : []
    );
  };

  /*
   * AUTO OPEN
   */
  useEffect(() => {
    if (!selectedTripId) {
      return;
    }

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
            'Pending HR Advance Review'
      );

    if (trip) {
      startReview(
        trip
      );
    }
  }, [
    selectedTripId,
    trips,
    selected?.id,
  ]);

  /*
   * CALCULATION
   */
  const cost =
    useMemo(() => {
      if (!selected) {
        return null;
      }

      const effectiveTripCategory:
        TripCategory =
          schemeOverride.startsWith(
            'within_city'
          ) ||
          schemeOverride ===
            'luar_kota'
            ? (
                schemeOverride as TripCategory
              )
            : selected.trip_category;

      const effectiveKpScheme:
        KPScheme = (
          [
            'KP1',
            'KP2',
            'KPO',
          ].includes(
            schemeOverride
          )
            ? schemeOverride
            : kpScheme
        ) as KPScheme;

      /*
       * MATRIX DEFAULT
       */
      const base =
  computeCost({
    participants:
      selected.participants ??
      [],

    days:
      totalDays,

    itinerary:
      selected.itinerary ??
      [],

    origin:
      selected.origin,

    tripCategory:
      effectiveTripCategory,

    kpScheme:
      effectiveKpScheme,

    needsDriver:
      selected.needs_driver,

    /*
     * Driver distance incentive
     */
    totalDistance:
      selected.total_distance ??
      'none',

    fuelCost:
      manualFuel,

    etollCost:
      manualEtoll,

    hotelByHR,

    /*
     * Dynamic Matrix from Supabase
     */
    matrix:
      travelMatrix,

    dkMatrix:
      travelDKMatrix,

    driverIncentive:
      driverIncentive,
  });

      /*
       * DRIVER EXTERNAL
       */
      const participantDriverBase =
        base.perParticipant.reduce(
          (sum, pp) =>
            sum +
            Number(
              pp.driver || 0
            ),
          0
        );

      const baseExternalDriver =
        Math.max(
          0,
          base.driverTotal -
            participantDriverBase
        );

      /*
       * APPLY HR OVERRIDE
       */
      const perParticipant =
        base.perParticipant.map(
          (pp) => {
            const allowance =
              allowanceOverride[
                pp.name
              ] ??
              pp.total;

            const hotel =
              hotelByHR
                ? 0
                : (
                    hotelOverride[
                      pp.name
                    ] ??
                    pp.hotel
                  );

            const driver =
              driverOverride[
                pp.name
              ] ??
              pp.driver;

            const pettyCash =
              pettyOverride[
                pp.name
              ] ??
              pp.pettyCash;

            return {
              ...pp,

              total:
                Number(
                  allowance
                ) || 0,

              hotel:
                Number(
                  hotel
                ) || 0,

              driver:
                Number(
                  driver
                ) || 0,

              pettyCash:
                Number(
                  pettyCash
                ) || 0,
            };
          }
        );

      const perDiemTotal =
        perParticipant.reduce(
          (sum, pp) =>
            sum +
            pp.total,
          0
        );

      const hotelTotal =
        perParticipant.reduce(
          (sum, pp) =>
            sum +
            pp.hotel,
          0
        );

      const participantDriverTotal =
        perParticipant.reduce(
          (sum, pp) =>
            sum +
            pp.driver,
          0
        );

      const externalDriverIncentive =
        externalDriverOverride ??
        baseExternalDriver;

      const driverTotal =
        participantDriverTotal +
        externalDriverIncentive;

      const pettyCashTotal =
        perParticipant.reduce(
          (sum, pp) =>
            sum +
            pp.pettyCash,
          0
        );

      const grandTotal =
        perDiemTotal +
        hotelTotal +
        driverTotal +
        pettyCashTotal +
        manualFuel +
        manualEtoll;

      const extraTotal =
        extraRows.reduce(
          (sum, row) =>
            sum +
            Number(
              row.nominal || 0
            ),
          0
        );

      return {
        ...base,

        perParticipant,

        perDiemTotal,

        hotelTotal,

        driverTotal,

        pettyCashTotal,

        grandTotal,

        extraTotal,

        externalDriverIncentive,

        effectiveKpScheme,

        effectiveTripCategory,
      };
    }, [
      selected,
      schemeOverride,
      kpScheme,
      totalDays,
      manualFuel,
      manualEtoll,
      hotelByHR,
      allowanceOverride,
      hotelOverride,
      driverOverride,
      pettyOverride,
      externalDriverOverride,
      extraRows,

      travelMatrix,
      travelDKMatrix,
      driverIncentive,
    ]);

  const defaultPT =
    selected
      ?.company_burden?.[0] ||
    PT_OPTIONS[0];

  /*
   * TABLE A → TABLE B
   */
  const generateCostSplitFromTableA =
    () => {
      if (
        !selected ||
        !cost
      ) {
        return;
      }

      const rows:
        CostSplitRow[] =
        [];

      cost.perParticipant.forEach(
        (pp) => {
          if (
            pp.total > 0
          ) {
            rows.push({
              id: uid(),

              name:
                pp.name,

              nominal:
                pp.total,

              keterangan:
                'Tunjangan Perjalanan Dinas',

              pt_burden:
                defaultPT,
            });
          }

          if (
            pp.hotel > 0
          ) {
            rows.push({
              id: uid(),

              name:
                pp.name,

              nominal:
                pp.hotel,

              keterangan:
                'Akomodasi',

              pt_burden:
                defaultPT,
            });
          }

          if (
            pp.driver > 0
          ) {
            rows.push({
              id: uid(),

              name:
                pp.name,

              nominal:
                pp.driver,

              keterangan:
                'Insentif Jarak Driver',

              pt_burden:
                defaultPT,
            });
          }

          if (
            pp.pettyCash > 0
          ) {
            rows.push({
              id: uid(),

              name:
                pp.name,

              nominal:
                pp.pettyCash,

              keterangan:
                'Pettycash',

              pt_burden:
                defaultPT,
            });
          }
        }
      );

      /*
       * Driver assigned PIC,
       * bukan participant.
       */
      if (
        cost.externalDriverIncentive >
        0
      ) {
        rows.push({
          id: uid(),

          name:
            selected.obligo_driver_name ||
            'Driver',

          nominal:
            cost.externalDriverIncentive,

          keterangan:
            'Insentif Jarak Driver',

          pt_burden:
            defaultPT,
        });
      }

      if (
        manualFuel > 0
      ) {
        rows.push({
          id: uid(),

          name:
            selected.requester_name,

          nominal:
            manualFuel,

          keterangan:
            'BBM',

          pt_burden:
            defaultPT,
        });
      }

      if (
        manualEtoll > 0
      ) {
        rows.push({
          id: uid(),

          name:
            selected.requester_name,

          nominal:
            manualEtoll,

          keterangan:
            'E-Toll',

          pt_burden:
            defaultPT,
        });
      }

      setExtraRows(
        rows
      );

      showToast(
        'info',
        'Table A berhasil disalin ke Table B. Silakan sesuaikan pemecahan cost center.'
      );
    };

  const addExtraRow =
    () => {
      setExtraRows(
        (rows) => [
          ...rows,

          {
            id: uid(),

            name:
              selected
                ?.requester_name ??
              '',

            nominal: 0,

            keterangan:
              '',

            pt_burden:
              defaultPT,
          },
        ]
      );
    };

  const updateExtraRow = (
    id: string,
    patch: Partial<CostSplitRow>
  ) => {
    setExtraRows(
      (rows) =>
        rows.map(
          (row) =>
            row.id === id
              ? {
                  ...row,
                  ...patch,
                }
              : row
        )
    );
  };

  const removeExtraRow = (
    id: string
  ) => {
    setExtraRows(
      (rows) =>
        rows.filter(
          (row) =>
            row.id !== id
        )
    );
  };

  /*
   * SAVE COST CENTER
   */
  const persistCostSplit =
    async (
      tripId: string
    ) => {
      const deleteResult =
        await supabase
          .from(
            'disburse_rows'
          )
          .delete()
          .eq(
            'trip_id',
            tripId
          );

      if (
        deleteResult.error
      ) {
        throw deleteResult.error;
      }

      for (
        let i = 0;
        i <
        extraRows.length;
        i++
      ) {
        const row =
          extraRows[i];

        const result =
          await supabase
            .from(
              'disburse_rows'
            )
            .insert({
              id:
                row.id,

              trip_id:
                tripId,

              name:
                row.name,

              nominal:
                Number(
                  row.nominal
                ) || 0,

              component_note:
                row.keterangan,

              pt_burden:
                row.pt_burden,

              sort_order:
                i,
            });

        if (
          result.error
        ) {
          throw result.error;
        }
      }
    };

  /*
   * COST DATA
   *
   * Pemisahan ini akan kita pakai
   * untuk Settlement.
   */
  const buildCostData =
    () => {
      if (!cost) {
        return null;
      }

      return {
        hotelByHR,

        totalDistance:
          selected
            ?.total_distance ??
          'none',

        scheme:
          cost.effectiveKpScheme,

        perParticipant:
          cost.perParticipant,

        externalDriverIncentive:
          cost.externalDriverIncentive,

        pettyCashHolder:
          cost.pettyCashHolder,

        fuel:
          manualFuel,

        etoll:
          manualEtoll,

        totals: {
          allowance:
            cost.perDiemTotal,

          accommodation:
            cost.hotelTotal,

          driverIncentive:
            cost.driverTotal,

          pettyCash:
            cost.pettyCashTotal,

          fuel:
            manualFuel,

          etoll:
            manualEtoll,

          grandTotal:
            cost.grandTotal,
        },

        /*
         * Settlement tidak akan
         * memperhitungkan tunjangan
         * dan insentif sebagai biaya aktual.
         */
        nonAccountable: {
          allowance:
            cost.perDiemTotal,

          driverIncentive:
            cost.driverTotal,

          total:
            cost.perDiemTotal +
            cost.driverTotal,
        },

        accountable: {
          accommodation:
            cost.hotelTotal,

          pettyCash:
            cost.pettyCashTotal,

          fuel:
            manualFuel,

          etoll:
            manualEtoll,

          total:
            cost.hotelTotal +
            cost.pettyCashTotal +
            manualFuel +
            manualEtoll,
        },

        extraRows,
      };
    };

  /*
   * SAVE DRAFT
   */
  const saveDraft =
    async () => {
      if (
        !selected ||
        !cost
      ) {
        return;
      }

      try {
        await updateTrip(
          selected.id,
          {
            spd_number:
              spdNumber,

            hr_notes:
              hrNotes ||
              null,

            kp_scheme:
              cost.effectiveKpScheme,

            total_days:
              totalDays,

            cost_grand_total:
              cost.grandTotal,

            fuel_cost:
              manualFuel,

            etoll_cost:
              manualEtoll,

            cost_data:
              buildCostData(),
          }
        );

        await persistCostSplit(
          selected.id
        );

        showToast(
          'success',
          'Draft Cost & Advance berhasil disimpan'
        );

        refresh();
      } catch (e: any) {
        showToast(
          'error',
          'Gagal menyimpan draft: ' +
            e.message
        );
      }
    };

  /*
   * FINAL APPROVE
   */
  const approve =
    async () => {
      if (
        !selected ||
        !cost
      ) {
        return;
      }

      if (
        !spdNumber.trim()
      ) {
        showToast(
          'error',
          'Nomor SPD wajib diisi'
        );

        return;
      }

      /*
       * Table B wajib balance
       * dengan angka final Table A.
       */
      const difference =
        Math.abs(
          cost.extraTotal -
            cost.grandTotal
        );

      if (
        difference >
        0.01
      ) {
        showToast(
          'error',
          `Total Table B (${formatIDR(
            cost.extraTotal
          )}) harus sama dengan Grand Total Advance (${formatIDR(
            cost.grandTotal
          )}).`
        );

        return;
      }

      try {
        await persistCostSplit(
          selected.id
        );

        const now =
          new Date()
            .toISOString();

        await updateTrip(
          selected.id,
          {
            spd_number:
              spdNumber,

            hr_notes:
              hrNotes ||
              null,

            kp_scheme:
              cost.effectiveKpScheme,

            total_days:
              totalDays,

            cost_grand_total:
              cost.grandTotal,

            fuel_cost:
              manualFuel,

            etoll_cost:
              manualEtoll,

            cost_data:
              buildCostData(),

            status:
              'Approved / Ready for Trip',

            approved_at:
              now,

            spd_issued_at:
              now,
          }
        );

        const tracking =
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
                'HR Manager',

              action:
                'HR Cost & Advance Approved',

              from_status:
                'Pending HR Advance Review',

              to_status:
                'Approved / Ready for Trip',

              remarks:
                hrNotes ||
                'Cost & Advance Review completed',
            });

        if (
          tracking.error
        ) {
          throw tracking.error;
        }

        showToast(
          'success',
          'Cost & Advance disetujui. Trip siap dijalankan.'
        );

        setSelected(
          null
        );

        refresh();
      } catch (e: any) {
        showToast(
          'error',
          'Gagal approve: ' +
            e.message
        );
      }
    };

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center gap-3">

        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Calculator className="w-5 h-5" />
        </div>

        <div>

          <h2 className="text-xl font-bold text-slate-900">
            Cost & Advance Review
          </h2>

          <p className="text-sm text-slate-500">
            HR Manager · Review & Override ·{' '}
            {queue.length}{' '}
            pengajuan menunggu
          </p>

        </div>

      </div>

      {/* QUEUE */}
      {!selected && (
        <Card className="p-6">

          {queue.length ===
          0 ? (

            <EmptyState
              icon={
                <Calculator className="w-6 h-6" />
              }
              title="Tidak ada pengajuan menunggu"
              message="Tidak ada trip yang menunggu Cost & Advance Review."
            />

          ) : (

            <div className="space-y-2">

              {queue.map(
                (t) => (

                  <div
                    key={t.id}
                    className="rounded-xl ring-1 ring-slate-100 hover:ring-brand-200 transition p-4 flex items-center justify-between gap-4 bg-white shadow-sm"
                  >

                    <div className="flex-1 min-w-0">

                      <div className="text-base font-extrabold text-slate-900">
                        {t.requester_name}
                      </div>

                      <div className="text-sm font-semibold text-slate-700 truncate mt-0.5">
                        {t.purpose}
                      </div>

                      <div className="text-xs text-slate-400 mt-1">

                        {formatDate(
                          t.departure_date
                        )}

                        {' · '}

                        {daysBetween(
                          t.departure_date,
                          t.return_date
                        )}

                        {' hari · '}

                        {t.total_distance ===
                        'gt400'
                          ? '>400 KM'
                          : t.total_distance ===
                            'gt200'
                          ? '>200 KM'
                          : 'Jarak normal'}

                      </div>

                    </div>

                    <Button
                      size="sm"
                      onClick={() =>
                        startReview(
                          t
                        )
                      }
                    >
                      Review & Calculate
                    </Button>

                  </div>

                )
              )}

            </div>
          )}

        </Card>
      )}

      {/* REVIEW */}
      {selected &&
        cost && (
        <>

          {/* CONTROL */}
          <Card className="p-6 space-y-5">

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">

              <div>

                <h3 className="text-base font-bold text-slate-900">
                  HR Cost Override
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  {selected.requester_name}
                  {' · '}
                  {selected.purpose}
                </p>

              </div>

              <button
                onClick={() =>
                  setSelected(
                    null
                  )
                }
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Tutup
              </button>

            </div>

            <div className="grid md:grid-cols-3 gap-4">

              <Field label="Total Hari Dinas">

                <Input
                  type="number"
                  min={1}
                  value={
                    totalDays
                  }
                  onChange={(e) =>
                    setTotalDays(
                      parseInt(
                        e.target.value
                      ) || 1
                    )
                  }
                />

              </Field>

              <Field label="BBM (Rp)">

                <Input
                  type="number"
                  min={0}
                  value={
                    manualFuel
                  }
                  onChange={(e) =>
                    setManualFuel(
                      parseFloat(
                        e.target.value
                      ) || 0
                    )
                  }
                />

              </Field>

              <Field label="E-Toll (Rp)">

                <Input
                  type="number"
                  min={0}
                  value={
                    manualEtoll
                  }
                  onChange={(e) =>
                    setManualEtoll(
                      parseFloat(
                        e.target.value
                      ) || 0
                    )
                  }
                />

              </Field>

            </div>

            <Field label="Override Skema Perhitungan">

              <Select
                value={
                  schemeOverride
                }
                onChange={(e) =>
                  setSchemeOverride(
                    e.target.value
                  )
                }
              >

                <option value="">
                  Auto dari itinerary
                </option>

                {SCHEME_OVERRIDE_OPTIONS.map(
                  (o) => (

                    <option
                      key={
                        o.value
                      }
                      value={
                        o.value
                      }
                    >
                      {o.label}
                    </option>

                  )
                )}

              </Select>

            </Field>

            <label className="flex items-start gap-3 cursor-pointer bg-amber-50/60 p-4 rounded-xl border border-amber-200">

              <input
                type="checkbox"
                checked={
                  hotelByHR
                }
                onChange={(e) =>
                  setHotelByHR(
                    e.target.checked
                  )
                }
                className="w-4 h-4 mt-0.5 rounded text-brand-600 focus:ring-brand-500"
              />

              <div>

                <div className="text-xs font-bold text-amber-900">
                  Akomodasi dipesankan oleh HR
                </div>

                <div className="text-[11px] text-amber-700 mt-0.5">
                  Jika dicentang, nilai akomodasi yang dicairkan ke pegawai menjadi Rp0.
                  Jika tidak dicentang, biaya akomodasi LK / KP1 / KP2 / KPO masuk ke advance.
                </div>

              </div>

            </label>

          </Card>

          {/* TABLE A */}
          <Card className="p-6 space-y-4">

            <div>

              <h3 className="text-sm font-bold text-slate-800">
                A. Rincian Perhitungan & Override HR
              </h3>

              <p className="text-[11px] text-slate-500 mt-1">
                Matrix menjadi nilai default. HR dapat mengubah seluruh nominal sebelum approval.
              </p>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full text-xs border-collapse border border-slate-200">

                <thead>

                  <tr className="bg-slate-50 text-slate-700">

                    <th className="border border-slate-200 px-2 py-2 text-left">
                      Nama
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Jabatan
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Hari
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Tunjangan
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Akomodasi
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Insentif Driver
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Pettycash
                    </th>

                    <th className="border border-slate-200 px-2 py-2">
                      Subtotal
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {cost.perParticipant.map(
                    (pp) => {
                      const subtotal =
                        pp.total +
                        pp.hotel +
                        pp.driver +
                        pp.pettyCash;

                      return (
                        <tr key={pp.name}>

                          <td className="border border-slate-200 px-2 py-2 font-semibold">
                            {pp.name}
                          </td>

                          <td className="border border-slate-200 px-2 py-2 text-center">
                            {pp.jabatan}
                          </td>

                          <td className="border border-slate-200 px-2 py-2 text-center">
                            {pp.days}
                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              type="number"
                              min={0}
                              value={
                                pp.total
                              }
                              onChange={(e) =>
                                setAllowanceOverride(
                                  (old) => ({
                                    ...old,

                                    [pp.name]:
                                      parseFloat(
                                        e.target.value
                                      ) || 0,
                                  })
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            {hotelByHR ? (

                              <div className="text-center text-slate-400">
                                Dipesan HR
                              </div>

                            ) : (

                              <Input
                                type="number"
                                min={0}
                                value={
                                  pp.hotel
                                }
                                onChange={(e) =>
                                  setHotelOverride(
                                    (old) => ({
                                      ...old,

                                      [pp.name]:
                                        parseFloat(
                                          e.target.value
                                        ) || 0,
                                    })
                                  )
                                }
                                className="text-xs"
                              />

                            )}

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              type="number"
                              min={0}
                              value={
                                pp.driver
                              }
                              onChange={(e) =>
                                setDriverOverride(
                                  (old) => ({
                                    ...old,

                                    [pp.name]:
                                      parseFloat(
                                        e.target.value
                                      ) || 0,
                                  })
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              type="number"
                              min={0}
                              value={
                                pp.pettyCash
                              }
                              onChange={(e) =>
                                setPettyOverride(
                                  (old) => ({
                                    ...old,

                                    [pp.name]:
                                      parseFloat(
                                        e.target.value
                                      ) || 0,
                                  })
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 px-2 py-2 text-right font-bold">
                            {formatIDR(
                              subtotal
                            )}
                          </td>

                        </tr>
                      );
                    }
                  )}

                  {selected.needs_driver &&
                    cost.externalDriverIncentive >=
                      0 && (

                    <tr className="bg-emerald-50/40">

                      <td className="border border-slate-200 px-2 py-2 font-semibold">
                        {selected.obligo_driver_name ||
                          'Driver Assigned'}
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center">
                        Driver
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center">
                        Per Trip
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center text-slate-400">
                        -
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center text-slate-400">
                        -
                      </td>

                      <td className="border border-slate-200 p-1.5">

                        <Input
                          type="number"
                          min={0}
                          value={
                            cost.externalDriverIncentive
                          }
                          onChange={(e) =>
                            setExternalDriverOverride(
                              parseFloat(
                                e.target.value
                              ) || 0
                            )
                          }
                          className="text-xs"
                        />

                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-center text-slate-400">
                        -
                      </td>

                      <td className="border border-slate-200 px-2 py-2 text-right font-bold">
                        {formatIDR(
                          cost.externalDriverIncentive
                        )}
                      </td>

                    </tr>

                  )}

                </tbody>

              </table>

            </div>

            {/* OPERATIONAL */}
            <div className="grid md:grid-cols-2 gap-3">

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex justify-between text-sm">

                <span className="text-slate-600">
                  BBM
                </span>

                <strong>
                  {formatIDR(
                    manualFuel
                  )}
                </strong>

              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex justify-between text-sm">

                <span className="text-slate-600">
                  E-Toll
                </span>

                <strong>
                  {formatIDR(
                    manualEtoll
                  )}
                </strong>

              </div>

            </div>

            {/* TOTAL */}
            <div className="rounded-xl bg-brand-50 border border-brand-200 p-4">

              <div className="grid md:grid-cols-3 gap-3 text-xs">

                <CostSummary
                  label="Tunjangan"
                  value={
                    cost.perDiemTotal
                  }
                />

                <CostSummary
                  label="Akomodasi"
                  value={
                    cost.hotelTotal
                  }
                />

                <CostSummary
                  label="Insentif Driver"
                  value={
                    cost.driverTotal
                  }
                />

                <CostSummary
                  label="Pettycash"
                  value={
                    cost.pettyCashTotal
                  }
                />

                <CostSummary
                  label="BBM"
                  value={
                    manualFuel
                  }
                />

                <CostSummary
                  label="E-Toll"
                  value={
                    manualEtoll
                  }
                />

              </div>

              <div className="flex justify-between items-center mt-4 pt-3 border-t border-brand-200">

                <span className="font-bold text-brand-900">
                  Grand Total Advance
                </span>

                <span className="text-xl font-black text-brand-900">
                  {formatIDR(
                    cost.grandTotal
                  )}
                </span>

              </div>

            </div>

          </Card>

          {/* TABLE B */}
          <Card className="p-6 space-y-4">

            <div className="flex items-center justify-between gap-3 flex-wrap">

              <div>

                <h3 className="text-sm font-bold text-slate-800">
                  B. Rangkuman Pembiayaan & Cost Center
                </h3>

                <p className="text-[11px] text-slate-500 mt-1">
                  Total Table B wajib sama dengan Grand Total Advance.
                </p>

              </div>

              <div className="flex gap-2">

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={
                    generateCostSplitFromTableA
                  }
                >
                  Auto-Fill Table A
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={
                    <Plus className="w-3.5 h-3.5" />
                  }
                  onClick={
                    addExtraRow
                  }
                >
                  Add Row
                </Button>

              </div>

            </div>

            {extraRows.length ===
            0 ? (

              <EmptyState
                icon={
                  <Calculator className="w-5 h-5" />
                }
                title="Cost center belum diisi"
                message="Klik Auto-Fill Table A untuk membuat rincian pembiayaan."
              />

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full text-xs border-collapse border border-slate-200">

                  <thead>

                    <tr className="bg-slate-50">

                      <th className="border border-slate-200 px-2 py-2">
                        Nama
                      </th>

                      <th className="border border-slate-200 px-2 py-2">
                        Nominal
                      </th>

                      <th className="border border-slate-200 px-2 py-2">
                        Komponen
                      </th>

                      <th className="border border-slate-200 px-2 py-2">
                        Beban PT
                      </th>

                      <th className="border border-slate-200 px-2 py-2 w-10">
                        Aksi
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {extraRows.map(
                      (row) => (

                        <tr key={row.id}>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              value={
                                row.name
                              }
                              onChange={(e) =>
                                updateExtraRow(
                                  row.id,
                                  {
                                    name:
                                      e.target.value,
                                  }
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              type="number"
                              min={0}
                              value={
                                row.nominal
                              }
                              onChange={(e) =>
                                updateExtraRow(
                                  row.id,
                                  {
                                    nominal:
                                      parseFloat(
                                        e.target.value
                                      ) || 0,
                                  }
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Input
                              value={
                                row.keterangan
                              }
                              onChange={(e) =>
                                updateExtraRow(
                                  row.id,
                                  {
                                    keterangan:
                                      e.target.value,
                                  }
                                )
                              }
                              className="text-xs"
                            />

                          </td>

                          <td className="border border-slate-200 p-1.5">

                            <Select
                              value={
                                row.pt_burden
                              }
                              onChange={(e) =>
                                updateExtraRow(
                                  row.id,
                                  {
                                    pt_burden:
                                      e.target.value,
                                  }
                                )
                              }
                              className="text-xs"
                            >

                              {PT_OPTIONS.map(
                                (pt) => (

                                  <option
                                    key={
                                      pt
                                    }
                                    value={
                                      pt
                                    }
                                  >
                                    {pt}
                                  </option>

                                )
                              )}

                            </Select>

                          </td>

                          <td className="border border-slate-200 p-1.5 text-center">

                            <button
                              onClick={() =>
                                removeExtraRow(
                                  row.id
                                )
                              }
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                          </td>

                        </tr>

                      )
                    )}

                  </tbody>

                </table>

              </div>
            )}

            <div className="grid md:grid-cols-3 gap-3">

              <CostSummary
                label="Total Table B"
                value={
                  cost.extraTotal
                }
              />

              <CostSummary
                label="Grand Total Advance"
                value={
                  cost.grandTotal
                }
              />

              <CostSummary
                label="Selisih"
                value={
                  cost.extraTotal -
                  cost.grandTotal
                }
              />

            </div>

          </Card>

          {/* FINAL */}
          <Card className="p-6 space-y-4">

            <div className="grid md:grid-cols-2 gap-4">

              <Field
                label="Nomor SPD"
                required
              >

                <Input
                  value={
                    spdNumber
                  }
                  onChange={(e) =>
                    setSpdNumber(
                      e.target.value
                    )
                  }
                />

              </Field>

              <Field label="HR Notes">

                <Textarea
                  rows={3}
                  value={
                    hrNotes
                  }
                  onChange={(e) =>
                    setHrNotes(
                      e.target.value
                    )
                  }
                />

              </Field>

            </div>

            <div className="flex justify-end gap-2 flex-wrap">

              <Button
                size="sm"
                variant="secondary"
                icon={
                  <FileText className="w-3.5 h-3.5" />
                }
                onClick={() =>
                  onPrint(
                    selected.id
                  )
                }
              >
                Preview PDF
              </Button>

              <Button
                size="sm"
                variant="secondary"
                icon={
                  <Save className="w-3.5 h-3.5" />
                }
                onClick={
                  saveDraft
                }
              >
                Save Draft
              </Button>

              <Button
                size="sm"
                icon={
                  <Check className="w-3.5 h-3.5" />
                }
                onClick={
                  approve
                }
              >
                Approve Advance
              </Button>

            </div>

          </Card>

        </>
      )}

    </div>
  );
}

function CostSummary({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3">

      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">
        {label}
      </div>

      <div className="text-sm font-bold text-slate-900 mt-1">
        {formatIDR(
          value
        )}
      </div>

    </div>
  );
}
