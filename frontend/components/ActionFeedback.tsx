'use client';

type Props = {
  loading?: boolean;
  loadingText?: string;
  success?: string;
  error?: string;
};

const SpinnerIcon = (): React.ReactNode => (
  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
);

const SuccessIcon = (): React.ReactNode => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ErrorIcon = (): React.ReactNode => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.5h.008M5.25 19.5h13.5a2.25 2.25 0 002.05-3.215L13.92 4.875a2.25 2.25 0 00-3.84 0L3.2 16.285A2.25 2.25 0 005.25 19.5z" />
  </svg>
);

export default function ActionFeedback({
  loading = false,
  loadingText = 'Procesando...',
  success = '',
  error = ''
}: Props): React.ReactNode {
  if (!loading && !success && !error) return null;

  return (
    <div className="space-y-2 animate-fade-in">
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3 text-sm text-brand-800"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-brand-600 shadow-elevation-1">
            <SpinnerIcon />
          </span>
          <span className="font-medium">{loadingText}</span>
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-success-200 bg-success-50/80 px-4 py-3 text-sm text-success-700"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-success-600 shadow-elevation-1">
            <SuccessIcon />
          </span>
          <span className="font-medium">{success}</span>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50/80 px-4 py-3 text-sm text-danger-700"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-danger-600 shadow-elevation-1">
            <ErrorIcon />
          </span>
          <span className="font-medium">{error}</span>
        </div>
      ) : null}
    </div>
  );
}
