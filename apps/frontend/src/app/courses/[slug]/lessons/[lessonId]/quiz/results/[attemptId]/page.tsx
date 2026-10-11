'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  ArrowLeft,
  RotateCcw,
  Info,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { fetchApi } from '@/lib/api';
import { useStudent } from '@/context/student-context';
import { MistakeAnalysisModal } from '@/components/ai/mistake-analysis-modal';
import { QuizAttemptResultDto } from '@edplatform/shared';

export default function QuizResultPage({
  params
}: {
  params: Promise<{ slug: string; lessonId: string; attemptId: string }>;
}) {
  const resolvedParams = React.use(params);
  const { slug, lessonId, attemptId } = resolvedParams;

  const { isLoaded: authLoaded } = useStudent();

  const [result, setResult] = useState<QuizAttemptResultDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // Wait for the auth context before fetching. React runs child effects before
  // parent effects, so on mount this ran before StudentProvider registered the
  // Clerk token getter and the request went out unauthenticated. Until C6/C7
  // those anonymous reads succeeded through isFreePreview, which is why this
  // never surfaced; now they are correctly refused, and with no retry the page
  // was left showing "Sign in" to a signed-in student.
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
    if (authLoaded) loadResult();
  }, [attemptId, authLoaded]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Marking your answers&hellip;</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <XCircle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">We could not load this</h2>
        <p className="mt-2 text-muted-foreground">
          {error || 'These results are not available.'}
        </p>
        <Link href={`/courses/${slug}/lessons/${lessonId}`} className="mt-6 inline-block">
          <Button>Back to the topic</Button>
        </Link>
      </div>
    );
  }

  const correctQuestionsCount = result.questions.filter((q) => q.isCorrect).length;
  const totalQuestions = result.questions.length;

  return (
    <>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          {/* Header Back Link & Navigation */}
          <div className="flex items-center justify-between border-b border-border/70 pb-4">
            <Link
              href={`/courses/${slug}/lessons/${lessonId}`}
              className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to the topic</span>
            </Link>

            <Link href={`/courses/${slug}/lessons/${lessonId}/quiz`}>
              <Button variant="outline" size="sm" className="rounded-md space-x-1.5 text-xs font-semibold shadow-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Try again</span>
              </Button>
            </Link>
          </div>

          {/* Scorecard Hero */}
          <Card className="rounded-lg border-border shadow-sm overflow-hidden bg-card">
            <div
              className={`p-6 sm:p-10 text-center border-b ${
                result.isPassed
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-accent/40 border-primary/20'
              }`}
            >
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-md mb-5 shadow-xs ${
                  result.isPassed
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-accent text-accent-foreground border border-primary/30'
                }`}
              >
                {result.isPassed ? <CheckCircle2 className="h-7 w-7" /> : <RotateCcw className="h-7 w-7" />}
              </div>

              {/* Deliberately no praise and no verdict on the student. This
                  reports what happened and says what is worth doing next.
                  "Outstanding! You Passed!" and "You demonstrated solid
                  comprehension" were neither true nor useful to a twelve year
                  old who got three of five right. */}
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                {correctQuestionsCount} out of {totalQuestions} right
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
                {correctQuestionsCount === totalQuestions
                  ? 'All of them. Nothing to go back over here.'
                  : result.isPassed
                    ? 'The ones you missed are below, with why.'
                    : 'Have a look at what went wrong below, then try it again.'}
              </p>

              <p className="mt-4 font-mono text-sm font-semibold text-muted-foreground">
                {result.score}%
              </p>

              {/* The useful next action, and only when there is something to
                  ask about. Offering "analyse my mistakes" to a student who
                  made none is noise. */}
              {correctQuestionsCount < totalQuestions && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={() => setDiagnosticOpen(true)}
                    className="rounded-md px-5 py-2.5 font-semibold space-x-2 bg-solid hover:bg-solid-hover text-solid-foreground shadow-xs"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Ask ED about the ones I missed</span>
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Question by Question Feedback */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Your answers</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  What you picked, what was right, and why.
                </p>
              </div>
              <Badge variant="outline" className="text-xs font-mono rounded-md border-border">
                {totalQuestions} questions
              </Badge>
            </div>

            <div className="space-y-4">
              {result.questions.map((q, idx) => (
                <Card
                  key={q.questionId}
                  className={`rounded-lg border transition-all shadow-xs overflow-hidden bg-card ${
                    q.isCorrect ? 'border-emerald-500/40' : 'border-primary/40'
                  }`}
                >
                  <CardHeader className="py-4 px-6 border-b border-border bg-background">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted border border-border text-xs font-bold text-foreground font-mono">
                          {idx + 1}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider rounded-md border-border">
                          {q.type.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={q.isCorrect ? 'default' : 'secondary'}
                          className={`text-xs font-bold rounded-md ${
                            q.isCorrect
                              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                              : 'bg-accent text-accent-foreground border border-primary/30'
                          }`}
                        >
                          {q.isCorrect ? `+${q.pointsAwarded} pts` : `0 / ${q.points} pts`}
                        </Badge>
                      </div>
                    </div>

                    <CardTitle className="text-base font-semibold pt-2.5 leading-relaxed text-foreground">
                      {q.prompt}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="p-6 space-y-4">
                    {/* Options list */}
                    <div className="space-y-2.5">
                      {q.options.map((opt) => {
                        const isStudentSelected = q.selectedOptionIds.includes(opt.id);
                        const isCorrectOption = q.correctOptionIds.includes(opt.id);

                        let optStyle = 'border-border bg-card text-muted-foreground';
                        if (isCorrectOption) {
                          optStyle = 'border-emerald-600/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 font-medium shadow-2xs';
                        } else if (isStudentSelected && !isCorrectOption) {
                          optStyle = 'border-primary/50 bg-accent/60 text-accent-foreground line-through';
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center justify-between p-3.5 rounded-md border text-xs sm:text-sm transition-all ${optStyle}`}
                          >
                            <div className="flex items-center space-x-3">
                              {isCorrectOption ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                              ) : isStudentSelected ? (
                                <XCircle className="h-4 w-4 text-primary flex-shrink-0" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                              )}
                              <span>{opt.text}</span>
                            </div>

                            <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                              {isStudentSelected && (
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-muted border border-border text-foreground">
                                  Your Choice
                                </span>
                              )}
                              {isCorrectOption && (
                                <Badge variant="outline" className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border-emerald-500/40 bg-emerald-500/10 rounded-md">
                                  Correct Answer
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="rounded-md border border-cream bg-cream/30 p-4 space-y-1.5 text-xs">
                        <div className="flex items-center space-x-1.5 text-amber-900 dark:text-amber-300 font-bold">
                          <Info className="h-4 w-4" />
                          <span>Why</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed pl-5.5">
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
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Link href={`/courses/${slug}/lessons/${lessonId}`}>
              <Button variant="outline" className="rounded-md font-semibold border-border">
                Back to the topic
              </Button>
            </Link>

            <Link href={`/courses/${slug}/lessons/${lessonId}/quiz`}>
              <Button className="rounded-md font-semibold space-x-1.5 bg-solid text-solid-foreground hover:bg-solid-hover">
                <RotateCcw className="h-4 w-4" />
                <span>Try again</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <MistakeAnalysisModal
        attemptId={attemptId}
        isOpen={diagnosticOpen}
        onClose={() => setDiagnosticOpen(false)}
      />
    </>
  );
}
