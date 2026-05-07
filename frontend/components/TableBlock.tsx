import { ReactNode } from 'react';

type Props = {
  columns: string[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
};

export default function TableBlock({ columns, rows, emptyMessage = 'No hay datos disponibles.' }: Props): ReactNode {
  return (
    <div className="overflow-hidden rounded-2xl border border-border-soft bg-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft bg-surface-subtle">
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-muted"
                  scope="col"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-ink-muted" colSpan={columns.length}>
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        className="h-5 w-5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
                      </svg>
                    </div>
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={index}
                  className="border-b border-border-soft/60 transition-colors hover:bg-brand-50/40 last:border-b-0"
                >
                  {columns.map((col) => (
                    <td
                      key={`${index}-${col}`}
                      className="px-4 py-3 align-middle text-ink"
                    >
                      {row[col] ?? <span className="text-ink-subtle">—</span>}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 ? (
        <div className="border-t border-border-soft bg-surface-subtle px-4 py-2.5 text-xs text-ink-muted">
          Mostrando <span className="font-semibold text-ink">{rows.length}</span> {rows.length === 1 ? 'registro' : 'registros'}
        </div>
      ) : null}
    </div>
  );
}
