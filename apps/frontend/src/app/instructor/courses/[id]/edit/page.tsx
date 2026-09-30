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
  Save
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
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-40 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <h2 className="text-2xl font-bold">Course Not Found</h2>
        <Link href="/instructor/courses" className="mt-4 inline-block">
          <Button>Back to Courses</Button>
        </Link>
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 space-y-8">
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5 gap-4">
            <div className="flex items-center space-x-3">
              <Link href="/instructor/courses">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">
                    {course.title}
                  </h1>
                  <Badge variant={course.isPublished ? 'default' : 'secondary'} className="text-[10px]">
                    {course.isPublished ? 'Published' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Curriculum Builder &bull; {course.modules.length} Modules
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Link href={`/courses/${course.slug}`} target="_blank">
                <Button variant="outline" size="sm" className="space-x-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Preview as Student</span>
                </Button>
              </Link>

              <Button
                variant={course.isPublished ? 'secondary' : 'default'}
                size="sm"
                onClick={handleTogglePublish}
                className="space-x-1.5 text-xs"
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
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium border border-destructive/20">
              {error}
            </div>
          )}

          {/* Curriculum Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Curriculum Outline</h2>
                <p className="text-xs text-muted-foreground">
                  Organize your course into structured modules and lessons.
                </p>
              </div>

              {!showAddModule && (
                <Button
                  size="sm"
                  onClick={() => setShowAddModule(true)}
                  className="space-x-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Module</span>
                </Button>
              )}
            </div>

            {/* Add Module Inline Form */}
            {showAddModule && (
              <Card className="border-primary/40 bg-muted/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold">Add New Module</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <form onSubmit={handleCreateModule} className="flex gap-2">
                    <Input
                      placeholder="e.g. Module 1: Core Concepts"
                      value={newModuleTitle}
                      onChange={(e) => setNewModuleTitle(e.target.value)}
                      className="h-9 text-xs"
                      autoFocus
                      required
                    />
                    <Button type="submit" size="sm" disabled={isSubmittingModule} className="text-xs">
                      {isSubmittingModule ? 'Adding...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddModule(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Modules List */}
            {course.modules.length === 0 ? (
              <div className="text-center py-16 border border-dashed rounded-xl bg-muted/10">
                <Layers className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <h3 className="mt-3 text-sm font-semibold text-foreground">No modules yet</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Start structuring your course by adding your first module.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddModule(true)}
                  className="mt-4 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Module
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                {course.modules.map((mod, idx) => (
                  <Card key={mod.id} className="border-border/60 overflow-hidden shadow-sm">
                    {/* Module Header */}
                    <div className="bg-muted/40 p-4 flex items-center justify-between border-b border-border/40">
                      <div className="flex items-center space-x-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-sm text-foreground">{mod.title}</span>
                        <span className="text-xs text-muted-foreground">
                          ({mod.lessons.length} lessons)
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveModuleForLesson(mod.id)}
                          className="h-8 px-2.5 text-xs space-x-1"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Lesson</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteModule(mod.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Delete Module"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Lessons inside Module */}
                    <CardContent className="p-0 divide-y divide-border/30">
                      {mod.lessons.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          No lessons in this module. Click &quot;Add Lesson&quot; above to create one.
                        </div>
                      ) : (
                        mod.lessons.map((lesson) => (
                          <div
                            key={lesson.id}
                            className="p-3.5 px-5 flex items-center justify-between hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              {lesson.type === 'VIDEO' ? (
                                <PlayCircle className="h-4 w-4 text-primary" />
                              ) : (
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="text-xs font-medium text-foreground">
                                {lesson.title}
                              </span>
                              {lesson.isFreePreview && (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                                  Free Preview
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                              {lesson.videoDuration ? (
                                <span className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{Math.round(lesson.videoDuration / 60)}m</span>
                                </span>
                              ) : null}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteLesson(lesson.id)}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
                        <div className="p-5 bg-card/90 border-t border-primary/20 space-y-4">
                          <div className="flex items-center justify-between border-b border-border/40 pb-2">
                            <span className="text-xs font-bold text-foreground">
                              Add Lesson to {mod.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveModuleForLesson(null)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Close
                            </button>
                          </div>

                          <form onSubmit={handleCreateLesson} className="space-y-3.5">
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-foreground">Lesson Title</label>
                              <Input
                                placeholder="e.g. 01: Architecture Overview"
                                value={newLessonTitle}
                                onChange={(e) => setNewLessonTitle(e.target.value)}
                                className="h-8 text-xs"
                                required
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-foreground">Lesson Type</label>
                                <select
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                  value={newLessonType}
                                  onChange={(e) => setNewLessonType(e.target.value as any)}
                                >
                                  <option value="VIDEO">Video</option>
                                  <option value="TEXT">Text</option>
                                </select>
                              </div>

                              <div className="flex items-center space-x-2 pt-5">
                                <input
                                  type="checkbox"
                                  id={`preview-${mod.id}`}
                                  checked={newLessonFreePreview}
                                  onChange={(e) => setNewLessonFreePreview(e.target.checked)}
                                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                                />
                                <label htmlFor={`preview-${mod.id}`} className="text-xs font-medium text-foreground cursor-pointer">
                                  Free Preview
                                </label>
                              </div>
                            </div>

                            {newLessonType === 'VIDEO' ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2 space-y-1">
                                  <label className="text-[11px] font-semibold text-foreground">
                                    Video URL (Direct MP4 / Stream)
                                  </label>
                                  <Input
                                    placeholder="https://example.com/videos/sample.mp4"
                                    value={newLessonVideoUrl}
                                    onChange={(e) => setNewLessonVideoUrl(e.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[11px] font-semibold text-foreground">
                                    Duration (Seconds)
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={newLessonDuration}
                                    onChange={(e) => setNewLessonDuration(parseInt(e.target.value) || 0)}
                                    className="h-8 text-xs"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold text-foreground">Lesson Content</label>
                                <Textarea
                                  placeholder="Write lesson notes, markdown content, or reading material..."
                                  rows={4}
                                  value={newLessonContent}
                                  onChange={(e) => setNewLessonContent(e.target.value)}
                                  className="text-xs"
                                />
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveModuleForLesson(null)}
                                className="h-8 text-xs"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isSubmittingLesson}
                                className="h-8 text-xs space-x-1"
                              >
                                <Save className="h-3 w-3" />
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
