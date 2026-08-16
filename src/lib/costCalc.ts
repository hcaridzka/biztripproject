import type { Participant, ItineraryLeg, Jabatan, KPScheme, DKTier, TripCategory, TotalDistanceOption } from './types';
import { JABATAN_RANK, DK_DISTANCE_TIERS } from './constants';
import { uid, daysBetween, formatIDR } from './utils';

// ===== DYNAMIC MATRIX TYPES & DEFAULTS =====

export interface GradeMatrix {
  luarKota: number;
  kp1: number;
  kp2: number;
  kpo: number;
  hotel: number;
  pettyCash: number;
}

export type GradeKey = 'Direksi' | 'Head/TL' | 'Staff' | 'GM' | 'TAD';

export type DynamicMatrixMap = Record<GradeKey, GradeMatrix>;
export type DynamicDKMatrixMap = Record<GradeKey, Record<DKTier, number>>;

export function gradeKey(j: Jabatan): GradeKey {
  if (j === 'Direksi') return 'Direksi';
  if (j === 'General Manager') return 'GM';
  if (j === 'Head Department' || j === 'Team Leader') return 'Head/TL';
if (j === 'TAD' || j === 'Driver') return 'TAD'; // Driver disamakan dengan grade TAD
  return 'Staff';
}

// Fallback Default Matrix
export const DEFAULT_MATRIX: DynamicMatrixMap = {
  'Direksi':  { luarKota: 200000, kp1: 100000, kp2: 125000, kpo: 50000, hotel: 500000, pettyCash: 100000 },
  'Head/TL':  { luarKota: 150000, kp1: 50000,  kp2: 90000,  kpo: 30000, hotel: 350000, pettyCash: 50000 },
  'Staff':    { luarKota: 100000, kp1: 30000,  kp2: 60000,  kpo: 30000, hotel: 250000, pettyCash: 50000 },
  'GM':       { luarKota: 100000, kp1: 100000, kp2: 100000, kpo: 100000, hotel: 350000, pettyCash: 50000 },
  'TAD':      { luarKota: 100000, kp1: 100000, kp2: 100000, kpo: 100000, hotel: 0,      pettyCash: 35000 },
};

export const DEFAULT_DK_MATRIX: DynamicDKMatrixMap = {
  'Direksi': { '25': 50000,  '50': 75000,  '100': 100000 },
  'Head/TL': { '25': 30000,  '50': 50000,  '100': 75000 },
  'Staff':   { '25': 15000,  '50': 25000,  '100': 50000 },
  'GM':      { '25': 50000,  '50': 75000,  '100': 100000 },
  'TAD':     { '25': 100000, '50': 100000, '100': 100000 },
};

export function getGradeMatrix(j: Jabatan, matrix: DynamicMatrixMap = DEFAULT_MATRIX): GradeMatrix {
  return matrix[gradeKey(j)] ?? DEFAULT_MATRIX[gradeKey(j)];
}

// Determine the scheme for a single leg
function legScheme(leg: ItineraryLeg, origin: string): 'DK' | 'KP1' | 'KP2' | 'KPO' | 'LK' {
  if (leg.isWithinCity) return 'DK';
  if (leg.destination.includes('SITE') || leg.destination_custom?.includes('SITE')) return 'KP2';
  if (leg.destination.includes('Branch Office')) return 'KP1';
  if (leg.destination === 'Luar Kota' || leg.isLuarkota) return 'LK';
  if (leg.kpScheme === 'KPO') return 'KPO';
  if (leg.kpScheme === 'KP1') return 'KP1';
  if (leg.kpScheme === 'KP2') return 'KP2';
  return 'LK';
}

