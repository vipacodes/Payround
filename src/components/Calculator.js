'use client';

import { useState } from 'react';
import { HiCalculator } from 'react-icons/hi';

export default function Calculator({ contributionAmount, totalMembers }) {
  const [amount, setAmount] = useState(contributionAmount || '');
  const [members, setMembers] = useState(totalMembers || '');
  const [cycles, setCycles] = useState('');
  const [results, setResults] = useState(null);

  const calculate = () => {
    const amt = parseFloat(amount);
    const mem = parseInt(members);
    const cyc = parseInt(cycles) || 1;

    if (!amt || !mem) {
      setResults(null);
      return;
    }

    const perCycle = amt * mem;
    const totalForDuration = perCycle * cyc;
    const perMemberTotal = amt * cyc;

    setResults({
      perCycle,
      totalForDuration,
      perMemberTotal,
      cycleCount: cyc,
      memberCount: mem,
      amountPerMember: amt,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-6">
        <HiCalculator className="w-6 h-6 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-900">Contribution Calculator</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Contribution Amount (₦)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50000"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Members</label>
          <input
            type="number"
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder="e.g. 20"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Cycles (optional)</label>
          <input
            type="number"
            value={cycles}
            onChange={(e) => setCycles(e.target.value)}
            placeholder="e.g. 12"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <button
          onClick={calculate}
          className="w-full bg-primary-600 text-white font-medium py-3 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
        >
          Calculate
        </button>

        {results && (
          <div className="mt-6 p-5 bg-primary-50 rounded-xl space-y-3">
            <h4 className="font-semibold text-primary-900 mb-3">Summary</h4>
            <div className="flex justify-between items-center py-2 border-b border-primary-100">
              <span className="text-sm text-gray-600">Per Cycle Total</span>
              <span className="font-semibold text-gray-900">₦{results.perCycle.toLocaleString()}</span>
            </div>
            {results.cycleCount > 1 && (
              <div className="flex justify-between items-center py-2 border-b border-primary-100">
                <span className="text-sm text-gray-600">Total for {results.cycleCount} Cycles</span>
                <span className="font-semibold text-gray-900">₦{results.totalForDuration.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-primary-100">
              <span className="text-sm text-gray-600">Per Member Total</span>
              <span className="font-semibold text-gray-900">₦{results.perMemberTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">Members</span>
              <span className="font-semibold text-gray-900">{results.memberCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Per Member per Cycle</span>
              <span className="font-semibold text-gray-900">₦{results.amountPerMember.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
