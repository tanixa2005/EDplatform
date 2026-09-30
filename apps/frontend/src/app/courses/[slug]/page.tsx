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
  ArrowRight,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { fetchApi } from '@/lib/api';
import { useAuth } from '@/context/auth-context';

interface LessonItem {
  id: string;
  title: string;
  slug: string;
  type: 'VIDEO' | 'TEXT';
  videoDuration?: number;
  sortOrder: number;
  isFreePreview: boolean;
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
  const { user } = useAuth();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCourseData() {
      try {
        setIsLoading(true);
        const data = await fetchApi<{ course: CourseDetail }>(`/courses/${slug}`);
        setCourse(data.course);

        // If user is authenticated, check enrollment & progress
        if (user && data.course) {
          try {
            const statusRes = await fetchApi<{ isEnrolled: boolean }>(
              `/courses/${data.course.id}/enrollment-status`
            );
            if (statusRes.isEnrolled) {
              setCourse((prev) => (prev ? { ...prev, isEnrolled: true } : null));
              const progressRes = await fetchApi<CourseProgress>(
                `/courses/${data.course.id}/progress`
              );
              setProgress(progressRes);
            }
          } catch {
            // Unenrolled or progress fetch failed gracefully
          }
        }
      } catch (err) {
        console.error('Failed to load course details', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCourseData();
  }, [slug, user]);

  const handleEnroll = async () => {
    if (!user) {
      router.push(`/login?redirect=/courses/${slug}`);
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
          <div className="lg:col-span-2 h-96 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-24 text-center">
        <h2 className="text-2xl font-bold text-foreground">Course Not Found</h2>
        <p className="mt-2 text-muted-foreground">The course you are looking for does not exist or has been unpublished.</p>
        <Link href="/courses" className="mt-6 inline-block">
          <Button>Back to Courses</Button>
        </Link>
      </div>
    );
  }

  // Find first lesson for "Start Learning"
  const firstLesson = course.modules?.[0]?.lessons?.[0];
  const totalLessonsCount = course.modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Course Hero */}
      <section className="border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background py-12 lg:py-16">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
            {/* Left 2 Cols: Title, Instructor, Description */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs uppercase tracking-wider font-semibold">
                  {course.level}
                </Badge>
                {course.isEnrolled && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    Enrolled
                  </Badge>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                {course.title}
              </h1>

              <p className="text-lg text-muted-foreground leading-relaxed">
                {course.shortSummary || course.description}
              </p>

              {/* Instructor Box */}
              <div className="flex items-center space-x-3 pt-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base shadow-sm">
                  {course.instructor.firstName[0]}
                  {course.instructor.lastName[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {course.instructor.firstName} {course.instructor.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">Instructor</div>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Enrollment Card */}
            <div className="lg:col-span-1">
              <Card className="border-border/60 shadow-lg sticky top-24">
                <CardHeader className="space-y-2">
                  <div className="text-2xl font-bold text-foreground">
                    {course.price === 0 ? 'Free' : `$${course.price}`}
                  </div>
                  <CardDescription>
                    Full lifetime access to all lessons, resources, and AI tutor assistance.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {course.isEnrolled ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Your Progress</span>
                        <span className="text-primary">{progress?.progressPercentage || 0}%</span>
                      </div>
                      <Progress value={progress?.progressPercentage || 0} />
                      <div className="text-xs text-muted-foreground">
                        {progress?.completedLessonsCount || 0} of {progress?.totalLessons || totalLessonsCount} lessons completed
                      </div>

                      {firstLesson && (
                        <Link
                          href={`/courses/${course.slug}/lessons/${firstLesson.id}`}
                          className="w-full block"
                        >
                          <Button className="w-full space-x-2">
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
                        className="w-full text-base py-5 font-semibold shadow-md"
                      >
                        {isEnrolling ? 'Enrolling...' : 'Enroll Now'}
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2.5 border-t border-border/40 pt-4 text-xs text-muted-foreground">
                    <div className="flex items-center space-x-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span>{course.modules.length} Modules &bull; {totalLessonsCount} Lessons</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>Context-Aware AI Tutor Grounding</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span>Certificate of Completion Eligible</span>
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
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Course Curriculum</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {course.modules.length} modules &bull; {totalLessonsCount} lessons
            </p>
          </div>

          <div className="space-y-4">
            {course.modules.map((moduleItem, index) => (
              <Card key={moduleItem.id} className="border-border/60">
                <CardHeader className="py-4 px-6 bg-muted/30 rounded-t-xl">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">
                      Module {index + 1}: {moduleItem.title}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {moduleItem.lessons?.length || 0} lessons
                    </span>
                  </div>
                  {moduleItem.description && (
                    <CardDescription className="text-xs">{moduleItem.description}</CardDescription>
                  )}
                </CardHeader>

                <CardContent className="p-0 divide-y divide-border/40">
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
                        <div className="flex items-center space-x-3">
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          ) : lesson.type === 'VIDEO' ? (
                            <PlayCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}

                          <span className={`text-sm font-medium ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                            {lesson.title}
                          </span>

                          {lesson.isFreePreview && !course.isEnrolled && (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                              Free Preview
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                          {lesson.videoDuration ? (
                            <span className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
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
