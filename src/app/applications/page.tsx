import type { Metadata } from 'next';
import { ApplicationsTable } from '@/components/applications/ApplicationsTable';

export const metadata: Metadata = { title: 'Applications | TeachMe' };

export default function Page() {
  return <ApplicationsTable />;
}
