'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  GraduationCap,
  PlayCircle,
  Brain,
  Layers,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${apiUrl}/health`)
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
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full relative overflow-hidden py-20 md:py-32 border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-card/30">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-medium text-primary mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI-Powered Next-Gen EdTech Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-tight sm:leading-none">
            Master Any Subject with a{' '}
            <span className="bg-gradient-to-r from-primary via-indigo-500 to-primary bg-clip-text text-transparent">
              Context-Aware AI Tutor
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            EDplatform combines structured curriculum video delivery with a real-time Socratic AI
            tutor that knows exactly what lesson you are studying.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-primary/20">
                <span>Start Learning Now</span>
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/courses">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                <PlayCircle className="mr-2 h-4 w-4" />
                <span>Explore Course Catalog</span>
              </Button>
            </Link>
          </div>

          {/* Key Value Badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Grounded Socratic AI</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Meaningful Playback Verification</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Verifiable Certificates</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Argon2id & HttpOnly Security</span>
            </div>
          </div>
        </div>
      </section>

      {/* Real-time System Foundation Status Section */}
      <section className="w-full py-12 bg-card/40 border-b border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/60">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm sm:text-base">
                    System Foundation & Backend Connectivity
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Phase 1 Monorepo verification and live health telemetry
                  </p>
                </div>
              </div>

              <div>
                {loadingHealth ? (
                  <Badge variant="outline" className="animate-pulse">
                    Connecting to API...
                  </Badge>
                ) : health ? (
                  <Badge variant="success" className="flex items-center space-x-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>API Online & Healthy</span>
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    API Offline ({healthError || 'Unavailable'})
                  </Badge>
                )}
              </div>
            </div>

            {/* Architecture Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-muted/40">
                <span className="text-muted-foreground block mb-1">Frontend Runtime</span>
                <span className="font-semibold text-foreground">Next.js 15 App Router</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <span className="text-muted-foreground block mb-1">Backend Engine</span>
                <span className="font-semibold text-foreground">
                  {health?.service || 'Node.js Express (TypeScript)'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <span className="text-muted-foreground block mb-1">Environment</span>
                <span className="font-semibold text-foreground uppercase">
                  {health?.environment || 'Development'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/40">
                <span className="text-muted-foreground block mb-1">Database ORM</span>
                <span className="font-semibold text-foreground">PostgreSQL + Prisma</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Role Ecosystem Section */}
      <section id="features" className="w-full py-16 md:py-24">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Built for the Entire Educational Ecosystem
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Three specialized user roles united in a single, high-performance platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Student Role */}
            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <CardTitle>Students</CardTitle>
                <CardDescription>
                  Empowered learning with personalized pacing and intelligent support.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Distraction-free video and text lessons</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Real-time Socratic AI tutor assistance</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Interactive quizzes with mistake diagnostics</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Verifiable completion certificates</span>
                </div>
              </CardContent>
            </Card>

            {/* Instructor Role */}
            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                  <Layers className="h-5 w-5" />
                </div>
                <CardTitle>Instructors</CardTitle>
                <CardDescription>
                  Modern curriculum studio with AI-assisted authoring tools.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Drag-and-drop module and lesson builder</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>AI-generated quizzes from lesson content</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Meaningful student playback analytics</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Pluggable video storage references</span>
                </div>
              </CardContent>
            </Card>

            {/* Admin Role */}
            <Card className="relative overflow-hidden">
              <CardHeader>
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <CardTitle>Administrators</CardTitle>
                <CardDescription>
                  Governance, moderation, and institutional health metrics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Role-based access control and user status</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Course review, approval, and publishing</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Platform-wide telemetry & revenue charts</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  <span>Flagged content moderation pipeline</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Tutor Feature Spotlight */}
      <section id="ai-tutor" className="w-full py-16 md:py-24 bg-card/20 border-t border-border/40">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                <Brain className="h-3.5 w-3.5" />
                <span>Pedagogical AI Layer</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                A Tutor That Understands What You Are Watching
              </h2>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                Generic chatbots often hallucinate or answer off-topic questions. EDplatform’s AI
                Tutor is dynamically grounded in the active lesson’s transcript and notes.
              </p>

              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-start space-x-3">
                  <div className="p-1 rounded bg-primary/10 text-primary mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-foreground">Socratic Quiz Hint Mode:</strong> During an
                    active quiz, the AI refuses to reveal direct answers and instead guides the
                    student with conceptual hints.
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="p-1 rounded bg-primary/10 text-primary mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-foreground">Lesson Study Explainer:</strong> Outside
                    quizzes, the AI breaks down complex code, provides math formulas in LaTeX, and
                    generates custom practice drills.
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <div className="p-1 rounded bg-primary/10 text-primary mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <strong className="text-foreground">Server-Sent Events (SSE):</strong> Sub-second
                    time-to-first-token streaming direct from the Node.js backend.
                  </div>
                </div>
              </div>
            </div>

            {/* Mock AI Drawer Card */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xl relative">
              <div className="flex items-center justify-between pb-4 border-b border-border/60">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-foreground">
                    AI Academic Tutor — Active Lesson Grounding
                  </span>
                </div>
                <Badge variant="outline" className="text-xs">
                  gemini-2.5-flash
                </Badge>
              </div>

              <div className="space-y-4 my-6 text-xs">
                <div className="bg-muted/50 p-3 rounded-lg border border-border/40">
                  <span className="font-semibold text-primary block mb-1">Student:</span>
                  <span>Can you explain why we used a compound index on (userId, lessonId)?</span>
                </div>

                <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                  <span className="font-semibold text-primary block mb-1">AI Tutor:</span>
                  <p className="leading-relaxed text-foreground">
                    In our lesson on database design, each student only ever has <strong>one</strong>{' '}
                    progress record per lesson.
                  </p>
                  <p className="mt-2 text-muted-foreground leading-relaxed">
                    By placing a compound unique index on <code>(userId, lessonId)</code>, PostgreSQL
                    enforces uniqueness at the storage engine level and provides an{' '}
                    <code>O(log N)</code> index lookup whenever the student resumes video playback!
                  </p>
                </div>
              </div>

              <div className="text-center pt-2 border-t border-border/40">
                <span className="text-[11px] text-muted-foreground">
                  Grounded in Lesson 4: "PostgreSQL Indexing & Optimization"
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
