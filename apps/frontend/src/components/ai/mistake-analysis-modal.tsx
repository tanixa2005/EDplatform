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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-card rounded-lg border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4.5 bg-[#FFFDF8]">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 rounded-md bg-[#111111] text-white shadow-xs">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-display text-lg font-bold text-foreground">AI Mistake & Concept Diagnostic</h2>
                <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/30 bg-[#FDE8E7] rounded-md">
                  Gemini Powered
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Targeted conceptual explanations and personalized review recommendations
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-md"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6 bg-card">
          {isLoading && (
            <div className="py-20 flex flex-col items-center justify-center space-y-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="text-center">
                <p className="text-sm font-bold text-foreground">
                  Analyzing your quiz answers...
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Identifying conceptual misconceptions and compiling personalized study recommendations
                </p>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-5 text-destructive space-y-3 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
              <p className="text-sm font-semibold">{error}</p>
              <Button size="sm" variant="outline" onClick={loadAnalysis} className="mt-2 rounded-md border-border font-medium">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Retry Diagnostic
              </Button>
            </div>
          )}

          {analysis && !isLoading && (
            <>
              {/* General Feedback Summary Banner */}
              <div className="rounded-md border border-[#E7E3D8] bg-[#FFF3CD]/35 p-5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#7A5A00]">
                    Diagnostic Overview
                  </span>
                  <Badge
                    variant={analysis.passed ? 'default' : 'secondary'}
                    className={`text-xs font-bold rounded-md font-mono ${
                      analysis.passed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#FDE8E7] text-[#B91C1C] border border-[#E53935]/30'
                    }`}
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
                <div className="py-10 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">
                    <Award className="h-8 w-8" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-foreground">Flawless Performance!</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    You answered all questions correctly with 0 mistakes. You have demonstrated comprehensive mastery over all concepts tested in this lesson!
                  </p>
                </div>
              )}

              {/* Mistake Breakdowns */}
              {analysis.mistakes.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center space-x-2">
                    <span>Targeted Mistake Breakdown ({analysis.mistakes.length})</span>
                  </h3>

                  {analysis.mistakes.map((mistake, idx) => (
                    <Card key={idx} className="rounded-lg border-border shadow-xs overflow-hidden bg-card">
                      <div className="border-b border-border bg-[#FFFDF8] px-5 py-3.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground font-mono">
                          Question #{idx + 1}
                        </span>
                        <Badge variant="outline" className="text-[11px] capitalize font-bold border-[#E53935]/30 text-[#B91C1C] bg-[#FDE8E7] rounded-md">
                          {mistake.mistakeType.replace('_', ' ')}
                        </Badge>
                      </div>

                      <CardContent className="p-5 space-y-4 text-sm">
                        {/* Question Prompt */}
                        <div>
                          <p className="font-semibold text-foreground leading-relaxed">{mistake.questionText}</p>
                        </div>

                        {/* Answers comparison */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="rounded-md bg-[#FDE8E7] border border-[#E53935]/30 p-3">
                            <span className="font-bold text-[#B91C1C] block mb-1">Your Answer:</span>
                            <span className="text-foreground">{mistake.userAnswerText}</span>
                          </div>
                          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3">
                            <span className="font-bold text-emerald-800 block mb-1">Correct Answer:</span>
                            <span className="text-foreground font-semibold">{mistake.correctAnswerText}</span>
                          </div>
                        </div>

                        {/* Conceptual Diagnostic */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-xs font-bold text-muted-foreground flex items-center space-x-1.5">
                            <Lightbulb className="h-4 w-4 text-amber-600" />
                            <span>Why this matters & Explanation:</span>
                          </span>
                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5.5">
                            {mistake.explanation}
                          </p>
                        </div>

                        {/* Recommended Action */}
                        <div className="space-y-1.5 border-t border-border pt-3">
                          <span className="text-xs font-bold text-primary flex items-center space-x-1.5">
                            <BookOpen className="h-4 w-4" />
                            <span>Recommended Review:</span>
                          </span>
                          <p className="text-xs sm:text-sm text-foreground pl-5.5 leading-relaxed">
                            {mistake.recommendedAction}
                          </p>
                        </div>

                        {/* Practice Challenge Prompt */}
                        {mistake.practicePrompt && (
                          <div className="rounded-md border border-[#E7E3D8] bg-[#FFF3CD]/25 p-3.5 text-xs space-y-1">
                            <span className="font-bold text-amber-900 flex items-center space-x-1.5">
                              <HelpCircle className="h-4 w-4" />
                              <span>Practice Reflection Challenge:</span>
                            </span>
                            <p className="text-muted-foreground leading-relaxed pl-5.5">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-5">
                {analysis.strengths && analysis.strengths.length > 0 && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4.5 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center space-x-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
                  <div className="rounded-md border border-border bg-[#FFFDF8] p-4.5 space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center space-x-1.5">
                      <ArrowRight className="h-4 w-4 text-primary" />
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
        <div className="border-t border-border px-6 py-4 bg-[#FFFDF8] flex justify-end">
          <Button onClick={onClose} size="sm" className="rounded-md px-5 font-semibold bg-[#111111] text-white hover:bg-black">
            Close Diagnostic
          </Button>
        </div>
      </div>
    </div>
  );
}
