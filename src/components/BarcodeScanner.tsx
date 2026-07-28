import { useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface Props {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
}

export default function BarcodeScanner({ onScanSuccess, onScanFailure }: Props) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Inicializar el scanner al montar
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 300, height: 150 }, rememberLastUsedCamera: true },
      false
    );

    scannerRef.current.render(
      (text) => {
        // Al detectar un código con éxito
        // scannerRef.current?.clear(); // Pausa o limpia luego de escanear si lo deseas
        onScanSuccess(text);
      },
      (error) => {
        // ignorar errores constantes de parseo (pasan mucho por video frame)
        if (onScanFailure) onScanFailure(error);
      }
    );

    // Limpieza al desmontar
    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .clear()
          .catch((error) => console.error("Fallo al limpiar scanner", error));
      }
    };
  }, [onScanSuccess, onScanFailure]);

  return <div id="qr-reader" className="w-full bg-white rounded overflow-hidden shadow-inner"></div>;
}
