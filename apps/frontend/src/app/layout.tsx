import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { StudentProvider } from '@/context/student-context';
import { StudentNav } from '@/components/shared/student-nav';

const edSans = Figtree({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ed-sans'
});

export const metadata: Metadata = {
  title: 'ED — Your AI learning companion',
  description:
    'ED is a patient AI tutor for Classes 6 to 8. Ask anything about Maths, Science, Social Science or English and learn it step by step.'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFDF8'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#E53935',
          colorBackground: '#FFFDF8',
          borderRadius: '0.5rem'
        }
      }}
    >
      <html lang="en" className={edSans.variable} suppressHydrationWarning>
        <body className="min-h-screen bg-background font-sans text-foreground antialiased">
          <StudentProvider>
            <StudentNav />
            {/* Bottom padding clears the mobile nav bar. */}
            <main className="pb-24 sm:pb-10">{children}</main>
          </StudentProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
