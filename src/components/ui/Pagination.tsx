import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 10;

interface PaginationProps {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

/** Navegación por páginas (cursor) — 10 filas por defecto. */
export default function Pagination({
  page,
  total,
  pageSize = PAGE_SIZE,
  onChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const from = safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-gray-100">
      <span className="text-xs text-gray-500">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 0}
          onClick={() => onChange(safePage - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>
        <span className="px-2 text-xs font-semibold text-gray-600 tabular-nums">
          {safePage + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages - 1}
          onClick={() => onChange(safePage + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function pageSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  return items.slice(safePage * pageSize, (safePage + 1) * pageSize);
}
