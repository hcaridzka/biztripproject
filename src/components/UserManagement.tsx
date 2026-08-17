import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Shield, Building2, KeyRound, Trash2, Edit3, Search, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Select, Field, EmptyState, Modal } from './ui-shared';
import { JABATAN_LEVELS, ALL_ROLES } from '../lib/constants';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import type { Profile, Role, Jabatan } from '../lib/types';

type PTMaster = { id: string; name: string; code: string | null; is_active: boolean };
type UserForm = { name: string; email: string; nip: string; role: Role; jabatan: Jabatan; pt_unit: string; pt_access: string[]; is_super_admin: boolean; is_demo: boolean };

const EMPTY_USER_FORM: UserForm = { name: '', email: '', nip: '', role: 'Employee', jabatan: 'Staff', pt_unit: '', pt_access: [], is_super_admin: false, is_demo: false };

export function UserManagement() {
  const { profile } = useAuth();
  const { showToast, refresh } = useApp();
  const [users, setUsers] = useState<Profile[]>([]);
  const [ptMaster, setPtMaster] = useState<PTMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState<UserForm>(EMPTY_USER_FORM);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_USER_FORM);
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const activePT = useMemo(() => ptMaster.filter((pt) => pt.is_active), [ptMaster]);
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !q || [u.name, u.email, u.nip, u.role, u.jabatan, u.pt_unit, ...(u.pt_access ?? [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  }, [users, search]);

  const loadUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });
    if (error) { showToast('error', 'Gagal load users: ' + error.message); return; }
    setUsers((data ?? []) as Profile[]);
  };
  const loadPTMaster = async () => {
    const { data, error } = await supabase.from('pt_master').select('id, name, code, is_active').order('name', { ascending: true });
    if (error) { showToast('error', 'Gagal load master PT: ' + error.message); return; }
    setPtMaster((data ?? []) as PTMaster[]);
  };
  const loadData = async () => { setLoading(true); try { await Promise.all([loadUsers(), loadPTMaster()]); } finally { setLoading(false); } };
  useEffect(() => { loadData(); }, []);

  const invokeManageUser = async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('manage-user', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const togglePTSelection = (pt: string, list: string[]) => list.includes(pt) ? list.filter((p) => p !== pt) : [...list, pt];

  const handleCreateUser = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newUser.name.trim()) return showToast('error', 'Nama wajib diisi');
    if (!newUser.email.trim()) return showToast('error', 'Email wajib diisi');
    if (newUserPassword.length < 8) return showToast('error', 'Password default minimal 8 karakter');
    if (!newUser.pt_unit && !newUser.is_super_admin) return showToast('error', 'PT Unit wajib dipilih');
    setIsSubmitting(true);
    try {
      await invokeManageUser({ action: 'create', email: newUser.email, password: newUserPassword, name: newUser.name, nip: newUser.nip || null, role: newUser.role, jabatan: newUser.jabatan, pt_unit: newUser.is_super_admin ? null : newUser.pt_unit, pt_access: newUser.is_super_admin ? [] : newUser.pt_access, is_super_admin: newUser.is_super_admin, is_demo: newUser.is_demo });
      showToast('success', 'User berhasil dibuat'); setNewUser(EMPTY_USER_FORM); setNewUserPassword(''); setShowAdd(false); await loadUsers(); refresh();
    } catch (e: any) { showToast('error', 'Gagal membuat user: ' + e.message); } finally { setIsSubmitting(false); }
  };

  const startEditUser = (u: Profile) => { setEditingUser(u); setEditForm({ name: u.name || '', email: u.email || '', nip: u.nip || '', role: u.role || 'Employee', jabatan: u.jabatan || 'Staff', pt_unit: u.pt_unit || '', pt_access: u.pt_access || [], is_super_admin: u.is_super_admin || false, is_demo: u.is_demo || false }); };
  const handleUpdateUser = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!editingUser) return;
    if (!editForm.name.trim() || !editForm.email.trim()) return showToast('error', 'Nama dan email wajib diisi');
    if (!editForm.pt_unit && !editForm.is_super_admin) return showToast('error', 'PT Unit wajib dipilih');
    setIsSubmitting(true);
    try {
      await invokeManageUser({ action: 'update', userId: editingUser.id, email: editForm.email, name: editForm.name, nip: editForm.nip || null, role: editForm.role, jabatan: editForm.jabatan, pt_unit: editForm.is_super_admin ? null : editForm.pt_unit, pt_access: editForm.is_super_admin ? [] : editForm.pt_access, is_super_admin: editForm.is_super_admin, is_demo: editForm.is_demo });
      showToast('success', 'Data user berhasil diperbarui'); setEditingUser(null); await loadUsers(); refresh();
    } catch (e: any) { showToast('error', 'Gagal update user: ' + e.message); } finally { setIsSubmitting(false); }
  };

  const handleChangePassword = async () => {
    if (!passwordUser) return;
    if (newPassword.length < 8) return showToast('error', 'Password minimal 8 karakter');
    if (newPassword !== confirmPassword) return showToast('error', 'Konfirmasi password tidak sama');
    setIsSubmitting(true);
    try { await invokeManageUser({ action: 'change_password', userId: passwordUser.id, newPassword }); showToast('success', `Password ${passwordUser.name} berhasil diperbarui`); setPasswordUser(null); setNewPassword(''); setConfirmPassword(''); }
    catch (e: any) { showToast('error', 'Gagal mengubah password: ' + e.message); } finally { setIsSubmitting(false); }
  };

  const deleteUser = async (u: Profile) => {
    if (profile?.id === u.id) return showToast('error', 'Anda tidak dapat menghapus akun Anda sendiri');
    if (!window.confirm(`Hapus user "${u.name}" secara permanen?\n\nAkun Auth dan Profile akan dihapus.`)) return;
    setIsSubmitting(true);
    try { await invokeManageUser({ action: 'delete', userId: u.id }); showToast('success', `User ${u.name} berhasil dihapus`); await loadUsers(); refresh(); }
    catch (e: any) { showToast('error', 'Gagal menghapus user: ' + e.message); } finally { setIsSubmitting(false); }
  };

  if (profile?.role !== 'HR Manager') return <Card className="p-6"><EmptyState icon={<Shield className="w-6 h-6" />} title="Akses ditolak" message="User Management hanya dapat diakses oleh HR Manager." /></Card>;

  return (
    <div className="space-y-6 animate-slide-up max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><Users className="w-5 h-5" /></div>
        <div className="flex-1"><h2 className="text-xl font-bold text-slate-900">User Management</h2><p className="text-sm text-slate-500">Kelola akun, role, jabatan, PT Unit, akses multi-unit dan password</p></div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add User</Button>
      </div>

      <Card className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, email, NIP, role, jabatan atau PT..." className="pl-10" /></div></Card>

      {loading ? <Card className="p-6"><div className="flex items-center justify-center gap-2 text-sm text-slate-400"><RefreshCw className="w-4 h-4 animate-spin" />Loading data users...</div></Card> : filteredUsers.length === 0 ? <Card className="p-6"><EmptyState icon={<Users className="w-6 h-6" />} title="User tidak ditemukan" /></Card> : (
        <div className="space-y-3">{filteredUsers.map((u) => (
          <Card key={u.id} className="p-5"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0"><div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold shrink-0">{u.name?.charAt(0).toUpperCase() || 'U'}</div><div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-bold text-slate-800">{u.name}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">{u.role}</span>{u.is_super_admin && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">SUPER ADMIN</span>}{u.is_demo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">DEMO</span>}</div>
              <div className="text-xs text-slate-500 mt-1">{u.email}{u.nip ? ` · NIP ${u.nip}` : ''}{u.jabatan ? ` · ${u.jabatan}` : ''}</div>
              <div className="grid md:grid-cols-2 gap-3 mt-4"><div><div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">PT Unit</div><div className="text-xs font-semibold text-slate-700">{u.is_super_admin ? 'All PT / Super Admin' : u.pt_unit || '-'}</div></div><div><div className="text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-1">PT Access</div><div className="flex flex-wrap gap-1.5">{u.is_super_admin ? <span className="text-xs text-amber-700">Semua PT</span> : u.pt_access?.length ? u.pt_access.map((pt) => <span key={pt} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-50 text-brand-700 ring-1 ring-brand-200">{pt}</span>) : <span className="text-xs text-slate-400">Semua PT (unrestricted)</span>}</div></div></div>
            </div></div>
            <div className="flex items-center gap-2 flex-wrap"><Button size="sm" variant="secondary" icon={<Edit3 className="w-3.5 h-3.5" />} onClick={() => startEditUser(u)}>Edit</Button><Button size="sm" variant="secondary" icon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => { setPasswordUser(u); setNewPassword(''); setConfirmPassword(''); }}>Set Password</Button><Button size="sm" variant="secondary" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="w-3.5 h-3.5" />} disabled={profile.id === u.id || isSubmitting} onClick={() => deleteUser(u)}>Delete</Button></div>
          </div></Card>
        ))}</div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New User" size="xl"><form onSubmit={handleCreateUser} className="space-y-5"><UserFormFields form={newUser} setForm={setNewUser} activePT={activePT} togglePTSelection={togglePTSelection} /><Field label="Password Default" required><div className="relative"><Input type={showNewPassword ? 'text' : 'password'} value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Minimal 8 karakter" className="pr-10" /><button type="button" onClick={() => setShowNewPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button><Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create User'}</Button></div></form></Modal>

      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit User" size="xl"><form onSubmit={handleUpdateUser} className="space-y-5"><UserFormFields form={editForm} setForm={setEditForm} activePT={activePT} togglePTSelection={togglePTSelection} /><div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" onClick={() => setEditingUser(null)}>Cancel</Button><Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button></div></form></Modal>

      <Modal open={!!passwordUser} onClose={() => setPasswordUser(null)} title="Set Password" size="md"><div className="space-y-4"><p className="text-xs text-slate-500">{passwordUser?.name} · {passwordUser?.email}</p><Field label="Password Baru" required><Input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field><Field label="Konfirmasi Password" required><Input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></Field><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Tampilkan password</label><div className="flex justify-end gap-2"><Button variant="secondary" size="sm" onClick={() => setPasswordUser(null)}>Cancel</Button><Button size="sm" disabled={isSubmitting || !newPassword || !confirmPassword} onClick={handleChangePassword}>Update Password</Button></div></div></Modal>
    </div>
  );
}

