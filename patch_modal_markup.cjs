const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf-8');

const modalMarkup = `
         {/* Modal de Limpiar Ventas */}
         {isClearSalesModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
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
                   <div className="p-4 space-y-4">
                     <p className="text-sm text-gray-600">Selecciona el periodo que deseas borrar. Esta acción es irreversible.</p>
                     <div className="grid grid-cols-1 gap-2">
                        {[
                           {id: 'TODAY', label: 'Hoy'},
                           {id: 'THIS_WEEK', label: 'Últimos 7 días'},
                           {id: 'THIS_MONTH', label: 'Este mes'},
                           {id: 'LAST_3_MONTHS', label: 'Últimos 3 meses'},
                           {id: 'LAST_6_MONTHS', label: 'Últimos 6 meses'},
                           {id: 'ALL', label: 'Todo el historial'}
                        ].map(opt => (
                           <label key={opt.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                              <input 
                                 type="radio" 
                                 name="clearSalesPeriod" 
                                 value={opt.id}
                                 checked={clearSalesPeriod === opt.id}
                                 onChange={(e) => setClearSalesPeriod(e.target.value as any)}
                                 className="w-4 h-4 text-red-600 focus:ring-red-500"
                              />
                              <span className="text-sm font-medium text-gray-700">{opt.label}</span>
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
                           className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-md shadow-red-200 transition-colors"
                        >
                           Siguiente
                        </button>
                     </div>
                   </div>
                ) : (
                   <div className="p-6 text-center space-y-4">
                     <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                     </div>
                     <h4 className="text-lg font-bold text-gray-900">¿Estás absolutamente seguro?</h4>
                     <p className="text-sm text-gray-600">
                        Estás a punto de eliminar las ventas del periodo seleccionado ({clearSalesPeriod}).
                        <br/><br/>
                        <strong>Esto no se puede deshacer.</strong> Las métricas y estadísticas se recalcularán sin estos datos.
                     </p>
                     
                     <div className="flex justify-center gap-3 mt-6">
                        <button 
                           onClick={() => setClearSalesStep(1)} 
                           className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors"
                        >
                           Volver
                        </button>
                        <button 
                           onClick={handleConfirmClearSales} 
                           className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-200 transition-colors"
                        >
                           Sí, Eliminar Permanentemente
                        </button>
                     </div>
                   </div>
                )}
               </div>
            </div>
         )}
`;

code = code.replace(
  "{/* Modal de Limpiar Cierres */}",
  modalMarkup + "\n         {/* Modal de Limpiar Cierres */}"
);

fs.writeFileSync('src/components/AdminDashboard.tsx', code);
