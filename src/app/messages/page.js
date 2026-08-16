'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LoadingScreen from '@/components/LoadingScreen';
import { HiArrowLeft, HiBadgeCheck, HiChatAlt2, HiPaperAirplane, HiSearch } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { sounds } from '@/lib/sounds';
import ChatSearchBar, { Mark, useChatSearch } from '@/components/ChatSearchBar';

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

// 💡 Suggested-question chips under bot answers — tap one and it's sent as if you typed it
function ChipRow({ items, onPick }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map(c => (
        <button key={c} type="button" onClick={() => onPick(c)}
          className="text-[11px] font-semibold bg-white/80 border border-amber-300 text-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 active:scale-95 transition-all">
          {c}
        </button>
      ))}
    </div>
  );
}

// 🤖 PayRound Chat Bot — AI-style helper: understands many ways of asking, knows the
// LIVE ad prices, group plans & PayRound bank account, walks users through fixes
// step by step, and suggests follow-up questions (tap a chip to ask instantly).
const money = (n) => `₦${Number(n || 0).toLocaleString()}`;
const pickSet = (s, ...keys) => { for (const k of keys) { const v = s?.[k]; if (v !== undefined && v !== null && v !== '') return v; } return null; };

// Follow-up chips travel inside the bot text as a small token, stripped at render time
function parseChips(body = '') {
  const m = String(body).match(/\n?\[\[CHIPS:([^\]]*)\]\]\s*$/);
  if (!m) return { text: body, chips: [] };
  return { text: String(body).slice(0, String(body).length - m[0].length), chips: m[1].split('|').map(x => x.trim()).filter(Boolean).slice(0, 4) };
}
const withChips = (body, chips) => (chips && chips.length ? `${body}\n[[CHIPS:${chips.join('|')}]]` : body);

