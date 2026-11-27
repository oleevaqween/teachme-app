'use client';
import { useParams } from 'next/navigation';
import { PracticeSession } from '@/components/practice/PracticeSession';

export default function PracticePage() {
  const params = useParams<{ id: string }>();
  return <PracticeSession applicationId={String(params.id)} />;
}
