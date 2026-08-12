import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = { title: 'Privacy Policy · Payround' };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <article className="max-w-3xl mx-auto px-4 py-12 prose prose-sm">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
        <p className="text-gray-600 mb-6">Last updated: 12 August 2026</p>
        <div className="space-y-4 text-gray-700 text-sm leading-relaxed">
          <p>Payround (“we”) is a digital Ajo management tool. We store the information you give us so your group can track contributions and rotations.</p>
          <h2 className="text-lg font-semibold text-gray-900">What we collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Name, email, phone number</li>
            <li>A profile photo you upload (this is not a legal identity check)</li>
            <li>Group membership, receipts you upload, and in-app messages</li>
            <li>Optional bank details you choose to show your group for payouts</li>
          </ul>
          <h2 className="text-lg font-semibold text-gray-900">How we use it</h2>
          <p>To run your account, show your group who has paid, send password-reset email, and (if you opt in) referral bonuses. We do not sell your data.</p>
          <h2 className="text-lg font-semibold text-gray-900">Who sees it</h2>
          <p>Other members of groups you join can see your name, photo, and payment status. Group admins see join requests and receipts. Payround operators may access records to support you or stop abuse.</p>
          <h2 className="text-lg font-semibold text-gray-900">Money</h2>
          <p>Payround does not hold your contributions. You pay your group admin directly and upload a receipt. We are not a bank or payment processor.</p>
          <h2 className="text-lg font-semibold text-gray-900">Retention &amp; rights</h2>
          <p>You can ask us to close your account and delete your profile by emailing payroundsupport@gmail.com. Receipts tied to a live group may be kept until that group ends. Nigeria’s NDPR applies to this processing.</p>
        </div>
      </article>
      <Footer />
    </div>
  );
}
