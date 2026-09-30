'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  BookOpen,
  Award,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { fetchApi } from '@/lib/api';
import { QuizMistakeAnalysisResult } from '@edplatform/shared';

interface MistakeAnalysisModalProps {
  attemptId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function MistakeAnalysisModal({
  attemptId,
  isOpen,
  onClose,
}: MistakeAnalysisModalProps) {
  const [analysis, setAnalysis] = useState<QuizMistakeAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && attemptId) {
      loadAnalysis();
    }
  }, [isOpen, attemptId]);

  const loadAnalysis = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await fetchApi<QuizMistakeAnalysisResult>(
        '/ai/quiz/mistake-analysis',
        {
          method: 'POST',
          body: JSON.stringify({ attemptId }),
        }
      );

      setAnalysis(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze quiz mistakes';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-card/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-foreground">AI Mistake & Concept Diagnostic</h2>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                  Powered by Gemini
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Targeted feedback and practice recommendations for your attempt
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  Analyzing your quiz answers...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Identifying conceptual misconceptions and compiling personalized study recommendations
                </p>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive space-y-3 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
              <p className="text-sm font-medium">{error}</p>
              <Button size="sm" variant="outline" onClick={loadAnalysis} className="mt-2">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Retry Diagnostic
              </Button>
            </div>
          )}

          {analysis && !isLoading && (
            <>
              {/* General Feedback Summary Banner */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Diagnostic Overview
                  </span>
                  <Badge
                    variant={analysis.passed ? 'default' : 'destructive'}
                    className="text-xs"
                  >
                    Score: {analysis.score}/{analysis.totalQuestions} ({analysis.percentage}%)
                  </Badge>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {analysis.generalFeedback}
                </p>
              </div>

              {/* Perfect Score Celebration */}
              {analysis.mistakes.length === 0 && (
                <div className="py-8 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                    <Award className="h-8 w-8" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Flawless Performance!</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    You made 0 mistakes on this quiz. You have demonstrated comprehensive mastery over all questions and concepts tested!
                  </p>
                </div>
              )}

              {/* Mistake Breakdowns */}
              {analysis.mistakes.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-2">
                    <span>Targeted Mistake Breakdown ({analysis.mistakes.length})</span>
                  </h3>

                  {analysis.mistakes.map((mistake, idx) => (
                    <Card key={idx} className="border-border/70 shadow-sm overflow-hidden">
                      <div className="border-b border-border/60 bg-muted/30 px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Question #{idx + 1}
                        </span>
                        <Badge variant="outline" className="text-[11px] capitalize border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5">
                          {mistake.mistakeType.replace('_', ' ')}
                        </Badge>
                      </div>

                      <CardContent className="p-4 sm:p-5 space-y-4 text-sm">
                        {/* Question Prompt */}
                        <div>
                          <p className="font-semibold text-foreground">{mistake.questionText}</p>
                        </div>

                        {/* Answers comparison */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5">
                            <span className="font-semibold text-destructive block mb-1">Your Answer:</span>
                            <span className="text-foreground">{mistake.userAnswerText}</span>
                          </div>
                          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">Correct Answer:</span>
                            <span className="text-foreground font-medium">{mistake.correctAnswerText}</span>
                          </div>
                        </div>

                        {/* Conceptual Diagnostic */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-xs font-semibold text-muted-foreground flex items-center space-x-1.5">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                            <span>Why this matters & Explanation:</span>
                          </span>
                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
                            {mistake.explanation}
                          </p>
                        </div>

                        {/* Recommended Action */}
                        <div className="space-y-1.5 border-t border-border/40 pt-3">
                          <span className="text-xs font-semibold text-primary flex items-center space-x-1.5">
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Recommended Review:</span>
                          </span>
                          <p className="text-xs sm:text-sm text-foreground pl-5">
                            {mistake.recommendedAction}
                          </p>
                        </div>

                        {/* Practice Challenge Prompt */}
                        {mistake.practicePrompt && (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                            <span className="font-bold text-primary flex items-center space-x-1.5">
                              <HelpCircle className="h-3.5 w-3.5" />
                              <span>Practice Reflection Challenge:</span>
                            </span>
                            <p className="text-muted-foreground leading-relaxed pl-5">
                              {mistake.practicePrompt}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Strengths & Next Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border/60 pt-4">
                {analysis.strengths && analysis.strengths.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Demonstrated Strengths</span>
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-1.5 pl-5 list-disc">
                      {analysis.strengths.map((str, i) => (
                        <li key={i}>{str}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.recommendedTopics && analysis.recommendedTopics.length > 0 && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center space-x-1.5">
                      <ArrowRight className="h-4 w-4" />
                      <span>Recommended Topics</span>
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-1.5 pl-5 list-disc">
                      {analysis.recommendedTopics.map((topic, i) => (
                        <li key={i}>{topic}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 px-6 py-3.5 bg-card/80 flex justify-end">
          <Button onClick={onClose} size="sm">
            Close Diagnostic
          </Button>
        </div>
      </div>
    </div>
  );
}
