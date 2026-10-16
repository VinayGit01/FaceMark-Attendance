import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api, { errMsg } from '../lib/api';
import { Empty, PageHeader } from '../components/ui.jsx';

const pretty = (meta) => (meta && Object.keys(meta).length ? JSON.stringify(meta).replace(/[{}"]/g, '').replace(/,/g, ', ') : '');

export default function AuditLog() {
  const [f, setF] = useState({ action: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/audit', { params: { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [f, page]);

  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who signed in, who changed access, who looked at someone's attendance, and who changed face settings. Entries cannot be edited here." />
      <div className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1"><label className="label">Person or target</label><input className="input" value={f.q} onChange={set('q')} placeholder="Search a name" /></div>
        <div><label className="label">Action</label>
          <select className="input" value={f.action} onChange={set('action')}><option value="">All</option>{d?.actions.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </div>
        <div><label className="label">From</label><input type="date" className="input" value={f.from} onChange={set('from')} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={f.to} onChange={set('to')} /></div>
      </div>

      <div className="panel overflow-x-auto">
        {!d ? <p className="p-6 text-ink-500">Loading…</p> : d.items.length === 0 ? <Empty title="No entries" hint="Nothing matches these filters." /> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-ink/[0.03] text-ink-500">
              <tr>{['When', 'Who', 'Action', 'About', 'Details'].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {d.items.map((e) => (
                <tr key={e._id}>
                  <td className="whitespace-nowrap px-5 py-3">{new Date(e.at).toLocaleString()}</td>
                  <td className="px-5 py-3"><p className="font-semibold">{e.actorName || '—'}</p><p className="text-xs text-ink-500">{e.actorRole}{e.ip ? ` · ${e.ip}` : ''}</p></td>
                  <td className="px-5 py-3 font-mono text-xs">{e.action}</td>
                  <td className="px-5 py-3">{e.targetName || '—'}{e.targetType && <p className="text-xs text-ink-500">{e.targetType}</p>}</td>
                  <td className="max-w-xs px-5 py-3 text-xs text-ink-500">{pretty(e.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {d && d.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">{d.total} entries · page {d.page} of {d.pages}</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-ghost" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}
