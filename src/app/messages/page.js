'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { HiArrowLeft, HiBadgeCheck, HiChatAlt2, HiPaperAirplane } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { sounds } from '@/lib/sounds';

const SUPPORT_ID = 'payround-support';
const BOT_NAME = 'PayRound Chat Bot';
const OWNER_WA = 'https://wa.me/2349151723199?text=' + encodeURIComponent('Hello PayRound 👋 I need help with: ');

// 👑 OWNER-ONLY black badge with a golden ring — never awarded to any user; marks official PayRound accounts
function OwnerBadge({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={`owner-badge inline-block shrink-0 ${className}`} aria-label="PayRound official account">
      <circle cx="12" cy="12" r="10" fill="#0a0a0a" stroke="#f5c518" strokeWidth="2.6" />
      <path d="M7.4 12.4l3 3L16.4 8.6" stroke="#f5c518" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// WhatsApp shortcut — shown on the greeting and every bot bubble so users can reach a human fast
function WaButton() {
  return (
    <a href={OWNER_WA} target="_blank" rel="noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 bg-[#25D366] text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow hover:brightness-95 transition-all">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.6 14.2c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.1-1.8-.1-2.2-.7-4.4-2.4-5.8-4.5-.9-1.4-1.3-2.8-1-3.9.2-.8 1-1.5 1.5-1.5h.6c.2 0 .5-.1.7.5.2.6.8 2 .8 2.1.1.1.1.3 0 .5-.3.6-.7.8-.5 1.2.7 1.2 1.6 2.1 2.9 2.7.4.2.6.1.8-.1l.7-.9c.2-.3.5-.2.8-.1l2 1c.3.1.5.2.5.4 0 .1 0 .4-.3.8z"/></svg>
      Chat on WhatsApp (faster)
    </a>
  );
}

// 🤖 Chatbot brain — instant answer based on what the user asks
function botReply(text, name) {
  const t = (text || '').toLowerCase();
  const hi = (name || '').split(' ')[0] || 'there';
  const wa = '\n\n💬 For a FASTER reply, tap the green WhatsApp button below this message — the team answers quickly there. 👇';
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo|how far)\b/.test(t))
    return `👋 Hello ${hi}! I'm ${BOT_NAME} 🤖. The team is offline right now, but I can help instantly with payouts 🤑, payments 💳, verification 🔵, ads 📢 or groups 👥 — just ask!` + wa;
  if (t.includes('payout') || t.includes('collect') || t.includes('rotation') || t.includes('my turn'))
    return `🤑 Payouts: every spot pays each round, and each spot COLLECTS once, in order. Once the group is full the clock starts — spot #1 collects after everyone contributes, then #2, and so on until the last spot. Your exact "you collect ₦X per spot" shows on your group page.` + wa;
  if (t.includes('pay') || t.includes('receipt') || t.includes('transfer') || t.includes('contribute') || t.includes('contribution'))
    return `💳 Paying contributions: open your group → pick your spot(s) + week(s) → transfer to the ADMIN bank pinned at the top of the group chat → upload the receipt pic. The admin approves and your green boxes tick ✅. You can upload straight from the group chat too.` + wa;
  if (t.includes('verif') || t.includes('badge') || t.includes('blue tick') || t.includes('blue mark'))
    return `🔵 Verification: open your profile → Apply for Verification → upload your ID front & back. Review usually takes under 48 hours. If it's declined you can re-apply after 7 days.` + wa;
  if (t.includes('ad ') || t.includes('advert') || t.includes('sponsor'))
    return `📢 Advertising: open the Advertise page → business name + up to 5 photos/videos → pick 1 Day / 1 Week / 1 Month (price shown on each) → pay to the PayRound account → upload your receipt. Once payment is confirmed the ad goes LIVE on the home page & every dashboard!` + wa;
  if (t.includes('group') || t.includes('ajo') || t.includes('join') || t.includes('save'))
    return `👥 Groups: browse groups from your Dashboard (or create yours — 1/6/12-month plans). Contributions run in rounds and everyone keeps paying until the last spot collects. Group admin earns interest on the savings.` + wa;
  if (t.includes('password') || t.includes('log in') || t.includes('login') || t.includes('sign in') || t.includes('forgot'))
    return `🔑 Login help: tap "Forgot password?" on the login page — a temporary password is emailed to you (works for 20 minutes) and you'll set your own new one right after logging in.` + wa;
  if (t.includes('human') || t.includes('owner') || t.includes('admin') || t.includes('person') || t.includes('someone'))
    return `🙋 Noted — the PayRound team has been flagged and will personally reply IN THIS CHAT as soon as they're back (usually within a few hours). Everything you typed here is saved for them.` + wa;
  if (t.includes('thank') || t.startsWith('ok') || t.includes('nice') || t.includes('great'))
    return `😊 Anytime! Anything else, just type it here — I'm around 24/7.` + wa;
  return `🤖 Got it! I've saved your message for the team — they'll reply right here ASAP. Quick topics in the meantime: payouts 🤑, payments 💳, verification 🔵, ads 📢, groups 👥 — ask me about any of them!` + wa;
}

