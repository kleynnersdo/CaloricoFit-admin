import type { ReactNode } from 'react';

type StatAccent = 'blue' | 'red' | 'purple' | 'green';

const ACCENTS: Record<StatAccent, string> = {
  blue: 'border-l-blue-500',
  red: 'border-l-red-500',
  purple: 'border-l-purple-500',
  green: 'border-l-green-500',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: StatAccent;
  valueClassName?: string;
}

// Tarjeta de métrica del dashboard (borde lateral de color + cifra grande).
export default function StatCard({ label, value, accent = 'blue', valueClassName = 'text-2xl sm:text-3xl font-bold text-gray-900' }: StatCardProps) {
  return (
    <div className={`bg-white p-3 sm:p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 ${ACCENTS[accent]}`}>
      <div className="text-[10px] sm:text-sm font-bold tracking-wider text-gray-500 mb-1 uppercase leading-tight">{label}</div>
      <div className={valueClassName}>{value}</div>
    </div>
  );
}
