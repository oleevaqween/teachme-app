import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-display font-bold text-muted-foreground/30" aria-hidden="true">404</div>
        <h1 className="text-h2 text-foreground">
          Page not found
        </h1>
        <p className="text-lead text-foreground-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-4 py-2 text-small bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
