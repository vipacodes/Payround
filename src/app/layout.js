import './globals.css';
import { Toaster } from 'react-hot-toast';
import BootLoader from '@/components/BootLoader';
import SupportChatFab from '@/components/SupportChatFab';

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#16a34a',
};

export const metadata = {
  title: 'Payround - Digital Ajo Platform',
  description: 'Manage your Ajo savings groups. Build trust. Grow together.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/images/apple-icon.svg',
  },
  openGraph: {
    title: 'Payround - Digital Ajo Platform',
    description: 'Manage your Ajo savings groups. Build trust. Grow together.',
    type: 'website',
    locale: 'en_NG',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/images/apple-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="antialiased">
        <BootLoader />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#ffffff',
              color: '#1f2937',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#16a34a', secondary: '#ffffff' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
            },
          }}
        />
        {children}
        <SupportChatFab />
      </body>
    </html>
  );
}
