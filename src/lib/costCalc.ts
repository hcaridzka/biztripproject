import type {
  Participant,
  ItineraryLeg,
  Jabatan,
  KPScheme,
  DKTier,
  TripCategory,
  TotalDistanceOption,
} from './types';

import {
  JABATAN_RANK,
  DK_DISTANCE_TIERS,
} from './constants';

import {
  uid,
  daysBetween,
  formatIDR,
} from './utils';

// =========================================================
// MATRIX TYPES
// =========================================================

export interface GradeMatrix {
  luarKota: number;
  kp1: number;
  kp2: number;
  kpo: number;
  hotel: number;
  pettyCash: number;
}

export type GradeKey =
  | 'Direksi'
  | 'Head/TL'
  | 'Staff'
  | 'GM'
  | 'TAD';

export type DynamicMatrixMap = Record<
  GradeKey,
  GradeMatrix
>;

export type DynamicDKMatrixMap = Record<
  GradeKey,
  Record<DKTier, number>
>;

export interface DriverIncentiveSettings {
  gt200: number;
  gt400: number;
}

// =========================================================
// FALLBACK MATRIX
// Dipakai hanya jika matrix database belum tersedia.
// =========================================================

export const DEFAULT_MATRIX: DynamicMatrixMap = {
  Direksi: {
    luarKota: 200000,
    kp1: 100000,
    kp2: 125000,
    kpo: 50000,
    hotel: 500000,
    pettyCash: 100000,
  },

  'Head/TL': {
    luarKota: 150000,
    kp1: 50000,
    kp2: 90000,
    kpo: 30000,
    hotel: 350000,
    pettyCash: 50000,
  },

  Staff: {
    luarKota: 100000,
    kp1: 30000,
    kp2: 60000,
    kpo: 30000,
    hotel: 250000,
    pettyCash: 50000,
  },

  GM: {
    luarKota: 100000,
    kp1: 100000,
    kp2: 100000,
    kpo: 100000,
    hotel: 350000,
    pettyCash: 50000,
  },

  TAD: {
    luarKota: 100000,
    kp1: 100000,
    kp2: 100000,
    kpo: 100000,
    hotel: 250000,
    pettyCash: 35000,
  },
};

export const DEFAULT_DK_MATRIX: DynamicDKMatrixMap = {
  Direksi: {
    '25': 50000,
    '50': 75000,
    '100': 100000,
  },

  'Head/TL': {
    '25': 30000,
    '50': 50000,
    '100': 75000,
  },

  Staff: {
    '25': 15000,
    '50': 25000,
    '100': 50000,
  },

  GM: {
    '25': 50000,
    '50': 75000,
    '100': 100000,
  },

  TAD: {
    '25': 100000,
    '50': 100000,
    '100': 100000,
  },
};

export const DEFAULT_DRIVER_INCENTIVE: DriverIncentiveSettings = {
  gt200: 50000,
  gt400: 100000,
};

// =========================================================
// GRADE MAPPING
// =========================================================

export function gradeKey(jabatan: Jabatan): GradeKey {
  if (jabatan === 'Direksi') {
    return 'Direksi';
  }

  if (jabatan === 'General Manager') {
    return 'GM';
  }

  if (
    jabatan === 'Head Department' ||
    jabatan === 'Team Leader'
  ) {
    return 'Head/TL';
  }

  if (
    jabatan === 'TAD' ||
    jabatan === 'Driver'
  ) {
    return 'TAD';
  }

  return 'Staff';
}

export function getGradeMatrix(
  jabatan: Jabatan,
  matrix: DynamicMatrixMap = DEFAULT_MATRIX
): GradeMatrix {
  const key = gradeKey(jabatan);

  return (
    matrix[key] ??
    DEFAULT_MATRIX[key]
  );
}

// =========================================================
// LEG / ITINERARY SCHEME
// =========================================================

