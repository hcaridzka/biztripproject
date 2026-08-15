import { useState } from 'react';
import { Building2, Mail, Lock, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Button, Input } from './ui-shared';
import { supabase } from '../lib/supabase';

export function Login() {
  const { signIn } = useAuth();
  const { showToast } = useApp();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  
  // State untuk mode tampilan
  const [mode, setMode] = useState<'login' | 'forgot' | 'update_password'>('login');
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    const { data, error: signInError } = await signIn(email, password);
    
    if (signInError) {
      setError(signInError);
      setBusy(false);
      return;
    }

    // Cek apakah user menggunakan password default (password123) atau flag khusus
    // Jika password yang dimasukkan pertama kali adalah password default, arahkan ganti password
    if (password === 'password123') {
      setIsFirstLogin(true);
      setMode('update_password');
      setBusy(false);
      showToast('info', 'Silakan perbarui password default Anda demi keamanan.');
      return;
    }

    setBusy(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('Password baru minimal 6 karakter.');
      return;
    }

    setBusy(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    
    if (updateError) {
      setError('Gagal memperbarui password: ' + updateError.message);
      setBusy(false);
      return;
    }

    showToast('success', 'Password berhasil diperbarui! Selamat datang.');
    setBusy(false);
    // Setelah update, aplikasi akan otomatis mendeteksi sesi aktif di useAuth
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Masukkan email Anda terlebih dahulu.');
      return;
    }

    setBusy(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (resetError) {
      setError('Gagal mengirim link reset: ' + resetError.message);
    } else {
      showToast('success', 'Instruksi pemulihan password telah dikirim ke email Anda.');
      setMode('login');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - clean branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-900 to-slate-900">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-brand-500 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-brand-700 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center p-12 text-white text-center">
          <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20 shadow-2xl mb-8">
            <Building2 className="w-12 h-12" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Aridzka Group<br />Business Trips
          </h1>
          <p className="text-brand-300 text-xs mt-8">© 2026 Aridzka Group. All rights reserved.</p>
        </div>
      </div>

      {/* Right panel - dynamic form container */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white shadow-lg mb-3">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 text-center">Aridzka Group<br />Business Trips</h1>
          </div>

          {/* MODE 1: STANDARD LOGIN */}
          {mode === 'login' && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
              <p className="text-sm text-slate-500 mt-1">Sign in to your account to continue</p>

              <form onSubmit={doLogin} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-600">Password</label>
                    <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-xs text-brand-600 hover:underline font-medium">
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10" />
                  </div>
                </div>

                {error && <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

                <Button type="submit" disabled={busy} className="w-full" icon={<ArrowRight className="w-4 h-4" />}>
                  {busy ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </>
          )}

          {/* MODE 2: FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">Reset Password</h2>
              <p className="text-sm text-slate-500 mt-1">Masukkan email Anda untuk menerima instruksi pemulihan password</p>

              <form onSubmit={handleForgotPassword} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" />
                  </div>
                </div>

                {error && <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Sending...' : 'Send Reset Instructions'}
                </Button>

                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-center text-xs text-slate-500 hover:text-slate-800 font-medium pt-2">
                  Kembali ke halaman login
                </button>
              </form>
            </>
          )}

          {/* MODE 3: UPDATE PASSWORD FIRST LOGIN */}
          {mode === 'update_password' && (
            <>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4 ring-1 ring-amber-200">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Perbarui Password</h2>
              <p className="text-sm text-slate-500 mt-1">Karena ini adalah login pertama Anda dengan password sementara (default), silakan buat password baru yang aman.</p>

              <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-600">Password Baru</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimal 6 karakter" className="pl-10" />
                  </div>
                </div>

                {error && <div className="rounded-xl bg-rose-50 ring-1 ring-rose-200 px-4 py-3 text-sm text-rose-700">{error}</div>}

                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Menyimpan...' : 'Simpan Password Baru'}
                </Button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
