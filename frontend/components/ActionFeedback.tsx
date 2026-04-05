'use client';

import clsx from 'clsx';

type Props = {
  loading?: boolean;
  loadingText?: string;
  success?: string;
  error?: string;
};

export default function ActionFeedback({
  loading = false,
  loadingText = 'Procesando energía...',
  success = '',
  error = ''
}: Props): React.ReactNode {
  return (
    <div className="space-y-2.5">
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-800">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-700 border-t-transparent" />
          <span className="font-medium">{loadingText}</span>
        </div>
      ) : null}

      {success ? (
        <div
          className={clsx(
            'rounded-xl border px-3 py-2.5 text-sm',
            'border-emerald-200 bg-emerald-50 text-emerald-800'
          )}
        >
          {success}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
      ) : null}
    </div>
  );
}
