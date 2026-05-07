import { ReactNode } from 'react';
import clsx from 'clsx';

type PageContainerProps = {
  children: ReactNode;
  className?: string;
  width?: 'default' | 'narrow' | 'full';
};

const widthStyles = {
  default: 'max-w-[1280px]',
  narrow: 'max-w-3xl',
  full: 'max-w-full'
};

export default function PageContainer({
  children,
  className,
  width = 'default'
}: PageContainerProps): React.ReactNode {
  return (
    <div className={clsx('mx-auto w-full px-3 sm:px-4 lg:px-6', widthStyles[width], className)}>
      <div className="space-y-6 lg:space-y-8">{children}</div>
    </div>
  );
}
