import { useState } from 'react';
import { purgeEntity, voidSale } from '../../lib/salesApi';
import { errorMessage } from '../../lib/apiError';
import { Ban, Bell, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';

interface SalesReportsProps {
  salesList: any[];
  metricFilter: 'day' | 'week' | 'month';
  showToast: (msg: string) => void;
  onRefresh: () => void;
}

// Lista de ventas del periodo + anulación de venta y limpieza de historial.
export default function SalesReports({ salesList, metricFilter, showToast, onRefresh }: SalesReportsProps) {
  const [isClearSalesModalOpen, setIsClearSalesModalOpen] = useState(false);
  const [clearSalesStep, setClearSalesStep] = useState<1 | 2>(1);
  const [clearSalesPeriod, setClearSalesPeriod] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'ALL'>('THIS_WEEK');
  const [saleToVoid, setSaleToVoid] = useState<any>(null);
  const [isVoidSaleModalOpen, setIsVoidSaleModalOpen] = useState(false);

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

      const { data, error } = await purgeEntity('sales', startDate ? startDate.toISOString() : null);
      if (error) throw new Error(error.message);

      const deletedCount = data?.deleted ?? 0;
      showToast(`Se eliminaron ${deletedCount} ventas de la base de datos exitosamente.`);
      setIsClearSalesModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error("Error al limpiar historial de ventas:", err);
      showToast("Error al limpiar las ventas: " + (err.message || 'Error de permisos o base de datos'));
    }
  };

  const handleConfirmVoidSale = async () => {
    if (!saleToVoid) return;
    if (saleToVoid.status === 'VOIDED') {
      showToast("Esta venta ya está anulada.");
      setIsVoidSaleModalOpen(false);
      return;
    }
    try {
      const { error } = await voidSale(saleToVoid.id);
      if (error) {
        if (error.message.includes('ya está anulada')) {
          showToast('Esta venta ya está anulada.');
        } else {
          throw new Error(error.message);
        }
      } else {
        showToast('Venta anulada. Se restauró el stock y los puntos.');
      }
      setIsVoidSaleModalOpen(false);
      setSaleToVoid(null);
      onRefresh();
    } catch (err: unknown) {
      showToast('Error al anular venta: ' + errorMessage(err));
    }
  };

  return (
    <>
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
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {salesList.map(s => {
                const isVoided = s.status === 'VOIDED';
                const profit = Number(s.total_usd || 0) - Number(s.cost_usd || 0);
                return (
                  <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${isVoided ? 'opacity-50' : ''}`}>
                    <td className="p-3 text-gray-600">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="p-3 font-medium text-gray-900">{s.worker_profiles?.first_name} {s.worker_profiles?.last_name}</td>
                    <td className="p-3 text-gray-600">{s.payment_method || 'CASH_USD'}{s.is_wholesale ? ' · Mayor' : ''}</td>
                    <td className="p-3 text-gray-500">${Number(s.cost_usd || 0).toFixed(2)}</td>
                    <td className="p-3 font-bold">${Number(s.total_usd || 0).toFixed(2)}</td>
                    <td className={`p-3 font-bold ${isVoided ? 'text-gray-400' : profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{isVoided ? 'Anulada' : `$${profit.toFixed(2)}`}</td>
                    <td className="p-3 text-center">
                      {!isVoided && (
                        <button
                          onClick={() => { setSaleToVoid(s); setIsVoidSaleModalOpen(true); }}
                          className="text-red-500 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1"
                          title="Anular esta venta"
                        >
                          <Ban className="w-3.5 h-3.5" /> Anular
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              {salesList.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-gray-500">No hay ventas registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL LIMPIAR HISTORIAL DE VENTAS */}
      {isClearSalesModalOpen && (
        <Modal
          title={<div className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" /><h3 className="font-bold text-gray-900 text-base">Limpiar Historial de Ventas</h3></div>}
          onClose={() => setIsClearSalesModalOpen(false)}
          overlayClassName="bg-black/60 z-50"
          panelClassName="shadow-2xl"
          headerClassName="border-b border-gray-200 bg-gray-50"
          bodyClassName="p-5 space-y-4"
          closeIconClassName="text-gray-400 hover:text-black"
        >
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
        </Modal>
      )}

      {isVoidSaleModalOpen && saleToVoid && (
        <ConfirmModal
          variant="plain"
          title={<h3 className="font-bold text-lg text-red-700">Anular venta</h3>}
          confirmLabel="Anular venta"
          onCancel={() => setIsVoidSaleModalOpen(false)}
          onConfirm={handleConfirmVoidSale}
        >
          <p className="text-sm text-gray-600">Se restaurará el stock y los puntos de fidelidad. Esta venta dejará de contar en las ganancias. El monto histórico (${Number(saleToVoid.total_usd || 0).toFixed(2)}) no se reescribe: queda anulada.</p>
        </ConfirmModal>
      )}
    </>
  );
}
