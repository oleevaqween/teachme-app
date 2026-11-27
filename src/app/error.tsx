'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-display" aria-hidden="true">😵</div>
        <h2 className="text-h3 text-foreground">
          Something went wrong
        </h2>
        <p className="text-lead text-foreground-secondary">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => unstable_retry()}
            className="inline-flex items-center px-4 py-2 text-small bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 text-small border border-border text-foreground rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
