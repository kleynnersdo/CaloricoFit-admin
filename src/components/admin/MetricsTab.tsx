import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { errorMessage } from '../../lib/apiError';
import { fetchProductNameMap, fetchWorkerMap, withWorkerProfile } from '../../lib/metricsHelpers';
import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';
import StatCard from '../ui/StatCard';
import Modal from '../ui/Modal';
import SalesReports from './SalesReports';
import CashClosures from './CashClosures';

interface MetricsTabProps {
  showToast: (msg: string) => void;
}

// Pestaña Métricas y Finanzas: caja de métricas, top productos, costo de
// inventario, y las sublistas de ventas (SalesReports) y cierres (CashClosures).
export default function MetricsTab({ showToast }: MetricsTabProps) {
  const [metricFilter, setMetricFilter] = useState<'day' | 'week' | 'month'>('day');
  const [metrics, setMetrics] = useState({ sales: 0, expenses: 0, netProfit: 0, productProfit: 0 });
  const [salesList, setSalesList] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);

  // Modal de costo de inventario
  const [isInventoryCostModalOpen, setIsInventoryCostModalOpen] = useState(false);
  const [inventoryCostData, setInventoryCostData] = useState({ totalCost: 0, totalUnits: 0, isCalculating: false });

  useEffect(() => {
    calculateMetrics();
  }, [metricFilter]);

  const handleCalculateInventoryCost = async () => {
    setIsInventoryCostModalOpen(true);
    setInventoryCostData({ totalCost: 0, totalUnits: 0, isCalculating: true });

    const { data, error } = await api.from('products').select('cost_price, stock_quantity');
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

  const calculateMetrics = async () => {
    let startDate = startOfDay(new Date());
    if (metricFilter === 'week') startDate = startOfWeek(new Date());
    if (metricFilter === 'month') startDate = startOfMonth(new Date());
    const startIso = startDate.toISOString();
    const expenseFrom = format(startDate, 'yyyy-MM-dd');

    const { data: salesRaw, error: salesErr } = await api
      .from('sales')
      .select(
        'id, total_usd, cost_usd, created_at, payment_method, seller_id, customer_id, points_earned, points_redeemed, status, is_wholesale'
      )
      .gte('created_at', startIso)
      .order('created_at', { ascending: false });

    if (salesErr) {
      showToast('Error al cargar ventas: ' + errorMessage(salesErr));
      return;
    }

    const completedSales = (salesRaw || []).filter((s: any) => !s.status || s.status === 'COMPLETED');
    const sellerMap = await fetchWorkerMap(completedSales.map((s: any) => s.seller_id));
    const salesWithSellers = completedSales.map((s: any) => withWorkerProfile(s, sellerMap));
    setSalesList(salesWithSellers);

    let totalSales = 0;
    let totalCost = 0;
    completedSales.forEach((s: any) => {
      totalSales += Number(s.total_usd || 0);
      totalCost += Number(s.cost_usd || 0);
    });

    const saleIds = completedSales.map((s: any) => s.id);
    let top: Array<{ name: string; qty: number }> = [];
    if (saleIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await api
        .from('sale_items')
        .select('quantity, product_id, sale_id')
        .in('sale_id', saleIds);
      if (itemsErr) {
        showToast('Error al cargar detalle de ventas: ' + errorMessage(itemsErr));
      } else if (itemsData?.length) {
        const productMap = await fetchProductNameMap(itemsData.map((i: any) => i.product_id));
        const productCounts: Record<string, { name: string; qty: number }> = {};
        itemsData.forEach((item: any) => {
          const pid = item.product_id;
          const name = productMap[pid]?.name || 'Producto';
          if (!productCounts[pid]) productCounts[pid] = { name, qty: 0 };
          productCounts[pid].qty += Number(item.quantity || 0);
        });
        top = Object.values(productCounts)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 10);
      }
    }
    setTopProducts(top);

    const { data: closuresRaw, error: closuresErr } = await api
      .from('cash_closures')
      .select('*')
      .gte('created_at', startIso)
      .order('created_at', { ascending: false });

    if (closuresErr) {
      showToast('Error al cargar cierres: ' + errorMessage(closuresErr));
    } else if (closuresRaw) {
      const closureSellerMap = await fetchWorkerMap(closuresRaw.map((c: any) => c.seller_id));
      setCashClosures(closuresRaw.map((c: any) => withWorkerProfile(c, closureSellerMap)));
    }

    const { data: expensesData, error: expErr } = await api
      .from('expenses')
      .select('amount_usd')
      .gte('expense_date', expenseFrom);

    if (expErr) {
      showToast('Error al cargar gastos: ' + errorMessage(expErr));
    }

    let totalExpenses = 0;
    if (expensesData) {
      expensesData.forEach((e: any) => {
        totalExpenses += Number(e.amount_usd);
      });
    }

    const productProfit = totalSales - totalCost;
    const netProfit = productProfit - totalExpenses;

    setMetrics({
      sales: totalSales,
      expenses: totalExpenses + totalCost,
      netProfit,
      productProfit,
    });
  };

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
        <StatCard accent="blue" label="Total Ventas Brutas" value={`$${Number(metrics.sales || 0).toFixed(2)}`} />
        <StatCard accent="red" label="Gastos e Inversión" value={`$${Number(metrics.expenses || 0).toFixed(2)}`} />
        <StatCard accent="purple" label="Ganancia Prod." value={`$${Number(metrics.productProfit || 0).toFixed(2)}`} />
        <StatCard accent="green" label="Ganancia Neta" value={`$${Number(metrics.netProfit || 0).toFixed(2)}`} valueClassName={`text-3xl font-bold ${metrics.netProfit >= 0 ? "text-green-600" : "text-red-500"}`} />
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

        <CashClosures cashClosures={cashClosures} showToast={showToast} onRefresh={calculateMetrics} />
      </div>

      <SalesReports salesList={salesList} metricFilter={metricFilter} showToast={showToast} onRefresh={calculateMetrics} />

      {isInventoryCostModalOpen && (
        <Modal title="Costo del Inventario" onClose={() => setIsInventoryCostModalOpen(false)} bodyClassName="p-6 text-center space-y-4">
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
        </Modal>
      )}
    </>
  );
}
