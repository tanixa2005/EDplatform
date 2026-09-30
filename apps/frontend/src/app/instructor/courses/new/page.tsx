'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';

export default function NewCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [shortSummary, setShortSummary] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>('BEGINNER');
  const [price, setPrice] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApi<{ course: { id: string } }>('/courses', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          shortSummary: shortSummary.trim() || undefined,
          description: description.trim(),
          level,
          price: Number(price) || 0
        })
      });

      router.push(`/instructor/courses/${res.course.id}/edit`);
    } catch (err: any) {
      setError(err.message || 'Failed to create course');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
          <Link
            href="/instructor/courses"
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            <span>Back to Courses</span>
          </Link>

          <Card className="border-border/60 shadow-md">
            <CardHeader className="space-y-1">
              <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary w-fit mb-1">
                <Layers className="h-3.5 w-3.5" />
                <span>Step 1: Course Overview</span>
              </div>
              <CardTitle className="text-2xl font-bold">Create New Course</CardTitle>
              <CardDescription>
                Set up your course basics. You will be able to add modules and lessons next.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive font-medium border border-destructive/20">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Course Title</label>
                  <Input
                    placeholder="e.g. Master Modern Distributed Systems"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Short Summary (Optional)</label>
                  <Input
                    placeholder="Brief 1-2 sentence preview for cards and search..."
                    value={shortSummary}
                    onChange={(e) => setShortSummary(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Full Course Description</label>
                  <Textarea
                    placeholder="Detailed explanation of what students will learn, prerequisites, and key outcomes..."
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Difficulty Level</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={level}
                      onChange={(e) => setLevel(e.target.value as any)}
                    >
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="ADVANCED">Advanced</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Price (USD)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 for free"
                      value={price}
                      onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border/40 flex justify-end gap-3">
                  <Link href="/instructor/courses">
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Continue to Curriculum Builder'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