function legScheme(
  leg: ItineraryLeg,
  origin: string
): 'DK' | 'KP1' | 'KP2' | 'KPO' | 'LK' {
  if (leg.isWithinCity) {
    return 'DK';
  }

  if (
    leg.destination.includes('SITE') ||
    leg.destination_custom?.includes('SITE')
  ) {
    return 'KP2';
  }

  if (leg.destination.includes('Branch Office')) {
    return 'KP1';
  }

  if (
    leg.destination === 'Luar Kota' ||
    leg.isLuarkota
  ) {
    return 'LK';
  }

  if (leg.kpScheme === 'KPO') {
    return 'KPO';
  }

  if (leg.kpScheme === 'KP1') {
    return 'KP1';
  }

  if (leg.kpScheme === 'KP2') {
    return 'KP2';
  }

  return 'LK';
}

// =========================================================
// RATE PER LEG
// =========================================================

function legRate(
  participant: Participant,
  leg: ItineraryLeg,
  origin: string,
  matrix: DynamicMatrixMap = DEFAULT_MATRIX,
  dkMatrix: DynamicDKMatrixMap = DEFAULT_DK_MATRIX
): {
  rate: number;
  scheme: string;
} {
  const key = gradeKey(participant.jabatan);
  const scheme = legScheme(leg, origin);

  const grade =
    matrix[key] ??
    DEFAULT_MATRIX[key];

  /*
   * GENERAL MANAGER
   *
   * GM diberikan flat per trip.
   * Nominal menggunakan matrix GM,
   * bukan hardcoded.
   *
   * Final total GM akan dikunci kembali
   * pada perDiemForParticipant().
   */
  if (key === 'GM') {
    return {
      rate: grade.luarKota,
      scheme: 'GM Flat',
    };
  }

  /*
   * TAD / DRIVER
   *
   * Tunjangan harian mengikuti matrix TAD.
   * Insentif jarak dihitung terpisah.
   */
  if (key === 'TAD') {
    return {
      rate: grade.luarKota,
      scheme: 'TAD Harian',
    };
  }

  /*
   * DALAM KOTA
   */
  if (scheme === 'DK') {
    let tier: DKTier =
      leg.dkTier ?? '25';

    /*
     * Selain Head Office BSD,
     * minimum DK adalah 50 KM.
     */
    if (
      origin !== 'Head Office BSD' &&
      tier === '25'
    ) {
      tier = '50';
    }

    const currentDK =
      dkMatrix[key] ??
      DEFAULT_DK_MATRIX[key];

    return {
      rate: currentDK[tier],
      scheme: `DK ${tier}KM`,
    };
  }

  if (scheme === 'KP1') {
    return {
      rate: grade.kp1,
      scheme: 'KP1',
    };
  }

  if (scheme === 'KP2') {
    return {
      rate: grade.kp2,
      scheme: 'KP2',
    };
  }

  if (scheme === 'KPO') {
    return {
      rate: grade.kpo,
      scheme: 'KPO',
    };
  }

  return {
    rate: grade.luarKota,
    scheme: 'LK',
  };
}

// =========================================================
// LEG BREAKDOWN
// =========================================================

export interface LegBreakdown {
  legIndex: number;
  destination: string;
  days: number;
  scheme: string;
  rate: number;
  amount: number;
}

// =========================================================
// PER PARTICIPANT
// =========================================================

