import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';

import { supabase } from '../lib/supabase';

import type {
  BizTrip,
  DisburseRow,
  SettlementClaimRow,
  SettlementReceipt,
  Vehicle,
  Driver,
  TripTracking,
} from '../lib/types';

import {
  DEFAULT_MATRIX,
  DEFAULT_DK_MATRIX,
  DEFAULT_DRIVER_INCENTIVE,
} from '../lib/costCalc';

import type {
  DynamicMatrixMap,
  DynamicDKMatrixMap,
  DriverIncentiveSettings,
  GradeKey,
} from '../lib/costCalc';

// =========================================================
// TYPES
// =========================================================

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface TravelGradeMatrixRow {
  id: string;

  grade_key: GradeKey;
  grade_name: string;

  luar_kota: number;
  kp1: number;
  kp2: number;
  kpo: number;

  dk_25: number;
  dk_50: number;
  dk_100: number;

  hotel: number;
  petty_cash: number;

  sort_order: number;
  is_active: boolean;
}

interface TravelSettingRow {
  id: string;
  setting_key: string;
  setting_name: string;
  nominal: number;
  is_active: boolean;
}

export interface PTMasterRow {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
}

interface AppCtx {
  trips: BizTrip[];

  disburseRows: DisburseRow[];

  settlementClaimRows: SettlementClaimRow[];

  settlementReceipts: SettlementReceipt[];

  vehicles: Vehicle[];

  drivers: Driver[];

  tracking: TripTracking[];

  toasts: Toast[];

  loading: boolean;

  // =======================================================
  // DYNAMIC TRAVEL MATRIX
  // =======================================================

  travelMatrix: DynamicMatrixMap;

  travelDKMatrix: DynamicDKMatrixMap;

  driverIncentive: DriverIncentiveSettings;

  travelMatrixRows: TravelGradeMatrixRow[];

  travelSettingsRows: TravelSettingRow[];

  ptMaster: PTMasterRow[];
  
  activePTMaster: PTMasterRow[];

  // =======================================================
  // ACTIONS
  // =======================================================

  refresh: () => Promise<void>;

  updateTrip: (
    id: string,
    patch: Partial<BizTrip>
  ) => Promise<void>;

  setTripStatus: (
    id: string,
    status: BizTrip['status'],
    remarks?: string
  ) => Promise<void>;

  showToast: (
    type: Toast['type'],
    message: string
  ) => void;

  dismissToast: (
    id: string
  ) => void;

  deleteTrip: (
    id: string
  ) => Promise<void>;
}

// =========================================================
// CONTEXT
// =========================================================

const Ctx =
  createContext<AppCtx>(
    {} as AppCtx
  );

export const useApp = () =>
  useContext(Ctx);

