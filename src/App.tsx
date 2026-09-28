import { StrictMode, useEffect, useState } from 'react';
import POS from './components/POS';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { supabase, isLocalMode } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'seller' | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkUserRole(session.user.id);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
        const message =
          typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : typeof error === 'string'
              ? error
              : 'No se pudo cargar tu perfil';

        console.error('Error fetching role:', error);

        if (code === '401' || message.toLowerCase().includes('autentic') || message.toLowerCase().includes('sesión')) {
          setProfileError('Tu sesión expiró o es inválida (actualización del sistema). Vuelve a iniciar sesión.');
          await supabase.auth.signOut();
          setSession(null);
          setRole(null);
          return;
        }

        if (code === 'PGRST116') {
          setProfileError(
            isLocalMode
              ? 'Tu usuario no tiene perfil de vendedor/admin en la base de datos. Pide al administrador que revise worker_profiles.'
              : 'Perfil no encontrado en worker_profiles.'
          );
          setRole('unauthorized');
          return;
        }

        setProfileError(message);
        setRole('unauthorized');
        return;
      }

      if (data) {
        if (data.is_active === false) {
          alert('Tu cuenta ha sido inhabilitada por el administrador.');
          await supabase.auth.signOut();
          setSession(null);
          setRole(null);
          return;
        }
        setRole(data.role as 'admin' | 'seller');
      }
    } catch (error) {
      console.error(error);
      setProfileError('Error de conexión al cargar tu perfil. Intenta de nuevo.');
      setRole('unauthorized');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-orange-500 font-bold">Cargando Sistema...</div>;
  }

  if (!session) {
    return <Login onLogin={() => {}} />; // El state change manejara la redirección
  }

  if (role === 'unauthorized') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-800 p-6">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-gray-200">
          <h2 className="text-2xl font-bold mb-3 text-red-600">
            {isLocalMode ? 'No se pudo verificar tu acceso' : 'Configuración Requerida'}
          </h2>
          <p className="text-gray-600 mb-6">
            {profileError ||
              (isLocalMode
                ? 'No pudimos cargar tu perfil en el servidor. Cierra sesión e intenta de nuevo; si persiste, contacta al administrador.'
                : 'Tu usuario no está configurado correctamente en Supabase.')}
          </p>
          {isLocalMode ? (
            <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-6">
              Tras una actualización del sistema debes <b>cerrar sesión</b> e <b>iniciar sesión otra vez</b> (la sesión guardada en el navegador ya no es válida).
            </p>
          ) : (
            <p className="text-sm text-gray-500 mb-6">
              Si usas Supabase, revisa la tabla <code className="text-xs">worker_profiles</code> y las políticas RLS con tu administrador técnico.
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="bg-orange-500 text-white px-4 py-3 rounded-lg font-bold hover:bg-orange-600"
              onClick={async () => {
                await supabase.auth.signOut();
                setSession(null);
                setRole(null);
                window.location.reload();
              }}
            >
              Cerrar sesión e intentar de nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="antialiased min-h-screen bg-white">
      {role === 'admin' ? (
        <AdminDashboard onLogout={() => setSession(null)} />
      ) : (
        <POS onLogout={() => setSession(null)} />
      )}
    </div>
  );
}

