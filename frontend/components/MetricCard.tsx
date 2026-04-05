import { ReactNode } from 'react';
import clsx from 'clsx';

export default function MetricCard({
  title,
  value,
  helper
}: {
  title: string;
  value: ReactNode;
  helper?: string;
}): ReactNode {
  const rawValue = typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  const isLong = (rawValue?.length || 0) > 14;
  const isVeryLong = (rawValue?.length || 0) > 20;

  return (
    <article className="soft-card min-w-0 overflow-hidden rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-pine-600">{title}</p>
      <h3
        className={clsx(
          'mt-2 min-w-0 font-extrabold leading-[1.12] text-pine-900 [font-variant-numeric:tabular-nums]',
          'break-words',
          isVeryLong
            ? 'text-[clamp(1.3rem,1.9vw,1.75rem)]'
            : isLong
              ? 'text-[clamp(1.4rem,2.1vw,1.95rem)]'
              : 'text-[clamp(1.55rem,2.3vw,2.1rem)]'
        )}
      >
        {value}
      </h3>
      {helper ? <p className="mt-1 text-xs text-pine-700">{helper}</p> : null}
    </article>
  );
}
