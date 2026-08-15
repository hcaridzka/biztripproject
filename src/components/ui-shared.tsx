import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn, formatIDR } from '../lib/utils';
import { STATUS_META } from '../lib/constants';
import type { TripStatus } from '../lib/types';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bg-white rounded-2xl ring-1 ring-slate-200/70 shadow-sm', className)}>{children}</div>;
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  icon?: ReactNode;
}
export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: BtnProps) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' };
  return (
    <button className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed', variants[variant], sizes[size], className)} {...rest}>
      {icon}{children}
    </button>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { }
export function Input({ className, ...rest }: InputProps) {
  return <input className={cn('w-full rounded-xl border-0 ring-1 ring-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 transition', className)} {...rest} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { }
export function Select({ className, children, ...rest }: SelectProps) {
  return <select className={cn('w-full rounded-xl border-0 ring-1 ring-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-brand-500 transition bg-white', className)} {...rest}>{children}</select>;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> { }
export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cn('w-full rounded-xl border-0 ring-1 ring-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 transition', className)} {...rest} />;
}

export function Field({ label, required, children, hint }: { label: string; required?: boolean; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600">{label} {required && <span className="text-rose-500">*</span>}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: TripStatus }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold', meta.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

export function EmptyState({ icon, title, message }: { icon?: ReactNode; title: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {message && <p className="text-xs text-slate-400 mt-1">{message}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto', sizes[size])}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ToastHost({ toasts, onDismiss }: { toasts: { id: string; type: 'success' | 'error' | 'info'; message: string }[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((t) => {
        const icons = { success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, error: <AlertCircle className="w-5 h-5 text-rose-500" />, info: <Info className="w-5 h-5 text-brand-500" /> };
        const bgs = { success: 'bg-emerald-50 ring-emerald-200', error: 'bg-rose-50 ring-rose-200', info: 'bg-brand-50 ring-brand-200' };
        return (
          <div key={t.id} className={cn('flex items-start gap-2.5 rounded-xl ring-1 px-4 py-3 shadow-lg animate-slide-up', bgs[t.type])}>
            {icons[t.type]}
            <p className="text-sm text-slate-700 flex-1">{t.message}</p>
            <button onClick={() => onDismiss(t.id)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
        );
      })}
    </div>
  );
}

export { formatIDR };