// =========================================================
// PROVIDER
// =========================================================

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  // =======================================================
  // CORE DATA
  // =======================================================

  const [
    trips,
    setTrips,
  ] =
    useState<BizTrip[]>([]);

  const [
    disburseRows,
    setDisburseRows,
  ] =
    useState<DisburseRow[]>([]);

  const [
    settlementClaimRows,
    setSettlementClaimRows,
  ] =
    useState<
      SettlementClaimRow[]
    >([]);

  const [
    settlementReceipts,
    setSettlementReceipts,
  ] =
    useState<
      SettlementReceipt[]
    >([]);

  const [
    vehicles,
    setVehicles,
  ] =
    useState<Vehicle[]>([]);

  const [
    drivers,
    setDrivers,
  ] =
    useState<Driver[]>([]);

  const [
    tracking,
    setTracking,
  ] =
    useState<
      TripTracking[]
    >([]);

  // =======================================================
  // MATRIX DATA
  // =======================================================

  const [
    travelMatrix,
    setTravelMatrix,
  ] =
    useState<DynamicMatrixMap>(
      DEFAULT_MATRIX
    );

  const [
    travelDKMatrix,
    setTravelDKMatrix,
  ] =
    useState<DynamicDKMatrixMap>(
      DEFAULT_DK_MATRIX
    );

  const [
    driverIncentive,
    setDriverIncentive,
  ] =
    useState<DriverIncentiveSettings>(
      DEFAULT_DRIVER_INCENTIVE
    );

  const [
    travelMatrixRows,
    setTravelMatrixRows,
  ] =
    useState<
      TravelGradeMatrixRow[]
    >([]);

  const [
    travelSettingsRows,
    setTravelSettingsRows,
  ] =
    useState<
      TravelSettingRow[]
    >([]);

  const [
  ptMaster,
  setPtMaster,
] =
  useState<PTMasterRow[]>([]);

  const activePTMaster =
  ptMaster.filter(
    (pt) => pt.is_active
  );

  // =======================================================
  // UI STATE
  // =======================================================

  const [
    toasts,
    setToasts,
  ] =
    useState<Toast[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  // =======================================================
  // TOAST
  // =======================================================

  const showToast =
    useCallback(
      (
        type: Toast['type'],
        message: string
      ) => {
        const id =
          Date.now().toString(36) +
          Math.random()
            .toString(36)
            .slice(2);

        setToasts(
          (current) => [
            ...current,
            {
              id,
              type,
              message,
            },
          ]
        );

        setTimeout(
          () =>
            setToasts(
              (current) =>
                current.filter(
                  (toast) =>
                    toast.id !== id
                )
            ),
          4500
        );
      },
      []
    );

  const dismissToast =
    useCallback(
      (id: string) => {
        setToasts(
          (current) =>
            current.filter(
              (toast) =>
                toast.id !== id
            )
        );
      },
      []
    );

  // =======================================================
  // MATRIX BUILDER
  // =======================================================

  const buildTravelMatrix =
    useCallback(
      (
        rows:
          TravelGradeMatrixRow[]
      ) => {
        /*
         * Selalu mulai dari fallback.
         *
         * Jadi jika salah satu grade
         * belum tersedia di database,
         * calculation tetap aman.
         */
        const nextMatrix:
          DynamicMatrixMap = {
            Direksi: {
              ...DEFAULT_MATRIX.Direksi,
            },

            'Head/TL': {
              ...DEFAULT_MATRIX[
                'Head/TL'
              ],
            },

            Staff: {
              ...DEFAULT_MATRIX.Staff,
            },

            GM: {
              ...DEFAULT_MATRIX.GM,
            },

            TAD: {
              ...DEFAULT_MATRIX.TAD,
            },
          };

        const nextDK:
          DynamicDKMatrixMap = {
            Direksi: {
              ...DEFAULT_DK_MATRIX.Direksi,
            },

            'Head/TL': {
              ...DEFAULT_DK_MATRIX[
                'Head/TL'
              ],
            },

            Staff: {
              ...DEFAULT_DK_MATRIX.Staff,
            },

            GM: {
              ...DEFAULT_DK_MATRIX.GM,
            },

            TAD: {
              ...DEFAULT_DK_MATRIX.TAD,
            },
          };

        rows
          .filter(
            (row) =>
              row.is_active
          )
          .forEach(
            (row) => {
              const key =
                row.grade_key;

              if (
                !nextMatrix[key] ||
                !nextDK[key]
              ) {
                return;
              }

              nextMatrix[key] = {
                luarKota:
                  Number(
                    row.luar_kota
                  ) || 0,

                kp1:
                  Number(
                    row.kp1
                  ) || 0,

                kp2:
                  Number(
                    row.kp2
                  ) || 0,

                kpo:
                  Number(
                    row.kpo
                  ) || 0,

                hotel:
                  Number(
                    row.hotel
                  ) || 0,

                pettyCash:
                  Number(
                    row.petty_cash
                  ) || 0,
              };

              nextDK[key] = {
                '25':
                  Number(
                    row.dk_25
                  ) || 0,

                '50':
                  Number(
                    row.dk_50
                  ) || 0,

                '100':
                  Number(
                    row.dk_100
                  ) || 0,
              };
            }
          );

        setTravelMatrix(
          nextMatrix
        );

        setTravelDKMatrix(
          nextDK
        );
      },
      []
    );

  // =======================================================
  // DRIVER SETTINGS BUILDER
  // =======================================================

  const buildDriverSettings =
    useCallback(
      (
        rows:
          TravelSettingRow[]
      ) => {
        const next:
          DriverIncentiveSettings =
          {
            ...DEFAULT_DRIVER_INCENTIVE,
          };

        rows
          .filter(
            (row) =>
              row.is_active
          )
          .forEach(
            (row) => {
              if (
                row.setting_key ===
                'driver_gt200'
              ) {
                next.gt200 =
                  Number(
                    row.nominal
                  ) || 0;
              }

              if (
                row.setting_key ===
                'driver_gt400'
              ) {
                next.gt400 =
                  Number(
                    row.nominal
                  ) || 0;
              }
            }
          );

        setDriverIncentive(
          next
        );
      },
      []
    );

  // =======================================================
  // REFRESH
  // =======================================================

  const refresh =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const [
            tripResult,

            disburseResult,

            settlementClaimResult,

            settlementReceiptResult,

            vehicleResult,

            driverResult,

            trackingResult,

            matrixResult,

            settingResult,

            ptMasterResult,
          ] =
            await Promise.all([
              supabase
                .from(
                  'biz_trips'
                )
                .select('*')
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                ),

              supabase
                .from(
                  'disburse_rows'
                )
                .select('*')
                .order(
                  'sort_order',
                  {
                    ascending:
                      true,
                  }
                ),

              supabase
                .from(
                  'settlement_claim_rows'
                )
                .select('*')
                .order(
                  'sort_order',
                  {
                    ascending:
                      true,
                  }
                ),

              supabase
                .from(
                  'settlement_receipts'
                )
                .select('*')
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                ),

              supabase
                .from(
                  'vehicles'
                )
                .select('*')
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                ),

              supabase
                .from(
                  'drivers'
                )
                .select('*')
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                ),

              supabase
                .from(
                  'trip_tracking'
                )
                .select('*')
                .order(
                  'created_at',
                  {
                    ascending:
                      false,
                  }
                ),

              /*
               * MASTER MATRIX
               */
              supabase
                .from(
                  'travel_grade_matrix'
                )
                .select('*')
                .order(
                  'sort_order',
                  {
                    ascending:
                      true,
                  }
                ),

              /*
               * GLOBAL TRAVEL SETTINGS
               */
              supabase
                .from(
                  'travel_settings'
                )
                .select('*')
                .order(
                  'setting_name',
                  {
                    ascending:
                      true,
                  }
                ),
            ]);

          supabase
  .from(
    'travel_settings'
  )
  .select('*')
  .order(
    'setting_name',
    {
      ascending: true,
    }
  ),

