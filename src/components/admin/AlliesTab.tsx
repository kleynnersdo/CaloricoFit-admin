import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import {
  allyKindLabel,
  allyStatusLabel,
  listAllies,
  listAllyLedger,
  listRedeemRequests,
  postAllyRedeem,
  updateAlly,
  type AllyLedgerRow,
  type AllyProfile,
} from '../../lib/alliesApi';
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import Modal from '../ui/Modal';

interface AlliesTabProps {
  showToast: (msg: string) => void;
}

export default function AlliesTab({ showToast }: AlliesTabProps) {
  const [allies, setAllies] = useState<AllyProfile[]>([]);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<AllyLedgerRow[]>([]);
  const [selected, setSelected] = useState<AllyProfile | null>(null);
  const [ledger, setLedger] = useState<AllyLedgerRow[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRedeemOpen, setIsRedeemOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    document_id: '',
    email: '',
    phone: '',
    password: '',
  });
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    promo_code: '',
    document_id: '',
    phone: '',
  });
  const [redeemForm, setRedeemForm] = useState({ points: '', notes: '' });
  const [busy, setBusy] = useState(false);

  const refresh = async (q?: string) => {
    const [{ data: list }, { data: reqs }] = await Promise.all([
      listAllies(q),
      listRedeemRequests('pending'),
    ]);
    if (list) setAllies(list);
    if (reqs) setPending(reqs);
  };

  useEffect(() => {
    refresh();
  }, []);

  const openDetail = async (ally: AllyProfile) => {
    setSelected(ally);
    const { data } = await listAllyLedger(ally.id);
    setLedger(data || []);
  };

  const handleCreate = async () => {
    if (!form.document_id || !form.first_name || !form.last_name) {
      showToast('Cédula, nombre y apellido son obligatorios.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    const virtualEmail = form.email.trim()
      ? form.email.trim()
      : `${form.document_id.trim()}@caloricofit.com`;
    const { data, error } = await api.auth.signUp({
      email: virtualEmail,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          document_id: form.document_id,
          phone: form.phone,
          role: 'ally',
        },
      },
    });
    setBusy(false);
    if (error) {
      showToast('Error creando aliado: ' + error.message);
      return;
    }
    const code = (data as { profile?: { promo_code?: string } })?.profile?.promo_code || null;
    setCreatedCode(code);
    showToast(code ? `Aliado creado. Código: ${code}` : 'Aliado creado.');
    setIsCreateOpen(false);
    setForm({ first_name: '', last_name: '', document_id: '', email: '', phone: '', password: '' });
    refresh(query);
  };

  const openEdit = (ally: AllyProfile) => {
    setEditForm({
      first_name: ally.first_name || '',
      last_name: ally.last_name || '',
      promo_code: (ally.promo_code || '').toUpperCase(),
      document_id: ally.document_id || '',
      phone: ally.phone || '',
    });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    const code = editForm.promo_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      showToast('Nombre y apellido son obligatorios.');
      return;
    }
    if (code.length < 4 || code.length > 12) {
      showToast('El código debe tener 4–12 letras o números.');
      return;
    }
    setBusy(true);
    const { data, error } = await updateAlly(selected.id, {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      promo_code: code,
      document_id: editForm.document_id.trim() || undefined,
      phone: editForm.phone.trim() || undefined,
    });
    setBusy(false);
    if (error || !data) {
      showToast(error?.message || 'No se pudo guardar');
      return;
    }
    showToast(`Aliado actualizado. Código: ${data.promo_code}`);
    setIsEditOpen(false);
    setSelected(data);
    refresh(query);
  };

  const redeemBalance = selected?.ally_points ?? 0;
  const redeemPtsNum = Math.floor(Number(redeemForm.points));
  const redeemPtsValid = Number.isFinite(redeemPtsNum) && redeemPtsNum > 0;
  const redeemExceeds = redeemPtsValid && redeemPtsNum > redeemBalance;
  const canConfirmRedeem = !!selected && redeemPtsValid && !redeemExceeds && !busy;

  const handleDirectRedeem = async () => {
    if (!selected) return;
    const pts = Math.floor(Number(redeemForm.points));
    if (!(pts > 0)) {
      showToast('Indica puntos a canjear.');
      return;
    }
    if (pts > selected.ally_points) {
      showToast(`El aliado solo tiene ${selected.ally_points} pts disponibles.`);
      return;
    }
    setBusy(true);
    const { error } = await postAllyRedeem(selected.id, {
      points: pts,
      notes: redeemForm.notes || 'Canje registrado por admin',
    });
    setBusy(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast('Canje registrado.');
    setIsRedeemOpen(false);
    setRedeemForm({ points: '', notes: '' });
    await refresh(query);
    const updated = (await listAllies()).data?.find((a) => a.id === selected.id);
    if (updated) openDetail(updated);
  };

  const resolveRequest = async (row: AllyLedgerRow, action: 'approve' | 'reject') => {
    const notes =
      action === 'approve'
        ? window.prompt('Nota del premio / canje (opcional):', row.notes || '') || undefined
        : window.prompt('Motivo del rechazo (opcional):') || undefined;
    const { error } = await postAllyRedeem(row.ally_id!, {
      action,
      request_id: row.id,
      notes,
    });
    if (error) {
      showToast(error.message);
      return;
    }
    showToast(action === 'approve' ? 'Canje aprobado.' : 'Solicitud rechazada.');
    refresh(query);
    if (selected?.id === row.ally_id) openDetail(selected);
  };

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Alianzas</h2>
          <p className="text-sm text-gray-500">Entrenadores y tiendas con código promocional</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreatedCode(null);
            setIsCreateOpen(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Nuevo aliado
        </button>
      </div>

      {createdCode && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm">
          Último código generado: <span className="font-mono font-bold text-lg">{createdCode}</span>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-6 bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Solicitudes de canje pendientes</h3>
          <div className="space-y-2">
            {pending.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2"
              >
                <div>
                  <div className="font-medium">
                    {row.first_name} {row.last_name}{' '}
                    <span className="font-mono text-orange-600 text-sm">({row.promo_code})</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {row.points} pts · saldo {row.ally_balance}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolveRequest(row, 'approve')}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveRequest(row, 'reject')}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 rounded text-sm font-bold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-lg"
            placeholder="Buscar por nombre, cédula, email o código…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') refresh(query);
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => refresh(query)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium"
        >
          Buscar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {allies.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => openDetail(a)}
              className={`w-full text-left bg-white border rounded-xl p-4 shadow-sm hover:border-orange-300 transition-colors ${
                selected?.id === a.id ? 'border-orange-500 ring-1 ring-orange-200' : 'border-gray-200'
              } ${a.is_active === false ? 'opacity-60' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-gray-900">
                    {a.first_name} {a.last_name}
                  </div>
                  <div className="text-sm text-gray-500 font-mono mt-0.5">{a.promo_code || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-orange-600">{a.ally_points} pts</div>
                  {a.is_active === false && (
                    <span className="text-xs font-bold text-red-500">INACTIVO</span>
                  )}
                </div>
              </div>
            </button>
          ))}
          {allies.length === 0 && (
            <p className="text-gray-500 text-sm">No hay aliados. Crea el primero.</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm min-h-[280px]">
          {!selected ? (
            <p className="text-gray-400 text-sm">Selecciona un aliado para ver detalle y canjes.</p>
          ) : (
            <>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold">
                    {selected.first_name} {selected.last_name}
                  </h3>
                  <p className="font-mono text-orange-600 text-lg">{selected.promo_code}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Saldo: <b>{selected.ally_points}</b> puntos
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className="bg-gray-900 hover:bg-black text-white px-3 py-1.5 rounded text-sm font-bold flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRedeemOpen(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded text-sm font-bold"
                  >
                    Registrar canje
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = selected.is_active === false;
                      const { error } = await api
                        .from('worker_profiles')
                        .update({ is_active: next })
                        .eq('id', selected.id);
                      if (error) showToast(error.message);
                      else {
                        showToast(next ? 'Aliado habilitado.' : 'Aliado inhabilitado.');
                        refresh(query);
                        setSelected({ ...selected, is_active: next });
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded font-bold bg-gray-100 hover:bg-gray-200"
                  >
                    {selected.is_active === false ? 'Habilitar' : 'Inhabilitar'}
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-sm text-gray-700 mb-2">Historial reciente</h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {ledger.map((row) => (
                  <div key={row.id} className="text-sm border-b border-gray-50 py-2 flex justify-between gap-2">
                    <div>
                      <span className="font-medium">{allyKindLabel(row.kind)}</span>
                      <span className="text-gray-400 ml-2">{allyStatusLabel(row.status)}</span>
                      {row.notes && <div className="text-gray-500">{row.notes}</div>}
                      <div className="text-xs text-gray-400">
                        {new Date(row.created_at).toLocaleString('es-VE')}
                      </div>
                    </div>
                    <div
                      className={`font-bold ${row.points >= 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {row.points > 0 ? '+' : ''}
                      {row.points}
                    </div>
                  </div>
                ))}
                {ledger.length === 0 && <p className="text-gray-400 text-sm">Sin movimientos.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {isCreateOpen && (
        <Modal title="Nuevo aliado" onClose={() => setIsCreateOpen(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Apellido</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cédula</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={form.document_id}
                onChange={(e) => setForm({ ...form, document_id: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email (opcional)</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Si vacío: cedula@caloricofit.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Teléfono</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contraseña</label>
              <input
                type="password"
                className="w-full px-3 py-2 border rounded"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <p className="text-xs text-gray-500">
              Al crear se genera un código promocional corto único automáticamente.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={handleCreate}
              className="w-full bg-black text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              {busy ? 'Creando…' : 'Crear aliado'}
            </button>
          </div>
        </Modal>
      )}

      {isEditOpen && selected && (
        <Modal title="Editar aliado" onClose={() => setIsEditOpen(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Apellido</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Código promocional</label>
              <input
                className="w-full px-3 py-2 border rounded font-mono uppercase tracking-wider"
                value={editForm.promo_code}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    promo_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                  })
                }
                maxLength={12}
              />
              <p className="text-xs text-gray-500 mt-1">
                Se guarda siempre en mayúsculas. En el POS da igual si escriben minúsculas.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Cédula</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editForm.document_id}
                  onChange={(e) => setEditForm({ ...editForm, document_id: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Teléfono</label>
                <input
                  className="w-full px-3 py-2 border rounded"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveEdit}
              className="w-full bg-black text-white font-bold py-3 rounded-lg disabled:opacity-50"
            >
              Guardar cambios
            </button>
          </div>
        </Modal>
      )}

      {isRedeemOpen && selected && (
        <Modal title={`Canje — ${selected.first_name}`} onClose={() => setIsRedeemOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Saldo disponible: <b>{selected.ally_points}</b> pts
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Puntos a descontar</label>
              <input
                type="number"
                min={1}
                max={selected.ally_points}
                className={`w-full px-3 py-2 border rounded ${
                  redeemExceeds ? 'border-red-400 bg-red-50' : ''
                }`}
                value={redeemForm.points}
                onChange={(e) => setRedeemForm({ ...redeemForm, points: e.target.value })}
              />
              {redeemExceeds && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  No puedes descontar más del saldo ({selected.ally_points} pts).
                </p>
              )}
              {redeemForm.points !== '' && !redeemPtsValid && (
                <p className="mt-1.5 text-xs font-medium text-red-600">
                  Indica un número entero mayor a 0.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Premio / nota</label>
              <input
                className="w-full px-3 py-2 border rounded"
                value={redeemForm.notes}
                onChange={(e) => setRedeemForm({ ...redeemForm, notes: e.target.value })}
                placeholder="Ej. producto, descuento o dinero…"
              />
            </div>
            <button
              type="button"
              disabled={!canConfirmRedeem}
              onClick={handleDirectRedeem}
              className="w-full bg-orange-500 text-white font-bold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirmar canje
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
