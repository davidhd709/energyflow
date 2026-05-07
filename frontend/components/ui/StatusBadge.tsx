import Badge from './Badge';

// Mapa de estados de dominio EnergyFlow → tono visual.
// Centralizar aquí mantiene consistencia entre periodos, facturas, lecturas, usuarios, etc.
const STATUS_MAP: Record<string, { tone: 'brand' | 'success' | 'warn' | 'danger' | 'neutral' | 'accent'; label: string }> = {
  // Periodos / facturas
  abierto: { tone: 'accent', label: 'Abierto' },
  cerrado: { tone: 'neutral', label: 'Cerrado' },
  en_proceso: { tone: 'brand', label: 'En proceso' },
  pendiente: { tone: 'warn', label: 'Pendiente' },
  confirmado: { tone: 'brand', label: 'Confirmado' },
  pagado: { tone: 'success', label: 'Pagado' },
  vencido: { tone: 'danger', label: 'Vencido' },
  cancelado: { tone: 'neutral', label: 'Cancelado' },
  // Activación
  activo: { tone: 'success', label: 'Activo' },
  inactivo: { tone: 'neutral', label: 'Inactivo' },
  // Lectura
  ok: { tone: 'success', label: 'OK' },
  alerta: { tone: 'warn', label: 'Alerta' },
  error: { tone: 'danger', label: 'Error' }
};

type StatusBadgeProps = {
  status: string;
  label?: string;
};

export default function StatusBadge({ status, label }: StatusBadgeProps): React.ReactNode {
  const key = status.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const mapping = STATUS_MAP[key] || { tone: 'neutral' as const, label: status };
  return (
    <Badge tone={mapping.tone} dot>
      {label || mapping.label}
    </Badge>
  );
}
