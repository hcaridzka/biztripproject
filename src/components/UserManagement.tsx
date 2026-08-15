import { useState, useEffect } from 'react';
import { Users, Plus, Shield, Building2, KeyRound } from 'lucide-react';
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
  
  // State for Add User
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'Employee' as Role, jabatan: 'Staff' as Jabatan, pt_access: [] as string[] });

  // State for Change/Reset Password Modal/Inline
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
    if (error) { showToast('error', 'Gagal load users: ' + error.message); return; }
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const togglePT = (pt: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(pt) ? list.filter((p) => p !== pt) : [...list, pt]);
  };

  const addUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) { showToast('error', 'Nama, email, password wajib diisi'); return; }
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email: newUser.email, password: newUser.password, email_confirm: true });
      if (authErr) { showToast('error', 'Gagal buat auth: ' + authErr.message); return; }
      const uid = authData.user.id;
      await supabase.from('profiles').update({ name: newUser.name, role: newUser.role, jabatan: newUser.jabatan, pt_access: newUser.pt_access, is_demo: false }).eq('id', uid);
      showToast('success', 'User berhasil dibuat');
      setShowAdd(false);
      setNewUser({ name: '', email: '', password: '', role: 'Employee', jabatan: 'Staff', pt_access: [] });
      loadUsers();
    } catch (e: any) { showToast('error', 'Gagal: ' + e.message); }
  };

  const updatePTAccess = async (uid: string, pt_access: string[]) => {
    const { error } = await supabase.from('profiles').update({ pt_access }).eq('id', uid);
    if (error) { showToast('error', 'Gagal: ' + error.message); return; }
    setUsers((u) => u.map((x) => x.id === uid ? { ...x, pt_access } : x));
    showToast('success', 'PT access diperbarui');
    refresh();
  };

  const updateRole = async (uid: string, role: Role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', uid);
    if (error) { showToast('error', 'Gagal: ' + error.message); return; }
    setUsers((u) => u.map((x) => x.id === uid ? { ...x, role } : x));
    showToast('success', 'Role diperbarui');
  };

  const handleResetPassword = async (uid: string) => {
    if (!newPassword || newPassword.length < 6) {
      showToast('error', 'Password baru minimal 6 karakter');
      return;
    }
    try {
      const { error } = await supabase.auth.admin.updateUserById(uid, { password: newPassword });
      if (error) {
        showToast('error', 'Gagal merubah password: ' + error.message);
        return;
      }
      showToast('success', 'Password berhasil direset');
      setTargetUserId(null);
      setNewPassword('');
    } catch (e: any) {
      showToast('error', 'Gagal: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"><Users className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">User Management</h2>
          <p className="text-sm text-slate-500">HR Manager · Kelola user, akses Multi-Unit PT & Reset Password</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowAdd(true)}>Add User</Button>
      </div>

      {loading ? <Card className="p-6"><p className="text-sm text-slate-400 text-center">Loading...</p></Card> : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">{u.name.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{u.name} {u.is_super_admin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">SUPER</span>}</div>
                    <div className="text-xs text-slate-400">{u.email} · {u.jabatan}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={u.role} onChange={(e) => updateRole(u.id, e.target.value as Role)} className="w-36">
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    icon={<KeyRound className="w-3.5 h-3.5 text-slate-600" />} 
                    onClick={() => { setTargetUserId(targetUserId === u.id ? null : u.id); setNewPassword(''); }}
                  >
                    {targetUserId === u.id ? 'Tutup' : 'Reset Password'}
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
                  <Button size="sm" onClick={() => handleResetPassword(u.id)}>Simpan Password</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setTargetUserId(null); setNewPassword(''); }}>Batal</Button>
                </div>
              )}

              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Akses Multi-Unit PT</div>
                <div className="flex flex-wrap gap-1.5">
                  {PT_OPTIONS.map((pt) => {
                    const checked = u.pt_access?.includes(pt);
                    return <button key={pt} onClick={() => updatePTAccess(u.id, checked ? u.pt_access.filter((p) => p !== pt) : [...u.pt_access, pt])}
                      className={cn('px-2 py-1 rounded-lg text-[10px] font-semibold ring-1 transition', checked ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>{pt}</button>;
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Shield className="w-4 h-4 text-brand-500" /> Add New User</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nama" required><Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></Field>
            <Field label="Email" required><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></Field>
            <Field label="Password" required><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></Field>
            <Field label="Role" required>
              <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}>{ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select>
            </Field>
            <Field label="Jabatan/Grade" required>
              <Select value={newUser.jabatan} onChange={(e) => setNewUser({ ...newUser, jabatan: e.target.value as Jabatan })}>{JABATAN_LEVELS.map((j) => <option key={j} value={j}>{j}</option>)}</Select>
            </Field>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">Akses Multi-Unit PT</div>
            <div className="flex flex-wrap gap-1.5">
              {PT_OPTIONS.map((pt) => <button key={pt} onClick={() => togglePT(pt, newUser.pt_access, (v) => setNewUser({ ...newUser, pt_access: v }))}
                className={cn('px-2 py-1 rounded-lg text-[10px] font-semibold ring-1 transition', newUser.pt_access.includes(pt) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50')}>{pt}</button>)}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={addUser}>Create User</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