// Real direct messages between users — business owners, group admins, everyone
function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState('');
  const [meName, setMeName] = useState('');
  const [threads, setThreads] = useState(null); // [{ email, last, unread, user }]
  const [active, setActive] = useState('');     // other party's email
  const [msgs, setMsgs] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sel, setSel] = useState('');        // bubble the user tapped (shows the 🗑 Delete chip)
  const [deleting, setDeleting] = useState(false);
  // 💚 PayRound Support chat (pinned thread + chatbot when the team is offline)
  const [supThread, setSupThread] = useState(null);
  const [supMsgs, setSupMsgs] = useState([]);
  const [ownerOnline, setOwnerOnline] = useState(false);
  const [supSending, setSupSending] = useState(false);
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
    setMeName(parsed.name || '');
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
      // 💚 Pinned PayRound Support row (always first)
      let supLast = null, supUnread = 0;
      try {
        const { data: th } = await supabase.from('support_threads').select('id, last_message, last_at, user_read').eq('user_email', email).maybeSingle();
        if (th) { supLast = { body: th.last_message, created_at: th.last_at, from_email: th.user_read ? email : 'owner' }; supUnread = th.user_read ? 0 : 1; }
      } catch {}
      setThreads([{ email: SUPPORT_ID, last: supLast, unread: supUnread, user: null, support: true }, ...map.values()]);
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

  // 💚 Support chat: load thread + poll every 4s while open
  useEffect(() => {
    if (active !== SUPPORT_ID || !me) return;
    nearBottom.current = true;
    firstOpen.current = true;
    let alive = true;
    const load = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: th } = await supabase.from('support_threads').select('*').eq('user_email', me).maybeSingle();
        if (!alive) return;
        setSupThread(th || null);
        const { data: st } = await supabase.from('owner_settings').select('is_online').eq('id', 1).single();
        if (alive) setOwnerOnline(!!st?.is_online);
        if (!th) { if (alive) setSupMsgs([]); return; }
        const { data: ms } = await supabase.from('support_messages').select('*').eq('thread_id', th.id).order('created_at', { ascending: true }).limit(300);
        if (!alive) return;
        setSupMsgs(prev => {
          const before = prev.filter(x => x.sender_type === 'owner').length;
          const after = (ms || []).filter(x => x.sender_type === 'owner').length;
          if (prev.length && after > before) { try { sounds.pop(); } catch {} }
          return ms || [];
        });
        await supabase.from('support_messages').update({ read: true }).eq('thread_id', th.id).eq('sender_type', 'owner').eq('read', false);
        await supabase.from('support_threads').update({ user_read: true }).eq('id', th.id);
        if (firstOpen.current || nearBottom.current) scrollToEnd();
        firstOpen.current = false;
      } catch {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, me]);

  // 💚 send to support — creates the thread on first message; bot answers instantly if the team is offline
  const sendSupport = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || supSending) return;
    setSupSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const now = new Date().toISOString();
      let tid = supThread?.id;
      if (!tid) {
        tid = `st-${Date.now()}`;
        const { error } = await supabase.from('support_threads').insert({ id: tid, user_email: me, user_name: meName || me, last_message: text, last_at: now, user_read: true, owner_read: false });
        if (error) throw error;
        setSupThread({ id: tid, user_email: me });
      } else {
        await supabase.from('support_threads').update({ last_message: text, last_at: now, owner_read: false, user_read: true }).eq('id', tid);
      }
      const row = { id: `sm-${Date.now()}`, thread_id: tid, sender_type: 'user', body: text };
      const { error: mErr } = await supabase.from('support_messages').insert(row);
      if (mErr) throw mErr;
      setBody('');
      sounds.send();
      nearBottom.current = true;
      setSupMsgs(prev => [...prev, { ...row, created_at: now }]);
      scrollToEnd();
      if (!ownerOnline) {
        const reply = botReply(text, meName);
        const theTid = tid;
        setTimeout(async () => {
          try {
            const { supabase: sb } = await import('@/lib/supabase');
            const brow = { id: `sm-${Date.now()}-bot`, thread_id: theTid, sender_type: 'bot', body: reply };
            await sb.from('support_messages').insert(brow);
            setSupMsgs(prev => prev.some(x => x.id === brow.id) ? prev : [...prev, { ...brow, created_at: new Date().toISOString() }]);
            sounds.pop();
            scrollToEnd();
          } catch {}
        }, 900);
      }
    } catch (err) { toast.error(`Could not send: ${err.message || 'try again'}`); }
    setSupSending(false);
  };

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
      sounds.send();
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

  /* Safety: two windows on one phone share ONE login — never render a chat "with myself" */
  if (active && active === me) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <p className="text-4xl mb-3">😅</p>
            <h2 className="text-lg font-bold text-gray-900 mb-2">You can&apos;t message yourself</h2>
            <p className="text-sm text-gray-500 mb-1">This device is logged in as <b>{meName || me}</b> ({me}) — the conversation you opened points back to this same account.</p>
            <p className="text-xs text-gray-400 mb-5">Tip: the installed PayRound app and Chrome on the same phone share ONE login. To chat between two accounts, use two devices — or keep one account in Chrome&apos;s Incognito window.</p>
            <button onClick={() => setActive('')} className="bg-primary-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-700">Back to Messages</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ============ PAYROUND SUPPORT VIEW ============ */
  if (active === SUPPORT_ID) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* 👑 Owner profile head — official account, black badge with golden ring */}
            <div className="px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900">
              <div className="flex items-center gap-3">
                <button onClick={() => { setActive(''); loadThreads(me); }} aria-label="Back to conversations" className="p-1.5 rounded-full hover:bg-white/10 text-gray-300">
                  <HiArrowLeft className="w-5 h-5" />
                </button>
                <span className="relative w-11 h-11 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center text-lg border-2 border-yellow-400 shadow-lg shadow-black/40 shrink-0">P</span>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                    <span className="truncate">PayRound Customer Care</span>
                    <OwnerBadge className="w-5 h-5" />
                  </p>
                  <p className="text-[11px] text-gray-300 flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full inline-block ${ownerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400'}`} />
                    {ownerOnline ? 'Team is ONLINE — you\'re chatting with the owner directly' : `🤖 ${BOT_NAME} answers instantly while the team is away`}
                  </p>
                </div>
              </div>
            </div>

            {/* messages */}
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
              className="h-[55vh] overflow-y-auto px-4 py-4 space-y-2.5">
              {/* greeting (local until the first real message is sent) */}
              {supMsgs.length === 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[84%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm bot-bubble">
                    <p className="text-[10px] font-bold text-amber-700 mb-0.5">🤖 {BOT_NAME}</p>
                    <p className="whitespace-pre-line">👋 Hi{meName ? ' ' + meName.split(' ')[0] : ''}! Welcome to PayRound Support.{'\n'}Ask me anything — payouts 🤑, payments 💳, verification 🔵, ads 📢, groups 👥.{'\n'}If you need a human, the PayRound team replies in this chat ASAP.</p>
                    <WaButton />
                  </div>
                </div>
              )}
              {supMsgs.map((m, i) => {
                const mine = m.sender_type === 'user';
                const bot = m.sender_type === 'bot';
                const prev = supMsgs[i - 1];
                const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                return (
                  <div key={m.id}>
                    {showDate && <p className="text-center text-[10px] text-gray-400 font-semibold my-2">{dateOf(m.created_at)}</p>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-sm ${
                        mine ? 'bg-primary-600 text-white rounded-br-md'
                          : bot ? 'bot-bubble rounded-bl-md'
                          : 'bg-gray-900 text-white rounded-bl-md border border-yellow-400/50'}`}>
                        {!mine && (
                          <p className={`text-[10px] font-bold mb-0.5 flex items-center gap-1 ${bot ? 'text-amber-700' : 'text-yellow-400'}`}>
                            {bot ? <>🤖 {BOT_NAME}</> : <>PayRound Team <OwnerBadge className="w-3.5 h-3.5" /></>}
                          </p>
                        )}
                        <p className="whitespace-pre-line break-words">{m.body}</p>
                        {bot && <WaButton />}
                        <p className={`text-[9px] mt-0.5 ${mine ? 'text-primary-200 text-right' : bot ? 'text-amber-700/70' : 'text-gray-400'}`}>{timeOf(m.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* composer */}
            <form onSubmit={sendSupport} className="flex items-center gap-2 px-3 py-3 border-t border-gray-100">
              <input
                type="text"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Ask PayRound Support…"
                maxLength={500}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button type="submit" disabled={supSending || !body.trim()} aria-label="Send"
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
                <p className="text-[10px] text-gray-400 mt-0.5">You&apos;re chatting as <span className="font-semibold text-gray-600">{meName || me}</span></p>
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
            {threads.map(t => t.support ? (
              <button key="support" onClick={() => setActive(SUPPORT_ID)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left bg-gradient-to-r from-yellow-50/70 to-transparent">
                <span className="w-11 h-11 rounded-full bg-gray-900 text-yellow-400 font-bold flex items-center justify-center shrink-0 text-lg border-2 border-yellow-400 shadow">P</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1 text-sm font-bold text-gray-900">
                    <span className="truncate">PayRound Support</span>
                    <OwnerBadge className="w-4 h-4" />
                    <span className="ml-auto text-[10px] font-normal text-gray-400 shrink-0">{t.last ? dateOf(t.last.created_at) : ''}</span>
                  </span>
                  <span className={`block text-xs truncate mt-0.5 ${t.unread > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    {t.last ? (t.last.from_email === 'owner' ? '💬 ' : 'You: ') + t.last.body : '🤖 Bot answers instantly 24/7 • tap to chat with the team'}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">new</span>
                )}
              </button>
            ) : (
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
