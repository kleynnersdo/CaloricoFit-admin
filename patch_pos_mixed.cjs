const fs = require('fs');
let code = fs.readFileSync('src/components/POS.tsx', 'utf-8');

// Add states
code = code.replace(
  "const [receivedAmount, setReceivedAmount] = useState<string>('');",
  "const [receivedAmount, setReceivedAmount] = useState<string>('');\n  const [isMixedPaymentModalOpen, setIsMixedPaymentModalOpen] = useState(false);\n  const [mixedAmounts, setMixedAmounts] = useState({ USD: '', USDT: '', VES: '', Zelle: '' });"
);

// Modify clear logic
code = code.replace(
  "setReceivedAmount('');",
  "setReceivedAmount('');\n    setMixedAmounts({ USD: '', USDT: '', VES: '', Zelle: '' });"
);

// Add button
code = code.replace(
  "</div>\n              </div>\n\n              <div className=\"mb-6 p-4 bg-gray-50 rounded-xl",
  `<button onClick={() => setIsMixedPaymentModalOpen(true)} className={\`col-span-2 p-3 rounded-lg border-2 text-center text-sm font-bold transition-all \${selectedPaymentMethod?.name.startsWith('MIXTO') ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-700 hover:border-orange-200'}\`}>Pago Mixto (Varias Monedas)</button></div>\n              </div>\n\n              <div className=\"mb-6 p-4 bg-gray-50 rounded-xl`
);

// Add modal logic
const mixedModal = `
      {isMixedPaymentModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Pago Mixto</h3>
            <div className="mb-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
               <div>Total a pagar: <strong>\${totalUSD.toFixed(2)}</strong> (Bs. {totalVES.toFixed(2)})</div>
               <div>Restante: <strong>\${Math.max(0, totalUSD - (Number(mixedAmounts.USD) + Number(mixedAmounts.USDT) + Number(mixedAmounts.Zelle) + (Number(mixedAmounts.VES) / actualOficialBCV))).toFixed(2)}</strong></div>
            </div>
            
            <div className="space-y-3">
               <div>
                 <label className="block text-xs font-bold text-gray-700 mb-1">Efectivo USD ($)</label>
                 <input type="number" min="0" step="0.01" value={mixedAmounts.USD} onChange={e => setMixedAmounts({...mixedAmounts, USD: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="0.00" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-700 mb-1">USDT ($)</label>
                 <input type="number" min="0" step="0.01" value={mixedAmounts.USDT} onChange={e => setMixedAmounts({...mixedAmounts, USDT: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="0.00" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-700 mb-1">Zelle ($)</label>
                 <input type="number" min="0" step="0.01" value={mixedAmounts.Zelle} onChange={e => setMixedAmounts({...mixedAmounts, Zelle: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="0.00" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-gray-700 mb-1">Bolívares (Bs.)</label>
                 <input type="number" min="0" step="0.01" value={mixedAmounts.VES} onChange={e => setMixedAmounts({...mixedAmounts, VES: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="0.00" />
               </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
               <button onClick={() => setIsMixedPaymentModalOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold">Cancelar</button>
               <button onClick={() => {
                  setSelectedPaymentMethod({ name: 'MIXTO|' + JSON.stringify(mixedAmounts), currency: 'MIXTO', discount_percentage: 0, surcharge_percentage: 0 } as any);
                  setIsMixedPaymentModalOpen(false);
               }} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-bold">Confirmar</button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(
  "{/* Modal de Checkout */}",
  mixedModal + "\n      {/* Modal de Checkout */}"
);

fs.writeFileSync('src/components/POS.tsx', code);
