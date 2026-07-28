import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tasas y Configuraciones Globales Simbradas (Deben venir de la BD vía Context en prod)
export const GLOBAL_CONFIG = {
  BCV_RATE: 36.50,         // Tasa oficial del BCV
  USDT_DISCOUNT: 0.15,     // 15% de descuento por pagar en USDT
  LOYALTY_PERCENTAGE: 0.05 // 5% de la compra se retorna en puntos
};
