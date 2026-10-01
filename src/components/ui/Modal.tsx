import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
  overlayClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  closeIconClassName?: string;
}

// Primitiva compartida de modal: overlay + panel + cabecera con botón de cierre.
// Los defaults replican el markup repetido del admin (max-w-md, sombra xl, borde gris).
export default function Modal({
  title,
  onClose,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
  overlayClassName = 'bg-black/50 z-50',
  panelClassName = 'shadow-xl',
  headerClassName = 'border-b border-gray-200',
  bodyClassName = 'p-4 space-y-4',
  closeIconClassName = 'text-gray-500',
}: ModalProps) {
  return (
    <div className={`fixed inset-0 flex items-center justify-center p-4 ${overlayClassName}`}>
      <div className={`bg-white rounded-xl w-full ${maxWidthClassName} overflow-hidden ${panelClassName}`}>
        <div className={`flex justify-between items-center p-4 ${headerClassName}`}>
          {typeof title === 'string' ? <h3 className="font-bold text-lg">{title}</h3> : title}
          <button onClick={onClose}>
            <X className={`w-5 h-5 ${closeIconClassName}`} />
          </button>
        </div>
        <div className={bodyClassName}>{children}</div>
        {footer}
      </div>
    </div>
  );
}
