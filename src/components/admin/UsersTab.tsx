import { useEffect, useState } from 'react';
import { api } from '../../lib/apiClient';
import { Edit, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';

interface UsersTabProps {
  showToast: (msg: string) => void;
}

// Gestión de Vendedores: alta vía auth (cédula como correo virtual),
// edición, inhabilitación y eliminación de perfiles.
export default function UsersTab({ showToast }: UsersTabProps) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [workerForm, setWorkerForm] = useState<any>({ email: '', password: '', first_name: '', last_name: '', document_id: '', phone: '', role: 'seller' });
  const [showWorkerPassword, setShowWorkerPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    const { data } = await api.from('worker_profiles').select('*');
    if (data) setWorkers(data);
  };

  const handleSaveWorker = async () => {
     if (!workerForm.document_id || !workerForm.first_name || !workerForm.last_name) {
       showToast("Cédula, nombre y apellido son obligatorios.");
       return;
     }
     if (!workerForm.id && (!workerForm.password || String(workerForm.password).length < 6)) {
       showToast("La contraseña es obligatoria y debe tener al menos 6 caracteres.");
       return;
     }
     if (workerForm.id && workerForm.password && String(workerForm.password).length < 6) {
       showToast("La nueva contraseña debe tener al menos 6 caracteres.");
       return;
     }

     if (workerForm.id) {
       const updatePayload: any = {
         first_name: workerForm.first_name,
         last_name: workerForm.last_name,
         document_id: workerForm.document_id,
         phone: workerForm.phone,
         role: workerForm.role
       };
       if (workerForm.password) {
         updatePayload.password = workerForm.password;
       }
       const { error } = await api.from('worker_profiles').update(updatePayload).eq('id', workerForm.id);

       if (error) {
         showToast("Error al actualizar perfil: " + error.message);
       } else {
         showToast(workerForm.password ? "Vendedor y contraseña actualizados." : "Vendedor actualizado exitosamente.");
         setIsWorkerModalOpen(false);
         setShowWorkerPassword(false);
         fetchWorkers();
       }
       return;
     }

     setIsSubmitting(true);

     const virtualEmail = workerForm.email ? workerForm.email : `${workerForm.document_id.trim()}@caloricofit.com`;

     // En local, signUp no toca la sesión del admin. En cloud, api-js también
     // puede usarse así si no persistimos otra sesión en este flujo.
     const { data, error } = await api.auth.signUp({
        email: virtualEmail,
        password: workerForm.password,
        options: {
           data: {
              first_name: workerForm.first_name,
              last_name: workerForm.last_name,
              document_id: workerForm.document_id,
              phone: workerForm.phone,
              role: workerForm.role
           }
        }
     });

     if (error) {
        setIsSubmitting(false);
        if (error.message.toLowerCase().includes('rate limit')) {
           showToast("Límite de Supabase alcanzado. Desactiva 'Confirm Email' en Authentication -> Providers -> Email.");
        } else if (error.message.toLowerCase().includes('already registered')) {
           showToast("❌ Esta cédula (o correo) ya está registrada en Auth. Si no sale en la lista, bórralo desde Supabase -> Authentication y vuelve a crearlo acá.");
        } else {
           showToast("Error creando usuario: " + error.message);
        }
        return;
     }

     // Insertar/upsertar el perfil por si el trigger no existe o falló: si
     // falla, mostramos el error en lugar de dejarlo silencioso.
     let profileErrorMessage = "";
     if (data.user) {
        const { error: profileError } = await api.from('worker_profiles').upsert({
           id: data.user.id,
           first_name: workerForm.first_name,
           last_name: workerForm.last_name,
           document_id: workerForm.document_id,
           email: virtualEmail,
           phone: workerForm.phone,
           role: workerForm.role,
           password: workerForm.password,
           is_active: true
        });

        if (profileError) {
           profileErrorMessage = profileError.message;
           console.error("Profile insert error: ", profileError);
        }
     }

     if (profileErrorMessage) {
         showToast("Usuario creado en Auth pero falló el perfil: " + profileErrorMessage + ". Intenta ejecutar el trigger SQL.");
     } else {
         showToast("Vendedor creado exitosamente.");
     }

     setIsWorkerModalOpen(false);
     fetchWorkers();
  };

  const handleDeleteWorker = async (id: string) => {
    await api.from('worker_profiles').delete().eq('id', id);
    showToast("Perfil de vendedor eliminado.");
    fetchWorkers();
  };

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Vendedores</h2>
        <button
          onClick={() => { setWorkerForm({ email: '', password: '', first_name: '', last_name: '', document_id: '', phone: '', role: 'seller' }); setShowWorkerPassword(false); setIsWorkerModalOpen(true); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <Plus className="w-5 h-5"/> Agregar Vendedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workers.map(w => (
          <div key={w.id} className={`bg-white border ${w.is_active === false ? 'border-red-200 bg-red-50' : 'border-gray-200'} rounded-xl p-6 shadow-sm relative`}>
              {w.is_active === false && <div className="absolute top-0 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded-bl-lg rounded-tr-lg font-bold">INACTIVO</div>}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {w.first_name} {w.last_name}
                    {w.role === 'admin' && <span className="bg-black text-white text-xs px-2 py-0.5 rounded uppercase">Admin</span>}
                  </h3>
                  <div className="text-sm text-gray-500 font-mono mt-1">V-{w.document_id || 'N/A'}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const newStatus = w.is_active === false ? true : false;
                      const { error } = await api.from('worker_profiles').update({ is_active: newStatus }).eq('id', w.id);
                      if(error) showToast("Error: " + error.message); else fetchWorkers();
                    }}
                    className={`text-xs px-3 py-1 rounded font-bold ${w.is_active === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    title={w.is_active === false ? 'Habilitar' : 'Inhabilitar'}
                  >
                    {w.is_active === false ? 'Habilitar' : 'Inhabilitar'}
                  </button>
                  <button
                    onClick={() => {
                      setWorkerForm({
                          document_id: w.document_id || '',
                          password: '', // Leave empty to not change
                          first_name: w.first_name,
                          last_name: w.last_name,
                          phone: w.phone || '',
                          role: w.role
                        });
                        // Store ID to know we are editing instead of creating newly
                        setWorkerForm(prev => ({...prev, id: w.id}));
                        setShowWorkerPassword(false);
                        setIsWorkerModalOpen(true);
                    }}
                    className="text-gray-500 hover:text-blue-600 p-1"
                    title="Editar perfil"
                  >
                    <Edit className="w-4 h-4"/>
                  </button>
                  <button onClick={() => handleDeleteWorker(w.id)} className="text-red-500 hover:text-red-700 p-1" title="Eliminar perfil"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <div className="text-sm text-gray-600 mb-4 space-y-1">
                <div><span className="font-medium">📞 Teléfono:</span> {w.phone || 'N/A'}</div>
                <div><span className="font-medium">✉️ Correo:</span> {w.email || 'N/A'}</div>
                <div className="text-xs text-gray-400 mt-2">Registrado: {new Date(w.created_at).toLocaleDateString()}</div>
              </div>
          </div>
        ))}
      </div>

      {/* Modal Worker */}
      {isWorkerModalOpen && (
        <Modal title={workerForm.id ? 'Editar Vendedor' : 'Nuevo Vendedor'} onClose={() => setIsWorkerModalOpen(false)}>
          {!workerForm.id && (
            <div className="bg-orange-50 border border-orange-200 p-3 rounded text-sm text-orange-800">
                El vendedor podrá iniciar sesión con su <b>Cédula</b> o su <b>Correo Electrónico</b> y contraseña.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Cédula de Identidad</label>
              <input type="text" disabled={!!workerForm.id} required className="w-full px-3 py-2 border rounded disabled:bg-gray-100 disabled:text-gray-500 font-mono" value={workerForm.document_id} onChange={e => setWorkerForm({...workerForm, document_id: e.target.value})} placeholder="Ej. 12345678" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Correo Electrónico (Opcional)</label>
              <input type="email" disabled={!!workerForm.id} className="w-full px-3 py-2 border rounded disabled:bg-gray-100 disabled:text-gray-500" value={workerForm.email} onChange={e => setWorkerForm({...workerForm, email: e.target.value})} placeholder="Opcional" />
            </div>
          </div>
          <div>
              <label className="block text-sm font-medium mb-1">{workerForm.id ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</label>
              <div className="relative">
                <input
                  type={showWorkerPassword ? 'text' : 'password'}
                  minLength={workerForm.id ? undefined : 6}
                  required={!workerForm.id}
                  className="w-full px-3 py-2 pr-10 border rounded"
                  value={workerForm.password}
                  onChange={e => setWorkerForm({...workerForm, password: e.target.value})}
                  placeholder={workerForm.id ? '•••••••' : ''}
                />
                <button
                  type="button"
                  onClick={() => setShowWorkerPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800"
                  title={showWorkerPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showWorkerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Nombre</label><input type="text" required className="w-full px-3 py-2 border rounded" value={workerForm.first_name} onChange={e => setWorkerForm({...workerForm, first_name: e.target.value})} /></div>
            <div><label className="block text-sm font-medium mb-1">Apellido</label><input type="text" required className="w-full px-3 py-2 border rounded" value={workerForm.last_name} onChange={e => setWorkerForm({...workerForm, last_name: e.target.value})} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1">Teléfono</label><input type="text" className="w-full px-3 py-2 border rounded" value={workerForm.phone} onChange={e => setWorkerForm({...workerForm, phone: e.target.value})} /></div>

          <button onClick={handleSaveWorker} disabled={isSubmitting} className="w-full bg-black text-white font-bold py-3 pt-3 rounded-lg mt-4 disabled:opacity-50">
            {isSubmitting ? 'Guardando...' : (workerForm.id ? 'Guardar Cambios' : 'Crear Vendedor')}
          </button>
        </Modal>
      )}
    </>
  );
}
