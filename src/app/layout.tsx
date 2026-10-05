import type { Metadata } from 'next';
import './globals.css';
import AppLayout from '@/components/app-layout';

export const metadata: Metadata = {
  title: 'Global Minds - Examination & Assessment System',
  description:
    'Global Minds - Build Skills | Own The Future. Enterprise randomized examination and assessment system.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
