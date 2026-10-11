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
  ArrowLeft,
  ArrowRight,
  Award,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { fetchApi } from '@/lib/api';
import { useStudent } from '@/context/student-context';
import { AskEdButton } from '@/components/tutor/ask-ed-button';
import { MarkdownMessage } from '@/components/ai/markdown-message';

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
  const { student: user, isLoaded: authLoaded } = useStudent();

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

  // Interval tracking state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeIntervalStartRef = useRef<number | null>(null);
  const accumulatedIntervalsRef = useRef<{ start: number; end: number }[]>([]);
  const isSyncingRef = useRef(false);

  // Load lesson and existing progress
  const loadLessonData = useCallback(async () => {
    if (!authLoaded) return;
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
  }, [lessonId, user, authLoaded]);

  // Wait for the auth context before fetching. React runs child effects before
  // parent effects, so on mount this ran before StudentProvider registered the
  // Clerk token getter, and the request went out with no Authorization header.
  // Until C6/C7 those anonymous reads succeeded through isFreePreview, which is
  // why this never surfaced; now they are correctly refused, and the failed
  // first request raced ahead of the authenticated retry.
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
          <p className="text-sm text-muted-foreground font-medium">Entering focused classroom...</p>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-20 text-center space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive w-fit mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">We could not open this</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {/* Not always an enrollment problem any more. A curriculum lesson can
              also fail because it belongs to another class, in which case the
              server deliberately answers "not found". */}
          {error || 'This lesson is not available for your class.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href={`/courses/${slug}`} className="inline-block">
            <Button variant="outline" className="rounded-md">Back to chapters</Button>
          </Link>
          <Link href="/learn" className="inline-block">
            <Button className="rounded-md">Go to Learn</Button>
          </Link>
        </div>
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
        <div className="border-b border-border bg-background px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center space-x-3 min-w-0">
            <Link
              href={`/courses/${lesson.courseSlug}`}
              className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Back to Course</span>
            </Link>
            <span className="text-muted-foreground/30 hidden sm:inline">&bull;</span>
            <span className="text-xs font-bold text-foreground truncate max-w-[200px] sm:max-w-md">
              {lesson.courseTitle}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <AskEdButton
              lessonId={lesson.id}
              initialMessage={`Explain this lesson to me: ${lesson.title}`}
              label="Ask ED"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-xs flex items-center space-x-1 rounded-md border-border"
            >
              <Menu className="h-4 w-4" />
              <span>Syllabus</span>
            </Button>
          </div>
        </div>

        {/* Video Player or Text Lesson Content */}
        <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-6">
          {lesson.type === 'VIDEO' ? (
            <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black shadow-sm border border-border">
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
                  <Play className="h-14 w-14 opacity-40 mb-3" />
                  <p className="text-base font-semibold">Video Stream Not Available</p>
                  <p className="text-xs text-white/60 mt-1 max-w-md">
                    This lesson requires enrollment or an active video source reference.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-6 sm:p-10 shadow-xs space-y-4">
              <Badge variant="outline" className="text-xs rounded-md border-border bg-muted/40">
                Text Lesson
              </Badge>
              {/* Curriculum topics are authored in Markdown, so render them as
                  Markdown. Previously this printed the raw source, which showed
                  '##' and '**' to the student. Reuses the tutor's renderer. */}
              {lesson.content ? (
                <MarkdownMessage content={lesson.content} />
              ) : (
                <p className="text-muted-foreground">No text content available for this lesson.</p>
              )}
              {!isCompleted && user && (
                <div className="pt-4 border-t border-border">
                  <Button onClick={() => syncProgress(true)} size="sm" className="rounded-md bg-solid text-solid-foreground hover:bg-solid-hover font-semibold">
                    Mark as Completed
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Meaningful Progress Bar & Milestone Status.
              Video only: watch coverage says nothing about a reading topic, and
              telling a Class 6 student that a page of text needs "90% playback
              for credit" is just confusing. TEXT topics get the plain done
              line below instead. */}
          {user && lesson.type === 'VIDEO' && (
            <div className="rounded-lg border border-border bg-card p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center space-x-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Playback Watch Coverage</span>
                </span>
                <span className={isCompleted ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-primary font-bold'}>
                  {coverage}% {isCompleted ? '(Lesson Verified)' : '(90% required for credit)'}
                </span>
              </div>

              <Progress
                value={coverage}
                indicatorClassName={isCompleted ? 'bg-emerald-600' : 'bg-primary'}
              />

              {isCompleted ? (
                <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 pt-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Lesson requirement completed! Verified watch threshold met.</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Watch at least 90% of this lesson to automatically achieve completion credit. Skipping ahead to the end without watching will not satisfy the threshold.
                </p>
              )}
            </div>
          )}

          {user && lesson.type === 'TEXT' && isCompleted && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>You finished this one.</span>
            </div>
          )}

          {/* Lesson Quiz Banner */}
          {lessonQuiz && user && (
            <div className="rounded-lg border border-border bg-background p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xs">
              <div className="flex items-center space-x-3.5">
                <div className="p-3 rounded-md bg-accent text-primary border border-primary/20">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-foreground">{lessonQuiz.title}</h3>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30 rounded-md bg-card">
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
                <Button size="sm" className="space-x-1.5 w-full sm:w-auto rounded-md bg-solid text-solid-foreground hover:bg-solid-hover font-semibold">
                  <span>Take Lesson Quiz</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* Lesson Header & Details */}
          <div className="space-y-3 pt-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
              {lesson.title}
            </h1>
            {lesson.description && (
              <p className="text-muted-foreground text-sm leading-relaxed max-w-3xl">{lesson.description}</p>
            )}
          </div>

          {/* Next / Previous Lesson Controls */}
          <div className="flex items-center justify-between border-t border-border pt-6">
            {lesson.prevLesson ? (
              <Link href={`/courses/${lesson.courseSlug}/lessons/${lesson.prevLesson.id}`}>
                <Button variant="outline" size="sm" className="space-x-1.5 rounded-md border-border font-medium">
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
                <Button size="sm" className="space-x-1.5 rounded-md bg-solid text-solid-foreground hover:bg-solid-hover font-semibold">
                  <span className="hidden sm:inline">Next:</span>
                  <span className="truncate max-w-[120px]">{lesson.nextLesson.title}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link href={`/courses/${lesson.courseSlug}`}>
                <Button variant="outline" size="sm" className="space-x-1.5 rounded-md border-border font-medium">
                  <span>Back to chapters</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Right Curriculum Navigation Sidebar (Desktop + Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-80 bg-background border-l border-border flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <h3 className="text-sm font-bold text-foreground">Course Content</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 rounded-md"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border p-3 space-y-4">
          {lesson.courseNavigation.map((mod) => (
            <div key={mod.id} className="pt-2">
              {/* No derived number. The sidebar index is an array position, not
                  the official chapter number - two-part NCERT books restart
                  numbering at 1, so printing the index would misstate the
                  syllabus. Same rule as the course page. */}
              <div className="px-3 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {mod.title}
              </div>

              <div className="mt-1 space-y-1">
                {mod.lessons.map((navLesson) => {
                  const isActive = navLesson.id === lesson.id;
                  return (
                    <Link
                      key={navLesson.id}
                      href={`/courses/${lesson.courseSlug}/lessons/${navLesson.id}`}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-md text-xs transition-colors ${
                        isActive
                          ? 'bg-solid text-solid-foreground font-semibold'
                          : 'hover:bg-muted/50 text-foreground'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {isActive ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                        )}
                        <span className="truncate">{navLesson.title}</span>
                      </div>

                      {navLesson.videoDuration ? (
                        <span
                          className={`text-[10px] ml-2 font-mono ${
                            isActive ? 'text-solid-foreground/70' : 'text-muted-foreground'
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

    </div>
  );
}

