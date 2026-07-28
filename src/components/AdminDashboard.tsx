import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { LogOut, Users, Package, BarChart3, Settings, Plus, Edit, Trash2, Calendar, FileText, Bell, CheckCircle, X, Download, HelpCircle, Eye, Printer, AlertTriangle } from 'lucide-react';
import { addDays, format, differenceInDays, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';

interface Props {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'metrics' | 'inventory' | 'users' | 'customers' | 'expenses' | 'settings'>('metrics');
  const [products, setProducts] = useState<any[]>([]);
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [isSchemaErrorModalOpen, setIsSchemaErrorModalOpen] = useState(false);
  const [schemaErrorSql, setSchemaErrorSql] = useState('');
  const [isSqlCopiado, setIsSqlCopiado] = useState(false);
  const [isInventoryCostModalOpen, setIsInventoryCostModalOpen] = useState(false);
  const [inventoryCostData, setInventoryCostData] = useState({ totalCost: 0, totalUnits: 0, isCalculating: false });

  const handleCalculateInventoryCost = async () => {
      setIsInventoryCostModalOpen(true);
      setInventoryCostData({ totalCost: 0, totalUnits: 0, isCalculating: true });
      
      const { data, error } = await supabase.from('products').select('cost_price, stock_quantity');
      if (error) {
          showToast("Error al calcular inventario");
          setInventoryCostData({ totalCost: 0, totalUnits: 0, isCalculating: false });
          return;
      }
      
      let cost = 0;
      let units = 0;
      if (data) {
          data.forEach(p => {
              if (p.stock_quantity > 0) {
                  cost += (p.cost_price * p.stock_quantity);
                  units += p.stock_quantity;
              }
          });
      }
      setInventoryCostData({ totalCost: cost, totalUnits: units, isCalculating: false });
  };
  const [paymentMethodForm, setPaymentMethodForm] = useState<any>({ name: '', currency: 'USD', discount_percentage: 0, surcharge_percentage: 0, is_active: true });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilterPoints, setCustomerFilterPoints] = useState(false);
  
  // Métricas
  const [metricFilter, setMetricFilter] = useState<'day' | 'week' | 'month'>('day');
  const [metrics, setMetrics] = useState({ sales: 0, expenses: 0, netProfit: 0, productProfit: 0 });
  const [salesList, setSalesList] = useState<any[]>([]);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(10);
  const [loyaltySpendingRate, setLoyaltySpendingRate] = useState(15);
  const [loyaltyMinSpend, setLoyaltyMinSpend] = useState(1000);
  const [loyaltyMaxRedemptionPercentage, setLoyaltyMaxRedemptionPercentage] = useState(100);
  const [loyaltyRewardMode, setLoyaltyRewardMode] = useState(false);
  const [loyaltyRewardThreshold, setLoyaltyRewardThreshold] = useState(500);
  const [loyaltyRewardType, setLoyaltyRewardType] = useState('fixed'); // 'percentage', 'fixed'
  const [loyaltyRewardValue, setLoyaltyRewardValue] = useState(5);

  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);
  const [vesMarkupPercentage, setVesMarkupPercentage] = useState(0);
  const [whatsappMessage, setWhatsappMessage] = useState("¡Hola! Aquí tienes el comprobante de tu compra en Calórico Fit. ¡Gracias por preferirnos!");
  const [officialBcv, setOfficialBcv] = useState<{rate: number, date: string} | null>(null);

  // Modales de Limpiar Cierres
  const [isClearSalesModalOpen, setIsClearSalesModalOpen] = useState(false);
  const [clearSalesStep, setClearSalesStep] = useState<1 | 2>(1);
  const [clearSalesPeriod, setClearSalesPeriod] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'ALL'>('THIS_WEEK');
  const [isClearClosuresModalOpen, setIsClearClosuresModalOpen] = useState(false);
  const [clearStep, setClearStep] = useState<1 | 2>(1);
  const [clearPeriod, setClearPeriod] = useState<'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'ALL'>('THIS_WEEK');

  // Modales de Descargar Cierres
  const [isDownloadClosuresModalOpen, setIsDownloadClosuresModalOpen] = useState(false);
  const [downloadDateRange, setDownloadDateRange] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR'>('ALL');
  const [downloadSpecificYear, setDownloadSpecificYear] = useState<number>(new Date().getFullYear());
  const [downloadGrouping, setDownloadGrouping] = useState<'DETAILED' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DETAILED');

  // Modal States
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<any>({ name: '', category: 'General', subcategory: '', sku: '', cost_price: 0, sale_price: 0, stock_quantity: 0 });
  const [inventoryFilterCategory, setInventoryFilterCategory] = useState<string>('ALL');
  const [inventorySort, setInventorySort] = useState<string>('LATEST');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [subcategoriesList, setSubcategoriesList] = useState<string[]>([]);
  
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<any>({ description: '', amount_usd: 0, frequency: 'monthly', next_due_date: format(new Date(), 'yyyy-MM-dd') });

  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [isDeleteProductModalOpen, setIsDeleteProductModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);
  const [isDeleteExpenseModalOpen, setIsDeleteExpenseModalOpen] = useState(false);

  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [workerForm, setWorkerForm] = useState<any>({ email: '', password: '', first_name: '', last_name: '', document_id: '', phone: '', role: 'seller' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal y acciones de cierres de caja
  const [selectedClosureTicket, setSelectedClosureTicket] = useState<any>(null);
  const [isClosureTicketModalOpen, setIsClosureTicketModalOpen] = useState(false);

  const openClosureTicket = async (c: any) => {
    setSelectedClosureTicket(c);
    setIsClosureTicketModalOpen(true);

    if (c.sales_data && Array.isArray(c.sales_data) && c.sales_data.length > 0) {
      return;
    }

    try {
      const { data: prevClosures } = await supabase
        .from('cash_closures')
        .select('created_at')
        .eq('seller_id', c.seller_id)
        .lt('created_at', c.created_at)
        .order('created_at', { ascending: false })
        .limit(1);

      let query = supabase
        .from('sales')
        .select('id, created_at, payment_method, currency_used, total_usd')
        .eq('seller_id', c.seller_id)
        .eq('status', 'COMPLETED')
        .lte('created_at', c.created_at);

      if (prevClosures && prevClosures.length > 0) {
        query = query.gt('created_at', prevClosures[0].created_at);
      } else {
        const startDate = new Date(c.created_at);
        startDate.setHours(0,0,0,0);
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data: sales, error: salesErr } = await query;
      if (salesErr || !sales || sales.length === 0) return;

      const saleIds = sales.map(s => s.id);
      const { data: items } = await supabase
        .from('sale_items')
        .select('sale_id, product_id, quantity, unit_price_usd, subtotal_usd, products(name, sku, category, subcategory)')
        .in('sale_id', saleIds);

      const constructedSalesData = sales.map(sale => {
        const saleItems = (items || []).filter((i: any) => i.sale_id === sale.id);
        return {
          id: sale.id,
          created_at: sale.created_at,
          payment_method: sale.payment_method,
          currency_used: sale.currency_used,
          subtotal_usd: sale.total_usd,
          items: saleItems.map((i: any) => ({
            product_name: i.products?.name || 'Producto',
            product_sku: i.products?.sku || '',
            category: i.products?.category || '',
            subcategory: i.products?.subcategory || '',
            quantity: i.quantity,
            unit_price_usd: i.unit_price_usd,
            subtotal_usd: i.subtotal_usd
          }))
        };
      });

      setSelectedClosureTicket((prev: any) => ({
        ...prev,
        sales_count: sales.length,
        sales_data: constructedSalesData
      }));
    } catch (err) {
      console.error("Error al cargar ventas para el cierre de caja:", err);
    }
  };

  const handleOpenClearModal = () => {
    if (cashClosures.length === 0) {
      showToast("El historial de cierres de caja ya está vacío.");
      return;
    }
    setClearStep(1);
    setClearPeriod('THIS_WEEK');
    setIsClearClosuresModalOpen(true);
  };

  const handleConfirmClearClosures = async () => {
    try {
      const now = new Date();
      let startDate: Date | null = null;

      if (clearPeriod === 'THIS_WEEK') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (clearPeriod === 'THIS_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (clearPeriod === 'LAST_3_MONTHS') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else if (clearPeriod === 'LAST_6_MONTHS') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      } // 'ALL' leaves startDate as null

      let query = supabase.from('cash_closures').delete();

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      } else {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { data, error } = await query.select();
      if (error) throw error;

      const deletedCount = data ? data.length : 0;
      showToast(`Se eliminaron ${deletedCount} cierres de caja de la base de datos.`);
      setIsClearClosuresModalOpen(false);
      calculateMetrics();
    } catch (err: any) {
      console.error("Error al limpiar historial de cierres:", err);
      showToast("Error al limpiar el historial: " + (err.message || 'Error de permisos o base de datos'));
    }
  };

  const handleClearSalesClick = () => {
    if (salesList.length === 0) {
      showToast("La lista de ventas ya está vacía.");
      return;
    }
    setClearSalesStep(1);
    setClearSalesPeriod('THIS_WEEK');
    setIsClearSalesModalOpen(true);
  };

  const handleConfirmClearSales = async () => {
    try {
      const now = new Date();
      let startDate: Date | null = null;

      if (clearSalesPeriod === 'TODAY') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (clearSalesPeriod === 'THIS_WEEK') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (clearSalesPeriod === 'THIS_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (clearSalesPeriod === 'LAST_3_MONTHS') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else if (clearSalesPeriod === 'LAST_6_MONTHS') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      } // 'ALL' leaves startDate as null

      let query = supabase.from('sales').delete();

      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      } else {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { data, error } = await query.select();
      if (error) throw error;

      const deletedCount = data ? data.length : 0;
      showToast(`Se eliminaron ${deletedCount} ventas de la base de datos exitosamente.`);
      setIsClearSalesModalOpen(false);
      calculateMetrics();
    } catch (err: any) {
      console.error("Error al limpiar historial de ventas:", err);
      showToast("Error al limpiar las ventas: " + (err.message || 'Error de permisos o base de datos'));
    }
  };

  const handleOpenDownloadModal = () => {
    if (cashClosures.length === 0) {
      showToast("No hay historial de cierres de caja para descargar.");
      return;
    }
    setIsDownloadClosuresModalOpen(true);
  };

  const handleExecuteDownloadClosures = () => {
    if (cashClosures.length === 0) {
      showToast("No hay datos para exportar.");
      return;
    }

    const now = new Date();
    let filtered = [...cashClosures];

    if (downloadDateRange === 'TODAY') {
      const todayStart = startOfDay(now);
      filtered = filtered.filter(c => new Date(c.created_at) >= todayStart);
    } else if (downloadDateRange === 'WEEK') {
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(c => new Date(c.created_at) >= weekStart);
    } else if (downloadDateRange === 'MONTH') {
      const monthStart = startOfMonth(now);
      filtered = filtered.filter(c => new Date(c.created_at) >= monthStart);
    } else if (downloadDateRange === 'QUARTER') {
      const quarterStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      filtered = filtered.filter(c => new Date(c.created_at) >= quarterStart);
    } else if (downloadDateRange === 'SEMESTER') {
      const semesterStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      filtered = filtered.filter(c => new Date(c.created_at) >= semesterStart);
    } else if (downloadDateRange === 'YEAR') {
      filtered = filtered.filter(c => new Date(c.created_at).getFullYear() === downloadSpecificYear);
    }

    if (filtered.length === 0) {
      showToast("No se encontraron cierres de caja para el rango de fecha seleccionado.");
      return;
    }

    let exportRows: any[] = [];

    if (downloadGrouping === 'DETAILED') {
      exportRows = filtered.map(c => ({
        'ID Cierre': c.id,
        'Fecha y Hora': new Date(c.created_at).toLocaleString(),
        'Vendedor': `${c.worker_profiles?.first_name || ''} ${c.worker_profiles?.last_name || ''}`.trim(),
        'Sistema USD ($)': Number(c.system_usd || 0).toFixed(2),
        'Declarado USD ($)': Number(c.declared_usd || 0).toFixed(2),
        'Sistema USDT ($)': Number(c.system_usdt || 0).toFixed(2),
        'Declarado USDT ($)': Number(c.declared_usdt || 0).toFixed(2),
        'Sistema VES (Bs.)': Number(c.system_ves || 0).toFixed(2),
        'Declarado VES (Bs.)': Number(c.declared_ves || 0).toFixed(2),
        'Cant. Ventas': c.sales_count || 0
      }));
    } else if (downloadGrouping === 'DAILY') {
      const groups: { [key: string]: any } = {};
      filtered.forEach(c => {
        const dayKey = format(new Date(c.created_at), 'yyyy-MM-dd');
        if (!groups[dayKey]) {
          groups[dayKey] = {
            'Fecha / Día': dayKey,
            'Cant. Cierres': 0,
            'Sistema USD ($)': 0,
            'Declarado USD ($)': 0,
            'Sistema USDT ($)': 0,
            'Declarado USDT ($)': 0,
            'Sistema VES (Bs.)': 0,
            'Declarado VES (Bs.)': 0,
            'Total Ventas': 0
          };
        }
        groups[dayKey]['Cant. Cierres'] += 1;
        groups[dayKey]['Sistema USD ($)'] += Number(c.system_usd || 0);
        groups[dayKey]['Declarado USD ($)'] += Number(c.declared_usd || 0);
        groups[dayKey]['Sistema USDT ($)'] += Number(c.system_usdt || 0);
        groups[dayKey]['Declarado USDT ($)'] += Number(c.declared_usdt || 0);
        groups[dayKey]['Sistema VES (Bs.)'] += Number(c.system_ves || 0);
        groups[dayKey]['Declarado VES (Bs.)'] += Number(c.declared_ves || 0);
        groups[dayKey]['Total Ventas'] += Number(c.sales_count || 0);
      });
      exportRows = Object.values(groups).map(g => ({
        ...g,
        'Sistema USD ($)': g['Sistema USD ($)'].toFixed(2),
        'Declarado USD ($)': g['Declarado USD ($)'].toFixed(2),
        'Sistema USDT ($)': g['Sistema USDT ($)'].toFixed(2),
        'Declarado USDT ($)': g['Declarado USDT ($)'].toFixed(2),
        'Sistema VES (Bs.)': g['Sistema VES (Bs.)'].toFixed(2),
        'Declarado VES (Bs.)': g['Declarado VES (Bs.)'].toFixed(2),
      }));
    } else if (downloadGrouping === 'WEEKLY') {
      const groups: { [key: string]: any } = {};
      filtered.forEach(c => {
        const dateObj = new Date(c.created_at);
        const weekStartStr = format(startOfWeek(dateObj, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekKey = `Semana del ${weekStartStr}`;
        if (!groups[weekKey]) {
          groups[weekKey] = {
            'Semana': weekKey,
            'Cant. Cierres': 0,
            'Sistema USD ($)': 0,
            'Declarado USD ($)': 0,
            'Sistema USDT ($)': 0,
            'Declarado USDT ($)': 0,
            'Sistema VES (Bs.)': 0,
            'Declarado VES (Bs.)': 0,
            'Total Ventas': 0
          };
        }
        groups[weekKey]['Cant. Cierres'] += 1;
        groups[weekKey]['Sistema USD ($)'] += Number(c.system_usd || 0);
        groups[weekKey]['Declarado USD ($)'] += Number(c.declared_usd || 0);
        groups[weekKey]['Sistema USDT ($)'] += Number(c.system_usdt || 0);
        groups[weekKey]['Declarado USDT ($)'] += Number(c.declared_usdt || 0);
        groups[weekKey]['Sistema VES (Bs.)'] += Number(c.system_ves || 0);
        groups[weekKey]['Declarado VES (Bs.)'] += Number(c.declared_ves || 0);
        groups[weekKey]['Total Ventas'] += Number(c.sales_count || 0);
      });
      exportRows = Object.values(groups).map(g => ({
        ...g,
        'Sistema USD ($)': g['Sistema USD ($)'].toFixed(2),
        'Declarado USD ($)': g['Declarado USD ($)'].toFixed(2),
        'Sistema USDT ($)': g['Sistema USDT ($)'].toFixed(2),
        'Declarado USDT ($)': g['Declarado USDT ($)'].toFixed(2),
        'Sistema VES (Bs.)': g['Sistema VES (Bs.)'].toFixed(2),
        'Declarado VES (Bs.)': g['Declarado VES (Bs.)'].toFixed(2),
      }));
    } else if (downloadGrouping === 'MONTHLY') {
      const groups: { [key: string]: any } = {};
      filtered.forEach(c => {
        const monthKey = format(new Date(c.created_at), 'yyyy-MM');
        if (!groups[monthKey]) {
          groups[monthKey] = {
            'Mes': monthKey,
            'Cant. Cierres': 0,
            'Sistema USD ($)': 0,
            'Declarado USD ($)': 0,
            'Sistema USDT ($)': 0,
            'Declarado USDT ($)': 0,
            'Sistema VES (Bs.)': 0,
            'Declarado VES (Bs.)': 0,
            'Total Ventas': 0
          };
        }
        groups[monthKey]['Cant. Cierres'] += 1;
        groups[monthKey]['Sistema USD ($)'] += Number(c.system_usd || 0);
        groups[monthKey]['Declarado USD ($)'] += Number(c.declared_usd || 0);
        groups[monthKey]['Sistema USDT ($)'] += Number(c.system_usdt || 0);
        groups[monthKey]['Declarado USDT ($)'] += Number(c.declared_usdt || 0);
        groups[monthKey]['Sistema VES (Bs.)'] += Number(c.system_ves || 0);
        groups[monthKey]['Declarado VES (Bs.)'] += Number(c.declared_ves || 0);
        groups[monthKey]['Total Ventas'] += Number(c.sales_count || 0);
      });
      exportRows = Object.values(groups).map(g => ({
        ...g,
        'Sistema USD ($)': g['Sistema USD ($)'].toFixed(2),
        'Declarado USD ($)': g['Declarado USD ($)'].toFixed(2),
        'Sistema USDT ($)': g['Sistema USDT ($)'].toFixed(2),
        'Declarado USDT ($)': g['Declarado USDT ($)'].toFixed(2),
        'Sistema VES (Bs.)': g['Sistema VES (Bs.)'].toFixed(2),
        'Declarado VES (Bs.)': g['Declarado VES (Bs.)'].toFixed(2),
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cierres_de_Caja");
    XLSX.writeFile(workbook, `Reporte_Cierres_Caja_${format(now, 'yyyy-MM-dd')}.xlsx`);
    
    showToast("Reporte descargado con éxito.");
    setIsDownloadClosuresModalOpen(false);
  };

  const handlePrintClosureTicket = (ticket: any) => {
    if (!ticket) return;
    const printWin = window.open('', '_blank', 'width=450,height=650');
    if (!printWin) {
      window.print();
      return;
    }

    const sellerName = `${ticket.worker_profiles?.first_name || 'Vendedor'} ${ticket.worker_profiles?.last_name || ''}`;
    const dateStr = new Date(ticket.created_at).toLocaleString();

    let itemsHtml = '';
    if (ticket.sales_data && Array.isArray(ticket.sales_data) && ticket.sales_data.length > 0) {
      ticket.sales_data.forEach((s: any) => {
        if (s.items && Array.isArray(s.items)) {
          s.items.forEach((item: any) => {
            itemsHtml += `
              <tr>
                <td style="padding: 4px 0; font-size: 11px; text-align: left;">${item.product_name || 'Producto'}</td>
                <td style="padding: 4px 0; font-size: 11px; text-align: center;">${item.quantity}</td>
                <td style="padding: 4px 0; font-size: 11px; text-align: right;">$${Number(item.subtotal_usd || 0).toFixed(2)}</td>
              </tr>
            `;
          });
        }
      });
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ticket Cierre de Caja</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; padding: 12px; color: #000; }
          h2 { text-align: center; margin: 0 0 4px 0; font-size: 16px; font-weight: bold; text-transform: uppercase; }
          .center { text-align: center; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; }
          .bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          th { border-bottom: 1px solid #000; font-size: 11px; text-align: left; padding-bottom: 2px; }
        </style>
      </head>
      <body>
        <h2>CALÓRICO FIT</h2>
        <div class="center" style="font-size: 11px; font-weight: bold;">COMPROBANTE DE CIERRE DE CAJA</div>
        <div class="divider"></div>
        <div class="row"><span>Vendedor:</span><span class="bold">${sellerName}</span></div>
        <div class="row"><span>Fecha:</span><span>${dateStr}</span></div>
        <div class="divider"></div>
        <div class="row bold"><span>MONEDA</span><span>SISTEMA</span><span>DECLARADO</span></div>
        <div class="row"><span>USD ($):</span><span>$${Number(ticket.system_usd || 0).toFixed(2)}</span><span>$${Number(ticket.declared_usd || 0).toFixed(2)}</span></div>
        <div class="row"><span>USDT:</span><span>$${Number(ticket.system_usdt || 0).toFixed(2)}</span><span>$${Number(ticket.declared_usdt || 0).toFixed(2)}</span></div>
        <div class="row"><span>VES (Bs):</span><span>Bs. ${Number(ticket.system_ves || 0).toFixed(2)}</span><span>Bs. ${Number(ticket.declared_ves || 0).toFixed(2)}</span></div>
        <div class="divider"></div>
        <div class="row bold"><span>Ventas Registradas:</span><span>${ticket.sales_count || 0}</span></div>
        ${itemsHtml ? `
          <div class="divider"></div>
          <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">PRODUCTOS VENDIDOS:</div>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th style="text-align: center;">Cant</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        ` : ''}
        <div class="divider"></div>
        <div class="center" style="font-size: 10px; margin-top: 10px; font-weight: bold;">*** TICKET GENERADO CON ÉXITO ***</div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    fetchAlerts();
    fetchSettings();
    if (activeTab === 'inventory') fetchProducts();
    if (activeTab === 'users') fetchWorkers();
    if (activeTab === 'customers') fetchCustomers();
    if (activeTab === 'metrics') calculateMetrics();
    if (activeTab === 'expenses') fetchRecurringExpensesAll();
    if (activeTab === 'settings') fetchPaymentMethods();
  }, [activeTab, metricFilter]);

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').order('created_at', { ascending: true });
    if (data) setPaymentMethods(data);
  };

  const fetchSettings = async () => {
    // Fetch stored markup percentage
    const { data: vesData } = await supabase.from('settings').select('value').eq('id', 'ves_markup_percentage').single();
    if (vesData) setVesMarkupPercentage(vesData.value);

    // Fetch whatsapp message (ignoring error if column does not exist yet)
    let wpData = null;
    try {
        const res = await supabase.from('settings').select('text_value').eq('id', 'whatsapp_message').single();
        wpData = res.data;
    } catch(e) {}
    if (wpData && wpData.text_value) setWhatsappMessage(wpData.text_value);

    // Fetch loyalty settings
    const { data: loyaltySettings } = await supabase.from('settings').select('*').in('id', [
        'loyalty_earning_rate', 'loyalty_spending_rate', 'loyalty_min_spend', 'loyalty_max_redemption_percentage',
        'loyalty_reward_mode', 'loyalty_reward_threshold', 'loyalty_reward_type', 'loyalty_reward_value'
    ]);
    if (loyaltySettings) {
        loyaltySettings.forEach(setting => {
            switch(setting.id) {
                case 'loyalty_earning_rate': setLoyaltyEarningRate(setting.value); break;
                case 'loyalty_spending_rate': setLoyaltySpendingRate(setting.value); break;
                case 'loyalty_min_spend': setLoyaltyMinSpend(setting.value); break;
                case 'loyalty_max_redemption_percentage': setLoyaltyMaxRedemptionPercentage(setting.value); break;
                case 'loyalty_reward_mode': setLoyaltyRewardMode(setting.value === 1); break;
                case 'loyalty_reward_threshold': setLoyaltyRewardThreshold(setting.value); break;
                case 'loyalty_reward_type': setLoyaltyRewardType(setting.value === 1 ? 'percentage' : 'fixed'); break;
                case 'loyalty_reward_value': setLoyaltyRewardValue(setting.value); break;
            }
        });
    }

    // Fetch official rate from api with fallback
    try {
      let fetchedRate: number | null = null;
      let fetchedDate = new Date().toISOString().split('T')[0];
      try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (response.ok) {
          const json = await response.json();
          if (json && typeof json.promedio === 'number') {
            fetchedRate = json.promedio;
            if (json.fechaActualizacion) {
              fetchedDate = json.fechaActualizacion.split('T')[0];
            }
          }
        }
      } catch {
        // Silent fallback on network/CORS error
      }

      if (fetchedRate) {
        setOfficialBcv({ rate: fetchedRate, date: fetchedDate });
      } else {
        setOfficialBcv({ rate: 36.50, date: fetchedDate });
      }
    } catch {
      setOfficialBcv({ rate: 36.50, date: new Date().toISOString().split('T')[0] });
    }
  };

  const updateSettings = async () => {
    const timestamp = new Date().toISOString();
    const settingsToUpsert = [
        { id: 'ves_markup_percentage', value: vesMarkupPercentage, updated_at: timestamp },
        { id: 'whatsapp_message', value: 0, text_value: whatsappMessage, updated_at: timestamp },
        { id: 'loyalty_earning_rate', value: loyaltyEarningRate, updated_at: timestamp },
        { id: 'loyalty_spending_rate', value: loyaltySpendingRate, updated_at: timestamp },
        { id: 'loyalty_min_spend', value: loyaltyMinSpend, updated_at: timestamp },
        { id: 'loyalty_max_redemption_percentage', value: loyaltyMaxRedemptionPercentage, updated_at: timestamp },
        { id: 'loyalty_reward_mode', value: loyaltyRewardMode ? 1 : 0, updated_at: timestamp },
        { id: 'loyalty_reward_threshold', value: loyaltyRewardThreshold, updated_at: timestamp },
        { id: 'loyalty_reward_type', value: loyaltyRewardType === 'percentage' ? 1 : 2, updated_at: timestamp },
        { id: 'loyalty_reward_value', value: loyaltyRewardValue, updated_at: timestamp }
    ];

    const { error } = await supabase.from('settings').upsert(settingsToUpsert);
    if (error) showToast("Error al actualizar configuración: " + error.message);
    else showToast("Configuración actualizada exitosamente.");
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (data) setProducts(data);
    const { data: catData } = await supabase.from('product_categories').select('*').order('name');
    if (catData) setProductCategories(catData);
  };

  const fetchWorkers = async () => {
    const { data } = await supabase.from('worker_profiles').select('*');
    if (data) setWorkers(data);
  };

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('*');
    if (data) setCustomers(data);
  };

  const exportCustomers = () => {
    if(customers.length === 0) {
      showToast("No hay clientes para exportar.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(customers.map(c => ({
        'Cédula': c.document_id,
        'Nombres': c.first_name,
        'Apellidos': c.last_name,
        'Teléfono': c.phone,
        'Email': c.email,
        'Puntos de Fidelidad': c.loyalty_points,
        'Fecha Registro': new Date(c.created_at).toLocaleDateString()
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");
    XLSX.writeFile(wb, "Base_Datos_Clientes.xlsx");
  };

  const fetchAlerts = async () => {
    const { data } = await supabase.from('recurring_expenses').select('*').eq('is_active', true);
    if (data) {
      const dueSoon = data.filter(exp => differenceInDays(new Date(exp.next_due_date), new Date()) <= 10);
      setRecurringExpenses(dueSoon);
    }
  };

  const fetchRecurringExpensesAll = async () => {
    const { data } = await supabase.from('recurring_expenses').select('*');
    if (data) setAllExpensesList(data);
  }

  const [allExpensesList, setAllExpensesList] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'expenses') {
       supabase.from('recurring_expenses').select('*').then(({data}) => {
         if (data) setAllExpensesList(data);
       });
    }
  }, [activeTab]);

  const calculateMetrics = async () => {
    let startDate = startOfDay(new Date());
    if (metricFilter === 'week') startDate = startOfWeek(new Date());
    if (metricFilter === 'month') startDate = startOfMonth(new Date());

    const { data: salesData } = await supabase
      .from('sales')
      .select('id, total_usd, cost_usd, created_at, payment_method, seller_id, worker_profiles(first_name, last_name)')
      .gte('created_at', startDate.toISOString())
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });

    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('quantity, product_id, products(name)')
      .gte('created_at', startDate.toISOString());

    const { data: closuresData } = await supabase
      .from('cash_closures')
      .select('*, worker_profiles(first_name, last_name)')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });
      
    if (closuresData) setCashClosures(closuresData);

    const { data: expensesData } = await supabase
      .from('expenses')
      .select('amount_usd')
      .gte('expense_date', startDate.toISOString());

    let totalSales = 0;
    let totalCost = 0;
    if (salesData) {
      salesData.forEach((s: any) => {
        totalSales += Number(s.total_usd || 0);
        totalCost += Number(s.cost_usd || 0); // Requires a trigger or manual calculation, we fallback to 0 for now if not set
      });
      setSalesList(salesData);
    }
    
    // Calculate top products
    if (itemsData) {
        const productCounts: Record<string, {name: string, qty: number}> = {};
        itemsData.forEach((item: any) => {
            if(!item.products) return;
            const pid = item.product_id;
            if(!productCounts[pid]) {
                productCounts[pid] = { name: item.products.name, qty: 0 };
            }
            productCounts[pid].qty += item.quantity;
        });
        const top = Object.values(productCounts).sort((a,b) => b.qty - a.qty).slice(0, 10);
        setTopProducts(top);
    }

    let totalExpenses = 0;
    if (expensesData) {
      expensesData.forEach(e => {
         totalExpenses += Number(e.amount_usd);
      });
    }

    // Ganancia Neta = Ventas - Costo de Ventas - Gastos
    const productProfit = totalSales - totalCost;
    const netProfit = productProfit - totalExpenses;

    setMetrics({ sales: totalSales, expenses: totalExpenses + totalCost, netProfit: netProfit, productProfit: productProfit });
  };

  const payRecurringExpense = async (expense: any) => {
    const newDueDate = expense.frequency === 'monthly' ? addDays(new Date(expense.next_due_date), 30) : addDays(new Date(expense.next_due_date), 7);
    
    // Registrar el gasto
    await supabase.from('expenses').insert([{
      description: expense.description,
      amount_usd: expense.amount_usd,
      category: 'recurring',
    }]);

    // Actualizar el próximo pago
    await supabase.from('recurring_expenses').update({ next_due_date: newDueDate.toISOString() }).eq('id', expense.id);
    
    showToast(`Gasto ${expense.description} marcado como pagado.`);
    fetchAlerts();
    if (activeTab === 'expenses') fetchRecurringExpensesAll();
  };

  // HANDLERS CRUD
  const handleSaveProduct = async () => {
    if (productForm.id) {
       const { error } = await supabase.from('products').update(productForm).eq('id', productForm.id);
       if (error) showToast("Error actualizando: " + error.message);
       else showToast("Producto actualizado exitosamente.");
    } else {
       // Nuevo
       const { error } = await supabase.from('products').insert([productForm]);
       if (error) showToast("Error creando: " + error.message);
       else {
         // Registro de gasto de inventario inicial
         await supabase.from('expenses').insert([{
           description: `Ingreso de mercancía: ${productForm.name}`,
           amount_usd: productForm.cost_price * productForm.stock_quantity,
           category: 'inventory_purchase'
         }]);
         showToast("Producto y gasto de mercancía registrados.");
       }
    }
    setIsProductModalOpen(false);
    setProductForm({ name: '', category: 'General', subcategory: '', sku: '', cost_price: 0, sale_price: 0, stock_quantity: 0 });
    fetchProducts();
  };

  const handleSaveCategory = async () => {
      const catTitle = newCategoryName.trim();
      if(!catTitle) {
        showToast("Debes ingresar el título de la categoría.");
        return;
      }

      // 1. Guardar o verificar Categoría Principal
      const { data: existingCat } = await supabase.from('product_categories').select('*').eq('name', catTitle).single();
      
      if (!existingCat) {
         const { error: catErr } = await supabase.from('product_categories').insert([{
             name: catTitle,
             description: newCategoryDescription.trim() || null,
             parent_category: null
         }]);
         if (catErr) {
            showToast("Error creando categoría: " + catErr.message);
            return;
         }
      }

      // 2. Guardar Subcategorías si hay
      const validSubcategories = subcategoriesList.map(s => s.trim()).filter(s => s.length > 0);
      let firstCreatedSubcat = "";

      for (const subTitle of validSubcategories) {
         const { error: subErr } = await supabase.from('product_categories').insert([{
             name: subTitle,
             description: newCategoryDescription.trim() || null,
             parent_category: catTitle
         }]);
         if (subErr) {
            console.error("Error creando subcategoría:", subErr.message);
         } else if (!firstCreatedSubcat) {
            firstCreatedSubcat = subTitle;
         }
      }

      showToast("Categoría y subcategorías guardadas exitosamente.");
      setIsCategoryModalOpen(false);
      
      // Auto-seleccionar la categoría y la primera subcategoría creada
      setProductForm(prev => ({
        ...prev,
        category: catTitle,
        subcategory: firstCreatedSubcat || prev.subcategory
      }));

      // Resetear campos
      setNewCategoryName("");
      setNewCategoryDescription("");
      setSubcategoriesList([]);
      
      fetchProducts();
  };

  const handleDeleteProduct = (product: any) => {
    setProductToDelete(product);
    setIsDeleteProductModalOpen(true);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      // Soft delete para preservar historial de ventas
      const { data, error } = await supabase.from('products').update({ is_active: false }).eq('id', productToDelete.id).select();
      
      if (error) {
         showToast("Error al eliminar producto: " + error.message);
      } else if (!data || data.length === 0) {
         showToast("Producto no encontrado o error de permisos de administrador.");
      } else {
         showToast("Producto eliminado (desactivado) del inventario exitosamente.");
         fetchProducts();
         setIsDeleteProductModalOpen(false);
         setProductToDelete(null);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Error al eliminar producto: " + err.message);
    }
  };

  const handleSavePaymentMethod = async () => {
    const payload = {
      name: paymentMethodForm.name,
      currency: paymentMethodForm.currency,
      discount_percentage: paymentMethodForm.discount_percentage || 0,
      surcharge_percentage: paymentMethodForm.surcharge_percentage || 0,
      is_active: paymentMethodForm.is_active
    };

    try {
      if (paymentMethodForm.id) {
         const { error } = await supabase.from('payment_methods').update(payload).eq('id', paymentMethodForm.id);
         if (error) {
            console.error("Error al actualizar método de pago:", error);
            const isMissingColumn = (error.message || '').includes('surcharge_percentage') || error.code === 'PGRST204';
            
            if (isMissingColumn) {
               setSchemaErrorSql('ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) DEFAULT 0;');
               setIsSchemaErrorModalOpen(true);
               setIsSqlCopiado(false);
               
               // Fallback: update without surcharge_percentage
               const { error: fallbackErr } = await supabase.from('payment_methods').update({
                  name: paymentMethodForm.name,
                  currency: paymentMethodForm.currency,
                  discount_percentage: paymentMethodForm.discount_percentage || 0,
                  is_active: paymentMethodForm.is_active
               }).eq('id', paymentMethodForm.id);
               
               if (fallbackErr) {
                  showToast("Error al actualizar (fallback): " + fallbackErr.message);
                  return;
               }
               showToast("Se actualizó, pero el recargo NO se guardó (falta columna en Supabase)");
            } else {
               showToast("Error al actualizar: " + error.message);
               return;
            }
         } else {
            showToast("Método de pago actualizado exitosamente");
         }
      } else {
         const { error } = await supabase.from('payment_methods').insert([payload]);
         if (error) {
            console.error("Error al registrar método de pago:", error);
            const isMissingColumn = (error.message || '').includes('surcharge_percentage') || error.code === 'PGRST204';
            
            if (isMissingColumn) {
               setSchemaErrorSql('ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) DEFAULT 0;');
               setIsSchemaErrorModalOpen(true);
               setIsSqlCopiado(false);
               
               // Fallback: insert without surcharge_percentage
               const { error: fallbackErr } = await supabase.from('payment_methods').insert([{
                  name: paymentMethodForm.name,
                  currency: paymentMethodForm.currency,
                  discount_percentage: paymentMethodForm.discount_percentage || 0,
                  is_active: paymentMethodForm.is_active
               }]);
               
               if (fallbackErr) {
                  showToast("Error al crear (fallback): " + fallbackErr.message);
                  return;
               }
               showToast("Se registró, pero el recargo NO se guardó (falta columna en Supabase)");
            } else {
               showToast("Error al crear: " + error.message);
               return;
            }
         } else {
            showToast("Método de pago registrado exitosamente");
         }
      }
      setIsPaymentMethodModalOpen(false);
      fetchPaymentMethods();
    } catch (err: any) {
      console.error(err);
      showToast("Error inesperado al guardar método de pago: " + err.message);
    }
  };

  const handleDeletePaymentMethod = async (id: string) => {
      await supabase.from('payment_methods').delete().eq('id', id);
      showToast("Método de pago eliminado");
      fetchPaymentMethods();
  };

  const handlePayExpense = async (expense: any) => {
     // Advance the due date
     const nextDate = expense.frequency === 'monthly' ? addDays(new Date(expense.next_due_date), 30) : addDays(new Date(expense.next_due_date), 7);
     const { error } = await supabase.from('recurring_expenses').update({ next_due_date: format(nextDate, 'yyyy-MM-dd') }).eq('id', expense.id);
     
     if(error) {
         showToast("Error al procesar pago: " + error.message);
         return;
     }
     
     // Optionally create an expense record somewhere if we had an expenses log, but for now just move the date as requested.
     showToast(`Gasto ${expense.description} marcado como pagado. Próximo cobro: ${format(nextDate, 'dd/MM/yyyy')}`);
     fetchAlerts();
     if (activeTab === 'expenses') fetchRecurringExpensesAll();
  };

  const handleSaveExpense = async () => {
     let error;
     if (expenseForm.id) {
         const { error: updateError } = await supabase.from('recurring_expenses').update(expenseForm).eq('id', expenseForm.id);
         error = updateError;
     } else {
         const { error: insertError } = await supabase.from('recurring_expenses').insert([expenseForm]);
         error = insertError;
     }

     if (error) {
         if (error.message.includes('Could not find the table')) {
             showToast("Falta la tabla en la base de datos. Por favor, ejecuta el archivo supabase_schema.sql en el SQL Editor de tu cuenta de Supabase.");
         } else {
             showToast("Error guardando gasto: " + error.message);
         }
     } else {
         showToast("Gasto recurrente guardado exitosamente.");
     }
     setIsExpenseModalOpen(false);
     setExpenseForm({ description: '', amount_usd: 0, frequency: 'monthly', next_due_date: format(new Date(), 'yyyy-MM-dd') });
     fetchAlerts();
     if (activeTab === 'expenses') fetchRecurringExpensesAll();
  };

  const handleDeleteExpense = (expense: any) => {
     setExpenseToDelete(expense);
     setIsDeleteExpenseModalOpen(true);
  };

  const handleConfirmDeleteExpense = async () => {
     if (!expenseToDelete) return;
     try {
        const { data, error } = await supabase.from('recurring_expenses').delete().eq('id', expenseToDelete.id).select();
        if (error) {
           showToast("Error al eliminar gasto: " + error.message);
        } else if (!data || data.length === 0) {
           showToast("Gasto no encontrado o error de permisos de administrador.");
        } else {
           showToast("Gasto eliminado exitosamente.");
           fetchAlerts();
           if (activeTab === 'expenses') fetchRecurringExpensesAll();
           setIsDeleteExpenseModalOpen(false);
           setExpenseToDelete(null);
        }
     } catch (err: any) {
        console.error(err);
        showToast("Error al eliminar gasto: " + err.message);
     }
  };

  const handleSaveWorker = async () => {
     if (workerForm.id) {
       // Updating existing worker profile
       const { error } = await supabase.from('worker_profiles').update({
         first_name: workerForm.first_name,
         last_name: workerForm.last_name,
         document_id: workerForm.document_id,
         phone: workerForm.phone,
         role: workerForm.role
       }).eq('id', workerForm.id);

       if (error) {
         showToast("Error al actualizar perfil: " + error.message);
       } else {
         showToast("Vendedor actualizado exitosamente.");
         setIsWorkerModalOpen(false);
         fetchWorkers();
       }
       return;
     }

     if (!workerForm.document_id || !workerForm.password || !workerForm.first_name || !workerForm.last_name) {
       showToast("Cédula, nombre, apellido y contraseña son obligatorios.");
       return;
     }

     setIsSubmitting(true);
     // Create a secondary client just for auth so we don't sign out the admin
     const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { 
          persistSession: true, 
          autoRefreshToken: false,
          storageKey: 'supabase.auth.temp.' + Date.now()
        }
     });

     const virtualEmail = workerForm.email ? workerForm.email : `${workerForm.document_id.trim()}@caloricofit.com`;

     const { data, error } = await authClient.auth.signUp({
        email: virtualEmail,
        password: workerForm.password,
        options: {
           data: {
              first_name: workerForm.first_name,
              last_name: workerForm.last_name,
              document_id: workerForm.document_id,
              phone: workerForm.phone,
              role: workerForm.role
           }
        }
     });
     
     if (error) {
        setIsSubmitting(false);
        if (error.message.toLowerCase().includes('rate limit')) {
           showToast("Límite de Supabase alcanzado. Desactiva 'Confirm Email' en Authentication -> Providers -> Email.");
        } else if (error.message.toLowerCase().includes('already registered')) {
           showToast("❌ Esta cédula (o correo) ya está registrada en Auth. Si no sale en la lista, bórralo desde Supabase -> Authentication y vuelve a crearlo acá.");
        } else {
           showToast("Error creando usuario: " + error.message);
        }
        return;
     }

     // Use the main client (which has the admin session) to insert or update the profile just in case the trigger fails.
     // Also, since they might not have the trigger yet, let's keep the manual insert, but wait, the RLS might be failing.
     // Let's rely on the manual insert with upsert. But actually, if they get an error, let's SHOW the error!
     let errorMessage = "";
     if (data.user) {
        // Try to insert manually/upsert in case the trigger fired first or is not set up
        const { error: profileError } = await supabase.from('worker_profiles').upsert({
           id: data.user.id,
           first_name: workerForm.first_name,
           last_name: workerForm.last_name,
           document_id: workerForm.document_id,
           phone: workerForm.phone,
           role: workerForm.role
        }, { onConflict: 'id' });
        
        if (profileError) {
           errorMessage = profileError.message;
           console.error("Profile insert error: ", profileError);
        }
     }
     
     if (errorMessage) {
         showToast("Usuario creado en Auth pero falló el perfil: " + errorMessage + ". Intenta ejecutar el trigger SQL.");
     } else {
         showToast("Vendedor creado exitosamente.");
     }
     
     setIsWorkerModalOpen(false);
     fetchWorkers();
  };

  const handleDeleteWorker = async (id: string) => {
    await supabase.from('worker_profiles').delete().eq('id', id);
    showToast("Perfil de vendedor eliminado.");
    fetchWorkers();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'metrics':
        return (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Métricas Generales</h2>
              <select 
                title="Filtrar por periodo"
                className="bg-white border text-sm font-medium border-gray-300 text-gray-700 py-2 px-4 rounded-lg outline-none"
                value={metricFilter}
                onChange={(e) => setMetricFilter(e.target.value as any)}
              >
                <option value="day">Ventas del Día</option>
                <option value="week">Ventas de la Semana</option>
                <option value="month">Ventas del Mes</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
                <div className="text-sm font-bold tracking-wider text-gray-500 mb-1 uppercase">Total Ventas Brutas</div>
                <div className="text-3xl font-bold text-gray-900">${Number(metrics.sales || 0).toFixed(2)}</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-red-500">
                <div className="text-sm font-bold tracking-wider text-gray-500 mb-1 uppercase">Gastos e Inversión</div>
                <div className="text-3xl font-bold text-gray-900">${Number(metrics.expenses || 0).toFixed(2)}</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-purple-500">
                <div className="text-sm font-bold tracking-wider text-gray-500 mb-1 uppercase">Ganancia Prod.</div>
                <div className={`text-3xl font-bold text-gray-900`}>${Number(metrics.productProfit || 0).toFixed(2)}</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-green-500">
                <div className="text-sm font-bold tracking-wider text-gray-500 mb-1 uppercase">Ganancia Neta</div>
                <div className={`text-3xl font-bold ${metrics.netProfit >= 0 ? "text-green-600" : "text-red-500"}`}>${Number(metrics.netProfit || 0).toFixed(2)}</div>
              </div>
            </div>

            <div className="mb-8">
               <button onClick={handleCalculateInventoryCost} className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
                  Calcular Costo Total del Inventario en Existencia
               </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                 <div className="p-4 border-b border-gray-200 bg-gray-50 font-bold">Top 10 Productos Más Vendidos</div>
                 <div className="p-4">
                    {topProducts.map((tp, idx) => (
                        <div key={idx} className="flex justify-between py-2 border-b last:border-0 border-gray-100">
                            <span className="text-gray-700">{tp.name}</span>
                            <span className="font-bold">{tp.qty} unds</span>
                        </div>
                    ))}
                    {topProducts.length === 0 && <div className="text-gray-500 text-sm text-center">No hay datos suficientes.</div>}
                 </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                 <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-wrap justify-between items-center gap-2">
                    <div className="font-bold text-gray-900">Cierres de Caja (Turnos)</div>
                    <div className="flex items-center gap-2">
                       <button
                         onClick={handleOpenDownloadModal}
                         className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                         title="Descargar historial de cierres en Excel"
                       >
                         <Download className="w-3.5 h-3.5" /> Descargar
                       </button>
                       <button
                         onClick={handleOpenClearModal}
                         className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                         title="Limpiar historial de cierres de caja"
                       >
                         <Trash2 className="w-3.5 h-3.5" /> Limpiar
                       </button>
                    </div>
                 </div>
                 <div className="p-4 max-h-[350px] overflow-y-auto space-y-3">
                    {cashClosures.map(c => (
                        <div key={c.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50/80 hover:bg-white transition-all shadow-xs">
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                                <div>
                                  <div className="font-bold text-gray-900 text-sm">
                                    {c.worker_profiles?.first_name || 'Usuario'} {c.worker_profiles?.last_name || ''}
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    {new Date(c.created_at).toLocaleString()}
                                  </div>
                                </div>
                                <button
                                  onClick={() => openClosureTicket(c)}
                                  className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Ver Cierre de Caja
                                </button>
                            </div>
                            <div className="text-xs text-gray-600 grid grid-cols-3 gap-1 bg-white p-2 rounded border border-gray-100">
                                <div><span className="text-gray-400 block text-[10px]">FÍSICO USD</span><span className="font-bold text-gray-800">${Number(c.declared_usd || 0).toFixed(2)}</span></div>
                                <div><span className="text-gray-400 block text-[10px]">USDT</span><span className="font-bold text-gray-800">${Number(c.declared_usdt || 0).toFixed(2)}</span></div>
                                <div><span className="text-gray-400 block text-[10px]">VES</span><span className="font-bold text-gray-800">Bs. {Number(c.declared_ves || 0).toFixed(2)}</span></div>
                            </div>
                        </div>
                    ))}
                    {cashClosures.length === 0 && <div className="text-gray-500 text-sm text-center py-6">No hay cierres recientes.</div>}
                 </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
    <span className="font-bold">Lista de Ventas ({metricFilter})</span>
    <button onClick={handleClearSalesClick} className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1">
       <Trash2 className="w-4 h-4"/> Limpiar Ventas
    </button>
</div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                            <tr>
                                <th className="p-3">Fecha/Hora</th>
                                <th className="p-3">Vendedor</th>
                                <th className="p-3">Método</th>
                                <th className="p-3">Costo</th>
                                <th className="p-3">Venta</th>
                                <th className="p-3">Ganancia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {salesList.map(s => {
                                const profit = Number(s.total_usd || 0) - Number(s.cost_usd || 0);
                                return (
                                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 text-gray-600">{new Date(s.created_at).toLocaleString()}</td>
                                    <td className="p-3 font-medium text-gray-900">{s.worker_profiles?.first_name} {s.worker_profiles?.last_name}</td>
                                    <td className="p-3 text-gray-600">{s.payment_method || 'CASH_USD'}</td>
                                    <td className="p-3 text-gray-500">${Number(s.cost_usd || 0).toFixed(2)}</td>
                                    <td className="p-3 font-bold">${Number(s.total_usd || 0).toFixed(2)}</td>
                                    <td className={`p-3 font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>${profit.toFixed(2)}</td>
                                </tr>
                            )})}
                            {salesList.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">No hay ventas registradas.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
          </>
        );
      case 'inventory':
        let filteredProducts = inventoryFilterCategory === 'ALL' 
            ? [...products] 
            : products.filter(p => p.category === inventoryFilterCategory || p.subcategory === inventoryFilterCategory);

        if (inventorySort === 'NAME') {
            filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
        } else if (inventorySort === 'STOCK_LOW') {
            filteredProducts.sort((a, b) => a.stock_quantity - b.stock_quantity);
        }
        // LATEST is handled by the default fetch order, but we can rely on order array

        return (
          <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h2 className="text-2xl font-bold text-gray-900">Inventario y Categorías</h2>
              <div className="flex flex-wrap gap-2">
                  <select 
                      className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black text-sm"
                      value={inventoryFilterCategory}
                      onChange={(e) => setInventoryFilterCategory(e.target.value)}
                  >
                      <option value="ALL">Todas las Categorías</option>
                      {productCategories.map(c => (
                          <option key={c.id} value={c.name}>{c.name} {c.parent_category ? `(Sub de ${c.parent_category})` : ''}</option>
                      ))}
                  </select>
                  <select 
                      className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black text-sm"
                      value={inventorySort}
                      onChange={(e) => setInventorySort(e.target.value)}
                  >
                      <option value="LATEST">Últimos Agregados</option>
                      <option value="NAME">Por Nombre</option>
                      <option value="STOCK_LOW">Menor Stock</option>
                  </select>
                  <button 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm border border-gray-300">
                    <Plus className="w-4 h-4"/> Categoría
                  </button>
                  <button 
                    onClick={() => { setProductForm({ name: '', category: 'General', subcategory: '', sku: '', cost_price: 0, sale_price: 0, stock_quantity: 0 }); setIsProductModalOpen(true); }}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm">
                    <Plus className="w-4 h-4"/> Mercancía
                  </button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-medium">Producto</th>
                    <th className="p-4 font-medium">Categoría</th>
                    <th className="p-4 font-medium text-center">Stock</th>
                    <th className="p-4 font-medium text-right">Costo Base</th>
                    <th className="p-4 font-medium text-right">Precio Venta</th>
                    <th className="p-4 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-500">No hay productos registrados en esta categoría.</td></tr>
                  ) : (
                    filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td className="p-4 font-medium">{p.name}<div className="text-xs text-gray-400 font-mono">{p.sku}</div></td>
                        <td className="p-4 text-sm text-gray-600">
                            {p.category} {p.subcategory && <span className="text-gray-400">/ {p.subcategory}</span>}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${p.stock_quantity > 10 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {p.stock_quantity}
                          </span>
                        </td>
                        <td className="p-4 text-right text-gray-500">${p.cost_price}</td>
                        <td className="p-4 text-right font-bold">${p.sale_price}</td>
                        <td className="p-4 text-center">
                           <button onClick={() => { setProductForm(p); setIsProductModalOpen(true); }} className="text-blue-500 hover:text-blue-700 mx-2" title="Editar"><Edit className="w-4 h-4"/></button>
                           <button onClick={() => handleDeleteProduct(p)} className="text-red-500 hover:text-red-700 mx-2" title="Eliminar"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        );
      case 'users':
        return (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Gestión de Vendedores</h2>
              <button 
                onClick={() => { setWorkerForm({ email: '', password: '', first_name: '', last_name: '', document_id: '', phone: '', role: 'seller' }); setIsWorkerModalOpen(true); }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                <Plus className="w-5 h-5"/> Agregar Vendedor
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {workers.map(w => (
                <div key={w.id} className={`bg-white border ${w.is_active === false ? 'border-red-200 bg-red-50' : 'border-gray-200'} rounded-xl p-6 shadow-sm relative`}>
                  {w.is_active === false && <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-lg rounded-tr-lg font-bold">INACTIVO</div>}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {w.first_name} {w.last_name}
                        {w.role === 'admin' && <span className="bg-black text-white text-xs px-2 py-0.5 rounded uppercase">Admin</span>}
                      </h3>
                      <div className="text-sm text-gray-500 font-mono mt-1">V-{w.document_id || 'N/A'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          const newStatus = w.is_active === false ? true : false;
                          const { error } = await supabase.from('worker_profiles').update({ is_active: newStatus }).eq('id', w.id);
                          if(error) showToast("Error: " + error.message); else fetchWorkers();
                        }} 
                        className={`text-xs px-3 py-1 rounded font-bold ${w.is_active === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                        title={w.is_active === false ? 'Habilitar' : 'Inhabilitar'}
                      >
                        {w.is_active === false ? 'Habilitar' : 'Inhabilitar'}
                      </button>
                      <button 
                        onClick={() => {
                          setWorkerForm({ 
                            document_id: w.document_id || '', 
                            password: '', // Leave empty to not change
                            first_name: w.first_name, 
                            last_name: w.last_name, 
                            phone: w.phone || '', 
                            role: w.role 
                          });
                          // Store ID to know we are editing instead of creating newly
                          setWorkerForm(prev => ({...prev, id: w.id}));
                          setIsWorkerModalOpen(true);
                        }} 
                        className="text-gray-500 hover:text-blue-600 p-1" 
                        title="Editar perfil"
                      >
                        <Edit className="w-4 h-4"/>
                      </button>
                      <button onClick={() => handleDeleteWorker(w.id)} className="text-red-500 hover:text-red-700 p-1" title="Eliminar perfil"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-4 space-y-1">
                    <div><span className="font-medium">📞 Teléfono:</span> {w.phone || 'N/A'}</div>
                    <div><span className="font-medium">✉️ Correo:</span> {w.email || 'N/A'}</div>
                    <div className="text-xs text-gray-400 mt-2">Registrado: {new Date(w.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      case 'customers':
        const filteredCustomers = customers
          .filter(c => 
            `${c.first_name} ${c.last_name} ${c.document_id} ${c.city || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
          )
          .sort((a, b) => customerFilterPoints ? b.loyalty_points - a.loyalty_points : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return (
          <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
               <h2 className="text-2xl font-bold text-gray-900">Base de Datos de Clientes</h2>
               <div className="flex gap-2 w-full md:w-auto">
                 <input 
                   type="text" 
                   placeholder="Buscar por cédula, nombre..." 
                   className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-black flex-1 md:w-64"
                   value={customerSearch}
                   onChange={e => setCustomerSearch(e.target.value)}
                 />
                 <button 
                   onClick={() => setCustomerFilterPoints(!customerFilterPoints)} 
                   className={`px-4 py-2 rounded-lg font-medium border ${customerFilterPoints ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-300 text-gray-600'}`}
                   title="Ordenar por Puntos"
                 >
                   🌟
                 </button>
                 <button 
                   onClick={exportCustomers}
                   className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                 >
                   <Download className="w-5 h-5"/> Exportar (Excel)
                 </button>
               </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-medium">Cliente</th>
                    <th className="p-4 font-medium">Cédula</th>
                    <th className="p-4 font-medium">Contacto / Ciudad</th>
                    <th className="p-4 font-medium text-center">Puntos Fidelidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="p-4 font-bold">{c.first_name} {c.last_name}</td>
                      <td className="p-4 font-mono text-gray-500">{c.document_id}</td>
                      <td className="p-4 text-sm text-gray-500">{c.phone}<br/>{c.email} {c.city ? `• ${c.city}` : ''}</td>
                      <td className="p-4 text-center font-bold text-orange-600">{c.loyalty_points} 🌟</td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-500">No se encontraron clientes.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        );
      case 'expenses':
        return (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Gastos Recurrentes</h2>
              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                <Plus className="w-5 h-5"/> Nuevo Gasto Fijo
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allExpensesList.map(exp => (
                    <div key={exp.id} className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="font-bold text-lg mb-2 flex justify-between items-start">
                               {exp.description}
                               <div className="flex gap-2">
                                 <button onClick={() => { setExpenseForm({...exp, next_due_date: exp.next_due_date.substring(0,10)}); setIsExpenseModalOpen(true); }} className="text-blue-500 hover:text-blue-700">
                                   <Edit className="w-4 h-4"/>
                                 </button>
                                 <button onClick={() => handleDeleteExpense(exp)} className="text-red-500 hover:text-red-700">
                                   <Trash2 className="w-4 h-4"/>
                                 </button>
                               </div>
                           </div>
                           <div className="text-2xl font-bold text-gray-900 mb-2">${exp.amount_usd}</div>
                           <div className={`text-sm ${differenceInDays(new Date(exp.next_due_date), new Date()) <= 3 ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                             Próximo pago: {new Date(exp.next_due_date).toLocaleDateString()}
                           </div>
                           <div className="text-sm text-gray-500 uppercase tracking-widest mt-1">Frecuencia: {exp.frequency === 'monthly' ? 'Mensual' : 'Semanal'}</div>
                        </div>
                        <button 
                          onClick={() => handlePayExpense(exp)}
                          className="w-full mt-4 bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4"/> Pagar Individual
                        </button>
                    </div>
                ))}
            </div>
          </>
        );
      case 'settings':
        return (
          <>
             <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuración del Sistema</h2>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Tasa y Recargos (BCV)</h3>
                    <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
                    <h3 className="font-bold text-gray-700 text-sm mb-2 uppercase">Tasa Oficial BCV</h3>
                    {officialBcv ? (
                        <>
                            <div className="text-3xl font-black text-gray-900">Bs. {Number(officialBcv.rate || 0).toFixed(2)}</div>
                            <div className="text-sm text-gray-500 mt-1">Actualizado: {officialBcv.date}</div>
                        </>
                    ) : (
                        <div className="text-gray-500 animate-pulse">Cargando tasa oficial...</div>
                    )}
                </div>

                <label className="block text-sm font-medium text-gray-700 mb-2">Porcentaje de Recargo Adicional para pagos en VES (%)</label>
                <div className="flex gap-2">
                   <div className="relative flex-1">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                     <input 
                       type="number" 
                       step="0.1" 
                       title="Porcentaje" 
                       className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500 font-bold" 
                       value={vesMarkupPercentage} 
                       onChange={(e) => setVesMarkupPercentage(Number(e.target.value))}
                     />
                   </div>
                   <button onClick={updateSettings} className="bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800">Actualizar</button>
                </div>
                {officialBcv && (
                    <div className="mt-4 text-sm text-gray-500 bg-orange-50 text-orange-800 p-3 rounded">
                        Ejemplo: Un producto de $100 se cobrará a ${(100 * (1 + vesMarkupPercentage/100)).toFixed(2)} y luego se convertirá a Bolívares usando Bs. {Number(officialBcv.rate || 0).toFixed(2)}. Total aproximado: Bs. {(100 * (1 + vesMarkupPercentage/100) * officialBcv.rate).toFixed(2)}
                    </div>
                )}
             </div>

             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Configuración de Envío de Ticket por WhatsApp</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Mensaje por defecto para enviar junto al ticket</label>
                        <textarea 
                            className="w-full px-3 py-2 border rounded resize-none" 
                            rows={3} 
                            value={whatsappMessage} 
                            onChange={e => setWhatsappMessage(e.target.value)} 
                            placeholder="Ej. ¡Hola! Aquí tienes el comprobante de tu compra en Calórico Fit."
                        />
                        <p className="text-xs text-gray-500 mt-1">Este texto aparecerá pre-escrito en WhatsApp Web antes de enviar la imagen del ticket.</p>
                    </div>
                </div>
             </div>

             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Programa de Fidelidad</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Puntos ganados por cada 1 USD gastado</label>
                        <input type="number" className="w-full px-3 py-2 border rounded" value={loyaltyEarningRate} onChange={e => setLoyaltyEarningRate(Number(e.target.value))} />
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-bold mb-2">Opción 1: Canje por Monto (Dólares)</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Puntos necesarios para 1 USD</label>
                                <input type="number" disabled={loyaltyRewardMode} className="w-full px-3 py-2 border rounded disabled:bg-gray-100" value={loyaltySpendingRate} onChange={e => setLoyaltySpendingRate(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Mínimo de puntos para usar</label>
                                <input type="number" disabled={loyaltyRewardMode} className="w-full px-3 py-2 border rounded disabled:bg-gray-100" value={loyaltyMinSpend} onChange={e => setLoyaltyMinSpend(Number(e.target.value))} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Máx. de venta pagable con puntos (%)</label>
                                <input type="number" min="1" max="100" disabled={loyaltyRewardMode} className="w-full px-3 py-2 border rounded disabled:bg-gray-100" value={loyaltyMaxRedemptionPercentage} onChange={e => setLoyaltyMaxRedemptionPercentage(Number(e.target.value))} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <label className="block text-sm font-bold">Opción 2: Canje por Recompensa Fija/Porcentaje</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={loyaltyRewardMode} onChange={e => setLoyaltyRewardMode(e.target.checked)} className="rounded text-orange-500 focus:ring-orange-500" />
                                <span className="text-sm font-medium">Activar Opción 2</span>
                            </label>
                        </div>
                        {loyaltyRewardMode && (
                            <div className="space-y-3 bg-orange-50 p-4 rounded border border-orange-100">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Meta de puntos para canjear</label>
                                    <input type="number" className="w-full px-3 py-2 border rounded" value={loyaltyRewardThreshold} onChange={e => setLoyaltyRewardThreshold(Number(e.target.value))} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Tipo de Recompensa</label>
                                        <select className="w-full px-3 py-2 border rounded" value={loyaltyRewardType} onChange={e => setLoyaltyRewardType(e.target.value)}>
                                            <option value="fixed">Monto Fijo de Descuento ($)</option>
                                            <option value="percentage">Porcentaje de Descuento (%)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Valor</label>
                                        <input type="number" className="w-full px-3 py-2 border rounded" value={loyaltyRewardValue} onChange={e => setLoyaltyRewardValue(Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>
                        )}
                        {!loyaltyRewardMode && (
                            <div className="text-sm text-gray-500 italic">Actívalo para ofrecer premios específicos al llegar a una meta de puntos en lugar del canje libre por USD.</div>
                        )}
                    </div>
                    <button onClick={updateSettings} className="w-full bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800">Guardar Todas las Configuraciones Generales</button>
                </div>
             </div>

             <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Métodos de Pago</h3>
                    <button onClick={() => {
                        setPaymentMethodForm({ name: '', currency: 'USD', discount_percentage: 0, surcharge_percentage: 0, is_active: true });
                        setIsPaymentMethodModalOpen(true);
                    }} className="text-sm bg-black text-white px-3 py-1.5 rounded flex items-center gap-1">
                        <Plus className="w-4 h-4"/> Añadir
                    </button>
                </div>
                <div className="space-y-3">
                    {paymentMethods.map(pm => (
                        <div key={pm.id} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg bg-gray-50">
                            <div>
                                <div className="font-bold text-gray-900 flex items-center gap-2">
                                    {pm.name}
                                    {!pm.is_active && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Inactivo</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 flex gap-3">
                                    <span>Moneda: {pm.currency}</span>
                                    {pm.discount_percentage > 0 && <span className="text-green-600 font-bold">Descuento: -{pm.discount_percentage}%</span>}
                                    {pm.surcharge_percentage > 0 && <span className="text-amber-600 font-bold">Comisión: +{pm.surcharge_percentage}%</span>}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    setPaymentMethodForm(pm);
                                    setIsPaymentMethodModalOpen(true);
                                }} className="text-gray-500 hover:text-blue-600 p-1"><Edit className="w-4 h-4"/></button>
                                <button onClick={() => handleDeletePaymentMethod(pm.id)} className="text-gray-500 hover:text-red-600 p-1"><Trash2 className="w-4 h-4"/></button>
                            </div>
                        </div>
                    ))}
                    {paymentMethods.length === 0 && <div className="text-sm text-gray-500 text-center py-4">No hay métodos de pago registrados.</div>}
                </div>
             </div>
          </div>
          </>
        )
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl z-[100] animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}

      {/* Alertas de Gastos Recurrentes (Barra Superior) */}
      {recurringExpenses.length > 0 && (
        <div className="bg-red-500 text-white px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 animate-pulse" />
            <span className="font-bold">¡Atención! Gastos por vencer:</span>
            {recurringExpenses.map(exp => (
              <span key={exp.id} className="bg-red-600 px-3 py-1 rounded text-sm font-medium">
                {exp.description} (-{differenceInDays(new Date(exp.next_due_date), new Date())} días)
              </span>
            ))}
          </div>
          <button 
            onClick={() => payRecurringExpense(recurringExpenses[0])}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white px-4 py-1.5 rounded font-bold text-sm transition-colors"
          >
            <CheckCircle className="w-4 h-4" /> MARCAR PRIMERO COMO PAGADO
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-6 border-b border-gray-100">
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-orange-500">Calórico</span> Fit
            </h1>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Admin / Propietario
            </span>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <button onClick={() => setActiveTab('metrics')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'metrics' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <BarChart3 className="w-5 h-5" /> Métricas y Finanzas
            </button>
            <button onClick={() => setActiveTab('inventory')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'inventory' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Package className="w-5 h-5" /> Inventario & Inversión
            </button>
            <button onClick={() => setActiveTab('expenses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'expenses' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Calendar className="w-5 h-5" /> Gastos Recurrentes
            </button>
            <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'users' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Users className="w-5 h-5" /> Vendedores
            </button>
            <button onClick={() => setActiveTab('customers')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'customers' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <FileText className="w-5 h-5" /> Base CRM
            </button>
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'settings' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Settings className="w-5 h-5" /> Configuración
            </button>
          </nav>
          <div className="p-4 border-t border-gray-200">
            <button 
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" /> Cerrar Sesión
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {renderContent()}
        </main>
      </div>

      {/* MODALES */}
      
      {/* Modal Producto */}
      {isProductModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
               <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="font-bold text-lg">{productForm.id ? 'Editar Producto' : 'Ingresar Mercancía'}</h3>
                  <button onClick={() => setIsProductModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
               </div>
               <div className="p-4 space-y-4">
                  <div><label className="block text-sm font-medium mb-1">Nombre</label><input type="text" className="w-full px-3 py-2 border rounded" value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-sm font-medium">Categoría</label>
                            <button
                              type="button"
                              onClick={() => {
                                setNewCategoryName('');
                                setNewCategoryDescription('');
                                setSubcategoriesList([]);
                                setIsCategoryModalOpen(true);
                              }}
                              className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" /> Crear
                            </button>
                          </div>
                          <select className="w-full px-3 py-2 border rounded" value={productForm.category} onChange={e => {
                              if (e.target.value === '__NEW_CAT__') {
                                setNewCategoryName('');
                                setNewCategoryDescription('');
                                setSubcategoriesList([]);
                                setIsCategoryModalOpen(true);
                              } else {
                                setProductForm({...productForm, category: e.target.value, subcategory: ''});
                              }
                          }}>
                              <option value="General">General</option>
                              {productCategories.filter(c => !c.parent_category).map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                              <option value="__NEW_CAT__" className="font-bold text-orange-600">+ Crear nueva categoría...</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium mb-1">Subcategoría</label>
                          <select className="w-full px-3 py-2 border rounded" value={productForm.subcategory || ''} onChange={e => setProductForm({...productForm, subcategory: e.target.value})}>
                              <option value="">Ninguna</option>
                              {productCategories.filter(c => c.parent_category === productForm.category).map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                          </select>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">SKU</label><input type="text" className="w-full px-3 py-2 border rounded" value={productForm.sku} onChange={e => setProductForm({...productForm, sku: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium mb-1">Stock Inicial</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.stock_quantity} onChange={e => setProductForm({...productForm, stock_quantity: Number(e.target.value)})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Costo Base (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.cost_price} onChange={e => setProductForm({...productForm, cost_price: Number(e.target.value)})} /></div>
                    <div><label className="block text-sm font-medium mb-1">Precio Venta (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={productForm.sale_price} onChange={e => setProductForm({...productForm, sale_price: Number(e.target.value)})} /></div>
                  </div>
                  <button onClick={handleSaveProduct} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4">Guardar Producto</button>
               </div>
            </div>
         </div>
      )}

      {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-gray-200">
                   <h3 className="font-bold text-lg">Nueva Categoría de Productos</h3>
                   <button onClick={() => setIsCategoryModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
                </div>
                <div className="p-4 space-y-4">
                   <div>
                       <label className="block text-sm font-medium mb-1">Título de la Categoría</label>
                       <input type="text" placeholder="Ej. Ropa, Suplementos, Accesorios" className="w-full px-3 py-2 border rounded" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
                   </div>
                   <div>
                       <label className="block text-sm font-medium mb-1">Descripción (Opcional)</label>
                       <textarea rows={2} placeholder="Descripción opcional de la categoría..." className="w-full px-3 py-2 border rounded text-sm" value={newCategoryDescription} onChange={e => setNewCategoryDescription(e.target.value)} />
                   </div>

                   {!subcategoriesList || subcategoriesList.length === 0 ? (
                     <button
                       type="button"
                       onClick={() => setSubcategoriesList([''])}
                       className="w-full py-2.5 px-3 border border-dashed border-orange-300 rounded-lg text-orange-600 hover:bg-orange-50 text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                     >
                       <Plus className="w-4 h-4" /> Subcategoría
                     </button>
                   ) : (
                     <div className="bg-orange-50/80 p-3.5 rounded-lg border border-orange-200 space-y-3">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-1.5">
                           <label className="block text-sm font-bold text-orange-950">Subcategorías</label>
                           <div className="relative group">
                             <HelpCircle className="w-4 h-4 text-orange-600 cursor-pointer" />
                             <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl hidden group-hover:block z-50 pointer-events-none leading-relaxed">
                               Esta área está destinada para generar subcategorías de productos. Por ejemplo, si lo que desea es anexar una categoría "ropa" al sistema puede cargar una subcategoría "ropa de dama". Estas subcategorías quedan ligadas a sus categorías generadas que a su vez están ancladas a los productos que se afilien a esas categorías.
                             </div>
                           </div>
                         </div>
                         <button
                           type="button"
                           onClick={() => setSubcategoriesList([])}
                           className="text-xs text-red-500 hover:underline font-medium"
                         >
                           Eliminar todas
                         </button>
                       </div>

                       <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                         {subcategoriesList.map((sub, idx) => (
                           <div key={idx} className="flex items-center gap-2">
                             <input
                               type="text"
                               placeholder={`Ej. Subcategoría ${idx + 1} (ej. Ropa de Dama)`}
                               className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white text-sm focus:border-orange-500 outline-none"
                               value={sub}
                               onChange={e => {
                                 const val = e.target.value;
                                 setSubcategoriesList(prev => {
                                   const next = [...prev];
                                   next[idx] = val;
                                   return next;
                                 });
                               }}
                             />
                             <button
                               type="button"
                               onClick={() => setSubcategoriesList(prev => prev.filter((_, i) => i !== idx))}
                               className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                               title="Eliminar esta subcategoría"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         ))}
                       </div>

                       <button
                         type="button"
                         onClick={() => setSubcategoriesList(prev => [...prev, ''])}
                         className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1 pt-1"
                       >
                         <Plus className="w-3.5 h-3.5" /> Agregar otra subcategoría
                       </button>
                     </div>
                   )}

                   <button onClick={handleSaveCategory} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg mt-2 transition-colors">Guardar Categoría</button>
                </div>
             </div>
          </div>
      )}

      {/* Modal Costo de Inventario */}
      {isInventoryCostModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
               <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="font-bold text-lg">Costo del Inventario</h3>
                  <button onClick={() => setIsInventoryCostModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
               </div>
               <div className="p-6 text-center space-y-4">
                   {inventoryCostData.isCalculating ? (
                       <div className="py-8">
                           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
                           <p className="text-gray-500 font-medium">Calculando inventario en tiempo real...</p>
                       </div>
                   ) : (
                       <>
                           <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
                               <div className="text-sm font-bold tracking-wider text-orange-600 mb-2 uppercase">Costo Total</div>
                               <div className="text-4xl font-bold text-gray-900">${Number(inventoryCostData.totalCost || 0).toFixed(2)}</div>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                               <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                   <div className="text-xs font-bold tracking-wider text-gray-500 mb-1 uppercase">Unidades Físicas</div>
                                   <div className="text-2xl font-bold text-gray-900">{inventoryCostData.totalUnits}</div>
                               </div>
                           </div>
                       </>
                   )}
               </div>
            </div>
         </div>
      )}

      {/* Modal Método de Pago */}
      {isPaymentMethodModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
               <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="font-bold text-lg">{paymentMethodForm.id ? 'Editar Método de Pago' : 'Nuevo Método de Pago'}</h3>
                  <button onClick={() => setIsPaymentMethodModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
               </div>
               <div className="p-4 space-y-4">
                  <div>
                      <label className="block text-sm font-medium mb-1">Nombre (Ej. Zelle, Pago Móvil)</label>
                      <input type="text" className="w-full px-3 py-2 border rounded" value={paymentMethodForm.name} onChange={e => setPaymentMethodForm({...paymentMethodForm, name: e.target.value})} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium mb-1">Moneda del Método</label>
                      <select className="w-full px-3 py-2 border rounded" value={paymentMethodForm.currency} onChange={e => setPaymentMethodForm({...paymentMethodForm, currency: e.target.value})}>
                          <option value="USD">Dólares (USD)</option>
                          <option value="VES">Bolívares (VES)</option>
                          <option value="POINTS">Puntos de Fidelidad</option>
                      </select>
                  </div>
                  <div>
                      <label className="block text-sm font-medium mb-1">Porcentaje de Descuento (%)</label>
                      <input type="number" min="0" max="100" className="w-full px-3 py-2 border rounded" value={paymentMethodForm.discount_percentage || 0} onChange={e => setPaymentMethodForm({...paymentMethodForm, discount_percentage: Number(e.target.value)})} />
                  </div>
                  <div>
                      <label className="block text-sm font-medium mb-1">Porcentaje de Comisión / Recargo Adicional (%)</label>
                      <input type="number" min="0" max="100" step="0.1" className="w-full px-3 py-2 border rounded" value={paymentMethodForm.surcharge_percentage || 0} onChange={e => setPaymentMethodForm({...paymentMethodForm, surcharge_percentage: Number(e.target.value)})} placeholder="0" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id="pm_active" checked={paymentMethodForm.is_active} onChange={e => setPaymentMethodForm({...paymentMethodForm, is_active: e.target.checked})} />
                      <label htmlFor="pm_active" className="text-sm font-medium">Método Activo</label>
                  </div>
                  <button onClick={handleSavePaymentMethod} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4">Guardar Método</button>
               </div>
            </div>
         </div>
      )}

      {/* Modal Error de Base de Datos - Columna Faltante */}
      {isSchemaErrorModalOpen && (
         <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-orange-200">
               <div className="bg-orange-50 border-b border-orange-100 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-orange-700">
                     <AlertTriangle className="w-5 h-5" />
                     <h3 className="font-bold text-base">Acción Requerida: Actualizar Base de Datos</h3>
                  </div>
                  <button onClick={() => setIsSchemaErrorModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                     <X className="w-5 h-5"/>
                  </button>
               </div>
               <div className="p-6 space-y-4 text-black">
                  <p className="text-sm text-gray-700 leading-relaxed">
                     El sistema intentó guardar un recargo adicional para este método de pago, pero la columna <code className="bg-gray-100 text-red-600 px-1 py-0.5 rounded font-mono font-bold text-xs">surcharge_percentage</code> no existe actualmente en tu base de datos de <strong>Supabase</strong>.
                  </p>
                  
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-xs text-amber-950 leading-relaxed">
                     <p className="font-bold mb-1">¿Cómo solucionarlo?</p>
                     <p>Copia el siguiente comando SQL y ejecútalo dentro del <strong>SQL Editor</strong> en tu panel de control de <strong>Supabase</strong>. Esto agregará la columna necesaria para soportar recargos en cualquier momento.</p>
                  </div>

                  <div className="space-y-1">
                     <label className="block text-xs font-bold text-gray-500 uppercase">Comando SQL de Migración</label>
                     <div className="relative">
                        <pre className="bg-gray-950 text-gray-100 p-4 rounded-lg font-mono text-xs overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                           {schemaErrorSql}
                        </pre>
                        <button
                          type="button"
                          onClick={() => {
                             navigator.clipboard.writeText(schemaErrorSql);
                             setIsSqlCopiado(true);
                             setTimeout(() => setIsSqlCopiado(false), 3000);
                          }}
                          className={`absolute right-2 top-2 px-2.5 py-1 text-xs font-bold rounded shadow-md transition-colors ${isSqlCopiado ? 'bg-green-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
                        >
                           {isSqlCopiado ? '¡Copiado!' : 'Copiar SQL'}
                        </button>
                     </div>
                  </div>

                  <div className="bg-gray-50 p-3 rounded text-xs text-gray-500 leading-relaxed">
                     <strong>Nota:</strong> Tu método de pago se guardó correctamente con todos los demás datos (nombre, moneda, descuento), pero el porcentaje de comisión se mantendrá en 0% hasta que ejecutes el comando anterior en Supabase.
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                     <button
                       type="button"
                       onClick={() => setIsSchemaErrorModalOpen(false)}
                       className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-lg transition-colors"
                     >
                        Entendido
                     </button>
                     <button
                       type="button"
                       onClick={() => {
                         navigator.clipboard.writeText(schemaErrorSql);
                         setIsSqlCopiado(true);
                         setTimeout(() => setIsSqlCopiado(false), 3000);
                       }}
                       className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-sm rounded-lg transition-colors flex items-center gap-1.5"
                     >
                        {isSqlCopiado ? '¡Copiado!' : 'Copiar SQL'}
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}

      {/* Modal Gasto */}
      {isExpenseModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
               <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="font-bold text-lg">Nuevo Gasto Fijo</h3>
                  <button onClick={() => setIsExpenseModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
               </div>
               <div className="p-4 space-y-4">
                  <div><label className="block text-sm font-medium mb-1">Descripción del Gasto (Ej. Alquiler)</label><input type="text" className="w-full px-3 py-2 border rounded" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} /></div>
                  <div><label className="block text-sm font-medium mb-1">Monto (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={expenseForm.amount_usd} onChange={e => setExpenseForm({...expenseForm, amount_usd: Number(e.target.value)})} /></div>
                  <div>
                      <label className="block text-sm font-medium mb-1">Frecuencia</label>
                      <select className="w-full px-3 py-2 border rounded" value={expenseForm.frequency} onChange={e => setExpenseForm({...expenseForm, frequency: e.target.value})}>
                          <option value="monthly">Mensual</option>
                          <option value="weekly">Semanal</option>
                      </select>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Próxima Fecha de Pago</label><input type="date" className="w-full px-3 py-2 border rounded" value={expenseForm.next_due_date} onChange={e => setExpenseForm({...expenseForm, next_due_date: e.target.value})} /></div>
                  <button onClick={handleSaveExpense} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4">Registrar Gasto</button>
               </div>
            </div>
         </div>
      )}

      {/* Modal Worker */}
      {isWorkerModalOpen && (
         <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
               <div className="flex justify-between items-center p-4 border-b border-gray-200">
                  <h3 className="font-bold text-lg">Nuevo Vendedor</h3>
                  <button onClick={() => setIsWorkerModalOpen(false)}><X className="w-5 h-5 text-gray-500"/></button>
               </div>
               <div className="p-4 space-y-4">
                  {!workerForm.id && (
                    <div className="bg-orange-50 border border-orange-200 p-3 rounded text-sm text-orange-800">
                        El vendedor podrá iniciar sesión con su <b>Cédula</b> o su <b>Correo Electrónico</b> y contraseña.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Cédula de Identidad</label>
                      <input type="text" disabled={!!workerForm.id} required className="w-full px-3 py-2 border rounded disabled:bg-gray-100 disabled:text-gray-500 font-mono" value={workerForm.document_id} onChange={e => setWorkerForm({...workerForm, document_id: e.target.value})} placeholder="Ej. 12345678" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Correo Electrónico (Opcional)</label>
                      <input type="email" disabled={!!workerForm.id} className="w-full px-3 py-2 border rounded disabled:bg-gray-100 disabled:text-gray-500" value={workerForm.email} onChange={e => setWorkerForm({...workerForm, email: e.target.value})} placeholder="Opcional" />
                    </div>
                  </div>
                  {!workerForm.id && (
                    <div>
                      <label className="block text-sm font-medium mb-1">Contraseña</label>
                      <input type="password" minLength={6} required className="w-full px-3 py-2 border rounded" value={workerForm.password} onChange={e => setWorkerForm({...workerForm, password: e.target.value})} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Nombre</label><input type="text" required className="w-full px-3 py-2 border rounded" value={workerForm.first_name} onChange={e => setWorkerForm({...workerForm, first_name: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium mb-1">Apellido</label><input type="text" required className="w-full px-3 py-2 border rounded" value={workerForm.last_name} onChange={e => setWorkerForm({...workerForm, last_name: e.target.value})} /></div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Teléfono</label><input type="text" className="w-full px-3 py-2 border rounded" value={workerForm.phone} onChange={e => setWorkerForm({...workerForm, phone: e.target.value})} /></div>
                  
                  <button onClick={handleSaveWorker} disabled={isSubmitting} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4 disabled:opacity-50">
                    {isSubmitting ? 'Guardando...' : (workerForm.id ? 'Guardar Cambios' : 'Crear Vendedor')}
                  </button>
               </div>
            </div>
         </div>
      )}

       {/* MODAL DETALLE / TICKET DE CIERRE DE CAJA */}
       {isClosureTicketModalOpen && selectedClosureTicket && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                   <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-orange-600" />
                      <h3 className="font-bold text-gray-900 text-base">Detalle de Cierre de Caja</h3>
                   </div>
                   <button onClick={() => setIsClosureTicketModalOpen(false)} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                   {/* Ticket Box */}
                   <div className="border border-gray-200 rounded-lg p-5 bg-gray-50/70 font-mono text-sm leading-relaxed text-gray-800 shadow-sm">
                      <div className="text-center mb-4 border-b border-dashed border-gray-300 pb-3">
                         <div className="font-extrabold text-xl tracking-wider text-gray-900 uppercase">NOTA DE ENTREGA</div>
                         <div className="font-bold text-base text-gray-800">Ticket de Cierre de Caja</div>
                         <div className="text-xs text-gray-500 font-normal mt-0.5">(documento sin validez fiscal)</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-4 pb-3 border-b border-dashed border-gray-300">
                         <div>
                            <span className="text-gray-500 font-sans">Vendedor / Cajero:</span>
                            <div className="font-bold text-gray-900 text-sm font-sans">
                               {selectedClosureTicket.worker_profiles?.first_name || 'Usuario'} {selectedClosureTicket.worker_profiles?.last_name || ''}
                            </div>
                         </div>
                         <div>
                            <span className="text-gray-500 font-sans">Fecha y Hora de Cierre:</span>
                            <div className="font-bold text-gray-900 text-sm font-sans">
                               {new Date(selectedClosureTicket.created_at).toLocaleString()}
                            </div>
                         </div>
                      </div>

                      {/* Montos Declarados en Caja */}
                      <div className="mb-4 pb-3 border-b border-dashed border-gray-300">
                         <div className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2 font-sans">Declaración e Inspección de Fondos</div>
                         <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-white p-2.5 rounded border border-gray-200">
                               <span className="text-gray-500 block text-[10px] font-sans">Efectivo USD</span>
                               <span className="font-bold text-emerald-700 text-sm">${Number(selectedClosureTicket.declared_usd || 0).toFixed(2)}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded border border-gray-200">
                               <span className="text-gray-500 block text-[10px] font-sans">USDT Cripto</span>
                               <span className="font-bold text-blue-700 text-sm">${Number(selectedClosureTicket.declared_usdt || 0).toFixed(2)}</span>
                            </div>
                            <div className="bg-white p-2.5 rounded border border-gray-200">
                               <span className="text-gray-500 block text-[10px] font-sans">Bolívares VES</span>
                               <span className="font-bold text-purple-700 text-sm">Bs. {Number(selectedClosureTicket.declared_ves || 0).toFixed(2)}</span>
                            </div>
                         </div>
                      </div>

                      {/* Desglose de Productos Vendidos en la Caja */}
                      <div>
                         <div className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2 font-sans flex justify-between items-center">
                            <span>Productos Vendidos por esta Caja</span>
                            {selectedClosureTicket.sales_count > 0 && (
                               <span className="text-orange-600 font-bold">({selectedClosureTicket.sales_count} ventas)</span>
                            )}
                         </div>
                         
                         {(() => {
                            const salesData = selectedClosureTicket.sales_data;
                            if (!salesData || !Array.isArray(salesData) || salesData.length === 0) {
                               return (
                                  <div className="p-4 text-center text-xs text-gray-500 bg-white rounded-lg border border-gray-200 font-sans">
                                     No hay productos registrados en este cierre de caja o fue realizado sin ventas activas.
                                  </div>
                               );
                            }

                            // Agrupar items por nombre de producto
                            const aggregatedProducts: Record<string, { name: string; sku: string; category: string; qty: number; totalUSD: number }> = {};
                            salesData.forEach((sale: any) => {
                               if (sale.items && Array.isArray(sale.items)) {
                                  sale.items.forEach((item: any) => {
                                     const key = item.product_name || 'Producto';
                                     if (!aggregatedProducts[key]) {
                                        aggregatedProducts[key] = {
                                           name: item.product_name || 'Producto',
                                           sku: item.product_sku || '',
                                           category: item.category ? `${item.category}${item.subcategory ? ` (${item.subcategory})` : ''}` : '',
                                           qty: 0,
                                           totalUSD: 0
                                        };
                                     }
                                     aggregatedProducts[key].qty += Number(item.quantity || 1);
                                     aggregatedProducts[key].totalUSD += Number(item.subtotal_usd || 0);
                                  });
                               }
                            });

                            const itemsList = Object.values(aggregatedProducts);

                            if (itemsList.length === 0) {
                               return (
                                  <div className="p-4 text-center text-xs text-gray-500 bg-white rounded-lg border border-gray-200 font-sans">
                                     Sin ítems registrados en el turno.
                                  </div>
                               );
                            }

                            return (
                               <div className="overflow-x-auto bg-white rounded-lg border border-gray-200 font-sans">
                                  <table className="w-full text-xs text-left">
                                     <thead className="bg-gray-100 font-bold border-b border-gray-200 text-gray-700">
                                        <tr>
                                           <th className="p-2.5">Producto / Categoría</th>
                                           <th className="p-2.5 text-center">Cant.</th>
                                           <th className="p-2.5 text-right">Total ($)</th>
                                        </tr>
                                     </thead>
                                     <tbody className="divide-y divide-gray-100">
                                        {itemsList.map((p, idx) => (
                                           <tr key={idx} className="hover:bg-gray-50">
                                              <td className="p-2.5">
                                                 <div className="font-bold text-gray-900">{p.name}</div>
                                                 {p.category && <div className="text-[10px] text-orange-600">{p.category}</div>}
                                              </td>
                                              <td className="p-2.5 text-center font-bold text-gray-800">{p.qty}</td>
                                              <td className="p-2.5 text-right font-bold text-gray-900">${p.totalUSD.toFixed(2)}</td>
                                           </tr>
                                        ))}
                                     </tbody>
                                  </table>
                               </div>
                            );
                         })()}
                      </div>
                   </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2 shrink-0">
                   <button
                      onClick={() => handlePrintClosureTicket(selectedClosureTicket)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                   >
                      <Printer className="w-4 h-4" /> Imprimir Ticket
                   </button>
                   <button
                      onClick={() => setIsClosureTicketModalOpen(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-bold transition-colors"
                   >
                      Cerrar
                   </button>
                </div>
             </div>
          </div>
       )}

       {/* MODAL LIMPIAR HISTORIAL DE CIERRES */}
       {isClearClosuresModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                   <div className="flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <h3 className="font-bold text-gray-900 text-base">Limpiar Historial de Cierres</h3>
                   </div>
                   <button onClick={() => setIsClearClosuresModalOpen(false)} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                {clearStep === 1 ? (
                  <div className="p-5 space-y-4">
                     <p className="text-sm text-gray-600">
                        Selecciona el rango de fecha que deseas eliminar de la base de datos:
                     </p>
                     
                     <div className="space-y-2">
                        {[
                           { id: 'THIS_WEEK', label: 'Esta semana' },
                           { id: 'THIS_MONTH', label: 'Este mes' },
                           { id: 'LAST_3_MONTHS', label: 'Últimos 3 meses' },
                           { id: 'LAST_6_MONTHS', label: 'Últimos 6 meses' },
                           { id: 'ALL', label: 'Borrar TODOS los datos (Histórico completo)' }
                        ].map((item) => (
                           <label key={item.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${clearPeriod === item.id ? 'border-red-500 bg-red-50 text-red-900 font-bold' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
                              <input 
                                 type="radio" 
                                 name="clearPeriod" 
                                 value={item.id} 
                                 checked={clearPeriod === item.id} 
                                 onChange={() => setClearPeriod(item.id as any)} 
                                 className="w-4 h-4 text-red-600 focus:ring-red-500 mr-3"
                              />
                              <span className="text-sm">{item.label}</span>
                           </label>
                        ))}
                     </div>

                     <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                        <button 
                           onClick={() => setIsClearClosuresModalOpen(false)} 
                           className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                        >
                           Cancelar
                        </button>
                        <button 
                           onClick={() => setClearStep(2)} 
                           className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                           Aceptar y Continuar
                        </button>
                     </div>
                  </div>
                ) : (
                  <div className="p-5 space-y-4">
                     <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
                        <div className="font-extrabold text-sm mb-1 flex items-center gap-1.5 text-red-700">
                           <Bell className="w-4 h-4"/> ADVERTENCIA DE ELIMINACIÓN
                        </div>
                        ¿Estás seguro de borrar estos datos de tu base de datos? Se eliminarán permanentemente de la base de datos los cierres de caja correspondientes a:
                        <div className="font-black text-sm text-red-800 mt-2 p-2 bg-white rounded border border-red-200 text-center uppercase">
                           {clearPeriod === 'THIS_WEEK' && 'Esta semana'}
                           {clearPeriod === 'THIS_MONTH' && 'Este mes'}
                           {clearPeriod === 'LAST_3_MONTHS' && 'Últimos 3 meses'}
                           {clearPeriod === 'LAST_6_MONTHS' && 'Últimos 6 meses'}
                           {clearPeriod === 'ALL' && 'TODOS LOS DATOS (Histórico completo)'}
                        </div>
                     </div>

                     <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                        <button 
                           onClick={() => setClearStep(1)} 
                           className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                        >
                           Volver
                        </button>
                        <button 
                           onClick={handleConfirmClearClosures} 
                           className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                        >
                           Sí, Confirmar Borrado
                        </button>
                     </div>
                  </div>
                )}
             </div>
          </div>
       )}

       {/* MODAL ELIMINAR PRODUCTO */}
       {isDeleteProductModalOpen && productToDelete && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                   <div className="flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <h3 className="font-bold text-gray-900 text-base">Eliminar Producto del Inventario</h3>
                   </div>
                   <button onClick={() => { setIsDeleteProductModalOpen(false); setProductToDelete(null); }} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                <div className="p-5 space-y-4">
                   <p className="text-sm text-gray-600">
                      ¿Estás seguro de eliminar el producto <span className="font-bold text-gray-900">"{productToDelete.name}"</span>?
                   </p>
                   
                   <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
                      <div className="font-extrabold text-sm mb-1 text-red-700 flex items-center gap-1.5">
                         <AlertTriangle className="w-4 h-4"/> SE HARÁ UN BORRADO SUAVE
                      </div>
                      El producto no se borrará por completo de la base de datos para no alterar las estadísticas históricas y reportes de ventas, sino que se marcará como <span className="font-bold">Inactivo</span> para que no vuelva a aparecer en el inventario ni en el POS de los vendedores.
                   </div>

                   <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                      <button 
                         onClick={() => { setIsDeleteProductModalOpen(false); setProductToDelete(null); }} 
                         className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                      >
                         Cancelar
                      </button>
                      <button 
                         onClick={handleConfirmDeleteProduct} 
                         className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                         Sí, Confirmar Eliminación
                      </button>
                   </div>
                </div>
             </div>
          </div>
       )}

       {/* MODAL ELIMINAR GASTO RECURRENTE */}
       {isDeleteExpenseModalOpen && expenseToDelete && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                   <div className="flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <h3 className="font-bold text-gray-900 text-base">Eliminar Gasto Fijo</h3>
                   </div>
                   <button onClick={() => { setIsDeleteExpenseModalOpen(false); setExpenseToDelete(null); }} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                <div className="p-5 space-y-4">
                   <p className="text-sm text-gray-600">
                      ¿Estás seguro de eliminar el gasto fijo registrado como <span className="font-bold text-gray-900">"{expenseToDelete.description}"</span> por un monto de <span className="font-bold text-black">${expenseToDelete.amount_usd}</span>?
                   </p>
                   
                   <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
                      <div className="font-bold mb-1 text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4"/> ADVERTENCIA</div>
                      Esta acción eliminará de forma permanente el registro del gasto recurrente de la base de datos. Los pagos que ya hayan sido ejecutados e ingresados en el historial de gastos no se verán afectados.
                   </div>

                   <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                      <button 
                         onClick={() => { setIsDeleteExpenseModalOpen(false); setExpenseToDelete(null); }} 
                         className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                      >
                         Cancelar
                      </button>
                      <button 
                         onClick={handleConfirmDeleteExpense} 
                         className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                      >
                         Sí, Confirmar Eliminación
                      </button>
                   </div>
                </div>
             </div>
          </div>
       )}

       {/* MODAL LIMPIAR HISTORIAL DE VENTAS */}
       {isClearSalesModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                   <div className="flex items-center gap-2">
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <h3 className="font-bold text-gray-900 text-base">Limpiar Historial de Ventas</h3>
                   </div>
                   <button onClick={() => setIsClearSalesModalOpen(false)} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                {clearSalesStep === 1 ? (
                  <div className="p-5 space-y-4">
                     <p className="text-sm text-gray-600">
                        Selecciona el rango de fecha que deseas eliminar de la base de datos:
                     </p>
                     
                     <div className="space-y-2">
                        {[
                           { id: 'TODAY', label: 'Ventas de Hoy' },
                           { id: 'THIS_WEEK', label: 'Esta semana' },
                           { id: 'THIS_MONTH', label: 'Este mes' },
                           { id: 'LAST_3_MONTHS', label: 'Últimos 3 meses (Trimestre)' },
                           { id: 'LAST_6_MONTHS', label: 'Últimos 6 meses (Semestre)' },
                           { id: 'ALL', label: 'Borrar TODAS las ventas (Histórico completo)' }
                        ].map((item) => (
                           <label key={item.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${clearSalesPeriod === item.id ? 'border-red-500 bg-red-50 text-red-900 font-bold' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
                              <input 
                                 type="radio" 
                                 name="clearSalesPeriod" 
                                 value={item.id} 
                                 checked={clearSalesPeriod === item.id} 
                                 onChange={() => setClearSalesPeriod(item.id as any)} 
                                 className="w-4 h-4 text-red-600 focus:ring-red-500 mr-3"
                              />
                              <span className="text-sm">{item.label}</span>
                           </label>
                        ))}
                     </div>

                     <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                        <button 
                           onClick={() => setIsClearSalesModalOpen(false)} 
                           className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                        >
                           Cancelar
                        </button>
                        <button 
                           onClick={() => setClearSalesStep(2)} 
                           className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                           Aceptar y Continuar
                        </button>
                     </div>
                  </div>
                ) : (
                  <div className="p-5 space-y-4">
                     <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
                        <div className="font-extrabold text-sm mb-1 flex items-center gap-1.5 text-red-700">
                           <Bell className="w-4 h-4"/> ADVERTENCIA CRÍTICA
                        </div>
                        ¿Estás seguro de borrar estas ventas de tu base de datos? Se eliminarán permanentemente de la base de datos de manera irreversible las ventas de:
                        <div className="font-black text-sm text-red-800 mt-2 p-2 bg-white rounded border border-red-200 text-center uppercase">
                           {clearSalesPeriod === 'TODAY' && 'Ventas de Hoy'}
                           {clearSalesPeriod === 'THIS_WEEK' && 'Esta semana'}
                           {clearSalesPeriod === 'THIS_MONTH' && 'Este mes'}
                           {clearSalesPeriod === 'LAST_3_MONTHS' && 'Últimos 3 meses (Trimestre)'}
                           {clearSalesPeriod === 'LAST_6_MONTHS' && 'Últimos 6 meses (Semestre)'}
                           {clearSalesPeriod === 'ALL' && 'TODAS LAS VENTAS (Histórico completo)'}
                        </div>
                        <p className="mt-2 text-red-700 font-bold text-[11px]">
                          * NOTA: Al borrar las ventas, también se eliminarán sus respectivos artículos de venta (sale_items) en cascada para liberar espacio.
                        </p>
                     </div>

                     <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                        <button 
                           onClick={() => setClearSalesStep(1)} 
                           className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                        >
                           Volver
                        </button>
                        <button 
                           onClick={handleConfirmClearSales} 
                           className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                        >
                           Sí, Confirmar Borrado de Ventas
                        </button>
                     </div>
                  </div>
                )}
             </div>
          </div>
       )}

       {/* MODAL DESCARGAR HISTORIAL DE CIERRES */}
       {isDownloadClosuresModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                   <div className="flex items-center gap-2">
                      <Download className="w-5 h-5 text-blue-600" />
                      <h3 className="font-bold text-gray-900 text-base">Descargar Cierres de Caja</h3>
                   </div>
                   <button onClick={() => setIsDownloadClosuresModalOpen(false)} className="text-gray-400 hover:text-black">
                      <X className="w-5 h-5"/>
                   </button>
                </div>

                <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
                   {/* Rango de Fecha */}
                   <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">1. Selecciona Rango de Fecha</label>
                      <select 
                         value={downloadDateRange} 
                         onChange={(e) => setDownloadDateRange(e.target.value as any)}
                         className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-semibold text-gray-900 outline-none focus:border-blue-500"
                      >
                         <option value="ALL">Fecha Total (Histórico Completo)</option>
                         <option value="TODAY">Día de Hoy</option>
                         <option value="WEEK">Esta Semana (Últimos 7 días)</option>
                         <option value="MONTH">Último Mes / Este Mes</option>
                         <option value="QUARTER">El Trimestre (Últimos 3 meses)</option>
                         <option value="SEMESTER">El Semestre (Últimos 6 meses)</option>
                         <option value="YEAR">Año en Específico</option>
                      </select>

                      {downloadDateRange === 'YEAR' && (
                         <div className="mt-2.5">
                            <label className="block text-xs text-gray-500 mb-1">Ingrese el año:</label>
                            <input 
                               type="number" 
                               value={downloadSpecificYear} 
                               onChange={(e) => setDownloadSpecificYear(Number(e.target.value))}
                               className="w-full p-2 border border-gray-300 rounded-lg text-sm font-bold"
                            />
                         </div>
                      )}
                   </div>

                   {/* Agrupación / Formato de Resultados */}
                   <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">2. Presentación de Resultados</label>
                      <div className="space-y-2">
                         {[
                            { id: 'DETAILED', label: 'Detallado (Un registro por cada cierre)' },
                            { id: 'DAILY', label: 'Sumatoria agrupada por Días' },
                            { id: 'WEEKLY', label: 'Sumatoria agrupada por Semanas' },
                            { id: 'MONTHLY', label: 'Sumatoria agrupada por Meses (ej. cada mes del año)' }
                         ].map((item) => (
                            <label key={item.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${downloadGrouping === item.id ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
                               <input 
                                  type="radio" 
                                  name="downloadGrouping" 
                                  value={item.id} 
                                  checked={downloadGrouping === item.id} 
                                  onChange={() => setDownloadGrouping(item.id as any)} 
                                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 mr-3"
                               />
                               <span className="text-xs">{item.label}</span>
                            </label>
                         ))}
                      </div>
                   </div>

                   <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                      <button 
                         onClick={() => setIsDownloadClosuresModalOpen(false)} 
                         className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
                      >
                         Cancelar
                      </button>
                      <button 
                         onClick={handleExecuteDownloadClosures} 
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                         <Download className="w-4 h-4"/> Generar y Descargar Excel
                      </button>
                   </div>
                </div>
             </div>
          </div>
       )}

    </div>
  );
}
