'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import GroupBadge from '@/components/GroupBadge';
import ImageLightbox from '@/components/ImageLightbox';
import { HiArrowLeft, HiBadgeCheck, HiUserGroup, HiPaperAirplane, HiSearch } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { sounds } from '@/lib/sounds';
import ChatSearchBar, { Mark, useChatSearch } from '@/components/ChatSearchBar';

// Real group chat rooms — every group gets its own in-app conversation.
// Rooms are visible (and openable) ONLY by that group's admin and its approved members.
const cursorKey = (gid) => `payround_gchat_read_${gid}`;

function GroupChatInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState('');
  const [rows, setRows] = useState(null);       // room list [{ group, last, unread, mine }]
  const [activeId, setActiveId] = useState(''); // open room id
  const [g, setG] = useState(null);             // open group row
  const [denied, setDenied] = useState(false);  // opened a room I don't belong to
  const [msgs, setMsgs] = useState([]);
  const [people, setPeople] = useState({});     // sender email -> { name, profile_pic, is_verified }
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sel, setSel] = useState('');
  const [roomQuery, setRoomQuery] = useState(''); // 🔍 search group rooms
  const cs = useChatSearch(msgs); // 🔍 search INSIDE the open room (keywords + dates)
  // switching rooms closes any open in-chat search
  useEffect(() => { cs.close(); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [deleting, setDeleting] = useState(false);
  const [zoomImg, setZoomImg] = useState(null);    // tap any chat image → fullscreen
  const [adminBank, setAdminBank] = useState(null); // the admin's bank details (🏦 chip in the header)
  const [annDraft, setAnnDraft] = useState('');     // announcement box composer (admin)
  const [annEdit, setAnnEdit] = useState(false);
  const [annBusy, setAnnBusy] = useState(false);
  const listRef = useRef(null);
  const nearBottom = useRef(true);
  const firstOpen = useRef(true);
  const scrollToEnd = () => setTimeout(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight; // scroll the chat box — never the page
  }, 40);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    let parsed;
    try { parsed = JSON.parse(stored); } catch { router.push('/login'); return; }
    const email = (parsed.email || '').toLowerCase();
    setMe(email);
    loadRooms(email);
    const gid = searchParams.get('group') || '';
    if (gid) setActiveId(gid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = (gid, list) => {
    const newest = (list || [])[list.length - 1];
    if (newest?.created_at) { try { localStorage.setItem(cursorKey(gid), newest.created_at); } catch {} }
  };

  const loadRooms = async (email) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { getMyGroupIds } = await import('@/lib/notifications');
      const ids = await getMyGroupIds(supabase, email);
      if (!ids.length) { setRows([]); return; }
      const { data: gs } = await supabase.from('groups').select('id, name, avatar_url, admin_email, admin_name, is_verified, badge_tier, chat_open').in('id', ids);
      const { data: gm } = await supabase.from('group_messages').select('*').in('group_id', ids).order('created_at', { ascending: false }).limit(500);
      const byG = new Map();
      (gm || []).forEach(m => { if (!byG.has(m.group_id)) byG.set(m.group_id, m); }); // newest first
      const out = (gs || []).map(group => {
        const last = byG.get(group.id) || null;
        const cur = localStorage.getItem(cursorKey(group.id)) || '';
        let unread = 0;
        (gm || []).forEach(m => {
          if (m.group_id !== group.id || (m.from_email || '').toLowerCase() === email) return;
          if (!cur || m.created_at > cur) unread += 1;
        });
        return { group, last, unread, mine: (group.admin_email || '').toLowerCase() === email };
      }).sort((a, b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || ''));
      // resolve last-message senders so the preview shows their first name
      const senders = [...new Set(out.map(r => (r.last?.from_email || '').toLowerCase()).filter(Boolean))];
      if (senders.length) {
        const { data: us } = await supabase.from('users').select('email, name, profile_pic, is_verified').in('email', senders);
        setPeople(prev => { const next = { ...prev }; (us || []).forEach(u => { next[(u.email || '').toLowerCase()] = u; }); return next; });
      }
      setRows(out);
    } catch { setRows([]); }
  };

  // Open room — gate first: only the admin or an approved member of THIS group may enter
  useEffect(() => {
    if (!activeId || !me) return;
    nearBottom.current = true;
    firstOpen.current = true;
    let alive = true;
    let timer = null;
    let supa = null;

    const load = async () => {
      try {
        const { data } = await supa.from('group_messages').select('*').eq('group_id', activeId).order('created_at', { ascending: true }).limit(500);
        if (!alive) return;
        // keep the admin lock state fresh (members see typing open/close live)
        supa.from('groups').select('id, chat_open, announcement').eq('id', activeId).single().then(({ data: gr }) => {
          if (alive && gr) setG(prev => prev ? { ...prev, chat_open: gr.chat_open, announcement: gr.announcement ?? prev.announcement } : prev);
        });
        if (firstOpen.current || nearBottom.current) scrollToEnd();
        firstOpen.current = false;
        setMsgs(data || []);
        markRead(activeId, data);
        const emails = [...new Set((data || []).map(m => (m.from_email || '').toLowerCase()))].filter(Boolean);
        if (emails.length) {
          const { data: us } = await supa.from('users').select('email, name, profile_pic, is_verified').in('email', emails);
          if (alive && us) setPeople(prev => { const next = { ...prev }; us.forEach(u => { next[(u.email || '').toLowerCase()] = u; }); return next; });
        }
      } catch {}
    };

    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        supa = supabase;
        const { getMyGroupIds } = await import('@/lib/notifications');
        const ids = await getMyGroupIds(supabase, me);
        if (!ids.includes(activeId)) { if (alive) { setDenied(true); setG(null); setMsgs([]); } return; }
        if (alive) setDenied(false);
        supabase.from('groups').select('*').eq('id', activeId).single().then(({ data }) => {
          if (alive) setG(data || null);
          const adminEm = (data?.admin_email || '').toLowerCase();
          if (adminEm) {
            supabase.from('users').select('bank_name, account_number, account_name, payment_remark').eq('email', adminEm).maybeSingle()
              .then(({ data: ab }) => { if (alive) setAdminBank(ab || null); });
          }
        });
        load();
        timer = setInterval(load, 5000);
      } catch { if (alive) setDenied(true); }
    })();

    return () => { alive = false; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, me]);

  const isRoomAdmin = !!g && (g.admin_email || '').toLowerCase() === me;
  const hasBank = !!(adminBank && (adminBank.bank_name || adminBank.account_number || adminBank.account_name));
  const memberLocked = !!g && !g.chat_open && !isRoomAdmin;

  // Admin only: open the room so members can type, or lock it back (members still read everything
  // and pay via receipt upload on the group page)
  const toggleLock = async () => {
    if (!g || !isRoomAdmin) return;
    const next = !g.chat_open;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('groups').update({ chat_open: next }).eq('id', activeId);
      if (error) throw error;
      setG(prev => ({ ...prev, chat_open: next }));
      toast.success(next ? '🔓 Chat opened — members can now type.' : '🔒 Chat locked — only you can type. Members can still upload receipts from the group page.');
    } catch (err) { toast.error(`Could not change chat lock: ${err.message || 'try again'}`); }
  };

  // 📢 Announcement box (admin only) — pinned above the chat composer until cleared
  const saveAnnouncement = async () => {
    const txt = annDraft.trim();
    if (!txt || annBusy || !isRoomAdmin) return;
    setAnnBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('groups').update({ announcement: txt }).eq('id', activeId);
      if (error) throw error;
      setG(prev => ({ ...prev, announcement: txt }));
      setAnnEdit(false); setAnnDraft('');
      sounds.success();
      toast.success('📢 Announcement posted — every member sees it above the chat.');
    } catch (err) { sounds.error(); toast.error(`Could not post announcement: ${err.message || 'try again'}`); }
    setAnnBusy(false);
  };
  const clearAnnouncement = async () => {
    if (annBusy || !isRoomAdmin) return;
    if (!window.confirm('Clear the announcement for everyone?')) return;
    setAnnBusy(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('groups').update({ announcement: null }).eq('id', activeId);
      if (error) throw error;
      setG(prev => ({ ...prev, announcement: null }));
      setAnnEdit(false); setAnnDraft('');
      toast.success('Announcement cleared.');
    } catch (err) { toast.error(`Could not clear: ${err.message || 'try again'}`); }
    setAnnBusy(false);
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending || !activeId) return;
    if (memberLocked) { toast.error('Only the group admin can type here right now.'); return; }
    setSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('group_messages').insert({
        id: `gmsg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        group_id: activeId, from_email: me, body: text,
      });
      if (error) throw error;
      setBody('');
      sounds.send();
      nearBottom.current = true;
      setMsgs(prev => [...prev, { id: `local-${Date.now()}`, group_id: activeId, from_email: me, body: text, created_at: new Date().toISOString() }]);
      scrollToEnd();
    } catch (err) { toast.error(`Could not send: ${err.message || 'try again'}`); }
    setSending(false);
  };

  // Delete a message I sent — removed for everyone in the group
  const del = async (m) => {
    if (String(m.id).startsWith('local-')) { toast('Just sent — try again in a second'); return; }
    if (!window.confirm('Delete this message? It disappears for everyone in the group.')) return;
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('group_messages').delete().eq('id', m.id);
      if (error) throw error;
      setMsgs(prev => prev.filter(x => x.id !== m.id));
      setSel('');
    } catch (err) { toast.error(`Could not delete: ${err.message || 'try again'}`); }
    setDeleting(false);
  };

  const person = (email) => people[(email || '').toLowerCase()] || null;
  const timeOf = (iso) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : '';
  const dateOf = (iso) => iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';

  if (!me) return <LoadingScreen label="Loading group chats…" />;

  /* ============ ROOM VIEW ============ */
  if (activeId) {
    const name = g?.name || 'Group chat';
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        {zoomImg && <ImageLightbox src={zoomImg} alt="Chat photo" onClose={() => setZoomImg(null)} />}
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* room head */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <button onClick={() => { setActiveId(''); setG(null); setMsgs([]); loadRooms(me); }} aria-label="Back to group chats" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
                <HiArrowLeft className="w-5 h-5" />
              </button>
              {g?.avatar_url ? (
                <img src={g.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover border border-gray-100" />
              ) : (
                <span className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center">{name.charAt(0).toUpperCase()}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1 text-sm font-bold text-gray-900">
                  <span className="truncate">{name}</span>
                  {g && <GroupBadge verified={g.is_verified} tier={g.badge_tier} />}
                </p>
                <button onClick={() => router.push(`/groups/${activeId}`)} className="text-[11px] text-primary-600 font-medium hover:text-primary-700">View group →</button>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  onClick={cs.toggle}
                  aria-label="Search in this chat"
                  title="Search in this chat"
                  className={`p-1.5 rounded-full transition-colors ${cs.open ? 'bg-yellow-100 text-yellow-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <HiSearch className="w-5 h-5" />
                </button>
                {hasBank && (
                  <button
                    onClick={() => { try { navigator.clipboard.writeText(adminBank.account_number || ''); toast.success('Account number copied! 📋'); } catch { toast.error('Copy failed — long-press the number below instead'); } }}
                    title="Admin bank details stay open below — tap this chip to copy the account number instantly"
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors bg-emerald-600 border-emerald-600 text-white"
                  >
                    🏦 Bank
                  </button>
                )}
                {isRoomAdmin && (
                  <button
                    onClick={toggleLock}
                    title={g?.chat_open ? 'Members can type — tap to lock (admin only)' : 'Locked: only you can type — tap to open for members'}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${g?.chat_open ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    {g?.chat_open ? '🔓' : '🔒'}
                  </button>
                )}
              </div>
            </div>

            {/* 🔍 in-chat keyword/date search (WhatsApp-style) */}
            <ChatSearchBar cs={cs} />

            {/* 📢 ANNOUNCEMENT BOX — pinned at the very TOP of the chat, bright in light AND dark mode;
                admin posts/edits/clears, members read-only. Stays until the admin clears it. */}
            {!denied && (isRoomAdmin || g?.announcement) && (
              <div className="px-4 pt-3 pb-1">
                <div className="rounded-xl p-3 uc-announce">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[10px] font-bold tracking-wide uc-ann-title">📢 ANNOUNCEMENT BOX</p>
                    {isRoomAdmin && !annEdit && g?.announcement && (
                      <span className="flex gap-1.5">
                        <button onClick={() => { setAnnDraft(g.announcement || ''); setAnnEdit(true); }} className="text-[10px] font-bold px-2 py-0.5 rounded-full uc-ann-edit">✏️ Edit</button>
                        <button onClick={clearAnnouncement} disabled={annBusy} className="text-[10px] font-bold px-2 py-0.5 rounded-full uc-ann-clear disabled:opacity-50">🗑 Clear</button>
                      </span>
                    )}
                  </div>
                  {isRoomAdmin && (annEdit || !g?.announcement) ? (
                    <div>
                      <textarea
                        value={annDraft}
                        onChange={e => setAnnDraft(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Type an announcement here — every member sees it pinned at the TOP of this chat until YOU clear it…"
                        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none uc-ann-input"
                      />
                      <div className="flex gap-2 mt-2">
                        <button onClick={saveAnnouncement} disabled={annBusy || !annDraft.trim()} className="text-xs font-bold px-4 py-2 rounded-lg uc-ann-post disabled:opacity-50">{annBusy ? 'Posting…' : '📢 Post announcement'}</button>
                        {annEdit && <button onClick={() => { setAnnEdit(false); setAnnDraft(''); }} className="text-xs px-4 py-2 rounded-lg uc-ann-cancel">Cancel</button>}
                      </div>
                    </div>
                  ) : g?.announcement ? (
                    <p className="text-sm whitespace-pre-line uc-ann-body">{g.announcement}</p>
                  ) : null}
                </div>
              </div>
            )}

            {/* 🏦 Admin bank card — ALWAYS open (below the announcement), forced-bright in dark mode too */}
            {!denied && hasBank && (
              <div className="px-4 py-3 uc-bank">
                <p className="text-[10px] font-bold mb-1 uc-bank-title">🏦 ADMIN BANK — send contributions here</p>
                <div className="text-xs space-y-0.5">
                  {adminBank.bank_name && <p><span className="uc-bank-label">Bank:</span> <b className="uc-bank-val">{adminBank.bank_name}</b></p>}
                  {adminBank.account_number && (
                    <p className="flex items-center gap-2 flex-wrap">
                      <span className="uc-bank-label">Account No:</span> <b className="uc-bank-val font-mono text-sm tracking-wide">{adminBank.account_number}</b>
                      <button onClick={() => { try { navigator.clipboard.writeText(adminBank.account_number); toast.success('Account number copied!'); } catch {} }} className="text-[10px] font-semibold px-2 py-0.5 rounded-full uc-bank-copy">Copy</button>
                    </p>
                  )}
                  {adminBank.account_name && <p><span className="uc-bank-label">Name:</span> <b className="uc-bank-val">{adminBank.account_name}</b></p>}
                  {adminBank.payment_remark && <p><span className="uc-bank-label">📝 Remark:</span> <b className="uc-bank-val">{adminBank.payment_remark}</b></p>}
                </div>
              </div>
            )}

            {/* access answer */}
            {denied ? (
              <div className="px-6 py-12 text-center">
                <HiUserGroup className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="font-semibold text-gray-700 mb-1">Only group admins and members can open this chat</p>
                <p className="text-xs text-gray-400">Join the group first — once PayRound approves your request, the chat opens here.</p>
              </div>
            ) : (
              <>
                {/* messages */}
                <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
                  className="h-[55vh] overflow-y-auto px-4 py-4 space-y-2.5">
                  {msgs.length === 0 && (
                    <p className="text-center text-xs text-gray-400 py-10">No messages yet — start the conversation! 🎉<br />Everyone in this group can read and reply here.</p>
                  )}
                  {msgs.length > 0 && (
                    <p className="text-center text-[10px] text-gray-300 mb-1">Tip: tap your own bubble to delete it 🗑</p>
                  )}
                  {msgs.map((m, i) => {
                    const mine = (m.from_email || '').toLowerCase() === me;
                    const u = mine ? null : person(m.from_email);
                    const prev = msgs[i - 1];
                    const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                    return (
                      <div key={m.id} data-mid={m.id}>
                        {showDate && <p className="text-center text-[10px] text-gray-400 font-semibold my-2">{dateOf(m.created_at)}</p>}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'} items-end gap-1.5`}>
                          {!mine && (
                            u?.profile_pic
                              ? <img src={u.profile_pic} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-100 shrink-0" />
                              : <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center shrink-0">{(u?.name || 'P').charAt(0).toUpperCase()}</span>
                          )}
                          <div
                            onClick={mine && !String(m.id).startsWith('local-') ? () => setSel(sel === m.id ? '' : m.id) : undefined}
                            className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'} ${mine ? 'cursor-pointer' : ''} ${sel === m.id ? 'ring-2 ring-red-300' : ''}${String(cs.activeId) === String(m.id) || cs.flash === String(m.id) ? ' ring-2 ring-yellow-400' : ''}`}
                          >
                            {!mine && (
                              <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                <span className="truncate">{u?.name || 'Group member'}</span>
                                {u?.is_verified && <HiBadgeCheck className="w-3 h-3 text-blue-500 shrink-0 badge-emboss" />}
                              </p>
                            )}
                            {m.image_url && (
                              <span onClick={(e) => { e.stopPropagation(); setZoomImg(m.image_url); }} className="relative block mb-1.5 -mx-1 cursor-zoom-in" title="Tap to view full image">
                                <img src={m.image_url} alt="payment receipt" className="rounded-xl w-full max-h-52 object-contain bg-black/5" />
                                {m.receipt_status === 'approved' && (
                                  <img src="/stamps/approved.png" alt="APPROVED stamp" title="Approved by the group admin" className="absolute inset-0 m-auto w-28 object-contain -rotate-12 drop-shadow-lg" />
                                )}
                                {m.receipt_status === 'declined' && (
                                  <img src="/stamps/declined.png" alt="DECLINED stamp" title="Declined by the group admin" className="absolute inset-0 m-auto w-36 object-contain -rotate-12 drop-shadow-lg" />
                                )}
                                {(!m.receipt_status || m.receipt_status === 'pending') && (
                                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full shadow">⏳ WAITING FOR ADMIN REVIEW</span>
                                )}
                              </span>
                            )}
                            <p className="whitespace-pre-line break-words"><Mark text={m.body} q={cs.open ? cs.query : ''} /></p>
                            <p className={`text-[9px] mt-0.5 ${mine ? 'text-primary-200 text-right' : 'text-gray-400'}`}>{timeOf(m.created_at)}</p>
                          </div>
                        </div>
                        {mine && sel === m.id && (
                          <div className="flex justify-end">
                            <button onClick={() => del(m)} disabled={deleting} className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full hover:bg-red-100 disabled:opacity-50">🗑 Delete this message</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* composer — admin always types; members type only while the admin has opened the chat */}
                {g?.is_frozen ? (
                  <div className="px-4 py-4 border-t border-gray-100 bg-sky-50">
                    <p className="text-xs text-sky-800 text-center">❄️ This group is frozen by PayRound — chat and payments are paused for now.</p>
                  </div>
                ) : memberLocked ? (
                  <div className="px-4 py-4 border-t border-gray-100 bg-gray-50">
                    <button onClick={() => router.push(`/groups/${activeId}#pay`)} className="w-full bg-primary-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary-700 transition-colors">📤 Upload payment receipt (choose spots & weeks) →</button>
                  </div>
                ) : (
                <form onSubmit={send} className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
                  <input
                    type="text"
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={`Message the group…`}
                    maxLength={500}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button type="submit" disabled={sending || !body.trim()} aria-label="Send"
                    className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 transition-all shrink-0">
                    <HiPaperAirplane className="w-5 h-5 rotate-90" />
                  </button>
                </form>
                )}
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ============ ROOM LIST ============ */
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2"><HiUserGroup className="w-7 h-7 text-primary-600" /> Group chats</h1>
        <p className="text-sm text-gray-500 mb-3">Private rooms for the groups you run or belong to — only admins and members can see them.</p>

        {/* 🔍 search your group rooms — by group name or words from the last message */}
        {rows !== null && rows.length > 0 && (
          <div className="relative mb-4">
            <input
              value={roomQuery}
              onChange={e => setRoomQuery(e.target.value)}
              placeholder="Search group chats…"
              maxLength={60}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
          </div>
        )}

        {rows === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading group chats…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <HiUserGroup className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 mb-1">You&apos;re not in any group yet</p>
            <p className="text-xs text-gray-400 mb-4">Group chats appear here the moment you create a group or a group approves your join request.</p>
            <button onClick={() => router.push('/groups/search')} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">Find a Group</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {(() => {
              const rq = roomQuery.trim().toLowerCase();
              const visible = !rq ? rows : rows.filter(r => [r.group?.name || '', r.last?.body || '', r.last?.from_email || ''].join(' ').toLowerCase().includes(rq));
              if (visible.length === 0) {
                return <p className="px-4 py-8 text-center text-sm text-gray-400">No group chat matches “{roomQuery.trim()}”.</p>;
              }
              return visible.map(r => (
              <button key={r.group.id} onClick={() => setActiveId(r.group.id)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                {r.group.avatar_url ? (
                  <img src={r.group.avatar_url} alt="" className="w-11 h-11 rounded-xl object-cover border border-gray-100 shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(r.group.name || 'G').charAt(0).toUpperCase()}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                    <span className="truncate">{r.group.name}</span>
                    {r.group.chat_open === false && <span className="text-[10px] shrink-0" title="Locked — only the admin can type">🔒</span>}
                    <GroupBadge verified={r.group.is_verified} tier={r.group.badge_tier} />
                    <span className="ml-auto text-[10px] font-normal text-gray-400 shrink-0">{r.last ? dateOf(r.last.created_at) : ''}</span>
                  </span>
                  <span className={`block text-xs truncate mt-0.5 ${r.unread > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    {r.last ? `${r.last.from_email === me ? 'You: ' : `${(person(r.last.from_email)?.name || 'Member').split(' ')[0]}: `}${r.last.body}` : (r.mine ? '👑 You admin this group — say hello!' : 'No messages yet')}
                  </span>
                </span>
                {r.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{r.unread > 9 ? '9+' : r.unread}</span>
                )}
              </button>
            ));
            })()}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

export default function GroupChatPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading group chats…" />}>
      <GroupChatInner />
    </Suspense>
  );
}
