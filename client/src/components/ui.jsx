import { X } from 'lucide-react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const tones = {
  present: ['bg-teal-soft text-teal-dark', 'Present'],
  late: ['bg-amber-soft text-[#8A5A0B]', 'Late'],
  'half-day': ['bg-sky-100 text-sky-800', 'Half-day'],
  leave: ['bg-indigo-100 text-indigo-700', 'On leave'],
  absent: ['bg-rose-soft text-rose', 'Absent'],
  weekoff: ['bg-ink/5 text-ink-500', 'Week off'],
  pending: ['bg-amber-soft text-[#8A5A0B]', 'Pending'],
  approved: ['bg-teal-soft text-teal-dark', 'Approved'],
  rejected: ['bg-rose-soft text-rose', 'Rejected'],
};
export function StatusBadge({ status }) {
  const [cls, label] = tones[status] || tones.absent;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-ink/50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className={`panel w-full ${wide ? 'max-w-3xl' : 'max-w-md'} p-6 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="rounded-md p-1 hover:bg-ink/5" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, hint }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function Stat({ label, value, tone = 'text-ink' }) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-ink-500">{label}</p>
      <p className={`mt-2 font-display text-4xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
