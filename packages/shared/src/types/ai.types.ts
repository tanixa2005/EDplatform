export type AITutorMode = 'study' | 'quiz';

export interface AIMessageHistory {
  role: 'user' | 'model';
  text: string;
}

export interface AITutorStreamRequest {
  lessonId: string;
  mode: AITutorMode;
  message: string;
  questionId?: string;
  history?: AIMessageHistory[];
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
