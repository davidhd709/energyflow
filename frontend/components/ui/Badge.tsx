import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'brand' | 'neutral' | 'success' | 'warn' | 'danger' | 'accent';

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
};

const toneStyles: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-800 ring-brand-100',
  neutral: 'bg-surface-muted text-ink-soft ring-border-soft',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warn: 'bg-warn-50 text-warn-700 ring-warn-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  accent: 'bg-accent-50 text-accent-700 ring-accent-100'
};

const dotStyles: Record<Tone, string> = {
  brand: 'bg-brand-500',
  neutral: 'bg-ink-muted',
  success: 'bg-success-500',
  warn: 'bg-warn-500',
  danger: 'bg-danger-500',
  accent: 'bg-accent-500'
};

export default function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
  ...rest
}: BadgeProps): React.ReactNode {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        toneStyles[tone],
        className
      )}
      {...rest}
    >
      {dot ? (
        <span
          className={clsx('h-1.5 w-1.5 rounded-full', dotStyles[tone])}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
