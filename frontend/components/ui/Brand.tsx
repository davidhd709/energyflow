import Image from 'next/image';
import clsx from 'clsx';

type Variant = 'plain' | 'card';
type Size = 'sm' | 'md' | 'lg' | 'xl';

type BrandProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  priority?: boolean;
};

// Tamaños del logo (cuadrado 1:1). El wordmark "EnergyFlow" está integrado en
// el PNG, por lo tanto NO acompañar con texto adicional.
const sizes: Record<Size, { logoPx: number; container: string }> = {
  sm: { logoPx: 40, container: 'p-1.5' },
  md: { logoPx: 56, container: 'p-2' },
  lg: { logoPx: 80, container: 'p-3' },
  xl: { logoPx: 120, container: 'p-4' }
};

export default function Brand({
  variant = 'plain',
  size = 'md',
  className,
  priority = false
}: BrandProps): React.ReactNode {
  const cfg = sizes[size];
  const img = (
    <Image
      src="/brand/logo.png"
      alt="EnergyFlow"
      width={cfg.logoPx}
      height={cfg.logoPx}
      priority={priority}
      className="h-auto w-auto"
      style={{ height: cfg.logoPx, width: cfg.logoPx }}
    />
  );

  if (variant === 'card') {
    // Tarjeta blanca para usar el logo sobre fondos oscuros (sidebar, hero login)
    // y dar contraste al wordmark.
    return (
      <div
        className={clsx(
          'inline-flex items-center justify-center rounded-2xl bg-white shadow-elevation-2 ring-1 ring-white/40',
          cfg.container,
          className
        )}
      >
        {img}
      </div>
    );
  }

  return <span className={clsx('inline-flex items-center justify-center', className)}>{img}</span>;
}
