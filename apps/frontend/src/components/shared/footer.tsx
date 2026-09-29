import React from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50 text-muted-foreground">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & mission */}
          <div className="md:col-span-1 space-y-3">
            <Link href="/" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <GraduationCap className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold text-foreground">
                ED<span className="text-primary">platform</span>
              </span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Production-ready AI education platform empowering students, instructors, and teams
              with context-aware Socratic tutoring.
            </p>
          </div>

          {/* Platform Columns */}
          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wider uppercase mb-3">
              Students
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/courses" className="hover:text-foreground transition-colors">
                  Browse Courses
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  Learning Dashboard
                </Link>
              </li>
              <li>
                <Link href="/#ai-tutor" className="hover:text-foreground transition-colors">
                  AI Academic Tutor
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wider uppercase mb-3">
              Instructors
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/instructor" className="hover:text-foreground transition-colors">
                  Course Studio
                </Link>
              </li>
              <li>
                <Link href="/instructor/quizzes" className="hover:text-foreground transition-colors">
                  AI Quiz Generator
                </Link>
              </li>
              <li>
                <Link href="/instructor/students" className="hover:text-foreground transition-colors">
                  Student Analytics
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground tracking-wider uppercase mb-3">
              System
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="inline-flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Next.js 15 + Node.js</span>
                </span>
              </li>
              <li>
                <span>PostgreSQL + Prisma ORM</span>
              </li>
              <li>
                <span>Google Gemini AI</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between text-xs">
          <p>© {new Date().getFullYear()} EDplatform. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 sm:mt-0">
            <span className="text-muted-foreground">Phase 1 Foundation</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
