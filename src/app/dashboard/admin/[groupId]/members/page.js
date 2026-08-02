'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById } from '@/lib/data';
import toast from 'react-hot-toast';
import {
  HiArrowLeft, HiUser, HiCheckCircle, HiClock,
  HiExclamation, HiSearch, HiPhone, HiMail,
  HiLocationMarker, HiBriefcase, HiCurrencyDollar
} from 'react-icons/hi';

export default function AdminMembersPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  const [memberReviews, setMemberReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, review: '' });

  useEffect(() => {
    const found = getGroupById(params.groupId);
    if (found) setGroup(found);
  }, [params.groupId]);

  // Real join requests (members table) + member reviews, from Supabase
  const loadSupa = async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: reqs } = await supabase.from('members').select('*').eq('group_id', params.groupId).eq('status', 'pending').order('requested_at', { ascending: false });
      if (reqs) setJoinRequests(reqs);
      const { data: revs } = await supabase.from('member_reviews').select('*').order('created_at', { ascending: false });
      if (revs) setMemberReviews(revs);
    } catch {}
  };
  useEffect(() => { loadSupa(); }, [params.groupId]);

  const handleJoinRequest = async (req, approve) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('members').update({
        status: approve ? 'approved' : 'declined',
        approved_at: approve ? new Date().toISOString() : null,
      }).eq('id', req.id);
      // Targeted: only the requesting user sees this notification
      await supabase.from('notifications').insert({
        id: `joinres-${Date.now()}`, type: approve ? 'join_approved' : 'join_declined', group_id: params.groupId, is_read: false,
        user_email: req.member_email,
        message: approve
          ? `✅ Your request to join "${group?.name || params.groupId}" was approved — you are now a member.`
          : `Your request to join "${group?.name || params.groupId}" was declined.`,
      });
      toast.success(approve ? 'Member approved and added to the group!' : 'Request declined.');
    } catch (e) { toast.error('Could not update request.'); }
    loadSupa();
  };

  const reviewsFor = (email) => memberReviews.filter(r => r.member_email === email);

  const submitReview = async (memberEmail) => {
    if (!reviewForm.review.trim()) { toast.error('Write a review first.'); return; }
    try {
      const { supabase } = await import('@/lib/supabase');
      let adminEmail = 'admin';
      const s = localStorage.getItem('payround_user');
      if (s) { try { adminEmail = JSON.parse(s).email || 'admin'; } catch {} }
      await supabase.from('member_reviews').insert({
        id: `mr-${Date.now()}`, member_email: memberEmail, group_id: params.groupId,
        admin_email: adminEmail, rating: reviewForm.rating, review: reviewForm.review.trim(),
      });
      toast.success('Review saved — visible to other group admins.');
      setReviewForm({ rating: 5, review: '' });
      loadSupa();
    } catch { toast.error('Could not save review.'); }
  };

  if (!group) return null;

  const filteredMembers = group.members.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.phone.includes(searchQuery)
  );

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid': return <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg text-xs font-medium"><HiCheckCircle className="w-3 h-3" /> Paid</span>;
      case 'pending': return <span className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Pending</span>;
      case 'overdue': return <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-lg text-xs font-medium"><HiExclamation className="w-3 h-3" /> Overdue</span>;
      case 'not_due': return <span className="flex items-center gap-1 text-gray-500 bg-gray-100 px-2 py-1 rounded-lg text-xs font-medium"><HiClock className="w-3 h-3" /> Not Due</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4">
          <HiArrowLeft className="w-4 h-4" /> Back
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Members - {group.name}</h1>
        <p className="text-gray-500 mb-6">{group.members.length} registered members</p>

        {/* Join Requests — real requests from the members table; preview profile before approving */}
        {joinRequests.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 p-5 mb-6">
            <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
              Join Requests <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{joinRequests.length}</span>
            </h2>
            <p className="text-xs text-gray-500 mb-4">Preview each profile — including reviews from other group admins — before approving. Approving adds them as a member automatically.</p>
            {joinRequests.map(req => (
              <div key={req.id} className="border rounded-xl p-4 mb-3">
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <div className="font-medium text-sm">{req.member_name || '—'}</div>
                    <div className="text-xs text-gray-500">{req.member_email} • Requested {req.requested_at ? new Date(req.requested_at).toLocaleDateString() : '—'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleJoinRequest(req, true)} className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium">Approve → Add Member</button>
                    <button onClick={() => handleJoinRequest(req, false)} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-medium">Decline</button>
                  </div>
                </div>
                {/* Past reviews by other group admins */}
                <div className="mt-3 bg-gray-50 rounded-xl p-3">
                  <div className="text-[11px] font-bold text-gray-500 mb-1">Past reviews from group admins ({reviewsFor(req.member_email).length})</div>
                  {reviewsFor(req.member_email).length > 0 ? reviewsFor(req.member_email).map(r => (
                    <div key={r.id} className="text-xs text-gray-600 py-1 border-b last:border-0">
                      <span className="text-yellow-500">{'★'.repeat(r.rating || 0)}{'☆'.repeat(5 - (r.rating || 0))}</span> {r.review} <span className="text-gray-400">— {r.admin_email} • {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</span>
                    </div>
                  )) : <div className="text-xs text-gray-400">No reviews yet — this member is new to the platform or has none recorded.</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="relative mb-6 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Member List */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {filteredMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => setSelectedMember(selectedMember?.id === member.id ? null : member)}
                  className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left ${
                    selectedMember?.id === member.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-primary-700 font-semibold text-sm">{member.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">Rot #{member.rotationNo} • {member.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">₦{member.totalPaid.toLocaleString()}</span>
                    {getStatusBadge(member.contributions[member.contributions.length - 1]?.status)}
                  </div>
                </button>
              ))}
              {filteredMembers.length === 0 && (
                <div className="p-8 text-center text-gray-500">No members found.</div>
              )}
            </div>
          </div>

          {/* Member Details */}
          <div>
            {selectedMember ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-primary-700 font-bold text-2xl">{selectedMember.name.charAt(0)}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedMember.name}</h3>
                  <p className="text-sm text-gray-500">Rotation #{selectedMember.rotationNo}</p>
                </div>

                <div className="space-y-3">
                  <DetailRow icon={<HiPhone className="w-4 h-4" />} label="Phone" value={selectedMember.phone} />
                  <DetailRow icon={<HiMail className="w-4 h-4" />} label="Email" value={selectedMember.email} />
                  <DetailRow icon={<HiLocationMarker className="w-4 h-4" />} label="Address" value={selectedMember.address} />
                  <DetailRow icon={<HiBriefcase className="w-4 h-4" />} label="Occupation" value={selectedMember.occupation} />
                  <DetailRow icon={<HiUser className="w-4 h-4" />} label="Next of Kin" value={selectedMember.nextOfKin} />
                  <DetailRow icon={<HiCurrencyDollar className="w-4 h-4" />} label="Total Paid" value={`₦${selectedMember.totalPaid.toLocaleString()}`} />
                  <DetailRow icon={<HiCurrencyDollar className="w-4 h-4" />} label="Total Received" value={`₦${(selectedMember.totalReceived || 0).toLocaleString()}`} />
                  <DetailRow icon={<HiCheckCircle className="w-4 h-4" />} label="Payout Status" value={selectedMember.payoutStatus === 'next' ? 'Next to Receive 🎯' : selectedMember.payoutStatus === 'received' ? 'Received ✅' : 'Waiting'} />
                </div>

                {/* Member reviews — given by group admins, shown to other admins before approving joins */}
                {selectedMember.email && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <div className="text-xs font-bold text-gray-500 mb-2">Reviews by group admins ({reviewsFor(selectedMember.email).length})</div>
                    {reviewsFor(selectedMember.email).length > 0 ? reviewsFor(selectedMember.email).map(r => (
                      <div key={r.id} className="text-xs text-gray-600 py-1.5 border-b last:border-0">
                        <span className="text-yellow-500">{'★'.repeat(r.rating || 0)}{'☆'.repeat(5 - (r.rating || 0))}</span> {r.review} <span className="text-gray-400">— {r.admin_email}</span>
                      </div>
                    )) : <p className="text-xs text-gray-400 mb-2">No reviews yet for this member.</p>}
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                      <div className="text-xs font-bold text-gray-500 mb-2">Add a review (visible to other group admins)</div>
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} type="button" onClick={() => setReviewForm(prev => ({ ...prev, rating: n }))}
                            className={`text-lg leading-none ${n <= reviewForm.rating ? 'text-yellow-500' : 'text-gray-300'}`}>★</button>
                        ))}
                      </div>
                      <textarea
                        value={reviewForm.review}
                        onChange={(e) => setReviewForm(prev => ({ ...prev, review: e.target.value }))}
                        rows={2}
                        placeholder="e.g. Pays on time every cycle, very reliable."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      />
                      <button onClick={() => submitReview(selectedMember.email)} className="mt-2 w-full bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold py-2 rounded-lg">Save Review</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <HiUser className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select a member to view their details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
      <span className="text-gray-400 w-5">{icon}</span>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || 'N/A'}</p>
      </div>
    </div>
  );
}
