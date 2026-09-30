'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Award,
  Clock,
  ShieldCheck,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { AITutorDrawer } from '@/components/ai/ai-tutor-drawer';

interface PlaybackDetails {
  type: string;
  url: string;
  mimeType: string;
}

interface LessonNavSummary {
  id: string;
  title: string;
  type: 'VIDEO' | 'TEXT';
  videoDuration?: number;
  sortOrder: number;
  isFreePreview: boolean;
  isCompleted?: boolean;
}

interface ModuleNavSummary {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LessonNavSummary[];
}

interface LessonDetail {
  id: string;
  title: string;
  slug: string;
  description?: string;
  type: 'VIDEO' | 'TEXT';
  content?: string;
  videoUrl?: string;
  videoDuration?: number;
  sortOrder: number;
  moduleId: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  playback?: PlaybackDetails;
  prevLesson?: { id: string; title: string } | null;
  nextLesson?: { id: string; title: string } | null;
  courseNavigation: ModuleNavSummary[];
}

interface LessonProgressRecord {
  lessonId: string;
  isCompleted: boolean;
  lastPositionSeconds: number;
  coveragePercentage: number;
}

export default function LessonClassroomPage({
  params
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const resolvedParams = React.use(params);
  const { slug, lessonId } = resolvedParams;
  const { user } = useAuth();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [progress, setProgress] = useState<LessonProgressRecord | null>(null);
  const [lessonQuiz, setLessonQuiz] = useState<{
    id: string;
    title: string;
    passingScore: number;
    questionsCount: number;
    timeLimitSeconds?: number | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiTutorOpen, setAiTutorOpen] = useState(false);

  // Interval tracking state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeIntervalStartRef = useRef<number | null>(null);
  const accumulatedIntervalsRef = useRef<{ start: number; end: number }[]>([]);
  const isSyncingRef = useRef(false);

  // Load lesson and existing progress
  const loadLessonData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi<{ lesson: LessonDetail }>(`/lessons/${lessonId}`);
      setLesson(data.lesson);

      // Check for lesson quiz
      try {
        const qData = await fetchApi<{ quiz: any }>(`/lessons/${lessonId}/quiz`);
        if (qData?.quiz && qData.quiz.isPublished) {
          setLessonQuiz(qData.quiz);
        } else {
          setLessonQuiz(null);
        }
      } catch {
        setLessonQuiz(null);
      }

      // Load progress if user is authenticated
      if (user) {
        try {
          const progData = await fetchApi<{ progress: LessonProgressRecord | null }>(
            `/lessons/${lessonId}/progress`
          );
          if (progData.progress) {
            setProgress(progData.progress);
          }
        } catch {
          // Progress fetch failed gracefully
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load lesson');
    } finally {
      setIsLoading(false);
    }
  }, [lessonId, user]);

  useEffect(() => {
    loadLessonData();
  }, [loadLessonData]);

  // Sync progress to backend
  const syncProgress = useCallback(
    async (forceComplete: boolean = false) => {
      if (!user || !lesson || isSyncingRef.current) return;

      const video = videoRef.current;
      const currentPosition = video ? Math.floor(video.currentTime) : 0;
      const totalDuration = video?.duration ? Math.floor(video.duration) : lesson.videoDuration || 0;

      // Close open active interval
      if (activeIntervalStartRef.current !== null && video) {
        const intervalEnd = Math.floor(video.currentTime);
        if (intervalEnd > activeIntervalStartRef.current) {
          accumulatedIntervalsRef.current.push({
            start: activeIntervalStartRef.current,
            end: intervalEnd
          });
        }
        activeIntervalStartRef.current = intervalEnd;
      }

      const intervalsToSend = [...accumulatedIntervalsRef.current];
      if (intervalsToSend.length === 0 && !forceComplete) return;

      try {
        isSyncingRef.current = true;
        const res = await fetchApi<{ progress: LessonProgressRecord }>(
          `/lessons/${lesson.id}/progress`,
          {
            method: 'POST',
            body: JSON.stringify({
              lessonId: lesson.id,
              lastPositionSeconds: currentPosition,
              watchedIntervals: intervalsToSend,
              totalDurationSeconds: totalDuration,
              forceComplete
            })
          }
        );

        if (res.progress) {
          setProgress(res.progress);
          accumulatedIntervalsRef.current = [];
        }
      } catch (err) {
        console.error('Failed to sync progress:', err);
      } finally {
        isSyncingRef.current = false;
      }
    },
    [user, lesson]
  );

  // Video event handlers for interval tracking
  const handlePlay = () => {
    if (videoRef.current) {
      activeIntervalStartRef.current = Math.floor(videoRef.current.currentTime);
    }
  };

  const handlePause = () => {
    if (videoRef.current && activeIntervalStartRef.current !== null) {
      const end = Math.floor(videoRef.current.currentTime);
      if (end > activeIntervalStartRef.current) {
        accumulatedIntervalsRef.current.push({
          start: activeIntervalStartRef.current,
          end
        });
      }
      activeIntervalStartRef.current = null;
    }
    syncProgress();
  };

  const handleEnded = () => {
    handlePause();
    syncProgress();
  };

  // Periodic progress sync every 6 seconds during playback
  useEffect(() => {
    const timer = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        syncProgress();
      }
    }, 6000);

    return () => {
      clearInterval(timer);
      // Flush any pending intervals when unmounting / switching lessons
      if (videoRef.current && activeIntervalStartRef.current !== null) {
        const end = Math.floor(videoRef.current.currentTime);
        if (end > activeIntervalStartRef.current) {
          accumulatedIntervalsRef.current.push({
            start: activeIntervalStartRef.current,
            end
          });
        }
        activeIntervalStartRef.current = null;
      }
    };
  }, [syncProgress]);

  // Resume last position when video metadata loads
  const handleLoadedMetadata = () => {
    if (videoRef.current && progress?.lastPositionSeconds && !progress.isCompleted) {
      videoRef.current.currentTime = progress.lastPositionSeconds;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading classroom environment...</p>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Access Restricted</h2>
        <p className="mt-2 text-muted-foreground">
          {error || 'You must enroll in this course to view this lesson.'}
        </p>
        <Link href={`/courses/${slug}`} className="mt-6 inline-block">
          <Button>Return to Course Details</Button>
        </Link>
      </div>
    );
  }

  const coverage = progress?.coveragePercentage || 0;
  const isCompleted = progress?.isCompleted || false;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Top Control Bar */}
        <div className="border-b border-border/40 bg-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href={`/courses/${lesson.courseSlug}`}
              className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span>Back to Course</span>
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <span className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-md">
              {lesson.courseTitle}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setAiTutorOpen(true)}
              className="text-xs flex items-center space-x-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Tutor</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-xs flex items-center space-x-1"
            >
              <Menu className="h-4 w-4" />
              <span>Curriculum</span>
            </Button>
          </div>
        </div>

        {/* Video Player or Text Lesson Content */}
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
          {lesson.type === 'VIDEO' ? (
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl border border-border/40">
              {lesson.playback?.url ? (
                <video
                  ref={videoRef}
                  src={lesson.playback.url}
                  controls
                  className="w-full h-full object-contain"
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onEnded={handleEnded}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-white">
                  <Play className="h-16 w-16 opacity-30 mb-4" />
                  <p className="text-lg font-semibold">Video Stream Not Available</p>
                  <p className="text-xs text-white/60 mt-1 max-w-md">
                    This lesson requires enrollment or an active video source.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-10 shadow-sm space-y-4">
              <Badge variant="outline" className="text-xs">
                Text Lesson
              </Badge>
              <div className="prose dark:prose-invert max-w-none text-foreground leading-relaxed">
                {lesson.content || 'No text content available for this lesson.'}
              </div>
              {!isCompleted && user && (
                <div className="pt-4 border-t border-border/40">
                  <Button onClick={() => syncProgress(true)} size="sm">
                    Mark as Completed
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Meaningful Progress Bar & Milestone Status */}
          {user && (
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center space-x-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Playback Watch Coverage</span>
                </span>
                <span className={isCompleted ? 'text-emerald-500 font-bold' : 'text-primary'}>
                  {coverage}% {isCompleted ? '(Completed)' : '(Need 90% to complete)'}
                </span>
              </div>

              <Progress
                value={coverage}
                indicatorClassName={isCompleted ? 'bg-emerald-500' : 'bg-primary'}
              />

              {isCompleted ? (
                <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Lesson requirement completed! Meaningful watch threshold met.</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Watch at least 90% of this lesson to automatically achieve completion credit. Seeking directly to the end will not bypass verification.
                </p>
              )}
            </div>
          )}

          {/* Lesson Quiz Banner */}
          {lessonQuiz && user && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
              <div className="flex items-center space-x-3.5">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-foreground">{lessonQuiz.title}</h3>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                      {lessonQuiz.questionsCount} Questions
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Passing Score: {lessonQuiz.passingScore}%{' '}
                    {lessonQuiz.timeLimitSeconds
                      ? `\u2022 ${Math.round(lessonQuiz.timeLimitSeconds / 60)} min limit`
                      : ''}
                  </p>
                </div>
              </div>

              <Link href={`/courses/${lesson.courseSlug}/lessons/${lesson.id}/quiz`}>
                <Button size="sm" className="space-x-1.5 w-full sm:w-auto">
                  <span>Take Lesson Quiz</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* Lesson Header & Details */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {lesson.title}
            </h1>
            {lesson.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">{lesson.description}</p>
            )}
          </div>

          {/* Next / Previous Lesson Controls */}
          <div className="flex items-center justify-between border-t border-border/40 pt-6">
            {lesson.prevLesson ? (
              <Link href={`/courses/${lesson.courseSlug}/lessons/${lesson.prevLesson.id}`}>
                <Button variant="outline" size="sm" className="space-x-1.5">
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous:</span>
                  <span className="truncate max-w-[120px]">{lesson.prevLesson.title}</span>
                </Button>
              </Link>
            ) : (
              <div />
            )}

            {lesson.nextLesson ? (
              <Link href={`/courses/${lesson.courseSlug}/lessons/${lesson.nextLesson.id}`}>
                <Button size="sm" className="space-x-1.5">
                  <span className="hidden sm:inline">Next:</span>
                  <span className="truncate max-w-[120px]">{lesson.nextLesson.title}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link href={`/courses/${lesson.courseSlug}`}>
                <Button variant="outline" size="sm" className="space-x-1.5">
                  <span>Finish Course</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Right Curriculum Navigation Sidebar (Desktop + Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-80 bg-card border-l border-border/40 flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Course Content</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/30 p-2 space-y-4">
          {lesson.courseNavigation.map((mod, modIdx) => (
            <div key={mod.id} className="pt-2">
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Module {modIdx + 1}: {mod.title}
              </div>

              <div className="mt-1 space-y-1">
                {mod.lessons.map((navLesson) => {
                  const isActive = navLesson.id === lesson.id;
                  return (
                    <Link
                      key={navLesson.id}
                      href={`/courses/${lesson.courseSlug}/lessons/${navLesson.id}`}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                          : 'hover:bg-muted/60 text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {isActive ? (
                          <Play className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                        )}
                        <span className="truncate">{navLesson.title}</span>
                      </div>

                      {navLesson.videoDuration ? (
                        <span
                          className={`text-[10px] ml-2 ${
                            isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}
                        >
                          {Math.round(navLesson.videoDuration / 60)}m
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <AITutorDrawer
        isOpen={aiTutorOpen}
        onClose={() => setAiTutorOpen(false)}
        lessonId={lesson.id}
        lessonTitle={lesson.title}
        mode="study"
      />
    </div>
  );
}
