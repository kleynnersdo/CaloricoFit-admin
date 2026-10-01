import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Aísla fallos de render: si un componente explota, se muestra un mensaje
// recuperable en lugar de la pantalla en blanco (pérdida de sesión/venta en curso).
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturó un error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
          <div className="bg-white max-w-lg w-full rounded-xl border border-gray-200 shadow-lg p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Algo salió mal</h1>
            <p className="text-sm text-gray-600 mb-4">
              Ocurrió un error inesperado en la interfaz. Tus datos están a salvo; recarga para volver a intentar.
            </p>
            <pre className="text-xs text-left text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 mb-6 overflow-x-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-lg"
            >
              Recargar la aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