function perDiemForParticipant(
  participant: Participant,
  itinerary: ItineraryLeg[],
  origin: string,
  matrix: DynamicMatrixMap = DEFAULT_MATRIX,
  dkMatrix: DynamicDKMatrixMap = DEFAULT_DK_MATRIX
): {
  perDay: number;
  total: number;
  hotel: number;
  driver: number;
  breakdown: string;
  legs: LegBreakdown[];
} {
  const key = gradeKey(participant.jabatan);

  const grade =
    matrix[key] ??
    DEFAULT_MATRIX[key];

  const legs: LegBreakdown[] = [];

  let total = 0;

  /*
   * Hari yang eligible akomodasi.
   *
   * Akomodasi:
   * LK / KP1 / KP2 / KPO
   *
   * DK tidak mendapatkan akomodasi.
   */
  let hotelDays = 0;

  for (
    let index = 0;
    index < itinerary.length;
    index++
  ) {
    const leg = itinerary[index];

    const legDays = daysBetween(
      leg.start_date,
      leg.end_date
    );

    const {
      rate,
      scheme,
    } = legRate(
      participant,
      leg,
      origin,
      matrix,
      dkMatrix
    );

    /*
     * GM flat per trip.
     *
     * Supaya breakdown itinerary tetap terbaca,
     * amount leg GM tidak dijumlahkan sebagai
     * tunjangan per hari.
     */
    const amount =
      key === 'GM'
        ? 0
        : rate * legDays;

    total += amount;

    if (
      scheme !== 'DK' &&
      legDays > 0
    ) {
      hotelDays += legDays;
    }

    legs.push({
      legIndex: index,
      destination:
        leg.destination +
        (
          leg.destination_custom
            ? ` (${leg.destination_custom})`
            : ''
        ),
      days: legDays,
      scheme,
      rate,
      amount,
    });
  }

  /*
   * GM = flat per trip.
   *
   * Nilai flat mengambil field luarKota
   * dari matrix GM.
   */
  if (key === 'GM') {
    total = grade.luarKota;
  }

  const tripDays = itinerary.reduce(
    (sum, leg) =>
      sum +
      daysBetween(
        leg.start_date,
        leg.end_date
      ),
    0
  );

  const hotel =
    grade.hotel * hotelDays;

  const perDay =
    total /
    Math.max(1, tripDays);

  const breakdown =
    key === 'GM'
      ? `GM Flat ${formatIDR(total)} / trip`
      : legs
          .map(
            (leg) =>
              `${leg.scheme} ${formatIDR(
                leg.rate
              )}×${leg.days}d`
          )
          .join(' + ');

  return {
    perDay: Math.round(perDay),
    total,
    hotel,
    driver: 0,
    breakdown,
    legs,
  };
}

// =========================================================
// PETTY CASH
// =========================================================

export function computePettyCash(
  participants: Participant[],
  itinerary: ItineraryLeg[],
  matrix: DynamicMatrixMap = DEFAULT_MATRIX
): {
  total: number;
  holder: string | null;
  perPerson: number;
  trips: number;
  perPersonBreakdown: {
    name: string;
    jabatan: Jabatan;
    amount: number;
  }[];
} {
  const internalParticipants =
  participants.filter(
    (participant) =>
      (participant.category ?? 'Internal') !==
        'Eksternal' &&
      participant.jabatan !==
        'Driver'
  );

  /*
   * Pettycash berlaku untuk:
   * LK / KP2 / KPO
   *
   * Mengikuti logic existing.
   */
  const pettyCashEligible =
    itinerary.some((leg) => {
      const scheme =
        legScheme(leg, '');

      return (
        scheme === 'LK' ||
        scheme === 'KP2' ||
        scheme === 'KPO'
      );
    });

  if (
    !pettyCashEligible ||
    internalParticipants.length <= 1
  ) {
    return {
      total: 0,
      holder: null,
      perPerson: 0,
      trips: 0,
      perPersonBreakdown: [],
    };
  }

  /*
   * Jumlah perjalanan pettycash:
   * destination legs + kembali ke origin.
   */
  const trips =
    itinerary.length + 1;

  /*
   * Holder = jabatan tertinggi.
   */
  const holder =
    [...internalParticipants].sort(
      (a, b) =>
        JABATAN_RANK[b.jabatan] -
        JABATAN_RANK[a.jabatan]
    )[0];

  const holderMatrix =
    getGradeMatrix(
      holder.jabatan,
      matrix
    );

  const perPersonBreakdown =
    internalParticipants.map(
      (participant) => {
        const grade =
          getGradeMatrix(
            participant.jabatan,
            matrix
          );

        return {
          name:
            participant.name ||
            '(Belum diisi)',
          jabatan:
            participant.jabatan,
          amount:
            grade.pettyCash *
            trips,
        };
      }
    );

  const total =
    perPersonBreakdown.reduce(
      (sum, participant) =>
        sum + participant.amount,
      0
    );

  return {
    total,
    holder: holder.name,
    perPerson:
      holderMatrix.pettyCash,
    trips,
    perPersonBreakdown,
  };
}

