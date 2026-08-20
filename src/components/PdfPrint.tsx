import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Printer,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  Button,
  formatIDR,
} from './ui-shared';
import {
  daysBetween,
  formatDate,
} from '../lib/utils';
import { supabase } from '../lib/supabase';

const receiptStatusLabel = (
  status?: string
) =>
  status === 'approved'
    ? 'APPROVED'
    : status === 'partial'
      ? 'PARTIAL'
      : status === 'rejected'
        ? 'REJECTED'
        : 'PENDING';

const isImageAttachment = (
  value?: string | null,
  name?: string | null
) =>
  !!value &&
  (
    value.startsWith('data:image/') ||
    /\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(value) ||
    (
      !!name &&
      /\.(png|jpg|jpeg|webp|gif)$/i.test(name)
    )
  );

const isPdfAttachment = (
  value?: string | null,
  name?: string | null
) =>
  !!value &&
  (
    value.startsWith('data:application/pdf') ||
    /\.pdf(\?|$)/i.test(value) ||
    (
      !!name &&
      /\.pdf$/i.test(name)
    )
  );

function splitMovementName(
  value: string
) {
  const [
    name,
    ...componentParts
  ] = String(value || '').split(' — ');

  return {
    name: name || '-',
    component:
      componentParts.join(' — ') || '-',
  };
}

function blobToDataUrl(
  blob: Blob
): Promise<string> {
  return new Promise<string>(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () =>
        resolve(
          String(reader.result)
        );

      reader.onerror = () =>
        reject(
          reader.error ??
            new Error(
              'Gagal membaca attachment'
            )
        );

      reader.readAsDataURL(blob);
    }
  );
}

function getReceiptStoragePath(
  url: string
) {
  const marker =
    '/storage/v1/object/public/receipts/';

  const index =
    url.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return decodeURIComponent(
    url.slice(
      index +
        marker.length
    )
  );
}

