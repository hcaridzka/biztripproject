import type { Participant, ItineraryLeg, Jabatan, KPScheme, DKTier, TripCategory, TotalDistanceOption } from './types';
import { JABATAN_RANK, DK_DISTANCE_TIERS } from './constants';
import { uid, daysBetween, formatIDR } from './utils';

export interface GradeMatrix { luarKota:number; kp1:number; kp2:number; kpo:number; hotel:number; pettyCash:number; }
export type GradeKey = string;
export type DynamicMatrixMap = Record<string, GradeMatrix>;
export type DynamicDKMatrixMap = Record<string, Record<DKTier, number>>;
export interface DriverIncentiveSettings { gt200:number; gt400:number; }

export const DEFAULT_MATRIX: DynamicMatrixMap = {
  Direksi:{luarKota:200000,kp1:100000,kp2:125000,kpo:50000,hotel:500000,pettyCash:100000},
  'Head/TL':{luarKota:150000,kp1:50000,kp2:90000,kpo:30000,hotel:350000,pettyCash:50000},
  Staff:{luarKota:100000,kp1:30000,kp2:60000,kpo:30000,hotel:250000,pettyCash:50000},
  GM:{luarKota:100000,kp1:100000,kp2:100000,kpo:100000,hotel:350000,pettyCash:50000},
  TAD:{luarKota:100000,kp1:100000,kp2:100000,kpo:100000,hotel:250000,pettyCash:35000},
};
export const DEFAULT_DK_MATRIX: DynamicDKMatrixMap = {
  Direksi:{'25':50000,'50':75000,'100':100000}, 'Head/TL':{'25':30000,'50':50000,'100':75000}, Staff:{'25':15000,'50':25000,'100':50000}, GM:{'25':30000,'50':50000,'100':75000}, TAD:{'25':100000,'50':100000,'100':100000},
};
export const DEFAULT_DRIVER_INCENTIVE: DriverIncentiveSettings={gt200:50000,gt400:100000};

export function gradeKey(jabatan:Jabatan):string {
  if(jabatan==='Direksi') return 'Direksi';
  if(jabatan==='General Manager') return 'GM';
  if(jabatan==='Head Department'||jabatan==='Team Leader') return 'Head/TL';
  if(jabatan==='TAD'||jabatan==='Driver') return 'TAD';
  return 'Staff';
}

export function participantGradeKey(participant:Participant, matrix:DynamicMatrixMap=DEFAULT_MATRIX):string {
  const explicit=participant.grade?.trim();
  if(explicit && matrix[explicit]) return explicit;
  const legacy=gradeKey(participant.jabatan);
  if(matrix[legacy]) return legacy;
  return Object.keys(matrix)[0] || legacy;
}

export function getGradeMatrix(participantOrJabatan:Participant|Jabatan,matrix:DynamicMatrixMap=DEFAULT_MATRIX):GradeMatrix {
  if(typeof participantOrJabatan==='string') { const key=gradeKey(participantOrJabatan); return matrix[key] ?? DEFAULT_MATRIX[key] ?? DEFAULT_MATRIX.Staff; }
  const key=participantGradeKey(participantOrJabatan,matrix); return matrix[key] ?? DEFAULT_MATRIX[gradeKey(participantOrJabatan.jabatan)] ?? DEFAULT_MATRIX.Staff;
}

function legScheme(leg:ItineraryLeg,origin:string):'DK'|'KP1'|'KP2'|'KPO'|'LK' {
  if(leg.isWithinCity)return'DK';
  if(leg.destination.includes('SITE')||leg.destination_custom?.includes('SITE'))return'KP2';
  if(leg.destination.includes('Branch Office'))return'KP1';
  if(leg.destination==='Luar Kota'||leg.isLuarkota)return'LK';
  if(leg.kpScheme==='KPO')return'KPO'; if(leg.kpScheme==='KP1')return'KP1'; if(leg.kpScheme==='KP2')return'KP2'; return'LK';
}

