import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Calculator,
  Clock,
  FilePlus,
  MapPin,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Users,
  UserRound,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  formatIDR,
} from './ui-shared';

import {
  ORIGINS,
  DESTINATION_OPTIONS,
  TRANSPORT_CHOICES,
} from '../lib/constants';

import {
  autoKPSchemeForLeg,
  computeCost,
  computePettyCash,
  daysBetween,
  defaultKPScheme,
  dkTiersForOrigin,
  uid,
} from '../lib/costCalc';

import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

import type {
  DKTier,
  ItineraryLeg,
  Jabatan,
  Participant,
  ParticipantCategory,
  TotalDistanceOption,
  TransportChoice,
  TripCategory,
} from '../lib/types';

type RequestFor = 'self' | 'other';

const JABATAN_OPTIONS: Jabatan[] = [
  'TAD',
  'Staff',
  'Team Leader',
  'Head Department',
  'General Manager',
  'Direksi',
];

/**
 * User hanya memilih Jabatan.
 * Matrix benefit ditentukan otomatis di belakang.
 */
function matrixFromJabatan(jabatan: Jabatan): string {
  if (jabatan === 'Driver' || jabatan === 'TAD') {
    return 'TAD';
  }

  if (jabatan === 'Staff') {
    return 'Staff';
  }

  if (
    jabatan === 'Team Leader' ||
    jabatan === 'Head Department'
  ) {
    return 'Head/TL';
  }

  if (jabatan === 'General Manager') {
    return 'GM';
  }

  if (jabatan === 'Direksi') {
    return 'Direksi';
  }

  return 'Staff';
}

