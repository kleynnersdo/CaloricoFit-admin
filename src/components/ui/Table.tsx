import type { ReactNode } from 'react';

// Primitivas de tabla para listados del admin (inventario, clientes).
// Replican el encabezado gris con mayúsculas y celdas p-4 del markup repetido.

interface TablePartProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TablePartProps) {
  return <table className={`w-full text-left ${className}`}>{children}</table>;
}

export function TableHeader({ children, className = '' }: TablePartProps) {
  return <thead className={`bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider ${className}`}>{children}</thead>;
}

export function TableHeaderCell({ children, className = '' }: TablePartProps) {
  return <th className={`p-4 font-medium ${className}`}>{children}</th>;
}

export function TableBody({ children }: TablePartProps) {
  return <tbody className="divide-y divide-gray-100">{children}</tbody>;
}

export function TableCell({ children, className = '' }: TablePartProps) {
  return <td className={`p-4 ${className}`}>{children}</td>;
}
