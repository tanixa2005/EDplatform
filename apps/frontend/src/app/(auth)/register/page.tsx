'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, AlertCircle, BookOpen, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { useAuth } from '@/context/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'INSTRUCTOR'>('STUDENT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    try {
      setIsSubmitting(true);
      await register({
        firstName,
        lastName,
        email,
        password,
        role
      });
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred during registration.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg shadow-xs border-border rounded-lg bg-card">
        <CardHeader className="space-y-1.5 text-center pt-8 pb-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white font-black text-sm mb-2 shadow-xs">
            ED
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Create Your Account</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Join EDplatform to study structured curriculums and verify your mastery
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-2">
            {errorMessage && (
              <div className="flex items-start space-x-2 rounded-md border border-brand-200 bg-brand-50 p-3 text-xs text-brand-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Role Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-foreground">
                I want to join as:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('STUDENT')}
                  className={`flex items-center justify-center space-x-2 rounded-md border p-3 text-xs font-bold transition-all ${
                    role === 'STUDENT'
                      ? 'border-primary bg-brand-50 text-foreground ring-1 ring-primary/40 shadow-xs'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>Student Learner</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('INSTRUCTOR')}
                  className={`flex items-center justify-center space-x-2 rounded-md border p-3 text-xs font-bold transition-all ${
                    role === 'INSTRUCTOR'
                      ? 'border-primary bg-brand-50 text-foreground ring-1 ring-primary/40 shadow-xs'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  <Layers className="h-4 w-4 text-primary" />
                  <span>Course Instructor</span>
                </button>
              </div>
            </div>

            {/* First & Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-xs font-bold text-foreground">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  placeholder="Rahul"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-xs font-bold text-foreground">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  placeholder="Sharma"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-bold text-foreground">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="rahul@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-bold text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="At least 8 chars with uppercase & number"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition"
              />
              <p className="text-[11px] text-muted-foreground pt-0.5">
                Must contain at least 8 characters, with an uppercase letter, lowercase letter, and number.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-2 pb-8">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md py-2.5 font-bold bg-[#111111] text-white hover:bg-[#2A2A2A] shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Creating your account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="ml-2 h-4 w-4 text-primary" />
                </>
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-primary hover:underline">
                Sign in instead
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