async function urlToDataUrl(
  url: string
): Promise<string> {
  if (url.startsWith('data:')) {
    return url;
  }

  /**
   * SettlementForm menyimpan public URL Supabase.
   * Untuk print, download langsung dari Storage lebih
   * reliable daripada mengandalkan browser/CORS URL publik.
   */
  const storagePath =
    getReceiptStoragePath(url);

  if (storagePath) {
    const {
      data,
      error,
    } = await supabase.storage
      .from('receipts')
      .download(storagePath);

    if (!error && data) {
      return blobToDataUrl(data);
    }
  }

  /**
   * Fallback untuk URL attachment lama / eksternal.
   */
  const response = await fetch(
    url,
    {
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return blobToDataUrl(
    await response.blob()
  );
}

function formatTrackingDate(
  value?: string | null
) {
  if (!value) return '-';

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return '-';
  }

  return date.toLocaleString(
    'id-ID',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

export function PdfPrint({
  tripId,
  mode,
  onClose,
}: {
  tripId: string | null;
  mode:
    | 'advance'
    | 'settlement';
  onClose: () => void;
}) {
  const {
    trips,
    disburseRows,
    settlementClaimRows,
    settlementReceipts,
  } = useApp();

  const [
    embeddedImages,
    setEmbeddedImages,
  ] = useState<
    Record<string, string>
  >({});

  const [
    attachmentsLoading,
    setAttachmentsLoading,
  ] = useState(false);

  const trip = tripId
    ? trips.find(
        (item) =>
          item.id === tripId
      )
    : undefined;

  const costData: any =
    trip?.cost_data ?? {};

  const advanceRows =
    trip
      ? disburseRows.filter(
          (row) =>
            row.trip_id ===
            trip.id
        )
      : [];

  const settlementRows =
    trip
      ? settlementClaimRows.filter(
          (row) =>
            row.trip_id ===
            trip.id
        )
      : [];

  const receipts =
    useMemo(
      () =>
        trip
          ? settlementReceipts
              .filter(
                (row) =>
                  row.trip_id ===
                    trip.id &&
                  row.category !==
                    'Refund Transfer Proof'
              )
              .sort(
                (a, b) =>
                  (
                    a.created_at ??
                    ''
                  ).localeCompare(
                    b.created_at ??
                      ''
                  )
              )
          : [],
      [
        trip,
        settlementReceipts,
      ]
    );


  useEffect(() => {
    let active = true;

    if (
      mode !==
      'settlement'
    ) {
      setEmbeddedImages({});
      return;
    }

    const imageReceipts =
      receipts.filter(
        (receipt) =>
          receipt.file_base64 &&
          isImageAttachment(
            receipt.file_base64,
            receipt.file_name
          )
      );

    if (
      !imageReceipts.length
    ) {
      setEmbeddedImages({});
      return;
    }

    setAttachmentsLoading(
      true
    );

    Promise.all(
      imageReceipts.map(
        async (receipt) => {
          try {
            const dataUrl =
              await urlToDataUrl(
                receipt.file_base64!
              );

            return [
              receipt.id,
              dataUrl,
            ] as const;
          } catch (error) {
            console.error(
              'Failed to embed settlement attachment',
              receipt.id,
              error
            );

            return [
              receipt.id,
              receipt.file_base64!,
            ] as const;
          }
        }
      )
    )
      .then((pairs) => {
        if (active) {
          setEmbeddedImages(
            Object.fromEntries(
              pairs
            )
          );
        }
      })
      .finally(() => {
        if (active) {
          setAttachmentsLoading(
            false
          );
        }
      });

    return () => {
      active = false;
    };
  }, [
    mode,
    receipts,
  ]);

  if (
    !tripId ||
    !trip
  ) {
    return null;
  }

  const days =
    daysBetween(
      trip.departure_date,
      trip.return_date
    );

  const participants: any[] =
    Array.isArray(
      costData.perParticipant
    )
      ? costData.perParticipant
      : [];

  const advanceTotal =
    Number(
      trip.cost_grand_total
    ) || 0;

  const assignedDriverName =
    costData?.assignedDriverName ??
    trip.obligo_driver_name ??
    null;

  /**
   * Audit trail dibuat compact seperti Timeline di web.
   * Hanya tampil pada dokumen utama, bukan pada lampiran.
   */
  const auditRows = [
    {
      label: 'Submitted',
      actor:
        trip.requester_name,
      date:
        trip.submitted_at,
    },
    {
      label:
        'Manager Approved',
      actor:
        trip.manager_approved_by,
      date:
        trip.manager_approved_at,
    },
    {
      label:
        'PIC Obligo Verified',
      actor:
        trip.obligo_approved_by,
      date:
        trip.obligo_approved_at,
    },
    {
      label:
        'Direksi Approved',
      actor:
        trip.direksi_approved_by,
      date:
        trip.direksi_approved_at,
    },
    {
      label:
        'HR Advance Approved',
      actor: 'HR',
      date:
        trip.approved_at ??
        trip.spd_issued_at,
    },
    ...(mode === 'settlement'
      ? [
          {
            label:
              'Settlement Submitted',
            actor:
              trip.settlement_submitted_by,
            date:
              trip.settlement_submitted_at,
          },
          {
            label:
              'Settlement Reviewed',
            actor:
              trip.settlement_reviewed_by ??
              'HR',
            date:
              trip.settlement_reviewed_at,
          },
          {
            label:
              'Completed',
            actor: '',
            date:
              trip.completed_at,
          },
        ]
      : []),
  ].filter(
    (row) => row.date
  );

  const handlePrint =
    async () => {
      if (attachmentsLoading) {
        return;
      }

      const images =
        Array.from(
          document.querySelectorAll<HTMLImageElement>(
            '#print-area .attachment-image'
          )
        );

      await Promise.all(
        images.map(
          async (image) => {
            try {
              if (
                'decode' in image
              ) {
                await image.decode();
                return;
              }
            } catch {
              // fallback ke load listener di bawah
            }

            if (
              image.complete &&
              image.naturalWidth > 0
            ) {
              return;
            }

            await new Promise<void>(
              (resolve) => {
                const done = () =>
                  resolve();

                image.addEventListener(
                  'load',
                  done,
                  { once: true }
                );

                image.addEventListener(
                  'error',
                  done,
                  { once: true }
                );

                setTimeout(
                  done,
                  5000
                );
              }
            );
          }
        )
      );

      /**
       * Beri browser satu frame untuk paint seluruh
       * lampiran sebelum membuka native print dialog.
       */
      await new Promise<void>(
        (resolve) =>
          requestAnimationFrame(
            () =>
              requestAnimationFrame(
                () => resolve()
              )
          )
      );

      window.print();
    };

  return (
    <div
      className="print-modal-root fixed inset-0 z-50 bg-slate-900/60 overflow-y-auto p-4 md:p-8"
      onClick={onClose}
    >
      <style>
        {`
          @page {
            size: A4 portrait;
            margin: 0;
          }

          .pdf-print-note {
            display: none;
          }

          @media print {
            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            /*
             * IMPORTANT: jangan pakai visibility:hidden untuk seluruh app.
             * Elemen hidden tetap mengambil ruang layout dan membuat Chrome
             * mem-paginate halaman aplikasi di belakang modal print.
             */
            #root > * {
              display: none !important;
            }

            #root > .print-modal-root {
              display: block !important;
            }

            .print-modal-root {
              position: static !important;
              inset: auto !important;
              width: 210mm !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }

            #print-area {
              position: static !important;
              width: 210mm !important;
              max-width: none !important;
              height: auto !important;
              min-height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box !important;
              overflow: visible !important;
            }

            .no-print {
              display: none !important;
            }

            /*
             * Dokumen utama dibuat seperti kertas resmi:
             * header di atas, body di tengah, Audit Trail sebagai footer.
             * Footer hanya milik main document dan tidak ikut lampiran.
             */
            .main-document {
              width: 210mm !important;
              min-height: 297mm !important;
              padding: 12mm 14mm 10mm !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
            }

            .main-document.has-attachments {
              break-after: page !important;
              page-break-after: always !important;
            }

            .main-document-body {
              flex: 1 1 auto !important;
            }

            .audit-footer {
              margin-top: auto !important;
              padding-top: 3mm !important;
              border-top: 1px solid #334155 !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              font-size: 8px !important;
              line-height: 1.35 !important;
            }

            .audit-footer-grid {
              display: grid !important;
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              column-gap: 8mm !important;
              row-gap: 1mm !important;
              margin-top: 2mm !important;
            }

            .audit-footer-item {
              display: flex !important;
              gap: 2mm !important;
              min-width: 0 !important;
            }

            .audit-footer-label {
              min-width: 31mm !important;
              font-weight: 700 !important;
            }

            table {
              width: 100% !important;
              border-collapse: collapse !important;
            }

            thead {
              display: table-header-group !important;
            }

            tr,
            td,
            th {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            /*
             * Lampiran dimulai setelah dokumen utama.
             * Hanya section lampiran pertama yang memulai halaman baru;
             * item-item foto berikutnya mengalir natural.
             */
            .attachments-wrapper {
              width: 210mm !important;
              padding: 12mm 14mm !important;
              box-sizing: border-box !important;
            }

            .attachment-item {
              width: 100% !important;
              margin: 0 0 10mm !important;
              padding: 0 !important;
              box-sizing: border-box !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .attachment-image {
              display: block !important;
              width: auto !important;
              height: auto !important;
              max-width: 600px !important;
              max-height: 600px !important;
              object-fit: contain !important;
              margin: 8px auto 0 !important;
            }

            /*
             * iframe PDF tidak reliable saat parent window.print().
             * Preview tetap tersedia di layar, namun hasil print diberi
             * identitas attachment. Foto/scan akan tercetak penuh.
             */
            .attachment-pdf {
              display: none !important;
            }

            .pdf-print-note {
              display: block !important;
              margin: 8mm auto !important;
              text-align: center !important;
              font-size: 10px !important;
              line-height: 1.5 !important;
            }
          }
        `}
      </style>

      <div
        className="no-print max-w-[210mm] mx-auto mb-3 flex justify-between gap-3"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="text-sm font-semibold text-white">
          {mode ===
          'advance'
            ? 'Preview PDF SPD'
            : 'Preview PDF Settlement'}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={
              <Printer className="w-3.5 h-3.5" />
            }
            disabled={
              attachmentsLoading
            }
            onClick={
              handlePrint
            }
          >
            {attachmentsLoading
              ? 'Preparing Attachments...'
              : 'Print / Save PDF'}
          </Button>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <main
        id="print-area"
        onClick={(event) =>
          event.stopPropagation()
        }
        className="mx-auto bg-white w-full max-w-[210mm] px-[14mm] py-[12mm]"
      >
        <div className={`main-document ${mode === 'settlement' && receipts.some((receipt) => !!receipt.file_base64) ? 'has-attachments' : ''}`}>
          <div className="main-document-body">
        <DocumentHeader
          title={
            mode ===
            'advance'
              ? 'SURAT PERJALANAN DINAS'
              : 'LAPORAN HASIL & SETTLEMENT PERJALANAN DINAS'
          }
          number={
            mode ===
            'advance'
              ? trip.spd_number ??
                '-'
              : trip.settlement_number ??
                `Lap ${
                  trip.spd_number ??
                  '-'
                }`
          }
        />

        <Section title="Informasi Perjalanan">
          <InfoGrid>
            <Info
              label="Pemohon"
              value={
                trip.requester_name
              }
            />

            <Info
              label="Jabatan"
              value={
                trip.requester_jabatan ||
                '-'
              }
            />

            <Info
              label="PT Pemohon"
              value={
                trip.requester_pt ||
                '-'
              }
            />

            <Info
              label="Cost Center"
              value={
                (
                  trip.company_burden ??
                  []
                ).join(', ') ||
                '-'
              }
            />

            <Info
              label="Berangkat"
              value={formatDate(
                trip.departure_date
              )}
            />

            <Info
              label="Pulang"
              value={formatDate(
                trip.return_date
              )}
            />

            <Info
              label="Durasi"
              value={`${days} hari`}
            />

            <Info
              label="Tujuan"
              value={
                trip.purpose ||
                '-'
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
          </InfoGrid>
        </Section>

        <Section title="Itinerary">
          <Table
            headers={[
              'No',
              'Tujuan',
              'Tanggal',
              'Agenda',
            ]}
          >
            {(
              trip.itinerary ??
              []
            ).map(
              (
                leg,
                index
              ) => (
                <tr
                  key={
                    leg.id ??
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
                    )}{' '}
                    -{' '}
                    {formatDate(
                      leg.end_date
                    )}
                  </TD>

                  <TD>
                    {leg.agenda ||
                      '-'}
                  </TD>
                </tr>
              )
            )}
          </Table>
        </Section>

        {mode ===
        'advance' ? (
          <>
            <Section title="A. Rincian Pembiayaan">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Nama</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Rate / Ketentuan</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Hari</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Tunjangan</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">BBM</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">E-Toll</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Petty Cash</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Insentif</th>
                    <th className="border px-2 py-1.5 text-left bg-slate-50">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant, index) => {
                    const legs = Array.isArray(participant.legs) ? participant.legs : [];
                    const eligibleLegs = legs.filter((leg: any) => leg.enabled !== false && Number(leg.amount) > 0);

                    const allowance = Number(participant.total) || 0;
                    const pettyCash = Number(participant.pettyCash) || 0;

                    const fuel = advanceRows
                      .filter((row) => row.name === participant.name && String(row.component_note || '').toUpperCase().includes('BBM'))
                      .reduce((sum, row) => sum + (Number(row.nominal) || 0), 0);

                    const etoll = advanceRows
                      .filter((row) => row.name === participant.name && String(row.component_note || '').toUpperCase().includes('E-TOLL'))
                      .reduce((sum, row) => sum + (Number(row.nominal) || 0), 0);

                    const incentive = advanceRows
                      .filter((row) => row.name === participant.name && String(row.component_note || '').toUpperCase().includes('INSENTIF'))
                      .reduce((sum, row) => sum + (Number(row.nominal) || 0), 0);

                    const daysTotal = eligibleLegs.reduce((sum: number, leg: any) => sum + (Number(leg.days) || 0), 0);

                    const rateLabels = Array.from(
                      new Set(
                        eligibleLegs.map((leg: any) => {
                          const rate = Number(leg.rate) || 0;
                          if (!rate) return null;
                          return `${formatIDR(rate)}${leg.flat ? ' / trip' : ' / hari'}`;
                        }).filter(Boolean)
                      )
                    );

                    const rateLabel =
                      rateLabels.length === 0
                        ? '-'
                        : rateLabels.length === 1
                          ? rateLabels[0]
                          : 'Sesuai itinerary';

                    const subtotal =
                      allowance +
                      fuel +
                      etoll +
                      pettyCash +
                      incentive;

                    return (
                      <tr key={participant.name || index}>
                        <TD>{participant.name}</TD>
                        <TD>{rateLabel}</TD>
                        <TD>{daysTotal || '-'}</TD>
                        <TD>{allowance > 0 ? formatIDR(allowance) : '-'}</TD>
                        <TD>{fuel > 0 ? formatIDR(fuel) : '-'}</TD>
                        <TD>{etoll > 0 ? formatIDR(etoll) : '-'}</TD>
                        <TD>{pettyCash > 0 ? formatIDR(pettyCash) : '-'}</TD>
                        <TD>{incentive > 0 ? formatIDR(incentive) : '-'}</TD>
                        <TD>{formatIDR(subtotal)}</TD>
                      </tr>
                    );
                  })}

                  <tr className="font-bold bg-slate-50">
                    <TD colSpan={8}>TOTAL</TD>
                    <TD>{formatIDR(advanceTotal)}</TD>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section title="B. Alokasi Cost Center">
              <Table
                headers={[
                  'Nama',
                  'Komponen',
                  'Cost Center',
                  'Nominal',
                ]}
              >
                {advanceRows.map(
                  (row) => (
                    <tr
                      key={
                        row.id
                      }
                    >
                      <TD>
                        {
                          row.name
                        }
                      </TD>

                      <TD>
                        {row.component_note ||
                          '-'}
                      </TD>

                      <TD>
                        {row.pt_burden ||
                          '-'}
                      </TD>

                      <TD>
                        {formatIDR(
                          Number(
                            row.nominal
                          ) ||
                            0
                        )}
                      </TD>
                    </tr>
                  )
                )}
              </Table>
            </Section>
          </>
        ) : (
          <>
            <Section title="A. Laporan Hasil Pekerjaan">
              <div className="border p-3 text-[11px] whitespace-pre-wrap min-h-[24mm]">
                {trip.work_result ||
                  '-'}
              </div>
            </Section>

            <Section title="B. Audit Trail Settlement">
              <Table
                headers={[
                  'No',
                  'Kategori / Keterangan',
                  'Claimed',
                  'Approved',
                  'Status',
                  'HR Note',
                ]}
              >
                {receipts.map(
                  (
                    receipt,
                    index
                  ) => (
                    <tr
                      key={
                        receipt.id
                      }
                    >
                      <TD>
                        {index +
                          1}
                      </TD>

                      <TD>
                        <div>
                          {
                            receipt.category
                          }
                        </div>

                        <div className="text-[9px] text-slate-500">
                          {receipt.description ||
                            receipt.file_name ||
                            '-'}
                        </div>
                      </TD>

                      <TD>
                        {formatIDR(
                          Number(
                            receipt.amount
                          ) ||
                            0
                        )}
                      </TD>

                      <TD>
                        {formatIDR(
                          Number(
                            receipt.hr_approved_amount
                          ) ||
                            0
                        )}
                      </TD>

                      <TD>
                        <strong>
                          {receiptStatusLabel(
                            receipt.hr_status
                          )}
                        </strong>
                      </TD>

                      <TD>
                        {receipt.hr_note ||
                          '-'}
                      </TD>
                    </tr>
                  )
                )}

                {receipts.length ===
                  0 && (
                  <tr>
                    <TD
                      colSpan={
                        6
                      }
                    >
                      Tidak ada receipt / invoice settlement.
                    </TD>
                  </tr>
                )}
              </Table>
            </Section>

            <Section title="C. Alokasi Refund / Reimbursement">
              <Table
                headers={[
                  'Penerima / Pengembali',
                  'Untuk / Komponen',
                  'Movement',
                  'Cost Center',
                  'Nominal',
                ]}
              >
                {settlementRows.map(
                  (row) => {
                    const movement =
                      splitMovementName(
                        row.name
                      );

                    return (
                      <tr
                        key={
                          row.id
                        }
                      >
                        <TD>
                          {
                            movement.name
                          }
                        </TD>

                        <TD>
                          {
                            movement.component
                          }
                        </TD>

                        <TD>
                          <strong>
                            {row.claim_status ===
                            'Reimburse'
                              ? 'REIMBURSEMENT'
                              : 'REFUND'}
                          </strong>
                        </TD>

                        <TD>
                          {row.pt_burden ||
                            '-'}
                        </TD>

                        <TD>
                          {formatIDR(
                            Number(
                              row.nominal
                            ) ||
                              0
                          )}
                        </TD>
                      </tr>
                    );
                  }
                )}

                {settlementRows.length ===
                  0 && (
                  <tr>
                    <TD
                      colSpan={
                        5
                      }
                    >
                      Tidak ada refund / reimbursement.
                    </TD>
                  </tr>
                )}
              </Table>
            </Section>
          </>
        )}

          </div>

          <footer className="audit-footer">
            <div className="text-[9px] font-bold uppercase tracking-wide">
              Audit Trail
            </div>

            <div className="audit-footer-grid">
              {auditRows.map(
                (row, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="audit-footer-item"
                  >
                    <span className="audit-footer-label">
                      {row.label}
                    </span>

                    <span>
                      {formatTrackingDate(
                        row.date
                      )}
                      {row.actor
                        ? ` · ${row.actor}`
                        : ''}
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="mt-2 text-[7px] text-slate-400 text-right">
              Dokumen diterbitkan melalui Business Trip Management System.
            </div>
          </footer>
        </div>

        {/* ATTACHMENTS */}
        {mode === 'settlement' && (
          <div className="attachments-wrapper">
            <div className="mb-5">
              <div className="text-[10px] tracking-[0.28em] text-slate-500">
                ARIDZKA GROUP
              </div>
              <div className="text-[15px] font-bold mt-1">
                LAMPIRAN SETTLEMENT
              </div>
              <div className="text-[9px] text-slate-500 mt-1">
                Nomor: {trip.settlement_number ?? `Lap ${trip.spd_number ?? '-'}`}
              </div>
            </div>

          {receipts.map(
            (
              receipt,
              index
            ) =>
              receipt.file_base64 ? (
                <section
                  key={
                    receipt.id
                  }
                  className="attachment-item"
                >
                  <div className="border-b-2 border-slate-900 pb-3 mb-3">
                    <div className="text-[10px] font-semibold tracking-wide">
                      LAMPIRAN{' '}
                      {index +
                        1}
                    </div>

                    <div className="text-sm font-bold mt-1">
                      {
                        receipt.category
                      }{' '}
                      —{' '}
                      {receipt.file_name ||
                        receipt.description ||
                        'Bukti Settlement'}
                    </div>

                    <div className="text-[9px] text-slate-500 mt-1">
                      Claimed{' '}
                      {formatIDR(
                        Number(
                          receipt.amount
                        ) ||
                          0
                      )}{' '}
                      · Approved{' '}
                      {formatIDR(
                        Number(
                          receipt.hr_approved_amount
                        ) ||
                          0
                      )}{' '}
                      ·{' '}
                      {receiptStatusLabel(
                        receipt.hr_status
                      )}
                    </div>

                    {receipt.hr_note && (
                      <div className="text-[9px] mt-1">
                        HR Note:{' '}
                        {
                          receipt.hr_note
                        }
                      </div>
                    )}
                  </div>

                  {isImageAttachment(
                    receipt.file_base64,
                    receipt.file_name
                  ) ? (
                    <img
                      src={
                        embeddedImages[
                          receipt.id
                        ] ||
                        receipt.file_base64
                      }
                      alt={
                        receipt.file_name ||
                        receipt.category
                      }
                      className="attachment-image"
                    />
                  ) : isPdfAttachment(
                      receipt.file_base64,
                      receipt.file_name
                    ) ? (
                    <>
                      <iframe
                        src={
                          receipt.file_base64
                        }
                        title={
                          receipt.file_name ||
                          receipt.category
                        }
                        className="attachment-pdf"
                      />

                      <div className="pdf-print-note">
                        <strong>Attachment PDF</strong>
                        <br />
                        {receipt.file_name ||
                          receipt.category}
                        <br />
                        <span>
                          File PDF tersedia pada attachment settlement.
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="m-auto text-xs text-slate-500 text-center">
                      Attachment tidak dapat dirender langsung.
                      <br />
                      {receipt.file_name ||
                        receipt.category}
                    </div>
                  )}
                </section>
              ) : null
          )}
          </div>
        )}
      </main>
    </div>
  );
}

function DocumentHeader({
  title,
  number,
}: {
  title: string;
  number: string;
}) {
  return (
    <header className="border-b-2 border-slate-900 pb-4 text-center">
      <div className="text-[10px] tracking-[0.28em] text-slate-500">
        ARIDZKA GROUP
      </div>

      <h1 className="mt-2 text-[16px] font-bold">
        {title}
      </h1>

      <div className="mt-2 text-[10px]">
        Nomor:{' '}
        <strong>
          {number}
        </strong>
      </div>
    </header>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[11px] font-bold uppercase">
        {title}
      </h2>

      {children}
    </section>
  );
}

function InfoGrid({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 border p-3">
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
    <div className="text-[10px]">
      <span className="text-slate-500">
        {label}:{' '}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <table className="w-full border-collapse text-[10px]">
      <thead>
        <tr>
          {headers.map(
            (header) => (
              <th
                key={
                  header
                }
                className="border px-2 py-1.5 text-left bg-slate-50"
              >
                {
                  header
                }
              </th>
            )
          )}
        </tr>
      </thead>

      <tbody>
        {children}
      </tbody>
    </table>
  );
}

function TD({
  children,
  colSpan,
}: {
  children: ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={
        colSpan
      }
      className="border px-2 py-1.5 align-top"
    >
      {children}
    </td>
  );
}
