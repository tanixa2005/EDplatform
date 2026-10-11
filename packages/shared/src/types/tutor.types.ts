import type { ClassLevel, SubjectKey } from './student.types.js';

export type TutorRole = 'STUDENT' | 'ED';
export type TutorInputKind = 'TEXT' | 'IMAGE' | 'AUDIO';

/**
 * Quick actions the student can tap instead of typing. These map to prompt
 * directives in the backend prompt builder, not to different models.
 */
export type TutorQuickAction =
  | 'hint'
  | 'simpler'
  | 'real_example'
  | 'quiz_me'
  | 'still_confused';

export const TUTOR_QUICK_ACTIONS: TutorQuickAction[] = [
  'hint',
  'simpler',
  'real_example',
  'quiz_me',
  'still_confused'
];

export interface TutorMessageDto {
  id: string;
  role: TutorRole;
  inputKind: TutorInputKind;
  content: string;
  mode: TutorQuickAction | null;
  createdAt: string;
}

export interface TutorSessionSummaryDto {
  id: string;
  title: string;
  classLevel: ClassLevel;
  subject: SubjectKey | null;
  lessonId: string | null;
  messageCount: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface TutorSessionDetailDto extends TutorSessionSummaryDto {
  messages: TutorMessageDto[];
}