function botReply(text, ctx = {}) {
  const t = String(text || '').toLowerCase().trim();
  const s = ctx.settings || null;
  const hi = (ctx.name || '').split(' ')[0] || 'there';

  // live numbers straight from PayRound settings (fallbacks = standard prices)
  const adD = pickSet(s, 'ad_1day', 'ad1day') ?? 500;
  const adW = pickSet(s, 'ad_1week', 'ad1week') ?? 3325;
  const adM = pickSet(s, 'ad_1month', 'ad1month') ?? 13500;
  const p1 = pickSet(s, 'plan_1m', 'plan1m');
  const p6 = pickSet(s, 'plan_6m', 'plan6m');
  const p12 = pickSet(s, 'plan_12m', 'plan12m');
  const bankName = pickSet(s, 'bank_name', 'bankName');
  const acctNo = pickSet(s, 'account_number', 'accountNumber');
  const acctName = pickSet(s, 'account_name', 'accountName');
  const hasBank = !!(bankName || acctNo);
  const plansLine = p1 == null ? '' : Array.from({ length: 12 }, (_, index) => index + 1).map(months => {
    const oneMonth = Number(p1 || 0);
    const sixMonths = Number(p6 ?? oneMonth * 6);
    const annual = Number(p12 ?? sixMonths + oneMonth * 6);
    const price = months <= 5 ? oneMonth * months : months === 6 ? sixMonths : months <= 11 ? sixMonths + oneMonth * (months - 6) : annual;
    return `\n• ${months} Month${months > 1 ? 's' : ''} — ${money(price)}`;
  }).join('');
  const bankBlock = hasBank ? `\n\n🏦 PayRound account:\n${bankName || ''}\n${acctNo || ''}\n${acctName || ''}` : '';
  const HUMAN_CHIP = '🙋 Talk to a human';

  /* ---------- small talk & flow control ---------- */
  if (/^(hi|hello|hey|yo|hiya|helo|how far|good (morning|afternoon|evening|day))\b/.test(t))
    return withChips(`👋 Hello ${hi}! I'm ${BOT_NAME} — your 24/7 PayRound assistant 🤖.\nI can walk you through groups, payments 💳, payouts 🤑, verification 🔵, ads 📢, passwords 🔑 and plenty more. What do you need?`, ['How does PayRound work?', 'When do I get paid?', 'Ad prices?', HUMAN_CHIP]);
  if (/^(how are you|how far na|wetin dey|sup|what'?s up|how is it going)\b/.test(t))
    return withChips(`😊 Running smooth, thanks for asking! What can I sort out for you today?`, ['How do groups work?', 'How do I pay?', HUMAN_CHIP]);
  if (/thank|tanks|thx|appreciate|nice one|well done/.test(t))
    return withChips(`😊 Anytime, ${hi}! I'm awake 24/7 — just come back whenever you need help.`, ['How does PayRound work?', HUMAN_CHIP]);
  if (/^(bye|goodbye|good ?night|later|see you)\b/.test(t))
    return withChips(`👋 Take care, ${hi}! I'll be right here whenever you need help again.`);
  if (/are you (a )?(bot|robot|real|human|ai)|who are you/.test(t))
    return withChips(`🤖 I'm ${BOT_NAME} — PayRound's automated assistant. Not human, but I know this app inside-out and I never sleep 😄. Anything I can't fix goes straight to the team in this same chat.`, ['How does PayRound work?', HUMAN_CHIP]);

  /* ---------- "yes / tell me more / how?" → continue the previous topic ---------- */
  const prevBot = [...(ctx.msgs || [])].reverse().find(m => m.sender_type === 'bot')?.body || '';
  const hasAny = (...ws) => ws.some(w => t.includes(w));
  const shortFollowUp = (/^(yes|yeah|yep|ok(ay)?|sure|pls|please|go on|more|tell me more|explain|continue)\b/.test(t) && t.length <= 20) || /^(how|why|and then)\??$/.test(t);
  const hasTopic = hasAny('pay', 'ad', 'group', 'password', 'verify', 'verif', 'payout', 'collect', 'receipt', 'price', 'cost', 'bank', 'email', 'refer', 'badge', 'scam', 'delete', 'palm', 'transfer');
  if (shortFollowUp && !hasTopic) {
    const MORE = [
      ['🤑', `🤑 Payout recap:\n• Group fills up → the clock starts.\n• Every round, ALL spots pay.\n• Spot #1 collects the full pot, then #2… down to the last spot — each spot collects exactly once.\n• Green boxes ✅ show which payments are already approved.`, ['How do I pay?', 'Receipt still pending', HUMAN_CHIP]],
      ['💳', `💳 Payment recap:\n• Pay only the ADMIN account pinned at the top of your group chat.\n• Screenshot the transfer receipt.\n• Upload it in the group — admin approval turns your box green ✅.\n• Never pay any account someone sends you in private DMs.`, ['Where is the bank to pay?', 'Receipt still pending', HUMAN_CHIP]],
      ['🔵', `🔵 Verification recap:\n• Profile → Apply for Verification → ID front & back photos.\n• Review usually completes within 48 hours.\n• Declined? Re-apply after 7 days with clearer photos.\n• Badges are FREE — only PayRound can give them.`, [HUMAN_CHIP]],
      ['📢', `📢 Ads recap:\n• Up to 5 media per ad + optional alt text on each.\n• AI can write the description from your media, or type your own.\n• Pay & upload receipt → ad goes live after confirmation.\n• Declined ads carry the reason — edit & resubmit free, your paid time is kept.`, ['Ad prices?', 'My ad is not showing', HUMAN_CHIP]],
      ['👥', `👥 Groups recap:\n• Browse or create groups from your Dashboard.\n• Spots are numbered; the rotation clock starts when the group is full.\n• Everyone keeps contributing until the last spot collects.\n• Your contribution is always the group amount shown on the group page — nothing more.`, ['When do I get paid?', 'How do I pay?', HUMAN_CHIP]],
      ['🔑', `🔑 Password recap:\n• Login page → "Forgot password?" → temporary password lands in your EMAIL (20 minutes valid).\n• Log in with it → set your own new password immediately.\n• Check Spam/Junk if the email hides, and search "PayRound".`, [HUMAN_CHIP]],
    ];
    for (const [marker, body, chips] of MORE) { if (prevBot.includes(marker)) return withChips(body, chips); }
    return withChips(`Sure 👍 — what exactly should I dig into? Pick one 👇`, ['When do I get paid?', 'How do I pay?', 'Ad prices?', 'Verification 🔵']);
  }

  const has = (...ws) => ws.some(w => t.includes(w));

  /* ---------- the knowledge base ---------- */
  if (has('human', 'real person', 'agent', 'customer care', 'customer service') || (has('talk', 'chat', 'speak') && has('admin', 'support', 'person', 'human', 'owner', 'staff')))
    return withChips(`🙋 The PayRound team has your messages — everything typed here is saved for them and they reply IN THIS CHAT (usually within a few hours).\n• Fastest line: the green WhatsApp button below my messages.\n• Adding details + screenshots here helps them solve it quicker.`, ['Receipt still pending', 'I forgot my password', 'My ad is not showing']);

  if (has('how does payround', 'what is payround', 'how it works', 'how does it work', 'about payround', 'explain payround', 'what is this app', 'how do you people work'))
    return withChips(`💡 PayRound = a digital Ajo (rotating savings) platform 🇳🇬:\n• Members join a group and take numbered spots.\n• Every round, ALL spots pay the contribution to the admin's bank account.\n• Spots collect the full pot one after another — #1 first … last spot last.\n• The rotation clock starts only when the group is FULL.${plansLine ? `\n\n💎 Group-CREATION plans — a one-off fee for STARTING your own group:${plansLine}\n⚠️ If you only hold a spot, you NEVER pay these plans — your payment is just the group contribution shown on the group page.` : ''}`, ['When do I get paid?', 'How do I join a group?', 'How do I pay?']);

  if (has('payout', 'collect', 'my turn', 'rotation', 'when will i get', 'when do i get', 'when am i getting', 'cash out', 'my money', 'pot'))
    return withChips(`🤑 Payouts — how collecting works:\n• Once the group is FULL the clock starts. Each round, every spot pays the contribution.\n• Spot #1 collects the full pot first, then #2, then #3… each spot collects exactly ONCE per cycle.\n• After you pay, upload the receipt — green boxes tick ✅ as the admin approves.\n• Your group page shows your spot number and the exact amount you collect.\n⏳ Someone delaying the round? Report it here — only the group admin (and us) can follow up with them.`, ['How do I pay?', 'Receipt still pending', HUMAN_CHIP]);

  if (has('how do i pay', 'how to pay', 'i want to pay', 'contribute', 'contribution', 'make payment', 'pay my spot', 'pay for my spot'))
    return withChips(`💳 Paying your contribution — step by step:\n1️⃣ Open your group → choose your spot(s) & week(s).\n2️⃣ Transfer to the ADMIN bank pinned at the top of the group chat (the green card, members only).\n3️⃣ Screenshot/photo the transfer receipt.\n4️⃣ Upload it in the group — the admin approves and your box turns green ✅.\n⚠️ Only ever pay the account shown INSIDE your group — never accounts sent in private DMs.`, ['Where is the bank to pay?', 'Receipt still pending', HUMAN_CHIP]);

  if (has('bank detail', 'account to pay', 'which account', 'admin account', 'where is the bank', 'cant see the bank', "can't see the bank", 'account number to pay', 'where do i pay'))
    return withChips(`🏦 The admin's bank details sit at the very TOP of your group chat (green card).\n• Only approved members of that group can see it — join first.\n• Member already but no card? The admin hasn't added their bank yet — ask in the group chat or DM them from their profile.`, ['How do I pay?', HUMAN_CHIP]);

  if (has('receipt', 'proof of payment', 'not approved', 'pending payment', 'approve my payment', 'payment declined', 'payment rejected'))
    return withChips(`🧾 Receipt still pending?\n• Only your GROUP ADMIN approves receipts — ping them in the group chat.\n• Make sure the photo clearly shows the amount, date, and receiving account.\n• Declined? Re-upload a clearer photo — declined receipts never count as paid.\n• Been waiting many hours? Type "human" and the team will nudge your admin.`, ['How do I pay?', HUMAN_CHIP]);

  if (has('verif', 'blue tick', 'blue mark', 'blue badge', 'id card', 'nin ', 'identity'))
    return withChips(`🔵 Getting the blue badge:\n1️⃣ Open Profile → Apply for Verification.\n2️⃣ Upload clear photos of your ID (front & back).\n3️⃣ Review usually finishes within 48 hours — you'll get a notification.\n• Declined? Re-apply after 7 days with sharper photos.\n• Verification is FREE and only PayRound can approve it — anyone "selling" badges is a scammer, report them here.`, [HUMAN_CHIP]);

  if (has('black badge', 'gold badge', 'golden badge', 'golden circle', 'official badge', 'badge mean', 'badges mean', 'types of badge'))
    return withChips(`🏅 Badge guide:\n🔵 Blue badge — verified user (ID checked by PayRound).\n⚫ Black badge with golden ring — official PayRound team ONLY; never given to regular users.\n🥉🥈🥇 Bronze/Silver/Gold group badges — trusted groups, awarded by PayRound after review.`, ['How do I get verified?', HUMAN_CHIP]);

  if (has('ad not showing', 'ad declined', 'ad rejected', 'ad pending', 'my ad', 'ad status', 'ad approved'))
    return withChips(`📉 Check your ad status — Advertise → My Ads (each ad shows its created date too):\n• ⏳ PENDING — receipt awaiting confirmation; ads go live only after payment confirms.\n• 🟢 LIVE — showing now, fairly shuffled with other advertisers. Expired ads hide automatically.\n• ❌ DECLINED — the reason is saved on the ad. Fix the media/text and resubmit FREE — your paid time is kept.`, ['Ad prices?', 'How do I pay for ads?', HUMAN_CHIP]);

  if (has('advert', ' ad ', 'ads', 'sponsor', 'promote my', 'ad prices', 'price of ad', 'advertising'))
    return withChips(`📢 Advertising on PayRound:\n1️⃣ Advertise → business name, then add up to 5 photos/videos (optional alt text each).\n2️⃣ Let the AI write a description from your media — or type your own.\n3️⃣ Pick how long it runs:\n• 1 Day — ${money(adD)}\n• 1 Week — ${money(adW)}\n• 1 Month — ${money(adM)}\n4️⃣ Transfer to the PayRound account & upload your receipt.${bankBlock}\n5️⃣ Payment confirmed → ad goes LIVE on the home page & dashboards, shuffled fairly with others.\nℹ️ Your draft stays saved if you leave to make the transfer — nothing is lost.`, ['My ad is not showing', 'Ad prices?', HUMAN_CHIP]);

  if (has('password', 'forgot', 'cant login', "can't login", 'cant log in', 'login problem', 'log in issue', 'sign in problem', 'reset'))
    return withChips(`🔑 Password help:\n• Change it: Settings → Security → Change Password (current password required).\n• Forgot it: login page → "Forgot password?" → a temporary password is EMAILED to you ⏳ valid 20 minutes. Log in with it, then set your own new one immediately.\n📧 Email not showing? Check Spam/Junk, search "PayRound", and make sure you typed the exact email you registered with.`, [HUMAN_CHIP]);

  if (has('change email', 'new email', 'update email', 'wrong email', 'change my email', 'email address'))
    return withChips(`📧 Changing your login email:\nSettings → Security → Change Email — your password is required.\n• Everything moves with you: groups, messages, ads, profile.\n• Afterwards log in with the NEW email; your password stays the same.`, ['I forgot my password', HUMAN_CHIP]);

  if (has('refer', 'invite', 'bonus', 'earn money', 'earn from', '500 per', 'my referrals'))
    return withChips(`🎁 Referral bonus:\n• Every account gets a personal referral link in Menu → My Referrals. No group membership is needed to share it.\n• Signup records the referral but pays no instant bonus.\n• You can earn one ₦500 bonus when the person you referred creates their first group and PayRound approves it — extra groups do not create extra bonuses.\n• To receive the money, you must own or be an approved member of a PayRound-approved group. If not, the ₦500 stays pending and releases automatically when you qualify.\n• Your referral list and date of birth are private unless you switch either one public in My Referrals.`, ['How do groups work?', HUMAN_CHIP]);

  if (has('announcement'))
    return withChips(`📣 Group announcements:\n• Posted by the group admin — shown in a bright box at the very TOP of the group chat.\n• They stay there until the admin clears them — always check there first for deadlines & rule changes.`, ['How do I pay?', HUMAN_CHIP]);

  if (has('message', 'inbox', 'dm ', 'chat with a member', 'private chat'))
    return withChips(`✉️ Messages: open Messages from the menu to chat privately with any member — or tap their profile → Message.\n• Unread chats get a green count.\n• This Support chat stays pinned at the very top of your list 💚.`, [HUMAN_CHIP]);

  if (has('notif', 'sound', 'bell', 'alert', 'mute'))
    return withChips(`🔔 Notifications & sounds:\n• Payment approvals, verification results, new followers, support replies — all land under the bell icon.\n• Too noisy? Settings → App sounds toggle.\n• Video ads have their own 🔊/🔇 button, separate from app sounds.`, [HUMAN_CHIP]);

  if (has('dark mode', 'dark theme', 'light mode', 'theme', 'too bright', 'night mode'))
    return withChips(`🌙 Dark mode: Settings → appearance toggle. The app remembers your choice on this phone — ads & chat boxes stay readable either way.`, [HUMAN_CHIP]);

  if (has('frozen', 'freeze', 'blocked account', 'suspended', 'banned'))
    return withChips(`❄️ A frozen account means a payment dispute or rule check is under review.\n• Your savings are NOT lost — it's a safety hold.\n• Tell me what happened here (or type "human") and the team will personally review your case in this chat.`, [HUMAN_CHIP]);

  if (has('delete my account', 'close my account', 'deactivate', 'delete account', 'remove my account'))
    return withChips(`🗓 You can schedule account deletion from Settings → Danger Zone. Deletion is not immediate: PayRound keeps your account and data recoverable for 7 days. During that time, either you or the PayRound owner can restore it. After the deadline, deletion is permanent.`, [HUMAN_CHIP]);

  if (has('delete ad', 'remove ad', 'take down my ad'))
    return withChips(`🗑 Removing an ad: Advertise → My Ads → delete. The ad & its media are removed; time already paid for isn't refunded.`, ['Ad prices?', HUMAN_CHIP]);

  if (has('scam', 'fraud', 'fake', 'hacker', 'stole', 'safe', 'trust', 'duped'))
    return withChips(`🛡 Staying safe on PayRound:\n• Pay ONLY the admin account shown INSIDE your group — never personal accounts sent in DMs.\n• PayRound staff will NEVER ask for your password or OTP.\n• Badges & verification are FREE and only come from inside the app.\n• Suspicious user? Open their profile and report — or type "human" right now and we'll step in.`, [HUMAN_CHIP]);

  if (has('price', 'cost', 'how much', 'plan', 'subscription', 'fee'))
    return withChips(`💎 Costs at a glance:\n• Registering & joining groups: FREE\n• Holding a spot: just the group contribution shown on the group page (e.g. the weekly amount) — nothing else.\n• Starting your OWN group (one-off group fee, NOT a spot payment):${plansLine || ' choose any duration from 1 to 12 months — prices are shown in the app'}\n• Ads: 1 Day ${money(adD)} · 1 Week ${money(adW)} · 1 Month ${money(adM)}\n• Verification & badges: FREE`, ['How does PayRound work?', 'Ad prices?', HUMAN_CHIP]);

  if (has('profile', 'my photo', 'avatar', 'change name', 'edit name', 'picture', 'bio'))
    return withChips(`👤 Your profile: Profile → Edit — change your name, photo, bio & occupation.\n📸 New photos go live after a quick safety review; you get notified the moment they're approved.`, ['How do I get verified?', HUMAN_CHIP]);

  if (has('group', 'ajo', 'join', 'save'))
    return withChips(`👥 Groups:\n• Browse open groups from your Dashboard (or Groups → search) and grab a spot — you only contribute the amount shown on that group's page.\n• Want to RUN one? Create your own group — that's a one-off 1/6/12-month group fee, totally separate from spot contributions.\n• Everyone contributes each round until the last spot collects — that's the Ajo way 🤝.`, ['When do I get paid?', 'How do I pay?', HUMAN_CHIP]);

  // fallback — honest, keeps the chat alive, and offers what I'm great at
  return withChips(`🤖 Hmm, I don't have a ready-made answer for that one yet — but it's saved for the team and they'll reply right here ASAP.\nMeanwhile, I'm really good at these 👇`, ['How does PayRound work?', 'When do I get paid?', 'How do I pay?', HUMAN_CHIP]);
}

// Real direct messages between users — business owners, group admins, everyone
function MessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [me, setMe] = useState('');
  const [meName, setMeName] = useState('');
  const [threads, setThreads] = useState(null); // [{ email, last, unread, user }]
  const [active, setActive] = useState('');     // peer email, support id, or user:<UUID> before the first message
  const [activeUserHint, setActiveUserHint] = useState(''); // safe public UUID supplied by profile/business links
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
  const [botSettings, setBotSettings] = useState(null); // live prices, plans & bank for the bot brain
  const [botTyping, setBotTyping] = useState(false);    // 🤖 "typing…" indicator
  const [threadQuery, setThreadQuery] = useState('');   // 🔍 search conversations
  const [freezeInfo, setFreezeInfo] = useState(null);  // frozen users see only approved-group admins + support
  const [peerContext, setPeerContext] = useState(null); // group admins see frozen-member status + safe note
  const cs = useChatSearch(active === SUPPORT_ID ? supMsgs : msgs); // 🔍 WhatsApp-style search INSIDE the open chat
  // switching conversations closes any open in-chat search
  useEffect(() => { cs.close(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
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
    (async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('get_my_account_freeze_status');
        if (!error) setFreezeInfo(data || { frozen: false, admins: [] });
      } catch { setFreezeInfo({ frozen: false, admins: [] }); }
    })();
    const to = (searchParams.get('to') || '').toLowerCase();
    const supportRequested = searchParams.get('support') === '1' || to === SUPPORT_ID;
    const userHint = (searchParams.get('user') || '').toLowerCase();
    const validUserHint = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userHint) ? userHint : '';
    if (supportRequested) setActive(SUPPORT_ID);
    else {
      if (validUserHint) setActiveUserHint(validUserHint);
      if (to && to !== email) setActive(to);
      else if (validUserHint) setActive(`user:${validUserHint}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!freezeInfo?.frozen || !active || active === SUPPORT_ID) return;
    const allowedEmails = new Set((freezeInfo.admins || []).map(admin => (admin.email || '').toLowerCase()));
    const allowedIds = new Set((freezeInfo.admins || []).map(admin => String(admin.id || '').toLowerCase()));
    const allowed = active.startsWith('user:')
      ? allowedIds.has(active.slice(5).toLowerCase())
      : allowedEmails.has(active.toLowerCase());
    if (!allowed) {
      setActive('');
      setActiveUserHint('');
      setOtherUser(null);
      toast.error('While frozen, you can chat only with approved-group admins or PayRound Support.');
    }
  }, [freezeInfo, active]);

  const loadThreads = async (email) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      // Both APIs bind identity inside PostgreSQL. No private users-table lookup
      // and no caller text is interpolated into PostgREST filter grammar.
      const [messageResult, peopleResult] = await Promise.all([
        supabase.rpc('get_my_direct_messages', { p_other_email: null, p_limit: 400 }),
        supabase.rpc('get_my_direct_message_people'),
      ]);
      if (messageResult.error) throw messageResult.error;
      if (peopleResult.error) throw peopleResult.error;

      const people = new Map((peopleResult.data || []).map(u => [(u.email || '').toLowerCase(), u]));
      const map = new Map();
      // The RPC returns the selected window oldest-first, so assigning last on
      // every pass leaves the newest message as the conversation preview.
      (messageResult.data || []).forEach(m => {
        const from = (m.from_email || '').toLowerCase();
        const to = (m.to_email || '').toLowerCase();
        const other = from === email ? to : from;
        if (!other || other === email) return;
        if (!map.has(other)) map.set(other, { email: other, last: null, unread: 0, user: people.get(other) || null });
        const t = map.get(other);
        t.last = m;
        if (to === email && !m.read) t.unread += 1;
      });
      // 💚 Pinned PayRound Support row (always first)
      let supLast = null, supUnread = 0;
      try {
        const { data: th } = await supabase.from('support_threads').select('id, last_message, last_at, user_read').eq('user_email', email).order('last_at', { ascending: false }).limit(1).maybeSingle();
        if (th) { supLast = { body: th.last_message, created_at: th.last_at, from_email: th.user_read ? email : 'owner' }; supUnread = th.user_read ? 0 : 1; }
      } catch {}
      setThreads([{ email: SUPPORT_ID, last: supLast, unread: supUnread, user: null, support: true }, ...map.values()]);
    } catch { setThreads([]); }
  };

  // Open conversation: load messages, mark theirs as read, keep polling for new ones
  useEffect(() => {
    if (!active || !me || active === SUPPORT_ID) return;
    nearBottom.current = true;
    firstOpen.current = true;
    let alive = true;
    const userRef = active.startsWith('user:') ? active.slice(5) : activeUserHint;
    const peerEmail = active.startsWith('user:') ? '' : active;
    setPeerContext(null);

    const load = async () => {
      if (!peerEmail) {
        if (alive) setMsgs([]);
        return;
      }
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('get_my_direct_messages', {
          p_other_email: peerEmail,
          p_limit: 500,
        });
        if (error) throw error;
        if (!alive) return;
        // Only auto-scroll on the first open, or while the user is already near the newest
        // message — never yank the view while they're scrolling up to read history
        if (firstOpen.current || nearBottom.current) scrollToEnd();
        firstOpen.current = false;
        setMsgs(data || []);
        await supabase.rpc('mark_my_direct_messages_read', { p_other_email: peerEmail });
      } catch {}
    };
    const loadUser = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        let u = null;
        if (userRef) {
          const result = await supabase.rpc('get_public_profile', { p_user_id: userRef });
          if (!result.error) u = result.data || null;
        }
        if (!u && peerEmail) {
          const result = await supabase.rpc('get_my_direct_message_people');
          if (!result.error) u = (result.data || []).find(person => (person.email || '').toLowerCase() === peerEmail) || null;
        }
        if (!u) {
          u = (freezeInfo?.admins || []).find(admin =>
            (peerEmail && (admin.email || '').toLowerCase() === peerEmail)
            || (userRef && String(admin.id || '').toLowerCase() === String(userRef).toLowerCase())
          ) || null;
        }
        if (peerEmail) {
          const contextResult = await supabase.rpc('get_direct_message_peer_context', { p_peer_email: peerEmail });
          if (!contextResult.error && alive) setPeerContext(contextResult.data || null);
        }
        if (alive) setOtherUser(u);
      } catch { if (alive) { setOtherUser(null); setPeerContext(null); } }
    };
    load(); loadUser();
    const t = peerEmail ? setInterval(load, 5000) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [active, activeUserHint, me, freezeInfo]);

  // 💚 Support chat: load thread + poll every 4s while open
  useEffect(() => {
    if (active !== SUPPORT_ID || !me) return;
    nearBottom.current = true;
    firstOpen.current = true;
    let alive = true;
    const load = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data: th } = await supabase.from('support_threads').select('*').eq('user_email', me).order('last_at', { ascending: false }).limit(1).maybeSingle();
        if (!alive) return;
        setSupThread(th || null);
        const { data: st } = await supabase.from('public_pricing').select('*').eq('id', 1).single();
        if (alive) { setOwnerOnline(!!st?.is_online); setBotSettings(st || null); }
        if (!th) { if (alive) setSupMsgs([]); return; }
        const { data: ms } = await supabase.from('support_messages').select('*').eq('thread_id', th.id).order('created_at', { ascending: true }).limit(300);
        if (!alive) return;
        setSupMsgs(prev => {
          const before = prev.filter(x => x.sender_type === 'owner').length;
          const after = (ms || []).filter(x => x.sender_type === 'owner').length;
          if (prev.length && after > before) { try { sounds.pop(); } catch {} }
          return ms || [];
        });
        await supabase.rpc('mark_my_support_read');
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
  const sendSupport = async (e, textOverride) => {
    e?.preventDefault();
    const text = String(textOverride ?? body).trim();
    if (!text || supSending) return;
    setSupSending(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: sent, error: sendError } = await supabase.rpc('send_my_support_message', { p_body: text });
      if (sendError) throw sendError;
      const now = sent?.created_at || new Date().toISOString();
      const tid = sent?.thread_id;
      if (!tid) throw new Error('Support thread could not be created');
      const row = { id: sent?.message_id || `sm-${Date.now()}`, thread_id: tid, sender_type: 'user', body: text };
      setSupThread(prev => ({ ...(prev || {}), id: tid, user_email: me }));
      setBody('');
      sounds.send();
      nearBottom.current = true;
      setSupMsgs(prev => prev.some(x => x.id === row.id) ? prev : [...prev, { ...row, created_at: now }]);
      scrollToEnd();
      if (!ownerOnline) {
        const reply = botReply(text, { name: meName, settings: botSettings, msgs: supMsgs, email: me });
        setBotTyping(true);
        setTimeout(async () => {
          try {
            const { supabase: sb } = await import('@/lib/supabase');
            const { data: botSent, error: botError } = await sb.rpc('send_my_support_bot_message', { p_thread_id: tid, p_body: reply });
            if (botError) throw botError;
            const brow = { id: botSent?.id || `sm-${Date.now()}-bot`, thread_id: tid, sender_type: 'bot', body: reply };
            setSupMsgs(prev => prev.some(x => x.id === brow.id) ? prev : [...prev, { ...brow, created_at: botSent?.created_at || new Date().toISOString() }]);
            sounds.pop();
            scrollToEnd();
          } catch {}
          setBotTyping(false);
        }, 1100);
      }
    } catch (err) { toast.error(`Could not send: ${err.message || 'try again'}`); }
    setSupSending(false);
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending || !active) return;
    if (peerContext?.can_message === false) {
      toast.error('This direct chat is unavailable while the account is frozen.');
      return;
    }
    if (freezeInfo?.frozen) {
      const allowedEmails = new Set((freezeInfo.admins || []).map(admin => (admin.email || '').toLowerCase()));
      const allowedIds = new Set((freezeInfo.admins || []).map(admin => String(admin.id || '').toLowerCase()));
      const allowed = active.startsWith('user:') ? allowedIds.has(active.slice(5).toLowerCase()) : allowedEmails.has(active.toLowerCase());
      if (!allowed) {
        toast.error('While frozen, you can message only approved-group admins or PayRound Support.');
        return;
      }
    }
    setSending(true);
    try {
      let peerEmail = active.startsWith('user:') ? '' : active;
      let messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      let queued = false;

      if (!peerEmail) {
        // A business link starts with only the owner's safe public UUID. The
        // server resolves their private email and validates the recipient.
        if (!otherUser?.id) throw new Error('This profile is not available to message');
        const { supabase } = await import('@/lib/supabase');
        const { data, error } = await supabase.rpc('send_my_direct_message', {
          p_to_user_id: otherUser.id,
          p_body: text,
        });
        if (error) throw error;
        peerEmail = (data?.peer_email || '').toLowerCase();
        messageId = data?.id || messageId;
        if (!peerEmail) throw new Error('Message recipient could not be resolved');
        setActiveUserHint(otherUser.id);
        setActive(peerEmail);
      } else {
        // Existing conversations retain offline queue support; database RLS and
        // mutation guards bind the sender to the authenticated session.
        const row = { id: messageId, from_email: me, to_email: peerEmail, body: text };
        const { writeWhenOnline } = await import('@/lib/offlineQueue');
        const result = await writeWhenOnline({ table: 'messages', op: 'insert', row });
        queued = result.queued;
        if (result.error) throw result.error;
      }

      setBody('');
      sounds.send();
      if (queued) toast('📴 Saved on this phone — will send when you are back online.');
      nearBottom.current = true;
      setMsgs(prev => [...prev, { id: `local-${messageId}`, from_email: me, to_email: peerEmail, body: text, created_at: new Date().toISOString(), read: false }]);
      scrollToEnd();
      loadThreads(me);
    } catch (err) { toast.error(`Could not send: ${err.message || 'try again'}`); }
    setSending(false);
  };

  // Delete a message you sent — it is removed for BOTH sides
  const del = async (m) => {
    if (freezeInfo?.frozen) {
      toast.error('Message deletion is unavailable while your account is frozen.');
      return;
    }
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

  const nameOf = (t) => t?.user?.name || 'PayRound member';
  const timeOf = (iso) => iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : '';
  const dateOf = (iso) => iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '';

  const inboxThreads = threads === null ? null : (() => {
    if (!freezeInfo?.frozen) return threads;
    const source = Array.isArray(threads) ? threads : [];
    const support = source.find(thread => thread.support) || { email: SUPPORT_ID, last: null, unread: 0, user: null, support: true };
    const byEmail = new Map(source.filter(thread => !thread.support).map(thread => [(thread.email || '').toLowerCase(), thread]));
    const admins = (freezeInfo.admins || []).map(admin => {
      const email = (admin.email || '').toLowerCase();
      const existing = byEmail.get(email);
      return existing ? { ...existing, user: { ...admin, ...(existing.user || {}) } } : { email, last: null, unread: 0, user: admin };
    }).filter(thread => thread.email);
    return [support, ...admins];
  })();

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
            <button onClick={() => { setActive(''); setActiveUserHint(''); }} className="bg-primary-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-primary-700">Back to Messages</button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ============ PAYROUND SUPPORT VIEW ============ */
  if (active === SUPPORT_ID) {
    return (
      <div className="h-[100dvh] flex flex-col bg-gray-50 overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col min-h-0 w-full max-w-2xl mx-auto px-4 py-4">
          <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* 👑 Owner profile head — official account, black badge with golden ring */}
            <div className="px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900">
              <div className="flex items-center gap-3">
                <button onClick={() => { setActive(''); setActiveUserHint(''); loadThreads(me); }} aria-label="Back to conversations" className="p-1.5 rounded-full hover:bg-white/10 text-gray-300">
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
                <button onClick={cs.toggle} aria-label="Search in this chat" title="Search in this chat"
                  className={`p-2 rounded-full transition-colors shrink-0 ${cs.open ? 'bg-yellow-400/30 text-yellow-300' : 'text-gray-300 hover:bg-white/10'}`}>
                  <HiSearch className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* 🔍 in-chat keyword/date search (WhatsApp-style) — forced bright in both themes */}
            <ChatSearchBar cs={cs} />

            {/* messages */}
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2.5">
              {/* greeting (local until the first real message is sent) */}
              {supMsgs.length === 0 && (
                <div className="flex justify-start">
                  <div className="max-w-[84%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm bot-bubble">
                    <p className="text-[10px] font-bold text-amber-700 mb-0.5">🤖 {BOT_NAME}</p>
                    <p className="whitespace-pre-line">👋 Hi{meName ? ' ' + meName.split(' ')[0] : ''}! Welcome to PayRound Support.{'\n'}Ask me anything — I know live prices 💎, payouts 🤑, payments 💳, verification 🔵, ads 📢, groups 👥 and more.{'\n'}If you need a human, the PayRound team replies in this chat ASAP.</p>
                    <ChipRow items={['How does PayRound work?', 'When do I get paid?', 'Ad prices?']} onPick={(c) => sendSupport(null, c)} />
                    <WaButton />
                  </div>
                </div>
              )}
              {supMsgs.map((m, i) => {
                const mine = m.sender_type === 'user';
                const bot = m.sender_type === 'bot';
                const pc = bot ? parseChips(m.body) : { text: m.body, chips: [] };
                const prev = supMsgs[i - 1];
                const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                return (
                  <div key={m.id} data-mid={m.id}>
                    {showDate && <p className="text-center text-[10px] text-gray-400 font-semibold my-2">{dateOf(m.created_at)}</p>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] px-3.5 py-2 rounded-2xl text-sm ${
                        mine ? 'bg-primary-600 text-white rounded-br-md'
                          : bot ? 'bot-bubble rounded-bl-md'
                          : 'bg-gray-900 text-white rounded-bl-md border border-yellow-400/50'}${String(cs.activeId) === String(m.id) || cs.flash === String(m.id) ? ' ring-2 ring-yellow-400' : ''}`}>
                        {!mine && (
                          <p className={`text-[10px] font-bold mb-0.5 flex items-center gap-1 ${bot ? 'text-amber-700' : 'text-yellow-400'}`}>
                            {bot ? <>🤖 {BOT_NAME}</> : <>PayRound Team <OwnerBadge className="w-3.5 h-3.5" /></>}
                          </p>
                        )}
                        <p className="whitespace-pre-line break-words"><Mark text={pc.text} q={cs.open ? cs.query : ''} /></p>
                        {bot && <ChipRow items={pc.chips} onPick={(c) => sendSupport(null, c)} />}
                        {bot && <WaButton />}
                        <p className={`text-[9px] mt-0.5 ${mine ? 'text-primary-200 text-right' : bot ? 'text-amber-700/70' : 'text-gray-400'}`}>{timeOf(m.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* 🤖 typing indicator while the bot composes its answer */}
              {botTyping && (
                <div className="flex justify-start">
                  <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm bot-bubble">
                    <p className="text-[10px] font-bold text-amber-700 mb-0.5">🤖 {BOT_NAME}</p>
                    <p className="flex items-center gap-1.5 text-amber-700/80 text-xs font-semibold">thinking
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce inline-block" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce inline-block" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce inline-block" style={{ animationDelay: '300ms' }} />
                    </p>
                  </div>
                </div>
              )}
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
      </div>
    );
  }

  /* ============ CHAT VIEW ============ */
  if (active) {
    const displayName = otherUser?.name || 'PayRound member';
    return (
      <div className="h-[100dvh] flex flex-col bg-gray-50 overflow-hidden">
        <Header />
        <div className="flex-1 flex flex-col min-h-0 w-full max-w-2xl mx-auto px-4 py-4">
          <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* chat head */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <button onClick={() => { setActive(''); setActiveUserHint(''); setOtherUser(null); loadThreads(me); }} aria-label="Back to conversations" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
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
              <button onClick={cs.toggle} aria-label="Search in this chat" title="Search in this chat"
                className={`p-2 rounded-full transition-colors shrink-0 ${cs.open ? 'bg-yellow-100 text-yellow-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                <HiSearch className="w-5 h-5" />
              </button>
            </div>
            {/* 🔍 in-chat keyword/date search (WhatsApp-style) */}
            <ChatSearchBar cs={cs} />
            {freezeInfo?.frozen && (
              <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 text-xs text-sky-900">
                <b>❄️ Restricted account chat:</b> this conversation stays open because {displayName} administers one of your approved groups. Keep it to resolving existing group or payment matters.
              </div>
            )}
            {peerContext?.peer_is_frozen && peerContext?.admin_note && (
              <div className="px-4 py-3 bg-sky-50 border-b border-sky-200 text-xs text-sky-900">
                <p className="font-bold">❄️ This member&apos;s PayRound account is frozen</p>
                <p className="mt-1"><b>Admin-safe note:</b> {peerContext.admin_note}</p>
                <p className="mt-1 text-sky-700">This private chat intentionally remains open so you can resolve existing group or payment matters. Their unrelated chats and other PayRound actions are blocked.</p>
              </div>
            )}

            {/* messages */}
            <div ref={listRef} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
              className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2.5">
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
                  <div key={m.id} data-mid={m.id}>
                    {showDate && <p className="text-center text-[10px] text-gray-400 font-semibold my-2">{dateOf(m.created_at)}</p>}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        onClick={mine && !freezeInfo?.frozen && !String(m.id).startsWith('local-') ? () => setSel(sel === m.id ? '' : m.id) : undefined}
                        className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm ${mine ? 'bg-primary-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'} ${mine ? 'cursor-pointer' : ''} ${sel === m.id ? 'ring-2 ring-red-300' : ''}${String(cs.activeId) === String(m.id) || cs.flash === String(m.id) ? ' ring-2 ring-yellow-400' : ''}`}
                      >
                        <p className="whitespace-pre-line break-words"><Mark text={m.body} q={cs.open ? cs.query : ''} /></p>
                        <p className={`text-[9px] mt-0.5 ${mine ? 'text-primary-200 text-right' : 'text-gray-400'}`}>{timeOf(m.created_at)}{mine && m.read ? ' · read' : ''}</p>
                      </div>
                    </div>
                    {mine && !freezeInfo?.frozen && sel === m.id && (
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
                disabled={peerContext?.can_message === false}
                placeholder={peerContext?.can_message === false ? 'This chat is unavailable while the account is frozen' : `Message ${displayName}…`}
                maxLength={500}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
              <button type="submit" disabled={sending || !body.trim() || peerContext?.can_message === false} aria-label="Send"
                className="w-10 h-10 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700 disabled:opacity-40 transition-all shrink-0">
                <HiPaperAirplane className="w-5 h-5 rotate-90" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ============ INBOX VIEW ============ */
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2"><HiChatAlt2 className="w-7 h-7 text-primary-600" /> Messages</h1>
        <p className="text-sm text-gray-500 mb-3">{freezeInfo?.frozen ? 'Only your approved-group admins and PayRound Support are available while your account is frozen.' : 'Chat in-app with business owners, group admins — everyone.'}</p>
        {freezeInfo?.frozen && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 mb-4 text-xs text-sky-900">
            <p className="font-bold">❄️ Limited frozen-account messaging</p>
            <p className="mt-1">Use these chats only to resolve existing group, payment or account matters. All unrelated direct chats and other app actions remain blocked.</p>
          </div>
        )}

        {/* 🔍 search conversations — names, emails, even words inside the last message */}
        {inboxThreads !== null && inboxThreads.length > 0 && (
          <div className="relative mb-4">
            <input
              value={threadQuery}
              onChange={e => setThreadQuery(e.target.value)}
              placeholder="Search chats…"
              maxLength={60}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
          </div>
        )}

        {inboxThreads === null ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading conversations…</p>
        ) : inboxThreads.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <HiChatAlt2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 mb-1">No conversations yet</p>
            <p className="text-xs text-gray-400 mb-4">Open someone's profile (People tab) or a business profile and tap the 💬 Message button.</p>
            <button onClick={() => router.push('/groups/search?tab=users')} className="bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-700 transition-colors">Find People</button>
          </div>
        ) : (() => {
          const tq = threadQuery.trim().toLowerCase();
          const visible = !tq ? inboxThreads : inboxThreads.filter(t => [t.support ? 'payround support' : '', t.user?.name || '', t.email || '', t.last?.body || '', t.last?.from_email || ''].join(' ').toLowerCase().includes(tq));
          if (visible.length === 0) {
            return (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                No chat matches “{threadQuery.trim()}” 🤷 — try a name, email or a word from the messages.
              </div>
            );
          }
          return (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {visible.map(t => t.support ? (
              <button key="support" onClick={() => { setActiveUserHint(''); setActive(SUPPORT_ID); }} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left bg-gradient-to-r from-yellow-50/70 to-transparent">
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
              <button key={t.email} onClick={() => { setOtherUser(t.user || null); setActiveUserHint(t.user?.id || ''); setActive(t.email); }} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
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
                    {t.last ? `${t.last.from_email === me ? 'You: ' : ''}${t.last.body}` : (t.user?.groups?.length ? `Admin of ${t.user.groups.map(group => group.name).join(', ')}` : 'Approved-group admin contact')}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{t.unread > 9 ? '9+' : t.unread}</span>
                )}
              </button>
            ))}
          </div>
          );
        })()}
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