function destinationLabel(leg:ItineraryLeg):string { return leg.destination_custom?.trim() ? `${leg.destination} (${leg.destination_custom.trim()})` : leg.destination; }
function destinationKey(leg:ItineraryLeg):string { return `${legScheme(leg,'')}|${destinationLabel(leg).toLowerCase().replace(/\s+/g,' ').trim()}`; }

interface AggregatedLeg { key:string; destination:string; days:number; scheme:'DK'|'KP1'|'KP2'|'KPO'|'LK'; sourceLeg:ItineraryLeg; firstIndex:number; }
function aggregateItinerary(itinerary:ItineraryLeg[],origin:string):AggregatedLeg[] {
  const groups=new Map<string,AggregatedLeg>();
  itinerary.forEach((leg,index)=>{const scheme=legScheme(leg,origin);const key=`${scheme}|${destinationLabel(leg).toLowerCase().replace(/\s+/g,' ').trim()}`;const legDays=daysBetween(leg.start_date,leg.end_date);const existing=groups.get(key);if(existing){existing.days+=legDays;}else{groups.set(key,{key,destination:destinationLabel(leg),days:legDays,scheme,sourceLeg:leg,firstIndex:index});}});
  return [...groups.values()].sort((a,b)=>a.firstIndex-b.firstIndex);
}

function legRate(participant:Participant,leg:ItineraryLeg,origin:string,matrix:DynamicMatrixMap=DEFAULT_MATRIX,dkMatrix:DynamicDKMatrixMap=DEFAULT_DK_MATRIX):{rate:number;scheme:string} {
  const key=participantGradeKey(participant,matrix); const scheme=legScheme(leg,origin); const grade=matrix[key]??getGradeMatrix(participant,matrix);
  if(scheme==='DK'){let tier:DKTier=leg.dkTier??'25';if(origin!=='Head Office BSD'&&tier==='25')tier='50';const dkKey=participant.jabatan==='General Manager'?'Head/TL':key;const currentDK=dkMatrix[dkKey]??DEFAULT_DK_MATRIX[participant.jabatan==='General Manager'?'Head/TL':gradeKey(participant.jabatan)]??DEFAULT_DK_MATRIX.Staff;return{rate:currentDK[tier]??0,scheme:`DK ${tier}KM`};}
  if(participant.jabatan==='General Manager'){
    if(scheme==='KP1'||scheme==='KP2'||scheme==='KPO') return {rate:100000,scheme};
    const headMatrix=matrix['Head/TL']??DEFAULT_MATRIX['Head/TL']; return {rate:headMatrix.luarKota,scheme:'LK'};
  }
  if(scheme==='KP1')return{rate:grade.kp1,scheme:'KP1'}; if(scheme==='KP2')return{rate:grade.kp2,scheme:'KP2'}; if(scheme==='KPO')return{rate:grade.kpo,scheme:'KPO'}; return{rate:grade.luarKota,scheme:'LK'};
}

export interface LegBreakdown { legIndex:number; destination:string; days:number; scheme:string; rate:number; amount:number; }
function perDiemForParticipant(participant:Participant,itinerary:ItineraryLeg[],origin:string,matrix:DynamicMatrixMap=DEFAULT_MATRIX,dkMatrix:DynamicDKMatrixMap=DEFAULT_DK_MATRIX){
  const grade=getGradeMatrix(participant,matrix); const legs:LegBreakdown[]=[]; let total=0; let hotelDays=0; const aggregated=aggregateItinerary(itinerary,origin);
  aggregated.forEach(group=>{const{rate,scheme}=legRate(participant,group.sourceLeg,origin,matrix,dkMatrix);const isGMFlat=participant.jabatan==='General Manager'&&(group.scheme==='KP1'||group.scheme==='KP2'||group.scheme==='KPO');const amount=isGMFlat?rate:rate*group.days;total+=amount;if(group.scheme!=='DK'&&group.days>0)hotelDays+=group.days;legs.push({legIndex:group.firstIndex,destination:group.destination,days:group.days,scheme,rate,amount});});
  const tripDays=aggregated.reduce((s,l)=>s+l.days,0);const hotel=grade.hotel*hotelDays;const perDay=total/Math.max(1,tripDays);const breakdown=legs.map(l=>`${l.scheme} ${formatIDR(l.rate)}${participant.jabatan==='General Manager'&&['KP1','KP2','KPO'].includes(l.scheme)?' flat':`×${l.days}d`}`).join(' + ');
  return{perDay:Math.round(perDay),total,hotel,driver:0,breakdown,legs};
}