supabase
  .from('pt_master')
  .select(
    'id, name, code, is_active'
  )
  .order('name', {
    ascending: true,
  }),
]);
          // ===============================================
          // CORE DATA
          // ===============================================

          if (
            tripResult.error
          ) {
            console.error(
              'biz_trips error',
              tripResult.error
            );
          }

          if (
            disburseResult.error
          ) {
            console.error(
              'disburse_rows error',
              disburseResult.error
            );
          }

          if (
            settlementClaimResult.error
          ) {
            console.error(
              'settlement_claim_rows error',
              settlementClaimResult.error
            );
          }

          if (
            settlementReceiptResult.error
          ) {
            console.error(
              'settlement_receipts error',
              settlementReceiptResult.error
            );
          }

          if (
            vehicleResult.error
          ) {
            console.error(
              'vehicles error',
              vehicleResult.error
            );
          }

          if (
            driverResult.error
          ) {
            console.error(
              'drivers error',
              driverResult.error
            );
          }

          if (
            trackingResult.error
          ) {
            console.error(
              'trip_tracking error',
              trackingResult.error
            );
          }

          setTrips(
            (
              tripResult.data ??
              []
            ) as BizTrip[]
          );

          setDisburseRows(
            (
              disburseResult.data ??
              []
            ) as DisburseRow[]
          );

          setSettlementClaimRows(
            (
              settlementClaimResult.data ??
              []
            ) as SettlementClaimRow[]
          );

          setSettlementReceipts(
            (
              settlementReceiptResult.data ??
              []
            ) as SettlementReceipt[]
          );

          setVehicles(
            (
              vehicleResult.data ??
              []
            ) as Vehicle[]
          );

          setDrivers(
            (
              driverResult.data ??
              []
            ) as Driver[]
          );

          setTracking(
            (
              trackingResult.data ??
              []
            ) as TripTracking[]
          );

          // ===============================================
          // MATRIX
          // ===============================================

          if (
            matrixResult.error
          ) {
            console.error(
              'travel_grade_matrix error',
              matrixResult.error
            );

            /*
             * Jangan kosongkan matrix.
             * Fallback tetap digunakan.
             */
            setTravelMatrix(
              DEFAULT_MATRIX
            );

            setTravelDKMatrix(
              DEFAULT_DK_MATRIX
            );
          } else {
            const rows =
              (
                matrixResult.data ??
                []
              ) as TravelGradeMatrixRow[];

            setTravelMatrixRows(
              rows
            );

            buildTravelMatrix(
              rows
            );
          }

          // ===============================================
          // DRIVER SETTINGS
          // ===============================================

          if (
            settingResult.error
          ) {
            console.error(
              'travel_settings error',
              settingResult.error
            );

            setDriverIncentive(
              DEFAULT_DRIVER_INCENTIVE
            );
          } else {
            const rows =
              (
                settingResult.data ??
                []
              ) as TravelSettingRow[];

            setTravelSettingsRows(
              rows
            );

            buildDriverSettings(
              rows
            );
          }

          // ===============================================
