import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import { addDays, differenceInDays, startOfDay } from 'date-fns';
import { LogOut, Users, Package, BarChart3, Settings, Calendar, FileText, Bell, CheckCircle } from 'lucide-react';
import MetricsTab from './admin/MetricsTab';
import InventoryTab from './admin/InventoryTab';
import UsersTab from './admin/UsersTab';
import CustomersTab from './admin/CustomersTab';
import ExpensesTab from './admin/ExpensesTab';
import SettingsTab from './admin/SettingsTab';

type AdminTab = 'metrics' | 'inventory' | 'users' | 'customers' | 'expenses' | 'settings';

interface Props {
  onLogout: () => void;
}

// Shell del panel admin: navegación lateral, toast global y barra de alertas
// de gastos por vencer. Cada pestaña es un módulo de src/components/admin/
// que carga sus datos al montarse (lazy fetching por pestaña).
export default function AdminDashboard({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>('metrics');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<any[]>([]);
  // Se incrementa al pagar un gasto desde la barra de alertas para que
  // ExpensesTab (si está montado) refresque su lista.
  const [alertsVersion, setAlertsVersion] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchAlerts = async () => {
    const { data } = await api.from('recurring_expenses').select('*').eq('is_active', true);
    if (data) {
      const today = startOfDay(new Date());
      const expiredOnce = data.filter((exp: any) =>
        exp.frequency === 'once' && differenceInDays(startOfDay(new Date(exp.next_due_date)), today) < 0
      );
      for (const exp of expiredOnce) {
        await api.from('recurring_expenses').update({ is_active: false }).eq('id', exp.id);
      }
      const visible = data.filter((exp: any) => !expiredOnce.some((e: any) => e.id === exp.id));
      const dueSoon = visible.filter((exp: any) => differenceInDays(new Date(exp.next_due_date), new Date()) <= 10);
      setRecurringExpenses(dueSoon);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [activeTab]);

  const payRecurringExpense = async (expense: any) => {
    await api.from('expenses').insert([{
      description: expense.description,
      amount_usd: expense.amount_usd,
      category: 'recurring',
    }]);

    if (expense.frequency === 'once') {
      await api.from('recurring_expenses').update({ is_active: false }).eq('id', expense.id);
      showToast(`Alerta de gasto "${expense.description}" marcada como pagada y cerrada.`);
    } else {
      const newDueDate = expense.frequency === 'monthly' ? addDays(new Date(expense.next_due_date), 30) : addDays(new Date(expense.next_due_date), 7);
      await api.from('recurring_expenses').update({ next_due_date: newDueDate.toISOString() }).eq('id', expense.id);
      showToast(`Gasto ${expense.description} marcado como pagado.`);
    }
    fetchAlerts();
    setAlertsVersion((v) => v + 1);
  };

  const handleSignOut = async () => {
    await api.auth.signOut();
    onLogout();
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'metrics':
        return <MetricsTab showToast={showToast} />;
      case 'inventory':
        return <InventoryTab showToast={showToast} />;
      case 'users':
        return <UsersTab showToast={showToast} />;
      case 'customers':
        return <CustomersTab showToast={showToast} />;
      case 'expenses':
        return <ExpensesTab showToast={showToast} onAlertsChanged={fetchAlerts} refreshSignal={alertsVersion} />;
      case 'settings':
        return <SettingsTab showToast={showToast} />;
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
    </div>
  );
}