export function computePettyCash(
  participants: Participant[],
  itinerary: ItineraryLeg[],
  matrix: DynamicMatrixMap = DEFAULT_MATRIX
) {
  const tripHeadcount = participants.length;

  const eligibleRecipients = participants.filter(
    (p) => (p.category ?? 'Internal') !== 'Eksternal'
  );

  /**
   * Pettycash hanya berlaku apabila ada perjalanan ke:
   * - LK
   * - KP2
   * - KPO
   *
   * KP1 tidak menjadi dasar pettycash.
   */
  const eligibleDestinations = new Map<string, ItineraryLeg>();

  itinerary.forEach((leg) => {
    const scheme = legScheme(leg, '');

    if (!['LK', 'KP2', 'KPO'].includes(scheme)) return;

    /**
     * Destination yang sama dalam satu trip hanya dihitung sekali.
     *
     * Contoh:
     * KP1 Pekanbaru
     * KP2 Kuansing
     * KP1 Pekanbaru
     *
     * Yang eligible hanya KP2 Kuansing.
     */
    const key = destinationKey(leg);

    if (!eligibleDestinations.has(key)) {
      eligibleDestinations.set(key, leg);
    }
  });

  if (
    eligibleDestinations.size === 0 ||
    tripHeadcount <= 1 ||
    eligibleRecipients.length === 0
  ) {
    return {
      total: 0,
      holder: null,
      perPerson: 0,
      trips: 0,
      perPersonBreakdown: [] as {
        name: string;
        jabatan: Jabatan;
        amount: number;
      }[],
    };
  }

  /**
   * Setiap eligible destination = 2 movement:
   * 1. menuju lokasi
   * 2. kembali dari lokasi
   *
   * Jadi:
   * KP1 → KP2 → KP1
   * = KP2 hanya 1 eligible destination
   * = 2 movement.
   */
  const trips = eligibleDestinations.size * 2;

  const holder = [...eligibleRecipients].sort(
    (a, b) => JABATAN_RANK[b.jabatan] - JABATAN_RANK[a.jabatan]
  )[0];

  const holderMatrix = getGradeMatrix(holder, matrix);

  const perPersonBreakdown = eligibleRecipients.map((p) => ({
    name: p.name || '(Belum diisi)',
    jabatan: p.jabatan,
    amount: getGradeMatrix(p, matrix).pettyCash * trips,
  }));

  return {
    total: perPersonBreakdown.reduce((sum, p) => sum + p.amount, 0),
    holder: holder.name,
    perPerson: holderMatrix.pettyCash,
    trips,
    perPersonBreakdown,
  };
}

export interface PerParticipant { name:string; grade?:string; jabatan:Jabatan; perDay:number; days:number; total:number; hotel:number; driver:number; pettyCash:number; breakdown:string; legs:LegBreakdown[]; }
export interface CostBreakdown { perParticipant:PerParticipant[]; perDiemTotal:number; hotelTotal:number; driverTotal:number; pettyCashTotal:number; pettyCashHolder:string|null; pettyCashTrips:number; pettyCashPerPersonBreakdown:{name:string;jabatan:Jabatan;amount:number}[]; fuelCost:number; etollCost:number; grandTotal:number; }

