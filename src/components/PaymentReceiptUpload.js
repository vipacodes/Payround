'use client';

import { useState, useRef } from 'react';
import { HiUpload, HiPhotograph, HiRefresh, HiCheckCircle } from 'react-icons/hi';
import { HiBanknotes } from 'react-icons/hi2';
import toast from 'react-hot-toast';

export default function PaymentReceiptUpload({ bankDetails, onSuccess, contributionAmount, memberName }) {
  const [step, setStep] = useState('info'); // info | upload | preview | success
  const [receipt, setReceipt] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReceipt(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target.result);
      };
      reader.readAsDataURL(file);
      setStep('preview');
    }
  };

  const handleRetake = () => {
    setReceipt(null);
    setPreviewUrl(null);
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    // Simulate submission
    toast.success('Payment receipt submitted successfully!');
    setStep('success');
    if (onSuccess) {
      onSuccess();
    }
  };

  if (step === 'success') {
    return (
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiCheckCircle className="w-12 h-12 text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Receipt Submitted! 🎉</h3>
        <p className="text-sm text-gray-500">
          Your payment is pending verification. The admin will review it shortly and you&apos;ll receive a notification.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-6">
        <HiBanknotes className="w-6 h-6 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-900">Make Payment</h3>
      </div>

      {step === 'info' && (
        <>
          {/* Bank Details */}
          <div className="p-4 bg-gray-50 rounded-xl mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Admin Bank Details</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Bank:</span>
                <span className="font-medium text-gray-900">{bankDetails?.bankName || 'GTBank'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Account Name:</span>
                <span className="font-medium text-gray-900">{bankDetails?.accountName || 'Bola Adewale'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Account Number:</span>
                <span className="font-medium text-gray-900 font-mono">{bankDetails?.accountNumber || '0123456789'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount:</span>
                <span className="font-medium text-primary-700 text-base">₦{(bankDetails?.contributionAmount || contributionAmount || 50000).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            Transfer the contribution amount to the bank details above, then upload your payment receipt below.
          </p>

          <button
            onClick={() => setStep('upload')}
            className="w-full bg-primary-600 text-white font-medium py-3.5 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
          >
            <HiUpload className="w-5 h-5" />
            I Have Made Payment
          </button>
        </>
      )}

      {step === 'upload' && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
        >
          <HiPhotograph className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Tap to upload payment receipt</p>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG (max. 5MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,image/heic,image/heif,video/*,application/pdf,.pdf"
           
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {step === 'preview' && previewUrl && (
        <div className="text-center">
          <div className="mb-4 rounded-xl overflow-hidden border border-gray-200">
            <img src={previewUrl} alt="Receipt Preview" className="w-full max-h-80 object-contain bg-gray-50" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              className="flex-1 flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-all"
            >
              <HiRefresh className="w-5 h-5" />
              Retake
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 bg-primary-600 text-white font-medium py-3 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-200"
            >
              Submit Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
