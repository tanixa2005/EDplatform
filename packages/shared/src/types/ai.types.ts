export type AITutorMode = 'study' | 'quiz';

export interface AIMessageHistory {
  role: 'user' | 'model';
  text: string;
}

export type MistakeCategory =
  | 'misconception'
  | 'calculation_error'
  | 'term_confusion'
  | 'incomplete_knowledge'
  | 'misread_question'
  | 'other';

export interface QuestionMistakeAnalysis {
  questionId: string;
  questionText: string;
  userAnswerText: string;
  correctAnswerText: string;
  concept: string;
  mistakeType: MistakeCategory;
  explanation: string;
  recommendedAction: string;
  practicePrompt: string;
  /**
   * Where "worth re-reading" points, when it can point anywhere.
   *
   * Both optional. They are absent when the resolved topic is unpublished or
   * unresolvable, and absent from every analysis cached before C13.3, so an
   * older cached result still parses and simply renders as plain text. Treat
   * missing ids as "not linkable", never as an error.
   *
   * Server-derived from the question's own topic. Never client-supplied.
   */
  topicLessonId?: string;
  topicCourseSlug?: string;
}

export interface QuizMistakeAnalysisResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  percentage: number;
  passed: boolean;
  totalQuestions: number;
  incorrectQuestionsCount: number;
  generalFeedback: string;
  mistakes: QuestionMistakeAnalysis[];
  strengths: string[];
  recommendedTopics: string[];
}