// MASTER PT
// ===============================================

if (ptMasterResult.error) {
  console.error(
    'pt_master error',
    ptMasterResult.error
  );
} else {
  setPtMaster(
    (
      ptMasterResult.data ??
      []
    ) as PTMasterRow[]
  );
}
          
        } catch (error) {
          console.error(
            'refresh error',
            error
          );
        } finally {
          setLoading(false);
        }
      },
      [
        buildTravelMatrix,
        buildDriverSettings,
      ]
    );

  // =======================================================
  // UPDATE TRIP
  // =======================================================

  const updateTrip =
    useCallback(
      async (
        id: string,
        patch:
          Partial<BizTrip>
      ) => {
        const {
          error,
        } =
          await supabase
            .from(
              'biz_trips'
            )
            .update(
              patch
            )
            .eq(
              'id',
              id
            );

        if (error) {
          throw error;
        }

        setTrips(
          (current) =>
            current.map(
              (trip) =>
                trip.id === id
                  ? {
                      ...trip,
                      ...patch,
                    }
                  : trip
            )
        );
      },
      []
    );

  // =======================================================
  // DELETE TRIP
  // =======================================================

  const deleteTrip =
    useCallback(
      async (
        id: string
      ) => {
        const {
          error,
        } =
          await supabase
            .from(
              'biz_trips'
            )
            .delete()
            .eq(
              'id',
              id
            );

        if (error) {
          throw error;
        }

        setTrips(
          (current) =>
            current.filter(
              (trip) =>
                trip.id !== id
            )
        );
      },
      []
    );

  // =======================================================
  // STATUS
  // =======================================================

  const setTripStatus =
    useCallback(
      async (
        id: string,
        status:
          BizTrip['status'],
        remarks?: string
      ) => {
        const trip =
          trips.find(
            (item) =>
              item.id === id
          );

        if (!trip) {
          return;
        }

        const patch:
          Partial<BizTrip> =
          {
            status,
          };

        if (
          status ===
          'Approved / Ready for Trip'
        ) {
          patch.approved_at =
            new Date()
              .toISOString();
        }

        if (
          status ===
          'Completed'
        ) {
          patch.completed_at =
            new Date()
              .toISOString();
        }

        await updateTrip(
          id,
          patch
        );

        await supabase
          .from(
            'trip_tracking'
          )
          .insert({
            trip_id:
              id,

            actor_name:
              trip.requester_name,

            action:
              `Status changed to ${status}`,

            from_status:
              trip.status,

            to_status:
              status,

            remarks:
              remarks ?? null,
          });
      },
      [
        trips,
        updateTrip,
      ]
    );

  // =======================================================
  // PROVIDER
  // =======================================================

  return (
    <Ctx.Provider
      value={{
        trips,

        disburseRows,

        settlementClaimRows,

        settlementReceipts,

        vehicles,

        drivers,

        tracking,

        toasts,

        loading,

        // Dynamic matrix
        travelMatrix,

        travelDKMatrix,

        driverIncentive,

        travelMatrixRows,

        travelSettingsRows,

        // Master Pt
        ptMaster,
        activePTMaster

        // Actions
        refresh,

        updateTrip,

        setTripStatus,

        deleteTrip,

        showToast,

        dismissToast,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
