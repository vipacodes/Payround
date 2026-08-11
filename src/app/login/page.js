import Header from '@/components/Header';
import Footer from '@/components/Footer';
import AuthFlip from '@/components/AuthFlip';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-md md:max-w-3xl mx-auto px-4 py-10 md:py-16">
        <AuthFlip initial="login" />
      </div>
      <Footer />
    </div>
  );
}
