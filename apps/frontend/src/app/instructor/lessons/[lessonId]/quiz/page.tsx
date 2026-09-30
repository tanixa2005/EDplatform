'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Eye,
  EyeOff,
  Award,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { fetchApi } from '@/lib/api';
import {
  QuizDetailInstructorDto,
  QuestionType
} from '@edplatform/shared';

export default function InstructorQuizEditorPage({
  params
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const resolvedParams = React.use(params);
  const { lessonId } = resolvedParams;

  const [quiz, setQuiz] = useState<QuizDetailInstructorDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quiz settings form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState(70);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | ''>('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Add Question state
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('SINGLE_CHOICE');
  const [questionPoints, setQuestionPoints] = useState(1);
  const [questionExplanation, setQuestionExplanation] = useState('');
  const [options, setOptions] = useState<{ text: string; isCorrect: boolean }[]>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false }
  ]);
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  const loadQuiz = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchApi<{ quiz: QuizDetailInstructorDto }>(
        `/lessons/${lessonId}/quiz`
      );
      if (data?.quiz) {
        setQuiz(data.quiz);
        setTitle(data.quiz.title);
        setDescription(data.quiz.description || '');
        setPassingScore(data.quiz.passingScore);
        setTimeLimitMinutes(
          data.quiz.timeLimitSeconds ? Math.round(data.quiz.timeLimitSeconds / 60) : ''
        );
      }
    } catch {
      // Quiz not yet created
    } finally {
      setIsLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const handleCreateOrUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setIsSavingSettings(true);
      setError(null);

      const timeLimitSeconds = timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null;

      if (!quiz) {
        // Create initial quiz
        const res = await fetchApi<{ quiz: QuizDetailInstructorDto }>(
          `/lessons/${lessonId}/quiz`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || undefined,
              passingScore: Number(passingScore),
              timeLimitSeconds
            })
          }
        );
        setQuiz(res.quiz);
      } else {
        // Update settings
        const res = await fetchApi<{ quiz: QuizDetailInstructorDto }>(
          `/quizzes/${quiz.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || undefined,
              passingScore: Number(passingScore),
              timeLimitSeconds
            })
          }
        );
        setQuiz(res.quiz);
      }
      await loadQuiz();
    } catch (err: any) {
      setError(err.message || 'Failed to save quiz settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!quiz) return;
    try {
      await fetchApi(`/quizzes/${quiz.id}/publish`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublished: !quiz.isPublished })
      });
      await loadQuiz();
    } catch (err: any) {
      setError(err.message || 'Failed to update publish state');
    }
  };

  const handleAddOption = () => {
    setOptions((prev) => [...prev, { text: '', isCorrect: false }]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleOptionTextChange = (index: number, text: string) => {
    setOptions((prev) => {
      const updated = [...prev];
      updated[index].text = text;
      return updated;
    });
  };

  const handleToggleOptionCorrect = (index: number) => {
    setOptions((prev) => {
      if (questionType === 'SINGLE_CHOICE' || questionType === 'TRUE_FALSE') {
        return prev.map((opt, idx) => ({
          ...opt,
          isCorrect: idx === index
        }));
      }
      // MULTIPLE_CHOICE allows toggling
      const updated = [...prev];
      updated[index].isCorrect = !updated[index].isCorrect;
      return updated;
    });
  };

  const handleTypeChange = (newType: QuestionType) => {
    setQuestionType(newType);
    if (newType === 'TRUE_FALSE') {
      setOptions([
        { text: 'True', isCorrect: true },
        { text: 'False', isCorrect: false }
      ]);
    } else if (options.length < 2) {
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false }
      ]);
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz || !questionPrompt.trim()) return;

    const hasCorrect = options.some((o) => o.isCorrect);
    if (!hasCorrect) {
      setError('At least one option must be marked as correct.');
      return;
    }

    try {
      setIsSubmittingQuestion(true);
      setError(null);

      await fetchApi(`/quizzes/${quiz.id}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          prompt: questionPrompt.trim(),
          type: questionType,
          points: Number(questionPoints) || 1,
          explanation: questionExplanation.trim() || undefined,
          sortOrder: quiz.questions?.length || 0,
          options: options.map((opt, idx) => ({
            text: opt.text.trim(),
            sortOrder: idx,
            isCorrect: opt.isCorrect
          }))
        })
      });

      // Reset form
      setShowAddQuestion(false);
      setQuestionPrompt('');
      setQuestionExplanation('');
      setQuestionPoints(1);
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false }
      ]);
      await loadQuiz();
    } catch (err: any) {
      setError(err.message || 'Failed to add question');
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await fetchApi(`/questions/${questionId}`, { method: 'DELETE' });
      await loadQuiz();
    } catch (err: any) {
      setError(err.message || 'Failed to delete question');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-16 animate-pulse space-y-6">
        <div className="h-8 w-1/3 bg-muted rounded" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
      <div className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          {/* Top Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5 gap-4">
            <div>
              <div className="inline-flex items-center space-x-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary mb-1">
                <Award className="h-3.5 w-3.5" />
                <span>Instructor Quiz Studio</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {quiz ? quiz.title : 'Create Lesson Quiz'}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure evaluation criteria, passing thresholds, and question options.
              </p>
            </div>

            {quiz && (
              <Button
                variant={quiz.isPublished ? 'secondary' : 'default'}
                size="sm"
                onClick={handleTogglePublish}
                className="space-x-1.5 text-xs"
              >
                {quiz.isPublished ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span>Unpublish Quiz</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span>Publish Quiz</span>
                  </>
                )}
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium border border-destructive/20">
              {error}
            </div>
          )}

          {/* Section 1: Quiz Settings Form */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="py-4 px-6 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Quiz Parameters & Scoring</CardTitle>
            </CardHeader>

            <CardContent className="p-6">
              <form onSubmit={handleCreateOrUpdateSettings} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Quiz Title</label>
                  <Input
                    placeholder="e.g. Lesson 1 Comprehension Check"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
                  <Textarea
                    placeholder="Brief instructions or overview for students..."
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Passing Score (%)</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={passingScore}
                      onChange={(e) => setPassingScore(parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Time Limit (Minutes, leave blank for unlimited)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 10"
                      value={timeLimitMinutes}
                      onChange={(e) =>
                        setTimeLimitMinutes(e.target.value ? parseInt(e.target.value) : '')
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" size="sm" disabled={isSavingSettings} className="space-x-1.5">
                    <Save className="h-3.5 w-3.5" />
                    <span>{isSavingSettings ? 'Saving...' : quiz ? 'Update Settings' : 'Create Quiz'}</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Section 2: Questions Management */}
          {quiz && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Questions ({quiz.questions?.length || 0})</h2>
                  <p className="text-xs text-muted-foreground">
                    Total Possible Points: {quiz.totalPoints}
                  </p>
                </div>

                {!showAddQuestion && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddQuestion(true)}
                    className="space-x-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Question</span>
                  </Button>
                )}
              </div>

              {/* Add Question Card */}
              {showAddQuestion && (
                <Card className="border-primary/40 shadow-md bg-muted/10">
                  <CardHeader className="py-4 px-6 border-b border-border/40">
                    <CardTitle className="text-base font-semibold">New Question</CardTitle>
                  </CardHeader>

                  <CardContent className="p-6">
                    <form onSubmit={handleCreateQuestion} className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-foreground">Question Prompt</label>
                        <Textarea
                          placeholder="e.g. Which of the following statements is true regarding static typing?"
                          rows={2}
                          value={questionPrompt}
                          onChange={(e) => setQuestionPrompt(e.target.value)}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">Question Type</label>
                          <select
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                            value={questionType}
                            onChange={(e) => handleTypeChange(e.target.value as QuestionType)}
                          >
                            <option value="SINGLE_CHOICE">Single Choice (1 correct answer)</option>
                            <option value="MULTIPLE_CHOICE">Multiple Choice (Multiple correct answers)</option>
                            <option value="TRUE_FALSE">True / False</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">Points</label>
                          <Input
                            type="number"
                            min="1"
                            value={questionPoints}
                            onChange={(e) => setQuestionPoints(parseInt(e.target.value) || 1)}
                          />
                        </div>
                      </div>

                      {/* Options Builder */}
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-foreground">
                            Options (Select which option is correct)
                          </label>
                          {questionType !== 'TRUE_FALSE' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleAddOption}
                              className="text-xs h-7"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Option
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {options.map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleOptionCorrect(idx)}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
                                  opt.isCorrect
                                    ? 'bg-emerald-500 text-white border-emerald-600'
                                    : 'border-border text-muted-foreground hover:bg-muted'
                                }`}
                                title={opt.isCorrect ? 'Correct option' : 'Click to mark correct'}
                              >
                                {opt.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                              </button>

                              <Input
                                placeholder={`Option ${idx + 1} text`}
                                value={opt.text}
                                onChange={(e) => handleOptionTextChange(idx, e.target.value)}
                                className="h-9 text-xs flex-1"
                                required
                              />

                              {questionType !== 'TRUE_FALSE' && options.length > 2 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveOption(idx)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1 pt-2">
                        <label className="text-xs font-semibold text-foreground">
                          Explanation (Revealed to student after quiz submission)
                        </label>
                        <Textarea
                          placeholder="Explain why the correct answer is right and common misconceptions..."
                          rows={2}
                          value={questionExplanation}
                          onChange={(e) => setQuestionExplanation(e.target.value)}
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAddQuestion(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={isSubmittingQuestion}>
                          {isSubmittingQuestion ? 'Saving...' : 'Save Question'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              {/* Questions List */}
              {quiz.questions?.length === 0 ? (
                <div className="p-12 text-center border border-dashed rounded-xl bg-muted/10">
                  <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/60" />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">No questions yet</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &quot;Add Question&quot; above to create your first quiz question.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quiz.questions?.map((q, idx) => (
                    <Card key={q.id} className="border-border/60 shadow-sm">
                      <CardHeader className="py-3 px-5 flex flex-row items-center justify-between bg-muted/20 border-b border-border/40">
                        <div className="flex items-center space-x-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {q.type.replace('_', ' ')} &bull; {q.points} {q.points === 1 ? 'pt' : 'pts'}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </CardHeader>

                      <CardContent className="p-4 space-y-3">
                        <p className="text-sm font-medium text-foreground">{q.prompt}</p>

                        <div className="space-y-1.5 pl-2">
                          {q.options.map((opt) => (
                            <div
                              key={opt.id}
                              className={`flex items-center space-x-2 text-xs p-1.5 rounded-md ${
                                opt.isCorrect
                                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {opt.isCorrect ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                              ) : (
                                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 flex-shrink-0 ml-1" />
                              )}
                              <span>{opt.text}</span>
                            </div>
                          ))}
                        </div>

                        {q.explanation && (
                          <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/40">
                            <span className="font-semibold text-foreground">Explanation: </span>
                            {q.explanation}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