export function computeCost(params:{participants:Participant[];days:number;itinerary:ItineraryLeg[];origin:string;tripCategory:TripCategory;kpScheme:KPScheme;needsDriver:boolean;totalDistance?:TotalDistanceOption;fuelCost?:number;etollCost?:number;hotelByHR?:boolean;matrix?:DynamicMatrixMap;dkMatrix?:DynamicDKMatrixMap;driverIncentive?:DriverIncentiveSettings;}):CostBreakdown {
  const{participants,itinerary,origin,totalDistance='none',fuelCost=0,etollCost=0,hotelByHR=true,matrix=DEFAULT_MATRIX,dkMatrix=DEFAULT_DK_MATRIX,driverIncentive=DEFAULT_DRIVER_INCENTIVE}=params;const tripDays=aggregateItinerary(itinerary,origin).reduce((s,l)=>s+l.days,0);
  const hasDriverParticipant=participants.some(p=>p.jabatan==='Driver'&&(p.category??'Internal')!=='Eksternal');let driverDistanceIncentive=0;if(hasDriverParticipant&&totalDistance==='gt200')driverDistanceIncentive=driverIncentive.gt200;if(hasDriverParticipant&&totalDistance==='gt400')driverDistanceIncentive=driverIncentive.gt400;const driverTotal=driverDistanceIncentive;const petty=computePettyCash(participants,itinerary,matrix);
  const perParticipant:PerParticipant[]=participants.map(participant=>{if(participant.category==='Eksternal')return{name:participant.name||'(Belum diisi)',grade:participant.grade,jabatan:participant.jabatan,perDay:0,days:tripDays,total:0,hotel:0,driver:0,pettyCash:0,breakdown:'Eksternal — Manual HR',legs:[]};const c=perDiemForParticipant(participant,itinerary,origin,matrix,dkMatrix);const hotel=hotelByHR?0:c.hotel;const pettyAmount=petty.perPersonBreakdown.find(i=>i.name===(participant.name||'(Belum diisi)'))?.amount??0;return{name:participant.name||'(Belum diisi)',grade:participant.grade,jabatan:participant.jabatan,perDay:c.perDay,days:tripDays,total:c.total,hotel,driver:0,pettyCash:pettyAmount,breakdown:c.breakdown,legs:c.legs};});
  const perDiemTotal=perParticipant.reduce((s,p)=>s+p.total,0),hotelTotal=perParticipant.reduce((s,p)=>s+p.hotel,0),pettyCashTotal=perParticipant.reduce((s,p)=>s+p.pettyCash,0);const grandTotal=perDiemTotal+hotelTotal+driverTotal+pettyCashTotal+fuelCost+etollCost;return{perParticipant,perDiemTotal,hotelTotal,driverTotal,pettyCashTotal,pettyCashHolder:petty.holder,pettyCashTrips:petty.trips,pettyCashPerPersonBreakdown:petty.perPersonBreakdown,fuelCost,etollCost,grandTotal};
}

export function autoKPSchemeForLeg(destination:string,current:KPScheme):KPScheme{if(!destination)return current;if(destination.includes('SITE'))return'KP2';if(destination.includes('Branch Office'))return'KP1';if(destination==='Luar Kota')return'KPO';return current;}
export function defaultKPScheme(itinerary:ItineraryLeg[]):KPScheme{for(const l of itinerary){if(l.destination.includes('SITE')||l.destination_custom?.includes('SITE'))return'KP2';if(l.destination.includes('Branch Office'))return'KP1';}return'KPO';}
export function dkTiersForOrigin(origin:string):{key:DKTier;label:string}[]{if(origin==='Head Office BSD')return DK_DISTANCE_TIERS;return DK_DISTANCE_TIERS.filter(t=>t.key!=='25');}
export function generateSpdNumber(kpScheme:KPScheme,seq:number,name:string):string{const scheme=kpScheme==='KPO'?'LK':kpScheme;return`${scheme}-${String(seq).padStart(3,'0')}/${name.split(' ')[0]}`;}
export{daysBetween,uid,formatIDR};
