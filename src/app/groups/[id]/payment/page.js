'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PaymentReceiptUpload from '@/components/PaymentReceiptUpload';
import { getGroupById } from '@/lib/data';
import { HiArrowLeft } from 'react-icons/hi';

export default function PaymentPage() {
  const router = useRouter();
  const params = useParams();
  const [group, setGroup] = useState(null);

  useEffect(() => {
    const found = getGroupById(params.id);
    if (found) setGroup(found);
  }, [params.id]);

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="max-w-lg mx-auto px-4 py-6 md:py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 mb-4"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
            <span className="text-primary-700 font-bold text-lg">{group.name.charAt(0)}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Make Payment</h1>
            <p className="text-sm text-gray-500">{group.name}</p>
          </div>
        </div>

        <PaymentReceiptUpload
          bankDetails={{
            bankName: group.bankName,
            accountName: group.accountName,
            accountNumber: group.accountNumber,
            contributionAmount: group.contributionAmount,
          }}
          contributionAmount={group.contributionAmount}
          onSuccess={() => {}}
        />
      </div>

      <Footer />
    </div>
  );
}
