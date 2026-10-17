import { useEffect, useMemo, useState } from 'react';
import {
  allyKindLabel,
  allyStatusLabel,
  getAllyLedger,
  getAllyMe,
  getAllyStats,
  requestAllyRedeem,
  type AllyLedgerRow,
  type AllyProfile,
} from '../lib/alliesApi';
import { api } from '../lib/apiClient';
import { Copy, Gift, LogOut, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import Modal from './ui/Modal';
import { endOfDay, startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns';

interface Props {
  onLogout: () => void;
}

type Period = 'day' | 'week' | 'month' | 'custom';

function periodRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  if (period === 'custom') {
    return {
      from: customFrom ? startOfDay(new Date(customFrom)).toISOString() : undefined,
      to: customTo ? endOfDay(new Date(customTo)).toISOString() : undefined,
    };
  }
  if (period === 'day') {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  }
  if (period === 'week') {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      to: endOfDay(now).toISOString(),
    };
  }
  return {
    from: startOfMonth(now).toISOString(),
    to: endOfDay(now).toISOString(),
  };
}

export default function AllyDashboard({ onLogout }: Props) {
  const [profile, setProfile] = useState<AllyProfile | null>(null);
  const [ledger, setLedger] = useState<AllyLedgerRow[]>([]);
  const [stats, setStats] = useState({ earned: 0, redeemed: 0, reversed: 0, net: 0 });
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(subDays(new Date(), 30).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));
  const [toast, setToast] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemPts, setRedeemPts] = useState('');
  const [redeemNotes, setRedeemNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const range = useMemo(
    () => periodRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const load = async () => {
    const [me, led, st] = await Promise.all([
      getAllyMe(),
      getAllyLedger(),
      getAllyStats(range.from, range.to),
    ]);
    if (me.data) setProfile(me.data);
    if (led.data) setLedger(led.data);
    if (st.data) {
      setStats({
        earned: st.data.earned,
        redeemed: st.data.redeemed,
        reversed: st.data.reversed,
        net: st.data.net,
      });
    }
  };

  useEffect(() => {
    load();
  }, [range.from, range.to]);

  const handleSignOut = async () => {
    await api.auth.signOut();
    onLogout();
  };

  const copyCode = async () => {
    if (!profile?.promo_code) return;
    try {
      await navigator.clipboard.writeText(profile.promo_code);
      showToast('Código copiado');
    } catch {
      showToast(profile.promo_code);
    }
  };

  const balance = profile?.ally_points ?? 0;
  const redeemPtsNum = Math.floor(Number(redeemPts));
  const redeemPtsValid = Number.isFinite(redeemPtsNum) && redeemPtsNum > 0;
  const redeemExceeds = redeemPtsValid && redeemPtsNum > balance;
  const canSubmitRedeem = redeemPtsValid && !redeemExceeds && !busy;

  const submitRedeem = async () => {
    const pts = Math.floor(Number(redeemPts));
    if (!(pts > 0)) {
      showToast('Indica puntos a solicitar.');
      return;
    }
    if (pts > balance) {
      showToast(`Solo tienes ${balance} pts disponibles.`);
      return;
    }
    setBusy(true);
    const { error } = await requestAllyRedeem(pts, redeemNotes || undefined);
    setBusy(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast('Solicitud enviada. El admin la revisará.');
    setRedeemOpen(false);
    setRedeemPts('');
    setRedeemNotes('');
    load();
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-gray-900">
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl z-[100] text-sm">
          {toast}
        </div>
      )}

      <header className="bg-white border-b border-gray-200/80">
        <div className="max-w-5xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-tight">
              <span className="text-orange-500">Calórico</span> Fit
            </h1>
            <span className="hidden sm:inline text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
              Aliado
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-md hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-6 space-y-5">
        {/* Hero saldo + código */}
        <section className="rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white p-5 sm:p-6 shadow-md shadow-orange-200/60">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-orange-100 text-sm">Hola,</p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {profile ? `${profile.first_name} ${profile.last_name}` : '…'}
              </h2>
              <p className="mt-3 text-orange-100 text-xs uppercase tracking-wider font-semibold">
                Saldo disponible
              </p>
              <p className="text-4xl sm:text-5xl font-black tabular-nums leading-none mt-1">
                {profile?.ally_points ?? 0}
                <span className="text-xl font-bold text-orange-100 ml-1.5">pts</span>
              </p>
            </div>
            <div className="flex flex-col sm:items-end gap-2.5">
              <div className="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl px-4 py-3 min-w-[11rem]">
                <p className="text-[10px] uppercase tracking-widest text-orange-100 font-semibold mb-0.5">
                  Tu código
                </p>
                <p className="font-mono text-2xl font-bold tracking-[0.2em]">
                  {profile?.promo_code || '—'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </button>
                <button
                  type="button"
                  onClick={() => setRedeemOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-white text-orange-600 hover:bg-orange-50 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
                >
                  <Gift className="w-3.5 h-3.5" /> Solicitar canje
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats periodo */}
        <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-gray-900">Resumen</h3>
            <div className="flex flex-wrap gap-1 p-0.5 bg-gray-100 rounded-lg">
              {(
                [
                  ['day', 'Hoy'],
                  ['week', 'Semana'],
                  ['month', 'Mes'],
                  ['custom', 'Rango'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    period === key
                      ? 'bg-white text-orange-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3.5">
              <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Ganados
              </div>
              <div className="text-2xl font-black text-emerald-700 tabular-nums">+{stats.earned}</div>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3.5">
              <div className="flex items-center gap-1.5 text-rose-700 text-xs font-semibold mb-1">
                <Gift className="w-3.5 h-3.5" /> Canjeados
              </div>
              <div className="text-2xl font-black text-rose-700 tabular-nums">-{stats.redeemed}</div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <div className="flex items-center gap-1.5 text-gray-600 text-xs font-semibold mb-1">
                <TrendingDown className="w-3.5 h-3.5" /> Revertidos
              </div>
              <div className="text-2xl font-black text-gray-700 tabular-nums">{stats.reversed}</div>
            </div>
            <div className="rounded-xl bg-orange-50 border border-orange-100 p-3.5">
              <div className="flex items-center gap-1.5 text-orange-700 text-xs font-semibold mb-1">
                <Wallet className="w-3.5 h-3.5" /> Neto
              </div>
              <div className="text-2xl font-black text-orange-600 tabular-nums">{stats.net}</div>
            </div>
          </div>
        </section>

        {/* Historial */}
        <section className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Movimientos</h3>
            <p className="text-xs text-gray-400 mt-0.5">Últimas operaciones de tu cuenta</p>
          </div>
          <div className="max-h-[440px] overflow-y-auto divide-y divide-gray-50">
            {ledger.map((row) => {
              const positive = row.points > 0;
              const pending = row.status === 'pending';
              return (
                <div
                  key={row.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-gray-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900">
                        {allyKindLabel(row.kind)}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          pending
                            ? 'bg-amber-100 text-amber-800'
                            : row.status === 'rejected'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {allyStatusLabel(row.status)}
                      </span>
                    </div>
                    {row.notes && (
                      <p className="text-sm text-gray-500 truncate mt-0.5">{row.notes}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(row.created_at).toLocaleString('es-VE')}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 text-lg font-black tabular-nums ${
                      positive ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {row.points}
                  </div>
                </div>
              );
            })}
            {ledger.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-gray-400">
                Aún no hay movimientos. Cuando usen tu código en tienda, aparecerán aquí.
              </p>
            )}
          </div>
        </section>
      </main>

      {redeemOpen && (
        <Modal title="Solicitar canje" onClose={() => setRedeemOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Saldo: <b>{balance}</b> pts. El admin aprobará y te entregará el premio.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Puntos a canjear</label>
              <input
                type="number"
                min={1}
                max={balance}
                className={`w-full px-3 py-2 border rounded-lg ${
                  redeemExceeds ? 'border-red-400 bg-red-50' : ''
                }`}
                value={redeemPts}
                onChange={(e) => setRedeemPts(e.target.value)}
              />
              {redeemExceeds && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  No puedes canjear más de tu saldo ({balance} pts).
                </p>
              )}
              {redeemPts !== '' && !redeemPtsValid && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  Indica un número entero mayor a 0.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Qué quieres (opcional)</label>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={redeemNotes}
                onChange={(e) => setRedeemNotes(e.target.value)}
                placeholder="Ej. producto, descuento o dinero…"
              />
            </div>
            <button
              type="button"
              disabled={!canSubmitRedeem}
              onClick={submitRedeem}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enviar solicitud
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
