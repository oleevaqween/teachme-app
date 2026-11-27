'use client';

import './globals.css';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }} className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-display" aria-hidden="true">⚠️</div>
          <h1 className="text-h2 text-gray-900">
            Something went wrong
          </h1>
          <p className="text-lead text-gray-600">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p className="text-caption text-gray-500">Error ID: {error.digest}</p>
          )}
          <button
            onClick={() => unstable_retry()}
            className="inline-flex items-center px-4 py-2 text-small bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
