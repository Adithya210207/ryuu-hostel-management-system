import { redirect } from 'next/navigation';

// The Version 1 homepage used the old theme. Every page now shares the homepage's design,
// so /classic sends visitors to the homepage. The old component stays in components/public/PublicHome.tsx.
export default function ClassicPage() {
  redirect('/');
}