// =========================================================
// COST BREAKDOWN TYPES
// =========================================================

export interface PerParticipant {
  name: string;
  jabatan: Jabatan;

  perDay: number;
  days: number;

  total: number;
  hotel: number;
  driver: number;
  pettyCash: number;

  breakdown: string;
  legs: LegBreakdown[];
}

export interface CostBreakdown {
  perParticipant: PerParticipant[];

  perDiemTotal: number;
  hotelTotal: number;
  driverTotal: number;

  pettyCashTotal: number;
  pettyCashHolder: string | null;
  pettyCashTrips: number;

  pettyCashPerPersonBreakdown: {
    name: string;
    jabatan: Jabatan;
    amount: number;
  }[];

  fuelCost: number;
  etollCost: number;

  grandTotal: number;
}

// =========================================================
// COMPUTE COST
// =========================================================

export function computeCost(params: {
  participants: Participant[];
  days: number;

  itinerary: ItineraryLeg[];
  origin: string;

  tripCategory: TripCategory;
  kpScheme: KPScheme;

  needsDriver: boolean;

  totalDistance?: TotalDistanceOption;

  fuelCost?: number;
  etollCost?: number;

  hotelByHR?: boolean;

  matrix?: DynamicMatrixMap;
  dkMatrix?: DynamicDKMatrixMap;

  driverIncentive?: DriverIncentiveSettings;
}): CostBreakdown {
  const {
    participants,
    itinerary,
    origin,

    needsDriver,

    totalDistance = 'none',

    fuelCost = 0,
    etollCost = 0,

    hotelByHR = true,

    matrix = DEFAULT_MATRIX,
    dkMatrix = DEFAULT_DK_MATRIX,

    driverIncentive =
      DEFAULT_DRIVER_INCENTIVE,
  } = params;

  // =======================================================
  // TRIP DAYS
  // =======================================================

  const tripDays =
    itinerary.reduce(
      (sum, leg) =>
        sum +
        daysBetween(
          leg.start_date,
          leg.end_date
        ),
      0
    );

  // =======================================================
  // DRIVER
  //
  // Driver adalah driver internal yang diassign PIC Obligo.
  // Driver BUKAN participant perjalanan.
  //
  // Driver Cost =
  // Tunjangan Harian Driver
  // + Insentif Jarak flat per trip
  // =======================================================

  const driverGrade =
    matrix.TAD ??
    DEFAULT_MATRIX.TAD;

  const driverDailyAllowance =
    needsDriver
      ? driverGrade.luarKota *
        tripDays
      : 0;

  let driverDistanceIncentive = 0;

  if (
    needsDriver &&
    totalDistance === 'gt200'
  ) {
    driverDistanceIncentive =
      driverIncentive.gt200;
  }

  if (
    needsDriver &&
    totalDistance === 'gt400'
  ) {
    driverDistanceIncentive =
      driverIncentive.gt400;
  }

  const driverTotal =
    driverDailyAllowance +
    driverDistanceIncentive;

  // =======================================================
  // PETTY CASH
  // =======================================================

  const petty =
    computePettyCash(
      participants,
      itinerary,
      matrix
    );

  /*
   * Participant hanya pegawai yang memang
   * melakukan perjalanan sebagai participant.
   *
   * Driver PIC Obligo tidak diproses di sini.
   */
  const internalParticipants =
    participants.filter(
      (participant) =>
        (participant.category ?? 'Internal') !==
        'Eksternal' &&
        participant.jabatan !==
        'Driver'
    );

  // =======================================================
  // PARTICIPANTS
  // =======================================================

  const perParticipant:
    PerParticipant[] =
    internalParticipants.map(
      (participant) => {
        const participantCost =
          perDiemForParticipant(
            participant,
            itinerary,
            origin,
            matrix,
            dkMatrix
          );

        /*
         * Jika hotel diatur HR,
         * accommodation advance = 0.
         */
        const hotel =
          hotelByHR
            ? 0
            : participantCost.hotel;

        const pettyAmount =
          petty.perPersonBreakdown.find(
            (item) =>
              item.name ===
              (
                participant.name ||
                '(Belum diisi)'
              )
          )?.amount ?? 0;

        return {
          name:
            participant.name ||
            '(Belum diisi)',

          jabatan:
            participant.jabatan,

          perDay:
            participantCost.perDay,

          days:
            tripDays,

          total:
            participantCost.total,

          hotel,

          /*
           * Driver incentive tidak pernah
           * ditempel ke participant.
           */
          driver: 0,

          pettyCash:
            pettyAmount,

          breakdown:
            participantCost.breakdown,

          legs:
            participantCost.legs,
        };
      }
    );

  // =======================================================
  // TOTAL PARTICIPANTS
  // =======================================================

  const perDiemTotal =
    perParticipant.reduce(
      (sum, participant) =>
        sum + participant.total,
      0
    );

  const hotelTotal =
    perParticipant.reduce(
      (sum, participant) =>
        sum + participant.hotel,
      0
    );

  const pettyCashTotal =
    perParticipant.reduce(
      (sum, participant) =>
        sum +
        participant.pettyCash,
      0
    );

  // =======================================================
  // GRAND TOTAL
  // =======================================================

  const grandTotal =
    perDiemTotal +
    hotelTotal +
    driverTotal +
    pettyCashTotal +
    fuelCost +
    etollCost;

  return {
    perParticipant,

    perDiemTotal,
    hotelTotal,

    /*
     * Driver Total =
     * allowance harian + incentive jarak.
     */
    driverTotal,

    pettyCashTotal,

    pettyCashHolder:
      petty.holder,

    pettyCashTrips:
      petty.trips,

    pettyCashPerPersonBreakdown:
      petty.perPersonBreakdown,

    fuelCost,
    etollCost,

    grandTotal,
  };
}

