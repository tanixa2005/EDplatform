'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  BookOpen,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getApiUrl } from '@/lib/api';

interface HealthData {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  environment: string;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    fetch(getApiUrl('/health'), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (json.success && json.data) {
          setHealth(json.data);
        }
      })
      .catch((err) => {
        setHealthError(err.message || 'Could not connect to backend API');
      })
      .finally(() => {
        setLoadingHealth(false);
      });
  }, []);

  return (
    <div className="flex flex-col items-center bg-background text-foreground">
      {/* 1. HERO SECTION: Asymmetric Editorial Layout */}
      <section className="w-full pt-10 pb-16 md:pt-16 md:pb-24 border-b border-border">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Content (7 cols) */}
            <div className="lg:col-span-7 space-y-6 text-left">
              {/* Category pill */}
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-brand-50 border border-brand-200/80 text-brand-700 text-xs font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span>Student-First Indian EdTech</span>
              </div>

              {/* Natural, confident headline */}
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.15]">
                Understand it deeply.<br />
                Practice it rigorously.<br />
                <span className="text-primary underline decoration-brand-200 decoration-4 underline-offset-6">
                  Learning that actually sticks.
                </span>
              </h1>

              {/* Educational Subheading */}
              <p className="text-base sm:text-lg text-foreground/80 max-w-xl leading-relaxed">
                A deliberate, distraction-free learning ecosystem. Structured video curriculums, lesson-by-lesson comprehension checkpoints, and 90% verified engagement — so knowledge becomes second nature.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Link href="/courses">
                  <Button size="lg" className="w-full sm:w-auto font-semibold bg-[#111111] text-white hover:bg-[#262626] rounded-md px-6 shadow-xs">
                    <span>Explore Courses</span>
                    <ArrowRight className="ml-2 h-4 w-4 text-primary" />
                  </Button>
                </Link>
                <Link href="#learning-model">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto font-semibold rounded-md border-border hover:bg-secondary">
                    <span>How It Works</span>
                  </Button>
                </Link>
              </div>

              {/* Key Platform Proof Points */}
              <div className="pt-3 border-t border-border/80 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-foreground/75">
                <span className="flex items-center space-x-1.5">
                  <span className="font-bold text-primary">✓</span>
                  <span>90% Meaningful Playback Verification</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="font-bold text-primary">✓</span>
                  <span>Formative Quiz Checkpoints</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="font-bold text-primary">✓</span>
                  <span>Socratic Study Companion</span>
                </span>
              </div>
            </div>

            {/* Right: Editorial Educational Composition (5 cols) */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Red subtle corner accent block */}
                <div className="absolute -top-3 -right-3 w-16 h-16 bg-brand-50 border border-brand-200/60 rounded -z-10" />

                {/* Element 1: Main Course Card */}
                <div className="bg-card border border-border rounded-lg p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Module 02 of 06 &bull; Architecture
                    </span>
                    <Badge variant="brand" className="text-[10px] uppercase font-bold">
                      In Progress
                    </Badge>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground leading-snug">
                      Distributed Systems & Cloud Patterns
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Lesson 03: Event Streams & Partition Tolerance
                    </p>
                  </div>

                  {/* Playback Progress Indicator */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground">Playback Engagement</span>
                      <span className="font-bold text-primary">90% Verified</span>
                    </div>
                    <div className="w-full h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded w-[90%] transition-all" />
                    </div>
                    <div className="flex items-center space-x-1 text-[11px] text-muted-foreground pt-0.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      <span>Non-skipping interval algorithm verified</span>
                    </div>
                  </div>
                </div>

                {/* Element 2: Overlapping Quiz Checkpoint Card (Slight tilt for editorial feel) */}
                <div className="relative sm:-mt-6 sm:ml-10 mt-4 bg-background border-2 border-foreground rounded-md p-4 shadow-md max-w-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      ⚡ Checkpoint Quiz
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      Q2 of 4
                    </Badge>
                  </div>

                  <p className="text-xs font-semibold text-foreground leading-snug">
                    Which mechanism guarantees idempotency across network retries?
                  </p>

                  <div className="p-2 rounded bg-secondary text-xs flex items-center justify-between border border-border">
                    <span className="font-medium text-foreground">Unique Request Key</span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                      ✓ Correct (+2 pts)
                    </span>
                  </div>
                </div>

                {/* Element 3: Overlapping Streak & Milestone Badge */}
                <div className="mt-3 sm:-ml-2 inline-flex items-center space-x-2 bg-cream border border-amber-300 px-3.5 py-1.5 rounded shadow-xs text-xs font-bold text-amber-950">
                  <span>🔥</span>
                  <span>14-Day Study Streak &bull; 24 Checkpoints Cleared</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CORE METHOD: LEARN → PRACTICE → PROGRESS */}
      <section id="learning-model" className="w-full py-16 md:py-20 bg-card border-b border-border">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              The Learning Model
            </span>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Learn &rarr; Practice &rarr; Progress
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Passive video bingeing creates an illusion of competence. EDplatform enforces three interdependent steps to convert information into lasting ability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1: Learn */}
            <div className="border-l-2 border-foreground/20 pl-5 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Step 01
              </span>
              <h3 className="text-lg font-bold text-foreground">
                Focused Curriculum Modules
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Structured, modular video and reading lessons authored by experienced educators. Clean explanations without filler or distraction.
              </p>
              <div className="pt-2 text-xs font-semibold text-foreground flex items-center space-x-1">
                <BookOpen className="h-3.5 w-3.5 text-primary" />
                <span>Zero fluff &bull; High conceptual density</span>
              </div>
            </div>

            {/* Step 2: Practice */}
            <div className="border-l-2 border-primary pl-5 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-primary">
                Step 02
              </span>
              <h3 className="text-lg font-bold text-foreground">
                Immediate Quiz Checkpoints
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Formative quizzes test your recall at the end of each lesson. Deterministic grading provides instant feedback with detailed rationales.
              </p>
              <div className="pt-2 text-xs font-semibold text-foreground flex items-center space-x-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span>Instant scoring &bull; Explanations included</span>
              </div>
            </div>

            {/* Step 3: Progress */}
            <div className="border-l-2 border-foreground/90 pl-5 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-foreground">
                Step 03
              </span>
              <h3 className="text-lg font-bold text-foreground">
                90% Verified Engagement
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Our playback tracker requires 90% non-overlapping engagement before a lesson is marked completed. Your progress represents authentic dedication.
              </p>
              <div className="pt-2 text-xs font-semibold text-foreground flex items-center space-x-1">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>Anti-skip protection &bull; Verified certificates</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. COURSES PREVIEW: Asymmetric Horizontal Layout */}
      <section className="w-full py-16 md:py-20 border-b border-border">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Curriculum Catalog
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
                Courses Designed for Real Depth
              </h2>
            </div>
            <Link href="/courses">
              <Button variant="outline" className="font-semibold text-xs border-border">
                <span>View Full Course Catalog</span>
                <ArrowRight className="ml-1.5 h-3.5 w-3.5 text-primary" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Course Card 1 */}
            <div className="bg-card border border-border rounded-md p-5 flex flex-col justify-between hover:border-primary/50 transition-colors shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Badge variant="brand" className="text-[10px] font-bold">
                    BEGINNER
                  </Badge>
                  <span className="text-xs font-bold text-foreground">Free</span>
                </div>
                <h3 className="text-base font-bold text-foreground leading-snug">
                  Modern Web Application Engineering
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Full-stack architecture from HTTP fundamentals to PostgreSQL relational models and RESTful API design.
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>8 Modules</span>
                </span>
                <Link href="/courses" className="font-semibold text-primary hover:underline">
                  View Syllabus &rarr;
                </Link>
              </div>
            </div>

            {/* Course Card 2 */}
            <div className="bg-card border border-border rounded-md p-5 flex flex-col justify-between hover:border-primary/50 transition-colors shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Badge variant="brand" className="text-[10px] font-bold">
                    INTERMEDIATE
                  </Badge>
                  <span className="text-xs font-bold text-foreground">Free</span>
                </div>
                <h3 className="text-base font-bold text-foreground leading-snug">
                  PostgreSQL Internals & Query Optimization
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  B-tree indexes, execution plans, concurrency control, and index design strategies for production databases.
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>6 Modules</span>
                </span>
                <Link href="/courses" className="font-semibold text-primary hover:underline">
                  View Syllabus &rarr;
                </Link>
              </div>
            </div>

            {/* Course Card 3 */}
            <div className="bg-card border border-border rounded-md p-5 flex flex-col justify-between hover:border-primary/50 transition-colors shadow-xs">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Badge variant="brand" className="text-[10px] font-bold">
                    ADVANCED
                  </Badge>
                  <span className="text-xs font-bold text-foreground">Free</span>
                </div>
                <h3 className="text-base font-bold text-foreground leading-snug">
                  Distributed Systems & Resilient Architectures
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Consensus protocols, event sourcing, circuit breakers, and fault tolerance across distributed node clusters.
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>10 Modules</span>
                </span>
                <Link href="/courses" className="font-semibold text-primary hover:underline">
                  View Syllabus &rarr;
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PRACTICE & EVALUATION: Concrete Education Feature */}
      <section className="w-full py-16 md:py-20 bg-secondary/50 border-b border-border">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Formative Assessment
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                Quizzes Built for Learning, Not Memorization
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Every lesson features interactive checkpoints that test your conceptual grasp before you advance.
              </p>

              <div className="space-y-3 pt-2 text-xs sm:text-sm">
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Single Choice, Multiple Choice & True/False:</strong> Questions challenge assumptions and test edge cases.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Server-Side Scoring Integrity:</strong> Correct answers are never sent to the browser pre-submission, preventing client-side inspection.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Detailed Rationales Post-Submission:</strong> Learn why the right answer is correct and why common distractor options fail.
                  </div>
                </div>
              </div>
            </div>

            {/* Assessment Scorecard Snippet */}
            <div className="lg:col-span-6">
              <div className="bg-card border border-border rounded-md p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/80">
                  <span className="text-xs font-bold text-foreground">Checkpoint Evaluation Sample</span>
                  <Badge variant="success" className="text-xs font-bold">
                    85% PASSED
                  </Badge>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <span className="font-bold block mb-0.5">Question 1: Passed (+2 pts)</span>
                    <span>&ldquo;Correctly identified that a B-tree index supports both range scans and exact-match lookups.&rdquo;</span>
                  </div>

                  <div className="p-3 rounded bg-brand-50 border border-brand-200 text-brand-900">
                    <span className="font-bold block mb-0.5">Question 2: Review Recommended</span>
                    <span>&ldquo;Incorrect on multi-column index ordering. Remember: the leftmost column must be present in WHERE queries.&rdquo;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. AI STUDY COMPANION: Positioned 5th in Hierarchy (Education First, AI is a Feature) */}
      <section id="ai-tutor" className="w-full py-16 md:py-20 border-b border-border scroll-mt-20">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Support Feature
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                A Study Companion, Never a Shortcut
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI should stimulate thinking, not replace it. Our built-in tutor is grounded strictly in the lesson you are currently studying.
              </p>

              <div className="space-y-3 pt-2 text-xs sm:text-sm">
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Socratic Quiz Honor Code:</strong> During quizzes, the companion guides your reasoning with hints and questions without revealing direct answers.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Targeted Mistake Breakdown:</strong> After submission, ask the companion to analyze conceptual misconceptions so you can retake with confidence.
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="font-bold text-primary text-base">✦</span>
                  <div>
                    <strong className="text-foreground">Lesson Grounding:</strong> Questions are answered within the exact scope of the instructor&apos;s curriculum.
                  </div>
                </div>
              </div>
            </div>

            {/* Editorial Study Dialogue Box */}
            <div className="lg:col-span-6">
              <div className="bg-card border border-border rounded-md p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-border">
                  <span className="text-xs font-bold text-foreground">Socratic Hint Guide</span>
                  <span className="text-[11px] font-mono text-muted-foreground">Lesson Grounded</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded bg-secondary border border-border">
                    <span className="font-bold text-foreground block mb-1">Student asks:</span>
                    <span className="text-muted-foreground">&ldquo;Can you just tell me which option is correct for question 3?&rdquo;</span>
                  </div>

                  <div className="p-3.5 rounded bg-brand-50/60 border border-brand-200/80 space-y-1">
                    <span className="font-bold text-primary block">AI Study Companion:</span>
                    <p className="text-foreground leading-relaxed">
                      &ldquo;I cannot give you the answer, but let&apos;s break it down: What happens to a distributed system&apos;s availability when network packets between two data centers are dropped? Review the CAP theorem principles we just covered.&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. EDUCATIONAL ECOSYSTEM: Students, Instructors, Administrators */}
      <section id="ecosystem" className="w-full py-16 md:py-24 border-b border-border bg-card/30 scroll-mt-20">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12 space-y-2">
            <div className="inline-flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-primary">
              <span>Educational Ecosystem</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Built for the Entire Educational Community
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Authentic education requires coordination across learners, curriculum creators, and institutional governance. EDplatform delivers purpose-built workspaces for each role.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* STUDENTS: Red Accent */}
            <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between shadow-xs border-t-2 border-t-primary">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    Students
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">Learn & Master</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">Personalized Learning & Mastery</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Designed for students pursuing real competence through active practice and verified retention.
                  </p>
                </div>

                <div className="pt-3 border-t border-border/70 space-y-3">
                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-primary font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Personalized learning</strong>
                      <span className="text-muted-foreground">Individual dashboard tracking course completion, lesson progress, and personal learning streaks.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-primary font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Lessons and courses</strong>
                      <span className="text-muted-foreground">Distraction-free video classroom with anti-skip watch tracking and sequential curriculum modules.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-primary font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Quizzes and practice</strong>
                      <span className="text-muted-foreground">Formative comprehension checkpoints with deterministic scoring, attempt histories, and explanations.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-primary font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">AI Tutor assistance</strong>
                      <span className="text-muted-foreground">Lesson-grounded Socratic companion offering conceptual hints without giving away direct answers.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-border">
                <Link href="/courses" className="inline-flex items-center text-xs font-semibold text-primary hover:underline">
                  <span>Explore Course Catalog</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* INSTRUCTORS: Black / Charcoal Accent */}
            <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between shadow-xs border-t-2 border-t-foreground">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-muted text-foreground border border-border">
                    Instructors
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">Author & Evaluate</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">Curriculum & Evaluation Studio</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Powerful authoring environment to construct rigorous syllabi and assess student comprehension.
                  </p>
                </div>

                <div className="pt-3 border-t border-border/70 space-y-3">
                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-foreground font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Course and lesson creation</strong>
                      <span className="text-muted-foreground">Build structured multi-module courses with lesson video streaming, descriptions, and level tagging.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-foreground font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Quiz creation</strong>
                      <span className="text-muted-foreground">Interactive assessment studio supporting single choice, multiple choice, true/false, and explanations.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-foreground font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Student progress insights</strong>
                      <span className="text-muted-foreground">Author dashboard tracking enrollment numbers, student completion rates, and quiz pass percentages.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-foreground font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Curriculum management</strong>
                      <span className="text-muted-foreground">Real-time module and lesson reordering with instant draft/publish toggles and preview modes.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-border">
                <Link href="/instructor/courses" className="inline-flex items-center text-xs font-semibold text-foreground hover:text-primary transition-colors">
                  <span>Open Course Studio</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* ADMINISTRATORS: Muted Red Accent */}
            <div className="bg-card border border-border rounded-lg p-6 flex flex-col justify-between shadow-xs border-t-2 border-t-brand-700">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-900/60">
                    Administrators
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">Govern & Moderate</span>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">Platform Governance & Telemetry</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Full operational oversight, role permissions, and platform-wide monitoring infrastructure.
                  </p>
                </div>

                <div className="pt-3 border-t border-border/70 space-y-3">
                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-brand-700 font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Platform management</strong>
                      <span className="text-muted-foreground">Central administrative controls overseeing platform status, service health, and security posture.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-brand-700 font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">User and role management</strong>
                      <span className="text-muted-foreground">Strict role-based access control (RBAC) governing student, instructor, and administrator privileges.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-brand-700 font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Course moderation</strong>
                      <span className="text-muted-foreground">Platform-level curriculum oversight, publish status monitoring, and educational quality compliance.</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2.5 text-xs">
                    <span className="text-brand-700 font-bold mt-0.5">&bull;</span>
                    <div>
                      <strong className="text-foreground block">Platform analytics</strong>
                      <span className="text-muted-foreground">Global metrics aggregating total platform users, instructor rosters, courses, and overall enrollments.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5 mt-5 border-t border-border">
                <Link href="/dashboard/admin" className="inline-flex items-center text-xs font-semibold text-brand-700 dark:text-brand-400 hover:underline">
                  <span>Platform Analytics</span>
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. REAL-TIME TELEMETRY & FINAL CTA */}
      <section className="w-full py-12 bg-background">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Telemetry card */}
          <div className="rounded-md border border-border bg-card p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border/80">
              <div className="flex items-center space-x-2.5">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Backend API Telemetry
                </span>
                <span className="text-[11px] text-muted-foreground">
                  (Render Node.js &harr; Vercel Next.js)
                </span>
              </div>

              <div>
                {loadingHealth ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Connecting...</span>
                ) : health ? (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    <span>Live & Operational</span>
                  </span>
                ) : (
                  <span className="text-xs text-destructive font-semibold">
                    Offline ({healthError || 'Unavailable'})
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-[11px] text-muted-foreground">
              <div>
                <span>Runtime: </span>
                <span className="font-semibold text-foreground">Next.js App Router</span>
              </div>
              <div>
                <span>Service: </span>
                <span className="font-semibold text-foreground">{health?.service || 'Express API'}</span>
              </div>
              <div>
                <span>Environment: </span>
                <span className="font-semibold text-foreground uppercase">{health?.environment || 'Production'}</span>
              </div>
              <div>
                <span>Database: </span>
                <span className="font-semibold text-foreground">Neon PostgreSQL</span>
              </div>
            </div>
          </div>

          {/* Action Banner */}
          <div className="text-center py-6 space-y-4">
            <h2 className="text-2xl sm:text-3xl font-black text-foreground">
              Ready to start learning with real depth?
            </h2>
            <div className="flex justify-center gap-3">
              <Link href="/register">
                <Button size="lg" className="bg-[#111111] text-white hover:bg-[#262626] font-semibold px-6 rounded-md">
                  Start Learning Free
                </Button>
              </Link>
              <Link href="/courses">
                <Button variant="outline" size="lg" className="font-semibold rounded-md border-border">
                  Browse Courses
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
