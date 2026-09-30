'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GraduationCap, ArrowRight, Loader2, AlertCircle, BookOpen, Layers } from 'lucide-react';
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
      <Card className="w-full max-w-lg shadow-xl border-border/80">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Create your account</CardTitle>
          <CardDescription>Join EDplatform to start learning or teaching today</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="flex items-start space-x-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Role Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                I want to join as a:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('STUDENT')}
                  className={`flex items-center justify-center space-x-2 rounded-lg border p-3 text-xs font-semibold transition ${
                    role === 'STUDENT'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('INSTRUCTOR')}
                  className={`flex items-center justify-center space-x-2 rounded-lg border p-3 text-xs font-semibold transition ${
                    role === 'INSTRUCTOR'
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <Layers className="h-4 w-4" />
                  <span>Instructor</span>
                </button>
              </div>
            </div>

            {/* First & Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-xs font-semibold text-foreground">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  placeholder="Jane"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-xs font-semibold text-foreground">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold text-foreground">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="At least 8 chars with number & uppercase"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              />
              <p className="text-[11px] text-muted-foreground">
                Must contain at least 8 characters, including an uppercase letter, lowercase letter, and number.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign in instead
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