// ===== KP SCHEME AUTO-DETECTION =====
// PERTAHANKAN SEMUA CODE EXISTING MULAI BAGIAN INI KE BAWAH
// ===== KP SCHEME AUTO-DETECTION =====

export function autoKPSchemeForLeg(destination: string, current: KPScheme): KPScheme {
  if (!destination) return current;
  if (destination.includes('SITE')) return 'KP2';
  if (destination.includes('Branch Office')) return 'KP1';
  if (destination === 'Luar Kota') return 'KPO';
  return current;
}

export function defaultKPScheme(itinerary: ItineraryLeg[]): KPScheme {
  for (const l of itinerary) {
    if (l.destination.includes('SITE') || l.destination_custom?.includes('SITE')) return 'KP2';
    if (l.destination.includes('Branch Office')) return 'KP1';
  }
  return 'KPO';
}

export function dkTiersForOrigin(origin: string): { key: DKTier; label: string }[] {
  if (origin === 'Head Office BSD') return DK_DISTANCE_TIERS;
  return DK_DISTANCE_TIERS.filter((t) => t.key !== '25');
}

export function generateSpdNumber(kpScheme: KPScheme, seq: number, name: string): string {
  const scheme = kpScheme === 'KPO' ? 'LK' : kpScheme;
  return `${scheme}-${String(seq).padStart(3, '0')}/${name.split(' ')[0]}`;
}

export { daysBetween, uid, formatIDR };
