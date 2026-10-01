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
            className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Courses</span>
          </Link>

          <Card className="rounded-lg border-border shadow-sm bg-card overflow-hidden">
            <CardHeader className="space-y-1.5 p-6 sm:p-8 border-b border-border bg-[#FFFDF8]">
              <div className="inline-flex items-center space-x-2 rounded-md border border-[#E53935]/30 bg-[#FDE8E7] px-3 py-1 text-xs font-bold text-[#B91C1C] w-fit mb-1">
                <Layers className="h-3.5 w-3.5" />
                <span>Step 1: Course Overview</span>
              </div>
              <CardTitle className="font-display text-2xl sm:text-3xl font-extrabold text-foreground">Create New Course</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Set up your course metadata and pricing. You will be able to organize curriculum modules, add video lessons, and configure quizzes in the next step.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 sm:p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-md bg-destructive/10 p-4 text-xs text-destructive font-medium border border-destructive/20">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Course Title</label>
                  <Input
                    placeholder="e.g. Master Modern Distributed Systems"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-md"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Short Summary (Optional)</label>
                  <Input
                    placeholder="Brief 1-2 sentence preview for cards and search..."
                    value={shortSummary}
                    onChange={(e) => setShortSummary(e.target.value)}
                    className="rounded-md"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground uppercase tracking-wider">Full Course Description</label>
                  <Textarea
                    placeholder="Detailed explanation of what students will learn, prerequisites, and key outcomes..."
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="rounded-md"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider">Difficulty Level</label>
                    <select
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3.5 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
                      value={level}
                      onChange={(e) => setLevel(e.target.value as any)}
                    >
                      <option value="BEGINNER">Beginner</option>
                      <option value="INTERMEDIATE">Intermediate</option>
                      <option value="ADVANCED">Advanced</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider">Price (USD)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 for free"
                      value={price}
                      onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                      className="rounded-md font-mono"
                    />
                  </div>
                </div>

                <div className="pt-5 border-t border-border flex justify-end gap-3">
                  <Link href="/instructor/courses">
                    <Button type="button" variant="outline" className="rounded-md font-semibold border-border">
                      Cancel
                    </Button>
                  </Link>
                  <Button type="submit" disabled={isLoading} className="rounded-md font-semibold px-6 bg-[#111111] text-white hover:bg-black shadow-xs">
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
