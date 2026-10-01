'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  PlayCircle,
  FileText,
  Eye,
  EyeOff,
  Layers,
  Clock,
  ExternalLink,
  Save,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';

interface LessonItem {
  id: string;
  title: string;
  type: 'VIDEO' | 'TEXT';
  videoUrl?: string;
  videoDuration?: number;
  content?: string;
  isFreePreview: boolean;
  sortOrder: number;
}

interface ModuleItem {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  lessons: LessonItem[];
}

interface CourseData {
  id: string;
  title: string;
  slug: string;
  description: string;
  isPublished: boolean;
  modules: ModuleItem[];
}

export default function CourseEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const courseId = resolvedParams.id;

  const [course, setCourse] = useState<CourseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New module state
  const [showAddModule, setShowAddModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [isSubmittingModule, setIsSubmittingModule] = useState(false);

  // New lesson modal state
  const [activeModuleForLesson, setActiveModuleForLesson] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newLessonType, setNewLessonType] = useState<'VIDEO' | 'TEXT'>('VIDEO');
  const [newLessonVideoUrl, setNewLessonVideoUrl] = useState('');
  const [newLessonDuration, setNewLessonDuration] = useState(120);
  const [newLessonContent, setNewLessonContent] = useState('');
  const [newLessonFreePreview, setNewLessonFreePreview] = useState(false);
  const [isSubmittingLesson, setIsSubmittingLesson] = useState(false);

  const loadCourse = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi<{ course: CourseData }>(`/courses/${courseId}`);
      setCourse(data.course);
    } catch (err: any) {
      setError(err.message || 'Failed to load course details');
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const handleTogglePublish = async () => {
    if (!course) return;
    try {
      await fetchApi(`/courses/${course.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: !course.isPublished })
      });
      await loadCourse();
    } catch (err: any) {
      setError(err.message || 'Failed to update publish status');
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim() || !course) return;

    try {
      setIsSubmittingModule(true);
      await fetchApi(`/courses/${course.id}/modules`, {
        method: 'POST',
        body: JSON.stringify({
          title: newModuleTitle.trim(),
          sortOrder: course.modules.length
        })
      });
      setNewModuleTitle('');
      setShowAddModule(false);
      await loadCourse();
    } catch (err: any) {
      setError(err.message || 'Failed to create module');
    } finally {
      setIsSubmittingModule(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Are you sure you want to delete this module and its lessons?')) return;
    try {
      await fetchApi(`/modules/${moduleId}`, { method: 'DELETE' });
      await loadCourse();
    } catch (err: any) {
      setError(err.message || 'Failed to delete module');
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModuleForLesson || !newLessonTitle.trim()) return;

    try {
      setIsSubmittingLesson(true);
      await fetchApi(`/modules/${activeModuleForLesson}/lessons`, {
        method: 'POST',
        body: JSON.stringify({
          title: newLessonTitle.trim(),
          type: newLessonType,
          videoUrl: newLessonType === 'VIDEO' ? newLessonVideoUrl.trim() : undefined,
          videoDuration: newLessonType === 'VIDEO' ? Number(newLessonDuration) : undefined,
          content: newLessonType === 'TEXT' ? newLessonContent.trim() : undefined,
          isFreePreview: newLessonFreePreview
        })
      });

      // Reset form
      setActiveModuleForLesson(null);
      setNewLessonTitle('');
      setNewLessonVideoUrl('');
      setNewLessonContent('');
      setNewLessonFreePreview(false);
      await loadCourse();
    } catch (err: any) {
      setError(err.message || 'Failed to create lesson');
    } finally {
      setIsSubmittingLesson(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    try {
      await fetchApi(`/lessons/${lessonId}`, { method: 'DELETE' });
      await loadCourse();
    } catch (err: any) {
      setError(err.message || 'Failed to delete lesson');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-16 animate-pulse space-y-6">
        <div className="h-8 w-1/3 bg-muted rounded-md" />
        <div className="h-40 bg-muted/60 rounded-lg" />
        <div className="h-64 bg-muted/60 rounded-lg" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <h2 className="font-display text-2xl font-bold text-foreground">Course Not Found</h2>
        <Link href="/instructor/courses" className="mt-4 inline-block">
          <Button className="rounded-md font-semibold">Back to Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 space-y-8">
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5 gap-4">
            <div className="flex items-center space-x-3.5">
              <Link href="/instructor/courses">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                    {course.title}
                  </h1>
                  <Badge
                    variant={course.isPublished ? 'default' : 'secondary'}
                    className={`text-[10px] font-bold rounded-md ${
                      course.isPublished ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {course.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium font-mono">
                  Curriculum Studio &bull; {course.modules.length} Modules &bull; {course.modules.reduce((acc, m) => acc + m.lessons.length, 0)} Total Lessons
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <Link href={`/courses/${course.slug}`} target="_blank">
                <Button variant="outline" size="sm" className="space-x-1.5 text-xs rounded-md font-semibold border-border">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Preview as Student</span>
                </Button>
              </Link>

              <Button
                variant={course.isPublished ? 'secondary' : 'default'}
                size="sm"
                onClick={handleTogglePublish}
                className={`space-x-1.5 text-xs rounded-md font-semibold ${
                  course.isPublished ? '' : 'bg-[#111111] text-white hover:bg-black'
                }`}
              >
                {course.isPublished ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Unpublish</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Publish Course</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-4 text-xs text-destructive font-medium border border-destructive/20">
              {error}
            </div>
          )}

          {/* Curriculum Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Curriculum Architecture</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Organize your course into structured modules, video lectures, and comprehension quizzes.
                </p>
              </div>

              {!showAddModule && (
                <Button
                  size="sm"
                  onClick={() => setShowAddModule(true)}
                  className="space-x-1.5 text-xs rounded-md font-semibold px-4 bg-[#111111] text-white hover:bg-black shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Module</span>
                </Button>
              )}
            </div>

            {/* Add Module Inline Form */}
            {showAddModule && (
              <Card className="rounded-lg border-border bg-[#FFFDF8] p-4 sm:p-5 shadow-xs">
                <CardHeader className="py-0 px-0 pb-3">
                  <CardTitle className="font-display text-sm font-bold text-foreground">Add New Curriculum Module</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <form onSubmit={handleCreateModule} className="flex gap-2">
                    <Input
                      placeholder="e.g. Module 1: System Foundations"
                      value={newModuleTitle}
                      onChange={(e) => setNewModuleTitle(e.target.value)}
                      className="h-10 text-xs rounded-md"
                      autoFocus
                      required
                    />
                    <Button type="submit" size="sm" disabled={isSubmittingModule} className="text-xs rounded-md font-semibold px-4 bg-[#111111] text-white hover:bg-black">
                      {isSubmittingModule ? 'Adding...' : 'Save Module'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddModule(false)}
                      className="text-xs rounded-md font-semibold"
                    >
                      Cancel
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Modules List */}
            {course.modules.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-lg bg-card p-8 shadow-xs">
                <Layers className="mx-auto h-10 w-10 text-primary mb-2" />
                <h3 className="font-display text-base font-bold text-foreground">No curriculum modules yet</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Start structuring your course syllabus by adding your first module.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowAddModule(true)}
                  className="mt-4 text-xs rounded-md font-semibold bg-[#111111] text-white hover:bg-black"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add First Module
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {course.modules.map((mod, idx) => (
                  <Card key={mod.id} className="rounded-lg border-border overflow-hidden shadow-xs bg-card">
                    {/* Module Header */}
                    <div className="bg-[#FFFDF8] p-4 sm:px-6 flex items-center justify-between border-b border-border">
                      <div className="flex items-center space-x-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-foreground text-xs font-bold font-mono border border-border">
                          {idx + 1}
                        </span>
                        <span className="font-display font-bold text-sm text-foreground">{mod.title}</span>
                        <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground font-mono rounded-md border-border">
                          {mod.lessons.length} lessons
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveModuleForLesson(mod.id)}
                          className="h-8 px-3 text-xs space-x-1.5 rounded-md font-semibold border-border"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Lesson</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteModule(mod.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive rounded-md"
                          title="Delete Module"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Lessons inside Module */}
                    <CardContent className="p-0 divide-y divide-border">
                      {mod.lessons.length === 0 ? (
                        <div className="p-5 text-center text-xs text-muted-foreground">
                          No lessons in this module. Click &quot;Add Lesson&quot; above to add lectures or notes.
                        </div>
                      ) : (
                        mod.lessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="p-3.5 px-6 flex items-center justify-between hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {lesson.type === 'VIDEO' ? (
                                <PlayCircle className="h-4 w-4 text-primary shrink-0" />
                              ) : (
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-xs font-semibold text-foreground">
                                {lesson.title}
                              </span>
                              {lesson.isFreePreview && (
                                <Badge variant="outline" className="text-[10px] font-bold text-emerald-800 border-emerald-500/30 bg-emerald-500/10 rounded-md">
                                  Free Preview
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                              {lesson.videoDuration ? (
                                <span className="flex items-center space-x-1 font-mono">
                                  <Clock className="h-3 w-3" />
                                  <span>{Math.round(lesson.videoDuration / 60)}m</span>
                                </span>
                              ) : null}

                              <Link href={`/instructor/lessons/${lesson.id}/quiz`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-[11px] space-x-1.5 rounded-md font-semibold border-border"
                                  title="Manage Quiz"
                                >
                                  <Award className="h-3 w-3 text-primary" />
                                  <span>Quiz</span>
                                </Button>
                              </Link>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteLesson(lesson.id)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-md"
                                title="Delete Lesson"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}

                      {/* Add Lesson Modal / Inline Drawer */}
                      {activeModuleForLesson === mod.id && (
                        <div className="p-5 sm:p-6 bg-[#FFFDF8] border-t border-border space-y-4">
                          <div className="flex items-center justify-between border-b border-border pb-2.5">
                            <span className="font-display text-xs font-bold text-foreground">
                              Add Lesson to {mod.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveModuleForLesson(null)}
                              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                            >
                              Close
                            </button>
                          </div>

                          <form onSubmit={handleCreateLesson} className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold uppercase tracking-wider text-foreground">Lesson Title</label>
                              <Input
                                placeholder="e.g. 01: System Core Concepts"
                                value={newLessonTitle}
                                onChange={(e) => setNewLessonTitle(e.target.value)}
                                className="h-9 text-xs rounded-md"
                                required
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3.5">
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-foreground">Lesson Type</label>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                                  value={newLessonType}
                                  onChange={(e) => setNewLessonType(e.target.value as any)}
                                >
                                  <option value="VIDEO">Video</option>
                                  <option value="TEXT">Text</option>
                                </select>
                              </div>

                              <div className="flex items-center space-x-2 pt-6">
                                <input
                                  type="checkbox"
                                  id={`preview-${mod.id}`}
                                  checked={newLessonFreePreview}
                                  onChange={(e) => setNewLessonFreePreview(e.target.checked)}
                                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                                />
                                <label htmlFor={`preview-${mod.id}`} className="text-xs font-semibold text-foreground cursor-pointer">
                                  Allow Free Preview
                                </label>
                              </div>
                            </div>

                            {newLessonType === 'VIDEO' ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                                <div className="sm:col-span-2 space-y-1.5">
                                  <label className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                                    Video URL (Direct MP4 / Stream)
                                  </label>
                                  <Input
                                    placeholder="https://example.com/videos/sample.mp4"
                                    value={newLessonVideoUrl}
                                    onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                                    className="h-9 text-xs rounded-md"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                                    Duration (Seconds)
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={newLessonDuration}
                                    onChange={(e) => setNewLessonDuration(parseInt(e.target.value) || 0)}
                                    className="h-9 text-xs rounded-md font-mono"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-foreground">Lesson Content</label>
                                <Textarea
                                  placeholder="Write lesson notes, markdown content, or reading material..."
                                  rows={4}
                                  value={newLessonContent}
                                  onChange={(e) => setNewLessonContent(e.target.value)}
                                  className="text-xs rounded-md"
                                />
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveModuleForLesson(null)}
                                className="h-9 text-xs rounded-md font-semibold"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isSubmittingLesson}
                                className="h-9 text-xs space-x-1.5 rounded-md font-semibold px-4 bg-[#111111] text-white hover:bg-black"
                              >
                                <Save className="h-3.5 w-3.5 text-white" />
                                <span>{isSubmittingLesson ? 'Saving...' : 'Add Lesson'}</span>
                              </Button>
                            </div>
                          </form>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
