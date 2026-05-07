import { ReactNode } from 'react';

import StatCard from './ui/StatCard';

// MetricCard mantiene su API pública para que las páginas existentes sigan
// funcionando sin cambios. Internamente delega en StatCard, el componente
// nuevo del sistema de diseño.
export default function MetricCard({
  title,
  value,
  helper
}: {
  title: string;
  value: ReactNode;
  helper?: string;
}): ReactNode {
  return <StatCard label={title} value={value} helper={helper} tone="brand" />;
}
