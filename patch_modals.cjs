const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf-8');

// Adding state
code = code.replace(
  "const [isClearClosuresModalOpen, setIsClearClosuresModalOpen] = useState(false);",
  "const [isClearSalesModalOpen, setIsClearSalesModalOpen] = useState(false);\n  const [clearSalesStep, setClearSalesStep] = useState<1 | 2>(1);\n  const [clearSalesPeriod, setClearSalesPeriod] = useState<'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'ALL'>('THIS_WEEK');\n  const [isClearClosuresModalOpen, setIsClearClosuresModalOpen] = useState(false);"
);

// Adding function
const funcToAdd = `
  const handleClearSalesClick = () => {
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

      const { error } = await query;
      if (error) throw error;

      showToast("Historial de ventas limpiado exitosamente.");
      setIsClearSalesModalOpen(false);
      calculateMetrics();
    } catch (err: any) {
      console.error("Error al limpiar historial de ventas:", err);
      showToast("Error al limpiar el historial: " + (err.message || 'Error de permisos o base de datos'));
    }
  };
`;
code = code.replace(
  "const handleClearClosures = async () => {",
  funcToAdd + "\n  const handleClearClosures = async () => {"
);

// Adding button
code = code.replace(
  `<div className="p-4 border-b border-gray-200 bg-gray-50 font-bold">Lista de Ventas ({metricFilter})</div>`,
  `<div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">\n    <span className="font-bold">Lista de Ventas ({metricFilter})</span>\n    <button onClick={handleClearSalesClick} className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1">\n       <Trash2 className="w-4 h-4"/> Limpiar Ventas\n    </button>\n</div>`
);

fs.writeFileSync('src/components/AdminDashboard.tsx', code);
