'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { HiArrowLeft, HiBadgeCheck, HiChatAlt2, HiPaperAirplane } from 'react-icons/hi';
import toast from 'react-hot-toast';

// Real direct messages between users — business owners, group admins, everyone
function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState('');
  const [threads, setThreads] = useState(null); // [{ email, last, unread, user }]
  const [active, setActive] = useState('');     // other party's email
  const [msgs, setMsgs] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sel, setSel] = useState('');        // bubble the user tapped (shows the 🗑 Delete chip)
  const [deleting, setDeleting] = useState(false);
  const listRef = useRef(null);        // the scrollable message box (never the page!)
  const nearBottom = useRef(true);    // true while the user is reading the newest messages
  const firstOpen = useRef(true);     // jump straight to the bottom the first time a chat opens
  const scrollToEnd = () => setTimeout(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight; // inner-container scroll — the page stays put
  }, 40);

  useEffect(() => {
    const stored = localStorage.getItem('payround_user');
    if (!stored) { router.push('/login'); return; }
    let parsed;
    try { parsed = JSON.parse(stored); } catch { router.push('/login'); return; }
    const email = (parsed.email || '').toLowerCase();
    setMe(email);
    loadThreads(email);
    const to = (searchParams.get('to') || '').toLowerCase();
    if (to && to !== email) setActive(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThreads = async (email) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('messages').select('*')
        .or(`from_email.eq.${email},to_email.eq.${email}`)
        .order('created_at', { ascending: false }).limit(400);
      const map = new Map();
      (data || []).forEach(m => {
        const other = (m.from_email === email ? m.to_email : m.from_email);
        if (!map.has(other)) map.set(other, { email: other, last: null, unread: 0, user: null });
        const t = map.get(other);
        if (!t.last) t.last = m; // rows come newest-first
        if (m.to_email === email && !m.read) t.unread += 1;
      });
      const emails = [...map.keys()];
      if (emails.length) {
        const { data: us } = await supabase.from('users').select('id, name, email, profile_pic, is_verified').in('email', emails);
        (us || []).forEach(u => { const t = map.get((u.email || '').toLowerCase()); if (t) t.user = u; });
      }
      setThreads([...map.values()]);
    } catch { setThreads([]); }
  };

  // Open conversation: load messages, mark theirs as read, keep polling for new ones
  useEffect(() => {
    if (!active || !me) return;
    nearBottom.current = true;
    firstOpen.current = true;
    let alive = true;
    const load = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.from('messages').select('*')
          .or(`and(from_email.eq.${me},to_email.eq.${active}),and(from_email.eq.${active},to_email.eq.${me})`)
          .order('created_at', { ascending: true }).limit(500);
        if (!alive) return;
        // Only auto-scroll on the first open, or while the user is already near the newest
        // message — never yank the view while they're scrolling up to read history
        if (firstOpen.current || nearBottom.current) scrollToEnd();
        firstOpen.current = false;
        setMsgs(data);
        await supabase.from('messages').update({ read: true }).eq('from_email', active).eq('to_email', me).eq('read', false);
      } catch {}
    };
    const loadUser = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: u } = await supabase.from('users').select('id, name, email, profile_pic, is_verified').eq('email', active).single();
        if (alive) setOtherUser(u || null);
      } catch {}
    };
    load(); loadUser();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [active, me]);

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending || !active) return;
    setSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('messages').insert({
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        from_email: me, to_email: active, body: text,
      });
      if (error) throw error;
      setBody('');
      nearBottom.current = true;
      setMsgs(prev => [...prev, { id: `local-${Date.now()}`, from_email: me, to_email: active, body: text, created_at: new Date().toISOString(), read: false }]);
      scrollToEnd();
      loadThreads(me);
    } catch (err) { toast.error(`Could not send: ${err.message || 'try again'}`); }
    setSending(false);
  };

  // Delete a message you sent — it is removed for BOTH sides
  const del = async (m) => {
    if (String(m.id).startsWith('local-')) { toast('Just sent — try again in a second'); return; }
    if (!window.confirm('Delete this message? It disappears for both of you.')) return;
    setDeleting(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('messages').delete().eq('id', m.id);
      if (error) throw error;
      setMsgs(prev => prev.filter(x => x.id !== m.id));
      setSel('');
      loadThreads(me);
    } catch (err) { toast.error(`Could not delete: ${err.message || 'try again'}`); }
    setDeleting(false);
  };

  const nameOf = (t) => t?.user?.name || otherUser?.name || 'PayRound member';
  const timeOf = (iso) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : '';
  const dateOf = (iso) => iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';

  if (!me) return <LoadingScreen label="Loading messages…" />;

  /* ============ CHAT VIEW ============ */
  if (active) {
    const displayName = otherUser?.name || 'PayRound member';
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* chat head */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <button onClick={() => { setActive(''); setOtherUser(null); loadThreads(me); }} aria-label="Back to conversations" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
                <HiArrowLeft className="w-5 h-5" />
              </button>
              {otherUser?.profile_pic ? (
                <img src={otherUser.profile_pic} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-100" />
              ) : (
                <span className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center">{displayName.charAt(0).toUpperCase()}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="flex items-center gap-1 text-sm font-bold text-gray-900">
                  <span className="truncate">{displayName}</span>
                  {otherUser?.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0 badge-emboss" />}
                </p>
                {otherUser?.id && (
                  <button onClick={() => router.push(`/users/${otherUser.id}`)} className="text-[11px] text-primary-600 font-medium hover:text-primary-700">View profile →</button>
                )}
              </div>
            </div>

            {/* messages */}
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
              className="h-[55vh] overflow-y-auto px-4 py-4 space-y-2.5">
              {msgs.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-10">No messages yet — say hello! 👋<br />Messages are delivered in-app (this is not WhatsApp).</p>
              )}
              {msgs.length > 0 && (
                <p className="text-center text-[10px] text-gray-300 mb-1">Tip: tap your own bubble to delete it 🗑</p>
              )}
              {msgs.map((m, i) => {
                const mine = m.from_email === me;
                const prev = msgs[i - 1];
                const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                return (
                  <div key={m.id}>
                    {showDate && <p className="text-center text-[10px] text-gray-400 font-semibold my-2">{dateOf(m.created_at)}</p>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        onClick={mine && !String(m.id).startsWith('local-') ? () => setSel(sel === m.id ? '' : m.id) : undefined}
                        className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'} ${mine ? 'cursor-pointer' : ''} ${sel === m.id ? 'ring-2 ring-red-300' : ''}`}
                      >
                        <p className="whitespace-pre-line break-words">{m.body}</p>
                        <p className={`text-[9px] mt-0.5 ${mine ? 'text-primary-200 text-right' : 'text-gray-400'}`}>{timeOf(m.created_at)}{mine && m.read ? ' · read' : ''}</p>
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

            {/* composer */}
            <form onSubmit={send} className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
              <input
                type="text"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`Message ${displayName}…`}
                maxLength={500}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button type="submit" disabled={sending || !body.trim()} aria-label="Send"
                className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 transition-all shrink-0">
                <HiPaperAirplane className="w-5 h-5 rotate-90" />
              </button>
            </form>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ============ INBOX VIEW ============ */
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2"><HiChatAlt2 className="w-7 h-7 text-primary-600" /> Messages</h1>
        <p className="text-sm text-gray-500 mb-5">Chat in-app with business owners, group admins — everyone.</p>

        {threads === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading conversations…</p>
        ) : threads.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <HiChatAlt2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 mb-1">No conversations yet</p>
            <p className="text-xs text-gray-400 mb-4">Open someone's profile (People tab) or a business profile and tap the 💬 Message button.</p>
            <button onClick={() => router.push('/groups/search?tab=users')} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">Find People</button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {threads.map(t => (
              <button key={t.email} onClick={() => setActive(t.email)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                {t.user?.profile_pic ? (
                  <img src={t.user.profile_pic} alt="" className="w-11 h-11 rounded-full object-cover border border-gray-100 shrink-0" />
                ) : (
                  <span className="w-11 h-11 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center shrink-0">{(t.user?.name || 'P').charAt(0).toUpperCase()}</span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                    <span className="truncate">{nameOf(t)}</span>
                    {t.user?.is_verified && <HiBadgeCheck className="w-4 h-4 text-blue-500 shrink-0 badge-emboss" />}
                    <span className="ml-auto text-[10px] font-normal text-gray-400 shrink-0">{t.last ? dateOf(t.last.created_at) : ''}</span>
                  </span>
                  <span className={`block text-xs truncate mt-0.5 ${t.unread > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    {t.last ? `${t.last.from_email === me ? 'You: ' : ''}${t.last.body}` : ''}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{t.unread > 9 ? '9+' : t.unread}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading messages…" />}>
      <MessagesInner />
    </Suspense>
  );
}
