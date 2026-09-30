'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RotateCcw,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';
import { QuizAttemptResultDto } from '@edplatform/shared';

export default function QuizResultPage({
  params
}: {
  params: Promise<{ slug: string; lessonId: string; attemptId: string }>;
}) {
  const resolvedParams = React.use(params);
  const { slug, lessonId, attemptId } = resolvedParams;

  const [result, setResult] = useState<QuizAttemptResultDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadResult() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchApi<{ result: QuizAttemptResultDto }>(
          `/attempts/${attemptId}`
        );
        setResult(data.result);
      } catch (err: any) {
        setError(err.message || 'Failed to load attempt result');
      } finally {
        setIsLoading(false);
      }
    }
    loadResult();
  }, [attemptId]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Calculating quiz results...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <XCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Result Not Available</h2>
        <p className="mt-2 text-muted-foreground">{error || 'Could not load quiz result.'}</p>
        <Link href={`/courses/${slug}/lessons/${lessonId}`} className="mt-6 inline-block">
          <Button>Back to Lesson</Button>
        </Link>
      </div>
    );
  }

  const correctQuestionsCount = result.questions.filter((q) => q.isCorrect).length;
  const totalQuestions = result.questions.length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          {/* Header Back Link */}
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <Link
              href={`/courses/${slug}/lessons/${lessonId}`}
              className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span>Back to Lesson</span>
            </Link>

            <Link href={`/courses/${slug}/lessons/${lessonId}/quiz`}>
              <Button variant="outline" size="sm" className="space-x-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retake Quiz</span>
              </Button>
            </Link>
          </div>

          {/* Scorecard Hero */}
          <Card className="border-border/60 shadow-lg overflow-hidden">
            <div
              className={`p-6 sm:p-8 text-center border-b ${
                result.isPassed
                  ? 'bg-gradient-to-b from-emerald-500/10 via-background to-background border-emerald-500/20'
                  : 'bg-gradient-to-b from-destructive/10 via-background to-background border-destructive/20'
              }`}
            >
              <div
                className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-4 shadow-sm ${
                  result.isPassed
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-destructive/20 text-destructive'
                }`}
              >
                {result.isPassed ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                {result.isPassed ? 'Congratulations! You Passed!' : 'Keep Learning & Try Again'}
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                {result.isPassed
                  ? 'You demonstrated solid comprehension of this lesson.'
                  : 'Review the question explanations below and take another attempt to improve your score.'}
              </p>

              {/* Stats Strip */}
              <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
                <div className="p-3 rounded-xl bg-card border border-border/60">
                  <div className="text-xs text-muted-foreground">Your Score</div>
                  <div className={`text-2xl font-black mt-0.5 ${result.isPassed ? 'text-emerald-600' : 'text-destructive'}`}>
                    {result.score}%
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-card border border-border/60">
                  <div className="text-xs text-muted-foreground">Points Earned</div>
                  <div className="text-2xl font-bold text-foreground mt-0.5">
                    {result.earnedPoints} / {result.totalPoints}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-card border border-border/60">
                  <div className="text-xs text-muted-foreground">Correct Answers</div>
                  <div className="text-2xl font-bold text-foreground mt-0.5">
                    {correctQuestionsCount} / {totalQuestions}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-card border border-border/60">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-base font-bold mt-1.5">
                    <Badge variant={result.isPassed ? 'default' : 'destructive'} className="text-xs">
                      {result.isPassed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Question by Question Feedback */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Question-by-Question Review</h2>
              <span className="text-xs text-muted-foreground">
                {totalQuestions} questions evaluated
              </span>
            </div>

            <div className="space-y-4">
              {result.questions.map((q, idx) => (
                <Card
                  key={q.questionId}
                  className={`border transition-all shadow-sm ${
                    q.isCorrect ? 'border-emerald-500/30 bg-card' : 'border-destructive/30 bg-card'
                  }`}
                >
                  <CardHeader className="py-4 px-6 border-b border-border/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {idx + 1}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {q.type.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={q.isCorrect ? 'default' : 'destructive'}
                          className={`text-[10px] ${q.isCorrect ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}`}
                        >
                          {q.isCorrect ? `+${q.pointsAwarded} pts` : `0 / ${q.points} pts`}
                        </Badge>
                      </div>
                    </div>

                    <CardTitle className="text-base font-semibold pt-2 leading-relaxed">
                      {q.prompt}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-6 space-y-4">
                    {/* Options list */}
                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const isStudentSelected = q.selectedOptionIds.includes(opt.id);
                        const isCorrectOption = q.correctOptionIds.includes(opt.id);

                        let optStyle = 'border-border/40 bg-card/60 text-muted-foreground';
                        if (isCorrectOption) {
                          optStyle = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-medium';
                        } else if (isStudentSelected && !isCorrectOption) {
                          optStyle = 'border-destructive/50 bg-destructive/10 text-destructive line-through';
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between p-3 rounded-xl border text-xs sm:text-sm ${optStyle}`}
                          >
                            <div className="flex items-center space-x-2.5">
                              {isCorrectOption ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                              ) : isStudentSelected ? (
                                <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                              )}
                              <span>{opt.text}</span>
                            </div>

                            <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                              {isStudentSelected && (
                                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                                  Your Choice
                                </span>
                              )}
                              {isCorrectOption && (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                                  Correct
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1 text-xs">
                        <div className="flex items-center space-x-1.5 text-primary font-semibold">
                          <Info className="h-3.5 w-3.5" />
                          <span>Instructor Explanation</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed pl-5">
                          {q.explanation}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex justify-between border-t border-border/40 pt-6">
            <Link href={`/courses/${slug}/lessons/${lessonId}`}>
              <Button variant="outline">Back to Lesson</Button>
            </Link>

            <Link href={`/courses/${slug}/lessons/${lessonId}/quiz`}>
              <Button className="space-x-1.5">
                <RotateCcw className="h-4 w-4" />
                <span>Retake Quiz</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
