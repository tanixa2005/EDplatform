'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Award,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';
import {
  QuizDetailStudentDto,
  QuizAttemptSummaryDto,
  QuestionType
} from '@edplatform/shared';

export default function QuizPlayerPage({
  params
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const resolvedParams = React.use(params);
  const { slug, lessonId } = resolvedParams;
  const router = useRouter();

  const [quiz, setQuiz] = useState<QuizDetailStudentDto | null>(null);
  const [activeAttempt, setActiveAttempt] = useState<QuizAttemptSummaryDto | null>(null);
  const [attemptsHistory, setAttemptsHistory] = useState<QuizAttemptSummaryDto[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load quiz, history, and active attempt
  const loadQuizData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const quizData = await fetchApi<{ quiz: QuizDetailStudentDto }>(
        `/lessons/${lessonId}/quiz`
      );
      if (!quizData?.quiz) {
        setError('No quiz found for this lesson.');
        setIsLoading(false);
        return;
      }
      setQuiz(quizData.quiz);

      // Check active attempt
      const attemptData = await fetchApi<{ attempt: QuizAttemptSummaryDto | null }>(
        `/quizzes/${quizData.quiz.id}/attempts/active`
      );
      setActiveAttempt(attemptData?.attempt || null);

      if (attemptData?.attempt?.remainingSeconds !== undefined) {
        setRemainingSeconds(attemptData.attempt.remainingSeconds);
      }

      // Load attempt history
      const historyData = await fetchApi<{ attempts: QuizAttemptSummaryDto[] }>(
        `/quizzes/${quizData.quiz.id}/attempts`
      );
      setAttemptsHistory(historyData?.attempts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load quiz');
    } finally {
      setIsLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    loadQuizData();
  }, [loadQuizData]);

  // Handle countdown timer
  useEffect(() => {
    if (remainingSeconds === null || remainingSeconds <= 0 || !activeAttempt) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSubmitQuiz(true); // Auto-submit when time expires
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, activeAttempt]);

  const handleStartAttempt = async () => {
    if (!quiz) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchApi<{ attempt: QuizAttemptSummaryDto }>(
        `/quizzes/${quiz.id}/attempts`,
        { method: 'POST' }
      );
      setActiveAttempt(res.attempt);
      setAnswers({});
      setCurrentQuestionIndex(0);
      if (res.attempt.remainingSeconds) {
        setRemainingSeconds(res.attempt.remainingSeconds);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start quiz attempt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = (questionId: string, optionId: string, type: QuestionType) => {
    setAnswers((prev) => {
      const current = prev[questionId] || [];
      if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
        return { ...prev, [questionId]: [optionId] };
      }
      // MULTIPLE_CHOICE: toggle option
      if (current.includes(optionId)) {
        return { ...prev, [questionId]: current.filter((id) => id !== optionId) };
      } else {
        return { ...prev, [questionId]: [...current, optionId] };
      }
    });
  };

  const handleSubmitQuiz = async (force: boolean = false) => {
    if (!activeAttempt || (!force && isSubmitting)) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const formattedAnswers = Object.entries(answers).map(([qId, optIds]) => ({
        questionId: qId,
        selectedOptionIds: optIds
      }));

      const res = await fetchApi<{ result: { id: string } }>(
        `/attempts/${activeAttempt.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: formattedAnswers })
        }
      );

      router.push(`/courses/${slug}/lessons/${lessonId}/quiz/results/${res.result.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit quiz');
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading quiz environment...</p>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="mt-4 text-2xl font-bold text-foreground">Quiz Unavailable</h2>
        <p className="mt-2 text-muted-foreground">{error || 'Quiz is not available for this lesson.'}</p>
        <Link href={`/courses/${slug}/lessons/${lessonId}`} className="mt-6 inline-block">
          <Button>Back to Lesson</Button>
        </Link>
      </div>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.length > 0).length;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
  const bestAttempt = attemptsHistory.find((a) => a.isPassed) || attemptsHistory[0];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background py-8">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <Link
              href={`/courses/${slug}/lessons/${lessonId}`}
              className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              <span>Back to Lesson</span>
            </Link>

            {activeAttempt && remainingSeconds !== null && (
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-destructive/10 text-destructive font-mono text-xs font-semibold border border-destructive/20 animate-pulse">
                <Clock className="h-3.5 w-3.5" />
                <span>Time Remaining: {formatTime(remainingSeconds)}</span>
              </div>
            )}
          </div>

          {/* VIEW 1: Quiz Intro / Start Card */}
          {!activeAttempt ? (
            <div className="space-y-6">
              <Card className="border-border/60 shadow-lg">
                <CardHeader className="space-y-3">
                  <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary w-fit">
                    <Award className="h-3.5 w-3.5" />
                    <span>Lesson Knowledge Check</span>
                  </div>
                  <CardTitle className="text-3xl font-extrabold">{quiz.title}</CardTitle>
                  {quiz.description && (
                    <CardDescription className="text-base text-muted-foreground">
                      {quiz.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Key Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/30 border border-border/40">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Questions</span>
                      <div className="text-lg font-bold text-foreground">{quiz.questionsCount}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Total Points</span>
                      <div className="text-lg font-bold text-foreground">{quiz.totalPoints}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Passing Score</span>
                      <div className="text-lg font-bold text-foreground">{quiz.passingScore}%</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Time Limit</span>
                      <div className="text-lg font-bold text-foreground">
                        {quiz.timeLimitSeconds ? `${Math.round(quiz.timeLimitSeconds / 60)} mins` : 'No Limit'}
                      </div>
                    </div>
                  </div>

                  {bestAttempt && (
                    <div className="rounded-xl border border-border/40 p-4 flex items-center justify-between bg-card">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${bestAttempt.isPassed ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                          <Award className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            Previous Attempt Result: {bestAttempt.score}%
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Status: {bestAttempt.isPassed ? 'Passed' : 'Not Passed'} &bull; {new Date(bestAttempt.startedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/courses/${slug}/lessons/${lessonId}/quiz/results/${bestAttempt.id}`}
                      >
                        <Button variant="outline" size="sm" className="text-xs">
                          Review Attempt
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex justify-between border-t border-border/40 pt-6">
                  <Link href={`/courses/${slug}/lessons/${lessonId}`}>
                    <Button variant="ghost">Return to Lesson</Button>
                  </Link>

                  <Button onClick={handleStartAttempt} className="space-x-2 text-base px-6">
                    <Play className="h-4 w-4 fill-current" />
                    <span>{attemptsHistory.length > 0 ? 'Retake Quiz' : 'Start Quiz'}</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Attempt History Table */}
              {attemptsHistory.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Attempt History</h3>
                  <div className="divide-y divide-border/40 rounded-xl border border-border/40 bg-card overflow-hidden">
                    {attemptsHistory.map((att, idx) => (
                      <div key={att.id} className="p-3.5 px-4 flex items-center justify-between text-xs hover:bg-muted/20">
                        <div className="flex items-center space-x-3">
                          <span className="font-semibold text-muted-foreground">#{attemptsHistory.length - idx}</span>
                          <div>
                            <span className="font-bold text-foreground">{att.score}%</span>
                            <span className="text-muted-foreground ml-2">({att.earnedPoints}/{att.totalPoints} pts)</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <Badge
                            variant={att.isPassed ? 'default' : 'secondary'}
                            className={`text-[10px] ${att.isPassed ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}`}
                          >
                            {att.isPassed ? 'Passed' : 'Failed'}
                          </Badge>
                          <span className="text-muted-foreground">{new Date(att.startedAt).toLocaleDateString()}</span>
                          <Link href={`/courses/${slug}/lessons/${lessonId}/quiz/results/${att.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* VIEW 2: Active Quiz Player */
            <div className="space-y-6">
              {/* Progress & Question Index Header */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">
                    Question {currentQuestionIndex + 1} of {totalQuestions}
                  </span>
                  <span className="text-primary font-medium">
                    {answeredCount} of {totalQuestions} answered
                  </span>
                </div>
                <Progress value={progressPercent} />
              </div>

              {/* Question Navigation Bubbles */}
              <div className="flex flex-wrap gap-1.5 pb-2">
                {quiz.questions.map((q, idx) => {
                  const isAnswered = (answers[q.id]?.length || 0) > 0;
                  const isCurrent = idx === currentQuestionIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestionIndex(idx)}
                      className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${
                        isCurrent
                          ? 'border-2 border-primary bg-primary/10 text-primary shadow-sm'
                          : isAnswered
                          ? 'bg-secondary text-secondary-foreground'
                          : 'border border-border/60 text-muted-foreground hover:bg-muted/40'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Question Card */}
              {currentQuestion && (
                <Card className="border-border/60 shadow-md">
                  <CardHeader className="space-y-2 pb-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {currentQuestion.type === 'MULTIPLE_CHOICE'
                          ? 'Multiple Choice (Select all that apply)'
                          : currentQuestion.type === 'TRUE_FALSE'
                          ? 'True / False'
                          : 'Single Choice'}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-semibold">
                        {currentQuestion.points} {currentQuestion.points === 1 ? 'point' : 'points'}
                      </span>
                    </div>

                    <CardTitle className="text-lg sm:text-xl font-bold text-foreground leading-relaxed pt-1">
                      {currentQuestion.prompt}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-2">
                    {currentQuestion.options.map((option) => {
                      const selected = (answers[currentQuestion.id] || []).includes(option.id);
                      return (
                        <div
                          key={option.id}
                          onClick={() => handleSelectOption(currentQuestion.id, option.id, currentQuestion.type)}
                          className={`flex items-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                            selected
                              ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                              : 'border-border/60 bg-card hover:bg-muted/30 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div
                            className={`flex h-5 w-5 items-center justify-center mr-3 border transition-colors ${
                              currentQuestion.type === 'MULTIPLE_CHOICE' ? 'rounded-md' : 'rounded-full'
                            } ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
                          >
                            {selected && (
                              <div
                                className={`${
                                  currentQuestion.type === 'MULTIPLE_CHOICE'
                                    ? 'h-2.5 w-2.5 bg-primary-foreground rounded-sm'
                                    : 'h-2 w-2 bg-primary-foreground rounded-full'
                                }`}
                              />
                            )}
                          </div>

                          <span className="text-sm font-medium leading-normal">{option.text}</span>
                        </div>
                      );
                    })}
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t border-border/40 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                      className="space-x-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </Button>

                    <div className="flex items-center space-x-2">
                      {currentQuestionIndex < totalQuestions - 1 ? (
                        <Button
                          size="sm"
                          onClick={() => setCurrentQuestionIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
                          className="space-x-1"
                        >
                          <span>Next</span>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setShowConfirmSubmit(true)}
                          className="space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Finish & Submit</span>
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              )}

              {/* Submit Button & Confirmation Modal */}
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirmSubmit(true)}
                  className="space-x-1.5"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Submit Attempt ({answeredCount}/{totalQuestions} Answered)</span>
                </Button>
              </div>

              {/* Confirmation Dialog */}
              {showConfirmSubmit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <Card className="max-w-md w-full border-border/60 shadow-2xl animate-in fade-in-50 zoom-in-95">
                    <CardHeader>
                      <CardTitle className="text-lg">Submit Quiz Attempt?</CardTitle>
                      <CardDescription>
                        You have answered {answeredCount} of {totalQuestions} questions. Once submitted, you cannot change your answers.
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowConfirmSubmit(false)}
                      >
                        Continue Quiz
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleSubmitQuiz(false)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {isSubmitting ? 'Evaluating...' : 'Confirm Submission'}
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
