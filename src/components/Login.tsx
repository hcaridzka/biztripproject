import { useState } from 'react';
import { Building2, Mail, Lock, ArrowRight, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from './ui-shared';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../lib/constants';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setError('');
    const { error } = await signIn(em, pw);
    if (error) setError(error);
    setBusy(false);
  };

  const quickLogin = (em: string) => {
    setEmail(em);
    setPassword(DEMO_PASSWORD);
    doLogin(em, DEMO_PASSWORD);
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
          <p className="text-brand-300 text-xs mt-8">© 2025 Aridzka Group. All rights reserved.</p>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white shadow-lg mb-3">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 text-center">Aridzka Group<br />Business Trips</h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Welcome Back</h2>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account to continue</p>

          <form onSubmit={(e) => { e.preventDefault(); doLogin(email, password); }} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="pl-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Password</label>
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

          {/* Quick login buttons */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3">
              <Zap className="w-3.5 h-3.5 text-amber-500" /> Quick Demo Login
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} onClick={() => quickLogin(a.email)} disabled={busy}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold ring-1 ring-slate-200 bg-white text-slate-700 hover:bg-brand-50 hover:ring-brand-300 hover:text-brand-700 transition disabled:opacity-50">
                  {a.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 text-center">Password: {DEMO_PASSWORD}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
