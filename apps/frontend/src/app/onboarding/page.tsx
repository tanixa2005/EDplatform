'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import {
  AVAILABLE_LANGUAGES,
  CLASS_LEVELS,
  CLASS_LEVEL_LABELS,
  EXPLANATION_STYLE_HINTS,
  EXPLANATION_STYLE_LABELS,
  LANGUAGE_LABELS,
  SUBJECT_KEYS,
  SUBJECT_LABELS,
  type ClassLevel,
  type ExplanationStyle,
  type Language,
  type SubjectKey
} from '@edplatform/shared';
import { Button } from '@/components/ui/button';
import { useStudent } from '@/context/student-context';
import { fetchApi } from '@/lib/api';

const EXPLANATION_STYLES: ExplanationStyle[] = [
  'SIMPLE',
  'STEP_BY_STEP',
  'REAL_LIFE',
  'EXAM_FOCUSED'
];

const TOTAL_STEPS = 4;

/**
 * Four questions, nothing more.
 *
 * Deliberately absent: name, age, date of birth, school, city, phone number,
 * photo. A field only earns a place here if it changes how ED teaches.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { refresh, profile, isLoaded } = useStudent();

  const [step, setStep] = useState(1);
  const [classLevel, setClassLevel] = useState<ClassLevel | null>(profile?.classLevel ?? null);
  const [subjects, setSubjects] = useState<SubjectKey[]>(profile?.subjects ?? []);
  const [language, setLanguage] = useState<Language>(profile?.preferredLanguage ?? 'ENGLISH');
  const [style, setStyle] = useState<ExplanationStyle>(
    profile?.preferredExplanationStyle ?? 'SIMPLE'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSubject(subject: SubjectKey) {
    setSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
  }

  const canAdvance =
    (step === 1 && classLevel !== null) ||
    (step === 2 && subjects.length > 0) ||
    step === 3 ||
    step === 4;

  async function finish() {
    if (!classLevel || subjects.length === 0) return;

    setIsSaving(true);
    setError(null);

    try {
      await fetchApi('/me/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          classLevel,
          subjects,
          preferredLanguage: language,
          preferredExplanationStyle: style
        })
      });
      await refresh();
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answers');
      setIsSaving(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 sm:pt-12">
      {/* Progress: four dots, not a percentage bar */}
      <div className="flex items-center gap-2" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index < step ? 'bg-primary' : 'bg-border'
            }`}
          />
        ))}
      </div>

      <div className="mt-8">
        {step === 1 && (
          <StepShell
            title="Which class are you in?"
            hint="ED explains things differently for each class."
          >
            <div className="grid gap-3">
              {CLASS_LEVELS.map((level) => (
                <ChoiceButton
                  key={level}
                  selected={classLevel === level}
                  onClick={() => setClassLevel(level)}
                  label={CLASS_LEVEL_LABELS[level]}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell
            title="What do you want help with?"
            hint="Pick as many as you like. You can change this later."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {SUBJECT_KEYS.map((subject) => (
                <ChoiceButton
                  key={subject}
                  selected={subjects.includes(subject)}
                  onClick={() => toggleSubject(subject)}
                  label={SUBJECT_LABELS[subject]}
                />
              ))}
            </div>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            title="Which language is easiest for you?"
            hint="Hindi and Hinglish are coming soon."
          >
            <div className="grid gap-3">
              {AVAILABLE_LANGUAGES.map((lang) => (
                <ChoiceButton
                  key={lang}
                  selected={language === lang}
                  onClick={() => setLanguage(lang)}
                  label={LANGUAGE_LABELS[lang]}
                />
              ))}
              {/* Reserved options are shown as disabled so the roadmap is visible
                  without being a dead end. */}
              {(['HINDI', 'HINGLISH'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  disabled
                  className="ed-tap cursor-not-allowed justify-between rounded-xl border border-border bg-secondary/40 px-4 text-left text-base font-semibold text-muted-foreground"
                >
                  {LANGUAGE_LABELS[lang]}
                  <span className="text-sm font-medium">Coming soon</span>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            title="How do you like things explained?"
            hint="ED will start this way. Say “explain differently” any time to change it."
          >
            <div className="grid gap-3">
              {EXPLANATION_STYLES.map((option) => (
                <ChoiceButton
                  key={option}
                  selected={style === option}
                  onClick={() => setStyle(option)}
                  label={EXPLANATION_STYLE_LABELS[option]}
                  sublabel={EXPLANATION_STYLE_HINTS[option]}
                />
              ))}
            </div>
          </StepShell>
        )}
      </div>

      {error && (
        <p className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center gap-3">
        {step > 1 && (
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={isSaving}
            className="ed-tap gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}

        {step < TOTAL_STEPS ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance}
            className="ed-tap flex-1 gap-2 font-semibold"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => void finish()}
            disabled={isSaving || !classLevel || subjects.length === 0}
            className="ed-tap flex-1 gap-2 font-semibold"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Start learning with ED
          </Button>
        )}
      </div>
    </div>
  );
}

function StepShell({
  title,
  hint,
  children
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold leading-snug">{title}</h1>
      <p className="mt-1.5 text-muted-foreground">{hint}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  label,
  sublabel
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`ed-tap justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
        selected
          ? 'border-primary bg-accent text-accent-foreground'
          : 'border-border bg-card hover:border-primary/40'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold">{label}</span>
        {sublabel && (
          <span className="block text-sm font-normal text-muted-foreground">{sublabel}</span>
        )}
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  );
}
