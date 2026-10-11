'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PlayCircle,
  FileText,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  BookOpen,
  ArrowLeft,
  ArrowRight,
  Award,
  Sparkles,
  ShieldCheck,
  Loader2,
  MessageCircle
} from 'lucide-react';
import { resolveCourseClassLevel } from '@edplatform/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchApi } from '@/lib/api';
import { useStudent } from '@/context/student-context';

interface LessonItem {
  id: string;
  title: string;
  slug: string;
  description?: string;
  type: 'VIDEO' | 'TEXT';
  videoDuration?: number;
  sortOrder: number;
  isFreePreview: boolean;
  quizId?: string | null;
}

interface ModuleItem {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  lessons: LessonItem[];
}

interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string;
  shortSummary?: string;
  thumbnailUrl?: string;
  price: number;
  level: string;
  isPublished: boolean;
  instructor: {
    id: string;
    firstName: string;
    lastName: string;
    bio?: string;
    avatarUrl?: string;
  };
  modules: ModuleItem[];
  isEnrolled?: boolean;
}

interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedLessonsCount: number;
  progressPercentage: number;
  completedLessonIds: string[];
}

export default function CourseDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = React.use(params);
  const slug = resolvedParams.slug;
  const router = useRouter();
  const { student: user, isLoaded: authLoaded } = useStudent();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  /** moduleId currently being opened, so only that chapter shows a spinner. */
  const [askingChapter, setAskingChapter] = useState<string | null>(null);
  const [askChapterError, setAskChapterError] = useState<string | null>(null);

  /**
   * Opens ED on a chapter whose topics are not written yet.
   *
   * Sends one id and nothing else. The chapter name, the textbook, the course,
   * the class and the subject are all read on the server from rows this
   * student has been proven entitled to, and the opening message is composed
   * there - so none of it can be named or altered from here.
   */
  async function askEdAboutChapter(moduleId: string) {
    if (askingChapter) return;
    setAskingChapter(moduleId);
    setAskChapterError(null);

    try {
      const data = await fetchApi<{ sessionId: string; openingMessage: string }>(
        '/ai/tutor/sessions/from-chapter',
        { method: 'POST', body: JSON.stringify({ moduleId }) }
      );
      router.push(
        `/tutor/${data.sessionId}?ask=${encodeURIComponent(data.openingMessage)}`
      );
    } catch (err) {
      setAskChapterError(err instanceof Error ? err.message : 'Could not open ED just now');
      setAskingChapter(null);
    }
  }

  useEffect(() => {
    async function loadCourseData() {
      try {
        setIsLoading(true);
        const data = await fetchApi<{ course: CourseDetail }>(`/courses/${slug}`);
        setCourse(data.course);

        if (user && data.course) {
          // Progress is fetched for every signed-in student, not only enrolled
          // ones. Curriculum students never enroll in anything, so gating this
          // on enrollment meant their completed topics never showed a tick -
          // the records existed, the page just never asked for them. The
          // progress endpoint itself has never required enrollment.
          try {
            const progressRes = await fetchApi<CourseProgress>(
              `/courses/${data.course.id}/progress`
            );
            setProgress(progressRes);
          } catch {
            // No progress yet, or the fetch failed; the page renders without it.
          }

          try {
            const statusRes = await fetchApi<{ isEnrolled: boolean }>(
              `/courses/${data.course.id}/enrollment-status`
            );
            if (statusRes.isEnrolled) {
              setCourse((prev) => (prev ? { ...prev, isEnrolled: true } : null));
            }
          } catch {
            // Enrollment status only drives the legacy marketplace view.
          }
        }
      } catch (err) {
        console.error('Failed to load course details', err);
      } finally {
        setIsLoading(false);
      }
    }
    if (authLoaded) loadCourseData();
  }, [slug, user, authLoaded]);

  const handleEnroll = async () => {
    if (!user) {
      router.push(`/sign-in?redirect_url=/courses/${slug}`);
      return;
    }
    if (!course) return;

    try {
      setIsEnrolling(true);
      setEnrollError(null);
      await fetchApi(`/courses/${course.id}/enroll`, { method: 'POST' });

      // Refresh enrollment state
      setCourse((prev) => (prev ? { ...prev, isEnrolled: true } : null));

      // Navigate to the first available lesson
      const firstLesson = course.modules?.[0]?.lessons?.[0];
      if (firstLesson) {
        router.push(`/courses/${course.slug}/lessons/${firstLesson.id}`);
      }
    } catch (err: any) {
      setEnrollError(err.message || 'Failed to enroll in course');
    } finally {
      setIsEnrolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-4 py-16 animate-pulse space-y-6">
        <div className="h-10 w-2/3 bg-muted rounded-md" />
        <div className="h-6 w-1/3 bg-muted rounded-md" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 h-96 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto max-w-xl px-4 py-24 text-center space-y-4">
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive w-fit mx-auto">
          <BookOpen className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">We could not find this</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {/* Also the response a student gets for another class's course: the
              server answers "not found" rather than "not allowed", so slugs
              cannot be probed by comparing errors. */}
          This is not available for your class, or it does not exist.
        </p>
        <Link href="/learn" className="inline-block pt-2">
          <Button className="rounded-md">Back to Learn</Button>
        </Link>
      </div>
    );
  }

  // Find first lesson for "Start Learning"
  const firstLesson = course.modules?.[0]?.lessons?.[0];
  const totalLessonsCount = course.modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0);

  const completedIds = progress?.completedLessonIds ?? [];

  // ------------------------------------------------------------------
  // Curriculum view (Class 6-8).
  //
  // The marketplace view below is wrong for a twelve-year-old: it leads with a
  // price, an "Enroll in Course" button, lifetime-access copy and an
  // instructor byline, none of which mean anything for their own school
  // syllabus. Curriculum courses get a plain chapter list instead.
  //
  // Which view to use is decided by the same canonical allowlist the backend
  // authorizes with, so the two cannot drift apart.
  // ------------------------------------------------------------------
  if (resolveCourseClassLevel(course.slug) !== null) {
    const topicsCount = totalLessonsCount;
    const doneCount = completedIds.length;

    return (
      <div className="mx-auto max-w-3xl px-4 pt-8 pb-16">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Learn
        </Link>

        <h1 className="mt-4 text-2xl font-bold">{course.title}</h1>
        <p className="mt-1.5 text-muted-foreground">
          {course.modules.length} chapter{course.modules.length === 1 ? '' : 's'}
          {topicsCount > 0 && (
            <>
              {' '}&bull; {doneCount} of {topicsCount} topic
              {topicsCount === 1 ? '' : 's'} done
            </>
          )}
        </p>

        {doneCount > 0 && topicsCount > 0 && (
          <Progress
            value={Math.round((doneCount / topicsCount) * 100)}
            className="mt-4"
            indicatorClassName="bg-emerald-600"
          />
        )}

        <div className="mt-7 space-y-3">
          {course.modules.map((moduleItem) => {
            const topics = moduleItem.lessons ?? [];
            // The chapter's quiz hangs off whichever topic carries it.
            const quizTopic = topics.find((t) => t.quizId);

            return (
              <section
                key={moduleItem.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <header className="border-b border-border px-5 py-4">
                  {/* Deliberately no derived number here. The array index is an
                      application ordering value, not the official chapter
                      number - two-part NCERT books restart numbering at 1, so
                      showing the index would misstate the syllabus. The module
                      title carries the part marker and its description carries
                      the official chapter reference. */}
                  <h2 className="font-bold leading-snug">{moduleItem.title}</h2>
                  {moduleItem.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {moduleItem.description}
                    </p>
                  )}
                </header>

                {topics.length === 0 ? (
                  // The copy promised something the page did not provide: for
                  // eleven of twelve chapters this said "you can still ask ED"
                  // and offered no way to. The button is that way.
                  <div className="space-y-3 px-5 py-4">
                    <p className="text-sm text-muted-foreground">
                      Not written yet. You can still ask ED anything from this chapter.
                    </p>
                    <button
                      type="button"
                      onClick={() => void askEdAboutChapter(moduleItem.id)}
                      disabled={askingChapter !== null}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3.5 text-sm font-semibold text-accent-foreground transition-colors hover:border-primary/60 disabled:opacity-60"
                    >
                      {askingChapter === moduleItem.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircle className="h-4 w-4 text-primary" />
                      )}
                      Ask ED about this chapter
                    </button>
                    {askChapterError && askingChapter === null && (
                      <p className="text-sm text-destructive">{askChapterError}</p>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {topics.map((topic) => {
                      const isDone = completedIds.includes(topic.id);

                      return (
                        <li key={topic.id}>
                          <Link
                            href={`/courses/${course.slug}/lessons/${topic.id}`}
                            className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/40"
                          >
                            {isDone ? (
                              <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600" />
                            ) : (
                              <FileText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold leading-snug">
                                {topic.title}
                              </span>
                              {topic.description && (
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                                  {topic.description}
                                </span>
                              )}
                            </span>
                            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Practice sits at the end of the chapter, because that is
                    where the quiz is attached (to the chapter's last topic).
                    Without this row a student would only find it by opening
                    that one topic. */}
                {quizTopic && (
                  <Link
                    href={`/courses/${course.slug}/lessons/${quizTopic.id}/quiz`}
                    className="flex items-center gap-3 border-t border-border bg-muted/20 px-5 py-4 transition-colors hover:bg-muted/50"
                  >
                    <Award className="h-4.5 w-4.5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug">
                        Practice questions
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        A few questions to check what stuck.
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Course Hero */}
      <section className="border-b border-border bg-background py-12 lg:py-16">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left 8 Cols: Title, Instructor, Description */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold px-3 py-1 rounded-md border-border bg-card">
                  {course.level}
                </Badge>
                {course.isEnrolled && (
                  <Badge className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 dark:text-emerald-400 border-emerald-500/30 px-3 py-1 rounded-md font-semibold">
                    Enrolled
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground font-mono">
                  {course.modules.length} Modules &bull; {totalLessonsCount} Lessons
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground font-display leading-[1.18]">
                {course.title}
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-3xl">
                {course.shortSummary || course.description}
              </p>

              {/* Instructor Box */}
              <div className="flex items-center space-x-3.5 pt-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-solid text-solid-foreground font-bold text-sm border border-border">
                  {course.instructor.firstName[0]}
                  {course.instructor.lastName[0]}
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">
                    {course.instructor.firstName} {course.instructor.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">Course Instructor & Subject Specialist</div>
                </div>
              </div>
            </div>

            {/* Right 4 Cols: Sticky Enrollment Card */}
            <div className="lg:col-span-4">
              <Card className="border-border sticky top-24 rounded-lg overflow-hidden shadow-sm bg-card">
                <CardHeader className="space-y-2 pb-4 bg-muted/40 border-b border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Access Option</span>
                    <span className="text-2xl font-extrabold text-foreground font-display">
                      {course.price === 0 ? (
                        <span className="text-emerald-700">Free</span>
                      ) : (
                        `$${course.price}`
                      )}
                    </span>
                  </div>
                  <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                    Full lifetime access to structured syllabus, formative practice quizzes, and grounded Socratic AI tutoring.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 pt-5">
                  {course.isEnrolled ? (
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Your Progress</span>
                        <span className="text-primary font-bold">{progress?.progressPercentage || 0}%</span>
                      </div>
                      <Progress value={progress?.progressPercentage || 0} />
                      <div className="text-xs text-muted-foreground">
                        {progress?.completedLessonsCount || 0} of {progress?.totalLessons || totalLessonsCount} lessons completed
                      </div>

                      {firstLesson && (
                        <Link
                          href={`/courses/${course.slug}/lessons/${firstLesson.id}`}
                          className="w-full block pt-1"
                        >
                          <Button className="w-full space-x-2 rounded-md font-semibold bg-solid text-solid-foreground hover:bg-solid-hover">
                            <span>Continue Learning</span>
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enrollError && (
                        <p className="text-xs font-medium text-destructive">{enrollError}</p>
                      )}
                      <Button
                        onClick={handleEnroll}
                        disabled={isEnrolling}
                        className="w-full py-5 font-bold rounded-md bg-solid text-solid-foreground hover:bg-solid-hover transition-colors"
                      >
                        {isEnrolling ? 'Enrolling...' : 'Enroll in Course'}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2.5 border-t border-border pt-4 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-2.5">
                      <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{course.modules.length} Modules &bull; {totalLessonsCount} Lessons</span>
                    </div>
                    <div className="flex items-center space-x-2.5">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>Grounded Socratic AI Tutor Assistance</span>
                    </div>
                    <div className="flex items-center space-x-2.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300 flex-shrink-0" />
                      <span>Verified Course Completion Record</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Course Curriculum & Syllabus */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-4xl space-y-8">
          <div>
            <div className="inline-flex items-center space-x-2 text-xs font-semibold text-primary uppercase tracking-wider mb-1">
              <span>Course Syllabus</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-display">
              Curriculum & Learning Units
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.modules.length} modules &bull; {totalLessonsCount} structured lessons
            </p>
          </div>

          <div className="space-y-4">
            {course.modules.map((moduleItem) => (
              <Card key={moduleItem.id} className="border-border rounded-lg overflow-hidden shadow-xs bg-card">
                <CardHeader className="py-4 px-6 bg-muted/30 border-b border-border">
                  <div className="flex items-center justify-between">
                    {/* Deliberately no derived number here. The array index is an
                        application ordering value, not the official chapter
                        number — two-part NCERT books restart numbering at 1, so
                        showing the index would misstate the syllabus. The module
                        title carries the part marker and its description carries
                        the official chapter reference. */}
                    <CardTitle className="text-base font-bold text-foreground">
                      {moduleItem.title}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground font-medium font-mono">
                      {moduleItem.lessons?.length || 0} lessons
                    </span>
                  </div>
                  {moduleItem.description && (
                    <CardDescription className="text-xs pt-0.5 leading-relaxed text-muted-foreground">{moduleItem.description}</CardDescription>
                  )}
                </CardHeader>

                <CardContent className="p-0 divide-y divide-border">
                  {moduleItem.lessons.map((lesson) => {
                    const isCompleted = progress?.completedLessonIds?.includes(lesson.id);
                    const canAccess = course.isEnrolled || lesson.isFreePreview;

                    const lessonRow = (
                      <div
                        className={`flex items-center justify-between p-4 transition-colors ${
                          canAccess
                            ? 'hover:bg-muted/40 cursor-pointer'
                            : 'opacity-75 cursor-not-allowed bg-muted/10'
                        }`}
                      >
                        <div className="flex items-center space-x-3.5 min-w-0">
                          {isCompleted ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          ) : lesson.type === 'VIDEO' ? (
                            <PlayCircle className="h-4.5 w-4.5 text-primary flex-shrink-0" />
                          ) : (
                            <FileText className="h-4.5 w-4.5 text-muted-foreground flex-shrink-0" />
                          )}

                          <span className={`text-sm font-medium truncate ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {lesson.title}
                          </span>

                          {lesson.isFreePreview && !course.isEnrolled && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 rounded-md px-2 py-0">
                              Free Preview
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-xs text-muted-foreground flex-shrink-0 ml-3">
                          {lesson.videoDuration ? (
                            <span className="flex items-center space-x-1 font-mono">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>{Math.round(lesson.videoDuration / 60)} min</span>
                            </span>
                          ) : null}

                          {canAccess ? (
                            <Unlock className="h-3.5 w-3.5 text-muted-foreground/60" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                          )}
                        </div>
                      </div>
                    );

                    return canAccess ? (
                      <Link
                        key={lesson.id}
                        href={`/courses/${course.slug}/lessons/${lesson.id}`}
                        className="block"
                      >
                        {lessonRow}
                      </Link>
                    ) : (
                      <div key={lesson.id}>{lessonRow}</div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

