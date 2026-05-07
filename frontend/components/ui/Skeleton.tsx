import clsx from 'clsx';

type SkeletonProps = {
  className?: string;
  shape?: 'rect' | 'circle' | 'text';
};

export function Skeleton({ className, shape = 'rect' }: SkeletonProps): React.ReactNode {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={clsx(
        'skeleton block',
        shape === 'circle' && 'rounded-full',
        shape === 'text' && 'h-4 rounded',
        className
      )}
    />
  );
}

export function SkeletonGroup({ rows = 3, className }: { rows?: number; className?: string }): React.ReactNode {
  return (
    <div className={clsx('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} shape="text" className={i === rows - 1 ? 'w-3/4' : 'w-full'} />
      ))}
    </div>
  );
}

export default Skeleton;
