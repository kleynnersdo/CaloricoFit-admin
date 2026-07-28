import React, { useState, useEffect, useRef } from "react";
import { ShoppingCart, Search, Trash2, Camera, UserPlus, CreditCard, ChevronDown, Check, LogOut, X, AlertCircle, Coins } from "lucide-react";
import { Product, CartItem, Customer, PaymentMethod } from "../types";
import { GLOBAL_CONFIG, cn } from "../lib/utils";
import BarcodeScanner from "./BarcodeScanner";
import { supabase } from "../lib/supabase";
import * as htmlToImage from "html-to-image";

interface POSProps {
  onLogout: () => void;
}

export default function POS({ onLogout }: POSProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [appliedReward, setAppliedReward] = useState(false);
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [isCierreCajaModalOpen, setIsCierreCajaModalOpen] = useState(false);
  const [confirmClosureChecked, setConfirmClosureChecked] = useState(false);

  const fetchTodaySales = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Obtener el último cierre de caja del vendedor
        const { data: lastClosures } = await supabase
          .from('cash_closures')
          .select('created_at')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        let query = supabase
          .from('sales')
          .select('*')
          .eq('status', 'COMPLETED')
          .eq('seller_id', user.id);

        if (lastClosures && lastClosures.length > 0 && lastClosures[0]?.created_at) {
          query = query.gt('created_at', lastClosures[0].created_at);
        } else {
          const today = new Date();
          today.setHours(0,0,0,0);
          query = query.gte('created_at', today.toISOString());
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        setTodaySales(data || []);
      } catch (err) {
        console.error("Error al cargar ventas del turno:", err);
        setTodaySales([]);
      }
  };

  useEffect(() => {
    fetchTodaySales();
  }, []);

  useEffect(() => {
    if(isCierreCajaModalOpen) {
        fetchTodaySales();
    }
  }, [isCierreCajaModalOpen]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [inventory, setInventory] = useState<Product[]>([]);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [cedulaBusqueda, setCedulaBusqueda] = useState("");
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Nuevo estado para formulario rápido de cliente
  const [newCustomerForm, setNewCustomerForm] = useState({
    first_name: "", last_name: "", phone: "+58", email: "", city: ""
  });
  const [vesMarkupPercentage, setVesMarkupPercentage] = useState(0);
  const [officialBcv, setOfficialBcv] = useState<{rate: number, date: string} | null>(null);
  const [loyaltyEarningRate, setLoyaltyEarningRate] = useState(10);
  const [loyaltySpendingRate, setLoyaltySpendingRate] = useState(15);
  const [loyaltyMinSpend, setLoyaltyMinSpend] = useState(1000);
  const [loyaltyMaxRedemptionPercentage, setLoyaltyMaxRedemptionPercentage] = useState(100);
  const [pointsToRedeem, setPointsToRedeem] = useState<number | ''>('');
  const [loyaltyRewardMode, setLoyaltyRewardMode] = useState(false);
  const [loyaltyRewardThreshold, setLoyaltyRewardThreshold] = useState(500);
  const [loyaltyRewardType, setLoyaltyRewardType] = useState('fixed');
  const [loyaltyRewardValue, setLoyaltyRewardValue] = useState(5);
  const [whatsappMessage, setWhatsappMessage] = useState("¡Hola! Aquí tienes el comprobante de tu compra en Calórico Fit. ¡Gracias por preferirnos!");
  const ticketRef = useRef<HTMLDivElement>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<string>('');

  // States for 'vueltos' (change calculation)
  const [giveChange, setGiveChange] = useState(false);
  const [changeCurrency, setChangeCurrency] = useState<'USD' | 'VES'>('USD');

  // States for multi-currency payment
  const [isMultiCurrency, setIsMultiCurrency] = useState(false);
  const [multiPayments, setMultiPayments] = useState<{ [methodId: string]: number }>({});
  const [selectedMultiMethodId, setSelectedMultiMethodId] = useState<string>('');
  const [multiAmountInput, setMultiAmountInput] = useState<string>('');

  const getPaymentUsdEquivalent = (pmId: string, amount: number) => {
    const pm = paymentMethods.find(p => p.id === pmId);
    if (!pm) return 0;
    
    const isVes = pm.currency === 'VES' || (pm.name || '').toUpperCase().includes('VES') || (pm.name || '').toUpperCase().includes('PAGO MÓVIL') || (pm.name || '').toUpperCase().includes('PAGOMOVIL') || (pm.name || '').toUpperCase().includes('PUNTO');
    
    if (isVes) {
      const rate = actualOficialBCV * markupMultiplier;
      return rate > 0 ? amount / rate : 0;
    }
    return amount;
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data: vesData } = await supabase.from('settings').select('value').eq('id', 'ves_markup_percentage').single();
        if (vesData) setVesMarkupPercentage(vesData.value);

        let wpData = null;
        try {
            const res = await supabase.from('settings').select('text_value').eq('id', 'whatsapp_message').single();
            wpData = res.data;
        } catch(e) {}
        if (wpData && wpData.text_value) setWhatsappMessage(wpData.text_value);

        const { data: loyaltySettings } = await supabase.from('settings').select('*').in('id', [
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
      } catch (e) {}

      // Fetch official rate from api with fallback
      try {
        let fetchedRate: number | null = null;
        let fetchedDate = new Date().toISOString().split('T')[0];
        try {
          const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
          if (response.ok) {
            const json = await response.json();
            if (json && typeof json.promedio === 'number') {
              fetchedRate = json.promedio;
              if (json.fechaActualizacion) {
                fetchedDate = json.fechaActualizacion.split('T')[0];
              }
            }
          }
        } catch {
          // Silent fallback on network/CORS error
        }

        if (fetchedRate) {
          setOfficialBcv({ rate: fetchedRate, date: fetchedDate });
        } else {
          setOfficialBcv({ rate: 36.50, date: fetchedDate });
        }
      } catch {
        setOfficialBcv({ rate: 36.50, date: new Date().toISOString().split('T')[0] });
      }
    }
    fetchSettings();

    const fetchInventory = async () => {
      try {
        const { data, error } = await supabase.from('products').select('*').eq('is_active', true);
        if (error) throw error;
        if (data) {
          setInventory(data);
        }
      } catch (error) {
        console.error("Error cargando el inventario de Supabase.", error);
        showToast("Atención: No se pudo conectar a la base de datos.");
      }
    };
    
    const fetchPaymentMethods = async () => {
      const { data } = await supabase.from('payment_methods').select('*').eq('is_active', true);
      if (data) {
          setPaymentMethods(data);
          if (data.length > 0) {
            setSelectedPaymentMethod(data[0]);
            const firstNonPoints = data.find(p => p.currency !== 'POINTS') || data[0];
            setSelectedMultiMethodId(firstNonPoints.id);
          }
      }
    };

    fetchInventory();
    fetchPaymentMethods();
  }, []);
  
  // Buscar productos dinámicamente
  const searchResults = searchTerm.length >= 2 
    ? inventory.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (p.barcode && p.barcode.includes(searchTerm)) || 
        (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : [];

  const handleAddToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          showToast(`Stock insuficiente. Solo quedan ${product.stock_quantity} unidades.`);
          return prev;
        }
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      if (product.stock_quantity <= 0) {
        showToast("Producto agotado.");
        return prev;
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearchTerm("");
  };

  const handleUpdateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== id));
      return;
    }
    const product = inventory.find(p => p.id === id);
    if (product && qty > product.stock_quantity) {
        showToast(`Stock insuficiente. Max: ${product.stock_quantity}`);
        return;
    }
    setCart(prev => prev.map(item => item.product.id === id ? { ...item, quantity: qty } : item));
  };

  const handleBarcodeScan = (text: string) => {
    const product = inventory.find(p => p.barcode === text);
    if (product) {
      handleAddToCart(product);
      setIsScannerOpen(false);
    } else {
      showToast("Producto no encontrado en inventario.");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const searchCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedulaBusqueda) return;
    setIsSearchingCustomer(true);
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('document_id', cedulaBusqueda.toUpperCase())
        .single();
        
      if (data) {
        setCustomer(data);
        setIsCustomerModalOpen(false);
      } else {
        // No se encontró, preparar para registrar
        showToast("Cliente no encontrado en la base de datos.");
        setNewCustomerForm({ ...newCustomerForm }); // Resetear pero mantener listo
      }
    } catch (err: any) {
      if (err.code === "PGRST116") {
        // No hay filas (No encontrado es 116 en PostgREST)
        showToast("Cliente no encontrado. Proceda a agregarlo.");
      } else {
        console.error("Error buscando cliente", err);
      }
    } finally {
      setIsSearchingCustomer(false);
    }
  };

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([{
          document_id: cedulaBusqueda.toUpperCase(),
          ...newCustomerForm
        }])
        .select()
        .single();
        
      if (error) throw error;
      if (data) {
        setCustomer(data);
        setIsCustomerModalOpen(false);
        setNewCustomerForm({first_name: "", last_name: "", phone: "", email: "", city: ""});
      }
    } catch (err: any) {
      showToast("Error al registrar cliente: " + err.message);
    }
  };

  // Cálculos Multi-moneda
  const subtotalUSD = cart.reduce((sum, item) => sum + (item.product.sale_price * item.quantity), 0);
  
  const discountPercentage = selectedPaymentMethod ? (selectedPaymentMethod.discount_percentage || 0) / 100 : 0;
  
  let loyaltyDiscountAmount = 0;
  let effectivePointsToRedeem = 0;
  if (customer && pointsToRedeem && pointsToRedeem > 0) {
      effectivePointsToRedeem = Math.min(Number(pointsToRedeem), customer.loyalty_points);
      if (loyaltyRewardMode) {
          // Si es por metas, el admin decide si es un descuento porcentual o fijo
          // Pero se requieren múltiplos de loyaltyRewardThreshold
          const timesThreshold = Math.floor(effectivePointsToRedeem / loyaltyRewardThreshold);
          effectivePointsToRedeem = timesThreshold * loyaltyRewardThreshold;
          
          if (loyaltyRewardType === 'percentage') {
              loyaltyDiscountAmount = subtotalUSD * (loyaltyRewardValue * timesThreshold / 100);
          } else {
              loyaltyDiscountAmount = loyaltyRewardValue * timesThreshold;
          }
      } else {
          loyaltyDiscountAmount = effectivePointsToRedeem / loyaltySpendingRate;
      }

      // Validar límite máximo de canje (porcentaje del subtotal)
      const maxDiscountFromPoints = subtotalUSD * (loyaltyMaxRedemptionPercentage / 100);
      if (loyaltyDiscountAmount > maxDiscountFromPoints) {
          loyaltyDiscountAmount = maxDiscountFromPoints;
          // Recalcular puntos efectivos usados si se topa por máximo descuento
          if (!loyaltyRewardMode) {
             effectivePointsToRedeem = Math.floor(loyaltyDiscountAmount * loyaltySpendingRate);
          }
      }
  }

  const methodDiscountAmount = (subtotalUSD - loyaltyDiscountAmount) * discountPercentage;
  const discountAmount = methodDiscountAmount + loyaltyDiscountAmount;

  const surchargePercentage = selectedPaymentMethod ? (selectedPaymentMethod.surcharge_percentage || 0) / 100 : 0;
  const surchargeAmount = (subtotalUSD - loyaltyDiscountAmount) * surchargePercentage;

  const totalUSD = subtotalUSD - discountAmount + surchargeAmount;
  
  const actualOficialBCV = officialBcv ? officialBcv.rate : 36.5;
  const markupMultiplier = 1 + (vesMarkupPercentage / 100);
  const totalVES = totalUSD * markupMultiplier * actualOficialBCV;

  const isUsdtSale = (s: any) =>
    s.currency_used === 'USDT' ||
    (s.payment_method || '').toUpperCase().includes('USDT') ||
    (s.payment_method || '').toUpperCase().includes('CRIPTO') ||
    (s.payment_method || '').toUpperCase().includes('BINANCE');

  const isVesSale = (s: any) =>
    s.currency_used === 'VES' ||
    (s.payment_method || '').toUpperCase().includes('PAGO MÓVIL') ||
    (s.payment_method || '').toUpperCase().includes('PAGOMOVIL') ||
    (s.payment_method || '').toUpperCase().includes('PUNTO') ||
    (s.payment_method || '').toUpperCase().includes('VES');

  const isUsdCashSale = (s: any) =>
    !isUsdtSale(s) &&
    !isVesSale(s) &&
    (s.currency_used === 'USD' || !s.currency_used);

  
  const getSystemUSD = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.USD || 0);
        } catch(e) { return acc; }
      }
      if (isUsdCashSale(s)) return acc + Number(s.total_usd);
      return acc;
    }, 0);
  };

  const getSystemUSDT = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.USDT || 0);
        } catch(e) { return acc; }
      }
      if (isUsdtSale(s)) return acc + Number(s.total_usd);
      return acc;
    }, 0);
  };

  const getSystemVES = (sales: any[]) => {
    return sales.reduce((acc, s) => {
      if (s.payment_method?.startsWith('MIXTO|')) {
        try {
          const data = JSON.parse(s.payment_method.split('|')[1]);
          return acc + Number(data.VES || 0);
        } catch(e) { return acc; }
      }
      if (isVesSale(s)) return acc + (Number(s.total_usd) * getEffectiveVesRate(s));
      return acc;
    }, 0);
  };

  const getEffectiveVesRate = (s: any) => {
    const rate = Number(s.exchange_rate_applied) || actualOficialBCV;
    if (rate <= (actualOficialBCV * 1.05) && vesMarkupPercentage > 0) {
      return rate * markupMultiplier;
    }
    return rate;
  };
  
  let pointsRequired = 0;
  let canUseLoyalty = false;
  let loyaltyMessage = "";

  if (!loyaltyRewardMode) {
      pointsRequired = totalUSD * loyaltySpendingRate;
      canUseLoyalty = customer && customer.loyalty_points >= pointsRequired && pointsRequired >= loyaltyMinSpend;
      loyaltyMessage = `Puntos Requeridos: ${pointsRequired.toFixed(0)} pts. ${pointsRequired < loyaltyMinSpend ? `(Mínimo para canjear: ${loyaltyMinSpend})` : ''}`;
  } else {
      pointsRequired = loyaltyRewardThreshold;
      canUseLoyalty = customer && customer.loyalty_points >= pointsRequired;
      loyaltyMessage = `Meta Requerida: ${loyaltyRewardThreshold} pts. Recompensa: ${loyaltyRewardType === 'percentage' ? loyaltyRewardValue + '%' : '$' + loyaltyRewardValue} descuento.`;
  }

  const handleSendWhatsApp = async () => {
    if (!customer) {
      showToast("Debes asignar un cliente primero.");
      return;
    }
    if (!customer.phone) {
      showToast("El cliente no tiene un número de teléfono registrado.");
      return;
    }
    if (!ticketRef.current) {
      showToast("No se pudo encontrar el ticket.");
      return;
    }
    try {
      showToast("Generando imagen del ticket...");
      const blob = await htmlToImage.toBlob(ticketRef.current, { pixelRatio: 2 });
      if (!blob) {
        showToast("Error al generar la imagen.");
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        showToast("¡Imagen copiada al portapapeles! Abriendo WhatsApp...");
        
        const phoneStr = customer.phone.replace(/[^0-9]/g, '');

        const encodedMessage = encodeURIComponent(whatsappMessage);
        const whatsappUrl = `https://web.whatsapp.com/send?phone=${phoneStr}&text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
      } catch (clipboardError) {
        console.error("Error copiando al portapapeles:", clipboardError);
        showToast("No se pudo copiar al portapapeles automáticamente.");
      }
    } catch (err) {
      console.error("Error con html-to-image:", err);
      showToast("Hubo un error al generar la imagen del ticket.");
    }
  };

  const processSale = async () => {
    if(!customer) {
      showToast("Debes asignar un cliente primero.");
      return;
    }

    if (isMultiCurrency) {
      const totalPaidMultiUSD = Object.entries(multiPayments).reduce((sum, [pmId, amount]) => {
        return sum + getPaymentUsdEquivalent(pmId, amount as number);
      }, 0);
      if (totalPaidMultiUSD < (totalUSD - 0.01)) {
        showToast("El monto total registrado en los pagos multi-moneda es insuficiente.");
        return;
      }
    } else {
      if(!selectedPaymentMethod) {
          showToast("Debes seleccionar un método de pago.");
          return;
      }
      if(selectedPaymentMethod.currency === 'POINTS') {
          if(!canUseLoyalty) {
              showToast(`No cumples con los requisitos para canjear puntos.`);
              return;
          }
      }
    }

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const totalCostUSD = cart.reduce((sum, item) => sum + (item.product.cost_price * item.quantity), 0);
      
      let pointsEarned = 0;
      let currencyUsed = 'MIXTO';
      let rateToSave = actualOficialBCV;
      let paymentMethodName = '';

      if (isMultiCurrency) {
        pointsEarned = Math.round((subtotalUSD - loyaltyDiscountAmount) * loyaltyEarningRate);
        
        let usdSum = 0;
        let usdtSum = 0;
        let vesSum = 0;
        
        Object.entries(multiPayments).forEach(([pmId, val]) => {
          const pm = paymentMethods.find(p => p.id === pmId);
          if (pm) {
            const isUsdt = (pm.name || '').toUpperCase().includes('USDT') || (pm.name || '').toUpperCase().includes('CRIPTO') || (pm.name || '').toUpperCase().includes('BINANCE');
            const isVes = pm.currency === 'VES' || (pm.name || '').toUpperCase().includes('VES') || (pm.name || '').toUpperCase().includes('PAGO MÓVIL') || (pm.name || '').toUpperCase().includes('PAGOMOVIL') || (pm.name || '').toUpperCase().includes('PUNTO');
            
            if (isVes) {
              vesSum += Number(val);
            } else if (isUsdt) {
              usdtSum += Number(val);
            } else {
              usdSum += Number(val);
            }
          }
        });
        
        paymentMethodName = `MIXTO|${JSON.stringify({ USD: usdSum, USDT: usdtSum, VES: vesSum })}`;
      } else {
        if (selectedPaymentMethod!.currency !== 'POINTS') {
            pointsEarned = Math.round((subtotalUSD - loyaltyDiscountAmount) * loyaltyEarningRate);
        }

        currencyUsed = selectedPaymentMethod!.currency;
        if ((selectedPaymentMethod!.name || '').toUpperCase().includes('USDT') || (selectedPaymentMethod!.name || '').toUpperCase().includes('CRIPTO') || (selectedPaymentMethod!.name || '').toUpperCase().includes('BINANCE')) {
          currencyUsed = 'USDT';
        }

        rateToSave = (currencyUsed === 'VES' || (selectedPaymentMethod!.name || '').toUpperCase().includes('VES') || (selectedPaymentMethod!.name || '').toUpperCase().includes('PAGO MÓVIL') || (selectedPaymentMethod!.name || '').toUpperCase().includes('PAGOMOVIL') || (selectedPaymentMethod!.name || '').toUpperCase().includes('PUNTO'))
          ? actualOficialBCV * markupMultiplier
          : actualOficialBCV;
          
        paymentMethodName = selectedPaymentMethod!.name;
      }

      let sale: any = null;
      let saleError: any = null;

      const salePayload = {
        seller_id: user?.id,
        customer_id: customer.id,
        subtotal_usd: subtotalUSD,
        discount_usd: discountAmount,
        surcharge_usd: surchargeAmount,
        total_usd: totalUSD,
        cost_usd: totalCostUSD,
        payment_method: paymentMethodName,
        currency_used: currencyUsed,
        exchange_rate_applied: rateToSave,
        points_earned: pointsEarned
      };

      const res = await supabase.from('sales').insert([salePayload]).select().single();
      sale = res.data;
      saleError = res.error;

      if (saleError) {
        const fallbackPayload = { ...salePayload };
        delete (fallbackPayload as any).surcharge_usd;
        const res2 = await supabase.from('sales').insert([fallbackPayload]).select().single();
        sale = res2.data;
        saleError = res2.error;
      }

      if (saleError) throw saleError;

      const saleItems = cart.map((item) => ({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price_usd: item.product.sale_price,
          unit_cost_usd: item.product.cost_price,
          subtotal_usd: item.product.sale_price * item.quantity
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // Restar inventario local y remoto
      for (const item of cart) {
        const { error: rpcError } = await supabase.rpc('subtract_inventory_on_sale', { qty: item.quantity, pid: item.product.id });
        if (rpcError) {
          await supabase.from('products').update({ stock_quantity: item.product.stock_quantity - item.quantity }).eq('id', item.product.id);
        }
      }
      
      // Actualizar puntos del cliente
      const pointsToSubtract = (!isMultiCurrency && selectedPaymentMethod && selectedPaymentMethod.currency === 'POINTS') ? pointsRequired : effectivePointsToRedeem;
      const newLoyaltyPoints = (customer.loyalty_points || 0) + pointsEarned - pointsToSubtract;
      await supabase.from('customers').update({ loyalty_points: newLoyaltyPoints }).eq('id', customer.id);

      showToast("Venta procesada exitosamente.");
      setCart([]);
      setCustomer(null);
      setAppliedReward(false);
      setReceivedAmount('');
      setGiveChange(false);
      setIsMultiCurrency(false);
      setMultiPayments({});
      setIsCheckoutModalOpen(false);
      
      // Refrescar inventario y ventas del día
      const { data: newInv } = await supabase.from('products').select('*').eq('is_active', true);
      if (newInv) setInventory(newInv);
      fetchTodaySales();
      
    } catch (err: any) {
      console.error("Error completo", err);
      showToast("Error crítico al cobrar: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manejo de teclado
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsScannerOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    if (searchInputRef.current) searchInputRef.current.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden text-black font-sans relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl z-[100] animate-in fade-in slide-in-from-top-4">
          {toastMessage}
        </div>
      )}

      {/* Modal de Ticket / Checkout */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-orange-500 text-white p-4 text-center">
               <h3 className="font-bold text-lg">Confirma la venta con tu cliente</h3>
            </div>
            
            <div className="p-6">
              <div ref={ticketRef} className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-4 drop-shadow-sm font-mono text-sm leading-relaxed text-gray-700">
                <div className="text-center mb-4 border-b border-dashed border-gray-300 pb-2">
                  <div className="font-extrabold text-lg tracking-wider text-gray-900 uppercase">NOTA DE ENTREGA</div>
                  <div className="font-bold text-sm text-gray-800">Ticket de Venta</div>
                  <div className="text-xs text-gray-500 font-normal mt-0.5">(documento sin validez fiscal)</div>
                </div>
                <div className="mb-4">
                  <div>Cliente: {customer?.first_name} {customer?.last_name}</div>
                  <div>Cédula: {customer?.document_id}</div>
                  <div>Teléfono: {customer?.phone}</div>
                  <div>Tasa BCV Aplicada: Bs. {Number(actualOficialBCV || 0).toFixed(2)}</div>
                </div>
                <div className="border-b border-dashed border-gray-300 pb-2 mb-2">
                  <div className="grid grid-cols-12 font-bold mb-1">
                    <div className="col-span-2">CANT</div>
                    <div className="col-span-6">ITEM</div>
                    <div className="col-span-4 text-right">TOTAL (Bs)</div>
                  </div>
                  {cart.map(item => (
                    <div key={item.product.id} className="grid grid-cols-12">
                      <div className="col-span-2">{item.quantity}x</div>
                      <div className="col-span-6 line-clamp-1 truncate pr-2">{item.product.name}</div>
                      <div className="col-span-4 text-right">Bs. {Number(item.quantity * item.product.sale_price * markupMultiplier * actualOficialBCV || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                {loyaltyDiscountAmount > 0 && (
                   <div className="flex justify-between text-sm mt-1 text-gray-600">
                     <span>Dcto. Puntos:</span>
                     <span>- Bs. {Number(loyaltyDiscountAmount * markupMultiplier * actualOficialBCV || 0).toFixed(2)}</span>
                   </div>
                )}
                {discountAmount - loyaltyDiscountAmount > 0 && (
                   <div className="flex justify-between text-sm mt-1 text-gray-600">
                     <span>Dcto. Adicional:</span>
                     <span>- Bs. {Number((discountAmount - loyaltyDiscountAmount) * markupMultiplier * actualOficialBCV || 0).toFixed(2)}</span>
                   </div>
                )}
                {surchargeAmount > 0 && (
                   <div className="flex justify-between text-sm mt-1 text-gray-600">
                     <span>Recargo Adicional:</span>
                     <span>+ Bs. {Number(surchargeAmount * markupMultiplier * actualOficialBCV || 0).toFixed(2)}</span>
                   </div>
                )}
                <div className="text-right mt-2 text-base font-bold text-gray-900">
                  TOTAL A PAGAR: Bs. {Number(totalVES || 0).toFixed(2)}
                </div>
              </div>

              <div className="mb-6 flex justify-end">
                  <button onClick={handleSendWhatsApp} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold text-sm shadow flex items-center gap-2 transition-colors">
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                      Enviar al WhatsApp
                  </button>
              </div>

              {customer && customer.loyalty_points > 0 && !isMultiCurrency && selectedPaymentMethod?.currency === 'POINTS' && (
                  <div className="mb-6 bg-orange-50 border border-orange-200 p-4 rounded-lg">
                     <label className="block text-sm font-bold text-orange-900 mb-2">Canjear Puntos de Fidelidad (Saldo: {customer.loyalty_points} pts)</label>
                     <div className="flex gap-2 items-center">
                         <input 
                             type="number" 
                             className="w-full px-3 py-2 border border-orange-300 rounded outline-none focus:border-orange-500" 
                             placeholder="Puntos a canjear..."
                             value={pointsToRedeem}
                             onChange={e => setPointsToRedeem(e.target.value ? Number(e.target.value) : '')}
                         />
                     </div>
                     {loyaltyDiscountAmount > 0 && (
                         <div className="mt-2 text-sm text-green-700 font-bold">
                             ¡Descuento aplicado: ${Number(loyaltyDiscountAmount || 0).toFixed(2)} USD!
                             {loyaltyRewardMode && ` (Usando ${effectivePointsToRedeem} pts)`}
                         </div>
                     )}
                     <div className="text-xs text-orange-700 mt-1">Máx. de canje por venta: {loyaltyMaxRedemptionPercentage}%</div>
                  </div>
              )}

              {isMultiCurrency ? (
                 <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-black">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                       <span className="font-bold text-orange-600 text-sm flex items-center gap-1.5">
                          <Coins className="w-4 h-4" /> Pago Multi-Moneda
                       </span>
                       <button
                         type="button"
                         onClick={() => {
                           setIsMultiCurrency(false);
                           setMultiPayments({});
                         }}
                         className="text-xs font-bold text-orange-500 hover:text-orange-700 underline"
                       >
                         Cambiar a Pago Único
                       </button>
                    </div>

                    {/* Lista de pagos ingresados */}
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                       {Object.keys(multiPayments).length > 0 ? (
                          Object.entries(multiPayments).map(([pmId, val]) => {
                             const pm = paymentMethods.find(p => p.id === pmId);
                             if (!pm) return null;
                             const usdEq = getPaymentUsdEquivalent(pmId, val as number);
                             return (
                                <div key={pmId} className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200 text-xs shadow-sm">
                                   <div>
                                      <span className="font-bold text-gray-800">{pm.name}</span>
                                      <span className="text-gray-500 ml-1 font-semibold">
                                         ({pm.currency === 'VES' ? `Bs. ${(val as number).toFixed(2)}` : `$${(val as number).toFixed(2)}`})
                                      </span>
                                   </div>
                                   <div className="flex items-center gap-2">
                                      <span className="font-bold text-gray-700">≈ ${usdEq.toFixed(2)} USD</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                           const next = { ...multiPayments };
                                           delete next[pmId];
                                           setMultiPayments(next);
                                        }}
                                        className="text-red-500 hover:text-red-700 p-1"
                                      >
                                         <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                   </div>
                                </div>
                             );
                          })
                       ) : (
                          <div className="text-center py-4 bg-white rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
                             No se han registrado pagos aún. Agrega uno abajo.
                          </div>
                       )}
                    </div>

                    {/* Selector y entrada para agregar pago */}
                    <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-2 shadow-sm">
                       <div className="grid grid-cols-2 gap-2">
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Método</label>
                             <select
                               value={selectedMultiMethodId}
                               onChange={(e) => setSelectedMultiMethodId(e.target.value)}
                               className="w-full text-xs font-semibold p-2 bg-gray-50 border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent outline-none"
                             >
                                {paymentMethods.filter(pm => pm.currency !== 'POINTS').map(pm => (
                                   <option key={pm.id} value={pm.id}>{pm.name} ({pm.currency})</option>
                                ))}
                             </select>
                          </div>
                          <div>
                             <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Monto Recibido</label>
                             <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={multiAmountInput}
                                  onChange={(e) => setMultiAmountInput(e.target.value)}
                                  placeholder="Ej. 10.00"
                                  className="w-full text-xs font-bold p-2 pr-10 bg-gray-50 border border-gray-300 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent outline-none"
                                />
                                <span className="absolute right-2 top-2 text-[10px] font-bold text-gray-400">
                                   {paymentMethods.find(p => p.id === selectedMultiMethodId)?.currency || 'USD'}
                                </span>
                             </div>
                          </div>
                       </div>
                       <button
                         type="button"
                         onClick={() => {
                            const amt = Number(multiAmountInput);
                            if (!amt || amt <= 0) {
                               showToast("Monto inválido o vacío.");
                               return;
                            }
                            if (!selectedMultiMethodId) return;
                            setMultiPayments(prev => ({
                               ...prev,
                               [selectedMultiMethodId]: (prev[selectedMultiMethodId] || 0) + amt
                            }));
                            setMultiAmountInput('');
                         }}
                         className="w-full py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded transition-colors shadow-sm"
                       >
                         Agregar Monto
                       </button>
                    </div>

                    {/* Cuenta de cuánto falta */}
                    {(() => {
                       const totalPaidMultiUSD = Object.entries(multiPayments).reduce((sum, [pmId, amount]) => {
                         return sum + getPaymentUsdEquivalent(pmId, amount as number);
                       }, 0);
                       const remainingMultiUSD = Math.max(0, totalUSD - totalPaidMultiUSD);
                       const remainingMultiVES = remainingMultiUSD * markupMultiplier * actualOficialBCV;
                       const overpaidMultiUSD = Math.max(0, totalPaidMultiUSD - totalUSD);
                       const overpaidMultiVES = overpaidMultiUSD * markupMultiplier * actualOficialBCV;

                       return (
                          <div className="p-3 bg-white rounded-lg border border-gray-200 text-xs space-y-1.5 shadow-sm">
                             <div className="flex justify-between font-medium">
                                <span className="text-gray-500 font-semibold">Total Venta USD:</span>
                                <span className="font-bold text-gray-950">${totalUSD.toFixed(2)} USD</span>
                             </div>
                             <div className="flex justify-between font-medium">
                                <span className="text-gray-500 font-semibold">Total Recibido USD:</span>
                                <span className="font-bold text-green-600">${totalPaidMultiUSD.toFixed(2)} USD</span>
                             </div>
                             <div className="border-t border-gray-100 my-1 pt-1.5 flex justify-between items-center text-sm">
                                {remainingMultiUSD > 0 ? (
                                   <>
                                      <span className="font-extrabold text-orange-600">Restante por Cobrar:</span>
                                      <div className="text-right font-black text-orange-600">
                                         <div>${remainingMultiUSD.toFixed(2)} USD</div>
                                         <div className="text-[10px] text-gray-500">≈ Bs. {remainingMultiVES.toFixed(2)} VES</div>
                                      </div>
                                   </>
                                ) : (
                                   <>
                                      <span className="font-extrabold text-green-600">Vuelto a Entregar:</span>
                                      <div className="text-right font-black text-green-600">
                                         <div>${overpaidMultiUSD.toFixed(2)} USD</div>
                                         <div className="text-[10px] text-gray-500">≈ Bs. {overpaidMultiVES.toFixed(2)} VES</div>
                                      </div>
                                   </>
                                )}
                             </div>
                          </div>
                       );
                    })()}
                 </div>
              ) : (
                 <div className="mb-6">
                   <label className="block text-sm font-bold text-gray-700 mb-2">Seleccione Método de Pago</label>
                   <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.filter(pm => pm.currency !== 'POINTS' || (customer && customer.loyalty_points > 0)).map(pm => (
                         <button
                           key={pm.id}
                           type="button"
                           onClick={() => setSelectedPaymentMethod(pm)}
                           className={`p-3 rounded-lg border text-sm font-bold flex flex-col items-start gap-1 transition-colors ${selectedPaymentMethod?.id === pm.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                         >
                            <span>{pm.name}</span>
                            {pm.currency === 'POINTS' ? (
                               <span className="text-xs font-normal text-gray-500">Saldo: {customer?.loyalty_points || 0} pts</span>
                            ) : (
                               <div className="flex flex-wrap gap-1">
                                  {pm.discount_percentage > 0 && <span className="text-xs text-green-600 font-bold">-{pm.discount_percentage}% Dcto</span>}
                                  {pm.surcharge_percentage > 0 && <span className="text-xs text-amber-600 font-bold">+{pm.surcharge_percentage}% Recargo</span>}
                               </div>
                            )}
                         </button>
                      ))}
                   </div>
                   {selectedPaymentMethod && selectedPaymentMethod.currency === 'POINTS' && (
                       <div className={`mt-3 p-3 rounded text-sm ${canUseLoyalty ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                           {loyaltyMessage}
                       </div>
                   )}
                   {selectedPaymentMethod && selectedPaymentMethod.currency !== 'POINTS' && (
                       <div className="mt-3 text-right">
                           <div className="text-sm text-gray-500">Monto Final:</div>
                           <div className="text-2xl font-black text-gray-900">
                              {selectedPaymentMethod.currency === 'VES' ? `Bs. ${Number(totalVES || 0).toFixed(2)}` : `$${Number(totalUSD || 0).toFixed(2)}`}
                           </div>
                       </div>
                   )}

                   <button
                     type="button"
                     onClick={() => {
                       setIsMultiCurrency(true);
                       setMultiPayments({});
                       setMultiAmountInput('');
                     }}
                     className="w-full mt-3 py-2.5 px-4 bg-orange-100 hover:bg-orange-200 text-orange-800 font-extrabold rounded-lg text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-colors border border-orange-200 shadow-sm"
                   >
                     <Coins className="w-4 h-4 text-orange-600" />
                     Pago Multi-Moneda (Mixto)
                   </button>
                 </div>
              )}

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsCheckoutModalOpen(false)}
                  disabled={isProcessing}
                  className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  ATRÁS
                </button>
                <button 
                  onClick={processSale}
                  disabled={isProcessing}
                  className="flex-[2] bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isProcessing ? "PROCESANDO..." : "CONFIRMAR VENTA"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cierre de Caja */}
      {isCierreCajaModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-lg">Cierre de Caja del Turno (Declaración e Inspección)</h3>
              </div>
              <button onClick={() => setIsCierreCajaModalOpen(false)} className="text-gray-400 hover:text-black">
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6">
               <div className="flex-1 space-y-4">
                 <h4 className="font-bold text-gray-800 flex items-center justify-between">
                   <span>Ventas del Turno Activo</span>
                   <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded">Temporal</span>
                 </h4>
                 
                 <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
                   <strong>ℹ️ Información del Turno:</strong> Las cuentas y registros desplegados aquí se mostrarán de forma <strong>temporal</strong> únicamente hasta que confirme el cierre de caja. Posterior a la confirmación, la pantalla se limpiará automáticamente.
                 </div>

                 <div className="overflow-y-auto border border-gray-200 rounded-lg max-h-[220px]">
                    <table className="w-full text-left text-sm">
                       <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 sticky top-0">
                          <tr>
                             <th className="p-2">Hora</th>
                             <th className="p-2">Método</th>
                             <th className="p-2 text-right">Monto</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-gray-100">
                          {todaySales.map(s => (
                              <tr key={s.id} className="hover:bg-gray-50">
                                 <td className="p-2 text-xs">{new Date(s.created_at).toLocaleTimeString()}</td>
                                 <td className="p-2 font-medium text-xs">{s.payment_method || 'Efectivo USD'} ({s.currency_used || 'USD'})</td>
                                 <td className="p-2 font-bold text-right text-xs">${Number(s.total_usd).toFixed(2)}</td>
                              </tr>
                          ))}
                          {todaySales.length === 0 && (
                              <tr>
                                  <td colSpan={3} className="p-4 text-center text-gray-500 text-sm">No hay ventas registradas en este turno activo.</td>
                              </tr>
                          )}
                       </tbody>
                    </table>
                 </div>

                 {/* Desglose por moneda en sistema */}
                 <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                      <span className="text-emerald-800 font-medium block">USD Efectivo:</span>
                      <span className="text-emerald-950 font-bold text-sm">
                        ${getSystemUSD(todaySales).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-200">
                      <span className="text-blue-800 font-medium block">USDT Cripto:</span>
                      <span className="text-blue-950 font-bold text-sm">
                        ${getSystemUSDT(todaySales).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                      <span className="text-purple-800 font-medium block">VES (PagoMóvil/Punto):</span>
                      <span className="text-purple-950 font-bold text-sm">
                        Bs. {getSystemVES(todaySales).toFixed(2)}
                      </span>
                    </div>
                 </div>

                 <div className="p-3 bg-gray-100 rounded-lg text-sm text-gray-800 flex justify-between font-bold">
                    <span>Total USD Sistema:</span>
                    <span>${todaySales.reduce((acc, curr) => acc + Number(curr.total_usd), 0).toFixed(2)}</span>
                 </div>
               </div>
               
               <div className="flex-1 bg-gray-50 p-5 rounded-xl border border-gray-200 flex flex-col justify-between">
                   <div>
                       <h4 className="font-bold text-gray-800 mb-2">Declaración de Valores en Caja</h4>
                       <p className="text-gray-500 mb-4 text-xs">
                         Declare los fondos acumulados en caja física y lotes bancarios.
                       </p>

                       {/* Alerta de Verificación Importante */}
                       <div className="mb-4 p-3 bg-orange-100 border-l-4 border-orange-500 rounded text-xs text-orange-900 space-y-1">
                          <p className="font-bold flex items-center gap-1">
                            ⚠️ VERIFICACIÓN OBLIGATORIA
                          </p>
                          <p>
                            Por favor verifique cuidadosamente que el dinero en efectivo físico y los lotes del Punto de Venta coincidan antes de confirmar el cierre.
                          </p>
                       </div>

                       <form id="closure-form" onSubmit={async (e) => {
                           e.preventDefault();
                           if (!confirmClosureChecked) {
                             showToast("Debe marcar la casilla de verificación antes de proceder.");
                             return;
                           }

                           const form = e.target as HTMLFormElement;
                           const usd = Number(form.usd.value);
                           const usdt = Number(form.usdt.value);
                           const ves = Number(form.ves.value);

                           try {
                               const { data: { user } } = await supabase.auth.getUser();
                               if (!user) throw new Error("No user found");
                                const systemUSD = getSystemUSD(todaySales);
                                const systemUSDT = getSystemUSDT(todaySales);
                                const systemVES = getSystemVES(todaySales);

                                const salesIds = todaySales.map(s => s.id);
                                let salesDataPayload: any[] = [];
                                if (salesIds.length > 0) {
                                  const { data: items } = await supabase
                                    .from('sale_items')
                                    .select('sale_id, product_id, quantity, unit_price_usd, subtotal_usd, products(name, sku, category, subcategory)')
                                    .in('sale_id', salesIds);

                                  salesDataPayload = todaySales.map(sale => {
                                    const saleItems = (items || []).filter((i: any) => i.sale_id === sale.id);
                                    return {
                                      id: sale.id,
                                      created_at: sale.created_at,
                                      payment_method: sale.payment_method,
                                      currency_used: sale.currency_used,
                                      subtotal_usd: sale.subtotal_usd,
                                      items: saleItems.map((i: any) => ({
                                        product_name: i.products?.name || 'Producto',
                                        product_sku: i.products?.sku || '',
                                        category: i.products?.category || '',
                                        subcategory: i.products?.subcategory || '',
                                        quantity: i.quantity,
                                        unit_price_usd: i.unit_price_usd,
                                        subtotal_usd: i.subtotal_usd
                                      }))
                                    };
                                  });
                                }

                                let { error } = await supabase.from('cash_closures').insert([{
                                    seller_id: user.id,
                                    declared_usd: usd,
                                    declared_usdt: usdt,
                                    declared_ves: ves,
                                    system_usd: systemUSD,
                                    system_usdt: systemUSDT,
                                    system_ves: systemVES,
                                    sales_count: todaySales.length,
                                    sales_data: salesDataPayload
                                }]);

                                if (error) {
                                    console.warn("Fallo al insertar cierre extendido, ejecutando inserción básica:", error);
                                    const { error: fallbackError } = await supabase.from('cash_closures').insert([{
                                        seller_id: user.id,
                                        declared_usd: usd,
                                        declared_usdt: usdt,
                                        declared_ves: ves
                                    }]);
                                    if (fallbackError) throw fallbackError;
                                }

                               showToast("Cierre de caja completado exitosamente. Los datos del turno fueron archivados y la caja quedó en cero.");
                               setConfirmClosureChecked(false);
                               setIsCierreCajaModalOpen(false);
                               setTodaySales([]);
                               await fetchTodaySales();
                           } catch (err: any) {
                               showToast("Error al guardar cierre de caja: " + err.message);
                           }
                       }}>
                           <div className="space-y-3">
                             <div className="flex items-center justify-between">
                               <span className="font-medium text-xs text-gray-700">Efectivo Físico (USD $):</span>
                               <div className="relative">
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                 <input name="usd" type="number" step="0.01" placeholder="0.00" required className="w-32 pl-7 pr-3 py-1.5 border border-gray-300 rounded outline-none focus:border-orange-500 text-right text-sm" />
                               </div>
                             </div>
                             <div className="flex items-center justify-between">
                               <span className="font-medium text-xs text-gray-700">Recibido en USDT (Cripto $):</span>
                               <div className="relative">
                                 <input name="usdt" type="number" step="0.01" placeholder="0.00" required className="w-32 px-3 py-1.5 border border-gray-300 rounded outline-none focus:border-orange-500 text-right text-sm" />
                               </div>
                             </div>
                             <div className="flex items-center justify-between">
                               <span className="font-medium text-xs text-gray-700">Pago Móvil / Punto (VES Bs.):</span>
                               <div className="relative">
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Bs.</span>
                                 <input name="ves" type="number" step="0.01" placeholder="0.00" required className="w-36 pl-8 pr-3 py-1.5 border border-gray-300 rounded outline-none focus:border-orange-500 text-right text-sm" />
                               </div>
                             </div>
                           </div>

                           {/* Confirmación Checkbox */}
                           <div className="mt-4 pt-3 border-t border-gray-200">
                             <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-700 font-medium">
                               <input 
                                 type="checkbox"
                                 checked={confirmClosureChecked}
                                 onChange={e => setConfirmClosureChecked(e.target.checked)}
                                 className="mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                               />
                               <span>
                                 Confirmo haber verificado el efectivo en caja y haber ejecutado el cierre de lote correspondiente en el Punto de Venta.
                               </span>
                             </label>
                           </div>
                       </form>
                   </div>

                   <div className="mt-6 pt-3 border-t border-gray-200 flex justify-end gap-2">
                     <button type="button" onClick={() => setIsCierreCajaModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                     <button 
                       type="submit" 
                       form="closure-form"
                       disabled={!confirmClosureChecked}
                       className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors shadow-sm"
                     >
                       Confirmar y Cerrar Caja
                     </button>
                   </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cliente */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Asignar / Registrar Cliente</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-gray-400 hover:text-black">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={searchCustomer} className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar por Cédula</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={cedulaBusqueda}
                    onChange={(e) => setCedulaBusqueda(e.target.value)}
                    placeholder="V-12345678"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none uppercase"
                    required
                  />
                  <button 
                    type="submit" 
                    disabled={isSearchingCustomer}
                    className="bg-black text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    {isSearchingCustomer ? '...' : 'Buscar'}
                  </button>
                </div>
              </form>

              <div className="border-t border-gray-100 pt-6">
                <h4 className="text-sm font-medium text-gray-500 mb-4">Registro Rápido (Si no existe)</h4>
                <form onSubmit={createCustomer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input 
                        type="text" placeholder="Nombres" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500"
                        value={newCustomerForm.first_name} onChange={e => setNewCustomerForm({...newCustomerForm, first_name: e.target.value})}
                      />
                    </div>
                    <div>
                      <input 
                        type="text" placeholder="Apellidos" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500"
                        value={newCustomerForm.last_name} onChange={e => setNewCustomerForm({...newCustomerForm, last_name: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input 
                        type="text" placeholder="Teléfono" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500"
                        value={newCustomerForm.phone} onChange={e => setNewCustomerForm({...newCustomerForm, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <input 
                        type="text" placeholder="Ciudad" required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500"
                        value={newCustomerForm.city} onChange={e => setNewCustomerForm({...newCustomerForm, city: e.target.value})}
                      />
                    </div>
                  </div>
                  <input 
                    type="email" placeholder="Correo (Opcional)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-orange-500"
                    value={newCustomerForm.email} onChange={e => setNewCustomerForm({...newCustomerForm, email: e.target.value})}
                  />
                  <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg">
                    Guardar y Asignar
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN IZQUIERDA: Búsqueda y Resultados (70%) */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        
        {/* Cabecera / Buscador Ultra Rápido */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="text-orange-500">Calórico Fit</span> POS
          </h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsCierreCajaModalOpen(true)}
              className="flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-white hover:bg-orange-500 transition-colors bg-orange-50 px-4 py-2 rounded-lg border border-orange-200"
            >
              Realizar Cierre de Caja
            </button>
            <button 
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors bg-white px-4 py-2 rounded-lg border border-gray-200"
            >
              <LogOut className="w-4 h-4"/> Salir
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Busca por nombre, SKU o escanea código de barra... [F2 para WebCam]" 
                className="w-full text-lg pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 focus:border-orange-500 focus:ring-0 outline-none transition-colors bg-white shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults.length === 1) {
                    handleAddToCart(searchResults[0]);
                  }
                }}
              />
            </div>
            <button 
              onClick={() => setIsScannerOpen(true)}
              className="bg-black hover:bg-gray-800 text-white px-6 py-4 rounded-xl font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Camera className="w-6 h-6" />
              Cámara
            </button>
          </div>
        </div>

        {/* Resultados Limpios (Sin miniaturas/ruido, optimizado para operarios) */}
        <div className="flex-1 overflow-y-auto bg-white rounded-xl shadow-sm border border-gray-100 p-2">
          {isScannerOpen ? (
             <div className="p-4 flex flex-col items-center">
               <div className="w-full max-w-lg">
                 <div className="flex justify-between items-center mb-4">
                   <h2 className="font-semibold text-lg">Escanear Producto</h2>
                   <button onClick={() => setIsScannerOpen(false)} className="text-gray-500 hover:text-black">Cerrar</button>
                 </div>
                 <BarcodeScanner onScanSuccess={handleBarcodeScan} />
               </div>
             </div>
          ) : searchResults.length > 0 ? (
            <div className="divide-y divide-gray-100">
              <div className="grid grid-cols-12 gap-4 p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <div className="col-span-2">SKU / CÓDIGO</div>
                <div className="col-span-6">PRODUCTO</div>
                <div className="col-span-2 text-center">STOCK</div>
                <div className="col-span-2 text-right">PRECIO</div>
              </div>
              {searchResults.map(product => (
                <div 
                  key={product.id} 
                  onClick={() => handleAddToCart(product)}
                  className="grid grid-cols-12 gap-4 p-4 hover:bg-orange-50 cursor-pointer items-center transition-colors group"
                >
                  <div className="col-span-2 text-sm text-gray-500 font-mono">{product.sku}</div>
                  <div className="col-span-6 font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                    <div>{product.name}</div>
                    {(product.category || product.subcategory) && (
                      <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-1 font-normal">
                        {product.category && (
                          <span className="font-semibold text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded text-[11px]">
                            {product.category}
                          </span>
                        )}
                        {product.subcategory && (
                          <span className="font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                            {product.subcategory}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={cn(
                      "px-2 py-1 rounded text-xs font-bold", 
                      product.stock_quantity > 10 ? "bg-green-100 text-green-700" : (product.stock_quantity > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700")
                    )}>
                      {product.stock_quantity}
                    </span>
                  </div>
                  <div className="col-span-2 text-right font-bold">${Number(product.sale_price || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium text-gray-500">
                {searchTerm.length > 0 ? "No se encontraron productos" : "El carrito de productos está a la espera"}
              </p>
              <p className="text-sm">Escribe un nombre, código, o utiliza el escáner de la cámara</p>
            </div>
          )}
        </div>
      </div>

      {/* SECCIÓN DERECHA: Carrito de Compras (30%) */}
      <div className="w-96 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.03)] flex flex-col z-10 border-l border-gray-100">
        
        {/* CRM / Identificación rápida del cliente */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          {customer ? (
            <div className="flex-1 border border-orange-200 bg-orange-50 rounded-lg p-3">
              <div className="text-xs text-orange-600/80 font-medium uppercase tracking-wider mb-1">Cliente Asignado</div>
              <div className="font-bold text-gray-900 flex items-center justify-between">
                {customer.first_name} {customer.last_name}
                <button onClick={() => setCustomer(null)} className="text-gray-500 hover:text-black">
                  <X className="w-4 h-4"/>
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1 font-mono">{customer.document_id}</div>
              <div className="text-xs font-bold text-orange-600 mt-2 flex items-center gap-1">
                ⭐ {customer.loyalty_points} Pts
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex-1 border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm font-medium text-gray-500 hover:text-orange-500 hover:border-orange-500 hover:bg-orange-50 transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" /> Buscar o Agregar Cliente
            </button>
          )}
        </div>

        {/* Lista de Items del carrito */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {cart.map(item => (
            <div key={item.product.id} className="flex gap-4 p-3 bg-white border border-gray-100 rounded-lg hover:border-orange-200 transition-colors shadow-sm">
              <div className="flex-1">
                <h4 className="font-semibold text-sm leading-tight text-gray-900 mb-1">{item.product.name}</h4>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 font-mono mb-2">
                  <span>SKU: {item.product.sku}</span>
                  {item.product.category && (
                    <span className="text-orange-600 font-sans font-semibold">
                      • {item.product.category}{item.product.subcategory ? ` (${item.product.subcategory})` : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-gray-200 rounded overflow-hidden h-8">
                    <button onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)} className="px-2 pb-1 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">-</button>
                    <input 
                      type="number" 
                      className="w-10 text-center text-sm font-bold border-x border-gray-200 p-0 h-full !outline-none m-0"
                      value={item.quantity}
                      onChange={(e) => handleUpdateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                    />
                    <button onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)} className="px-2 pb-1 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">+</button>
                  </div>
                  <button onClick={() => handleUpdateQuantity(item.product.id, 0)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="text-right flex flex-col justify-between">
                <div className="font-bold whitespace-nowrap text-gray-900">${Number(item.product.sale_price * item.quantity || 0).toFixed(2)}</div>
                <div className="text-xs text-gray-400 font-medium">u/${Number(item.product.sale_price || 0).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Totales y Checkout */}
        <div className="bg-white border-t border-gray-200 p-5 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 font-medium text-sm">Subtotal USD</span>
            <span className="font-bold text-gray-900">${Number(subtotalUSD || 0).toFixed(2)}</span>
          </div>
          
          {/* Equivalencias Inmediatas */}
          <div className="space-y-1 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-500">Tasa BCV Oficial ({Number(actualOficialBCV || 0).toFixed(2)})</span>
              <span className="font-semibold text-gray-700">Bs. {Number(totalVES || 0).toFixed(2)}</span>
            </div>
            {selectedPaymentMethod && selectedPaymentMethod.discount_percentage > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-green-600 font-medium">Dcto {selectedPaymentMethod.name} (-{selectedPaymentMethod.discount_percentage}%)</span>
                  <span className="font-bold text-green-700">-${Number(discountAmount || 0).toFixed(2)}</span>
                </div>
            )}
            {selectedPaymentMethod && selectedPaymentMethod.surcharge_percentage > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-amber-600 font-medium">Comisión {selectedPaymentMethod.name} (+{selectedPaymentMethod.surcharge_percentage}%)</span>
                  <span className="font-bold text-amber-700 font-semibold">+$ {Number(surchargeAmount || 0).toFixed(2)}</span>
                </div>
            )}
          </div>

          
          <div className="flex justify-between items-end mb-6">
            <span className="text-lg font-bold text-gray-900">Total a Pagar</span>
            <div className="text-right">
              <span className="text-3xl font-black text-orange-500 leading-none">${Number(totalUSD || 0).toFixed(2)}</span>
            </div>
          </div>
          
          {/* BOTÓN O CÁLCULO DE VUELTO */}
          <div className="mb-6">
            {!giveChange ? (
              <button
                type="button"
                onClick={() => {
                  setGiveChange(true);
                  setChangeCurrency(selectedPaymentMethod?.currency === 'VES' ? 'VES' : 'USD');
                }}
                className="w-full py-3 px-4 bg-orange-100 hover:bg-orange-200 text-orange-800 font-extrabold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border border-orange-200"
              >
                <Coins className="w-4 h-4 text-orange-600" />
                Dar Cambio
              </button>
            ) : (
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 relative animate-in fade-in slide-in-from-bottom-2 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setGiveChange(false);
                    setReceivedAmount('');
                  }}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                  title="Cerrar calculadora"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
                   <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                     <Coins className="w-3.5 h-3.5 text-orange-500" /> Vueltos
                   </span>
                   <div className="flex bg-gray-200 rounded p-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setChangeCurrency('USD')}
                        className={`px-2 py-1 rounded transition-all ${changeCurrency === 'USD' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        USD ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setChangeCurrency('VES')}
                        className={`px-2 py-1 rounded transition-all ${changeCurrency === 'VES' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                      >
                        VES (Bs.)
                      </button>
                   </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-gray-600 mb-1">Monto Recibido ({changeCurrency})</label>
                   <input 
                     type="number" 
                     min="0"
                     step="0.01"
                     value={receivedAmount}
                     onChange={(e) => setReceivedAmount(e.target.value)}
                     className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-base font-bold"
                     placeholder={`Ej: ${changeCurrency === 'USD' ? '20.00' : '800.00'}`}
                   />
                </div>

                {Number(receivedAmount) > 0 && (
                  <div className="flex justify-between items-center text-sm pt-1 border-t border-dashed border-gray-200">
                    <span className="font-bold text-gray-700">Vuelto a entregar:</span>
                    <div className="text-right">
                       {changeCurrency === 'VES' ? (
                          <>
                            <div className={`font-black text-lg ${(Number(receivedAmount) - totalVES) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              Bs. {((Number(receivedAmount) - totalVES) >= 0 ? (Number(receivedAmount) - totalVES) : 0).toFixed(2)}
                            </div>
                            <div className="text-gray-500 text-xs font-semibold">
                              $ {((Number(receivedAmount) - totalVES) >= 0 ? (Number(receivedAmount) - totalVES) / actualOficialBCV : 0).toFixed(2)}
                            </div>
                          </>
                       ) : (
                          <>
                            <div className={`font-black text-lg ${(Number(receivedAmount) - totalUSD) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              $ {((Number(receivedAmount) - totalUSD) >= 0 ? (Number(receivedAmount) - totalUSD) : 0).toFixed(2)}
                            </div>
                            <div className="text-gray-500 text-xs font-semibold">
                              Bs. {((Number(receivedAmount) - totalUSD) >= 0 ? (Number(receivedAmount) - totalUSD) * actualOficialBCV : 0).toFixed(2)}
                            </div>
                          </>
                       )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>


          <button 
            disabled={cart.length === 0 || !customer || isProcessing}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:bg-gray-300 text-white font-bold text-lg py-4 rounded-xl flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
            onClick={() => {
              if(!customer) {
                showToast("Debes asignar un cliente primero.");
                return;
              }
              setIsCheckoutModalOpen(true);
            }}
          >
            <CreditCard className="w-6 h-6" />
            {isProcessing ? "PROCESANDO..." : (customer ? "COBRAR ORDEN" : "ASIGNE CLIENTE")}
          </button>
        </div>
      </div>
    </div>
  );
}

