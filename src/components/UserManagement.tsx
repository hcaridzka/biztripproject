import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Shield,
  Building2,
  KeyRound,
  Trash2,
  Edit3,
  X,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  Card,
  Button,
  Input,
  Select,
  Field,
  EmptyState,
} from './ui-shared';

import { JABATAN_LEVELS, ALL_ROLES } from '../lib/constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

import type {
  Profile,
  Role,
  Jabatan,
} from '../lib/types';

type PTMaster = {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
};

type UserForm = {
  name: string;
  email: string;
  nip: string;
  role: Role;
  jabatan: Jabatan;
  pt_unit: string;
  pt_access: string[];
  is_super_admin: boolean;
  is_demo: boolean;
};

const EMPTY_USER_FORM: UserForm = {
  name: '',
  email: '',
  nip: '',
  role: 'Employee',
  jabatan: 'Staff',
  pt_unit: '',
  pt_access: [],
  is_super_admin: false,
  is_demo: false,
};

export function UserManagement() {
  const { profile } = useAuth();
  const { showToast, refresh } = useApp();

  const [users, setUsers] = useState<Profile[]>([]);
  const [ptMaster, setPtMaster] = useState<PTMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState('');

  /*
   * ADD USER
   */
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState<UserForm>(EMPTY_USER_FORM);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  /*
   * EDIT USER
   */
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_USER_FORM);

  /*
   * CHANGE PASSWORD
   */
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const activePT = useMemo(
    () => ptMaster.filter((pt) => pt.is_active),
    [ptMaster]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return users;

    return users.filter((u) =>
      [
        u.name,
        u.email,
        u.nip,
        u.role,
        u.jabatan,
        u.pt_unit,
        ...(u.pt_access ?? []),
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(q)
        )
    );
  }, [users, search]);

  const loadUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      showToast('error', 'Gagal load users: ' + error.message);
      return;
    }

    setUsers((data ?? []) as Profile[]);
  };

  const loadPTMaster = async () => {
    const { data, error } = await supabase
      .from('pt_master')
      .select('id, name, code, is_active')
      .order('name', { ascending: true });

    if (error) {
      showToast('error', 'Gagal load master PT: ' + error.message);
      return;
    }

    setPtMaster((data ?? []) as PTMaster[]);
  };

  const loadData = async () => {
    setLoading(true);

    try {
      await Promise.all([
        loadUsers(),
        loadPTMaster(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const invokeManageUser = async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke(
      'manage-user',
      { body }
    );

    if (error) {
      throw new Error(error.message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  };

  const togglePTSelection = (
    pt: string,
    currentList: string[]
  ) => {
    if (currentList.includes(pt)) {
      return currentList.filter((p) => p !== pt);
    }

    return [...currentList, pt];
  };

  /*
   * CREATE
   */
  const handleCreateUser = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!newUser.name.trim()) {
      showToast('error', 'Nama wajib diisi');
      return;
    }

    if (!newUser.email.trim()) {
      showToast('error', 'Email wajib diisi');
      return;
    }

    if (newUserPassword.length < 8) {
      showToast('error', 'Password default minimal 8 karakter');
      return;
    }

    if (!newUser.pt_unit && !newUser.is_super_admin) {
      showToast('error', 'PT Unit wajib dipilih');
      return;
    }

    if (
      !newUser.is_super_admin &&
      newUser.pt_access.length === 0
    ) {
      showToast('error', 'Minimal pilih 1 PT Access');
      return;
    }

    setIsSubmitting(true);

    try {
      await invokeManageUser({
        action: 'create',
        email: newUser.email,
        password: newUserPassword,
        name: newUser.name,
        nip: newUser.nip || null,
        role: newUser.role,
        jabatan: newUser.jabatan,
        pt_unit: newUser.is_super_admin
          ? null
          : newUser.pt_unit,
        pt_access: newUser.is_super_admin
          ? []
          : newUser.pt_access,
        is_super_admin: newUser.is_super_admin,
        is_demo: newUser.is_demo,
      });

      showToast('success', 'User berhasil dibuat');

      setNewUser(EMPTY_USER_FORM);
      setNewUserPassword('');
      setShowAdd(false);

      await loadUsers();
      refresh();
    } catch (e: any) {
      showToast(
        'error',
        'Gagal membuat user: ' + e.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * EDIT
   */
  const startEditUser = (u: Profile) => {
    setEditingUser(u);

    setEditForm({
      name: u.name || '',
      email: u.email || '',
      nip: u.nip || '',
      role: u.role || 'Employee',
      jabatan: u.jabatan || 'Staff',
      pt_unit: u.pt_unit || '',
      pt_access: u.pt_access || [],
      is_super_admin: u.is_super_admin || false,
      is_demo: u.is_demo || false,
    });
  };

  const handleUpdateUser = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!editingUser) return;

    if (!editForm.name.trim()) {
      showToast('error', 'Nama wajib diisi');
      return;
    }

    if (!editForm.email.trim()) {
      showToast('error', 'Email wajib diisi');
      return;
    }

    if (!editForm.pt_unit && !editForm.is_super_admin) {
      showToast('error', 'PT Unit wajib dipilih');
      return;
    }

    if (
      !editForm.is_super_admin &&
      editForm.pt_access.length === 0
    ) {
      showToast('error', 'Minimal pilih 1 PT Access');
      return;
    }

    setIsSubmitting(true);

    try {
      await invokeManageUser({
        action: 'update',
        userId: editingUser.id,
        email: editForm.email,
        name: editForm.name,
        nip: editForm.nip || null,
        role: editForm.role,
        jabatan: editForm.jabatan,
        pt_unit: editForm.is_super_admin
          ? null
          : editForm.pt_unit,
        pt_access: editForm.is_super_admin
          ? []
          : editForm.pt_access,
        is_super_admin: editForm.is_super_admin,
        is_demo: editForm.is_demo,
      });

      showToast('success', 'Data user berhasil diperbarui');

      setEditingUser(null);

      await loadUsers();
      refresh();
    } catch (e: any) {
      showToast(
        'error',
        'Gagal update user: ' + e.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * PASSWORD
   */
  const handleChangePassword = async () => {
    if (!passwordUser) return;

    if (newPassword.length < 8) {
      showToast('error', 'Password minimal 8 karakter');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('error', 'Konfirmasi password tidak sama');
      return;
    }

    setIsSubmitting(true);

    try {
      await invokeManageUser({
        action: 'change_password',
        userId: passwordUser.id,
        newPassword,
      });

      showToast(
        'success',
        `Password ${passwordUser.name} berhasil diperbarui`
      );

      setPasswordUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      showToast(
        'error',
        'Gagal mengubah password: ' + e.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * DELETE
   */
  const deleteUser = async (u: Profile) => {
    if (profile?.id === u.id) {
      showToast(
        'error',
        'Anda tidak dapat menghapus akun Anda sendiri'
      );
      return;
    }

    const confirmed = window.confirm(
      `Hapus user "${u.name}" secara permanen?\n\n` +
        `Akun Auth dan Profile akan dihapus.`
    );

    if (!confirmed) return;

    setIsSubmitting(true);

    try {
      await invokeManageUser({
        action: 'delete',
        userId: u.id,
      });

      showToast(
        'success',
        `User ${u.name} berhasil dihapus`
      );

      await loadUsers();
      refresh();
    } catch (e: any) {
      showToast(
        'error',
        'Gagal menghapus user: ' + e.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (profile?.role !== 'HR Manager') {
    return (
      <Card className="p-6">
        <EmptyState
          icon={<Shield className="w-6 h-6" />}
          title="Akses ditolak"
          message="User Management hanya dapat diakses oleh HR Manager."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">

      {/* HEADER */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Users className="w-5 h-5" />
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">
            User Management
          </h2>

          <p className="text-sm text-slate-500">
            Kelola akun, role, jabatan, PT Unit, akses multi-unit dan password
          </p>
        </div>

        <Button
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowAdd(true)}
        >
          Add User
        </Button>
      </div>

      {/* SEARCH */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, NIP, role, jabatan atau PT..."
            className="pl-10"
          />
        </div>
      </Card>

      {/* USER LIST */}
      {loading ? (
        <Card className="p-6">
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading data users...
          </div>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title="User tidak ditemukan"
            message="Tidak ada user yang sesuai dengan pencarian."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => (
            <Card key={u.id} className="p-5">

              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">

                <div className="flex items-start gap-3 flex-1 min-w-0">

                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">
                    {u.name?.charAt(0).toUpperCase() || 'U'}
                  </div>

                  <div className="flex-1 min-w-0">

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">
                        {u.name}
                      </span>

                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                        {u.role}
                      </span>

                      {u.is_super_admin && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                          SUPER ADMIN
                        </span>
                      )}

                      {u.is_demo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                          DEMO
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 mt-1">
                      {u.email}
                      {u.nip ? ` · NIP ${u.nip}` : ''}
                      {u.jabatan ? ` · ${u.jabatan}` : ''}
                    </div>

                    <div className="grid md:grid-cols-2 gap-3 mt-4">

                      <div>
                        <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">
                          PT Unit
                        </div>

                        <div className="text-xs font-semibold text-slate-700">
                          {u.is_super_admin
                            ? 'All PT / Super Admin'
                            : u.pt_unit || '-'}
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">
                          PT Access
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {u.is_super_admin ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                              Semua PT
                            </span>
                          ) : u.pt_access?.length ? (
                            u.pt_access.map((pt) => (
                              <span
                                key={pt}
                                className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                              >
                                {pt}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">
                              Tidak ada akses PT
                            </span>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">

                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Edit3 className="w-3.5 h-3.5" />}
                    onClick={() => startEditUser(u)}
                  >
                    Edit
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<KeyRound className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setPasswordUser(u);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    Set Password
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-rose-600 hover:bg-rose-50"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    disabled={profile.id === u.id || isSubmitting}
                    onClick={() => deleteUser(u)}
                  >
                    Delete
                  </Button>

                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ADD USER */}
      {showAdd && (
        <Card className="p-6 space-y-5 ring-2 ring-brand-500">

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Add New User
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Akun akan dibuat sekaligus di Supabase Auth dan Profiles.
              </p>
            </div>

            <button
              onClick={() => setShowAdd(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={handleCreateUser}
            className="space-y-5"
          >
            <UserFormFields
              form={newUser}
              setForm={setNewUser}
              activePT={activePT}
              togglePTSelection={togglePTSelection}
            />

            <Field label="Password Default" required>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newUserPassword}
                  onChange={(e) =>
                    setNewUserPassword(e.target.value)
                  }
                  placeholder="Minimal 8 karakter"
                  className="pr-10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowNewPassword((v) => !v)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Creating...'
                  : 'Create User'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* EDIT USER */}
      {editingUser && (
        <Card className="p-6 space-y-5 ring-2 ring-sky-500">

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Edit User
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Perubahan email akan disinkronkan ke Supabase Auth dan Profile.
              </p>
            </div>

            <button
              onClick={() => setEditingUser(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form
            onSubmit={handleUpdateUser}
            className="space-y-5"
          >
            <UserFormFields
              form={editForm}
              setForm={setEditForm}
              activePT={activePT}
              togglePTSelection={togglePTSelection}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Saving...'
                  : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* PASSWORD */}
      {passwordUser && (
        <Card className="p-6 space-y-4 ring-2 ring-amber-400">

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Set Password
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                {passwordUser.name} · {passwordUser.email}
              </p>
            </div>

            <button
              onClick={() => setPasswordUser(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">

            <Field label="Password Baru" required>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(e.target.value)
                  }
                  placeholder="Minimal 8 karakter"
                  className="pr-10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((v) => !v)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </Field>

            <Field label="Konfirmasi Password" required>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder="Ulangi password baru"
              />
            </Field>

          </div>

          <div className="flex justify-end gap-2">

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPasswordUser(null)}
            >
              Cancel
            </Button>

            <Button
              size="sm"
              icon={<KeyRound className="w-3.5 h-3.5" />}
              disabled={
                isSubmitting ||
                !newPassword ||
                !confirmPassword
              }
              onClick={handleChangePassword}
            >
              {isSubmitting
                ? 'Saving...'
                : 'Update Password'}
            </Button>

          </div>
        </Card>
      )}
    </div>
  );
}

function UserFormFields({
  form,
  setForm,
  activePT,
  togglePTSelection,
}: {
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;
  activePT: PTMaster[];
  togglePTSelection: (
    pt: string,
    currentList: string[]
  ) => string[];
}) {
  return (
    <>
      <div className="grid md:grid-cols-2 gap-4">

        <Field label="Nama Lengkap" required>
          <Input
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                name: e.target.value,
              }))
            }
            placeholder="Nama lengkap"
          />
        </Field>

        <Field label="Email" required>
          <Input
            type="email"
            value={form.email}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                email: e.target.value,
              }))
            }
            placeholder="user@company.com"
          />
        </Field>

        <Field label="NIP">
          <Input
            value={form.nip}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                nip: e.target.value,
              }))
            }
            placeholder="Nomor Induk Pegawai"
          />
        </Field>

        <Field label="Role App" required>
          <Select
            value={form.role}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                role: e.target.value as Role,
              }))
            }
          >
            {ALL_ROLES.map((role) => (
              <option
                key={role}
                value={role}
              >
                {role}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Jabatan / Level" required>
          <Select
            value={form.jabatan}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                jabatan: e.target.value as Jabatan,
              }))
            }
          >
            {JABATAN_LEVELS.map((jabatan) => (
              <option
                key={jabatan}
                value={jabatan}
              >
                {jabatan}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="PT Unit">
          <Select
            value={form.pt_unit}
            disabled={form.is_super_admin}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                pt_unit: e.target.value,
              }))
            }
          >
            <option value="">
              Pilih PT Unit
            </option>

            {activePT.map((pt) => (
              <option
                key={pt.id}
                value={pt.name}
              >
                {pt.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid md:grid-cols-2 gap-4">

        <label className="rounded-xl border border-slate-200 p-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_super_admin}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                is_super_admin: e.target.checked,
                pt_unit: e.target.checked
                  ? ''
                  : prev.pt_unit,
                pt_access: e.target.checked
                  ? []
                  : prev.pt_access,
              }))
            }
            className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
          />

          <div>
            <div className="text-xs font-bold text-slate-700">
              Super Admin
            </div>

            <div className="text-[11px] text-slate-500 mt-0.5">
              Memiliki akses ke seluruh PT dan tidak dibatasi PT Access.
            </div>
          </div>
        </label>

        <label className="rounded-xl border border-slate-200 p-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_demo}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                is_demo: e.target.checked,
              }))
            }
            className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
          />

          <div>
            <div className="text-xs font-bold text-slate-700">
              Demo Account
            </div>

            <div className="text-[11px] text-slate-500 mt-0.5">
              Tandai jika akun hanya digunakan untuk testing/demo.
            </div>
          </div>
        </label>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-4 h-4 text-slate-400" />

          <label className="text-xs font-semibold text-slate-700">
            PT Access
          </label>
        </div>

        {form.is_super_admin ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
            Super Admin otomatis memiliki akses ke seluruh PT.
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

              {activePT.map((pt) => {
                const checked =
                  form.pt_access.includes(pt.name);

                return (
                  <label
                    key={pt.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition',
                      checked
                        ? 'bg-brand-50 border-brand-500 text-brand-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          pt_access:
                            togglePTSelection(
                              pt.name,
                              prev.pt_access
                            ),
                        }))
                      }
                      className="rounded text-brand-600 focus:ring-brand-500"
                    />

                    <span>{pt.name}</span>
                  </label>
                );
              })}

            </div>
          </div>
        )}
      </div>
    </>
  );
}
