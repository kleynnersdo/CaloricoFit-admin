import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { addDays, differenceInDays, format } from 'date-fns';
import { AlertTriangle, CheckCircle, Edit, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';

interface ExpensesTabProps {
  showToast: (msg: string) => void;
  // Refresca la barra de alertas del shell (gastos por vencer).
  onAlertsChanged: () => void;
  // Se incrementa desde el shell (p. ej. al pagar desde la barra) para refrescar la lista.
  refreshSignal: number;
}

// Gastos recurrentes: alta/edición, pago individual y eliminación.
export default function ExpensesTab({ showToast, onAlertsChanged, refreshSignal }: ExpensesTabProps) {
  const [allExpensesList, setAllExpensesList] = useState<any[]>([]);

  useEffect(() => {
    fetchRecurringExpensesAll();
  }, [refreshSignal]);

  const fetchRecurringExpensesAll = async () => {
    const { data } = await api.from('recurring_expenses').select('*');
    if (data) setAllExpensesList(data);
  };

  // Modal Gasto
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<any>({ description: '', amount_usd: 0, frequency: 'monthly', next_due_date: format(new Date(), 'yyyy-MM-dd') });

  // Modal Eliminar Gasto
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);
  const [isDeleteExpenseModalOpen, setIsDeleteExpenseModalOpen] = useState(false);

  const handlePayExpense = async (expense: any) => {
     if (expense.frequency === 'once') {
       await api.from('expenses').insert([{
         description: expense.description,
         amount_usd: expense.amount_usd,
         category: 'recurring',
       }]);
       const { error } = await api.from('recurring_expenses').update({ is_active: false }).eq('id', expense.id);
       if (error) {
         showToast("Error al procesar pago: " + error.message);
         return;
       }
       showToast(`Alerta "${expense.description}" pagada y cerrada.`);
       onAlertsChanged();
       fetchRecurringExpensesAll();
       return;
     }

     const nextDate = expense.frequency === 'monthly' ? addDays(new Date(expense.next_due_date), 30) : addDays(new Date(expense.next_due_date), 7);
     const { error } = await api.from('recurring_expenses').update({ next_due_date: format(nextDate, 'yyyy-MM-dd') }).eq('id', expense.id);

     if(error) {
         showToast("Error al procesar pago: " + error.message);
         return;
     }

     showToast(`Gasto ${expense.description} marcado como pagado. Próximo cobro: ${format(nextDate, 'dd/MM/yyyy')}`);
     onAlertsChanged();
     fetchRecurringExpensesAll();
  };

  const handleSaveExpense = async () => {
     if (!String(expenseForm.description || '').trim()) {
       showToast("La descripción del gasto es obligatoria.");
       return;
     }
     if (Number(expenseForm.amount_usd) <= 0) {
       showToast("El monto debe ser mayor a 0.");
       return;
     }
     if (!expenseForm.next_due_date) {
       showToast("La fecha es obligatoria.");
       return;
     }
     const payload = {
       description: String(expenseForm.description).trim(),
       amount_usd: Number(expenseForm.amount_usd),
       frequency: expenseForm.frequency,
       next_due_date: expenseForm.next_due_date,
       is_active: true,
     };
     let error;
     if (expenseForm.id) {
         const { error: updateError } = await api.from('recurring_expenses').update(payload).eq('id', expenseForm.id);
         error = updateError;
     } else {
         const { error: insertError } = await api.from('recurring_expenses').insert([payload]);
         error = insertError;
     }

     if (error) {
         if (error.message.includes('Could not find the table')) {
             showToast("Falta la tabla en la base de datos. Por favor, ejecuta el archivo api_schema.sql en el SQL Editor de tu cuenta de Supabase.");
         } else {
             showToast("Error guardando gasto: " + error.message);
         }
     } else {
         showToast(payload.frequency === 'once' ? "Alerta de gasto único guardada." : "Gasto recurrente guardado exitosamente.");
     }
     setIsExpenseModalOpen(false);
     setExpenseForm({ description: '', amount_usd: 0, frequency: 'monthly', next_due_date: format(new Date(), 'yyyy-MM-dd') });
     onAlertsChanged();
     fetchRecurringExpensesAll();
  };

  const handleDeleteExpense = (expense: any) => {
     setExpenseToDelete(expense);
     setIsDeleteExpenseModalOpen(true);
  };

  const handleConfirmDeleteExpense = async () => {
     if (!expenseToDelete) return;
     try {
        const { data, error } = await api.from('recurring_expenses').delete().eq('id', expenseToDelete.id).select();
        if (error) {
           showToast("Error al eliminar gasto: " + error.message);
        } else if (!data || data.length === 0) {
           showToast("Gasto no encontrado o error de permisos de administrador.");
        } else {
           showToast("Gasto eliminado exitosamente.");
           onAlertsChanged();
           fetchRecurringExpensesAll();
           setIsDeleteExpenseModalOpen(false);
           setExpenseToDelete(null);
        }
     } catch (err: any) {
        console.error(err);
        showToast("Error al eliminar gasto: " + err.message);
     }
  };

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
                       {exp.frequency === 'once' ? 'Fecha de alerta' : 'Próximo pago'}: {new Date(exp.next_due_date).toLocaleDateString()}
                     </div>
                     <div className="text-sm text-gray-500 uppercase tracking-widest mt-1">
                       Frecuencia: {exp.frequency === 'monthly' ? 'Mensual' : exp.frequency === 'weekly' ? 'Semanal' : 'Una sola vez'}
                       {exp.is_active === false ? ' · Cerrada' : ''}
                     </div>
                  </div>
                  {exp.is_active !== false && (
                  <button
                    onClick={() => handlePayExpense(exp)}
                    className="w-full mt-4 bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4"/> Pagar Individual
                  </button>
                  )}
              </div>
          ))}
      </div>

      {/* Modal Gasto */}
      {isExpenseModalOpen && (
        <Modal title={expenseForm.id ? 'Editar Gasto' : 'Nuevo Gasto'} onClose={() => setIsExpenseModalOpen(false)}>
          <div><label className="block text-sm font-medium mb-1">Descripción del Gasto (Ej. Alquiler)</label><input type="text" className="w-full px-3 py-2 border rounded" value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} /></div>
          <div><label className="block text-sm font-medium mb-1">Monto (USD)</label><input type="number" className="w-full px-3 py-2 border rounded" value={expenseForm.amount_usd} onChange={e => setExpenseForm({...expenseForm, amount_usd: Number(e.target.value)})} /></div>
          <div>
              <label className="block text-sm font-medium mb-1">Frecuencia</label>
              <select className="w-full px-3 py-2 border rounded" value={expenseForm.frequency} onChange={e => setExpenseForm({...expenseForm, frequency: e.target.value})}>
                  <option value="monthly">Mensual</option>
                  <option value="weekly">Semanal</option>
                  <option value="once">Una sola vez (alerta)</option>
              </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">{expenseForm.frequency === 'once' ? 'Fecha de la alerta' : 'Próxima Fecha de Pago'}</label><input type="date" className="w-full px-3 py-2 border rounded" value={expenseForm.next_due_date} onChange={e => setExpenseForm({...expenseForm, next_due_date: e.target.value})} /></div>
          {expenseForm.frequency === 'once' && (
            <p className="text-xs text-gray-500">La alerta desaparece sola cuando pasa esa fecha, o al marcarla como pagada.</p>
          )}
          <button onClick={handleSaveExpense} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4">Registrar Gasto</button>
        </Modal>
      )}

      {isDeleteExpenseModalOpen && expenseToDelete && (
        <ConfirmModal
          title="Eliminar Gasto Fijo"
          confirmLabel="Sí, Confirmar Eliminación"
          onCancel={() => { setIsDeleteExpenseModalOpen(false); setExpenseToDelete(null); }}
          onConfirm={handleConfirmDeleteExpense}
        >
          <p className="text-sm text-gray-600">
            ¿Estás seguro de eliminar el gasto fijo registrado como <span className="font-bold text-gray-900">"{expenseToDelete.description}"</span> por un monto de <span className="font-bold text-black">${expenseToDelete.amount_usd}</span>?
          </p>

          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs leading-relaxed">
            <div className="font-bold mb-1 text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4"/> ADVERTENCIA</div>
            Esta acción eliminará de forma permanente el registro del gasto recurrente de la base de datos. Los pagos que ya hayan sido ejecutados e ingresados en el historial de gastos no se verán afectados.
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
