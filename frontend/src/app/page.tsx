import { redirect } from 'next/navigation';

// Root URL always sends to /login; notes/page.tsx handles redirecting back
// to /notes if a valid session exists.
export default function Home() {
  redirect('/login');
}
