export type ClassLevel = 'CLASS_6' | 'CLASS_7' | 'CLASS_8';
export type Board = 'CBSE';
export type SubjectKey = 'MATH' | 'SCIENCE' | 'SOCIAL_SCIENCE' | 'ENGLISH';
export type Language = 'ENGLISH' | 'HINDI' | 'HINGLISH';
export type ExplanationStyle = 'SIMPLE' | 'STEP_BY_STEP' | 'REAL_LIFE' | 'EXAM_FOCUSED';

/**
 * Everything the application knows about a student beyond their Clerk identity.
 * Deliberately narrow: no school, city, phone number, date of birth or address.
 * A field only belongs here if it changes how ED teaches.
 */
export interface StudentProfileDto {
  id: string;
  classLevel: ClassLevel;
  board: Board;
  preferredLanguage: Language;
  preferredExplanationStyle: ExplanationStyle;
  subjects: SubjectKey[];
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Identity plus learning profile, as returned by GET /me. */
export interface StudentMeDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  profile: StudentProfileDto | null;
  /** False until onboarding has been completed at least once. */
  isOnboarded: boolean;
}