// Per-leg rate for a participant
function legRate(
  p: Participant, 
  leg: ItineraryLeg, 
  origin: string,
  matrix: DynamicMatrixMap = DEFAULT_MATRIX,
  dkMatrix: DynamicDKMatrixMap = DEFAULT_DK_MATRIX
): { rate: number; scheme: string } {
  const gk = gradeKey(p.jabatan);
  const scheme = legScheme(leg, origin);

  // TAD & GM: flat 100k per trip regardless of leg
  if (gk === 'TAD' || gk === 'GM') return { rate: 100000, scheme: gk === 'TAD' ? 'TAD Flat' : 'GM Flat' };

  if (scheme === 'DK') {
    let tier = leg.dkTier ?? '25';
    if (origin !== 'Head Office BSD' && tier === '25') tier = '50';
    const currentDK = dkMatrix[gk] ?? DEFAULT_DK_MATRIX[gk];
    return { rate: currentDK[tier], scheme: `DK ${tier}KM` };
  }
  const m = matrix[gk] ?? DEFAULT_MATRIX[gk];
  if (scheme === 'KP1') return { rate: m.kp1, scheme: 'KP1' };
  if (scheme === 'KP2') return { rate: m.kp2, scheme: 'KP2' };
  if (scheme === 'KPO') return { rate: m.kpo, scheme: 'KPO' };
  return { rate: m.luarKota, scheme: 'LK' };
}

export interface LegBreakdown {
  legIndex: number;
  destination: string;
  days: number;
  scheme: string;
  rate: number;
  amount: number;
}

// ===== PER-LEG CALCULATION =====

function perDiemForParticipant(
  p: Participant, 
  itinerary: ItineraryLeg[], 
  origin: string,
  matrix: DynamicMatrixMap = DEFAULT_MATRIX,
  dkMatrix: DynamicDKMatrixMap = DEFAULT_DK_MATRIX
): { perDay: number; total: number; hotel: number; driver: number; breakdown: string; legs: LegBreakdown[] } {
  const gk = gradeKey(p.jabatan);
  const m = matrix[gk] ?? DEFAULT_MATRIX[gk];
  const legs: LegBreakdown[] = [];
  let total = 0;
  let isLuarKota = false;

  for (let i = 0; i < itinerary.length; i++) {
    const leg = itinerary[i];
    const legDays = daysBetween(leg.start_date, leg.end_date);
    const { rate, scheme } = legRate(p, leg, origin, matrix, dkMatrix);
    const amount = rate * legDays;
    total += amount;
    if (scheme !== 'DK') isLuarKota = true;
    legs.push({ legIndex: i, destination: leg.destination + (leg.destination_custom ? ` (${leg.destination_custom})` : ''), days: legDays, scheme, rate, amount });
  }

  // GM/TAD: flat 100k total (not per-leg sum)
  if (gk === 'GM' || gk === 'TAD') {
    total = 100000;
  }

  // Hotel only for Luar Kota trips
  const tripDays = itinerary.reduce((s, l) => s + daysBetween(l.start_date, l.end_date), 0);
  const hotel = isLuarKota ? m.hotel * tripDays : 0;
  const perDay = total / Math.max(1, tripDays);
  const breakdown = legs.map((l) => `${l.scheme} ${formatIDR(l.rate)}×${l.days}d`).join(' + ');

  return { perDay: Math.round(perDay), total, hotel, driver: 0, breakdown, legs };
}

// ===== PETTY CASH (return-to-origin logic) =====

export function computePettyCash(
  participants: Participant[], 
  itinerary: ItineraryLeg[],
  matrix: DynamicMatrixMap = DEFAULT_MATRIX
): { total: number; holder: string | null; perPerson: number; trips: number; perPersonBreakdown: { name: string; jabatan: Jabatan; amount: number }[] } {
  const internalParticipants = participants.filter((p) => (p.category ?? 'Internal') !== 'Eksternal');
  const hasLuarKota = itinerary.some((l) => legScheme(l, '') !== 'DK');
  const hasKP2orKPO = itinerary.some((l) => l.kpScheme === 'KP2' || l.kpScheme === 'KPO' || l.destination.includes('SITE'));

  // Petty cash active: Luar Kota/KP2/KPO AND > 1 internal person
  if ((!hasLuarKota && !hasKP2orKPO) || internalParticipants.length <= 1) {
    return { total: 0, holder: null, perPerson: 0, trips: 0, perPersonBreakdown: [] };
  }

  // Trips = total destinations + 1 (return to origin)
  const trips = itinerary.length + 1;

  const holder = [...internalParticipants].sort((a, b) => JABATAN_RANK[b.jabatan] - JABATAN_RANK[a.jabatan])[0];
  const holderMatrix = getGradeMatrix(holder.jabatan, matrix);

  const perPersonBreakdown = internalParticipants.map((p) => {
    const m = getGradeMatrix(p.jabatan, matrix);
    return { name: p.name || '(Belum diisi)', jabatan: p.jabatan, amount: m.pettyCash * trips };
  });

  const total = perPersonBreakdown.reduce((s, p) => s + p.amount, 0);
  return { total, holder: holder.name, perPerson: holderMatrix.pettyCash, trips, perPersonBreakdown };
}

