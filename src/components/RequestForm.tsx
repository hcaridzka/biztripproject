import { useState, useMemo } from 'react';
import {
  FilePlus, Plus, Trash2, Calendar, Users, MapPin, AlertCircle,
  Paperclip, Send, Calculator, Building2, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field, Textarea, EmptyState, formatIDR } from './ui-shared';
import {
  ORIGINS, DESTINATION_OPTIONS, TRANSPORT_CHOICES, JABATAN_LEVELS,
  PT_OPTIONS,
} from '../lib/constants';
import { uid, daysBetween, computeCost, computePettyCash, defaultKPScheme, autoKPSchemeForLeg, dkTiersForOrigin } from '../lib/costCalc';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { ItineraryLeg, Participant, ParticipantCategory, Jabatan, DKTier, TransportChoice, TripCategory, TotalDistanceOption } from '../lib/types';

export function RequestForm({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const { showToast, refresh } = useApp();

  const [nip, setNip] = useState(profile?.nip ?? '');
  const [jabatan, setJabatan] = useState<Jabatan>(profile?.jabatan ?? 'Staff');
  const [applicantPt, setApplicantPt] = useState<string>(profile?.pt_unit ?? '');
  const [origin, setOrigin] = useState('Head Office BSD');
  const [originCustom, setOriginCustom] = useState('');

  const [purpose, setPurpose] = useState('');
  const [needsVehicle, setNeedsVehicle] = useState<TransportChoice>('Kendaraan Dinas');
  const [needsDriver, setNeedsDriver] = useState(true);
  const [totalDistance, setTotalDistance] = useState<TotalDistanceOption>('none');
  const [companyBurdens, setCompanyBurdens] = useState<string[]>([]);
  const [tripCategory, setTripCategory] = useState<TripCategory>(null);
  
  const [itinerary, setItinerary] = useState<ItineraryLeg[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [employeeRemarks, setEmployeeRemarks] = useState('');
  const [pettyCash, setPettyCash] = useState(false);
  const [pettyFile, setPettyFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Perhitungan tanggal, jam berangkat & pulang otomatis dari Itinerary
  const { depDate, retDate, depTime, retTime, days } = useMemo(() => {
    if (itinerary.length === 0) return { depDate: '', retDate: '', depTime: '08:00', retTime: '17:00', days: 0 };
    
    const sortedLegs = [...itinerary].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const firstLeg = sortedLegs[0];
    const lastLeg = [...sortedLegs].sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())[sortedLegs.length - 1];
    
    const dDate = firstLeg?.start_date ?? '';
    const rDate = lastLeg?.end_date ?? '';
    const dTime = firstLeg?.start_time || '08:00';
    const rTime = lastLeg?.end_time || '17:00';

    const totalDays = dDate && rDate ? daysBetween(dDate, rDate) : 0;
    return { depDate: dDate, retDate: rDate, depTime: dTime, retTime: rTime, days: totalDays };
  }, [itinerary]);

  const kpScheme = useMemo(() => defaultKPScheme(itinerary), [itinerary]);

  // Objek Utama Pemohon
  const mainApplicant = useMemo<Participant>(() => ({
    id: 'main-applicant',
    name: profile?.name ?? '',
    jabatan: jabatan,
    category: 'Internal',
    pt_unit: applicantPt,
  }), [profile, jabatan, applicantPt]);

  // Menggabungkan Pemohon Utama dan Partisipan Tambahan
  const allParticipants = useMemo(() => {
    const othersFiltered = participants.filter((p) => p.id !== 'main-applicant');
    return [mainApplicant, ...othersFiltered];
  }, [mainApplicant, participants]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!nip.trim()) errors.push('NIP wajib diisi');
    if (!applicantPt) errors.push('PT Perusahaan Pemohon wajib dipilih');
    if (!purpose.trim()) errors.push('Tujuan perjalanan wajib diisi');
    if (origin === 'Others' && !originCustom.trim()) errors.push('Nama lokasi asal (Others) wajib diisi');
    if (companyBurdens.length === 0) errors.push('Minimal 1 PT Beban Biaya wajib dipilih');
    if (itinerary.length === 0) errors.push('Minimal 1 baris Itinerary wajib diisi');

    itinerary.forEach((leg, i) => {
      if (!leg.start_date) errors.push(`Itinerary baris ${i + 1}: Tanggal mulai wajib diisi`);
      if (!leg.start_time) errors.push(`Itinerary baris ${i + 1}: Jam mulai wajib diisi`);
      if (!leg.end_date) errors.push(`Itinerary baris ${i + 1}: Tanggal selesai wajib diisi`);
      if (!leg.end_time) errors.push(`Itinerary baris ${i + 1}: Jam selesai wajib diisi`);
      
      if (leg.start_date && leg.end_date) {
        const startDt = new Date(`${leg.start_date}T${leg.start_time || '00:00'}`);
        const endDt = new Date(`${leg.end_date}T${leg.end_time || '00:00'}`);
        if (endDt < startDt) {
          errors.push(`Itinerary baris ${i + 1}: Tanggal & jam selesai tidak boleh sebelum tanggal & jam mulai`);
        }
      }

      if (!leg.destination) errors.push(`Itinerary baris ${i + 1}: Lokasi tujuan wajib dipilih`);
      if ((leg.destination === 'Others' || leg.destination === 'Dalam Kota' || leg.destination === 'Luar Kota') && !leg.destination_custom?.trim()) {
        errors.push(`Itinerary baris ${i + 1}: Nama kota/custom wajib diisi`);
      }
      if (leg.isWithinCity && !leg.dkTier) errors.push(`Itinerary baris ${i + 1}: Tier jarak DK wajib dipilih`);
      if (!leg.agenda.trim()) errors.push(`Itinerary baris ${i + 1}: Agenda wajib diisi`);
    });

    for (let i = 0; i < itinerary.length - 1; i++) {
      const currentEnd = new Date(`${itinerary[i].end_date}T${itinerary[i].end_time || '00:00'}`);
      const nextStart = new Date(`${itinerary[i + 1].start_date}T${itinerary[i + 1].start_time || '00:00'}`);
      if (!isNaN(currentEnd.getTime()) && !isNaN(nextStart.getTime()) && nextStart < currentEnd) {
        errors.push(`Itinerary baris ${i + 2}: Waktu mulai tidak boleh mendahului waktu selesai baris sebelumnya (Overlap)`);
      }
    }

    participants.forEach((p, i) => {
      if (!p.name.trim()) errors.push(`Partisipan tambahan baris ${i + 1}: Nama wajib diisi`);
      if (p.category === 'Eksternal' && !p.keterangan?.trim()) errors.push(`Partisipan tambahan baris ${i + 1}: Keterangan eksternal wajib diisi`);
    });

    if (pettyCash && !pettyFile) errors.push('Petty Cash dicentang — wajib unggah file bukti persetujuan chat');
    return errors;
  }, [nip, applicantPt, purpose, origin, originCustom, companyBurdens, itinerary, participants, pettyCash, pettyFile]);

  const canSubmit = validation.length === 0 && !busy;

  const preview = useMemo(() => {
    if (itinerary.length === 0 || !depDate || !retDate) return null;
    return computeCost({ 
      participants: allParticipants, 
      days, 
      itinerary, 
      origin, 
      tripCategory, 
      kpScheme, 
      needsDriver,
      totalDistance 
    });
  }, [allParticipants, days, itinerary, origin, tripCategory, kpScheme, needsDriver, totalDistance, depDate, retDate]);

  const pettyPreview = useMemo(() => computePettyCash(allParticipants, itinerary), [allParticipants, itinerary]);

  const addItinerary = () => {
    const lastLeg = itinerary[itinerary.length - 1];
    const defaultDate = lastLeg ? lastLeg.end_date : new Date().toISOString().split('T')[0];
    const defaultStartTime = lastLeg ? lastLeg.end_time || '08:00' : '08:00';

    setItinerary((prev) => [...prev, {
      id: uid(), 
      start_date: defaultDate, 
      start_time: defaultStartTime,
      end_date: defaultDate, 
      end_time: '17:00',
      destination: '', 
      destination_custom: '', 
      kpScheme: 'KP2',
      isWithinCity: false, 
      isLuarkota: false, 
      agenda: '',
    }]);
  };

  const updateItinerary = (id: string, patch: Partial<ItineraryLeg>) => {
    setItinerary((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      next.kpScheme = autoKPSchemeForLeg(next.destination, next.kpScheme);
      return next;
    }));
  };

  const removeItinerary = (id: string) => setItinerary((prev) => prev.filter((l) => l.id !== id));

  const addParticipant = () => setParticipants((p) => [...p, { id: uid(), name: '', jabatan: 'Staff', category: 'Internal', pt_unit: '' }]);
  const updateParticipant = (id: string, patch: Partial<Participant>) => setParticipants((p) => p.map((pp) => pp.id === id ? { ...pp, ...patch } : pp));
  const removeParticipant = (id: string) => setParticipants((p) => p.filter((pp) => pp.id !== id));

  const toggleBurden = (pt: string) => setCompanyBurdens((prev) => prev.includes(pt) ? prev.filter((p) => p !== pt) : [...prev, pt]);

  const uploadPettyFileToStorage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `petty_${profile?.id ?? 'user'}_${Date.now()}.${fileExt}`;
      const filePath = `approvals/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pettycash')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('pettycash')
        .getPublicUrl(filePath);

      return publicUrlData.publicUrl;
    } catch (e: any) {
      throw new Error('Gagal upload ke storage: ' + e.message);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      showToast('error', `Form belum lengkap: ${validation.length} kolom belum terisi`);
      return;
    }
    setBusy(true);

    let pettyFileUrl: string | null = null;
    if (pettyCash && pettyFile) {
      try {
        pettyFileUrl = await uploadPettyFileToStorage(pettyFile);
      } catch (e: any) {
        showToast('error', e.message);
        setBusy(false);
        return;
      }
    }

    // FIX ALUR: Semua permohonan HARUS selalu diawali dari Manager terlebih dahulu
    const initialStatus = 'Pending Manager Approval';

    const cost = computeCost({ 
      participants: allParticipants, 
      days, 
      itinerary, 
      origin, 
      tripCategory, 
      kpScheme, 
      needsDriver,
      totalDistance 
    });

    const { data: inserted, error } = await supabase.from('biz_trips').insert({
      user_id: profile?.id,
      requester_name: profile?.name,
      requester_nip: nip,
      requester_jabatan: jabatan,
      requester_pt: applicantPt,
      origin,
      origin_custom: origin === 'Others' ? originCustom : null,
      departure_date: depDate, departure_time: depTime,
      return_date: retDate, return_time: retTime,
      total_days: days,
      purpose,
      needs_vehicle: needsVehicle === 'Kendaraan Dinas',
      vehicle_type_choice: needsVehicle,
      needs_driver: needsDriver,
      total_distance: totalDistance,
      company_burden: companyBurdens,
      trip_category: tripCategory,
      itinerary, participants: allParticipants,
      petty_cash_requested: pettyCash,
      petty_cash_holder: pettyPreview.holder,
      petty_cash_approval_file: pettyFileUrl,
      kp_scheme: kpScheme,
      cost_grand_total: cost.grandTotal,
      fuel_cost: 0,
      etoll_cost: 0,
      employee_remarks: employeeRemarks || null,
      status: initialStatus,
    }).select().maybeSingle();

    if (error) {
      showToast('error', `Gagal submit: ${error.message}`);
    } else if (inserted) {
      await supabase.from('trip_tracking').insert({
        trip_id: inserted.id,
        actor_name: profile?.name ?? '',
        actor_role: profile?.role ?? '',
        action: 'Trip request submitted',
        from_status: null,
        to_status: initialStatus,
      });
      showToast('success', 'Trip request submitted successfully');
      refresh();
      onDone();
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <FilePlus className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">New Trip Request</h2>
          <p className="text-sm text-slate-500">Isi formulir perjalanan dinas dengan lengkap</p>
        </div>
      </div>

      {validation.length > 0 && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-bold text-amber-800">Submit Shield — {validation.length} field(s) belum lengkap / overlap</div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-700">
                {validation.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
                {validation.length > 8 && <li>• ...dan {validation.length - 8} lainnya</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main info */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Informasi Pegawai Pemohon</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Nama Pegawai Pemohon" required>
            <Input value={profile?.name ?? ''} disabled className="bg-slate-50" />
          </Field>
          <Field label="NIP" required>
            <Input value={nip} onChange={(e) => setNip(e.target.value)} placeholder="Nomor Induk Pegawai" />
          </Field>
          <Field label="PT Perusahaan Pemohon" required>
            <Select value={applicantPt} onChange={(e) => setApplicantPt(e.target.value)}>
              <option value="">Pilih PT Perusahaan...</option>
              {PT_OPTIONS.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
            </Select>
          </Field>
          <Field label="Grade / Jabatan" required>
            <Select value={jabatan} onChange={(e) => setJabatan(e.target.value as Jabatan)}>
              {JABATAN_LEVELS.filter((j) => j !== 'TAD').map((j) => <option key={j} value={j}>{j}</option>)}
            </Select>
          </Field>
        </div>

        {depDate && retDate && (
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-600" /> Otomatis dari Itinerary: <strong>{depDate} ({depTime})</strong> s.d <strong>{retDate} ({retTime})</strong>
            </span>
            <span className="font-bold text-brand-600">Total Durasi: {days} hari</span>
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Kebutuhan Transportasi" required>
            <Select value={needsVehicle} onChange={(e) => setNeedsVehicle(e.target.value as TransportChoice)}>
              {TRANSPORT_CHOICES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Butuh Driver?" required>
            <Select value={needsDriver ? 'ya' : 'tidak'} onChange={(e) => setNeedsDriver(e.target.value === 'ya')}>
              <option value="tidak">Tidak</option>
              <option value="ya">Ya</option>
            </Select>
          </Field>
          <Field label="Total Distance (Insentif Jarak)" hint="Insentif khusus driver">
            <Select value={totalDistance} onChange={(e) => setTotalDistance(e.target.value as TotalDistanceOption)}>
              <option value="none">Kurang dari 200 km </option>
              <option value="gt200">&gt; 200 km </option>
              <option value="gt400">&gt; 400 km </option>
            </Select>
          </Field>
          <Field label="Tujuan Perjalanan" required>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Tujuan dinas" />
          </Field>
        </div>
        <Field label="Remarks / Catatan Khusus Employee" hint="Opsional">
          <Textarea rows={2} value={employeeRemarks} onChange={(e) => setEmployeeRemarks(e.target.value)} placeholder="Catatan operasional tambahan..." />
        </Field>
      </Card>

      {/* Origin & PT burden */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> Lokasi Asal & Beban Biaya</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Lokasi Asal (Origin)" required>
            <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          {origin === 'Others' && (
            <Field label="Nama Lokasi Asal (Custom)" required>
              <Input value={originCustom} onChange={(e) => setOriginCustom(e.target.value)} placeholder="Mis: Bandung" />
            </Field>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">PT Beban Biaya (Multi-Unit) <span className="text-rose-500">*</span></label>
          <div className="flex flex-wrap gap-2">
            {PT_OPTIONS.map((pt) => {
              const checked = companyBurdens.includes(pt);
              return (
                <button key={pt} type="button" onClick={() => toggleBurden(pt)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold ring-1 transition',
                    checked ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
                  {pt}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Itinerary */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> Itinerary Perjalanan</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Tanggal & jam berangkat serta pulang dihitung otomatis dari baris-baris ini tanpa duplikasi input</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addItinerary}>Add Row</Button>
        </div>
        {itinerary.length === 0 ? (
          <EmptyState icon={<MapPin className="w-6 h-6" />} title="Belum ada itinerary" message="Klik Add Row untuk menambahkan rute, tanggal, dan jam tujuan." />
        ) : (
          <div className="space-y-3">
            {itinerary.map((leg, i) => {
              const isDalamKota = leg.destination === 'Dalam Kota';
              const tiers = dkTiersForOrigin(origin);
              return (
                <div key={leg.id} className="rounded-xl ring-1 ring-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-brand-600" /> Leg {i + 1}
                    </span>
                    <button onClick={() => removeItinerary(leg.id)} className="text-rose-400 hover:text-rose-600 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid md:grid-cols-4 gap-3">
                    <Field label="Tanggal Mulai" required>
                      <Input type="date" value={leg.start_date} onChange={(e) => updateItinerary(leg.id, { start_date: e.target.value })} />
                    </Field>
                    <Field label="Jam Mulai" required>
                      <Input type="time" value={leg.start_time ?? '08:00'} onChange={(e) => updateItinerary(leg.id, { start_time: e.target.value })} />
                    </Field>
                    <Field label="Tanggal Selesai" required>
                      <Input type="date" value={leg.end_date} onChange={(e) => updateItinerary(leg.id, { end_date: e.target.value })} />
                    </Field>
                    <Field label="Jam Selesai" required>
                      <Input type="time" value={leg.end_time ?? '17:00'} onChange={(e) => updateItinerary(leg.id, { end_time: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Lokasi Tujuan" required>
                      <Select value={leg.destination} onChange={(e) => {
                        const dest = e.target.value;
                        updateItinerary(leg.id, { destination: dest, isWithinCity: dest === 'Dalam Kota', isLuarkota: dest === 'Luar Kota' });
                      }}>
                        <option value="">Pilih lokasi...</option>
                        {DESTINATION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </Select>
                    </Field>
                    {(leg.destination === 'Others' || leg.destination === 'Luar Kota') && (
                      <Field label="Nama Kota/Lokasi" required>
                        <Input value={leg.destination_custom ?? ''} onChange={(e) => updateItinerary(leg.id, { destination_custom: e.target.value })} placeholder="Mis: Padang, Pekanbaru" />
                      </Field>
                    )}
                  </div>
                  {isDalamKota && (
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="Pilih Tier Jarak DK" required>
                        <Select value={leg.dkTier ?? ''} onChange={(e) => updateItinerary(leg.id, { dkTier: (e.target.value || undefined) as DKTier })}>
                          <option value="">Pilih tier...</option>
                          {tiers.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Nama Kota Detail / Keterangan Lokasi" required>
                        <Input value={leg.destination_custom ?? ''} onChange={(e) => updateItinerary(leg.id, { destination_custom: e.target.value })} placeholder="Mis: Kelurahan X, Kec. Y" />
                      </Field>
                    </div>
                  )}
                  <Field label="Agenda Kegiatan" required>
                    <Input value={leg.agenda} onChange={(e) => updateItinerary(leg.id, { agenda: e.target.value })} placeholder="Agenda di lokasi tujuan" />
                  </Field>
                  {leg.destination && (
                    <div className="text-[11px] font-semibold text-brand-600 bg-brand-50 rounded-lg px-2 py-1 inline-block">
                      Skema: {leg.destination.includes('SITE') ? 'KP2' : leg.destination.includes('Branch Office') ? 'KP1' : isDalamKota ? `DK ${leg.dkTier ?? '?'}KM` : 'LK'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pegawai Pemohon auto-included banner */}
      <Card className="p-4 ring-brand-200 bg-brand-50/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
            {profile?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-800">Pegawai Pemohon: {profile?.name}</div>
            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{jabatan}</span>
              <span>•</span>
              <span className="font-semibold text-brand-700 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {applicantPt || 'PT Belum Dipilih'}
              </span>
              <span>•</span>
              <span>Otomatis terdaftar sebagai peserta utama</span>
            </div>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-brand-600 text-white font-bold">MAIN APPLICANT</span>
        </div>
      </Card>

      {/* Additional Participants */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> Partisipan Tambahan Dinas</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Opsional — hanya jika pergi bersama rekan/pihak lain. Pemohon utama tidak akan tertimpa.</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="w-3.5 h-3.5" />} onClick={addParticipant}>Add Row</Button>
        </div>
        {participants.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-6 text-center">
            <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Pegawai Pemohon pergi sendirian. Klik <strong>Add Row</strong> jika ada partisipan tambahan.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {participants.map((p, i) => {
              const cat: ParticipantCategory = p.category ?? 'Internal';
              return (
                <div key={p.id} className="grid grid-cols-1 md:grid-cols-14 gap-2 items-center rounded-xl ring-1 ring-slate-200 p-3" style={{ gridTemplateColumns: 'auto repeat(5, minmax(0, 1fr)) auto' }}>
                  <span className="text-xs font-bold text-slate-400 w-6">{i + 1}.</span>
                  <Select value={cat} onChange={(e) => updateParticipant(p.id, { category: e.target.value as ParticipantCategory })}>
                    <option value="Internal">Internal</option>
                    <option value="Eksternal">Eksternal</option>
                  </Select>
                  <Input value={p.name} onChange={(e) => updateParticipant(p.id, { name: e.target.value })} placeholder="Nama partisipan" />
                  {cat === 'Internal' ? (
                    <>
                      <Select value={p.pt_unit ?? ''} onChange={(e) => updateParticipant(p.id, { pt_unit: e.target.value })}>
                        <option value="">Pilih PT...</option>
                        {PT_OPTIONS.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                      </Select>
                      <Select value={p.jabatan} onChange={(e) => updateParticipant(p.id, { jabatan: e.target.value as Jabatan })}>
                        {JABATAN_LEVELS.map((j) => <option key={j} value={j}>{j}</option>)}
                      </Select>
                    </>
                  ) : (
                    <Input className="col-span-2" value={p.keterangan ?? ''} onChange={(e) => updateParticipant(p.id, { keterangan: e.target.value })} placeholder="Keterangan (Vendor PT X, Klien, Mitra)" />
                  )}
                  <div className="flex justify-end">
                    <button onClick={() => removeParticipant(p.id)} className="text-rose-400 hover:text-rose-600 transition p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Petty cash */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Calculator className="w-4 h-4 text-slate-400" /> Petty Cash Khusus</h3>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={pettyCash} onChange={(e) => setPettyCash(e.target.checked)} className="w-4 h-4 rounded text-brand-600" />
          <span className="text-sm text-slate-700">Ajukan Petty Cash Khusus</span>
        </label>
        {pettyCash && (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
              <AlertCircle className="w-3.5 h-3.5" /> Wajib unggah file/foto bukti persetujuan chat (Disimpan ke Supabase Storage)
            </div>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setPettyFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
            {pettyFile && <p className="text-xs text-emerald-600 flex items-center gap-1"><Paperclip className="w-3 h-3" /> File terpilih: {pettyFile.name}</p>}
          </div>
        )}
      </Card>

      {/* Cost preview */}
      {preview && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Calculator className="w-4 h-4 text-slate-400" /> Estimasi Awal — Rincian per Pegawai</h3>
          <div className="space-y-3">
            {preview.perParticipant.map((pp, i) => (
              <div key={i} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
                    {pp.name.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{pp.name} ({pp.jabatan}) - <span className="text-brand-600">{pp.pt_unit || 'N/A'}</span></div>
                    <div className="text-[11px] text-slate-500">{pp.breakdown}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">{formatIDR(pp.total)}</div>
                    {pp.hotel > 0 && <div className="text-[11px] text-slate-400">Hotel: {formatIDR(pp.hotel)}</div>}
                    {pp.pettyCash > 0 && <div className="text-[11px] text-slate-400">Petty: {formatIDR(pp.pettyCash)}</div>}
                  </div>
                </div>
                {pp.legs.length > 0 && (
                  <div className="mt-2 pl-11 space-y-0.5">
                    {pp.legs.map((leg, j) => (
                      <div key={j} className="text-[10px] text-slate-500 flex justify-between">
                        <span>Leg {leg.legIndex + 1}: {leg.destination} — {leg.scheme} {formatIDR(leg.rate)}×{leg.days}d</span>
                        <span className="font-semibold">{formatIDR(leg.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="border-t border-slate-200 pt-3 space-y-1.5">
            <Row label="Total Tunjangan" value={formatIDR(preview.perDiemTotal)} />
            <Row label="Total Akomodasi Hotel" value={formatIDR(preview.hotelTotal)} />
            <Row label="Insentif Jarak" value={formatIDR(preview.driverTotal)} />
            <Row label="Total Petty Cash" value={formatIDR(preview.pettyCashTotal)} />
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-sm font-bold text-brand-800">In Total (Estimasi Awal)</span>
              <span className="text-lg font-bold text-brand-800">{formatIDR(preview.grandTotal)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} icon={<Send className="w-4 h-4" />}>
          {busy ? 'Submitting...' : 'Submit Request'}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
