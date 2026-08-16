import { useEffect, useMemo, useState } from 'react';
import {
  Settings,
  Building2,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  Card,
  Button,
  Input,
  Field,
  EmptyState,
  formatIDR,
} from './ui-shared';

import { supabase } from '../lib/supabase';

type PTMaster = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};

type GradeMatrixRow = {
  id: string;
  grade_key: string;
  grade_name: string;
  luar_kota: number;
  kp1: number;
  kp2: number;
  kpo: number;
  dk_25: number;
  dk_50: number;
  dk_100: number;
  hotel: number;
  petty_cash: number;
  sort_order: number;
  is_active: boolean;
};

type TravelSetting = {
  id: string;
  setting_key: string;
  setting_name: string;
  nominal: number;
  is_active: boolean;
};

export function MatrixManagement() {
  const { profile } = useAuth();
  const { showToast, refresh } = useApp();

  const [ptMaster, setPtMaster] = useState<PTMaster[]>([]);
  const [matrix, setMatrix] = useState<GradeMatrixRow[]>([]);
  const [settings, setSettings] = useState<TravelSetting[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [newPTName, setNewPTName] = useState('');
  const [newPTCode, setNewPTCode] = useState('');

  const activePTCount = useMemo(
    () => ptMaster.filter((pt) => pt.is_active).length,
    [ptMaster]
  );

  const loadData = async () => {
    setLoading(true);

    try {
      const [ptResult, matrixResult, settingResult] = await Promise.all([
        supabase
          .from('pt_master')
          .select('id, name, code, is_active')
          .order('name'),

        supabase
          .from('travel_grade_matrix')
          .select('*')
          .order('sort_order'),

        supabase
          .from('travel_settings')
          .select('*')
          .order('setting_name'),
      ]);

      if (ptResult.error) throw ptResult.error;
      if (matrixResult.error) throw matrixResult.error;
      if (settingResult.error) throw settingResult.error;

      setPtMaster((ptResult.data ?? []) as PTMaster[]);
      setMatrix((matrixResult.data ?? []) as GradeMatrixRow[]);
      setSettings((settingResult.data ?? []) as TravelSetting[]);
    } catch (e: any) {
      showToast('error', 'Gagal load master data: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addPT = async () => {
    if (!newPTName.trim()) {
      showToast('error', 'Nama PT wajib diisi');
      return;
    }

    try {
      const { error } = await supabase.from('pt_master').insert({
        name: newPTName.trim(),
        code: newPTCode.trim() || null,
        is_active: true,
      });

      if (error) throw error;

      setNewPTName('');
      setNewPTCode('');

      showToast('success', 'PT berhasil ditambahkan');
     await Promise.all([
  loadData(),
  refresh(),
]);

  const updatePT = async (row: PTMaster) => {
    setSavingId(row.id);

    try {
      const { error } = await supabase
        .from('pt_master')
        .update({
          name: row.name,
          code: row.code || null,
          is_active: row.is_active,
        })
        .eq('id', row.id);

      if (error) throw error;

      showToast('success', 'Master PT berhasil diperbarui');
      await Promise.all([
  loadData(),
  refresh(),
]);
    } catch (e: any) {
      showToast('error', 'Gagal update PT: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const updateMatrix = async (row: GradeMatrixRow) => {
    setSavingId(row.id);

    try {
      const { error } = await supabase
        .from('travel_grade_matrix')
        .update({
          grade_name: row.grade_name,
          luar_kota: Number(row.luar_kota) || 0,
          kp1: Number(row.kp1) || 0,
          kp2: Number(row.kp2) || 0,
          kpo: Number(row.kpo) || 0,
          dk_25: Number(row.dk_25) || 0,
          dk_50: Number(row.dk_50) || 0,
          dk_100: Number(row.dk_100) || 0,
          hotel: Number(row.hotel) || 0,
          petty_cash: Number(row.petty_cash) || 0,
          is_active: row.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (error) throw error;

      showToast('success', `Matrix ${row.grade_name} berhasil disimpan`);
      await Promise.all([
  loadData(),
  refresh(),
]);
    } catch (e: any) {
      showToast('error', 'Gagal update matrix: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const updateSetting = async (row: TravelSetting) => {
    setSavingId(row.id);

    try {
      const { error } = await supabase
        .from('travel_settings')
        .update({
          nominal: Number(row.nominal) || 0,
          is_active: row.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (error) throw error;

      showToast('success', 'Travel setting berhasil diperbarui');
      await Promise.all([
  loadData(),
  refresh(),
]);
    } catch (e: any) {
      showToast('error', 'Gagal update setting: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  if (profile?.role !== 'HR Manager') {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Settings className="w-6 h-6" />}
          title="Akses ditolak"
          message="Master & Matrix hanya dapat diakses HR Manager."
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-sm text-slate-400 text-center">
          Loading master & matrix...
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up max-w-7xl mx-auto">

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Settings className="w-5 h-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Master & Matrix Management
          </h2>

          <p className="text-sm text-slate-500">
            Kelola PT, matrix biaya perjalanan dan setting insentif
          </p>
        </div>
      </div>

      {/* MASTER PT */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Master PT
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            {activePTCount} PT aktif. PT inactive tetap dipertahankan untuk histori.
          </p>
        </div>

        <div className="grid md:grid-cols-[1fr_200px_auto] gap-3 items-end">
          <Field label="Nama PT">
            <Input
              value={newPTName}
              onChange={(e) => setNewPTName(e.target.value)}
              placeholder="PT Nama Baru"
            />
          </Field>

          <Field label="Code">
            <Input
              value={newPTCode}
              onChange={(e) => setNewPTCode(e.target.value)}
              placeholder="Optional"
            />
          </Field>

          <Button
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={addPT}
          >
            Add PT
          </Button>
        </div>

        <div className="space-y-2">
          {ptMaster.map((pt) => (
            <div
              key={pt.id}
              className="grid md:grid-cols-[1fr_180px_120px_auto] gap-2 items-center rounded-xl border border-slate-200 p-3"
            >
              <Input
                value={pt.name}
                onChange={(e) =>
                  setPtMaster((rows) =>
                    rows.map((row) =>
                      row.id === pt.id
                        ? { ...row, name: e.target.value }
                        : row
                    )
                  )
                }
              />

              <Input
                value={pt.code ?? ''}
                onChange={(e) =>
                  setPtMaster((rows) =>
                    rows.map((row) =>
                      row.id === pt.id
                        ? { ...row, code: e.target.value }
                        : row
                    )
                  )
                }
                placeholder="Code"
              />

              <button
                type="button"
                onClick={() =>
                  setPtMaster((rows) =>
                    rows.map((row) =>
                      row.id === pt.id
                        ? { ...row, is_active: !row.is_active }
                        : row
                    )
                  )
                }
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  pt.is_active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {pt.is_active ? (
                  <ToggleRight className="w-4 h-4" />
                ) : (
                  <ToggleLeft className="w-4 h-4" />
                )}

                {pt.is_active ? 'Active' : 'Inactive'}
              </button>

              <Button
                size="sm"
                variant="secondary"
                icon={<Save className="w-3.5 h-3.5" />}
                disabled={savingId === pt.id}
                onClick={() => updatePT(pt)}
              >
                Save
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* GRADE MATRIX */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Matrix Biaya Perjalanan Dinas
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Nominal ini menjadi default calculation. HR tetap dapat override saat Cost & Advance Review.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1500px] w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 p-2 text-left">Grade</th>
                <th className="border border-slate-200 p-2">LK</th>
                <th className="border border-slate-200 p-2">KP1</th>
                <th className="border border-slate-200 p-2">KP2</th>
                <th className="border border-slate-200 p-2">KPO</th>
                <th className="border border-slate-200 p-2">DK 25</th>
                <th className="border border-slate-200 p-2">DK 50</th>
                <th className="border border-slate-200 p-2">DK 100</th>
                <th className="border border-slate-200 p-2">Hotel</th>
                <th className="border border-slate-200 p-2">Pettycash</th>
                <th className="border border-slate-200 p-2">Status</th>
                <th className="border border-slate-200 p-2">Action</th>
              </tr>
            </thead>

            <tbody>
              {matrix.map((row) => (
                <tr key={row.id}>
                  <td className="border border-slate-200 p-1.5 min-w-[220px]">
                    <Input
                      value={row.grade_name}
                      onChange={(e) =>
                        setMatrix((rows) =>
                          rows.map((r) =>
                            r.id === row.id
                              ? { ...r, grade_name: e.target.value }
                              : r
                          )
                        )
                      }
                    />
                  </td>

                  {[
                    'luar_kota',
                    'kp1',
                    'kp2',
                    'kpo',
                    'dk_25',
                    'dk_50',
                    'dk_100',
                    'hotel',
                    'petty_cash',
                  ].map((key) => (
                    <td
                      key={key}
                      className="border border-slate-200 p-1.5 min-w-[130px]"
                    >
                      <Input
                        type="number"
                        min={0}
                        value={Number(row[key as keyof GradeMatrixRow]) || 0}
                        onChange={(e) =>
                          setMatrix((rows) =>
                            rows.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    [key]: parseFloat(e.target.value) || 0,
                                  }
                                : r
                            )
                          )
                        }
                      />
                    </td>
                  ))}

                  <td className="border border-slate-200 p-2 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setMatrix((rows) =>
                          rows.map((r) =>
                            r.id === row.id
                              ? { ...r, is_active: !r.is_active }
                              : r
                          )
                        )
                      }
                      className={`px-2 py-1 rounded-lg font-semibold ${
                        row.is_active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {row.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>

                  <td className="border border-slate-200 p-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Save className="w-3.5 h-3.5" />}
                      disabled={savingId === row.id}
                      onClick={() => updateMatrix(row)}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* DRIVER SETTINGS */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            Driver Incentive Settings
          </h3>

          <p className="text-xs text-slate-500 mt-1">
            Insentif jarak berlaku flat per trip, bukan per hari.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {settings.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 p-4 space-y-3"
            >
              <div>
                <div className="text-xs font-bold text-slate-700">
                  {row.setting_name}
                </div>

                <div className="text-[11px] text-slate-400 mt-1">
                  Current: {formatIDR(Number(row.nominal) || 0)}
                </div>
              </div>

              <Input
                type="number"
                min={0}
                value={row.nominal}
                onChange={(e) =>
                  setSettings((rows) =>
                    rows.map((r) =>
                      r.id === row.id
                        ? {
                            ...r,
                            nominal: parseFloat(e.target.value) || 0,
                          }
                        : r
                    )
                  )
                }
              />

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSettings((rows) =>
                      rows.map((r) =>
                        r.id === row.id
                          ? { ...r, is_active: !r.is_active }
                          : r
                      )
                    )
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    row.is_active
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {row.is_active ? 'Active' : 'Inactive'}
                </button>

                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Save className="w-3.5 h-3.5" />}
                  disabled={savingId === row.id}
                  onClick={() => updateSetting(row)}
                >
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
