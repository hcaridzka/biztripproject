import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  Plus,
  Trash2,
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
  StatusBadge,
  Textarea,
  formatIDR,
} from './ui-shared';
import { supabase } from '../lib/supabase';
import type { BizTrip } from '../lib/types';

type ReceiptReviewStatus =
  | 'pending'
  | 'approved'
  | 'partial'
  | 'rejected';

type ReviewRow = {
  id: string;
  receiptId: string;
  category: string;
  description: string;
  claimed: number;
  approved: number;
  status: ReceiptReviewStatus;
  note: string;
  fileUrl: string | null;
};

type MovementRow = {
  id: string;
  name: string;
  component: string;
  nominal: number;
  direction: 'Refund' | 'Reimburse';
  ptBurden: string;
};

type DetailRow = {
  holder: string;
  component: string;
  advance: number;
  pt: string;
};

const norm = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const componentMatch = (note: string, category: string) => {
  const normalizedNote = norm(note);
  const normalizedCategory = norm(category);

  const aliases: Record<string, string[]> = {
    bbm: ['bbm', 'fuel'],
    etoll: ['etoll', 'toll'],
    pettycash: ['pettycash'],
    akomodasi: ['akomodasi', 'hotel'],
  };

  return (aliases[normalizedCategory] ?? [normalizedCategory]).some(
    (key) => normalizedNote.includes(key)
  );
};

const splitMovementName = (value: string) => {
  const [name, ...component] = String(value || '').split(' — ');

  return {
    name: name || '',
    component: component.join(' — ') || '',
  };
};

