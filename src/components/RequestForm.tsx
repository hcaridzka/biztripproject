import { useMemo, useState } from 'react';
import { AlertCircle, Calendar, Calculator, Clock, FilePlus, MapPin, Paperclip, Plus, Send, Trash2, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Button, Card, EmptyState, Field, Input, Select, Textarea, formatIDR } from './ui-shared';
import { ORIGINS, DESTINATION_OPTIONS, TRANSPORT_CHOICES } from '../lib/constants';
import { autoKPSchemeForLeg, computeCost, computePettyCash, daysBetween, defaultKPScheme, dkTiersForOrigin, uid } from '../lib/costCalc';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { DKTier, ItineraryLeg, Jabatan, Participant, ParticipantCategory, TotalDistanceOption, TransportChoice, TripCategory } from '../lib/types';

export function RequestForm({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const { showToast, refresh, activePTMaster, travelMatrixRows, travelMatrix, travelDKMatrix, driverIncentive } = useApp();
  const ptOptions = useMemo(() => Array.from(new Set([...activePTMaster.map((pt) => pt.name).filter(Boolean), ...[profile?.pt_unit].filter((pt): pt is string => Boolean(pt))])), [activePTMaster, profile?.pt_unit]);
  const activeGrades = useMemo(() => travelMatrixRows.filter((row) => row.is_active && row.grade_key && row.grade_name && !/driver|tad/i.test(`${row.grade_key} ${row.grade_name}`)), [travelMatrixRows]);
  const fallbackGrade = useMemo(() => {
    if (profile?.grade && activeGrades.some((row) => row.grade_key === profile.grade || row.grade_name === profile.grade)) return activeGrades.find((row) => row.grade_key === profile.grade || row.grade_name === profile.grade)?.grade_key ?? '';
    if (profile?.jabatan === 'Direksi') return activeGrades.find((row) => /direksi/i.test(`${row.grade_key} ${row.grade_name}`))?.grade_key ?? activeGrades[0]?.grade_key ?? '';
    if (profile?.jabatan === 'General Manager') return activeGrades.find((row) => /general manager|\bgm\b/i.test(`${row.grade_key} ${row.grade_name}`))?.grade_key ?? activeGrades[0]?.grade_key ?? '';
    if (profile?.jabatan === 'Head Department' || profile?.jabatan === 'Team Leader') return activeGrades.find((row) => /head|team leader|\btl\b/i.test(`${row.grade_key} ${row.grade_name}`))?.grade_key ?? activeGrades[0]?.grade_key ?? '';
    return activeGrades.find((row) => /staff/i.test(`${row.grade_key} ${row.grade_name}`))?.grade_key ?? activeGrades[0]?.grade_key ?? '';
  }, [activeGrades, profile?.grade, profile?.jabatan]);

  const [nip, setNip] = useState(profile?.nip ?? '');
  const jabatan: Jabatan = profile?.jabatan ?? 'Staff';
  const [grade, setGrade] = useState(fallbackGrade);
  const [applicantPt, setApplicantPt] = useState(profile?.pt_unit ?? '');
  const [origin, setOrigin] = useState('Head Office BSD');
  const [originCustom, setOriginCustom] = useState('');
  const [purpose, setPurpose] = useState('');
  const [needsVehicle, setNeedsVehicle] = useState<TransportChoice>('Kendaraan Dinas');
  const [needsDriver, setNeedsDriver] = useState(true);
  const [totalDistance, setTotalDistance] = useState<TotalDistanceOption>('none');
  const [companyBurdens, setCompanyBurdens] = useState<string[]>([]);
  const [tripCategory] = useState<TripCategory>(null);
  const [itinerary, setItinerary] = useState<ItineraryLeg[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [employeeRemarks, setEmployeeRemarks] = useState('');
  const [pettyCash, setPettyCash] = useState(false);
  const [pettyFile, setPettyFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { depDate, retDate, depTime, retTime, days } = useMemo(() => {
    if (!itinerary.length) return { depDate: '', retDate: '', depTime: '08:00', retTime: '17:00', days: 0 };
    const first = [...itinerary].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const last = [...itinerary].sort((a, b) => a.end_date.localeCompare(b.end_date)).at(-1)!;
    return { depDate: first.start_date, retDate: last.end_date, depTime: first.start_time || '08:00', retTime: last.end_time || '17:00', days: daysBetween(first.start_date, last.end_date) };
  }, [itinerary]);
  const kpScheme = useMemo(() => defaultKPScheme(itinerary), [itinerary]);
  const mainApplicant = useMemo<Participant>(() => ({ id: 'main-applicant', name: profile?.name ?? '', jabatan, grade, category: 'Internal', pt_unit: applicantPt }), [profile?.name, jabatan, grade, applicantPt]);
  const allParticipants = useMemo(() => [mainApplicant, ...participants.filter((p) => p.id !== 'main-applicant')], [mainApplicant, participants]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!nip.trim()) errors.push('NIP wajib diisi');
    if (!applicantPt) errors.push('PT Perusahaan Pemohon wajib dipilih');
    if (!grade) errors.push('Matrix benefit pemohon wajib dipilih');
    if (!purpose.trim()) errors.push('Tujuan perjalanan wajib diisi');
    if (origin === 'Others' && !originCustom.trim()) errors.push('Nama lokasi asal wajib diisi');
    if (!companyBurdens.length) errors.push('Minimal 1 PT Beban Biaya wajib dipilih');
    if (!itinerary.length) errors.push('Minimal 1 baris Itinerary wajib diisi');
    itinerary.forEach((leg, i) => {
      if (!leg.start_date || !leg.start_time || !leg.end_date || !leg.end_time) errors.push(`Itinerary baris ${i + 1}: tanggal dan jam wajib lengkap`);
      if (!leg.destination) errors.push(`Itinerary baris ${i + 1}: lokasi tujuan wajib dipilih`);
      if ((leg.destination === 'Others' || leg.destination === 'Dalam Kota' || leg.destination === 'Luar Kota') && !leg.destination_custom?.trim()) errors.push(`Itinerary baris ${i + 1}: nama kota/lokasi wajib diisi`);
      if (leg.isWithinCity && !leg.dkTier) errors.push(`Itinerary baris ${i + 1}: tier jarak DK wajib dipilih`);
      if (!leg.agenda.trim()) errors.push(`Itinerary baris ${i + 1}: agenda wajib diisi`);
      if (leg.start_date && leg.end_date && new Date(`${leg.end_date}T${leg.end_time || '00:00'}`) < new Date(`${leg.start_date}T${leg.start_time || '00:00'}`)) errors.push(`Itinerary baris ${i + 1}: waktu selesai tidak boleh sebelum mulai`);
    });
    participants.forEach((p, i) => {
      if (!p.name.trim()) errors.push(`Partisipan tambahan baris ${i + 1}: Nama wajib diisi`);
      if (p.category !== 'Eksternal' && !p.grade) errors.push(`Partisipan tambahan baris ${i + 1}: Matrix benefit wajib dipilih`);
      if (p.category === 'Eksternal' && !p.keterangan?.trim()) errors.push(`Partisipan tambahan baris ${i + 1}: Keterangan eksternal wajib diisi`);
    });
    if (pettyCash && !pettyFile) errors.push('Petty Cash khusus dicentang — bukti persetujuan wajib diunggah');
    return errors;
  }, [nip, applicantPt, grade, purpose, origin, originCustom, companyBurdens, itinerary, participants, pettyCash, pettyFile]);

  const preview = useMemo(() => !itinerary.length || !depDate || !retDate ? null : computeCost({ participants: allParticipants, days, itinerary, origin, tripCategory, kpScheme, needsDriver, totalDistance, matrix: travelMatrix, dkMatrix: travelDKMatrix, driverIncentive }), [allParticipants, days, itinerary, origin, tripCategory, kpScheme, needsDriver, totalDistance, depDate, retDate, travelMatrix, travelDKMatrix, driverIncentive]);
  const pettyPreview = useMemo(() => computePettyCash(allParticipants, itinerary, travelMatrix), [allParticipants, itinerary, travelMatrix]);
  const canSubmit = validation.length === 0 && !busy;
  const addItinerary = () => { const last = itinerary.at(-1); const date = last?.end_date || new Date().toISOString().slice(0, 10); setItinerary((rows) => [...rows, { id: uid(), start_date: date, start_time: last?.end_time || '08:00', end_date: date, end_time: '17:00', destination: '', destination_custom: '', kpScheme: 'KP2', isWithinCity: false, isLuarkota: false, agenda: '' }]); };
  const updateItinerary = (id: string, patch: Partial<ItineraryLeg>) => setItinerary((rows) => rows.map((row) => { if (row.id !== id) return row; const next = { ...row, ...patch }; next.kpScheme = autoKPSchemeForLeg(next.destination, next.kpScheme); return next; }));
  const removeItinerary = (id: string) => setItinerary((rows) => rows.filter((row) => row.id !== id));
  const addParticipant = () => setParticipants((rows) => [...rows, { id: uid(), name: '', jabatan: 'Staff', grade: activeGrades[0]?.grade_key ?? '', category: 'Internal', pt_unit: '' }]);
  const updateParticipant = (id: string, patch: Partial<Participant>) => setParticipants((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  const toggleBurden = (pt: string) => setCompanyBurdens((rows) => rows.includes(pt) ? rows.filter((x) => x !== pt) : [...rows, pt]);
  const uploadPettyFile = async (file: File) => { const ext = file.name.split('.').pop(); const path = `approvals/petty_${profile?.id ?? 'user'}_${Date.now()}.${ext}`; const upload = await supabase.storage.from('pettycash').upload(path, file); if (upload.error) throw upload.error; return supabase.storage.from('pettycash').getPublicUrl(path).data.publicUrl; };

  const handleSubmit = async () => {
    if (!canSubmit) return showToast('error', `Form belum lengkap: ${validation.length} catatan perlu diperbaiki`);
    setBusy(true);
    try {
      const pettyFileUrl = pettyCash && pettyFile ? await uploadPettyFile(pettyFile) : null;
      const cost = computeCost({ participants: allParticipants, days, itinerary, origin, tripCategory, kpScheme, needsDriver, totalDistance, matrix: travelMatrix, dkMatrix: travelDKMatrix, driverIncentive });
      const initialStatus = 'Pending Manager Approval';
      const { data: inserted, error } = await supabase.from('biz_trips').insert({ user_id: profile?.id, requester_name: profile?.name, requester_nip: nip, requester_jabatan: jabatan, requester_pt: applicantPt, origin, origin_custom: origin === 'Others' ? originCustom : null, departure_date: depDate, departure_time: depTime, return_date: retDate, return_time: retTime, total_days: days, purpose, needs_vehicle: needsVehicle === 'Kendaraan Dinas', vehicle_type_choice: needsVehicle, needs_driver: needsDriver, total_distance: totalDistance, company_burden: companyBurdens, trip_category: tripCategory, itinerary, participants: allParticipants, petty_cash_requested: pettyCash, petty_cash_holder: pettyPreview.holder, petty_cash_approval_file: pettyFileUrl, kp_scheme: kpScheme, cost_grand_total: cost.grandTotal, fuel_cost: 0, etoll_cost: 0, employee_remarks: employeeRemarks || null, status: initialStatus }).select().maybeSingle();
      if (error) throw error;
      if (inserted) await supabase.from('trip_tracking').insert({ trip_id: inserted.id, actor_name: profile?.name ?? '', actor_role: profile?.role ?? '', action: 'Trip request submitted', from_status: null, to_status: initialStatus });
      showToast('success', 'Trip request submitted successfully'); await refresh(); onDone();
    } catch (e: any) { showToast('error', `Gagal submit: ${e.message}`); } finally { setBusy(false); }
  };

  return <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
    <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><FilePlus className="w-5 h-5" /></div><div><h2 className="text-xl font-bold text-slate-900">New Trip Request</h2><p className="text-sm text-slate-500">Isi formulir perjalanan dinas dengan lengkap</p></div></div>
    {validation.length > 0 && <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4"><div className="flex gap-2.5"><AlertCircle className="w-5 h-5 text-amber-500 shrink-0" /><div><div className="text-sm font-bold text-amber-800">Submit Shield — {validation.length} catatan</div><ul className="mt-1 text-xs text-amber-700 space-y-0.5">{validation.slice(0, 8).map((item, i) => <li key={i}>• {item}</li>)}</ul></div></div></div>}

    <Card className="p-6 space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-2"><Users className="w-4 h-4" /> Informasi Pegawai Pemohon</h3>
      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Nama"><Input value={profile?.name ?? ''} disabled /></Field>
        <Field label="NIP" required><Input value={nip} onChange={(e) => setNip(e.target.value)} /></Field>
        <Field label="PT Pemohon" required><Select value={applicantPt} onChange={(e) => setApplicantPt(e.target.value)}><option value="">Pilih PT...</option>{ptOptions.map((pt) => <option key={pt}>{pt}</option>)}</Select></Field>
        <Field label="Grade / Matrix Benefit" required><Select value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">Pilih matrix...</option>{activeGrades.map((row) => <option key={row.id} value={row.grade_key}>{row.grade_name}</option>)}</Select></Field>
      </div>
      <div className="text-[11px] text-slate-500">Jabatan mengikuti data profil ({jabatan}). Pilihan matrix di atas menjadi satu-satunya dasar benefit perjalanan. Driver ditentukan terpisah oleh PIC Obligo.</div>
      <div className="grid md:grid-cols-4 gap-4"><Field label="Transportasi"><Select value={needsVehicle} onChange={(e) => setNeedsVehicle(e.target.value as TransportChoice)}>{TRANSPORT_CHOICES.map((item) => <option key={item}>{item}</option>)}</Select></Field><Field label="Butuh Driver?"><Select value={needsDriver ? 'ya' : 'tidak'} onChange={(e) => setNeedsDriver(e.target.value === 'ya')}><option value="tidak">Tidak</option><option value="ya">Ya</option></Select></Field><Field label="Total Distance"><Select value={totalDistance} onChange={(e) => setTotalDistance(e.target.value as TotalDistanceOption)}><option value="none">Kurang dari 200 km</option><option value="gt200">&gt; 200 km</option><option value="gt400">&gt; 400 km</option></Select></Field><Field label="Tujuan Perjalanan" required><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field></div>
      <Field label="Remarks / Catatan Khusus"><Textarea rows={2} value={employeeRemarks} onChange={(e) => setEmployeeRemarks(e.target.value)} /></Field>
      {depDate && <div className="text-xs bg-slate-50 p-3 rounded-xl flex justify-between"><span className="flex gap-1"><Calendar className="w-4 h-4" /> {depDate} {depTime} s.d. {retDate} {retTime}</span><strong>{days} hari</strong></div>}
    </Card>

    <Card className="p-6 space-y-4"><h3 className="text-sm font-bold flex items-center gap-2"><MapPin className="w-4 h-4" /> Lokasi Asal & Beban Biaya</h3><Field label="Origin"><Select value={origin} onChange={(e) => setOrigin(e.target.value)}>{ORIGINS.map((item) => <option key={item}>{item}</option>)}</Select></Field>{origin === 'Others' && <Field label="Nama Origin"><Input value={originCustom} onChange={(e) => setOriginCustom(e.target.value)} /></Field>}<div><div className="text-xs font-semibold mb-2">PT Beban Biaya</div><div className="flex flex-wrap gap-2">{activePTMaster.map((row) => <button type="button" key={row.id} onClick={() => toggleBurden(row.name)} className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1', companyBurdens.includes(row.name) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-200')}>{row.name}</button>)}</div></div></Card>

    <Card className="p-6 space-y-4"><div className="flex justify-between"><div><h3 className="text-sm font-bold flex items-center gap-2"><MapPin className="w-4 h-4" /> Itinerary</h3><p className="text-[11px] text-slate-400">Tanggal perjalanan dihitung dari itinerary.</p></div><Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addItinerary}>Add Row</Button></div>{!itinerary.length ? <EmptyState title="Belum ada itinerary" /> : <div className="space-y-3">{itinerary.map((leg, i) => { const tiers = dkTiersForOrigin(origin); return <div key={leg.id} className="rounded-xl ring-1 ring-slate-200 p-4 space-y-3"><div className="flex justify-between"><span className="text-xs font-bold flex gap-1"><Clock className="w-3.5 h-3.5" /> Leg {i + 1}</span><button onClick={() => removeItinerary(leg.id)}><Trash2 className="w-4 h-4 text-rose-500" /></button></div><div className="grid md:grid-cols-4 gap-3"><Input type="date" value={leg.start_date} onChange={(e) => updateItinerary(leg.id, { start_date: e.target.value })} /><Input type="time" value={leg.start_time} onChange={(e) => updateItinerary(leg.id, { start_time: e.target.value })} /><Input type="date" value={leg.end_date} onChange={(e) => updateItinerary(leg.id, { end_date: e.target.value })} /><Input type="time" value={leg.end_time} onChange={(e) => updateItinerary(leg.id, { end_time: e.target.value })} /></div><div className="grid md:grid-cols-2 gap-3"><Select value={leg.destination} onChange={(e) => { const dest = e.target.value; updateItinerary(leg.id, { destination: dest, isWithinCity: dest === 'Dalam Kota', isLuarkota: dest === 'Luar Kota' }); }}><option value="">Pilih lokasi...</option>{DESTINATION_OPTIONS.map((item) => <option key={item}>{item}</option>)}</Select>{(leg.destination === 'Others' || leg.destination === 'Luar Kota' || leg.destination === 'Dalam Kota') && <Input value={leg.destination_custom ?? ''} onChange={(e) => updateItinerary(leg.id, { destination_custom: e.target.value })} placeholder="Nama lokasi/kota" />}</div>{leg.isWithinCity && <Select value={leg.dkTier ?? ''} onChange={(e) => updateItinerary(leg.id, { dkTier: e.target.value as DKTier })}><option value="">Pilih tier DK...</option>{tiers.map((tier) => <option key={tier.key} value={tier.key}>{tier.label}</option>)}</Select>}<Input value={leg.agenda} onChange={(e) => updateItinerary(leg.id, { agenda: e.target.value })} placeholder="Agenda" /></div>; })}</div>}</Card>

    <Card className="p-6 space-y-4"><div className="flex justify-between"><div><h3 className="text-sm font-bold flex items-center gap-2"><Users className="w-4 h-4" /> Partisipan Tambahan</h3><p className="text-[11px] text-slate-400">Untuk internal cukup pilih satu Matrix Benefit. Driver tidak ditambahkan sebagai partisipan.</p></div><Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addParticipant}>Add Row</Button></div>{participants.map((p, i) => { const cat: ParticipantCategory = p.category ?? 'Internal'; return <div key={p.id} className="grid md:grid-cols-[40px_120px_1fr_160px_180px_40px] gap-2 items-center border rounded-xl p-3"><span>{i + 1}.</span><Select value={cat} onChange={(e) => updateParticipant(p.id, { category: e.target.value as ParticipantCategory })}><option>Internal</option><option>Eksternal</option></Select><Input value={p.name} onChange={(e) => updateParticipant(p.id, { name: e.target.value })} placeholder="Nama" />{cat === 'Internal' ? <><Select value={p.pt_unit ?? ''} onChange={(e) => updateParticipant(p.id, { pt_unit: e.target.value })}><option value="">PT...</option>{ptOptions.map((pt) => <option key={pt}>{pt}</option>)}</Select><Select value={p.grade ?? ''} onChange={(e) => updateParticipant(p.id, { grade: e.target.value, jabatan: 'Staff' })}><option value="">Matrix Benefit...</option>{activeGrades.map((row) => <option key={row.id} value={row.grade_key}>{row.grade_name}</option>)}</Select></> : <Input className="md:col-span-2" value={p.keterangan ?? ''} onChange={(e) => updateParticipant(p.id, { keterangan: e.target.value })} placeholder="Vendor / Klien / Mitra" />}<button onClick={() => setParticipants((rows) => rows.filter((row) => row.id !== p.id))}><Trash2 className="w-4 h-4 text-rose-500" /></button></div>; })}</Card>

    <Card className="p-6 space-y-4"><h3 className="text-sm font-bold flex gap-2"><Calculator className="w-4 h-4" /> Petty Cash Khusus</h3><label className="flex gap-2 items-center"><input type="checkbox" checked={pettyCash} onChange={(e) => setPettyCash(e.target.checked)} />Ajukan Petty Cash Khusus</label>{pettyCash && <input type="file" accept="image/*,.pdf" onChange={(e) => setPettyFile(e.target.files?.[0] ?? null)} />}{pettyFile && <div className="text-xs flex gap-1"><Paperclip className="w-3 h-3" />{pettyFile.name}</div>}</Card>
    {preview && <Card className="p-6 space-y-3"><h3 className="text-sm font-bold">Estimasi Awal</h3>{preview.perParticipant.map((pp) => <div key={`${pp.name}-${pp.grade}`} className="rounded-xl bg-slate-50 p-3 flex justify-between"><div><strong>{pp.name}</strong><div className="text-xs text-slate-500">Matrix {pp.grade || '-'} · {pp.breakdown}</div></div><strong>{formatIDR(pp.total + pp.hotel + pp.pettyCash)}</strong></div>)}<div className="border-t pt-3 flex justify-between"><strong>Total Estimasi</strong><strong>{formatIDR(preview.grandTotal)}</strong></div></Card>}
    <div className="flex justify-end gap-3 pb-6"><Button variant="secondary" onClick={onDone}>Cancel</Button><Button disabled={!canSubmit} icon={<Send className="w-4 h-4" />} onClick={handleSubmit}>{busy ? 'Submitting...' : 'Submit Request'}</Button></div>
  </div>;
}
