import { useMemo } from 'react';
import {
  MapPin,
  Clock,
  CheckCircle2,
  TrendingUp,
  Calendar,
  ArrowRight,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

import {
  Card,
  StatusBadge,
  EmptyState,
  formatIDR,
} from './ui-shared';

import {
  formatDate,
  daysBetween,
} from '../lib/utils';

import { PIPELINE_STEPS } from '../lib/constants';

import type { ViewKey } from './Layout';
import type { BizTrip } from '../lib/types';

export function Dashboard({
  setView,
  setSelectedTrip,
}: {
  setView: (v: ViewKey) => void;
  setSelectedTrip: (id: string) => void;
}) {
  const { profile } = useAuth();
  const { trips } = useApp();

  const isEmployee =
    profile?.role === 'Employee';

  /*
   * DATA BERDASARKAN ROLE
   *
   * Employee hanya melihat trip sendiri.
   * Role lain melihat seluruh trip.
   */
  const displayTrips = useMemo(() => {
    return isEmployee
      ? trips.filter(
          (t) =>
            t.user_id === profile?.id
        )
      : trips;
  }, [
    trips,
    profile,
    isEmployee,
  ]);

  /*
   * ACTIVE TRIPS
   */
  const activeTrips = useMemo(() => {
    return displayTrips.filter(
      (t) =>
        ![
          'Completed',
          'Rejected',
        ].includes(t.status)
    );
  }, [displayTrips]);

  /*
   * SUMMARY CARDS
   */
  const stats = useMemo(() => {
    const total =
      displayTrips.length;

    const active =
      activeTrips.length;

    const completed =
      displayTrips.filter(
        (t) =>
          t.status ===
          'Completed'
      ).length;

    const totalAdvance =
      displayTrips.reduce(
        (sum, t) =>
          sum +
          Number(
            t.cost_grand_total ||
              0
          ),
        0
      );

    return {
      total,
      active,
      completed,
      totalAdvance,
    };
  }, [
    displayTrips,
    activeTrips,
  ]);

  /*
   * PIPELINE
   */
  const pipelineCounts =
    useMemo(() => {
      const counts:
        Record<string, number> =
          {};

      trips.forEach((t) => {
        counts[t.status] =
          (
            counts[t.status] ||
            0
          ) + 1;
      });

      return counts;
    }, [trips]);

  /*
   * SMART NAVIGATION
   *
   * Dashboard tidak lagi
   * selalu mengarah ke My Trips.
   */
  const openTrip = (
    t: BizTrip
  ) => {
    setSelectedTrip(t.id);

    const role =
      profile?.role;

    /*
     * MANAGER APPROVAL
     */
    if (
      t.status ===
        'Pending Manager Approval' &&
      (
        role === 'Manager' ||
        role === 'HR Manager'
      )
    ) {
      setView('approval');
      return;
    }

    /*
     * PIC OBLIGO
     */
    if (
      t.status ===
        'Pending PIC Obligo' &&
      (
        role === 'PIC Obligo' ||
        role === 'HR Manager'
      )
    ) {
      setView('pic-obligo');
      return;
    }

    /*
     * DIREKSI APPROVAL
     */
    if (
      t.status ===
        'Pending Direksi Approval' &&
      (
        role === 'Direksi' ||
        role === 'HR Manager'
      )
    ) {
      setView('approval');
      return;
    }

    /*
     * HR COST REVIEW
     */
    if (
      t.status ===
        'Pending HR Advance Review' &&
      role === 'HR Manager'
    ) {
      setView('cost-review');
      return;
    }

    /*
     * SETTLEMENT EMPLOYEE
     */
    if (
      t.status ===
        'Pending Settlement' &&
      (
        role === 'Employee' ||
        role === 'HR Manager'
      )
    ) {
      setView('settlement');
      return;
    }

    /*
     * HR SETTLEMENT REVIEW
     */
    if (
      (
        t.status ===
          'Pending HR Settlement Review' ||
        t.status ===
          'Pending Refund Verification'
      ) &&
      role === 'HR Manager'
    ) {
      setView(
        'settlement-review'
      );

      return;
    }

    /*
     * DEFAULT
     *
     * Employee / status lain
     * masuk ke My Trips.
     */
    setView('my-trips');
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <StatCard
          icon={
            <MapPin className="w-5 h-5" />
          }
          label="Total Trips"
          value={String(
            stats.total
          )}
          color="brand"
        />

        <StatCard
          icon={
            <Clock className="w-5 h-5" />
          }
          label="Active Trips"
          value={String(
            stats.active
          )}
          color="amber"
        />

        <StatCard
          icon={
            <CheckCircle2 className="w-5 h-5" />
          }
          label="Completed"
          value={String(
            stats.completed
          )}
          color="emerald"
        />

        <StatCard
          icon={
            <TrendingUp className="w-5 h-5" />
          }
          label="Total Advance"
          value={formatIDR(
            stats.totalAdvance
          )}
          color="slate"
        />

      </div>

      {/* PIPELINE */}
      <Card className="p-6">

        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">

          <Calendar className="w-4 h-4 text-slate-400" />

          Pipeline Overview

        </h3>

        <div className="flex gap-2 overflow-x-auto pb-2">

          {PIPELINE_STEPS.map(
            (step, i) => {
              const count =
                pipelineCounts[
                  step.status
                ] || 0;

              return (
                <div
                  key={
                    step.status
                  }
                  className="flex items-center gap-2 shrink-0"
                >

                  <div
                    className={`px-3 py-2 rounded-xl text-xs font-semibold ${
                      count > 0
                        ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                        : 'bg-slate-50 text-slate-400 ring-1 ring-slate-100'
                    }`}
                  >

                    <div className="text-[10px] uppercase tracking-wide">
                      {step.label}
                    </div>

                    <div className="text-lg font-bold mt-0.5">
                      {count}
                    </div>

                  </div>

                  {i <
                    PIPELINE_STEPS.length -
                      1 && (
                    <div className="w-4 h-px bg-slate-200" />
                  )}

                </div>
              );
            }
          )}

        </div>

      </Card>

      {/* RECENT TRIPS */}
      <Card className="p-6">

        <div className="flex items-center justify-between mb-4">

          <h3 className="text-sm font-bold text-slate-800">
            {isEmployee
              ? 'My Recent Trips'
              : 'Recent Trip Requests'}
          </h3>

          {isEmployee ? (

            <button
              onClick={() =>
                setView(
                  'new-request'
                )
              }
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition"
            >
              + New Request
            </button>

          ) : (

            <button
              onClick={() =>
                setView(
                  'my-trips'
                )
              }
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition flex items-center gap-1"
            >
              View All

              <ArrowRight className="w-3 h-3" />
            </button>

          )}

        </div>

        {displayTrips.length === 0 ? (

          <EmptyState
            icon={
              <MapPin className="w-6 h-6" />
            }
            title="Belum ada trip"
            message="Buat pengajuan dinas baru untuk memulai."
          />

        ) : (

          <div className="space-y-2">

            {displayTrips
              .slice(0, 8)
              .map((t) => (

                <button
                  key={t.id}
                  onClick={() =>
                    openTrip(t)
                  }
                  className="w-full flex items-center gap-4 rounded-xl ring-1 ring-slate-100 hover:ring-brand-200 hover:bg-brand-50/30 px-4 py-3 transition text-left"
                >

                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">

                    <MapPin className="w-5 h-5" />

                  </div>

                  <div className="flex-1 min-w-0">

                    <div className="text-sm font-semibold text-slate-800 truncate">

                      {t.purpose}

                      {t.requester_name
                        ? ` (${t.requester_name})`
                        : ''}

                    </div>

                    <div className="text-xs text-slate-400 mt-0.5">

                      {t.origin}

                      {' → '}

                      {t.itinerary?.[0]
                        ?.destination ??
                        '-'}

                      {' · '}

                      {formatDate(
                        t.departure_date
                      )}

                      {' · '}

                      {daysBetween(
                        t.departure_date,
                        t.return_date
                      )}

                      {' hari'}

                    </div>

                  </div>

                  <StatusBadge
                    status={t.status}
                  />

                </button>

              ))}

          </div>
        )}

      </Card>

    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color:
    | 'brand'
    | 'amber'
    | 'emerald'
    | 'slate';
}) {
  const colors:
    Record<string, string> = {
      brand:
        'bg-brand-50 text-brand-600',

      amber:
        'bg-amber-50 text-amber-600',

      emerald:
        'bg-emerald-50 text-emerald-600',

      slate:
        'bg-slate-100 text-slate-600',
    };

  return (
    <Card className="p-5">

      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}
      >
        {icon}
      </div>

      <div className="text-2xl font-bold text-slate-900">
        {value}
      </div>

      <div className="text-xs text-slate-400 mt-0.5">
        {label}
      </div>

    </Card>
  );
}
