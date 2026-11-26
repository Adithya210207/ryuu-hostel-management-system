import type { Metadata } from 'next';
import './globals.css';
import {RegisterWorker} from '../components/pwa/InstallApp';
export const metadata: Metadata = {
  title: { default: 'Ryuu — Cool rooms. Calm days. Your city.', template: '%s · Ryuu' },
  description: 'An air-conditioned men’s hostel for students and working men in Bengaluru. Discover your next home and manage life at Ryuu.',
  appleWebApp: { capable: true, title: 'Ryuu', statusBarStyle: 'default' },
  icons: { icon: '/favicon.png?v=house-1', apple: '/pwa/apple-touch-icon.png?v=house-1' }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><RegisterWorker/>{children}</body></html>;
}
