'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import {
  HiArrowLeft, HiPencil, HiClock, HiCheckCircle, HiExclamation,
  HiTrash, HiShieldCheck, HiBan
} from 'react-icons/hi';
import { parseSpots, periodLabel, adminInterest, frequencyLabel } from '@/lib/payments';
import toast from 'react-hot-toast';

const FREQS = ['Daily', 'Weekly', 'Every 2 weeks', 'Monthly', 'Custom'];
// These core changes affect money + rotation, so PayRound must approve them first
const EDITABLE_LABELS = {
  name: 'Group name',
  description: 'Description',
  amount: 'Contribution amount (₦)',
  frequency: 'Contribution frequency',
  frequency_days: 'Custom frequency (days)',
  max_members: 'Number of spots (members)',
  payout_amount: 'Payout each spot collects (₦)',
};

// Human formatting for old → new values in the request summary
const fmtVal = (k, v) => {
  if (k === 'amount' || k === 'payout_amount') return (v === null || v === undefined || v === '' || Number(v) <= 0) ? (k === 'payout_amount' ? 'full pot (no set payout)' : '—') : `₦${Number(v).toLocaleString()}`;
  if (k === 'frequency_days') return v ? `every ${v} days` : '—';
  return (v === null || v === undefined || v === '') ? '—' : String(v);
};

