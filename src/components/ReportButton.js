'use client';

import { useState } from 'react';
import { HiFlag, HiX } from 'react-icons/hi';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { id: 'fraud_or_scam', label: 'Fraud or scam' },
  { id: 'harassment', label: 'Harassment or threats' },
  { id: 'fake_identity', label: 'Fake identity or impersonation' },
  { id: 'payment_issue', label: 'Payment or payout concern' },
  { id: 'unsafe_content', label: 'Unsafe or inappropriate content' },
  { id: 'group_rules', label: 'Group rules or conduct' },
  { id: 'other', label: 'Something else' },
];

export default function ReportButton({ targetType, targetId, targetName, compact = false }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!category) { toast.error('Choose the reason for your report.'); return; }
    if (details.trim().length < 10) { toast.error('Add at least 10 characters explaining what happened.'); return; }
    setBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.rpc('submit_report', {
        p_target_type: targetType,
        p_target_id: String(targetId || ''),
        p_category: category,
        p_details: details.trim(),
      });
      if (error) throw error;
      setCategory('');
      setDetails('');
      setOpen(false);
      toast.success('Private report sent to PayRound for review.');
    } catch (error) {
      toast.error(error?.message || 'The report could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-full hover:bg-red-100 transition-colors'
          : 'inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-white border border-red-200 px-4 py-2.5 rounded-xl hover:bg-red-50 transition-colors'}
      >
        <HiFlag className="w-4 h-4" /> Report {targetType === 'group' ? 'group' : 'user'}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/55 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <form onSubmit={submit} className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between gap-3 rounded-t-3xl">
              <div>
                <h2 className="font-bold text-gray-900">Report {targetName || (targetType === 'group' ? 'this group' : 'this user')}</h2>
                <p className="text-[11px] text-gray-500 mt-0.5">Sent privately to PayRound only</p>
              </div>
              <button type="button" onClick={close} disabled={busy} aria-label="Close" className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center disabled:opacity-50"><HiX className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-xs text-purple-800">
                <b>Private review:</b> PayRound will see your identity so the team can investigate, but it is never shown to the reported user or group. Neither side receives report-status notifications.
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">What is the concern?</label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {CATEGORIES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCategory(item.id)}
                      className={`text-left text-xs font-semibold px-3 py-2.5 rounded-xl border transition-colors ${category === item.id ? 'bg-red-50 border-red-400 text-red-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="report-details" className="block text-sm font-semibold text-gray-800 mb-1.5">What happened?</label>
                <textarea
                  id="report-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={5}
                  minLength={10}
                  maxLength={2000}
                  placeholder="Give PayRound enough detail to review this safely. Do not include passwords or PINs."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <p className="text-[10px] text-gray-400 text-right mt-1">{details.length}/2000</p>
              </div>

              <button type="submit" disabled={busy || !category || details.trim().length < 10} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 disabled:opacity-45 transition-colors">
                {busy ? 'Sending privately…' : 'Send private report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
