import type { ReactNode } from 'react';
import { Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  // 'boxed': cabecera con icono + pie con borde (eliminar producto/gasto).
  // 'plain': panel simple p-6 (eliminar categoría/cliente, anular venta).
  variant?: 'boxed' | 'plain';
}

export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'boxed',
}: ConfirmModalProps) {
  if (variant === 'plain') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
          {typeof title === 'string' ? <h3 className="font-bold text-lg">{title}</h3> : title}
          {children}
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 bg-gray-100 rounded-lg font-medium">{cancelLabel}</button>
            <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold">{confirmLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            {typeof title === 'string' ? <h3 className="font-bold text-gray-900 text-base">{title}</h3> : title}
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-black">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {children}
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
            <button onClick={onCancel} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors">{cancelLabel}</button>
            <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm">{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