export default function EditGroupPage() {
  const router = useRouter();
  const params = useParams();
  const [me, setMe] = useState(null);
  const [group, setGroup] = useState(null);
  const [takenSpots, setTakenSpots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', amount: '', frequency: 'Weekly', customDays: '', max_members: '', payout_amount: '' });
  const [requests, setRequests] = useState([]);       // my edit requests for this group (history)
  const [submitting, setSubmitting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [delPass, setDelPass] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const stored = localStorage.getItem('payround_user');
      const user = stored ? JSON.parse(stored) : null;
      if (!user?.email) { router.push('/login'); return; }
      setMe(user);
      const { supabase } = await import('@/lib/supabase');
      const { data: g } = await supabase.from('groups').select('*').eq('id', params.groupId).single();
      if (!g) { toast.error('Group not found.'); router.push('/dashboard'); return; }
      if ((g.admin_email || '').toLowerCase() !== user.email.toLowerCase()) { toast.error('Only the group admin can edit this group.'); router.push(`/groups/${params.groupId}`); return; }
      setGroup(g);
      setForm({ name: g.name || '', description: g.description || '', amount: String(g.amount ?? ''), frequency: g.frequency || 'Weekly', customDays: g.frequency_days ? String(g.frequency_days) : '', max_members: String(g.max_members ?? ''), payout_amount: g.payout_amount ? String(g.payout_amount) : '' });
      const { data: mems } = await supabase.from('members').select('spots').eq('group_id', params.groupId).eq('status', 'approved');
      const taken = new Set();
      (mems || []).forEach(m => parseSpots(m.spots).forEach(sp => taken.add(sp)));
      setTakenSpots(taken.size);
      const { data: reqs } = await supabase.from('group_edit_requests').select('*').eq('group_id', params.groupId).order('created_at', { ascending: false }).limit(10);
      setRequests(reqs || []);
    } catch (e) { toast.error('Could not load the group.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [params.groupId]);

  if (loading || !group) return <LoadingScreen label="Loading group settings…" />;

  const changed = {};
  if (form.name.trim() !== (group.name || '')) changed.name = form.name.trim();
  if (form.description.trim() !== (group.description || '')) changed.description = form.description.trim();
  if (String(Number(form.amount || 0)) !== String(Number(group.amount || 0))) changed.amount = Number(form.amount || 0);
  if (form.frequency !== (group.frequency || 'Weekly')) changed.frequency = form.frequency;
  const newDays = form.frequency === 'Custom' ? (parseInt(form.customDays, 10) || null) : null;
  const oldDays = group.frequency_days ? parseInt(group.frequency_days, 10) : null;
  if (newDays !== oldDays) changed.frequency_days = newDays;
  if (String(parseInt(form.max_members, 10) || 0) !== String(parseInt(group.max_members, 10) || 0)) changed.max_members = parseInt(form.max_members, 10) || 0;
  const newPayout = form.payout_amount === '' ? null : (Number(form.payout_amount) || 0);
  const oldPayout = Number(group.payout_amount) > 0 ? Number(group.payout_amount) : null;
  if (String(newPayout) !== String(oldPayout)) changed.payout_amount = newPayout;
  const changeCount = Object.keys(changed).length;
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const submitEdits = async () => {
    if (!changeCount) { toast.error('You haven\'t changed anything yet.'); return; }
    if (changed.name !== undefined && changed.name.length < 3) { toast.error('Group name needs at least 3 characters.'); return; }
    if (changed.amount !== undefined && (!Number(changed.amount) || Number(changed.amount) <= 0)) { toast.error('Contribution amount must be more than ₦0.'); return; }
    if (changed.max_members !== undefined) {
      const mm = Number(changed.max_members);
      if (!Number.isInteger(mm) || mm < 2 || mm > 200) { toast.error('Number of spots must be between 2 and 200.'); return; }
      if (mm < takenSpots) { toast.error(`You can\'t shrink below ${takenSpots} — that many spots are already taken by members.`); return; }
    }
    if (form.frequency === 'Custom') {
      const d = parseInt(form.customDays, 10);
      if (!Number.isInteger(d) || d < 2 || d > 365) { toast.error('Custom frequency: enter every how many days (2–365).'); return; }
    }
    if (changed.payout_amount !== undefined && changed.payout_amount !== null) {
      if (!(Number(changed.payout_amount) > 0)) { toast.error('Payout amount must be more than ₦0 — or clear the field for the full pot.'); return; }
      const amt = Number(changed.amount ?? form.amount) || 0;
      const mm2 = parseInt(changed.max_members ?? form.max_members, 10) || 0;
      if (amt && mm2 && Number(changed.payout_amount) > amt * mm2) { toast.error(`Payout can't be more than ₦${(amt * mm2).toLocaleString()} — that's everything the group collects each round.`); return; }
    }
    setSubmitting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const oldOf = (k) => k === 'name' ? group.name : k === 'description' ? group.description : k === 'amount' ? group.amount : k === 'max_members' ? group.max_members : k === 'frequency' ? group.frequency : k === 'frequency_days' ? group.frequency_days : k === 'payout_amount' ? group.payout_amount : undefined;
      const summary = Object.entries(changed).map(([k, v]) => `${EDITABLE_LABELS[k]}: ${fmtVal(k, oldOf(k))} → ${fmtVal(k, v)}`).join(' • ');
      const { error } = await supabase.from('group_edit_requests').insert({
        id: `edit-${Date.now()}`,
        group_id: params.groupId,
        admin_email: me.email.toLowerCase(),
        changes: JSON.stringify(changed),
        summary,
        status: 'pending',
      });
      if (error) throw error;
      await supabase.from('notifications').insert({
        id: `editsent-${Date.now()}`, type: 'group_edit_sent', group_id: params.groupId, is_read: false,
        user_email: me.email.toLowerCase(),
        message: `⏳ Your change request for "${group.name}" was sent to PayRound for review: ${summary}. It goes live the moment it\'s approved — you\'ll be notified either way.`,
      });
      toast.success('Sent to PayRound for review! You\'ll be notified once approved or declined. ⏳');
      await load();
    } catch (e) { toast.error(`Could not send the request: ${e.message || 'try again'}`); }
    setSubmitting(false);
  };

  // 🗑 Delete the whole group — needs the admin's account password
  const deleteGroup = async () => {
    if (!delPass.trim() || deleting) return;
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: acc } = await supabase.from('users').select('password_hash').eq('email', me.email.toLowerCase()).maybeSingle();
      if (!acc || acc.password_hash !== delPass) { toast.error('Wrong password — the group was NOT deleted.'); setDeleting(false); return; }
      // Best-effort cleanup of everything tied to the group, then the group itself
      await supabase.from('group_messages').delete().eq('group_id', params.groupId);
      await supabase.from('payments').delete().eq('group_id', params.groupId);
      await supabase.from('payouts').delete().eq('group_id', params.groupId);
      await supabase.from('members').delete().eq('group_id', params.groupId);
      await supabase.from('notifications').delete().eq('group_id', params.groupId);
      await supabase.from('group_edit_requests').delete().eq('group_id', params.groupId);
      const { error } = await supabase.from('groups').delete().eq('id', params.groupId);
      if (error) throw error;
      toast.success(`"${group.name}" was deleted. Members can no longer see it.`);
      router.push('/dashboard');
    } catch (e) { toast.error(`Could not delete: ${e.message || 'try again'}`); }
    setDeleting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <button onClick={() => router.push(`/groups/${params.groupId}`)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-5">
          <HiArrowLeft className="w-4 h-4" /> Back to Group
        </button>

        <div className="flex items-center gap-3 mb-6">
          {group.avatar_url
            ? <img src={group.avatar_url} alt={group.name} className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
            : <span className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 font-bold text-lg flex items-center justify-center">{group.name.charAt(0)}</span>}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><HiPencil className="w-5 h-5 text-primary-600" /> Edit {group.name}</h1>
            <p className="text-xs text-gray-400 font-mono">Group ID: {group.id} — the ID never changes</p>
          </div>
        </div>

        {/* Change form — core changes need PayRound approval */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-1">Group details</h2>
          <p className="text-xs text-gray-500 mb-5">
            Core changes (name, amount, frequency, number of spots) are reviewed by <b>PayRound</b> before going live — members are never surprised by silent edits.
            The payout amount & custom frequency go through the same review. Rules and your avatar can still be changed instantly from the group page.
          </p>

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Group name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={60}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary-500" />

          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={300}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary-500" />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contribution (₦ / spot)</label>
              <input type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              {form.frequency === 'Custom' && (
                <div className="mt-2">
                  <input type="number" min="2" max="365" value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} placeholder="Every how many days? e.g. 10"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  <p className="text-[10px] text-gray-400 mt-1">Members contribute every {parseInt(form.customDays, 10) > 0 ? form.customDays : '…'} days.</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Number of spots</label>
              <input type="number" min="2" max="200" value={form.max_members} onChange={e => setForm(f => ({ ...f, max_members: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <p className="text-[10px] text-gray-400 mt-1">{takenSpots} already taken — can&apos;t go below that.</p>
            </div>
          </div>

          {/* 💰 Payout per spot — admin interest lives in the gap (only admins ever see it) */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payout each spot collects (₦) <span className="font-normal text-gray-400">— leave empty for the full pot</span></label>
            <input type="number" min="1" value={form.payout_amount} onChange={e => setForm(f => ({ ...f, payout_amount: e.target.value }))}
              placeholder={`${((Number(form.amount) || 0) * (parseInt(form.max_members, 10) || 0)).toLocaleString()} = the full pot`}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <p className="text-[10px] text-gray-400 mt-1">What ONE spot receives on its turn. Members see this as their expected payout — the gap between it and the full pot is <b>your interest</b>.</p>
            {(() => {
              const sim = { ...group, amount: Number(form.amount) || 0, max_members: parseInt(form.max_members, 10) || 0, payout_amount: form.payout_amount === '' ? null : Number(form.payout_amount) };
              if (!sim.amount || !sim.max_members) return null;
              const money = adminInterest(sim);
              const per = periodLabel(form.frequency, form.customDays);
              return (
                <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5 flex-wrap">👑 Interest preview <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold">ONLY YOU SEE THIS</span></p>
                  <p>Collected every {per}: <b>₦{money.collected.toLocaleString()}</b> · paid out per spot: <b>₦{money.payout.toLocaleString()}</b></p>
                  {money.perRound > 0
                    ? <p className="font-bold">Your interest: ₦{money.perRound.toLocaleString()} / {per} · <span className="text-emerald-700">₦{money.perCycle.toLocaleString()} per full cycle</span></p>
                    : money.perRound === 0
                      ? <p>Interest: ₦0 — spots collect the full pot.</p>
                      : <p className="text-red-600 font-semibold">⚠️ Payout is higher than what the group collects each {per} — the pot would run short.</p>}
                </div>
              );
            })()}
          </div>

          {changeCount > 0 && (
            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-4">
              You changed <b>{changeCount}</b> thing{changeCount > 1 ? 's' : ''}: {Object.keys(changed).map(k => EDITABLE_LABELS[k]).join(' • ')} — saving sends them to PayRound for review.
            </p>
          )}
          <button onClick={submitEdits} disabled={submitting || changeCount === 0 || pendingCount > 0}
            className="w-full bg-primary-600 text-white font-semibold py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Sending…' : pendingCount > 0 ? '⏳ One request is already waiting for review…' : 'Send Changes for Review'}
          </button>
          {pendingCount > 0 && <p className="text-[11px] text-gray-400 mt-2 text-center">Wait for PayRound to answer your current request (below) before sending another.</p>}
        </div>

        {/* Request history */}
        {requests.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
            <h2 className="font-bold text-gray-900 mb-3">Your change requests</h2>
            {requests.map(r => (
              <div key={r.id} className="border border-gray-100 rounded-xl p-3.5 mb-2.5">
                <p className="text-xs text-gray-700 leading-relaxed">{r.summary}</p>
                <p className="text-[11px] mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {r.status === 'approved'
                    ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><HiCheckCircle className="w-3.5 h-3.5" /> Approved — changes are live</span>
                    : r.status === 'declined'
                      ? <span className="text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><HiBan className="w-3.5 h-3.5" /> Declined</span>
                      : <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"><HiClock className="w-3.5 h-3.5" /> Waiting for PayRound review</span>}
                  <span className="text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</span>
                </p>
                {r.status === 'declined' && r.decline_reason && (
                  <p className="text-[11px] text-red-600 mt-1.5">Reason from PayRound: {r.decline_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Danger zone — delete the group (password required) */}
        <div className="bg-white rounded-2xl border-2 border-red-100 p-6">
          <h2 className="font-bold text-red-600 mb-1 flex items-center gap-2"><HiExclamation className="w-5 h-5" /> Danger zone</h2>
          {!showDelete ? (
            <>
              <p className="text-xs text-gray-500 mb-4">
                Deleting removes the group <b>forever</b> — members, payments, payouts, tracker and chat all go with it. This cannot be undone.
              </p>
              <button onClick={() => setShowDelete(true)} className="w-full bg-white border border-red-300 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 flex items-center justify-center gap-2">
                <HiTrash className="w-4 h-4" /> Delete This Group…
              </button>
            </>
          ) : (
            <div>
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                ⚠️ You are about to delete <b>&quot;{group.name}&quot;</b> forever. Type your <b>PayRound password</b> to confirm you are really the group admin.
              </p>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Your PayRound password</label>
              <input type="password" value={delPass} onChange={e => setDelPass(e.target.value)} placeholder="Type your account password" autoComplete="current-password"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-400" />
              <div className="flex gap-2">
                <button onClick={deleteGroup} disabled={deleting || !delPass.trim()} className="flex-1 bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <HiShieldCheck className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete Forever'}
                </button>
                <button onClick={() => { setShowDelete(false); setDelPass(''); }} className="px-5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
