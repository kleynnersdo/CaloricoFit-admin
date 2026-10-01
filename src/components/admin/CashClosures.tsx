import { useState } from 'react';
import { api } from '../../lib/apiClient';
import { purgeEntity } from '../../lib/salesApi';
import { errorMessage } from '../../lib/apiError';
import { fetchProductNameMap } from '../../lib/metricsHelpers';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { Bell, Download, Eye, FileText, Printer, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';

interface CashClosuresProps {
  cashClosures: any[];
  showToast: (msg: string) => void;
  onRefresh: () => void;
}

// Cierres de caja (turnos): listado, ticket con detalle de ventas,
// descarga Excel y limpieza de historial.
export default function CashClosures({ cashClosures, showToast, onRefresh }: CashClosuresProps) {
  // Modal y acciones de cierres de caja
  const [selectedClosureTicket, setSelectedClosureTicket] = useState<any>(null);
  const [isClosureTicketModalOpen, setIsClosureTicketModalOpen] = useState(false);

  // Modales de Limpiar Cierres
  const [isClearClosuresModalOpen, setIsClearClosuresModalOpen] = useState(false);
  const [clearStep, setClearStep] = useState<1 | 2>(1);
  const [clearPeriod, setClearPeriod] = useState<'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'ALL'>('THIS_WEEK');

  // Modales de Descargar Cierres
  const [isDownloadClosuresModalOpen, setIsDownloadClosuresModalOpen] = useState(false);
  const [downloadDateRange, setDownloadDateRange] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR'>('ALL');
  const [downloadSpecificYear, setDownloadSpecificYear] = useState<number>(new Date().getFullYear());
  const [downloadGrouping, setDownloadGrouping] = useState<'DETAILED' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('DETAILED');

  const openClosureTicket = async (c: any) => {
    setSelectedClosureTicket(c);
    setIsClosureTicketModalOpen(true);

    if (c.sales_data && Array.isArray(c.sales_data) && c.sales_data.length > 0) {
      return;
    }

    try {
      const { data: prevClosures } = await api
        .from('cash_closures')
        .select('created_at')
        .eq('seller_id', c.seller_id)
        .lt('created_at', c.created_at)
        .order('created_at', { ascending: false })
        .limit(1);

      let query = api
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

      const saleIds = sales.map((s) => s.id);
      const { data: items, error: itemsErr } = await api
        .from('sale_items')
        .select('sale_id, product_id, quantity, unit_price_usd, subtotal_usd')
        .in('sale_id', saleIds);
      if (itemsErr) {
        showToast('Error al cargar items del cierre: ' + errorMessage(itemsErr));
        return;
      }
      const productMap = await fetchProductNameMap((items || []).map((i: any) => i.product_id));

      const constructedSalesData = sales.map((sale) => {
        const saleItems = (items || []).filter((i: any) => i.sale_id === sale.id);
        return {
          id: sale.id,
          created_at: sale.created_at,
          payment_method: sale.payment_method,
          currency_used: sale.currency_used,
          subtotal_usd: sale.total_usd,
          items: saleItems.map((i: any) => {
            const p = productMap[i.product_id];
            return {
              product_name: p?.name || 'Producto',
              product_sku: p?.sku || '',
              category: p?.category || '',
              subcategory: p?.subcategory || '',
              quantity: i.quantity,
              unit_price_usd: i.unit_price_usd,
              subtotal_usd: i.subtotal_usd,
            };
          }),
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

      const { data, error } = await purgeEntity(
        'cash_closures',
        startDate ? startDate.toISOString() : null
      );
      if (error) throw new Error(error.message);

      const deletedCount = data?.deleted ?? 0;
      showToast(`Se eliminaron ${deletedCount} cierres de caja de la base de datos.`);
      setIsClearClosuresModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error("Error al limpiar historial de cierres:", err);
      showToast("Error al limpiar el historial: " + (err.message || 'Error de permisos o base de datos'));
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

  return (
    <>
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

      {/* MODAL DETALLE / TICKET DE CIERRE DE CAJA */}
      {isClosureTicketModalOpen && selectedClosureTicket && (
        <Modal
          title={<div className="flex items-center gap-2"><FileText className="w-5 h-5 text-orange-600" /><h3 className="font-bold text-gray-900 text-base">Detalle de Cierre de Caja</h3></div>}
          onClose={() => setIsClosureTicketModalOpen(false)}
          maxWidthClassName="max-w-2xl"
          overlayClassName="bg-black/60 z-50"
          panelClassName="shadow-2xl max-h-[90vh] flex flex-col"
          headerClassName="border-b border-gray-200 bg-gray-50 shrink-0"
          bodyClassName="p-6 overflow-y-auto flex-1 space-y-6"
          closeIconClassName="text-gray-400 hover:text-black"
          footer={
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
          }
        >
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
        </Modal>
      )}

      {/* MODAL LIMPIAR HISTORIAL DE CIERRES */}
      {isClearClosuresModalOpen && (
        <Modal
          title={<div className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" /><h3 className="font-bold text-gray-900 text-base">Limpiar Historial de Cierres</h3></div>}
          onClose={() => setIsClearClosuresModalOpen(false)}
          overlayClassName="bg-black/60 z-50"
          panelClassName="shadow-2xl"
          headerClassName="border-b border-gray-200 bg-gray-50"
          bodyClassName="p-5 space-y-4"
          closeIconClassName="text-gray-400 hover:text-black"
        >
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
        </Modal>
      )}

      {/* MODAL DESCARGAR HISTORIAL DE CIERRES */}
      {isDownloadClosuresModalOpen && (
        <Modal
          title={<div className="flex items-center gap-2"><Download className="w-5 h-5 text-blue-600" /><h3 className="font-bold text-gray-900 text-base">Descargar Cierres de Caja</h3></div>}
          onClose={() => setIsDownloadClosuresModalOpen(false)}
          overlayClassName="bg-black/60 z-50"
          panelClassName="shadow-2xl"
          headerClassName="border-b border-gray-200 bg-gray-50"
          bodyClassName="p-5 space-y-5 max-h-[80vh] overflow-y-auto"
          closeIconClassName="text-gray-400 hover:text-black"
        >
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
        </Modal>
      )}
    </>
  );
}
