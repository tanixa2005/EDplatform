import { redirect } from 'next/navigation';

/** The course marketplace listing is now the student-facing /learn screen. */
export default function CoursesIndexPage() {
  redirect('/learn');
}
