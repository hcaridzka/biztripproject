import { useState, useEffect } from 'react';
import { Users, Plus, Shield, Building2, KeyRound, Trash2, Edit3, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field } from './ui-shared';
import { PT_OPTIONS, JABATAN_LEVELS, ALL_ROLES } from '../lib/constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { Profile, Role, Jabatan } from '../lib/types';

export function UserManagement() {
  const { profile } = useAuth();
  const { showToast, refresh } = useApp();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  // State Form Add User
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    nip: '',
    role: 'Employee' as Role,
    jabatan: 'Staff' as Jabatan,
    pt_access: [] as string[],
    is_super_admin: false,
  });

  // State Form Edit User
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    nip: '',
    role: 'Employee' as Role,
    jabatan: 'Staff' as Jabatan,
    pt_access: [] as string[],
    is_super_admin: false,
  });

  // State Reset Password Inline
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) {
      showToast('error', 'Gagal load users: ' + error.message);
    } else {
      setUsers((data ?? []) as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Helper Toggle PT Access Selection
  const togglePTSelection = (pt: string, currentList: string[]) => {
    if (currentList.includes(pt)) {
      return currentList.filter((p) => p !== pt);
    } else {
      return [...currentList, pt];
    }
  };

  // 1. ADD USER SINKRON DENGAN EDGE FUNCTION
  const handleCreateUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      showToast('error', 'Nama, Email, dan Password wajib diisi!');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'create',
          email: newUser.email,
          password: newUser.password,
          name: newUser.name,
          nip: newUser.nip,
          role: newUser.role,
          jabatan: newUser.jabatan,
          pt_access: newUser.pt_access,
          is_super_admin: newUser.is_super_admin,
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      showToast('success', 'User berhasil ditambahkan dan disinkronkan!');
      setShowAdd(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        nip: '',
        role: 'Employee',
        jabatan: 'Staff',
        pt_access: [],
        is_super_admin: false,
      });
      loadUsers();
    } catch (err: any) {
      showToast('error', 'Gagal membuat user: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. EDIT USER SINKRON DENGAN EDGE FUNCTION
  const startEditUser = (u: Profile) => {
    setEditingUser(u);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      nip: u.nip || '',
      role: u.role || 'Employee',
      jabatan: u.jabatan || 'Staff',
      pt_access: u.pt_access || [],
      is_super_admin: u.is_super_admin || false,
    });
  };

  const handleUpdateUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingUser) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'update',
          userId: editingUser.id,
          name: editForm.name,
          email: editForm.email,
          nip: editForm.nip,
          role: editForm.role,
          jabatan: editForm.jabatan,
          pt_access: editForm.pt_access,
          is_super_admin: editForm.is_super_admin,
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      showToast('success', 'Data user berhasil diperbarui!');
      setEditingUser(null);
      loadUsers();
      refresh();
    } catch (err: any) {
      showToast('error', 'Gagal update user: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. DELETE USER SINKRON DENGAN EDGE FUNCTION
  const deleteUser = async (uid: string, userName: string) => {
    if (profile?.id === uid) {
      showToast('error', 'Anda tidak bisa menghapus akun Anda sendiri!');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus user "${userName}"? Semua data auth dan profil akan dihapus.`)) return;

    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'delete',
          userId: uid,
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      setUsers((prev) => prev.filter((u) => u.id !== uid));
      showToast('success', `User ${userName} berhasil dihapus`);
    } catch (e: any) {
      showToast('error', 'Gagal menghapus user: ' + e.message);
    }
  };

  // 4. RESET PASSWORD SINKRON DENGAN EDGE FUNCTION
  const handleResetPassword = async (uid: string) => {
    if (!newPassword || newPassword.length < 6) {
      showToast('error', 'Password baru minimal 6 karakter');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'change_email_password',
          userId: uid,
          newPassword: newPassword,
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error);
      }

      showToast('success', 'Password berhasil direset!');
      setTargetUserId(null);
      setNewPassword('');
    } catch (e: any) {
      showToast('error', 'Gagal merubah password: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <Users className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500">HR Manager · Kelola user, NIP, Jabatan, Akses Multi-Unit PT & Reset Password</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>
          Add User
        </Button>
      </div>

      {/* User List */}
      {loading ? (
        <Card className="p-6">
          <p className="text-sm text-slate-400 text-center">Loading Data Users...</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                    {u.name ? u.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                      {u.name}
                      {u.is_super_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">SUPER</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{u.role}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {u.email} {u.nip ? `· NIP: ${u.nip}` : ''} · <span className="font-medium text-slate-700">{u.jabatan}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Edit3 className="w-3.5 h-3.5 text-slate-600" />}
                    onClick={() => startEditUser(u)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<KeyRound className="w-3.5 h-3.5 text-slate-600" />}
                    onClick={() => {
                      setTargetUserId(targetUserId === u.id ? null : u.id);
                      setNewPassword('');
                    }}
                  >
                    {targetUserId === u.id ? 'Tutup' : 'Reset Password'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => deleteUser(u.id, u.name)}
                    disabled={profile?.id === u.id}
                  >
                    Hapus
                  </Button>
                </div>
              </div>

              {/* Form Reset Password Inline */}
              {targetUserId === u.id && (
                <div className="mt-4 p-3 bg-slate-50 rounded-xl ring-1 ring-slate-200 flex items-center gap-3 animate-slide-up">
                  <Input
                    type="password"
                    placeholder="Masukkan password baru (min. 6 karakter)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="flex-1 text-xs"
                  />
                  <Button size="sm" onClick={() => handleResetPassword(u.id)}>
                    Simpan Password
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTargetUserId(null);
                      setNewPassword('');
                    }}
                  >
                    Batal
                  </Button>
                </div>
              )}

              {/* Display PT Access */}
              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" /> Akses Multi-Unit PT:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.pt_access && u.pt_access.length > 0 ? (
                    u.pt_access.map((pt) => (
                      <span key={pt} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                        {pt}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">Tidak ada akses PT yang diset</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal / Form Add User */}
      {showAdd && (
        <Card className="p-6 space-y-4 ring-2 ring-brand-500">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-500" /> Add New User
            </h3>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nama Lengkap" required>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="John Doe" />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@company.com" />
              </Field>
              <Field label="Password Default" required>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Min 6 karakter" />
              </Field>
              <Field label="NIP (Nomor Induk Pegawai)">
                <Input value={newUser.nip} onChange={(e) => setNewUser({ ...newUser, nip: e.target.value })} placeholder="e.g. EMP-001" />
              </Field>
              <Field label="Role App" required>
                <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jabatan / Level" required>
                <Select value={newUser.jabatan} onChange={(e) => setNewUser({ ...newUser, jabatan: e.target.value as Jabatan })}>
                  {JABATAN_LEVELS.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Dropdown Input Pilihan PT Access */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Akses Multi-Unit PT (Pilih Satu atau Lebih)</label>
              <div className="p-3 border rounded-xl bg-slate-50 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PT_OPTIONS.map((pt) => {
                    const isChecked = newUser.pt_access.includes(pt);
                    return (
                      <label
                        key={pt}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition',
                          isChecked ? 'bg-brand-50 border-brand-500 text-brand-700 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setNewUser({ ...newUser, pt_access: togglePTSelection(pt, newUser.pt_access) })}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        <span>{pt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Memproses...' : 'Create User'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Modal / Form Edit User */}
      {editingUser && (
        <Card className="p-6 space-y-4 ring-2 ring-blue-500">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-500" /> Edit User ({editingUser.name})
            </h3>
            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Nama Lengkap" required>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </Field>
              <Field label="NIP">
                <Input value={editForm.nip} onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })} />
              </Field>
              <Field label="Role App" required>
                <Select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jabatan / Level" required>
                <Select value={editForm.jabatan} onChange={(e) => setEditForm({ ...editForm, jabatan: e.target.value as Jabatan })}>
                  {JABATAN_LEVELS.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Dropdown Input Pilihan PT Access Edit Form */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Akses Multi-Unit PT</label>
              <div className="p-3 border rounded-xl bg-slate-50 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PT_OPTIONS.map((pt) => {
                    const isChecked = editForm.pt_access.includes(pt);
                    return (
                      <label
                        key={pt}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition',
                          isChecked ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setEditForm({ ...editForm, pt_access: togglePTSelection(pt, editForm.pt_access) })}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{pt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditingUser(null)}>
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