export function RequestForm({
  onDone,
}: {
  onDone: () => void;
}) {
  const { profile } = useAuth();

  const {
    showToast,
    refresh,
    activePTMaster,
    travelMatrix,
    travelDKMatrix,
    driverIncentive,
  } = useApp();

  /**
   * PT yang boleh dipilih mengikuti PT Access account.
   *
   * Rule:
   * - pt_access kosong = semua PT
   * - ada isi = hanya PT tersebut
   */
  const ptOptions = useMemo(() => {
    const active = activePTMaster
      .map((pt) => pt.name)
      .filter(Boolean);

    const access =
      profile?.pt_access ?? [];

    if (!access.length) {
      return Array.from(
        new Set([
          ...active,
          ...[
            profile?.pt_unit,
          ].filter(
            (
              pt
            ): pt is string =>
              Boolean(pt)
          ),
        ])
      );
    }

    const allowed = active.filter(
      (pt) =>
        access.includes(pt)
    );

    if (
      profile?.pt_unit &&
      access.includes(
        profile.pt_unit
      ) &&
      !allowed.includes(
        profile.pt_unit
      )
    ) {
      allowed.push(
        profile.pt_unit
      );
    }

    return Array.from(
      new Set(allowed)
    );
  }, [
    activePTMaster,
    profile?.pt_access,
    profile?.pt_unit,
  ]);

  const [
    requestFor,
    setRequestFor,
  ] =
    useState<RequestFor>(
      'self'
    );

  /**
   * TRAVELER UTAMA
   *
   * Bukan account login.
   */
  const [
    travelerName,
    setTravelerName,
  ] = useState(
    profile?.name ?? ''
  );

  const [
    travelerNip,
    setTravelerNip,
  ] = useState(
    profile?.nip ?? ''
  );

  const [
    travelerJabatan,
    setTravelerJabatan,
  ] =
    useState<Jabatan>(
      profile?.jabatan ??
        'Staff'
    );

  const [
    travelerPt,
    setTravelerPt,
  ] = useState(
    profile?.pt_unit ?? ''
  );

  const [
    origin,
    setOrigin,
  ] = useState(
    'Head Office BSD'
  );

  const [
    originCustom,
    setOriginCustom,
  ] = useState('');

  const [
    purpose,
    setPurpose,
  ] = useState('');

  const [
    needsVehicle,
    setNeedsVehicle,
  ] =
    useState<TransportChoice>(
      'Kendaraan Dinas'
    );

  const [
    needsDriver,
    setNeedsDriver,
  ] = useState(true);

  const [
    totalDistance,
    setTotalDistance,
  ] =
    useState<TotalDistanceOption>(
      'none'
    );

  const [
    companyBurdens,
    setCompanyBurdens,
  ] = useState<string[]>(
    []
  );

  const [tripCategory] =
    useState<TripCategory>(
      null
    );

  const [
    itinerary,
    setItinerary,
  ] =
    useState<
      ItineraryLeg[]
    >([]);

  const [
    participants,
    setParticipants,
  ] =
    useState<
      Participant[]
    >([]);

  const [
    employeeRemarks,
    setEmployeeRemarks,
  ] = useState('');

  const [
    pettyCash,
    setPettyCash,
  ] = useState(false);

  const [
    pettyFile,
    setPettyFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    busy,
    setBusy,
  ] = useState(false);

  const switchRequestFor = (
    value: RequestFor
  ) => {
    setRequestFor(value);

    if (value === 'self') {
      setTravelerName(
        profile?.name ?? ''
      );

      setTravelerNip(
        profile?.nip ?? ''
      );

      setTravelerJabatan(
        profile?.jabatan ??
          'Staff'
      );

      setTravelerPt(
        profile?.pt_unit ?? ''
      );
    } else {
      setTravelerName('');
      setTravelerNip('');
      setTravelerJabatan(
        'Staff'
      );

      setTravelerPt(
        profile?.pt_unit &&
          ptOptions.includes(
            profile.pt_unit
          )
          ? profile.pt_unit
          : ptOptions[0] ??
              ''
      );
    }
  };

  const {
    depDate,
    retDate,
    depTime,
    retTime,
    days,
  } = useMemo(() => {
    if (
      !itinerary.length
    ) {
      return {
        depDate: '',
        retDate: '',
        depTime: '08:00',
        retTime: '17:00',
        days: 0,
      };
    }

    const first = [
      ...itinerary,
    ].sort((a, b) =>
      a.start_date.localeCompare(
        b.start_date
      )
    )[0];

    const last = [
      ...itinerary,
    ]
      .sort((a, b) =>
        a.end_date.localeCompare(
          b.end_date
        )
      )
      .at(-1)!;

    return {
      depDate:
        first.start_date,
      retDate:
        last.end_date,
      depTime:
        first.start_time ||
        '08:00',
      retTime:
        last.end_time ||
        '17:00',
      days: daysBetween(
        first.start_date,
        last.end_date
      ),
    };
  }, [itinerary]);

  const kpScheme =
    useMemo(
      () =>
        defaultKPScheme(
          itinerary
        ),
      [itinerary]
    );

  /**
   * Traveler utama juga dianggap participant
   * untuk calculation.
   *
   * grade tetap disimpan INTERNAL,
   * tetapi tidak pernah dipilih user.
   */
  const mainApplicant =
    useMemo<Participant>(
      () => ({
        id: 'main-applicant',
        name: travelerName,
        nip:
          travelerNip ||
          null,
        jabatan:
          travelerJabatan,
        grade:
          matrixFromJabatan(
            travelerJabatan
          ),
        category:
          'Internal',
        pt_unit:
          travelerPt,
      }),
      [
        travelerName,
        travelerNip,
        travelerJabatan,
        travelerPt,
      ]
    );

  const allParticipants =
    useMemo(
      () => [
        mainApplicant,
        ...participants.filter(
          (participant) =>
            participant.id !==
            'main-applicant'
        ),
      ],
      [
        mainApplicant,
        participants,
      ]
    );

  const validation =
    useMemo(() => {
      const errors: string[] =
        [];

      if (
        !travelerName.trim()
      ) {
        errors.push(
          'Nama traveler wajib diisi'
        );
      }

      if (
        !travelerNip.trim()
      ) {
        errors.push(
          'NIP traveler wajib diisi'
        );
      }

      if (!travelerPt) {
        errors.push(
          'PT traveler wajib dipilih'
        );
      }

      if (
        !purpose.trim()
      ) {
        errors.push(
          'Tujuan perjalanan wajib diisi'
        );
      }

      if (
        origin ===
          'Others' &&
        !originCustom.trim()
      ) {
        errors.push(
          'Nama lokasi asal wajib diisi'
        );
      }

      if (
        !companyBurdens.length
      ) {
        errors.push(
          'Minimal 1 PT Beban Biaya wajib dipilih'
        );
      }

      if (
        !itinerary.length
      ) {
        errors.push(
          'Minimal 1 baris Itinerary wajib diisi'
        );
      }

      itinerary.forEach(
        (
          leg,
          index
        ) => {
          if (
            !leg.start_date ||
            !leg.start_time ||
            !leg.end_date ||
            !leg.end_time
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: tanggal dan jam wajib lengkap`
            );
          }

          if (
            !leg.destination
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: lokasi tujuan wajib dipilih`
            );
          }

          if (
            (
              leg.destination ===
                'Others' ||
              leg.destination ===
                'Dalam Kota' ||
              leg.destination ===
                'Luar Kota'
            ) &&
            !leg.destination_custom?.trim()
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: nama kota/lokasi wajib diisi`
            );
          }

          if (
            leg.isWithinCity &&
            !leg.dkTier
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: tier jarak DK wajib dipilih`
            );
          }

          if (
            !leg.agenda.trim()
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: agenda wajib diisi`
            );
          }

          if (
            leg.start_date &&
            leg.end_date &&
            new Date(
              `${leg.end_date}T${
                leg.end_time ||
                '00:00'
              }`
            ) <
              new Date(
                `${leg.start_date}T${
                  leg.start_time ||
                  '00:00'
                }`
              )
          ) {
            errors.push(
              `Itinerary baris ${
                index + 1
              }: waktu selesai tidak boleh sebelum mulai`
            );
          }
        }
      );

      participants.forEach(
        (
          participant,
          index
        ) => {
          if (
            !participant.name.trim()
          ) {
            errors.push(
              `Partisipan tambahan baris ${
                index + 1
              }: Nama wajib diisi`
            );
          }

          if (
            participant.jabatan ===
            'Driver'
          ) {
            errors.push(
              `Partisipan tambahan baris ${
                index + 1
              }: Driver tidak boleh diinput sebagai participant`
            );
          }

          if (
            participant.category !==
              'Eksternal' &&
            !participant.pt_unit
          ) {
            errors.push(
              `Partisipan tambahan baris ${
                index + 1
              }: PT wajib dipilih`
            );
          }

          if (
            participant.category ===
              'Eksternal' &&
            !participant.keterangan?.trim()
          ) {
            errors.push(
              `Partisipan tambahan baris ${
                index + 1
              }: Keterangan eksternal wajib diisi`
            );
          }
        }
      );

      if (
        pettyCash &&
        !pettyFile
      ) {
        errors.push(
          'Petty Cash khusus dicentang — bukti persetujuan wajib diunggah'
        );
      }

      return errors;
    }, [
      travelerName,
      travelerNip,
      travelerPt,
      purpose,
      origin,
      originCustom,
      companyBurdens,
      itinerary,
      participants,
      pettyCash,
      pettyFile,
    ]);

  const preview =
    useMemo(
      () =>
        !itinerary.length ||
        !depDate ||
        !retDate
          ? null
          : computeCost({
              participants:
                allParticipants,
              days,
              itinerary,
              origin,
              tripCategory,
              kpScheme,
              needsDriver,
              totalDistance,
              matrix:
                travelMatrix,
              dkMatrix:
                travelDKMatrix,
              driverIncentive,
            }),
      [
        allParticipants,
        days,
        itinerary,
        origin,
        tripCategory,
        kpScheme,
        needsDriver,
        totalDistance,
        depDate,
        retDate,
        travelMatrix,
        travelDKMatrix,
        driverIncentive,
      ]
    );

  const pettyPreview =
    useMemo(
      () =>
        computePettyCash(
          allParticipants,
          itinerary,
          travelMatrix
        ),
      [
        allParticipants,
        itinerary,
        travelMatrix,
      ]
    );

  const canSubmit =
    validation.length ===
      0 && !busy;

  const addItinerary =
    () => {
      const last =
        itinerary.at(-1);

      const date =
        last?.end_date ||
        new Date()
          .toISOString()
          .slice(0, 10);

      setItinerary(
        (rows) => [
          ...rows,
          {
            id: uid(),
            start_date:
              date,
            start_time:
              last?.end_time ||
              '08:00',
            end_date:
              date,
            end_time:
              '17:00',
            destination:
              '',
            destination_custom:
              '',
            kpScheme:
              'KP2',
            isWithinCity:
              false,
            isLuarkota:
              false,
            agenda:
              '',
          },
        ]
      );
    };

  const updateItinerary =
    (
      id: string,
      patch: Partial<ItineraryLeg>
    ) =>
      setItinerary(
        (rows) =>
          rows.map(
            (row) => {
              if (
                row.id !== id
              ) {
                return row;
              }

              const next = {
                ...row,
                ...patch,
              };

              next.kpScheme =
                autoKPSchemeForLeg(
                  next.destination,
                  next.kpScheme
                );

              return next;
            }
          )
      );

  const removeItinerary =
    (id: string) =>
      setItinerary(
        (rows) =>
          rows.filter(
            (row) =>
              row.id !== id
          )
      );

  const addParticipant =
    () =>
      setParticipants(
        (rows) => [
          ...rows,
          {
            id: uid(),
            name: '',
            jabatan:
              'Staff',
            grade:
              matrixFromJabatan(
                'Staff'
              ),
            category:
              'Internal',
            pt_unit: '',
          },
        ]
      );

  const updateParticipant =
    (
      id: string,
      patch: Partial<Participant>
    ) =>
      setParticipants(
        (rows) =>
          rows.map(
            (row) => {
              if (
                row.id !== id
              ) {
                return row;
              }

              const next = {
                ...row,
                ...patch,
              };

              if (
                patch.jabatan
              ) {
                next.grade =
                  matrixFromJabatan(
                    patch.jabatan
                  );
              }

              return next;
            }
          )
      );

  const toggleBurden =
    (pt: string) =>
      setCompanyBurdens(
        (rows) =>
          rows.includes(pt)
            ? rows.filter(
                (item) =>
                  item !== pt
              )
            : [
                ...rows,
                pt,
              ]
      );

  const uploadPettyFile =
    async (file: File) => {
      const ext =
        file.name
          .split('.')
          .pop();

      const path =
        `approvals/petty_${
          profile?.id ??
          'user'
        }_${Date.now()}.${ext}`;

      const upload =
        await supabase.storage
          .from(
            'pettycash'
          )
          .upload(
            path,
            file
          );

      if (
        upload.error
      ) {
        throw upload.error;
      }

      return supabase.storage
        .from(
          'pettycash'
        )
        .getPublicUrl(
          path
        ).data.publicUrl;
    };

  const handleSubmit =
    async () => {
      if (!canSubmit) {
        return showToast(
          'error',
          `Form belum lengkap: ${validation.length} catatan perlu diperbaiki`
        );
      }

      setBusy(true);

      try {
        const pettyFileUrl =
          pettyCash &&
          pettyFile
            ? await uploadPettyFile(
                pettyFile
              )
            : null;

        const cost =
          computeCost({
            participants:
              allParticipants,
            days,
            itinerary,
            origin,
            tripCategory,
            kpScheme,
            needsDriver,
            totalDistance,
            matrix:
              travelMatrix,
            dkMatrix:
              travelDKMatrix,
            driverIncentive,
          });

        const initialStatus =
          'Pending Manager Approval';

        /**
         * user_id = account yang melakukan submit
         * requester_* = traveler yang benar-benar melakukan dinas
         */
        const {
          data: inserted,
          error,
        } =
          await supabase
            .from(
              'biz_trips'
            )
            .insert({
              user_id:
                profile?.id,

              requester_name:
                travelerName,

              requester_nip:
                travelerNip,

              requester_jabatan:
                travelerJabatan,

              requester_pt:
                travelerPt,

              origin,

              origin_custom:
                origin ===
                'Others'
                  ? originCustom
                  : null,

              departure_date:
                depDate,

              departure_time:
                depTime,

              return_date:
                retDate,

              return_time:
                retTime,

              total_days:
                days,

              purpose,

              needs_vehicle:
                needsVehicle ===
                'Kendaraan Dinas',

              vehicle_type_choice:
                needsVehicle,

              needs_driver:
                needsDriver,

              total_distance:
                totalDistance,

              company_burden:
                companyBurdens,

              trip_category:
                tripCategory,

              itinerary,

              participants:
                allParticipants,

              petty_cash_requested:
                pettyCash,

              petty_cash_holder:
                pettyPreview.holder,

              petty_cash_approval_file:
                pettyFileUrl,

              kp_scheme:
                kpScheme,

              cost_grand_total:
                cost.grandTotal,

              fuel_cost: 0,
              etoll_cost: 0,

              employee_remarks:
                employeeRemarks ||
                null,

              status:
                initialStatus,
            })
            .select()
            .maybeSingle();

        if (error) {
          throw error;
        }

        if (inserted) {
          await supabase
            .from(
              'trip_tracking'
            )
            .insert({
              trip_id:
                inserted.id,

              actor_name:
                profile?.name ??
                '',

              actor_role:
                profile?.role ??
                '',

              action:
                requestFor ===
                'self'
                  ? 'Trip request submitted'
                  : 'Trip request submitted on behalf of employee',

              from_status:
                null,

              to_status:
                initialStatus,

              remarks:
                requestFor ===
                'self'
                  ? `Traveler: ${travelerName}`
                  : `Submitted by ${profile?.name ?? '-'} for traveler ${travelerName} · ${travelerJabatan} · ${travelerPt}`,
            });
        }

        showToast(
          'success',
          'Trip request submitted successfully'
        );

        await refresh();

        onDone();
      } catch (
        error: any
      ) {
        showToast(
          'error',
          `Gagal submit: ${error.message}`
        );
      } finally {
        setBusy(false);
      }
    };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <FilePlus className="w-5 h-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            New Trip Request
          </h2>

          <p className="text-sm text-slate-500">
            Isi formulir perjalanan dinas dengan lengkap
          </p>
        </div>
      </div>

      {validation.length >
        0 && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-4">
          <div className="flex gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />

            <div>
              <div className="text-sm font-bold text-amber-800">
                Submit Shield —{' '}
                {
                  validation.length
                }{' '}
                catatan
              </div>

              <ul className="mt-1 text-xs text-amber-700 space-y-0.5">
                {validation
                  .slice(
                    0,
                    8
                  )
                  .map(
                    (
                      item,
                      index
                    ) => (
                      <li
                        key={
                          index
                        }
                      >
                        •{' '}
                        {item}
                      </li>
                    )
                  )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SUBMITTER */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <UserRound className="w-4 h-4" />
          Pengajuan Perjalanan
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Submitted By">
            <Input
              value={
                profile?.name ??
                ''
              }
              disabled
            />
          </Field>

          <Field label="Pengajuan Untuk">
            <Select
              value={
                requestFor
              }
              onChange={(
                event
              ) =>
                switchRequestFor(
                  event.target
                    .value as RequestFor
                )
              }
            >
              <option value="self">
                Saya sendiri
              </option>

              <option value="other">
                Pegawai lain
              </option>
            </Select>
          </Field>
        </div>

        <div className="text-[11px] text-slate-500">
          Akun yang login bertindak sebagai pengaju. Traveler di bawah adalah pegawai yang benar-benar melakukan perjalanan dinas.
        </div>
      </Card>

      {/* TRAVELER */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Users className="w-4 h-4" />
          Traveler Utama
        </h3>

        <div className="grid md:grid-cols-4 gap-4">
          <Field
            label="Nama"
            required
          >
            <Input
              value={
                travelerName
              }
              disabled={
                requestFor ===
                'self'
              }
              onChange={(
                event
              ) =>
                setTravelerName(
                  event.target
                    .value
                )
              }
            />
          </Field>

          <Field
            label="NIP"
            required
          >
            <Input
              value={
                travelerNip
              }
              disabled={
                requestFor ===
                'self'
              }
              onChange={(
                event
              ) =>
                setTravelerNip(
                  event.target
                    .value
                )
              }
            />
          </Field>

          <Field
            label="PT"
            required
          >
            <Select
              value={
                travelerPt
              }
              disabled={
                requestFor ===
                'self'
              }
              onChange={(
                event
              ) =>
                setTravelerPt(
                  event.target
                    .value
                )
              }
            >
              <option value="">
                Pilih PT...
              </option>

              {ptOptions.map(
                (pt) => (
                  <option
                    key={
                      pt
                    }
                  >
                    {pt}
                  </option>
                )
              )}
            </Select>
          </Field>

          <Field
            label="Jabatan"
            required
          >
            <Select
              value={
                travelerJabatan
              }
              disabled={
                requestFor ===
                'self'
              }
              onChange={(
                event
              ) =>
                setTravelerJabatan(
                  event.target
                    .value as Jabatan
                )
              }
            >
              {JABATAN_OPTIONS.map(
                (
                  jabatan
                ) => (
                  <option
                    key={
                      jabatan
                    }
                  >
                    {
                      jabatan
                    }
                  </option>
                )
              )}
            </Select>
          </Field>
        </div>

        <div className="text-[11px] text-slate-500">
          Jabatan otomatis menentukan skema tunjangan perjalanan. Driver tidak dapat dipilih sebagai traveler/partisipan karena ditentukan melalui PIC Obligo.
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <Field label="Transportasi">
            <Select
              value={
                needsVehicle
              }
              onChange={(
                event
              ) =>
                setNeedsVehicle(
                  event.target
                    .value as TransportChoice
                )
              }
            >
              {TRANSPORT_CHOICES.map(
                (
                  item
                ) => (
                  <option
                    key={
                      item
                    }
                  >
                    {
                      item
                    }
                  </option>
                )
              )}
            </Select>
          </Field>

          <Field label="Butuh Driver?">
            <Select
              value={
                needsDriver
                  ? 'ya'
                  : 'tidak'
              }
              onChange={(
                event
              ) =>
                setNeedsDriver(
                  event.target
                    .value ===
                    'ya'
                )
              }
            >
              <option value="tidak">
                Tidak
              </option>

              <option value="ya">
                Ya
              </option>
            </Select>
          </Field>

          <Field label="Total Distance">
            <Select
              value={
                totalDistance
              }
              onChange={(
                event
              ) =>
                setTotalDistance(
                  event.target
                    .value as TotalDistanceOption
                )
              }
            >
              <option value="none">
                Kurang dari 200 km
              </option>

              <option value="gt200">
                &gt; 200 km
              </option>

              <option value="gt400">
                &gt; 400 km
              </option>
            </Select>
          </Field>

          <Field
            label="Tujuan Perjalanan"
            required
          >
            <Input
              value={
                purpose
              }
              onChange={(
                event
              ) =>
                setPurpose(
                  event.target
                    .value
                )
              }
            />
          </Field>
        </div>

        <Field label="Remarks / Catatan Khusus">
          <Textarea
            rows={2}
            value={
              employeeRemarks
            }
            onChange={(
              event
            ) =>
              setEmployeeRemarks(
                event.target
                  .value
              )
            }
          />
        </Field>

        {depDate && (
          <div className="text-xs bg-slate-50 p-3 rounded-xl flex justify-between">
            <span className="flex gap-1">
              <Calendar className="w-4 h-4" />

              {depDate}{' '}
              {depTime}{' '}
              s.d.{' '}
              {retDate}{' '}
              {retTime}
            </span>

            <strong>
              {days} hari
            </strong>
          </div>
        )}
      </Card>

      {/* ORIGIN & COST CENTER */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Lokasi Asal & Beban Biaya
        </h3>

        <Field label="Origin">
          <Select
            value={
              origin
            }
            onChange={(
              event
            ) =>
              setOrigin(
                event.target
                  .value
              )
            }
          >
            {ORIGINS.map(
              (
                item
              ) => (
                <option
                  key={
                    item
                  }
                >
                  {
                    item
                  }
                </option>
              )
            )}
          </Select>
        </Field>

        {origin ===
          'Others' && (
          <Field label="Nama Origin">
            <Input
              value={
                originCustom
              }
              onChange={(
                event
              ) =>
                setOriginCustom(
                  event.target
                    .value
                )
              }
            />
          </Field>
        )}

        <div>
          <div className="text-xs font-semibold mb-2">
            PT Beban Biaya
          </div>

          <div className="flex flex-wrap gap-2">
            {activePTMaster.map(
              (
                row
              ) => (
                <button
                  type="button"
                  key={
                    row.id
                  }
                  onClick={() =>
                    toggleBurden(
                      row.name
                    )
                  }
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-semibold ring-1',
                    companyBurdens.includes(
                      row.name
                    )
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white ring-slate-200'
                  )}
                >
                  {
                    row.name
                  }
                </button>
              )
            )}
          </div>
        </div>
      </Card>

      {/* ITINERARY */}
      <Card className="p-6 space-y-4">
        <div className="flex justify-between">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Itinerary
            </h3>

            <p className="text-[11px] text-slate-400">
              Tanggal perjalanan dihitung dari itinerary.
            </p>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={
              <Plus className="w-3.5 h-3.5" />
            }
            onClick={
              addItinerary
            }
          >
            Add Row
          </Button>
        </div>

        {!itinerary.length ? (
          <EmptyState title="Belum ada itinerary" />
        ) : (
          <div className="space-y-3">
            {itinerary.map(
              (
                leg,
                index
              ) => {
                const tiers =
                  dkTiersForOrigin(
                    origin
                  );

                return (
                  <div
                    key={
                      leg.id
                    }
                    className="rounded-xl ring-1 ring-slate-200 p-4 space-y-3"
                  >
                    <div className="flex justify-between">
                      <span className="text-xs font-bold flex gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Leg{' '}
                        {index +
                          1}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeItinerary(
                            leg.id
                          )
                        }
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </button>
                    </div>

                    <div className="grid md:grid-cols-4 gap-3">
                      <Input
                        type="date"
                        value={
                          leg.start_date
                        }
                        onChange={(
                          event
                        ) =>
                          updateItinerary(
                            leg.id,
                            {
                              start_date:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />

                      <Input
                        type="time"
                        value={
                          leg.start_time
                        }
                        onChange={(
                          event
                        ) =>
                          updateItinerary(
                            leg.id,
                            {
                              start_time:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />

                      <Input
                        type="date"
                        value={
                          leg.end_date
                        }
                        onChange={(
                          event
                        ) =>
                          updateItinerary(
                            leg.id,
                            {
                              end_date:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />

                      <Input
                        type="time"
                        value={
                          leg.end_time
                        }
                        onChange={(
                          event
                        ) =>
                          updateItinerary(
                            leg.id,
                            {
                              end_time:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <Select
                        value={
                          leg.destination
                        }
                        onChange={(
                          event
                        ) => {
                          const destination =
                            event
                              .target
                              .value;

                          updateItinerary(
                            leg.id,
                            {
                              destination,
                              isWithinCity:
                                destination ===
                                'Dalam Kota',
                              isLuarkota:
                                destination ===
                                'Luar Kota',
                            }
                          );
                        }}
                      >
                        <option value="">
                          Pilih lokasi...
                        </option>

                        {DESTINATION_OPTIONS.map(
                          (
                            item
                          ) => (
                            <option
                              key={
                                item
                              }
                            >
                              {
                                item
                              }
                            </option>
                          )
                        )}
                      </Select>

                      {(
                        leg.destination ===
                          'Others' ||
                        leg.destination ===
                          'Luar Kota' ||
                        leg.destination ===
                          'Dalam Kota'
                      ) && (
                        <Input
                          value={
                            leg.destination_custom ??
                            ''
                          }
                          onChange={(
                            event
                          ) =>
                            updateItinerary(
                              leg.id,
                              {
                                destination_custom:
                                  event
                                    .target
                                    .value,
                              }
                            )
                          }
                          placeholder="Nama lokasi/kota"
                        />
                      )}
                    </div>

                    {leg.isWithinCity && (
                      <Select
                        value={
                          leg.dkTier ??
                          ''
                        }
                        onChange={(
                          event
                        ) =>
                          updateItinerary(
                            leg.id,
                            {
                              dkTier:
                                event
                                  .target
                                  .value as DKTier,
                            }
                          )
                        }
                      >
                        <option value="">
                          Pilih tier DK...
                        </option>

                        {tiers.map(
                          (
                            tier
                          ) => (
                            <option
                              key={
                                tier.key
                              }
                              value={
                                tier.key
                              }
                            >
                              {
                                tier.label
                              }
                            </option>
                          )
                        )}
                      </Select>
                    )}

                    <Input
                      value={
                        leg.agenda
                      }
                      onChange={(
                        event
                      ) =>
                        updateItinerary(
                          leg.id,
                          {
                            agenda:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      placeholder="Agenda"
                    />
                  </div>
                );
              }
            )}
          </div>
        )}
      </Card>

      {/* PARTICIPANTS */}
      <Card className="p-6 space-y-4">
        <div className="flex justify-between">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Partisipan Tambahan
            </h3>

            <p className="text-[11px] text-slate-400">
              Pilih jabatan sebenarnya. Skema benefit dihitung otomatis. Driver tidak ditambahkan sebagai partisipan.
            </p>
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={
              <Plus className="w-3.5 h-3.5" />
            }
            onClick={
              addParticipant
            }
          >
            Add Row
          </Button>
        </div>

        {participants.map(
          (
            participant,
            index
          ) => {
            const category: ParticipantCategory =
              participant.category ??
              'Internal';

            return (
              <div
                key={
                  participant.id
                }
                className="grid md:grid-cols-[40px_120px_1fr_160px_180px_40px] gap-2 items-center border rounded-xl p-3"
              >
                <span>
                  {index + 1}.
                </span>

                <Select
                  value={
                    category
                  }
                  onChange={(
                    event
                  ) =>
                    updateParticipant(
                      participant.id,
                      {
                        category:
                          event
                            .target
                            .value as ParticipantCategory,
                      }
                    )
                  }
                >
                  <option>
                    Internal
                  </option>

                  <option>
                    Eksternal
                  </option>
                </Select>

                <Input
                  value={
                    participant.name
                  }
                  onChange={(
                    event
                  ) =>
                    updateParticipant(
                      participant.id,
                      {
                        name:
                          event
                            .target
                            .value,
                      }
                    )
                  }
                  placeholder="Nama"
                />

                {category ===
                'Internal' ? (
                  <>
                    <Select
                      value={
                        participant.pt_unit ??
                        ''
                      }
                      onChange={(
                        event
                      ) =>
                        updateParticipant(
                          participant.id,
                          {
                            pt_unit:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                    >
                      <option value="">
                        PT...
                      </option>

                      {ptOptions.map(
                        (
                          pt
                        ) => (
                          <option
                            key={
                              pt
                            }
                          >
                            {
                              pt
                            }
                          </option>
                        )
                      )}
                    </Select>

                    <Select
                      value={
                        participant.jabatan
                      }
                      onChange={(
                        event
                      ) =>
                        updateParticipant(
                          participant.id,
                          {
                            jabatan:
                              event
                                .target
                                .value as Jabatan,
                          }
                        )
                      }
                    >
                      {JABATAN_OPTIONS.map(
                        (
                          jabatan
                        ) => (
                          <option
                            key={
                              jabatan
                            }
                          >
                            {
                              jabatan
                            }
                          </option>
                        )
                      )}
                    </Select>
                  </>
                ) : (
                  <Input
                    className="md:col-span-2"
                    value={
                      participant.keterangan ??
                      ''
                    }
                    onChange={(
                      event
                    ) =>
                      updateParticipant(
                        participant.id,
                        {
                          keterangan:
                            event
                              .target
                              .value,
                        }
                      )
                    }
                    placeholder="Vendor / Klien / Mitra"
                  />
                )}

                <button
                  type="button"
                  onClick={() =>
                    setParticipants(
                      (
                        rows
                      ) =>
                        rows.filter(
                          (
                            row
                          ) =>
                            row.id !==
                            participant.id
                        )
                    )
                  }
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            );
          }
        )}
      </Card>

      {/* PETTY CASH */}
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold flex gap-2">
          <Calculator className="w-4 h-4" />
          Petty Cash Khusus
        </h3>

        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={
              pettyCash
            }
            onChange={(
              event
            ) =>
              setPettyCash(
                event.target
                  .checked
              )
            }
          />

          Ajukan Petty Cash Khusus
        </label>

        {pettyCash && (
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(
              event
            ) =>
              setPettyFile(
                event.target
                  .files?.[0] ??
                  null
              )
            }
          />
        )}

        {pettyFile && (
          <div className="text-xs flex gap-1">
            <Paperclip className="w-3 h-3" />
            {
              pettyFile.name
            }
          </div>
        )}
      </Card>

      {/* PREVIEW */}
      {preview && (
        <Card className="p-6 space-y-3">
          <h3 className="text-sm font-bold">
            Estimasi Awal
          </h3>

          {preview.perParticipant.map(
            (
              participant
            ) => (
              <div
                key={`${participant.name}-${participant.jabatan}`}
                className="rounded-xl bg-slate-50 p-3 flex justify-between"
              >
                <div>
                  <strong>
                    {
                      participant.name
                    }
                  </strong>

                  <div className="text-xs text-slate-500">
                    {
                      participant.jabatan
                    }{' '}
                    ·{' '}
                    {
                      participant.breakdown
                    }
                  </div>
                </div>

                <strong>
                  {formatIDR(
                    participant.total +
                      participant.hotel +
                      participant.pettyCash
                  )}
                </strong>
              </div>
            )
          )}

          <div className="border-t pt-3 flex justify-between">
            <strong>
              Total Estimasi
            </strong>

            <strong>
              {formatIDR(
                preview.grandTotal
              )}
            </strong>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3 pb-6">
        <Button
          variant="secondary"
          onClick={
            onDone
          }
        >
          Cancel
        </Button>

        <Button
          disabled={
            !canSubmit
          }
          icon={
            <Send className="w-4 h-4" />
          }
          onClick={
            handleSubmit
          }
        >
          {busy
            ? 'Submitting...'
            : 'Submit Request'}
        </Button>
      </div>
    </div>
  );
}
