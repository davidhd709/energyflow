import { ReactNode } from 'react';
import clsx from 'clsx';

type StatTone = 'brand' | 'accent' | 'success' | 'warn' | 'danger' | 'neutral';

type StatCardProps = {
  label: string;
  value: ReactNode;
  helper?: string;
  icon?: ReactNode;
  tone?: StatTone;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
  };
  loading?: boolean;
  className?: string;
};

const toneStyles: Record<StatTone, { iconBg: string; iconText: string; accent: string }> = {
  brand: { iconBg: 'bg-brand-50', iconText: 'text-brand-600', accent: 'before:bg-brand-500' },
  accent: { iconBg: 'bg-accent-50', iconText: 'text-accent-600', accent: 'before:bg-accent-500' },
  success: { iconBg: 'bg-success-50', iconText: 'text-success-600', accent: 'before:bg-success-500' },
  warn: { iconBg: 'bg-warn-50', iconText: 'text-warn-600', accent: 'before:bg-warn-500' },
  danger: { iconBg: 'bg-danger-50', iconText: 'text-danger-600', accent: 'before:bg-danger-500' },
  neutral: { iconBg: 'bg-surface-muted', iconText: 'text-ink-soft', accent: 'before:bg-ink-muted' }
};

const trendStyles = {
  up: 'text-success-600 bg-success-50',
  down: 'text-danger-600 bg-danger-50',
  flat: 'text-ink-muted bg-surface-muted'
};

const trendIcons = {
  up: (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  flat: (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 6h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
};

export default function StatCard({
  label,
  value,
  helper,
  icon,
  tone = 'brand',
  trend,
  loading = false,
  className
}: StatCardProps): React.ReactNode {
  const t = toneStyles[tone];
  const rawValue = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const isLong = rawValue.length > 14;
  const isVeryLong = rawValue.length > 20;

  return (
    <article
      className={clsx(
        'group relative overflow-hidden rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-elevation-3',
        // Línea de acento superior izquierda
        'before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-2xl',
        t.accent,
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {label}
          </p>
          {loading ? (
            <span className="skeleton mt-3 block h-8 w-32 rounded-md" />
          ) : (
            <h3
              className={clsx(
                'mt-2 break-words font-extrabold leading-[1.1] text-ink [font-variant-numeric:tabular-nums]',
                isVeryLong
                  ? 'text-[clamp(1.3rem,1.9vw,1.75rem)]'
                  : isLong
                    ? 'text-[clamp(1.5rem,2.1vw,2rem)]'
                    : 'text-[clamp(1.65rem,2.4vw,2.15rem)]'
              )}
            >
              {value}
            </h3>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {trend ? (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  trendStyles[trend.direction]
                )}
              >
                {trendIcons[trend.direction]}
                {trend.value}
              </span>
            ) : null}
            {helper ? <p className="text-xs text-ink-muted">{helper}</p> : null}
          </div>
        </div>
        {icon ? (
          <div
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-border-soft',
              t.iconBg,
              t.iconText
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </article>
  );
}
