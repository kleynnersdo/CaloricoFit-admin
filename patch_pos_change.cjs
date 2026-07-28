const fs = require('fs');
let code = fs.readFileSync('src/components/POS.tsx', 'utf-8');

// Add state
code = code.replace(
  "const [searchTerm, setSearchTerm] = useState('');",
  "const [searchTerm, setSearchTerm] = useState('');\n  const [receivedAmount, setReceivedAmount] = useState<string>('');"
);

// Add clear logic
code = code.replace(
  "setSelectedPaymentMethod(paymentMethods[0]);",
  "setSelectedPaymentMethod(paymentMethods[0]);\n    setReceivedAmount('');"
);

// Add markup
const markup = `
          <div className="flex justify-between items-end mb-6">
            <span className="text-lg font-bold text-gray-900">Total a Pagar</span>
            <div className="text-right">
              <span className="text-3xl font-black text-orange-500 leading-none">\${Number(totalUSD || 0).toFixed(2)}</span>
            </div>
          </div>
          
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
             <label className="block text-sm font-bold text-gray-700 mb-2">Monto Recibido ({selectedPaymentMethod?.currency || 'USD'})</label>
             <input 
               type="number" 
               min="0"
               step="0.01"
               value={receivedAmount}
               onChange={(e) => setReceivedAmount(e.target.value)}
               className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-lg font-bold"
               placeholder="Ej: 20.00"
             />
             {Number(receivedAmount) > 0 && (
               <div className="mt-3 flex justify-between items-center text-sm">
                 <span className="font-bold text-gray-700">Vuelto a entregar:</span>
                 <div className="text-right">
                    {selectedPaymentMethod?.currency === 'VES' ? (
                       <>
                         <div className={\`font-black text-lg \${(Number(receivedAmount) - totalVES) >= 0 ? 'text-green-600' : 'text-red-500'}\`}>
                           Bs. {((Number(receivedAmount) - totalVES) >= 0 ? (Number(receivedAmount) - totalVES) : 0).toFixed(2)}
                         </div>
                         <div className="text-gray-500 text-xs">
                           $ {((Number(receivedAmount) - totalVES) >= 0 ? (Number(receivedAmount) - totalVES) / actualOficialBCV : 0).toFixed(2)}
                         </div>
                       </>
                    ) : (
                       <>
                         <div className={\`font-black text-lg \${(Number(receivedAmount) - totalUSD) >= 0 ? 'text-green-600' : 'text-red-500'}\`}>
                           $ {((Number(receivedAmount) - totalUSD) >= 0 ? (Number(receivedAmount) - totalUSD) : 0).toFixed(2)}
                         </div>
                         <div className="text-gray-500 text-xs">
                           Bs. {((Number(receivedAmount) - totalUSD) >= 0 ? (Number(receivedAmount) - totalUSD) * actualOficialBCV : 0).toFixed(2)}
                         </div>
                       </>
                    )}
                 </div>
               </div>
             )}
          </div>
`;

code = code.replace(
  /<div className="flex justify-between items-end mb-6">[\s\S]*?<\/div>[\s\S]*?<\/div>/,
  markup
);

fs.writeFileSync('src/components/POS.tsx', code);
