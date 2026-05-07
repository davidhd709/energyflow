import { ReactNode } from 'react';
import clsx from 'clsx';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeStyles = {
  sm: 'py-8 px-4',
  md: 'py-12 px-6',
  lg: 'py-16 px-8'
};

const iconSizeStyles = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-14 w-14'
};

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  size = 'md'
}: EmptyStateProps): React.ReactNode {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 text-center',
        sizeStyles[size],
        className
      )}
    >
      <div
        className={clsx(
          'mb-4 flex items-center justify-center rounded-2xl bg-white text-brand-600 shadow-elevation-1 ring-1 ring-brand-100',
          iconSizeStyles[size]
        )}
        aria-hidden="true"
      >
        {icon || (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-1/2 w-1/2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4m-18 0v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
