import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { GLOBAL_CONFIG } from '../../lib/utils';
import { fetchOfficialBcv, formatBs, resolveBcvRate } from '../../lib/bcv';
import { AlertTriangle, Edit, Plus, Trash2, X } from 'lucide-react';
import Modal from '../ui/Modal';

interface SettingsTabProps {
  showToast: (msg: string) => void;
}

// Configuración del sistema: tasa BCV + recargo VES, mensaje de WhatsApp,
// programa de fidelidad y métodos de pago.
export default function SettingsTab({ showToast }: SettingsTabProps) {
  const [vesMarkupPercentage, setVesMarkupPercentage] = useState(0);
  const [whatsappMessage, setWhatsappMessage] = useState("¡Hola! Aquí tienes el comprobante de tu compra en Calórico Fit. ¡Gracias por preferirnos!");
  const [officialBcv, setOfficialBcv] = useState<{rate: number, date: string} | null>(null);

  // Fidelidad
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(10);
  const [loyaltySpendingRate, setLoyaltySpendingRate] = useState(15);
  const [loyaltyMinSpend, setLoyaltyMinSpend] = useState(1000);
  const [loyaltyMaxRedemptionPercentage, setLoyaltyMaxRedemptionPercentage] = useState(100);
  const [loyaltyRewardMode, setLoyaltyRewardMode] = useState(false);
  const [loyaltyRewardThreshold, setLoyaltyRewardThreshold] = useState(500);
  const [loyaltyRewardType, setLoyaltyRewardType] = useState('fixed'); // 'percentage', 'fixed'
  const [loyaltyRewardValue, setLoyaltyRewardValue] = useState(5);

  // Métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [paymentMethodForm, setPaymentMethodForm] = useState<any>({ name: '', currency: 'USD', discount_percentage: 0, surcharge_percentage: 0, is_active: true });

  // Modal Error de Base de Datos - Columna Faltante
  const [isSchemaErrorModalOpen, setIsSchemaErrorModalOpen] = useState(false);
  const [schemaErrorSql, setSchemaErrorSql] = useState('');
  const [isSqlCopiado, setIsSqlCopiado] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    const { data } = await api.from('payment_methods').select('*').order('created_at', { ascending: true });
    if (data) setPaymentMethods(data);
  };

  const fetchSettings = async () => {
    // Fetch stored markup percentage
    const { data: vesData } = await api.from('settings').select('value').eq('id', 'ves_markup_percentage').single();
    if (vesData) setVesMarkupPercentage(Number(vesData.value) || 0);

    // Fetch whatsapp message (ignoring error if column does not exist yet)
    let wpData = null;
    try {
        const res = await api.from('settings').select('text_value').eq('id', 'whatsapp_message').single();
        wpData = res.data;
    } catch(e) {}
    if (wpData && wpData.text_value) setWhatsappMessage(wpData.text_value);

    // Fetch loyalty settings
    const { data: loyaltySettings } = await api.from('settings').select('*').in('id', [
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

    try {
      setOfficialBcv(await fetchOfficialBcv());
    } catch {
      setOfficialBcv({ rate: GLOBAL_CONFIG.BCV_RATE, date: new Date().toISOString().split('T')[0] });
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

    const { error } = await api.from('settings').upsert(settingsToUpsert);
    if (error) showToast("Error al actualizar configuración: " + error.message);
    else showToast("Configuración actualizada exitosamente.");
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
         const { error } = await api.from('payment_methods').update(payload).eq('id', paymentMethodForm.id);
         if (error) {
            console.error("Error al actualizar método de pago:", error);
            const isMissingColumn = (error.message || '').includes('surcharge_percentage') || error.code === 'PGRST204';

            if (isMissingColumn) {
               setSchemaErrorSql('ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) DEFAULT 0;');
               setIsSchemaErrorModalOpen(true);
               setIsSqlCopiado(false);

               // Fallback: update without surcharge_percentage
               const { error: fallbackErr } = await api.from('payment_methods').update({
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
         const { error } = await api.from('payment_methods').insert([payload]);
         if (error) {
            console.error("Error al registrar método de pago:", error);
            const isMissingColumn = (error.message || '').includes('surcharge_percentage') || error.code === 'PGRST204';

            if (isMissingColumn) {
               setSchemaErrorSql('ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS surcharge_percentage NUMERIC(5,2) DEFAULT 0;');
               setIsSchemaErrorModalOpen(true);
               setIsSqlCopiado(false);

               // Fallback: insert without surcharge_percentage
               const { error: fallbackErr } = await api.from('payment_methods').insert([{
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
      await api.from('payment_methods').delete().eq('id', id);
      showToast("Método de pago eliminado");
      fetchPaymentMethods();
  };

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
                      <div className="text-3xl font-black text-gray-900">Bs. {formatBs(resolveBcvRate(officialBcv.rate))}</div>
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
                  Ejemplo: Un producto de $100 se cobrará a ${(100 * (1 + (Number(vesMarkupPercentage) || 0)/100)).toFixed(2)} y luego se convertirá a Bolívares usando Bs. {formatBs(resolveBcvRate(officialBcv.rate))}. Total aproximado: Bs. {formatBs(100 * (1 + (Number(vesMarkupPercentage) || 0)/100) * resolveBcvRate(officialBcv.rate))}
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

      {/* Modal Método de Pago */}
      {isPaymentMethodModalOpen && (
        <Modal title={paymentMethodForm.id ? 'Editar Método de Pago' : 'Nuevo Método de Pago'} onClose={() => setIsPaymentMethodModalOpen(false)}>
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
        </Modal>
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
    </>
  );
}
