import { ReactNode } from 'react';

type Props = {
  columns: string[];
  rows: Array<Record<string, ReactNode>>;
};

export default function TableBlock({ columns, rows }: Props): ReactNode {
  return (
    <div className="soft-card overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="table-head">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] sm:text-sm">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-pine-700" colSpan={columns.length}>
                  No hay datos.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-pine-100/90 odd:bg-pine-50/25 hover:bg-pine-50/55">
                  {columns.map((col) => (
                    <td key={`${index}-${col}`} className="px-3 py-2.5 align-top text-pine-900">
                      {row[col] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-pine-100 bg-pine-50/50 px-3 py-2 text-xs text-pine-600">
        {rows.length} fila(s)
      </div>
    </div>
  );
}
