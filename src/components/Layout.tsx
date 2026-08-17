import { ReactNode, useState } from 'react';
import {
  Building2, FilePlus, ClipboardList, CheckSquare, Truck, BarChart3,
  LogOut, ChevronDown, Users, MapPin, RefreshCw, Settings, ListChecks,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';
import { DEMO_ACCOUNTS } from '../lib/constants';
import type { Role } from '../lib/types';

export type ViewKey =
  | 'dashboard'
  | 'new-request'
  | 'my-trips'
  | 'approval'
  | 'pic-obligo'
  | 'cost-review'
  | 'settlement'
  | 'settlement-review'
  | 'summary'
  | 'trip-management'
  | 'user-management'
  | 'vehicles'
  | 'print-advance'
  | 'print-settlement'
  | 'account'
  | 'matrix-management';

interface NavItem { key: ViewKey; label: string; icon: ReactNode; roles: Role[]; }

/*
 * Urutan menu mengikuti prioritas proses kerja, bukan alfabet:
 * dashboard -> approval/processing -> reporting -> master/admin -> account.
 * Untuk HR Manager, NAV ditampilkan seluruhnya dengan urutan ini.
 */
const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4.5 h-4.5" />, roles: ['Employee', 'Manager', 'PIC Obligo', 'Direksi', 'HR Manager'] },

  { key: 'approval', label: 'Approval Queue', icon: <CheckSquare className="w-4.5 h-4.5" />, roles: ['Manager', 'Direksi', 'HR Manager'] },
  { key: 'pic-obligo', label: 'Assign Vehicle & Driver', icon: <Truck className="w-4.5 h-4.5" />, roles: ['PIC Obligo', 'HR Manager'] },
  { key: 'cost-review', label: 'Cost & Advance Review', icon: <ClipboardList className="w-4.5 h-4.5" />, roles: ['HR Manager'] },
  { key: 'settlement-review', label: 'Settlement Review', icon: <ClipboardList className="w-4.5 h-4.5" />, roles: ['HR Manager'] },
  { key: 'trip-management', label: 'Trip Management', icon: <ListChecks className="w-4.5 h-4.5" />, roles: ['HR Manager'] },

  { key: 'new-request', label: 'New Trip Request', icon: <FilePlus className="w-4.5 h-4.5" />, roles: ['Employee', 'HR Manager'] },
  { key: 'my-trips', label: 'My Trips', icon: <MapPin className="w-4.5 h-4.5" />, roles: ['Employee', 'HR Manager'] },
  { key: 'settlement', label: 'Settlement Report', icon: <ClipboardList className="w-4.5 h-4.5" />, roles: ['Employee', 'HR Manager'] },
  { key: 'summary', label: 'Monthly Summary', icon: <BarChart3 className="w-4.5 h-4.5" />, roles: ['Manager', 'Direksi', 'HR Manager'] },

  { key: 'vehicles', label: 'Fleet Management', icon: <Truck className="w-4.5 h-4.5" />, roles: ['PIC Obligo', 'HR Manager'] },
  { key: 'matrix-management', label: 'Master & Matrix', icon: <Settings className="w-4.5 h-4.5" />, roles: ['HR Manager'] },
  { key: 'user-management', label: 'User Management', icon: <Users className="w-4.5 h-4.5" />, roles: ['HR Manager'] },
  { key: 'account', label: 'My Account', icon: <Settings className="w-4.5 h-4.5" />, roles: ['Employee', 'Manager', 'PIC Obligo', 'Direksi', 'HR Manager'] },
];

export function Layout({ view, setView, children }: { view: ViewKey; setView: (v: ViewKey) => void; children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { showToast } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  if (!profile) return null;

  const items = profile.role === 'HR Manager'
    ? NAV
    : NAV.filter((n) => n.roles.includes(profile.role));

  const handleSignOut = async () => {
    await signOut();
    showToast('info', 'Signed out');
  };

  const switchRole = async (email: string, label: string) => {
    setRoleOpen(false);
    const { signIn } = useAuth();
    const { error } = await signIn(email, 'Aridzka2025!');
    if (error) showToast('error', 'Gagal switch: ' + error);
    else showToast('success', `Switched to ${label}`);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className={cn('fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white shadow-sm ring-1 ring-brand-700/20">
              <Building2 className="w-5 h-5" strokeWidth={2} />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 leading-tight">Aridzka Group</div>
              <div className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Business Trips</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {items.map((item) => (
            <button key={item.key} onClick={() => { setView(item.key); setMenuOpen(false); }}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                view === item.key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
              <span className={cn(view === item.key ? 'text-brand-600' : 'text-slate-400')}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
              {profile.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{profile.name}</div>
              <div className="text-[11px] text-slate-400">{profile.role}</div>
            </div>
          </div>
          <button onClick={handleSignOut} className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {menuOpen && <div className="fixed inset-0 bg-slate-900/30 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 flex items-center justify-between sticky top-0 z-20">
          <button onClick={() => setMenuOpen(true)} className="lg:hidden text-slate-500">
            <ChevronDown className="w-5 h-5 rotate-90" />
          </button>
          <h1 className="text-base font-bold text-slate-900 capitalize">
            {NAV.find((n) => n.key === view)?.label ?? 'Dashboard'}
          </h1>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden sm:inline">{profile.email}</span>
            {profile.role === 'HR Manager' && (
              <div className="relative">
                <button onClick={() => setRoleOpen((o) => !o)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl ring-1 ring-slate-200 hover:bg-slate-50 transition text-slate-600 font-semibold">
                  <RefreshCw className="w-3.5 h-3.5" /> Switch Role
                  <ChevronDown className={cn('w-3 h-3 transition', roleOpen && 'rotate-180')} />
                </button>
                {roleOpen && (
                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 py-1 z-50">
                    {DEMO_ACCOUNTS.map((a) => (
                      <button key={a.email} onClick={() => switchRole(a.email, a.label)} disabled={a.email === profile.email}
                        className={cn('w-full text-left px-3 py-2 text-xs hover:bg-brand-50 transition', a.email === profile.email ? 'text-slate-300 font-semibold' : 'text-slate-700')}>
                        {a.label}{a.email === profile.email ? ' ✓' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
