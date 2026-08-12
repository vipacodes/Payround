import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata = { title: 'Terms of Use · Payround' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <article className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Terms of Use</h1>
        <p className="text-gray-600 mb-6 text-sm">Last updated: 12 August 2026</p>
        <div className="space-y-4 text-gray-700 text-sm leading-relaxed">
          <p>By creating a Payround account you agree to these terms.</p>
          <h2 className="text-lg font-semibold text-gray-900">What Payround is</h2>
          <p>Payround is software for organising traditional Ajo / ROSCA groups. We do not collect, hold, or guarantee contributions. Payments are made between members and the group admin outside the app.</p>
          <h2 className="text-lg font-semibold text-gray-900">Your responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Only join groups you trust. Vet the admin the same way you would offline.</li>
            <li>Keep your password private. We will never ask for it in chat.</li>
            <li>Upload honest receipts. Fake receipts can get your account closed.</li>
            <li>One account per person / email.</li>
          </ul>
          <h2 className="text-lg font-semibold text-gray-900">Profile photos</h2>
          <p>A selfie or photo is used as your avatar so members can recognise each other. It is not government ID verification and does not make Payround liable if someone is not who they claim to be.</p>
          <h2 className="text-lg font-semibold text-gray-900">Fees</h2>
          <p>Creating a group may require a platform fee paid to the Payround operator (shown in the create-group flow). Joining a group is free. Group contributions themselves go to the admin, not to Payround.</p>
          <h2 className="text-lg font-semibold text-gray-900">Disputes</h2>
          <p>Missed weeks, defaults, and payout disagreements are between group members. Payround can freeze or remove a group that is used for fraud, but we cannot recover money already sent to an admin.</p>
          <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
          <p>payroundsupport@gmail.com</p>
        </div>
      </article>
      <Footer />
    </div>
  );
}
