import { useEffect, useState } from 'react';
import { api } from '../lib/apiClient';
import { addDays, differenceInDays, startOfDay } from 'date-fns';
import { LogOut, Users, Package, BarChart3, Settings, Calendar, FileText, Bell, CheckCircle, Handshake, Menu, X } from 'lucide-react';
import MetricsTab from './admin/MetricsTab';
import InventoryTab from './admin/InventoryTab';
import UsersTab from './admin/UsersTab';
import CustomersTab from './admin/CustomersTab';
import ExpensesTab from './admin/ExpensesTab';
import SettingsTab from './admin/SettingsTab';
import AlliesTab from './admin/AlliesTab';
import ConfirmModal from './ui/ConfirmModal';

type AdminTab = 'metrics' | 'inventory' | 'users' | 'customers' | 'expenses' | 'settings' | 'allies';

interface Props {
  onLogout: () => void;
}

const TAB_LABELS: Record<AdminTab, string> = {
  metrics: 'Métricas',
  inventory: 'Inventario',
  expenses: 'Gastos',
  users: 'Vendedores',
  allies: 'Alianzas',
  customers: 'CRM',
  settings: 'Config',
};

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [confirmPayFirst, setConfirmPayFirst] = useState(false);

  const goTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

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
      case 'allies':
        return <AlliesTab showToast={showToast} />;
      case 'expenses':
        return <ExpensesTab showToast={showToast} onAlertsChanged={fetchAlerts} refreshSignal={alertsVersion} />;
      case 'settings':
        return <SettingsTab showToast={showToast} />;
    }
  };

  return (
    <div className="h-dvh bg-[#f8f9fa] flex flex-col relative overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl z-[100] animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}

      {/* Alertas de Gastos Recurrentes (Barra Superior) */}
      {recurringExpenses.length > 0 && (
        <div className="shrink-0 bg-red-500 text-white px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-md">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <Bell className="w-5 h-5 animate-pulse shrink-0" />
            <span className="font-bold text-sm sm:text-base">¡Atención! Gastos por vencer:</span>
            {recurringExpenses.map(exp => (
              <span key={exp.id} className="bg-red-600 px-2.5 py-1 rounded text-xs sm:text-sm font-medium truncate max-w-[12rem] sm:max-w-none">
                {exp.description} (-{differenceInDays(new Date(exp.next_due_date), new Date())} días)
              </span>
            ))}
          </div>
          <button
            onClick={() => setConfirmPayFirst(true)}
            className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white px-3 py-1.5 rounded font-bold text-xs sm:text-sm transition-colors shrink-0"
          >
            <CheckCircle className="w-4 h-4" /> PAGAR PRIMERO
          </button>
        </div>
      )}

      {confirmPayFirst && recurringExpenses[0] && (
        <ConfirmModal
          variant="plain"
          tone="primary"
          title="Registrar pago"
          confirmLabel="Sí, pagar"
          onCancel={() => setConfirmPayFirst(false)}
          onConfirm={() => {
            const exp = recurringExpenses[0];
            setConfirmPayFirst(false);
            void payRecurringExpense(exp);
          }}
        >
          <p className="text-sm text-gray-600">
            ¿Marcar como pagado <b>{recurringExpenses[0].description}</b> (${recurringExpenses[0].amount_usd})?
          </p>
        </ConfirmModal>
      )}

      {/* Barra móvil */}
      <div className="md:hidden shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 text-center">
          <div className="font-bold tracking-tight text-sm">
            <span className="text-orange-500">Calórico</span> Fit
          </div>
          <div className="text-[11px] text-gray-400 font-semibold truncate">{TAB_LABELS[activeTab]}</div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="p-2 rounded-lg text-red-600 hover:bg-red-50"
          aria-label="Cerrar sesión"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {mobileNavOpen && (
          <button
            type="button"
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            aria-label="Cerrar menú"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <aside
          className={`fixed md:relative inset-y-0 left-0 z-50 w-[min(18rem,85vw)] md:w-64 md:h-full md:shrink-0 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="shrink-0 p-5 md:p-6 border-b border-gray-100 flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-orange-500">Calórico</span> Fit
              </h1>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Admin / Propietario
              </span>
            </div>
            <button
              type="button"
              className="md:hidden p-1.5 text-gray-400 hover:text-gray-700"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 min-h-0 p-3 md:p-4 space-y-1.5 overflow-y-auto overscroll-contain">
            <button onClick={() => goTab('metrics')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'metrics' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <BarChart3 className="w-5 h-5 shrink-0" /> Métricas y Finanzas
            </button>
            <button onClick={() => goTab('inventory')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'inventory' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Package className="w-5 h-5 shrink-0" /> Inventario & Inversión
            </button>
            <button onClick={() => goTab('expenses')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'expenses' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Calendar className="w-5 h-5 shrink-0" /> Gastos Recurrentes
            </button>
            <button onClick={() => goTab('users')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'users' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Users className="w-5 h-5 shrink-0" /> Vendedores
            </button>
            <button onClick={() => goTab('allies')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'allies' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Handshake className="w-5 h-5 shrink-0" /> Alianzas
            </button>
            <button onClick={() => goTab('customers')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'customers' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <FileText className="w-5 h-5 shrink-0" /> Base CRM
            </button>
            <button onClick={() => goTab('settings')} className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base ${activeTab === 'settings' ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Settings className="w-5 h-5 shrink-0" /> Configuración
            </button>
          </nav>
          <div className="shrink-0 p-3 md:p-4 border-t border-gray-200">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" /> Cerrar Sesión
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 p-4 sm:p-6 md:p-8 overflow-y-auto overflow-x-hidden overscroll-contain">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
