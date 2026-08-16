import { useState } from 'react';
import { KeyRound, User, Shield, Building2, Eye, EyeOff, Check } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Card, Button, Input, Field } from './ui-shared';
import { supabase } from '../lib/supabase';

export function AccountSettings() {
  const { profile } = useAuth();
  const { showToast } = useApp();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      showToast('error', 'Password baru minimal 8 karakter');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('error', 'Konfirmasi password tidak sama');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');

      showToast('success', 'Password berhasil diperbarui');
    } catch (e: any) {
      showToast('error', 'Gagal mengganti password: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
          <User className="w-5 h-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">My Account</h2>
          <p className="text-sm text-slate-500">
            Informasi akun dan pengaturan keamanan
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Account Information</h3>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <AccountInfo label="Nama" value={profile.name} />
          <AccountInfo label="Email" value={profile.email} />
          <AccountInfo label="NIP" value={profile.nip || '-'} />
          <AccountInfo label="Jabatan" value={profile.jabatan || '-'} />
          <AccountInfo label="Role" value={profile.role} />
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Akses Unit / PT
          </div>

          <div className="flex flex-wrap gap-1.5">
            {profile.is_super_admin ? (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold ring-1 ring-amber-200">
                Semua PT / Super Admin
              </span>
            ) : profile.pt_access?.length ? (
              profile.pt_access.map((pt) => (
                <span
                  key={pt}
                  className="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold ring-1 ring-brand-200"
                >
                  {pt}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">
                Belum ada akses PT
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-800">
              Change Password
            </h3>
          </div>

          <p className="text-xs text-slate-500 mt-1">
            Password diubah langsung melalui Supabase Authentication dan tidak disimpan di profile.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Password Baru" required>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                className="pr-10"
              />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </Field>

          <Field label="Konfirmasi Password Baru" required>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            icon={<Check className="w-3.5 h-3.5" />}
            disabled={!newPassword || !confirmPassword || saving}
            onClick={handleChangePassword}
          >
            {saving ? 'Menyimpan...' : 'Update Password'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AccountInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
      <div className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-800 mt-1">
        {value}
      </div>
    </div>
  );
}
