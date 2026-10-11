import type {
  OnboardingInput,
  StudentMeDto,
  StudentProfileDto,
  SubjectKey,
  UpdateStudentProfileInput
} from '@edplatform/shared';
import type { StudentProfile, StudentSubject } from '@prisma/client';
import { prisma } from '../config/prisma.config.js';
import { NotFoundError } from '../errors/app.error.js';

type ProfileWithSubjects = StudentProfile & { subjects: StudentSubject[] };

function toProfileDto(profile: ProfileWithSubjects): StudentProfileDto {
  return {
    id: profile.id,
    classLevel: profile.classLevel,
    board: profile.board,
    preferredLanguage: profile.preferredLanguage,
    preferredExplanationStyle: profile.preferredExplanationStyle,
    subjects: profile.subjects.map((s) => s.subject),
    onboardingCompletedAt: profile.onboardingCompletedAt
      ? profile.onboardingCompletedAt.toISOString()
      : null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}

export class StudentProfileService {
  /** Identity plus learning profile for the signed-in student. */
  public async getMe(userId: string): Promise<StudentMeDto> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: { include: { subjects: true } } }
    });

    if (!user) {
      throw new NotFoundError('Student account not found');
    }

    const profile = user.studentProfile ? toProfileDto(user.studentProfile) : null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      profile,
      isOnboarded: Boolean(profile?.onboardingCompletedAt)
    };
  }

  public async getProfile(userId: string): Promise<StudentProfileDto | null> {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: { subjects: true }
    });

    return profile ? toProfileDto(profile) : null;
  }

  /**
   * Completes (or re-runs) onboarding. Idempotent: running it again replaces the
   * stored answers, which is what the "change my class" flow needs.
   */
  public async completeOnboarding(
    userId: string,
    input: OnboardingInput
  ): Promise<StudentProfileDto> {
    const profile = await prisma.$transaction(async (tx) => {
      const saved = await tx.studentProfile.upsert({
        where: { userId },
        create: {
          userId,
          classLevel: input.classLevel,
          board: input.board,
          preferredLanguage: input.preferredLanguage,
          preferredExplanationStyle: input.preferredExplanationStyle,
          onboardingCompletedAt: new Date()
        },
        update: {
          classLevel: input.classLevel,
          board: input.board,
          preferredLanguage: input.preferredLanguage,
          preferredExplanationStyle: input.preferredExplanationStyle,
          onboardingCompletedAt: new Date()
        }
      });

      await this.replaceSubjects(tx, saved.id, input.subjects);

      return tx.studentProfile.findUniqueOrThrow({
        where: { id: saved.id },
        include: { subjects: true }
      });
    });

    return toProfileDto(profile);
  }

  /** Partial update from the "Me" screen. */
  public async updateProfile(
    userId: string,
    input: UpdateStudentProfileInput
  ): Promise<StudentProfileDto> {
    const existing = await prisma.studentProfile.findUnique({ where: { userId } });

    if (!existing) {
      throw new NotFoundError('Finish onboarding before updating your preferences');
    }

    const profile = await prisma.$transaction(async (tx) => {
      await tx.studentProfile.update({
        where: { id: existing.id },
        data: {
          classLevel: input.classLevel,
          preferredLanguage: input.preferredLanguage,
          preferredExplanationStyle: input.preferredExplanationStyle
        }
      });

      if (input.subjects) {
        await this.replaceSubjects(tx, existing.id, input.subjects);
      }

      return tx.studentProfile.findUniqueOrThrow({
        where: { id: existing.id },
        include: { subjects: true }
      });
    });

    return toProfileDto(profile);
  }

  /**
   * Replaces the subject set. Delete-then-insert rather than a diff: the set is at
   * most four rows, and this keeps the stored set exactly equal to what was sent.
   */
  private async replaceSubjects(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    profileId: string,
    subjects: SubjectKey[]
  ): Promise<void> {
    await tx.studentSubject.deleteMany({ where: { profileId } });
    await tx.studentSubject.createMany({
      data: subjects.map((subject) => ({ profileId, subject }))
    });
  }
}

export const studentProfileService = new StudentProfileService();