// ===== COST BREAKDOWN =====

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
  pettyCashPerPersonBreakdown: { name: string; jabatan: Jabatan; amount: number }[];
  fuelCost: number;
  etollCost: number;
  grandTotal: number;
}

export function computeCost(params: {
  participants: Participant[];
  days: number;
  itinerary: ItineraryLeg[];
  origin: string;
  tripCategory: TripCategory;
  kpScheme: KPScheme;
  needsDriver: boolean;
  totalDistance?: TotalDistanceOption; // Opsi Jarak Total (>200km / >400km)
  fuelCost?: number;
  etollCost?: number;
  hotelByHR?: boolean;
  matrix?: DynamicMatrixMap;
  dkMatrix?: DynamicDKMatrixMap;
}): CostBreakdown {
  const { 
    participants, itinerary, origin, 
    needsDriver, totalDistance = 'none',
    fuelCost = 0, etollCost = 0, hotelByHR = true,
    matrix = DEFAULT_MATRIX, dkMatrix = DEFAULT_DK_MATRIX 
  } = params;

  // Hitung insentif tambahan jarak untuk Driver (flat per trip)
  let driverIncentive = 0;
  if (totalDistance === 'gt200') {
    driverIncentive = 50000;
  } else if (totalDistance === 'gt400') {
    driverIncentive = 100000;
  }

  const petty = computePettyCash(participants, itinerary, matrix);

  const internalParticipants = participants.filter((p) => (p.category ?? 'Internal') !== 'Eksternal');
  const perParticipant: PerParticipant[] = internalParticipants.map((p) => {
    const pp = perDiemForParticipant(p, itinerary, origin, matrix, dkMatrix);
    const hotel = hotelByHR ? 0 : pp.hotel;
    const pettyAmount = petty.perPersonBreakdown.find((pb) => pb.name === (p.name || '(Belum diisi)'))?.amount ?? 0;
    
    // Tambahkan insentif jika peserta ber-Jabatan Driver
    const isDriver = p.jabatan === 'Driver';
    const driverBonus = isDriver ? driverIncentive : 0;
    const breakdownText = isDriver && driverBonus > 0 
      ? `${pp.breakdown} + Insentif Jarak (${formatIDR(driverBonus)})` 
      : pp.breakdown;

    return {
      name: p.name || '(Belum diisi)',
      jabatan: p.jabatan,
      perDay: pp.perDay,
      days: itinerary.reduce((s, l) => s + daysBetween(l.start_date, l.end_date), 0),
      total: pp.total,
      hotel,
      driver: pp.driver + driverBonus,
      pettyCash: pettyAmount,
      breakdown: breakdownText,
      legs: pp.legs,
    };
  });

  const perDiemTotal = perParticipant.reduce((s, p) => s + p.total, 0);
  const hotelTotal = perParticipant.reduce((s, p) => s + p.hotel, 0);
  
  // Total Driver = akumulasi dari peserta Driver + insentif driver luar jika butuh driver tapi tak ada di daftar peserta
  const driverInParticipants = participants.some((p) => p.jabatan === 'Driver');
  const externalDriverIncentive = (needsDriver && !driverInParticipants) ? driverIncentive : 0;
  const driverTotal = perParticipant.reduce((s, p) => s + p.driver, 0) + externalDriverIncentive;
  
  const pettyCashTotal = petty.total;
  const grandTotal = perDiemTotal + hotelTotal + driverTotal + pettyCashTotal + fuelCost + etollCost;

  return {
    perParticipant, perDiemTotal, hotelTotal, driverTotal,
    pettyCashTotal, pettyCashHolder: petty.holder, pettyCashTrips: petty.trips,
    pettyCashPerPersonBreakdown: petty.perPersonBreakdown,
    fuelCost, etollCost, grandTotal,
  };
}

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
