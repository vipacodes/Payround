// Mock data store - ORIGINAL DESIGN PRESERVED + V2 ENHANCEMENTS - NO DEMO, REAL ONLY
export const OWNER_EMAILS = ['vipadarapper@gmail.com', 'payroundsupport@gmail.com'];
export const GROUP_COLORS = ['#0A7E3C','#2563EB','#DC2626','#7C3AED','#EA580C','#0891B2','#BE185D','#4338CA','#15803D','#B45309','#0E7490','#1F2937'];
export function isOwnerEmail(email){ if(!email) return false; return OWNER_EMAILS.includes(email.toLowerCase().trim()); }

export const platformInfo = {
  name: 'Payround',
  tagline: 'Manage Your Ajo. Build Trust. Grow Together.',
  description: 'Nigeria\'s trusted digital Ajo management platform. Bringing transparency and trust to community savings.',
  contact: {
    email: 'Payroundsupport@gmail.com',
    phone: '',
    whatsapp: '+2349151723199',
    hours: 'Mon-Sat, 8AM - 6PM',
  },
  owner: {
    name: 'Basikoro James Okeroghene',
    title: 'Founder',
    bankName: 'Palmpay',
    accountNumber: '9151723199',
    accountName: 'Basikoro James Okeroghene',
    whatsapp: '+2349151723199',
  },
  social: {
    instagram: 'https://instagram.com/payround',
    twitter: 'https://twitter.com/payround',
    facebook: 'https://facebook.com/payround',
  },
  groupCreationFee: 5000,
  renewalFee: 5000,
  adPricing: { day: 500, week: 3325, month: 13500 },
  ownerEmails: OWNER_EMAILS,
  groupColors: GROUP_COLORS,
};

export const storageConfig = {
  cloudinary: { note: '25GB free + 150KB WebP + Telegram unlimited backup' },
  rules: { trialOncePerEmail: true, trialDays: 7, trialFreezeDays: 7, trialDeleteAfter: 14, sixMonthExpiry: true, graceDays: 7, frozenNoEdit: true, onlyOwnerUnfreeze: true, oneAccountPerEmail: true, receiptsPendingAdmin: true, nextPaymentDueDate: true, leaveApproval: true, multipleGroups: true, expectedPayoutEditable: true }
};

// No demo groups - real groups only when created and approved by owner, auto-updates, top rated + most active at top except search
export const groups = [];

// No demo ads - real ads only when approved
export const businessAds = [];

export const users = [
  {
    id: 'user1',
    name: 'James Okafor',
    email: 'james@example.com',
    phone: '08031234568',
    password: 'password123',
    faceVerified: true,
    memberGroups: [],
    adminGroups: [],
    role: 'member',
  },
  {
    id: 'admin1',
    name: 'Bola Adewale',
    email: 'bola@example.com',
    phone: '08031234567',
    password: 'admin123',
    faceVerified: true,
    memberGroups: [],
    adminGroups: [],
    role: 'admin',
  },
];

export let currentUser = null;

export function loginUser(email, password) {
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    currentUser = user;
    return { success: true, user };
  }
  return { success: false, error: 'Invalid email or password' };
}

export function signupUser(data) {
  const existing = users.find(u => u.email === data.email.trim().toLowerCase());
  if (existing) {
    return { success: false, error: 'This email is already registered. Please log in instead.' };
  }
  const newUser = {
    id: `user${Date.now()}`,
    name: data.name,
    email: data.email.trim().toLowerCase(),
    phone: data.phone,
    address: data.address || '',
    password: data.password,
    faceVerified: data.faceVerified || false,
    memberGroups: [],
    adminGroups: [],
    role: 'member',
  };
  users.push(newUser);
  currentUser = newUser;
  return { success: true, user: newUser };
}

export function logoutUser() { currentUser = null; }
export function getGroupById(id) { return groups.find(g => g.id === id); }
export function searchGroups(query) {
  return groups.filter(g => g.name.toLowerCase().includes(query.toLowerCase()) || g.id.toLowerCase().includes(query.toLowerCase()));
}
export function getMemberInGroup(groupId, memberId) {
  const group = getGroupById(groupId);
  if (!group) return null;
  return group.members?.find(m => m.id === memberId) || null;
}
export function getGroupStats(groupId) {
  const group = getGroupById(groupId);
  if (!group) return { totalMembers: 0, currentCycle: 1, totalCycles: 20, paidThisCycle: 0, outstanding: 0, totalCollected: 0, completionPercent: 0 };
  const totalMembers = group.members?.length || 0;
  const paidThisCycle = group.members?.filter(m => { const last = m.contributions?.[m.contributions.length-1]; return last && last.status === 'paid'; }).length || 0;
  return { totalMembers, currentCycle: group.currentCycle || 1, totalCycles: group.totalCycles || 20, paidThisCycle, outstanding: 0, totalCollected: 0, completionPercent: 5 };
}

export const platformStats = {
  totalUsers: 0,
  totalGroups: 0,
  totalRevenue: 0,
  pendingAdRequests: 0,
  pendingGroupCreations: 0,
  verifiedAdmins: 0,
  suspendedGroups: 0,
  suspendedUsers: 0,
};

export const storedUserDocuments = [];
export function storeUserDocuments(userId, userEmail, userName, docs) {
  const record = { id: `doc_${Date.now()}`, userId, userEmail, userName, profilePic: docs.profilePic || null, idFront: docs.idFront || null, idBack: docs.idBack || null, verifiedAt: null, storedAt: new Date().toISOString() };
  storedUserDocuments.push(record);
  return record;
}
export function getAllUserDocuments() { return storedUserDocuments; }
export function getUserDocuments(userId) { return storedUserDocuments.find(d => d.userId === userId); }
export function approveUserDocuments(docId) {
  const doc = storedUserDocuments.find(d => d.id === docId);
  if (doc) { doc.verifiedAt = new Date().toISOString(); return true; }
  return false;
}

export const notifications = [];