function UserFormFields({ form, setForm, activePT, togglePTSelection }: { form: UserForm; setForm: React.Dispatch<React.SetStateAction<UserForm>>; activePT: PTMaster[]; togglePTSelection: (pt: string, currentList: string[]) => string[] }) {
  return <>
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Nama Lengkap" required><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
      <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></Field>
      <Field label="NIP"><Input value={form.nip} onChange={(e) => setForm((p) => ({ ...p, nip: e.target.value }))} /></Field>
      <Field label="Role App" required><Select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}>{ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
      <Field label="Jabatan / Level" required><Select value={form.jabatan} onChange={(e) => setForm((p) => ({ ...p, jabatan: e.target.value as Jabatan }))}>{JABATAN_LEVELS.map((j) => <option key={j} value={j}>{j}</option>)}</Select></Field>
      <Field label="PT Unit"><Select value={form.pt_unit} disabled={form.is_super_admin} onChange={(e) => setForm((p) => ({ ...p, pt_unit: e.target.value }))}><option value="">Pilih PT Unit</option>{activePT.map((pt) => <option key={pt.id} value={pt.name}>{pt.name}</option>)}</Select></Field>
    </div>
    <div className="grid md:grid-cols-2 gap-4"><label className="rounded-xl border border-slate-200 p-4 flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={form.is_super_admin} onChange={(e) => setForm((p) => ({ ...p, is_super_admin: e.target.checked, pt_unit: e.target.checked ? '' : p.pt_unit, pt_access: e.target.checked ? [] : p.pt_access }))} /><div><div className="text-xs font-bold text-slate-700">Super Admin</div><div className="text-[11px] text-slate-500">Akses seluruh PT.</div></div></label><label className="rounded-xl border border-slate-200 p-4 flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={form.is_demo} onChange={(e) => setForm((p) => ({ ...p, is_demo: e.target.checked }))} /><div><div className="text-xs font-bold text-slate-700">Demo Account</div><div className="text-[11px] text-slate-500">Akun testing/demo.</div></div></label></div>
    <div><div className="flex items-center gap-2 mb-2"><Building2 className="w-4 h-4 text-slate-400" /><label className="text-xs font-semibold text-slate-700">PT Access</label></div>{form.is_super_admin ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">Super Admin otomatis memiliki akses seluruh PT.</div> : <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><p className="text-[11px] text-slate-500 mb-2">Kosong = akses seluruh PT. Pilih PT hanya jika akses perlu dibatasi.</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{activePT.map((pt) => { const checked = form.pt_access.includes(pt.name); return <label key={pt.id} className={cn('flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition', checked ? 'bg-brand-50 border-brand-500 text-brand-700 font-semibold' : 'bg-white border-slate-200 text-slate-600')}><input type="checkbox" checked={checked} onChange={() => setForm((p) => ({ ...p, pt_access: togglePTSelection(pt.name, p.pt_access) }))} /><span>{pt.name}</span></label>; })}</div></div>}</div>
  </>;
}
