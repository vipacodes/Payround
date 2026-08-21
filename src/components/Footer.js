'use client';

import { useRouter, usePathname } from 'next/navigation';
import { HiHeart, HiShieldCheck, HiSupport } from 'react-icons/hi';
import { platformInfo } from '@/lib/data';

export default function Footer() {
  const router = useRouter();
  const pathname = usePathname();
  const year = new Date().getFullYear();
  const { contact, name } = platformInfo;

  // 🦶 Full footer (Quick Links + Why Payround) shows ONLY on the site visitors
  // page (home) and inside the app on Dashboard + Settings. Every other page
  // gets the slim footer — cleaner while browsing groups & chats.
  const full = pathname === '/' || pathname?.startsWith('/dashboard') || pathname?.startsWith('/settings');

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className={`grid grid-cols-1 gap-8 ${full ? 'md:grid-cols-4' : 'md:grid-cols-2'}`}>
          <div className="md:col-span-1">
            <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4">
              <img src="/images/logo-mark.png" alt="" className="w-8 h-8 rounded-xl object-cover" />
              <span className="text-lg font-bold text-white">Pay<span className="text-primary-400">round</span></span>
            </button>
            <p className="text-sm text-gray-400 leading-relaxed">{platformInfo.description}</p>
            <a
              href="/payround.apk"
              download="payround.apk"
              className="mt-4 inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              📱 Download Android App (APK)
            </a>
          </div>
          {full && (
            <div>
              <h3 className="text-white font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-3">
                <li><button onClick={() => router.push('/groups/search')} className="text-sm text-gray-400 hover:text-primary-400 transition-colors">Find Groups</button></li>
                <li><button onClick={() => router.push('/groups/create')} className="text-sm text-gray-400 hover:text-primary-400 transition-colors">Create Group</button></li>
                <li><button onClick={() => router.push('/ads')} className="text-sm text-gray-400 hover:text-primary-400 transition-colors">Advertise</button></li>
                <li><button onClick={() => router.push('/signup')} className="text-sm text-gray-400 hover:text-primary-400 transition-colors">Get Started</button></li>
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-white font-semibold mb-4">Support</h3>
            <ul className="space-y-3">
              <li className="text-sm text-gray-400">Email: Payroundsupport@gmail.com</li>
              <li className="text-sm text-gray-400">WhatsApp: +2349151723199</li>
              <li className="text-sm text-gray-400">Hours: Mon-Sat, 8AM - 6PM</li>
            </ul>
          </div>
          {full && (
            <div>
              <h3 className="text-white font-semibold mb-4">Why Payround?</h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm"><HiShieldCheck className="text-primary-400 w-5 h-5 flex-shrink-0" /><span>Transparent group tracking</span></li>
                <li className="flex items-center gap-2 text-sm"><HiHeart className="text-primary-400 w-5 h-5 flex-shrink-0" /><span>Community trust built in</span></li>
                <li className="flex items-center gap-2 text-sm"><HiSupport className="text-primary-400 w-5 h-5 flex-shrink-0" /><span>Member support</span></li>
              </ul>
            </div>
          )}
        </div>
        <div className="mt-10 pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">&copy; {year} {name}. All rights reserved.</p>
          <div className="flex gap-4 text-sm text-gray-500">
            <button onClick={() => router.push('/privacy')} className="hover:text-primary-400">Privacy</button>
            <button onClick={() => router.push('/terms')} className="hover:text-primary-400">Terms</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
