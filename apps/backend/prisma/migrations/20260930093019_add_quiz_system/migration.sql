-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timeLimitSeconds" INTEGER;

-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "earnedPoints" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "totalPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "score" SET DEFAULT 0,
ALTER COLUMN "isPassed" SET DEFAULT false,
ALTER COLUMN "answersJson" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QuizOption" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE';

-- CreateTable
CREATE TABLE "QuizAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionIds" JSONB NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "pointsAwarded" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizAnswer_attemptId_idx" ON "QuizAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "QuizAnswer_questionId_idx" ON "QuizAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAnswer_attemptId_questionId_key" ON "QuizAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Quiz_isPublished_idx" ON "Quiz"("isPublished");

-- CreateIndex
CREATE INDEX "QuizAttempt_status_idx" ON "QuizAttempt"("status");

-- CreateIndex
CREATE INDEX "QuizOption_sortOrder_idx" ON "QuizOption"("sortOrder");

-- CreateIndex
CREATE INDEX "QuizQuestion_sortOrder_idx" ON "QuizQuestion"("sortOrder");

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
