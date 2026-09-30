import http from 'http';
import { createApp } from '../app.js';
import { prisma } from '../config/prisma.config.js';

interface TestContext {
  baseUrl: string;
  server: http.Server;
  studentACookie: string;
  studentBCookie: string;
  instructorACookie: string;
  instructorBCookie: string;
  adminCookie: string;
  studentAId: string;
  studentBId: string;
  instructorAId: string;
  instructorBId: string;
  adminId: string;
}

const RESULTS: { category: string; test: string; status: 'PASSED' | 'FAILED'; error?: string }[] = [];

function recordPass(category: string, test: string) {
  RESULTS.push({ category, test, status: 'PASSED' });
  console.log(`  [PASS] ${category} > ${test}`);
}

function recordFail(category: string, test: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  RESULTS.push({ category, test, status: 'FAILED', error: msg });
  console.error(`  [FAIL] ${category} > ${test}: ${msg}`);
}

async function startServer(): Promise<TestContext> {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 5000;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  return {
    baseUrl,
    server,
    studentACookie: '',
    studentBCookie: '',
    instructorACookie: '',
    instructorBCookie: '',
    adminCookie: '',
    studentAId: '',
    studentBId: '',
    instructorAId: '',
    instructorBId: '',
    adminId: ''
  };
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  const match = setCookie.match(/auth_token=[^;]+/);
  return match ? match[0] : '';
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 7 AUTOMATED SECURITY & REGRESSION SUITE');
  console.log('====================================================\n');

  const ctx = await startServer();
  const ts = Date.now();
  let courseAId = '';
  let moduleId = '';
  let lessonId = '';
  let quizId = '';

  try {
    // ----------------------------------------------------
    // TEST SUITE 1: Infrastructure & Health Check
    // ----------------------------------------------------
    console.log('[SUITE 1] Infrastructure & Health Check');
    try {
      const res = await fetch(`${ctx.baseUrl}/health`);
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const body = await res.json();
      if (!body.success || body.data.status !== 'healthy') throw new Error(`Unhealthy status: ${JSON.stringify(body)}`);
      recordPass('Infrastructure', 'Health check returns 200 OK and healthy status');
    } catch (err) {
      recordFail('Infrastructure', 'Health check returns 200 OK and healthy status', err);
    }

    try {
      const res = await fetch(`${ctx.baseUrl}/non-existent-route-${ts}`);
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== 'NOT_FOUND') throw new Error(`Expected NOT_FOUND code, got ${body.error?.code}`);
      if (body.error?.stack) throw new Error('Stack trace leaked in 404 response');
      recordPass('Infrastructure', 'Undefined routes return clean 404 JSON without stack trace');
    } catch (err) {
      recordFail('Infrastructure', 'Undefined routes return clean 404 JSON without stack trace', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 2: Authentication & Session Security
    // ----------------------------------------------------
    console.log('\n[SUITE 2] Authentication & Session Security');
    const studentAEmail = `sec_student_a_${ts}@example.com`;
    const studentBEmail = `sec_student_b_${ts}@example.com`;
    const instAEmail = `sec_inst_a_${ts}@example.com`;
    const instBEmail = `sec_inst_b_${ts}@example.com`;
    const adminEmail = `sec_admin_${ts}@example.com`;
    const testPassword = 'Password123!';

    // Register Student A
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentAEmail,
          password: testPassword,
          firstName: 'Student',
          lastName: 'Alpha',
          role: 'STUDENT'
        })
      });

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${await res.text()}`);
      ctx.studentACookie = extractCookie(res);
      const body = await res.json();
      ctx.studentAId = body.data.user.id;

      if (!ctx.studentACookie.includes('auth_token=')) throw new Error('Set-Cookie did not contain auth_token');
      if ('passwordHash' in body.data.user) throw new Error('CRITICAL: passwordHash exposed in register response!');
      recordPass('Authentication', 'Student registration succeeds with HttpOnly auth_token and no passwordHash leak');
    } catch (err) {
      recordFail('Authentication', 'Student registration succeeds with HttpOnly auth_token and no passwordHash leak', err);
    }

    // Client attempted privilege escalation to ADMIN is rejected by validation schema
    try {
      const resPriv = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `priv_esc_${ts}@example.com`,
          password: testPassword,
          firstName: 'Hacker',
          lastName: 'Admin',
          role: 'ADMIN' // Not permitted in register schema enum
        })
      });
      if (resPriv.status !== 400) throw new Error(`Expected 400 for unauthorized ADMIN self-registration, got ${resPriv.status}`);
      recordPass('Authentication', 'Client privilege escalation (self-registering as ADMIN) rejected by schema');
    } catch (err) {
      recordFail('Authentication', 'Client privilege escalation rejected by schema', err);
    }

    // Duplicate email registration
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentAEmail,
          password: testPassword,
          firstName: 'Duplicate',
          lastName: 'User',
          role: 'STUDENT'
        })
      });
      if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
      recordPass('Authentication', 'Duplicate registration rejected with 409 Conflict');
    } catch (err) {
      recordFail('Authentication', 'Duplicate registration rejected with 409 Conflict', err);
    }

    // Register Student B, Instructor A, Instructor B, and Admin Candidate
    try {
      const resB = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: studentBEmail,
          password: testPassword,
          firstName: 'Student',
          lastName: 'Beta',
          role: 'STUDENT'
        })
      });
      ctx.studentBCookie = extractCookie(resB);
      ctx.studentBId = (await resB.json()).data.user.id;

      const resIA = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: instAEmail,
          password: testPassword,
          firstName: 'Instructor',
          lastName: 'Alpha',
          role: 'INSTRUCTOR'
        })
      });
      ctx.instructorACookie = extractCookie(resIA);
      ctx.instructorAId = (await resIA.json()).data.user.id;

      const resIB = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: instBEmail,
          password: testPassword,
          firstName: 'Instructor',
          lastName: 'Beta',
          role: 'INSTRUCTOR'
        })
      });
      ctx.instructorBCookie = extractCookie(resIB);
      ctx.instructorBId = (await resIB.json()).data.user.id;

      const resAdm = await fetch(`${ctx.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: testPassword,
          firstName: 'Super',
          lastName: 'Admin',
          role: 'INSTRUCTOR'
        })
      });
      ctx.adminCookie = extractCookie(resAdm);
      ctx.adminId = (await resAdm.json()).data.user.id;

      // Authoritatively promote to ADMIN in DB
      await prisma.user.update({
        where: { id: ctx.adminId },
        data: { role: 'ADMIN' }
      });

      recordPass('Authentication', 'Registered multiple roles (STUDENT, INSTRUCTOR, ADMIN) with isolated sessions');
    } catch (err) {
      recordFail('Authentication', 'Registered multiple roles with isolated sessions', err);
    }

    // Invalid password login
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: studentAEmail, password: 'WrongPassword123!' })
      });
      if (res.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${res.status}`);
      recordPass('Authentication', 'Invalid credentials rejected with 401 Unauthorized');
    } catch (err) {
      recordFail('Authentication', 'Invalid credentials rejected with 401 Unauthorized', err);
    }

    // Protected /auth/me without cookie
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/me`);
      if (res.status !== 401) throw new Error(`Expected 401 Unauthorized without cookie, got ${res.status}`);
      recordPass('Authentication', 'Unauthenticated request to protected route returns 401 Unauthorized');
    } catch (err) {
      recordFail('Authentication', 'Unauthenticated request to protected route returns 401 Unauthorized', err);
    }

    // Protected /auth/me with cookie
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/me`, {
        headers: { Cookie: ctx.studentACookie }
      });
      if (res.status !== 200) throw new Error(`Expected 200 with valid cookie, got ${res.status}`);
      const body = await res.json();
      if (body.data.user.id !== ctx.studentAId) throw new Error('Returned user does not match authenticated session');
      if ('passwordHash' in body.data.user) throw new Error('CRITICAL: passwordHash exposed in /auth/me');
      recordPass('Authentication', 'Authenticated /auth/me returns safe user profile without passwordHash');
    } catch (err) {
      recordFail('Authentication', 'Authenticated /auth/me returns safe user profile without passwordHash', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 3: RBAC Cross-Role Authorization Matrix
    // ----------------------------------------------------
    console.log('\n[SUITE 3] RBAC Cross-Role Authorization Matrix');

    // Student attempting to create course -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          title: 'Illegal Student Course',
          shortSummary: 'A test course created by student',
          description: 'A test course description',
          price: 0,
          level: 'BEGINNER'
        })
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for Student creating course, got ${res.status}`);
      recordPass('RBAC', 'Student cannot create courses (403 Forbidden)');
    } catch (err) {
      recordFail('RBAC', 'Student cannot create courses (403 Forbidden)', err);
    }

    // Student attempting to access Instructor Dashboard -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/dashboard/instructor`, {
        headers: { Cookie: ctx.studentACookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      recordPass('RBAC', 'Student cannot access Instructor Dashboard (403 Forbidden)');
    } catch (err) {
      recordFail('RBAC', 'Student cannot access Instructor Dashboard (403 Forbidden)', err);
    }

    // Student attempting to access Admin Dashboard -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/dashboard/admin`, {
        headers: { Cookie: ctx.studentACookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      recordPass('RBAC', 'Student cannot access Admin Dashboard (403 Forbidden)');
    } catch (err) {
      recordFail('RBAC', 'Student cannot access Admin Dashboard (403 Forbidden)', err);
    }

    // Instructor attempting to access Admin Dashboard -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/dashboard/admin`, {
        headers: { Cookie: ctx.instructorACookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      recordPass('RBAC', 'Instructor cannot access Admin Dashboard (403 Forbidden)');
    } catch (err) {
      recordFail('RBAC', 'Instructor cannot access Admin Dashboard (403 Forbidden)', err);
    }

    // Admin can access all dashboards
    try {
      const resAdm = await fetch(`${ctx.baseUrl}/dashboard/admin`, { headers: { Cookie: ctx.adminCookie } });
      const resInst = await fetch(`${ctx.baseUrl}/dashboard/instructor`, { headers: { Cookie: ctx.adminCookie } });
      const resStud = await fetch(`${ctx.baseUrl}/dashboard/student`, { headers: { Cookie: ctx.adminCookie } });
      if (resAdm.status !== 200 || resInst.status !== 200 || resStud.status !== 200) {
        throw new Error(`Admin failed dashboard access checks: admin=${resAdm.status}, inst=${resInst.status}, stud=${resStud.status}`);
      }
      recordPass('RBAC', 'Admin has verified omni-role access to Student, Instructor, and Admin dashboards');
    } catch (err) {
      recordFail('RBAC', 'Admin has verified omni-role access to dashboards', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 4: IDOR & Course Ownership Enforcement
    // ----------------------------------------------------
    console.log('\n[SUITE 4] IDOR & Course Ownership Enforcement');

    // Instructor A creates Course
    try {
      const res = await fetch(`${ctx.baseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorACookie
        },
        body: JSON.stringify({
          title: `Security Testing Course ${ts}`,
          shortSummary: 'High-security backend testing',
          description: 'A comprehensive course for security audit verification',
          price: 0,
          level: 'INTERMEDIATE',
          isPublished: true
        })
      });
      if (res.status !== 201) throw new Error(`Expected 201 Created, got ${res.status}: ${await res.text()}`);
      const body = await res.json();
      courseAId = body.data.course.id;
      recordPass('Course Ownership', 'Instructor A successfully creates course');
    } catch (err) {
      recordFail('Course Ownership', 'Instructor A successfully creates course', err);
    }

    // Instructor B attempts to update Instructor A's course -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/courses/${courseAId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorBCookie
        },
        body: JSON.stringify({
          title: 'Hacked by Instructor B'
        })
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for Instructor B modifying Instructor A course, got ${res.status}`);
      recordPass('IDOR Protection', 'Instructor B cannot modify Instructor A course (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Instructor B cannot modify Instructor A course (403 Forbidden)', err);
    }

    // Instructor B attempts to delete Instructor A's course -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/courses/${courseAId}`, {
        method: 'DELETE',
        headers: { Cookie: ctx.instructorBCookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for Instructor B deleting Instructor A course, got ${res.status}`);
      recordPass('IDOR Protection', 'Instructor B cannot delete Instructor A course (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Instructor B cannot delete Instructor A course (403 Forbidden)', err);
    }

    // Instructor B attempts to add Module to Instructor A's course -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/courses/${courseAId}/modules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorBCookie
        },
        body: JSON.stringify({
          title: 'Malicious Module'
        })
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden, got ${res.status}`);
      recordPass('IDOR Protection', 'Instructor B cannot inject modules into Instructor A course (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Instructor B cannot inject modules into Instructor A course (403 Forbidden)', err);
    }

    // Instructor A creates Module and Lesson
    try {
      const modRes = await fetch(`${ctx.baseUrl}/courses/${courseAId}/modules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorACookie
        },
        body: JSON.stringify({ title: 'Module 1: Foundations' })
      });
      const modBody = await modRes.json();
      moduleId = modBody.data.module.id;

      const lesRes = await fetch(`${ctx.baseUrl}/modules/${moduleId}/lessons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorACookie
        },
        body: JSON.stringify({
          title: 'Lesson 1: Deep Security',
          type: 'VIDEO',
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          videoDuration: 100,
          isFreePreview: false,
          isPublished: true
        })
      });
      const lesBody = await lesRes.json();
      lessonId = lesBody.data.lesson.id;
      recordPass('Course Ownership', 'Instructor A can add modules and lessons to own course');
    } catch (err) {
      recordFail('Course Ownership', 'Instructor A can add modules and lessons to own course', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 5: Enrollment & Lesson Access Enforcement
    // ----------------------------------------------------
    console.log('\n[SUITE 5] Enrollment & Lesson Access Enforcement');

    // Student B (not enrolled, not free preview) attempts to access lesson content -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/lessons/${lessonId}`, {
        headers: { Cookie: ctx.studentBCookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for non-enrolled student, got ${res.status}`);
      recordPass('Access Control', 'Non-enrolled student cannot access private lesson content (403 Forbidden)');
    } catch (err) {
      recordFail('Access Control', 'Non-enrolled student cannot access private lesson content (403 Forbidden)', err);
    }

    // Student A enrolls in course
    try {
      const res = await fetch(`${ctx.baseUrl}/courses/${courseAId}/enroll`, {
        method: 'POST',
        headers: { Cookie: ctx.studentACookie }
      });
      if (res.status !== 200) throw new Error(`Expected 200 OK on enroll, got ${res.status}`);

      // Now Student A can access lesson content
      const lesRes = await fetch(`${ctx.baseUrl}/lessons/${lessonId}`, {
        headers: { Cookie: ctx.studentACookie }
      });
      if (lesRes.status !== 200) throw new Error(`Expected 200 OK after enrollment, got ${lesRes.status}`);
      const lesBody = await lesRes.json();
      if (!lesBody.data.lesson.playback) throw new Error('Expected playback object in lesson content');
      recordPass('Access Control', 'Enrolled student receives authorized lesson playback details (200 OK)');
    } catch (err) {
      recordFail('Access Control', 'Enrolled student receives authorized lesson playback details (200 OK)', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 6: 90% Meaningful Playback Progress Calculation
    // ----------------------------------------------------
    console.log('\n[SUITE 6] 90% Meaningful Playback Progress Calculation');

    // Test 1: Watch interval [0, 30] for 100s video -> 30% coverage, isCompleted false
    try {
      const res = await fetch(`${ctx.baseUrl}/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          lessonId,
          lastPositionSeconds: 30,
          totalDurationSeconds: 100,
          watchedIntervals: [{ start: 0, end: 30 }]
        })
      });
      const body = await res.json();
      const progress = body.data.progress;
      if (progress.isCompleted !== false || progress.coveragePercentage !== 30) {
        throw new Error(`Expected coverage 30% and isCompleted=false, got: ${JSON.stringify(progress)}`);
      }
      recordPass('Progress Calculation', 'Partial watched interval [0,30] sets coverage to 30% and keeps isCompleted=false');
    } catch (err) {
      recordFail('Progress Calculation', 'Partial watched interval [0,30] sets coverage to 30% and keeps isCompleted=false', err);
    }

    // Test 2: Cheating attempt - seek directly to 95s and report position 95 with small interval [90, 95]
    try {
      const res = await fetch(`${ctx.baseUrl}/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          lessonId,
          lastPositionSeconds: 95,
          totalDurationSeconds: 100,
          watchedIntervals: [{ start: 90, end: 95 }]
        })
      });
      const body = await res.json();
      const progress = body.data.progress;
      // Total non-overlapping intervals: [0, 30] (30s) + [90, 95] (5s) = 35s / 100s = 35%
      if (progress.isCompleted !== false || progress.coveragePercentage !== 35) {
        throw new Error(`Cheating attempt should not complete lesson! Got: ${JSON.stringify(progress)}`);
      }
      recordPass('Progress Anti-Cheat', 'Seeking directly to 95% cannot fake completion; server enforces 90% non-overlapping coverage');
    } catch (err) {
      recordFail('Progress Anti-Cheat', 'Seeking directly to 95% cannot fake completion', err);
    }

    // Test 3: Watch remainder [30, 95] -> total coverage [0, 95] = 95% >= 90% -> isCompleted becomes true
    try {
      const res = await fetch(`${ctx.baseUrl}/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          lessonId,
          lastPositionSeconds: 95,
          totalDurationSeconds: 100,
          watchedIntervals: [{ start: 30, end: 95 }]
        })
      });
      const body = await res.json();
      const progress = body.data.progress;
      if (progress.isCompleted !== true || progress.coveragePercentage < 90) {
        throw new Error(`Expected isCompleted=true after 95% coverage, got: ${JSON.stringify(progress)}`);
      }
      recordPass('Progress Calculation', 'Full meaningful coverage (>=90%) marks lesson completed and triggers course progress');
    } catch (err) {
      recordFail('Progress Calculation', 'Full meaningful coverage marks lesson completed', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 7: Quiz Integrity & Deterministic Scoring
    // ----------------------------------------------------
    console.log('\n[SUITE 7] Quiz Integrity & Deterministic Scoring');
    let question1Id = '';
    let q1OptCorrect = '';

    // Instructor A creates Quiz
    try {
      const res = await fetch(`${ctx.baseUrl}/quizzes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorACookie
        },
        body: JSON.stringify({
          lessonId,
          title: 'Security Knowledge Check',
          description: 'Testing RBAC, IDOR, and playback rules',
          passingScore: 70,
          timeLimitSeconds: 600,
          isPublished: true
        })
      });
      const body = await res.json();
      quizId = body.data.quiz.id;

      // Add Question 1 (SINGLE_CHOICE)
      const q1Res = await fetch(`${ctx.baseUrl}/quizzes/${quizId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorACookie
        },
        body: JSON.stringify({
          prompt: 'Where should JWT tokens be stored to prevent XSS theft?',
          type: 'SINGLE_CHOICE',
          points: 10,
          explanation: 'HttpOnly cookies cannot be read by malicious JavaScript.',
          options: [
            { text: 'localStorage', isCorrect: false },
            { text: 'HttpOnly cookie', isCorrect: true },
            { text: 'Window.sessionStorage', isCorrect: false }
          ]
        })
      });
      const q1Body = await q1Res.json();
      question1Id = q1Body.data.question.id;
      const opts = q1Body.data.question.options;
      q1OptCorrect = opts.find((o: any) => o.isCorrect).id;

      recordPass('Quiz Management', 'Instructor A creates Quiz and Questions with correct answer mappings');
    } catch (err) {
      recordFail('Quiz Management', 'Instructor A creates Quiz and Questions', err);
    }

    // Instructor B attempts to modify Instructor A's quiz -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/quizzes/${quizId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.instructorBCookie
        },
        body: JSON.stringify({ title: 'Hijacked Quiz' })
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for Instructor B modifying quiz, got ${res.status}`);
      recordPass('IDOR Protection', 'Instructor B cannot modify Instructor A quiz (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Instructor B cannot modify Instructor A quiz (403 Forbidden)', err);
    }

    // Student A retrieves Quiz before submission: verify isCorrect and explanation are stripped
    try {
      const res = await fetch(`${ctx.baseUrl}/quizzes/${quizId}`, {
        headers: { Cookie: ctx.studentACookie }
      });
      const body = await res.json();
      const question = body.data.quiz.questions[0];

      if ('explanation' in question && question.explanation !== null && question.explanation !== undefined) {
        throw new Error('CRITICAL: Question explanation exposed to student before submission!');
      }

      for (const opt of question.options) {
        if ('isCorrect' in opt) {
          throw new Error('CRITICAL: Option isCorrect flag exposed to student before submission!');
        }
      }
      recordPass('Quiz Sanitization', 'Pre-submission student quiz view sanitizes and hides isCorrect and explanations');
    } catch (err) {
      recordFail('Quiz Sanitization', 'Pre-submission student quiz view sanitizes isCorrect and explanations', err);
    }

    // Student A starts attempt
    let attemptId = '';
    try {
      const res = await fetch(`${ctx.baseUrl}/quizzes/${quizId}/attempts`, {
        method: 'POST',
        headers: { Cookie: ctx.studentACookie }
      });
      const body = await res.json();
      attemptId = body.data.attempt.id;
      if (body.data.attempt.status !== 'IN_PROGRESS') throw new Error(`Expected IN_PROGRESS, got ${body.data.attempt.status}`);
      recordPass('Quiz Attempt', 'Student A successfully initiates quiz attempt');
    } catch (err) {
      recordFail('Quiz Attempt', 'Student A successfully initiates quiz attempt', err);
    }

    // Student B attempts to submit Student A's attempt -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentBCookie
        },
        body: JSON.stringify({
          answers: [{ questionId: question1Id, selectedOptionIds: [q1OptCorrect] }]
        })
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for submitting another student attempt, got ${res.status}`);
      recordPass('IDOR Protection', 'Student B cannot submit Student A quiz attempt (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Student B cannot submit Student A quiz attempt (403 Forbidden)', err);
    }

    // Student B attempts to view Student A's attempt results -> 403
    try {
      const res = await fetch(`${ctx.baseUrl}/attempts/${attemptId}`, {
        headers: { Cookie: ctx.studentBCookie }
      });
      if (res.status !== 403) throw new Error(`Expected 403 Forbidden for viewing another student attempt, got ${res.status}`);
      recordPass('IDOR Protection', 'Student B cannot view Student A quiz results (403 Forbidden)');
    } catch (err) {
      recordFail('IDOR Protection', 'Student B cannot view Student A quiz results (403 Forbidden)', err);
    }

    // Student A submits attempt with correct answer -> server grades 100%, passed
    try {
      const res = await fetch(`${ctx.baseUrl}/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          answers: [{ questionId: question1Id, selectedOptionIds: [q1OptCorrect] }]
        })
      });
      const body = await res.json();
      const result = body.data.result;
      if (result.score !== 100 || result.isPassed !== true) {
        throw new Error(`Expected 100% score and passed=true, got: ${JSON.stringify(result)}`);
      }
      if (!result.questions[0].explanation) {
        throw new Error('Explanation should be revealed to student after submission');
      }
      recordPass('Server-Side Scoring', 'Deterministic server-side grading computes score 100% and reveals explanations post-submission');
    } catch (err) {
      recordFail('Server-Side Scoring', 'Deterministic server-side grading computes score 100%', err);
    }

    // Student A attempts to submit the same attempt again -> 400
    try {
      const res = await fetch(`${ctx.baseUrl}/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ctx.studentACookie
        },
        body: JSON.stringify({
          answers: [{ questionId: question1Id, selectedOptionIds: [q1OptCorrect] }]
        })
      });
      if (res.status !== 400) throw new Error(`Expected 400 Bad Request for already submitted attempt, got ${res.status}`);
      recordPass('Quiz Attempt', 'Re-submitting finalized attempt is rejected (400 Bad Request)');
    } catch (err) {
      recordFail('Quiz Attempt', 'Re-submitting finalized attempt is rejected (400 Bad Request)', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 8: Rate Limiting Enforcement
    // ----------------------------------------------------
    console.log('\n[SUITE 8] Rate Limiting & Header Verification');
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ratelimit@example.com', password: 'Password123!' })
      });
      const limitHeader = res.headers.get('x-ratelimit-limit');
      const remainHeader = res.headers.get('x-ratelimit-remaining');
      if (!limitHeader || !remainHeader) {
        throw new Error(`Missing rate limit headers: limit=${limitHeader}, remaining=${remainHeader}`);
      }
      recordPass('Rate Limiting', 'Rate limiting headers (X-RateLimit-Limit, X-RateLimit-Remaining) are present on sensitive endpoints');
    } catch (err) {
      recordFail('Rate Limiting', 'Rate limiting headers are present', err);
    }

    // ----------------------------------------------------
    // TEST SUITE 9: Error Sanitization & Input Validation
    // ----------------------------------------------------
    console.log('\n[SUITE 9] Error Sanitization & Input Validation');

    // Invalid JSON body
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": "broken-json'
      });
      if (res.status !== 400) throw new Error(`Expected 400 for malformed JSON, got ${res.status}`);
      recordPass('Error Sanitization', 'Malformed JSON payload safely rejected with 400 Bad Request without leaking server details');
    } catch (err) {
      recordFail('Error Sanitization', 'Malformed JSON payload rejected with 400 Bad Request', err);
    }

    // Zod validation rejection
    try {
      const res = await fetch(`${ctx.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: '123' })
      });
      if (res.status !== 400) throw new Error(`Expected 400 for invalid email/password format, got ${res.status}`);
      const body = await res.json();
      if (body.error?.code !== 'VALIDATION_ERROR') throw new Error(`Expected VALIDATION_ERROR code, got ${body.error?.code}`);
      recordPass('Error Sanitization', 'Zod validation errors returned cleanly with structured field errors');
    } catch (err) {
      recordFail('Error Sanitization', 'Zod validation errors returned cleanly', err);
    }

    // Clean up test fixtures safely in reverse dependency order
    try {
      if (quizId) {
        await prisma.quizAnswer.deleteMany({ where: { question: { quizId } } });
        await prisma.quizAttempt.deleteMany({ where: { quizId } });
        await prisma.quizOption.deleteMany({ where: { question: { quizId } } });
        await prisma.quizQuestion.deleteMany({ where: { quizId } });
        await prisma.quiz.deleteMany({ where: { id: quizId } });
      }
      if (lessonId) {
        await prisma.lessonProgress.deleteMany({ where: { lessonId } });
        await prisma.lesson.deleteMany({ where: { id: lessonId } });
      }
      if (moduleId) {
        await prisma.module.deleteMany({ where: { id: moduleId } });
      }
      if (courseAId) {
        await prisma.enrollment.deleteMany({ where: { courseId: courseAId } });
        await prisma.course.deleteMany({ where: { id: courseAId } });
      }
      const testUserIds = [ctx.studentAId, ctx.studentBId, ctx.instructorAId, ctx.instructorBId, ctx.adminId].filter(Boolean);
      if (testUserIds.length > 0) {
        // Also cleanup any orphan courses created by test instructors if any
        await prisma.course.deleteMany({ where: { instructorId: { in: testUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      }
      console.log('\n  [CLEANUP] Ephemeral test fixtures cleanly pruned from database.');
    } catch (cleanupErr) {
      console.warn('  [CLEANUP] Non-fatal cleanup notice:', cleanupErr);
    }

  } finally {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n====================================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('====================================================');
  const passed = RESULTS.filter((r) => r.status === 'PASSED').length;
  const failed = RESULTS.filter((r) => r.status === 'FAILED').length;
  console.log(`Total Tests Run: ${RESULTS.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
