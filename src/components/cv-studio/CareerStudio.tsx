'use client';
import { StudioShell } from './StudioShell';
import { useStudioController } from './useStudioController';
import './studio.css';

export function CareerStudio() {
  const c = useStudioController();
  return <StudioShell c={c} />;
}
