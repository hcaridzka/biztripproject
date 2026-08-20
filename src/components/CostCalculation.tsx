import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Calculator, Check, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Button, Card, EmptyState, Field, Input, Select, Textarea, formatIDR } from './ui-shared';
import { computeCost, daysBetween, defaultKPScheme, generateSpdNumber, participantGradeKey } from '../lib/costCalc';
import { formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { BizTrip, KPScheme, TripCategory } from '../lib/types';

type CostSplitRow = { id: string; name: string; nominal: number; keterangan: string; pt_burden: string };
type OverrideMap = Record<string, number>;
type LegOverride = { enabled: boolean; days: number; rate: number; amount: number; flat?: boolean };
type LegOverrideMap = Record<string, LegOverride>;

const rank = (jabatan?: string) => {
  const map: Record<string, number> = { Direksi: 6, 'General Manager': 5, 'Head Department': 4, 'Team Leader': 3, Staff: 2, Driver: 1, TAD: 1 };
  return map[jabatan ?? ''] ?? 0;
};
const eligiblePettyScheme = (scheme: string) => scheme === 'LK' || scheme === 'KP2' || scheme === 'KPO';
function movementCount(flags: boolean[]) {
  let count = 0,
    inside = false;

  flags.forEach((eligible) => {
    if (eligible && !inside) {
      count++;
      inside = true;
    } else if (!eligible && inside) {
      count++;
      inside = false;
    }
  });

  if (inside) count++;

  return count;
}

export function CostCalculation({ onPrint, selectedTripId }: { onPrint: (id: string) => void; selectedTripId?: string | null }) {
  const { profile } = useAuth();
  const { trips, disburseRows, updateTrip, showToast, refresh, travelMatrix, travelDKMatrix, driverIncentive, activePTMaster } = useApp();
  const [selected,setSelected]=useState<BizTrip|null>(null); const [totalDays,setTotalDays]=useState(1); const [kpScheme,setKpScheme]=useState<KPScheme>('KP2'); const [hotelByHR,setHotelByHR]=useState(true); const [manualFuel,setManualFuel]=useState(0); const [manualEtoll,setManualEtoll]=useState(0); const [legOverrides,setLegOverrides]=useState<LegOverrideMap>({}); const [externalAllowanceOverride,setExternalAllowanceOverride]=useState<OverrideMap>({}); const [hotelOverride,setHotelOverride]=useState<OverrideMap>({}); const [pettyOverride,setPettyOverride]=useState<OverrideMap>({}); const [driverIncentiveOverride,setDriverIncentiveOverride]=useState<number|null>(null); const [spdNumber,setSpdNumber]=useState(''); const [hrNotes,setHrNotes]=useState(''); const [extraRows,setExtraRows]=useState<CostSplitRow[]>([]);
  const queue=useMemo(()=>trips.filter(t=>t.status==='Pending HR Advance Review'),[trips]);

  const startReview=(t:BizTrip)=>{setSelected(t);const scheme=t.kp_scheme??defaultKPScheme(t.itinerary??[]);setKpScheme(scheme);setTotalDays(t.total_days||daysBetween(t.departure_date,t.return_date));setManualFuel(Number(t.fuel_cost)||0);setManualEtoll(Number(t.etoll_cost)||0);const saved:any=t.cost_data??{};setHotelByHR(saved.hotelByHR??true);setLegOverrides(saved.legOverrides??{});const ext:OverrideMap={},hotel:OverrideMap={},petty:OverrideMap={};(Array.isArray(saved.perParticipant)?saved.perParticipant:[]).forEach((p:any)=>{if(!p?.name)return;if((p.legs??[]).length===0&&p.total!==undefined)ext[p.name]=Number(p.total)||0;if(p.hotel!==undefined)hotel[p.name]=Number(p.hotel)||0;if(p.pettyCash!==undefined)petty[p.name]=Number(p.pettyCash)||0});setExternalAllowanceOverride(ext);setHotelOverride(hotel);setPettyOverride(petty);setDriverIncentiveOverride(saved.driverDistanceIncentive!==undefined?Number(saved.driverDistanceIncentive)||0:null);setSpdNumber(t.spd_number??generateSpdNumber(scheme,queue.length+1,t.requester_name));setHrNotes(t.hr_notes??'');const existing=disburseRows.filter(d=>d.trip_id===t.id);setExtraRows(existing.map(d=>({id:d.id,name:d.name,nominal:Number(d.nominal)||0,keterangan:d.component_note,pt_burden:d.pt_burden})))};
  useEffect(()=>{if(!selectedTripId||selected?.id===selectedTripId)return;const trip=trips.find(t=>t.id===selectedTripId&&t.status==='Pending HR Advance Review');if(trip)startReview(trip)},[selectedTripId,trips,selected?.id]);

  const cost=useMemo(()=>{if(!selected)return null;const requestParticipants=[...(selected.participants??[])] as any[];const driverName=selected.obligo_driver_name?.trim();const hasDriver=driverName?requestParticipants.some(p=>String(p?.name??'').trim().toLowerCase()===driverName.toLowerCase()):false;const effectiveParticipants=driverName&&!hasDriver?[...requestParticipants,{id:`obligo-driver-${selected.id}`,name:driverName,jabatan:'Driver',grade:'TAD',category:'Internal',keterangan:'Driver assigned by PIC Obligo'}]:requestParticipants;const base=computeCost({participants:effectiveParticipants,days:totalDays,itinerary:selected.itinerary??[],origin:selected.origin,tripCategory:selected.trip_category as TripCategory,kpScheme,needsDriver:Boolean(driverName||selected.needs_driver),totalDistance:selected.total_distance??'none',fuelCost:manualFuel,etollCost:manualEtoll,hotelByHR,matrix:travelMatrix,dkMatrix:travelDKMatrix,driverIncentive});const participantRows=base.perParticipant.map(pp=>{const source=effectiveParticipants.find((p:any)=>p.name===pp.name)??pp;const isDriver=pp.jabatan==='Driver'||pp.name===driverName;const isExternal=source.category==='Eksternal';const legs=(pp.legs??[]).map(leg=>{const key=`${pp.name}::${leg.legIndex}`;const saved=legOverrides[key];const isGMFlat =
  pp.jabatan === 'General Manager' &&
  ['KP1', 'KP2', 'KPO'].includes(leg.scheme);

const defaultEnabled =
  isDriver
    ? leg.scheme !== 'KP1'
    : true;

const enabled =
  saved?.enabled ??
  defaultEnabled;

const days =
  saved?.days ??
  leg.days;

const rate =
  saved?.rate ??
  leg.rate;

const flat =
  saved?.flat ??
  isGMFlat;

const amount =
  saved?.amount ??
  (
    enabled
      ? flat
        ? rate
        : days * rate
      : 0
  );

return {
  ...leg,
  key,
  enabled,
  days,
  rate,
  amount,
  flat,
};
});
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           const allowance=isExternal?Number(externalAllowanceOverride[pp.name]??0)||0:legs.reduce((sum,leg)=>sum+(leg.enabled?Number(leg.amount)||0:0),0);const pettyTrips=movementCount(legs.map(leg=>leg.enabled&&eligiblePettyScheme(leg.scheme)));const matrixKey=participantGradeKey(source,travelMatrix);const pettyRate=Number(travelMatrix[matrixKey]?.pettyCash)||0;const defaultPetty=isExternal||effectiveParticipants.length<=1?0:pettyRate*pettyTrips;const pettyCash=Number(pettyOverride[pp.name]??defaultPetty)||0;const hotel=hotelByHR?0:Number(hotelOverride[pp.name]??pp.hotel)||0;return{...pp,grade:source.grade,total:allowance,hotel,pettyCash,legs,pettyTrips}});const perDiemTotal=participantRows.reduce((s,p)=>s+p.total,0),hotelTotal=participantRows.reduce((s,p)=>s+p.hotel,0),pettyCashTotal=participantRows.reduce((s,p)=>s+p.pettyCash,0);const internal=effectiveParticipants.filter((p:any)=>p.category!=='Eksternal');const pettyCashHolder=[...internal].sort((a:any,b:any)=>rank(b.jabatan)-rank(a.jabatan))[0]?.name??null;const driverDistanceIncentive=Number(driverIncentiveOverride??base.driverTotal)||0;const grandTotal=perDiemTotal+hotelTotal+pettyCashTotal+driverDistanceIncentive+manualFuel+manualEtoll;const extraTotal=extraRows.reduce((s,r)=>s+(Number(r.nominal)||0),0);return{...base,perParticipant:participantRows,perDiemTotal,hotelTotal,pettyCashTotal,pettyCashHolder,driverDistanceIncentive,grandTotal,extraTotal,effectiveParticipants}},[selected,totalDays,kpScheme,hotelByHR,manualFuel,manualEtoll,legOverrides,externalAllowanceOverride,hotelOverride,pettyOverride,driverIncentiveOverride,extraRows,travelMatrix,travelDKMatrix,driverIncentive]);

  const defaultPT=selected?.company_burden?.[0]||activePTMaster[0]?.name||'';const getPTOptions=(current?:string)=>{const active=activePTMaster.map(pt=>pt.name);return current&&!active.includes(current)?[current,...active]:active};
 const setLeg = (
  key: string,
  current: LegOverride,
  patch: Partial<LegOverride>
) => {
  const next = {
    ...current,
    ...patch,
  };

  if (
    'days' in patch ||
    'rate' in patch ||
    'enabled' in patch
  ) {
    next.amount =
      next.enabled
        ? next.flat
          ? next.rate
          : next.days * next.rate
        : 0;
  }

  setLegOverrides((old) => ({
    ...old,
    [key]: next,
  }));
};
  const generateCostSplitFromTableA=()=>{if(!selected||!cost)return;const rows:CostSplitRow[]=[];const push=(name:string,nominal:number,keterangan:string)=>{if(nominal>0)rows.push({id:crypto.randomUUID(),name,nominal,keterangan,pt_burden:defaultPT})};cost.perParticipant.forEach(pp=>{pp.legs.forEach((leg:any)=>push(pp.name,leg.enabled?leg.amount:0,`Tunjangan ${leg.scheme} · ${leg.days} hari`));push(pp.name,pp.hotel,'Akomodasi')});push(cost.pettyCashHolder||selected.requester_name,cost.pettyCashTotal,`Pettycash seluruh peserta · Holder: ${cost.pettyCashHolder||'-'}`);push(selected.obligo_driver_name||'Driver',cost.driverDistanceIncentive,'Insentif Jarak Driver');push(selected.requester_name,manualFuel,'BBM');push(selected.requester_name,manualEtoll,'E-Toll');setExtraRows(rows);showToast('info','Table B dibentuk dari Table A. HR tetap dapat split/override Cost Center.')};
  const addExtraRow=()=>setExtraRows(rows=>[...rows,{id:crypto.randomUUID(),name:selected?.requester_name??'',nominal:0,keterangan:'',pt_burden:defaultPT}]);const updateExtraRow=(id:string,patch:Partial<CostSplitRow>)=>setExtraRows(rows=>rows.map(r=>r.id===id?{...r,...patch}:r));const removeExtraRow=(id:string)=>setExtraRows(rows=>rows.filter(r=>r.id!==id));
  const persistCostSplit=async(tripId:string)=>{const del=await supabase.from('disburse_rows').delete().eq('trip_id',tripId);if(del.error)throw del.error;for(let i=0;i<extraRows.length;i++){const row=extraRows[i];const result=await supabase.from('disburse_rows').insert({id:row.id||crypto.randomUUID(),trip_id:tripId,name:row.name,nominal:Number(row.nominal)||0,component_note:row.keterangan,pt_burden:row.pt_burden,sort_order:i});if(result.error)throw result.error}};
  const buildCostData=()=>cost?{hotelByHR,scheme:kpScheme,legOverrides,perParticipant:cost.perParticipant,effectiveParticipants:cost.effectiveParticipants,assignedDriverName:selected?.obligo_driver_name??null,driverDistanceIncentive:cost.driverDistanceIncentive,pettyCashHolder:cost.pettyCashHolder,fuel:manualFuel,etoll:manualEtoll,direksiApprovals:selected?.cost_data?.direksiApprovals??{},totals:{allowance:cost.perDiemTotal,accommodation:cost.hotelTotal,driverCost:cost.driverDistanceIncentive,driverIncentive:cost.driverDistanceIncentive,pettyCash:cost.pettyCashTotal,fuel:manualFuel,etoll:manualEtoll,grandTotal:cost.grandTotal},nonAccountable:{allowance:cost.perDiemTotal,driverCost:cost.driverDistanceIncentive,driverIncentive:cost.driverDistanceIncentive,total:cost.perDiemTotal+cost.driverDistanceIncentive},accountable:{accommodation:cost.hotelTotal,pettyCash:cost.pettyCashTotal,fuel:manualFuel,etoll:manualEtoll,total:cost.hotelTotal+cost.pettyCashTotal+manualFuel+manualEtoll},extraRows}:null;
  const saveDraft=async()=>{if(!selected||!cost)return;try{await updateTrip(selected.id,{spd_number:spdNumber,hr_notes:hrNotes||null,kp_scheme:kpScheme,total_days:totalDays,cost_grand_total:cost.grandTotal,fuel_cost:manualFuel,etoll_cost:manualEtoll,cost_data:buildCostData()});await persistCostSplit(selected.id);showToast('success','Draft Cost & Advance berhasil disimpan');refresh()}catch(e:any){showToast('error','Gagal menyimpan draft: '+e.message)}};
  const approve=async()=>{if(!selected||!cost)return;if(!spdNumber.trim())return showToast('error','Nomor SPD wajib diisi');if(Math.abs(cost.extraTotal-cost.grandTotal)>0.01)return showToast('error',`Total Table B (${formatIDR(cost.extraTotal)}) harus sama dengan Grand Total (${formatIDR(cost.grandTotal)}).`);if(extraRows.some(r=>!r.pt_burden?.trim()))return showToast('error','Seluruh baris Table B wajib memiliki Cost Center.');const usedPT=Array.from(new Set(extraRows.filter(r=>Number(r.nominal)>0).map(r=>r.pt_burden).filter(Boolean)));const requestedPT=selected.company_burden??[];const newPT=usedPT.filter(pt=>!requestedPT.includes(pt));try{await persistCostSplit(selected.id);if(newPT.length){const expanded=Array.from(new Set([...requestedPT,...newPT]));await updateTrip(selected.id,{company_burden:expanded,cost_data:buildCostData(),cost_grand_total:cost.grandTotal,fuel_cost:manualFuel,etoll_cost:manualEtoll,status:'Pending Direksi Approval'});await supabase.from('trip_tracking').insert({trip_id:selected.id,actor_name:profile?.name??'',actor_role:'HR Manager',action:'Cost Review added Cost Center',from_status:'Pending HR Advance Review',to_status:'Pending Direksi Approval',remarks:`Cost Center baru: ${newPT.join(', ')}. Memerlukan approval Direksi terkait.`});showToast('info',`Cost Center ${newPT.join(', ')} ditambahkan. Trip dikembalikan ke Direksi.`);setSelected(null);refresh();return}const now=new Date().toISOString();await updateTrip(selected.id,{spd_number:spdNumber,hr_notes:hrNotes||null,kp_scheme:kpScheme,total_days:totalDays,cost_grand_total:cost.grandTotal,fuel_cost:manualFuel,etoll_cost:manualEtoll,cost_data:buildCostData(),status:'Approved / Ready for Trip',approved_at:now,spd_issued_at:now});const tracking=await supabase.from('trip_tracking').insert({trip_id:selected.id,actor_name:profile?.name??'',actor_role:'HR Manager',action:'HR Cost & Advance Approved',from_status:'Pending HR Advance Review',to_status:'Approved / Ready for Trip',remarks:hrNotes||'Cost & Advance Review completed'});if(tracking.error)throw tracking.error;showToast('success','Cost & Advance disetujui. Trip siap dijalankan.');setSelected(null);refresh()}catch(e:any){showToast('error','Gagal approve: '+e.message)}};

  return <div className="space-y-6 animate-slide-up max-w-6xl mx-auto"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><Calculator className="w-5 h-5"/></div><div><h2 className="text-xl font-bold">Cost & Advance Review</h2><p className="text-sm text-slate-500">HR Manager · Review & Override · {queue.length} pengajuan menunggu</p></div></div>
  {!selected&&<Card className="p-6">{queue.length===0?<EmptyState icon={<Calculator className="w-6 h-6"/>} title="Tidak ada pengajuan menunggu"/>:<div className="space-y-2">{queue.map(t=><div key={t.id} className="rounded-xl ring-1 ring-slate-100 p-4 flex justify-between gap-4"><div><div className="font-bold">{t.requester_name}</div><div className="text-sm">{t.purpose}</div><div className="text-xs text-slate-400">{formatDate(t.departure_date)} - {formatDate(t.return_date)} · Cost Center {(t.company_burden??[]).join(', ')}</div></div><Button size="sm" onClick={()=>startReview(t)}>Review & Calculate</Button></div>)}</div>}</Card>}
  {selected&&cost&&<><Card className="p-6 space-y-4"><div className="flex justify-between"><div><h3 className="font-bold">Ringkasan Permohonan</h3><p className="text-xs text-slate-500">Cross-check permohonan sebelum mengubah perhitungan.</p></div><button className="text-xs text-slate-400" onClick={()=>setSelected(null)}>Tutup</button></div><div className="grid md:grid-cols-4 gap-3"><Info label="Pemohon" value={`${selected.requester_name} · ${selected.requester_jabatan}`}/><Info label="PT Pemohon" value={selected.requester_pt||'-'}/><Info label="Cost Center" value={(selected.company_burden??[]).join(', ')||'-'}/><Info label="Periode" value={`${formatDate(selected.departure_date)} - ${formatDate(selected.return_date)}`}/></div><div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead><tr><TH>No</TH><TH>Tanggal</TH><TH>Tujuan</TH><TH>Skema</TH><TH>Agenda</TH></tr></thead><tbody>{(selected.itinerary??[]).map((leg,i)=><tr key={leg.id}><TD>{i+1}</TD><TD>{formatDate(leg.start_date)} - {formatDate(leg.end_date)}</TD><TD>{leg.destination}{leg.destination_custom?` · ${leg.destination_custom}`:''}</TD><TD>{leg.kpScheme||(leg.isWithinCity?`DK ${leg.dkTier??''}`:leg.isLuarkota?'LK':'-')}</TD><TD>{leg.agenda||'-'}</TD></tr>)}</tbody></table></div><div className="text-xs text-slate-500">
  Partisipan:{' '}
  {[
    ...(selected.participants ?? [])
      .filter((p) => p.id !== 'main-applicant')
      .map((p) => `${p.name} (${p.jabatan})`),
    ...(selected.obligo_driver_name
      ? [`${selected.obligo_driver_name} (Driver · PIC Obligo)`]
      : []),
  ].join(', ') || 'Tidak ada partisipan tambahan'}
</div></Card>
  <Card className="p-6 space-y-4"><h3 className="font-bold">A. Rincian Perhitungan & Override HR</h3>{cost.perParticipant.map((pp:any)=><div key={pp.name} className="rounded-xl border overflow-hidden"><div className="bg-slate-50 px-4 py-3 flex justify-between"><div><strong>{pp.name}</strong>

<span className="text-slate-400">
  {' · '}
  {pp.jabatan}
  {pp.jabatan === 'Driver'
    ? ' · Assigned by PIC Obligo'
    : ''}
</span></div><strong>{formatIDR(pp.total+pp.hotel+pp.pettyCash)}</strong></div>{pp.legs.length>0?<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><TH>Aktif</TH><TH>Skema</TH><TH>Tujuan</TH><TH>Hari</TH><TH>Rate</TH><TH>Nominal</TH></tr></thead><tbody>{pp.legs.map((leg:any)=><tr key={leg.key}><TD><input type="checkbox" checked={leg.enabled} onChange={e=>setLeg(leg.key,leg,{enabled:e.target.checked})}/></TD><TD>{leg.scheme}</TD><TD>{leg.destination}</TD><TD><Input type="number" min={0} value={leg.days} onChange={e=>setLeg(leg.key,leg,{days:Number(e.target.value)||0})}/></TD><TD><Input type="number" min={0} value={leg.rate} onChange={e=>setLeg(leg.key,leg,{rate:Number(e.target.value)||0})}/></TD><TD><Input type="number" min={0} value={leg.amount} onChange={e=>setLegOverrides(old=>({...old,[leg.key]:{enabled:leg.enabled,days:leg.days,rate:leg.rate,amount:Number(e.target.value)||0,flat:leg.flat}}))}/></TD></tr>)}</tbody></table></div>:<div className="p-4"><Field label="Tunjangan Manual"><Input type="number" min={0} value={pp.total} onChange={e=>setExternalAllowanceOverride(old=>({...old,[pp.name]:Number(e.target.value)||0}))}/></Field></div>}<div className="grid md:grid-cols-3 gap-3 p-4 border-t"><Field label="Akomodasi"><Input type="number" min={0} disabled={hotelByHR} value={pp.hotel} onChange={e=>setHotelOverride(old=>({...old,[pp.name]:Number(e.target.value)||0}))}/></Field><Field label={`Pettycash · ${pp.pettyTrips} movement`}><Input type="number" min={0} value={pp.pettyCash} onChange={e=>setPettyOverride(old=>({...old,[pp.name]:Number(e.target.value)||0}))}/></Field><div className="text-xs text-slate-500 self-end pb-2">Pettycash mengikuti ketentuan jabatan peserta dan tetap dapat dioverride HR.</div></div></div>)}<div className="grid md:grid-cols-4 gap-3"><Field label="Total Hari Administratif"><Input type="number" min={1} value={totalDays} onChange={e=>setTotalDays(Number(e.target.value)||1)}/></Field><Field label="BBM"><Input type="number" min={0} value={manualFuel} onChange={e=>setManualFuel(Number(e.target.value)||0)}/></Field><Field label="E-Toll"><Input type="number" min={0} value={manualEtoll} onChange={e=>setManualEtoll(Number(e.target.value)||0)}/></Field><Field label="Insentif Jarak Driver"><Input type="number" min={0} value={cost.driverDistanceIncentive} onChange={e=>setDriverIncentiveOverride(Number(e.target.value)||0)}/></Field></div><label className="flex gap-2 text-xs"><input type="checkbox" checked={hotelByHR} onChange={e=>setHotelByHR(e.target.checked)}/> Akomodasi dipesankan HR</label><div className="rounded-xl bg-brand-50 p-4 grid md:grid-cols-3 gap-3"><Info label="Tunjangan" value={formatIDR(cost.perDiemTotal)}/><Info label={`Pettycash · Holder ${cost.pettyCashHolder||'-'}`} value={formatIDR(cost.pettyCashTotal)}/><Info label="Grand Total" value={formatIDR(cost.grandTotal)}/></div></Card>
  <Card className="p-6 space-y-4"><div className="flex justify-between flex-wrap gap-3"><div><h3 className="font-bold">B. Rangkuman Pembiayaan & Cost Center</h3><p className="text-xs text-slate-500">Default mengikuti Cost Center request; HR dapat split/override.</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={generateCostSplitFromTableA}>Auto-Fill Table A</Button><Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5"/>} onClick={addExtraRow}>Add Row</Button></div></div>{extraRows.length===0?<EmptyState title="Cost center belum diisi"/>:<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><TH>Nama</TH><TH>Komponen</TH><TH>Nominal</TH><TH>Cost Center</TH><TH></TH></tr></thead><tbody>{extraRows.map(row=><tr key={row.id}><TD><Input value={row.name} onChange={e=>updateExtraRow(row.id,{name:e.target.value})}/></TD><TD><Input value={row.keterangan} onChange={e=>updateExtraRow(row.id,{keterangan:e.target.value})}/></TD><TD><Input type="number" min={0} value={row.nominal} onChange={e=>updateExtraRow(row.id,{nominal:Number(e.target.value)||0})}/></TD><TD><Select value={row.pt_burden} onChange={e=>updateExtraRow(row.id,{pt_burden:e.target.value})}>{getPTOptions(row.pt_burden).map(pt=><option key={pt}>{pt}</option>)}</Select></TD><TD><button onClick={()=>removeExtraRow(row.id)}><Trash2 className="w-4 h-4 text-rose-500"/></button></TD></tr>)}</tbody></table></div>}<div className="grid md:grid-cols-3 gap-3"><Info label="Total Table B" value={formatIDR(cost.extraTotal)}/><Info label="Grand Total" value={formatIDR(cost.grandTotal)}/><Info label="Selisih" value={formatIDR(cost.extraTotal-cost.grandTotal)}/></div></Card>
  <Card className="p-6 space-y-4"><div className="grid md:grid-cols-2 gap-4"><Field label="Nomor SPD" required><Input value={spdNumber} onChange={e=>setSpdNumber(e.target.value)}/></Field><Field label="HR Notes"><Textarea rows={3} value={hrNotes} onChange={e=>setHrNotes(e.target.value)}/></Field></div><div className="flex justify-end gap-2"><Button size="sm" variant="secondary" icon={<FileText className="w-3.5 h-3.5"/>} onClick={()=>onPrint(selected.id)}>Surat Perjalanan Dinas</Button><Button size="sm" variant="secondary" icon={<Save className="w-3.5 h-3.5"/>} onClick={saveDraft}>Save Draft</Button><Button size="sm" icon={<Check className="w-3.5 h-3.5"/>} onClick={approve}>Approve Advance</Button></div></Card></>}</div>;
}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 border p-3"><div className="text-[10px] uppercase text-slate-400 font-bold">{label}</div><div className="text-xs font-semibold mt-1">{value}</div></div>};function TH({children}:{children:ReactNode}){return <th className="border border-slate-200 px-2 py-2 text-left font-semibold text-slate-600">{children}</th>};function TD({children}:{children:ReactNode}){return <td className="border border-slate-200 px-2 py-2 align-top">{children}</td>};
