// Datos mockeados para poder probar el POS inmediatamente sin conectar DB
import { Product, Customer } from '../types';

export const mockProducts: Product[] = [
  { id: '1', name: 'Whey Protein 100% Gold Standard 5lbs', category: 'Proteínas', barcode: '748927028688', sku: 'WP-GS-5LB-VAN', sale_price: 75.00, cost_price: 50.00, stock_quantity: 40 },
  { id: '2', name: 'Creatina Monohidratada Micronizada 300g', category: 'Creatinas', barcode: '748927023843', sku: 'CR-MONO-300', sale_price: 25.00, cost_price: 15.00, stock_quantity: 120 },
  { id: '3', name: 'Amino Energy Essential 30 Servings', category: 'Aminoácidos', barcode: '748927022068', sku: 'AM-EN-30SV', sale_price: 22.00, cost_price: 12.00, stock_quantity: 15 },
  { id: '4', name: 'Pre-Entrenamiento C4 Original 30 Serv', category: 'Pre-Entrenos', barcode: '842595100014', sku: 'C4-ORIG-30SV', sale_price: 35.00, cost_price: 20.00, stock_quantity: 8 },
  { id: '5', name: 'Shaker BlenderBottle Pro45 45oz Negro', category: 'Accesorios', barcode: '847280018512', sku: 'BB-PRO45-BLK', sale_price: 15.00, cost_price: 5.00, stock_quantity: 200 },
  { id: '6', name: 'Cinturón de Levantamiento de Pesas Cuero', category: 'Accesorios', barcode: '012345678901', sku: 'BELT-LTHR-M', sale_price: 45.00, cost_price: 25.00, stock_quantity: 5 }
];

export const mockCustomers: Customer[] = [
  { id: '1', document_id: 'V-12345678', first_name: 'Juan', last_name: 'Pérez', phone: '0414-1234567', email: 'juan@example.com', city: 'Caracas', loyalty_points: 150 },
  { id: '2', document_id: 'V-87654321', first_name: 'María', last_name: 'Gómez', phone: '0424-9876543', email: 'maria@example.com', city: 'Valencia', loyalty_points: 0 }
];
