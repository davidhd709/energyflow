import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
};

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-brand-700 text-white shadow-elevation-1 hover:bg-brand-800 hover:shadow-elevation-2 active:bg-brand-900 disabled:bg-brand-300 disabled:shadow-none',
  secondary:
    'bg-white text-brand-800 border border-brand-200 shadow-elevation-1 hover:bg-brand-50 hover:border-brand-300 active:bg-brand-100 disabled:opacity-60',
  ghost:
    'bg-transparent text-ink-soft hover:bg-brand-50 hover:text-brand-800 active:bg-brand-100 disabled:opacity-50',
  danger:
    'bg-danger-600 text-white shadow-elevation-1 hover:bg-danger-700 hover:shadow-elevation-2 active:bg-danger-700 disabled:bg-danger-300',
  subtle:
    'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200 disabled:opacity-60'
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5'
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    iconLeft,
    iconRight,
    fullWidth = false,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : iconLeft ? (
        <span className="inline-flex shrink-0">{iconLeft}</span>
      ) : null}
      {children}
      {!loading && iconRight ? <span className="inline-flex shrink-0">{iconRight}</span> : null}
    </button>
  );
});

export default Button;
