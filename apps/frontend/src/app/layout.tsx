import type { Metadata, Viewport } from 'next';
import { Figtree } from 'next/font/google';
import './globals.css';
import { StudentProvider } from '@/context/student-context';
import { SpeechProvider } from '@/context/speech-context';
import { ThemeProvider } from '@/context/theme-context';
import { ClerkThemeBridge } from '@/components/shared/clerk-theme-bridge';
import { StudentNav } from '@/components/shared/student-nav';
import { themeInitScript } from '@/lib/theme';

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
  // Starting value only. The provider rewrites this meta tag when the theme
  // changes, so the phone's status bar follows the page.
  themeColor: '#FFFDF8'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider>
      <ClerkThemeBridge>
        <html lang="en" className={edSans.variable} suppressHydrationWarning>
          <head>
            {/* Runs before first paint, so the page is never drawn in the
                wrong theme and then corrected. An effect cannot do this: it
                runs after paint, which is the flash itself. `suppressHydration
                Warning` above is what lets this script change <html> without
                React objecting. */}
            <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
          </head>
          <body className="min-h-screen bg-background font-sans text-foreground antialiased">
            <StudentProvider>
              {/* One speech controller for the app. `window.speechSynthesis`
                  is a single global queue, so a per-component controller
                  would let two answers both believe they were playing and the
                  engine would read them back to back. */}
              <SpeechProvider>
                <StudentNav />
                {/* Bottom padding clears the mobile nav bar. */}
                <main className="pb-24 sm:pb-10">{children}</main>
              </SpeechProvider>
            </StudentProvider>
          </body>
        </html>
      </ClerkThemeBridge>
    </ThemeProvider>
  );
}
