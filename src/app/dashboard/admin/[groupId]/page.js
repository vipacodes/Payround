'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getGroupById, getGroupStats } from '@/lib/data';
import {
  HiArrowLeft, HiUserGroup, HiCurrencyDollar, HiCheckCircle,
  HiExclamation, HiClock, HiShieldCheck, HiEye, HiEyeOff,
  HiCog, HiPencil, HiSave
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function AdminGroupSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);
  const [stats, setStats] = useState(null);
  const [editingRules, setEditingRules] = useState(false);
  const [editingConstitution, setEditingConstitution] = useState(false);
  const [editedRules, setEditedRules] = useState([]);
  const [editedConstitution, setEditedConstitution] = useState('');
  const [visibility, setVisibility] = useState({});

  useEffect(() => {
    const found = getGroupById(params.groupId);
    if (found) {
      setGroup(found);
      setStats(getGroupStats(found.id));
      setEditedRules([...found.rules]);
      setEditedConstitution(found.constitution);
      setVisibility({...found.visibilitySettings});
    }
  }, [params.groupId]);

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const toggleVisibility = (key) => {
    const newVisibility = { ...visibility, [key]: !visibility[key] };
    setVisibility(newVisibility);
    toast.success(`Visibility updated`);
  };

  const saveRules = () => {
    toast.success('Rules updated successfully!');
    setEditingRules(false);
  };

  const saveConstitution = () => {
    toast.success('Constitution updated!');
    setEditingConstitution(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <button
          onClick={() => router.push('/dashboard/admin')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back to Admin Dashboard
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{group.name} - Settings</h1>
            <p className="text-sm text-gray-500">ID: {group.id}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total Members</p>
            <p className="text-xl font-bold text-gray-900">{stats?.totalMembers}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Paid This Cycle</p>
            <p className="text-xl font-bold text-emerald-700">{stats?.paidThisCycle}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-xl font-bold text-red-700">{stats?.outstanding}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Total Collected</p>
            <p className="text-xl font-bold text-gray-900">₦{(stats?.totalCollected || 0).toLocaleString()}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Visibility Controls */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Visibility Controls</h3>
            <p className="text-sm text-gray-500 mb-4">Control what members can see on the dashboard.</p>
            <div className="space-y-3">
              <VisibilityToggle
                label="Members Paid This Cycle"
                description="Show how many members have paid this cycle"
                enabled={visibility.showMembersPaid}
                onToggle={() => toggleVisibility('showMembersPaid')}
              />
              <VisibilityToggle
                label="Outstanding Members"
                description="Show members who haven't paid yet"
                enabled={visibility.showOutstandingMembers}
                onToggle={() => toggleVisibility('showOutstandingMembers')}
              />
              <VisibilityToggle
                label="Financial Summary"
                description="Show total contributions collected"
                enabled={visibility.showFinancialSummary}
                onToggle={() => toggleVisibility('showFinancialSummary')}
              />
            </div>
          </div>

          {/* Edit Constitution */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Group Constitution</h3>
              <button
                onClick={() => setEditingConstitution(!editingConstitution)}
                className="flex items-center gap-1 text-sm text-primary-600 font-medium hover:text-primary-700"
              >
                <HiPencil className="w-4 h-4" />
                {editingConstitution ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingConstitution ? (
              <div>
                <textarea
                  value={editedConstitution}
                  onChange={(e) => setEditedConstitution(e.target.value)}
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none mb-3"
                />
                <button
                  onClick={saveConstitution}
                  className="flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all"
                >
                  <HiSave className="w-4 h-4" />
                  Save
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed">{group.constitution}</p>
            )}
          </div>

          {/* Edit Rules */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Group Rules</h3>
              <button
                onClick={() => setEditingRules(!editingRules)}
                className="flex items-center gap-1 text-sm text-primary-600 font-medium hover:text-primary-700"
              >
                <HiPencil className="w-4 h-4" />
                {editingRules ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingRules ? (
              <div>
                <div className="space-y-2 mb-3">
                  {editedRules.map((rule, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-2">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={rule}
                        onChange={(e) => {
                          const newRules = [...editedRules];
                          newRules[index] = e.target.value;
                          setEditedRules(newRules);
                        }}
                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveRules}
                  className="flex items-center gap-2 bg-primary-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-primary-700 transition-all"
                >
                  <HiSave className="w-4 h-4" />
                  Save Rules
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {group.rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <span className="w-6 h-6 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-sm text-gray-700">{rule}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function VisibilityToggle({ label, description, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-12 h-6 rounded-full transition-all ${
          enabled ? 'bg-primary-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