export function SettlementReview({
  onPrint,
}: {
  onPrint: (id: string) => void;
}) {
  const { profile } = useAuth();

  const {
    trips,
    settlementReceipts,
    settlementClaimRows,
    disburseRows,
    activePTMaster,
    updateTrip,
    showToast,
    refresh,
  } = useApp();

  const [selected, setSelected] = useState<BizTrip | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [costRows, setCostRows] = useState<MovementRow[]>([]);
  const [settleNote, setSettleNote] = useState('');
  const [saving, setSaving] = useState(false);

  const queue = useMemo(
    () =>
      trips.filter((trip) =>
        [
          'Pending HR Settlement Review',
          'Pending Refund Verification',
          'Pending HR Finance Process',
        ].includes(trip.status)
      ),
    [trips]
  );

  const isRefundVerification =
    selected?.status === 'Pending Refund Verification';

  const isFinanceProcess =
    selected?.status === 'Pending HR Finance Process';

  const receipts = (tripId: string) =>
    settlementReceipts.filter(
      (row) =>
        row.trip_id === tripId &&
        row.category !== 'Refund Transfer Proof'
    );

  const refundProof = (tripId: string) =>
    settlementReceipts.find(
      (row) =>
        row.trip_id === tripId &&
        row.category === 'Refund Transfer Proof'
    );

  const ptOptions = (current?: string) => {
    const active = activePTMaster.map((pt) => pt.name);

    return current && !active.includes(current)
      ? [current, ...active]
      : active;
  };

  const defaultPT = (trip: BizTrip) =>
    trip.company_burden?.[0] ||
    activePTMaster[0]?.name ||
    '';

  const advanceRows = (trip: BizTrip) =>
    disburseRows.filter((row) => row.trip_id === trip.id);

  /**
   * SUMMARY ADVANCE
   *
   * Hanya menampilkan komponen accountable
   * yang memang pernah diberikan sebagai advance.
   *
   * Nominal 0 tidak ditampilkan.
   */
  const details = useMemo<DetailRow[]>(() => {
    if (!selected) return [];

    const accountableRows = advanceRows(selected)
      .filter((row) => Number(row.nominal || 0) > 0)
      .filter((row) =>
        ['bbm', 'etoll', 'pettycash', 'akomodasi'].some(
          (component) =>
            componentMatch(
              row.component_note || '',
              component
            )
        )
      );

    const grouped = new Map<
      string,
      {
        holder: string;
        component: string;
        advance: number;
        pt: string;
      }
    >();

    accountableRows.forEach((row) => {
      const component =
        [
          'BBM',
          'E-Toll',
          'Pettycash',
          'Akomodasi',
        ].find((componentName) =>
          componentMatch(
            row.component_note || '',
            componentName
          )
        ) ||
        row.component_note ||
        'Accountable Advance';

      const key = `${row.name}::${component}`;

      const existing = grouped.get(key);

      grouped.set(key, {
        holder: row.name,
        component,
        advance:
          (existing?.advance || 0) +
          Number(row.nominal || 0),
        pt:
          existing?.pt ||
          row.pt_burden ||
          defaultPT(selected),
      });
    });

    return [...grouped.values()];
  }, [selected, disburseRows]);

  /**
   * ACTUAL SETTLEMENT
   */
  const claimedActual = reviewRows.reduce(
    (sum, row) => sum + Number(row.claimed || 0),
    0
  );

  const approvedActual = reviewRows.reduce(
    (sum, row) => sum + Number(row.approved || 0),
    0
  );

  const advanceAccountable =
    Number(selected?.cost_data?.accountable?.total) || 0;

  const advanceTotal =
    Number(selected?.cost_grand_total) || 0;

  const nonAccountable =
    Number(selected?.cost_data?.nonAccountable?.total) || 0;

  /**
   * NET SETTLEMENT
   *
   * Actual Approved - Advance Accountable
   *
   * + = Reimbursement
   * - = Refund
   * 0 = Settled
   */
  const net = approvedActual - advanceAccountable;

  const reimbursementTotal =
    net > 0 ? net : 0;

  const refundTotal =
    net < 0 ? Math.abs(net) : 0;

  const expectedMovementTotal = Math.abs(net);

  /**
   * TABLE B
   *
   * Reimbursement = +
   * Refund         = -
   *
   * Jadi HR tetap boleh split manual.
   *
   * Contoh:
   * Reimburse 2.000.000
   * Refund       450.000
   * -------------------
   * Net        1.550.000
   */
  const tableBNet = costRows.reduce(
    (sum, row) =>
      sum +
      (row.direction === 'Reimburse'
        ? Number(row.nominal || 0)
        : -Number(row.nominal || 0)),
    0
  );

  const tableBAbsolute = costRows.reduce(
    (sum, row) =>
      sum + Math.abs(Number(row.nominal || 0)),
    0
  );

  const costDifference = tableBNet - net;

  const tableBValid =
    net === 0
      ? tableBAbsolute <= 0.01
      : Math.abs(costDifference) <= 0.01;

  const allReviewed =
    reviewRows.length === 0 ||
    reviewRows.every(
      (row) => row.status !== 'pending'
    );

  /**
   * Auto-fill hanya sebagai starting point.
   * HR tetap dapat override manual.
   */
  const buildMovementRows = (
    trip: BizTrip
  ): MovementRow[] => {
    if (net === 0) return [];

    return [
      {
        id: crypto.randomUUID(),
        name: trip.requester_name,
        component:
          net > 0
            ? 'Net Settlement Reimbursement'
            : 'Net Settlement Refund',
        nominal: Math.abs(net),
        direction:
          net > 0 ? 'Reimburse' : 'Refund',
        ptBurden: defaultPT(trip),
      },
    ];
  };

  const startReview = (trip: BizTrip) => {
    setSelected(trip);
    setSettleNote(trip.settlement_note ?? '');

    /**
     * Untuk proses lanjutan,
     * load Table B yang sudah disimpan.
     */
    if (
      trip.status === 'Pending Refund Verification' ||
      trip.status === 'Pending HR Finance Process'
    ) {
      setReviewRows([]);

      setCostRows(
        settlementClaimRows
          .filter(
            (row) => row.trip_id === trip.id
          )
          .map((row) => {
            const parsed = splitMovementName(row.name);

            return {
              id: row.id,
              name: parsed.name,
              component: parsed.component,
              nominal: Number(row.nominal) || 0,
              direction: row.claim_status,
              ptBurden: row.pt_burden,
            };
          })
      );

      return;
    }

    const receiptRows: ReviewRow[] =
      receipts(trip.id).map((row) => ({
        id: row.id,
        receiptId: row.id,
        category: row.category,
        description: row.description || '',
        claimed: Number(row.amount) || 0,
        approved:
          row.hr_approved_amount != null
            ? Number(row.hr_approved_amount)
            : Number(row.amount) || 0,
        status:
          (row.hr_status as ReceiptReviewStatus) ||
          'pending',
        note: row.hr_note || '',
        fileUrl: row.file_base64 || null,
      }));

    setReviewRows(receiptRows);

    const existing = settlementClaimRows.filter(
      (row) => row.trip_id === trip.id
    );

    setCostRows(
      existing.map((row) => {
        const parsed = splitMovementName(row.name);

        return {
          id: row.id,
          name: parsed.name,
          component: parsed.component,
          nominal: Number(row.nominal) || 0,
          direction: row.claim_status,
          ptBurden: row.pt_burden,
        };
      })
    );
  };

  const updateReview = (
    id: string,
    patch: Partial<ReviewRow>
  ) =>
    setReviewRows((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, ...patch }
          : row
      )
    );

  const updateStatus = (
    row: ReviewRow,
    status: ReceiptReviewStatus
  ) => {
    updateReview(row.id, {
      status,
      approved:
        status === 'approved'
          ? row.claimed
          : status === 'rejected'
            ? 0
            : row.approved,
    });
  };

  const updateCost = (
    id: string,
    patch: Partial<MovementRow>
  ) =>
    setCostRows((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, ...patch }
          : row
      )
    );

  const autoFill = () => {
    if (!selected) return;

    setCostRows(
      buildMovementRows(selected)
    );
  };

  const persist = async () => {
    if (!selected) return;

    /**
     * Save audit trail review receipt.
     */
    for (const row of reviewRows) {
      const result = await supabase
        .from('settlement_receipts')
        .update({
          hr_status: row.status,
          hr_approved_amount: row.approved,
          hr_note: row.note || null,
        })
        .eq('id', row.receiptId);

      if (result.error) {
        throw result.error;
      }
    }

    /**
     * Rebuild Table B.
     */
    const deleteResult = await supabase
      .from('settlement_claim_rows')
      .delete()
      .eq('trip_id', selected.id);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    for (
      let index = 0;
      index < costRows.length;
      index++
    ) {
      const row = costRows[index];

      if (Number(row.nominal || 0) <= 0) {
        continue;
      }

      const result = await supabase
        .from('settlement_claim_rows')
        .insert({
          id: crypto.randomUUID(),
          trip_id: selected.id,
          name: row.component
            ? `${row.name} — ${row.component}`
            : row.name,
          nominal: row.nominal,
          claim_status: row.direction,
          pt_burden: row.ptBurden,
          sort_order: index,
        });

      if (result.error) {
        throw result.error;
      }
    }
  };

  const finalize = async () => {
    if (!selected) return;

    if (!allReviewed) {
      return showToast(
        'error',
        'Semua receipt harus direview.'
      );
    }

    if (!tableBValid) {
      return showToast(
        'error',
        `Net Table B harus sama dengan net settlement ${formatIDR(
          expectedMovementTotal
        )}.`
      );
    }

    if (
      costRows.some(
        (row) =>
          row.nominal > 0 &&
          !row.ptBurden
      )
    ) {
      return showToast(
        'error',
        'Semua movement wajib memiliki Cost Center.'
      );
    }

    setSaving(true);

    try {
      await persist();

      const next: BizTrip['status'] =
        net > 0
          ? 'Pending Reimbursement Approval'
          : net < 0
            ? 'Pending Refund'
            : 'Completed';

      const now = new Date().toISOString();

      await updateTrip(selected.id, {
        status: next,
        realization_total: claimedActual,
        approved_total: approvedActual,
        settlement_result:
          net > 0
            ? `Reimbursement - ${net}`
            : net < 0
              ? `Refund - ${Math.abs(net)}`
              : 'Settled',
        settlement_note:
          settleNote || null,
        settlement_reviewed_by:
          profile?.name ?? '',
        settlement_reviewed_at: now,
        settlement_number:
          selected.settlement_number ||
          `STL-${new Date().getFullYear()}-${selected.id
            .slice(0, 4)
            .toUpperCase()}`,
        completed_at:
          next === 'Completed'
            ? now
            : null,
        cost_data: {
          ...(selected.cost_data ?? {}),
          reimbursementApprovals: {},
        },
      });

      await supabase
        .from('trip_tracking')
        .insert({
          trip_id: selected.id,
          actor_name:
            profile?.name ?? '',
          actor_role: 'HR Manager',
          action: 'Settlement reviewed',
          from_status: selected.status,
          to_status: next,
          remarks:
            net > 0
              ? `Net Reimbursement ${formatIDR(net)}`
              : net < 0
                ? `Net Refund ${formatIDR(
                    Math.abs(net)
                  )}`
                : 'Settlement settled without financial movement',
        });

      showToast(
        'success',
        net > 0
          ? 'Reimbursement dikirim ke approval Direksi Cost Center.'
          : net < 0
            ? 'Pegawai perlu melakukan refund.'
            : 'Settlement completed.'
      );

      setSelected(null);
      await refresh();
    } catch (error: any) {
      showToast(
        'error',
        error.message
      );
    } finally {
      setSaving(false);
    }
  };

  const completeFinance = async () => {
    if (!selected) return;

    setSaving(true);

    try {
      const now = new Date().toISOString();

      await updateTrip(selected.id, {
        status: 'Completed',
        completed_at: now,
      });

      await supabase
        .from('trip_tracking')
        .insert({
          trip_id: selected.id,
          actor_name:
            profile?.name ?? '',
          actor_role: 'HR Manager',
          action:
            'Reimbursement sent to Finance',
          from_status:
            'Pending HR Finance Process',
          to_status: 'Completed',
          remarks:
            settleNote ||
            'Approved reimbursement forwarded to Finance',
        });

      showToast(
        'success',
        'Reimbursement sudah diproses ke Finance. Trip Completed.'
      );

      setSelected(null);
      await refresh();
    } catch (error: any) {
      showToast(
        'error',
        error.message
      );
    } finally {
      setSaving(false);
    }
  };

  const proof = selected
    ? refundProof(selected.id)
    : undefined;

  const refundAmount = selected
    ? Math.max(
        0,
        Number(
          selected.cost_data?.accountable
            ?.total || 0
        ) -
          Number(
            selected.approved_total || 0
          )
      )
    : 0;

  const verifyRefund = async () => {
    if (!selected || !proof) return;

    setSaving(true);

    try {
      const now = new Date().toISOString();

      await supabase
        .from('settlement_receipts')
        .update({
          hr_status: 'approved',
          hr_approved_amount:
            Number(proof.amount) ||
            refundAmount,
          hr_note:
            settleNote ||
            'Refund verified by HR',
        })
        .eq('id', proof.id);

      await updateTrip(selected.id, {
        status: 'Completed',
        settlement_result:
          `Refund Completed - ${refundAmount}`,
        completed_at: now,
      });

      await supabase
        .from('trip_tracking')
        .insert({
          trip_id: selected.id,
          actor_name:
            profile?.name ?? '',
          actor_role: 'HR Manager',
          action: 'Refund verified',
          from_status:
            'Pending Refund Verification',
          to_status: 'Completed',
          remarks:
            `Refund ${formatIDR(
              refundAmount
            )} verified`,
        });

      showToast(
        'success',
        'Refund berhasil diverifikasi.'
      );

      setSelected(null);
      await refresh();
    } catch (error: any) {
      showToast(
        'error',
        error.message
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-bold">
          Settlement Review
        </h2>
        <p className="text-sm text-slate-500">
          HR Manager · {queue.length} menunggu proses
        </p>
      </div>

      {!selected ? (
        <Card className="p-6">
          {queue.length === 0 ? (
            <EmptyState
              icon={
                <ClipboardList className="w-6 h-6" />
              }
              title="Tidak ada settlement menunggu"
            />
          ) : (
            <div className="space-y-2">
              {queue.map((trip) => (
                <div
                  key={trip.id}
                  className="p-4 ring-1 ring-slate-100 rounded-xl flex justify-between"
                >
                  <div>
                    <strong>
                      {trip.requester_name}
                    </strong>
                    <div className="text-xs text-slate-500">
                      {trip.purpose}
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <StatusBadge
                      status={trip.status}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        startReview(trip)
                      }
                    >
                      Process
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : isFinanceProcess ? (
        <Card className="p-6 space-y-4">
          <h3 className="font-bold">
            HR Process to Finance
          </h3>

          <p className="text-sm">
            Reimbursement sudah disetujui seluruh Direksi Cost Center.
          </p>

          {costRows.map((row) => (
            <div
              key={row.id}
              className="p-3 bg-slate-50 rounded-xl text-sm flex justify-between"
            >
              <span>
                {row.name} · {row.component} ·{' '}
                {row.ptBurden}
              </span>

              <strong>
                {formatIDR(row.nominal)}
              </strong>
            </div>
          ))}

          <Field label="HR Notes">
            <Textarea
              value={settleNote}
              onChange={(event) =>
                setSettleNote(
                  event.target.value
                )
              }
            />
          </Field>

          <div className="flex justify-end">
            <Button
              disabled={saving}
              onClick={completeFinance}
            >
              Process to Finance & Complete
            </Button>
          </div>
        </Card>
      ) : isRefundVerification ? (
        <Card className="p-6 space-y-4">
          <h3 className="font-bold">
            Refund Verification
          </h3>

          <SummaryBox
            label="Refund"
            value={refundAmount}
          />

          {proof?.file_base64 && (
            <a
              href={proof.file_base64}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 text-sm flex gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              Lihat Bukti
            </a>
          )}

          <Button
            disabled={!proof || saving}
            onClick={verifyRefund}
          >
            Verify & Complete
          </Button>
        </Card>
      ) : (
        <>
          {/* MAIN SUMMARY */}
          <Card className="p-6 space-y-5">
            <div className="flex justify-between">
              <div>
                <h3 className="font-bold">
                  Settlement —{' '}
                  {selected.requester_name}
                </h3>
                <p className="text-xs text-slate-500">
                  {selected.purpose}
                </p>
              </div>

              <button
                onClick={() =>
                  setSelected(null)
                }
              >
                Tutup
              </button>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <SummaryBox
                label="Grand Advance"
                value={advanceTotal}
              />

              <SummaryBox
                label="Non-Accountable"
                value={nonAccountable}
              />

              <SummaryBox
                label="Advance Accountable"
                value={advanceAccountable}
              />

              <SummaryBox
                label="Actual Approved"
                value={approvedActual}
              />
            </div>

            <div className="overflow-x-auto">
              <h4 className="text-sm font-bold mb-2">
                Summary Advance Accountable
              </h4>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <TH>Pemegang</TH>
                    <TH>Komponen</TH>
                    <TH>Nominal Advance</TH>
                  </tr>
                </thead>

                <tbody>
                  {details.length === 0 ? (
                    <tr>
                      <TD colSpan={3}>
                        Tidak ada komponen accountable advance.
                      </TD>
                    </tr>
                  ) : (
                    details.map(
                      (
                        detail,
                        index
                      ) => (
                        <tr
                          key={`${detail.holder}-${detail.component}-${index}`}
                        >
                          <TD>
                            {detail.holder}
                          </TD>
                          <TD>
                            {detail.component}
                          </TD>
                          <TD>
                            {formatIDR(
                              detail.advance
                            )}
                          </TD>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* RECEIPT REVIEW */}
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-bold">
                A. Review Receipt Aktual
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Review setiap invoice / receipt sebagai audit trail settlement.
              </p>
            </div>

            {reviewRows.map((row) => (
              <div
                key={row.id}
                className="p-4 border rounded-xl space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm">
                      {row.category}
                    </strong>

                    <div className="text-[11px] text-slate-500">
                      {row.description ||
                        '-'}
                    </div>
                  </div>

                  {row.fileUrl && (
                    <a
                      href={row.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 text-xs flex gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Lihat Bukti
                    </a>
                  )}
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  <Field label="Claimed">
                    <Input
                      value={formatIDR(
                        row.claimed
                      )}
                      disabled
                    />
                  </Field>

                  <Field label="Approved Amount">
                    <Input
                      type="number"
                      value={row.approved}
                      disabled={
                        row.status ===
                          'approved' ||
                        row.status ===
                          'rejected'
                      }
                      onChange={(event) =>
                        updateReview(
                          row.id,
                          {
                            approved:
                              Number(
                                event.target
                                  .value
                              ) || 0,
                          }
                        )
                      }
                    />
                  </Field>

                  <Field label="Review Status">
                    <Select
                      value={row.status}
                      onChange={(event) =>
                        updateStatus(
                          row,
                          event.target
                            .value as ReceiptReviewStatus
                        )
                      }
                    >
                      <option value="pending">
                        Pending
                      </option>
                      <option value="approved">
                        Approved
                      </option>
                      <option value="partial">
                        Partial
                      </option>
                      <option value="rejected">
                        Rejected
                      </option>
                    </Select>
                  </Field>
                </div>

                <Field label="Remark HR">
                  <Textarea
                    rows={2}
                    value={row.note}
                    onChange={(event) =>
                      updateReview(row.id, {
                        note:
                          event.target.value,
                      })
                    }
                    placeholder={
                      row.status ===
                      'rejected'
                        ? 'Jelaskan alasan rejection...'
                        : row.status ===
                            'partial'
                          ? 'Jelaskan alasan partial approval...'
                          : 'Tambahkan catatan review bila diperlukan...'
                    }
                  />
                </Field>
              </div>
            ))}
          </Card>

          {/* TABLE B */}
          <Card className="p-6 space-y-5">
            <div className="grid md:grid-cols-3 gap-3">
              <SummaryBox
                label="Advance Accountable"
                value={advanceAccountable}
              />

              <SummaryBox
                label="Actual Approved"
                value={approvedActual}
              />

              <SummaryBox
                label={
                  net > 0
                    ? 'Net Reimbursement'
                    : net < 0
                      ? 'Net Refund'
                      : 'Net Settlement'
                }
                value={Math.abs(net)}
              />
            </div>

            <div className="flex justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold">
                  B. Refund / Reimbursement Allocation
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Table B adalah alokasi final HR. Reimbursement dikurangi Refund harus sama dengan Net Settlement.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={autoFill}
                >
                  Auto-Fill Net
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={
                    <Plus className="w-3 h-3" />
                  }
                  onClick={() =>
                    setCostRows(
                      (rows) => [
                        ...rows,
                        {
                          id: crypto.randomUUID(),
                          name:
                            selected.requester_name,
                          component: '',
                          nominal: 0,
                          direction:
                            net < 0
                              ? 'Refund'
                              : 'Reimburse',
                          ptBurden:
                            defaultPT(
                              selected
                            ),
                        },
                      ]
                    )
                  }
                >
                  Add Row
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px] space-y-2">
                <div className="grid grid-cols-[1.2fr_1.5fr_150px_150px_1.2fr_40px] gap-2 text-[10px] uppercase font-semibold text-slate-400 px-1">
                  <span>
                    Penerima / Pengembali
                  </span>
                  <span>
                    Komponen / Keterangan
                  </span>
                  <span>Movement</span>
                  <span>Nominal</span>
                  <span>Cost Center</span>
                  <span />
                </div>

                {costRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.2fr_1.5fr_150px_150px_1.2fr_40px] gap-2 items-center"
                  >
                    <Input
                      value={row.name}
                      onChange={(event) =>
                        updateCost(
                          row.id,
                          {
                            name:
                              event.target
                                .value,
                          }
                        )
                      }
                    />

                    <Input
                      value={
                        row.component
                      }
                      placeholder="Contoh: BBM, Pettycash, Konsumsi..."
                      onChange={(event) =>
                        updateCost(
                          row.id,
                          {
                            component:
                              event.target
                                .value,
                          }
                        )
                      }
                    />

                    <Select
                      value={row.direction}
                      onChange={(event) =>
                        updateCost(
                          row.id,
                          {
                            direction:
                              event.target
                                .value as
                                | 'Refund'
                                | 'Reimburse',
                          }
                        )
                      }
                    >
                      <option value="Reimburse">
                        Reimbursement
                      </option>
                      <option value="Refund">
                        Refund
                      </option>
                    </Select>

                    <Input
                      type="number"
                      value={row.nominal}
                      onChange={(event) =>
                        updateCost(
                          row.id,
                          {
                            nominal:
                              Number(
                                event.target
                                  .value
                              ) || 0,
                          }
                        )
                      }
                    />

                    <Select
                      value={
                        row.ptBurden
                      }
                      onChange={(event) =>
                        updateCost(
                          row.id,
                          {
                            ptBurden:
                              event.target
                                .value,
                          }
                        )
                      }
                    >
                      <option value="">
                        Pilih Cost Center...
                      </option>

                      {ptOptions(
                        row.ptBurden
                      ).map((pt) => (
                        <option
                          key={pt}
                          value={pt}
                        >
                          {pt}
                        </option>
                      ))}
                    </Select>

                    <button
                      type="button"
                      onClick={() =>
                        setCostRows(
                          (rows) =>
                            rows.filter(
                              (item) =>
                                item.id !==
                                row.id
                            )
                        )
                      }
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              <SummaryBox
                label="Net Table B"
                value={Math.abs(
                  tableBNet
                )}
              />

              <SummaryBox
                label="Expected Net Movement"
                value={
                  expectedMovementTotal
                }
              />

              <SummaryBox
                label="Selisih"
                value={Math.abs(
                  costDifference
                )}
              />
            </div>

            {!tableBValid && (
              <div className="text-xs text-rose-600 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Net Table B belum sama dengan Net Settlement.
                Reimbursement dihitung positif dan Refund dihitung sebagai pengurang.
              </div>
            )}

            <Field label="HR Settlement Notes">
              <Textarea
                value={settleNote}
                onChange={(event) =>
                  setSettleNote(
                    event.target.value
                  )
                }
              />
            </Field>

            <div className="flex justify-between gap-3">
              <Button
                variant="secondary"
                icon={
                  <FileText className="w-3 h-3" />
                }
                onClick={() =>
                  onPrint(selected.id)
                }
              >
                PDF Settlement
              </Button>

              <Button
                disabled={
                  saving ||
                  !allReviewed ||
                  !tableBValid
                }
                icon={
                  <Check className="w-3 h-3" />
                }
                onClick={finalize}
              >
                {saving
                  ? 'Processing...'
                  : 'Approve Settlement'}
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border p-4">
      <div className="text-xs text-slate-400">
        {label}
      </div>

      <div className="font-bold mt-1">
        {formatIDR(value)}
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
    <th className="border px-2 py-2 text-left">
      {children}
    </th>
  );
}

function TD({
  children,
  colSpan,
}: {
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className="border px-2 py-2"
    >
      {children}
    </td>
  );
}
