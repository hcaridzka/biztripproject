import {
  Building2,
  Printer,
  X,
} from 'lucide-react';

import { useApp } from '../context/AppContext';

import {
  Button,
  formatIDR,
} from './ui-shared';

import {
  formatDate,
  daysBetween,
} from '../lib/utils';

// =========================================================
// PDF PRINT
// =========================================================

export function PdfPrint({
  tripId,
  mode,
  onClose,
}: {
  tripId: string | null;
  mode: 'advance' | 'settlement';
  onClose: () => void;
}) {
  const {
    trips,
    disburseRows,
    settlementClaimRows,
  } = useApp();

  if (!tripId) {
    return null;
  }

  const trip =
    trips.find(
      (item) =>
        item.id === tripId
    );

  if (!trip) {
    return null;
  }

  // =======================================================
  // BASE DATA
  // =======================================================

  const days =
    daysBetween(
      trip.departure_date,
      trip.return_date
    );

  const costCenterRows =
    disburseRows.filter(
      (row) =>
        row.trip_id ===
        trip.id
    );

  const settlementRows =
    settlementClaimRows.filter(
      (row) =>
        row.trip_id ===
        trip.id
    );

  const costData =
    trip.cost_data ?? {};

  // =======================================================
  // ADVANCE
  // =======================================================

  const advanceTotal =
    Number(
      trip.cost_grand_total
    ) || 0;

  const allowanceTotal =
    Number(
      costData
        ?.totals
        ?.allowance
    ) || 0;

  const accommodationTotal =
    Number(
      costData
        ?.totals
        ?.accommodation
    ) || 0;

  const driverCost =
    Number(
      costData
        ?.totals
        ?.driverCost ??
      costData
        ?.totals
        ?.driverIncentive ??
      costData
        ?.assignedDriverCost ??
      costData
        ?.externalDriverIncentive
    ) || 0;

  const pettyCashTotal =
    Number(
      costData
        ?.totals
        ?.pettyCash
    ) || 0;

  const fuelTotal =
    Number(
      costData
        ?.totals
        ?.fuel ??
      trip.fuel_cost
    ) || 0;

  const etollTotal =
    Number(
      costData
        ?.totals
        ?.etoll ??
      trip.etoll_cost
    ) || 0;

  const assignedDriverName =
    costData
      ?.assignedDriverName ??
    trip.obligo_driver_name ??
    null;

  // =======================================================
  // SETTLEMENT
  // =======================================================

  /*
   * Non-accountable:
   * - Tunjangan perjalanan
   * - Tunjangan & insentif driver
   *
   * Tidak menjadi basis refund/reimbursement.
   */
  const nonAccountable =
    Number(
      costData
        ?.nonAccountable
        ?.total
    ) || 0;

  /*
   * Accountable:
   * - Akomodasi
   * - Pettycash
   * - BBM
   * - E-Toll
   *
   * Ini yang dibandingkan dengan
   * actual approved pada settlement.
   */
  const accountableAdvance =
    Number(
      costData
        ?.accountable
        ?.total
    ) || 0;

  const actualClaimed =
    Number(
      trip.realization_total
    ) || 0;

  const actualApproved =
    Number(
      trip.approved_total
    ) || 0;

  /*
   * HARUS sama dengan SettlementReview.
   */
  const settlementDiff =
    actualApproved -
    accountableAdvance;

  const settlementCategory =
    settlementDiff > 0
      ? 'REIMBURSEMENT'
      : settlementDiff < 0
        ? 'REFUND'
        : 'SETTLED';

  const settlementAmount =
    Math.abs(
      settlementDiff
    );

  // =======================================================
  // PRINT
  // =======================================================

  const handlePrint =
    () => {
      window.print();
    };

  return (
    <div
      className="
        fixed inset-0 z-50
        bg-slate-900/50
        flex items-center justify-center
        p-4
        animate-fade-in
      "
      onClick={onClose}
    >
      <div
        className="
          bg-white
          rounded-2xl
          shadow-2xl
          max-w-4xl
          w-full
          max-h-[95vh]
          overflow-y-auto
        "
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        {/* =================================================
            MODAL HEADER
        ================================================= */}

        <div
          className="
            no-print
            flex items-center
            justify-between
            px-6 py-3
            border-b
            border-slate-100
            sticky top-0
            bg-white
            z-10
          "
        >
          <h3
            className="
              text-sm
              font-bold
              text-slate-800
            "
          >
            {mode === 'advance'
              ? 'Cetak PDF Surat Perintah Perjalanan Dinas (SPD)'
              : 'Cetak PDF Laporan & Settlement SPD'}
          </h3>

          <div
            className="
              flex gap-2
            "
          >
            <Button
              size="sm"
              variant="secondary"
              icon={
                <Printer
                  className="
                    w-3.5 h-3.5
                  "
                />
              }
              onClick={
                handlePrint
              }
            >
              Print / Save PDF
            </Button>

            <button
              onClick={onClose}
              className="
                text-slate-400
                hover:text-slate-600
              "
            >
              <X
                className="
                  w-5 h-5
                "
              />
            </button>
          </div>
        </div>

        {/* =================================================
            PRINT AREA
        ================================================= */}

        <div
          className="
            p-8
            print:p-0
          "
          id="print-area"
        >
          {/* =================================================
              OFFICIAL HEADER
          ================================================= */}

          <div
            className="
              flex items-center
              gap-4
              pb-4
              border-b-2
              border-brand-600
            "
          >
            <div
              className="
                w-14 h-14
                rounded-2xl
                bg-gradient-to-br
                from-brand-600
                to-brand-800
                flex items-center
                justify-center
                text-white
              "
            >
              <Building2
                className="
                  w-7 h-7
                "
              />
            </div>

            <div>
              <div
                className="
                  text-lg
                  font-bold
                  text-slate-900
                "
              >
                ARIDZKA GROUP
              </div>

              <div
                className="
                  text-xs
                  text-slate-500
                "
              >
                Business Trip Management System
              </div>
            </div>
          </div>

          <div
            className="
              mt-4
              text-xs
              text-slate-400
            "
          >
            Pegawai Pemohon:{' '}
            <strong>
              {trip.requester_name}
            </strong>
          </div>

          {/* =================================================
              ADVANCE / SPD
          ================================================= */}

          {mode === 'advance' ? (
            <>
              <div
                className="
                  mt-6
                  text-center
                "
              >
                <h1
                  className="
                    text-xl
                    font-bold
                    text-slate-900
                  "
                >
                  SURAT PERINTAH
                  PERJALANAN DINAS
                  (SPD)
                </h1>

                <p
                  className="
                    text-sm
                    text-slate-500
                    mt-1
                  "
                >
                  Request & Advance Biaya
                </p>
              </div>

              <div
                className="
                  mt-4
                  text-xs
                  text-slate-500
                "
              >
                Nomor SPD:{' '}
                <strong>
                  {trip.spd_number ??
                    '-'}
                </strong>
              </div>

              {/* =============================================
                  BASIC INFORMATION
              ============================================= */}

              <div
                className="
                  mt-4
                  grid grid-cols-2
                  gap-3
                  text-sm
                "
              >
                <Info
                  label="Nama Pegawai"
                  value={
                    trip.requester_name
                  }
                />

                <Info
                  label="Jabatan"
                  value={
                    trip.requester_jabatan
                  }
                />

                <Info
                  label="PT Utama"
                  value={
                    trip
                      .company_burden
                      ?.[0] ??
                    '-'
                  }
                />

                <Info
                  label="Durasi"
                  value={`${days} hari`}
                />

                <Info
                  label="Berangkat"
                  value={
                    formatDate(
                      trip.departure_date
                    )
                  }
                />

                <Info
                  label="Pulang"
                  value={
                    formatDate(
                      trip.return_date
                    )
                  }
                />

                {assignedDriverName && (
                  <Info
                    label="Driver"
                    value={
                      assignedDriverName
                    }
                  />
                )}

                {trip.obligo_vehicle_plate && (
                  <Info
                    label="Kendaraan"
                    value={
                      trip.obligo_vehicle_plate
                    }
                  />
                )}
              </div>

              {/* =============================================
                  ITINERARY
              ============================================= */}

              <SectionTitle>
                Itinerary
              </SectionTitle>

              <table
                className="
                  w-full
                  text-xs
                  border
                  border-slate-200
                "
              >
                <thead
                  className="
                    bg-slate-50
                  "
                >
                  <tr>
                    <TH>
                      No
                    </TH>

                    <TH>
                      Tujuan
                    </TH>

                    <TH>
                      Tanggal
                    </TH>

                    <TH>
                      Agenda
                    </TH>
                  </tr>
                </thead>

                <tbody>
                  {trip.itinerary?.map(
                    (
                      leg,
                      index
                    ) => (
                      <tr
                        key={
                          index
                        }
                      >
                        <TD>
                          {index +
                            1}
                        </TD>

                        <TD>
                          {
                            leg.destination
                          }

                          {leg.destination_custom
                            ? ` (${leg.destination_custom})`
                            : ''}
                        </TD>

                        <TD>
                          {formatDate(
                            leg.start_date
                          )}
                          {' - '}
                          {formatDate(
                            leg.end_date
                          )}
                        </TD>

                        <TD>
                          {leg.agenda}
                        </TD>
                      </tr>
                    )
                  )}
                </tbody>
              </table>

              {/* =============================================
                  TABLE A - COST SUMMARY
              ============================================= */}

              <SectionTitle>
                Rincian Biaya Advance
              </SectionTitle>

              <table
                className="
                  w-full
                  text-xs
                  border
                  border-slate-200
                "
              >
                <thead
                  className="
                    bg-slate-50
                  "
                >
                  <tr>
                    <TH>
                      Komponen Biaya
                    </TH>

                    <THRight>
                      Nominal
                    </THRight>
                  </tr>
                </thead>

                <tbody>
                  {costData
                    ?.perParticipant
                    ?.map(
                      (
                        participant: any,
                        index: number
                      ) => (
                        <tr
                          key={
                            `allowance-${index}`
                          }
                        >
                          <TD>
                            Tunjangan
                            Perjalanan —{' '}
                            {
                              participant.name
                            }{' '}
                            (
                            {
                              participant.jabatan
                            }
                            )
                          </TD>

                          <TDRight>
                            {formatIDR(
                              Number(
                                participant.total
                              ) ||
                                0
                            )}
                          </TDRight>
                        </tr>
                      )
                    )}

                  {accommodationTotal >
                    0 && (
                    <tr>
                      <TD>
                        Akomodasi
                      </TD>

                      <TDRight>
                        {formatIDR(
                          accommodationTotal
                        )}
                      </TDRight>
                    </tr>
                  )}

                  {pettyCashTotal >
                    0 && (
                    <tr>
                      <TD>
                        Pettycash
                      </TD>

                      <TDRight>
                        {formatIDR(
                          pettyCashTotal
                        )}
                      </TDRight>
                    </tr>
                  )}

                  {driverCost >
                    0 && (
                    <tr>
                      <TD>
                        Tunjangan &
                        Insentif Driver
                        {assignedDriverName
                          ? ` — ${assignedDriverName}`
                          : ''}
                      </TD>

                      <TDRight>
                        {formatIDR(
                          driverCost
                        )}
                      </TDRight>
                    </tr>
                  )}

                  {fuelTotal >
                    0 && (
                    <tr>
                      <TD>
                        BBM
                      </TD>

                      <TDRight>
                        {formatIDR(
                          fuelTotal
                        )}
                      </TDRight>
                    </tr>
                  )}

                  {etollTotal >
                    0 && (
                    <tr>
                      <TD>
                        E-Toll
                      </TD>

                      <TDRight>
                        {formatIDR(
                          etollTotal
                        )}
                      </TDRight>
                    </tr>
                  )}

                  <tr
                    className="
                      bg-brand-50
                      font-bold
                    "
                  >
                    <TD>
                      GRAND TOTAL
                      ADVANCE
                    </TD>

                    <TDRight>
                      {formatIDR(
                        advanceTotal
                      )}
                    </TDRight>
                  </tr>
                </tbody>
              </table>

              {/* =============================================
                  TABLE B - COST CENTER
              ============================================= */}

              <SectionTitle>
                Alokasi Cost Center
              </SectionTitle>

              <p
                className="
                  text-[11px]
                  text-slate-500
                  mb-2
                "
              >
                Tabel ini merupakan
                alokasi pembebanan dari
                Grand Total Advance di
                atas dan bukan biaya
                tambahan.
              </p>

              <table
                className="
                  w-full
                  text-xs
                  border
                  border-slate-200
                "
              >
                <thead
                  className="
                    bg-slate-50
                  "
                >
                  <tr>
                    <TH>
                      Nama
                    </TH>

                    <TH>
                      Komponen
                    </TH>

                    <TH>
                      Beban PT
                    </TH>

                    <THRight>
                      Nominal
                    </THRight>
                  </tr>
                </thead>

                <tbody>
                  {costCenterRows.length >
                  0 ? (
                    costCenterRows.map(
                      (row) => (
                        <tr
                          key={
                            row.id
                          }
                        >
                          <TD>
                            {row.name}
                          </TD>

                          <TD>
                            {row.component_note ||
                              '-'}
                          </TD>

                          <TD>
                            {row.pt_burden ||
                              '-'}
                          </TD>

                          <TDRight>
                            {formatIDR(
                              Number(
                                row.nominal
                              ) ||
                                0
                            )}
                          </TDRight>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="
                          py-4
                          px-3
                          text-center
                          text-slate-400
                          border
                          border-slate-200
                        "
                      >
                        Belum ada alokasi
                        cost center.
                      </td>
                    </tr>
                  )}

                  <tr
                    className="
                      bg-slate-50
                      font-bold
                    "
                  >
                    <td
                      colSpan={3}
                      className="
                        py-2
                        px-3
                        border
                        border-slate-200
                      "
                    >
                      TOTAL ALOKASI
                    </td>

                    <TDRight>
                      {formatIDR(
                        costCenterRows.reduce(
                          (
                            sum,
                            row
                          ) =>
                            sum +
                            (
                              Number(
                                row.nominal
                              ) ||
                              0
                            ),
                          0
                        )
                      )}
                    </TDRight>
                  </tr>
                </tbody>
              </table>

              {/* =============================================
                  APPROVAL
              ============================================= */}

              <div
                className="
                  mt-6
                  rounded-xl
                  bg-slate-50
                  ring-1
                  ring-slate-200
                  px-5 py-4
                  text-xs
                  text-slate-700
                  space-y-1
                "
              >
                <div
                  className="
                    font-bold
                    text-sm
                    text-slate-800
                    mb-1
                  "
                >
                  Status Persetujuan
                </div>

                <div>
                  Status:{' '}
                  {trip.status}
                </div>

                <div>
                  Tanggal Pengajuan:{' '}
                  {formatDate(
                    trip.submitted_at
                  )}
                </div>

                <div>
                  Tanggal Disetujui:{' '}
                  {formatDate(
                    trip.approved_at
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* =================================================
                  SETTLEMENT
              ================================================= */}

              <div
                className="
                  mt-6
                  text-center
                "
              >
                <h1
                  className="
                    text-xl
                    font-bold
                    text-slate-900
                  "
                >
                  LAPORAN HASIL &
                  SETTLEMENT SPD
                </h1>

                <p
                  className="
                    text-sm
                    text-slate-500
                    mt-1
                  "
                >
                  Pertanggungjawaban
                  Pengeluaran & Hasil
                  Perjalanan Dinas
                </p>
              </div>

              <div
                className="
                  mt-4
                  text-xs
                  text-slate-500
                "
              >
                Nomor Laporan:{' '}
                <strong>
                  {trip.settlement_number ??
                    `Lap ${
                      trip.spd_number ??
                      '-'
                    }`}
                </strong>
              </div>

              {/* =============================================
                  WORK RESULT
              ============================================= */}

              <div
                className="
                  mt-4
                  rounded-xl
                  bg-slate-50
                  p-4
                "
              >
                <div
                  className="
                    text-xs
                    font-semibold
                    text-slate-500
                    mb-1
                  "
                >
                  Laporan Hasil
                  Pekerjaan
                </div>

                <p
                  className="
                    text-sm
                    text-slate-700
                    whitespace-pre-wrap
                  "
                >
                  {trip.work_result ??
                    '-'}
                </p>
              </div>

              {/* =============================================
                  SETTLEMENT SUMMARY
              ============================================= */}

              <SectionTitle>
                Ringkasan Settlement
              </SectionTitle>

              <table
                className="
                  w-full
                  text-xs
                  border
                  border-slate-200
                "
              >
                <thead
                  className="
                    bg-slate-50
                  "
                >
                  <tr>
                    <TH>
                      Komponen
                    </TH>

                    <THRight>
                      Nominal
                    </THRight>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <TD>
                      Total Advance
                    </TD>

                    <TDRight>
                      {formatIDR(
                        advanceTotal
                      )}
                    </TDRight>
                  </tr>

                  <tr>
                    <TD>
                      Non-Accountable
                      Advance
                    </TD>

                    <TDRight>
                      {formatIDR(
                        nonAccountable
                      )}
                    </TDRight>
                  </tr>

                  <tr>
                    <TD>
                      Accountable
                      Advance
                    </TD>

                    <TDRight>
                      {formatIDR(
                        accountableAdvance
                      )}
                    </TDRight>
                  </tr>

                  <tr>
                    <TD>
                      Actual Claimed
                    </TD>

                    <TDRight>
                      {formatIDR(
                        actualClaimed
                      )}
                    </TDRight>
                  </tr>

                  <tr>
                    <TD>
                      Actual Approved
                    </TD>

                    <TDRight>
                      {formatIDR(
                        actualApproved
                      )}
                    </TDRight>
                  </tr>

                  <tr
                    className="
                      bg-brand-50
                      font-bold
                    "
                  >
                    <TD>
                      {settlementCategory}
                    </TD>

                    <TDRight>
                      {formatIDR(
                        settlementAmount
                      )}
                    </TDRight>
                  </tr>
                </tbody>
              </table>

              <p
                className="
                  text-[11px]
                  text-slate-500
                  mt-2
                "
              >
                Refund atau reimbursement
                dihitung dari Actual Approved
                dibandingkan dengan Advance
                Accountable. Tunjangan
                perjalanan dan biaya driver
                tidak menjadi basis
                settlement.
              </p>

              {/* =============================================
                  APPROVED ACTUAL COST CENTER
              ============================================= */}

              <SectionTitle>
                Rincian Actual Approved &
                Beban PT
              </SectionTitle>

              <table
                className="
                  w-full
                  text-xs
                  border
                  border-slate-200
                "
              >
                <thead
                  className="
                    bg-slate-50
                  "
                >
                  <tr>
                    <TH>
                      Komponen
                    </TH>

                    <TH>
                      Status
                    </TH>

                    <TH>
                      Beban PT
                    </TH>

                    <THRight>
                      Nominal
                    </THRight>
                  </tr>
                </thead>

                <tbody>
                  {settlementRows.length >
                  0 ? (
                    settlementRows.map(
                      (row) => (
                        <tr
                          key={
                            row.id
                          }
                        >
                          <TD>
                            {row.name}
                          </TD>

                          <TD>
                            {row.claim_status}
                          </TD>

                          <TD>
                            {row.pt_burden ||
                              '-'}
                          </TD>

                          <TDRight>
                            {formatIDR(
                              Number(
                                row.nominal
                              ) ||
                                0
                            )}
                          </TDRight>
                        </tr>
                      )
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="
                          py-4
                          px-3
                          text-center
                          text-slate-400
                          border
                          border-slate-200
                        "
                      >
                        Belum ada actual
                        approved cost.
                      </td>
                    </tr>
                  )}

                  <tr
                    className="
                      bg-slate-50
                      font-bold
                    "
                  >
                    <td
                      colSpan={3}
                      className="
                        py-2
                        px-3
                        border
                        border-slate-200
                      "
                    >
                      TOTAL ACTUAL APPROVED
                    </td>

                    <TDRight>
                      {formatIDR(
                        actualApproved
                      )}
                    </TDRight>
                  </tr>
                </tbody>
              </table>

              {/* =============================================
                  RESULT
              ============================================= */}

              <div
                className="
                  mt-6
                  rounded-xl
                  bg-slate-50
                  ring-1
                  ring-slate-200
                  px-5 py-4
                  text-xs
                  text-slate-700
                  space-y-1
                "
              >
                <div
                  className="
                    font-bold
                    text-sm
                    text-slate-800
                    mb-1
                  "
                >
                  Status Penyelesaian
                </div>

                <div>
                  Status:{' '}
                  {trip.status}
                </div>

                <div>
                  Hasil Settlement:{' '}
                  {trip.settlement_result ??
                    settlementCategory}
                </div>

                <div>
                  Tanggal Pengajuan
                  Settlement:{' '}
                  {formatDate(
                    trip.settlement_submitted_at
                  )}
                </div>

                <div>
                  Tanggal Review HR:{' '}
                  {formatDate(
                    trip.settlement_reviewed_at
                  )}
                </div>
              </div>
            </>
          )}

          {/* =================================================
              FOOTER
          ================================================= */}

          <div
            className="
              mt-6
              text-[10px]
              text-slate-400
              text-center
              pb-4
            "
          >
            Dokumen ini sah secara
            digital. Tidak memerlukan
            tanda tangan manual/basah.
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// HELPERS
// =========================================================

function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="
        mt-6
        mb-2
        text-sm
        font-bold
        text-slate-800
      "
    >
      {children}
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        className="
          text-[10px]
          uppercase
          tracking-wide
          text-slate-400
          font-semibold
        "
      >
        {label}
      </div>

      <div
        className="
          text-sm
          text-slate-700
          font-medium
        "
      >
        {value}
      </div>
    </div>
  );
}

function TH({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th
      className="
        py-2
        px-3
        text-left
        border
        border-slate-200
      "
    >
      {children}
    </th>
  );
}

function THRight({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th
      className="
        py-2
        px-3
        text-right
        border
        border-slate-200
      "
    >
      {children}
    </th>
  );
}

function TD({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td
      className="
        py-2
        px-3
        border
        border-slate-200
      "
    >
      {children}
    </td>
  );
}

function TDRight({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <td
      className="
        py-2
        px-3
        text-right
        border
        border-slate-200
      "
    >
      {children}
    </td>
  );
}
