import React from 'react';
import Link from 'next/link';
import { Mail, Phone, Heart } from 'lucide-react';
import { EdLogo } from '@/components/shared/ed-logo';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 text-muted-foreground transition-colors">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Brand & Direct Contact */}
          <div className="md:col-span-6 space-y-4">
            <Link href="/" className="inline-flex items-center space-x-2 group">
              <EdLogo size={24} showWordmark={true} />
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
              A student-first Indian EdTech platform engineered for authentic mastery. Learn through structured video lectures, test comprehension through formative checkpoint quizzes, and progress with confidence.
            </p>

            <div className="pt-1 space-y-1.5 text-xs">
              <div className="font-semibold text-foreground">Tanisha Gupta</div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <a
                  href="tel:7838012694"
                  className="inline-flex items-center space-x-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  <span>7838012694</span>
                </a>
                <a
                  href="mailto:tanishagupta92005@gmail.com"
                  className="inline-flex items-center space-x-1.5 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  <span>tanishagupta92005@gmail.com</span>
                </a>
              </div>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-foreground tracking-wider uppercase">
              Platform Navigation
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/courses" className="hover:text-primary transition-colors">
                  Explore Courses
                </Link>
              </li>
              <li>
                <Link href="/#ai-tutor" className="hover:text-primary transition-colors">
                  AI Tutor
                </Link>
              </li>
              <li>
                <Link href="/my-courses" className="hover:text-primary transition-colors">
                  Learning & Enrollments
                </Link>
              </li>
              <li>
                <Link href="/#ecosystem" className="hover:text-primary transition-colors">
                  Educational Ecosystem
                </Link>
              </li>
            </ul>
          </div>

          {/* Portals */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-bold text-foreground tracking-wider uppercase">
              Portals
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/dashboard" className="hover:text-primary transition-colors">
                  Student Dashboard
                </Link>
              </li>
              <li>
                <Link href="/instructor/courses" className="hover:text-primary transition-colors">
                  Instructor Studio
                </Link>
              </li>
              <li>
                <Link href="/dashboard/admin" className="hover:text-primary transition-colors">
                  Administration Governance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-4">
          <p>© {new Date().getFullYear()} EDplatform. Learning that actually sticks.</p>
          <div className="flex items-center space-x-1">
            <span>Built for students & educators</span>
            <Heart className="h-3 w-3 text-primary fill-primary inline ml-1" />
          </div>
        </div>
      </div>
    </footer>
  );
}
