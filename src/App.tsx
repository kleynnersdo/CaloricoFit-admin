import { useEffect, useState } from 'react';
import POS from './components/POS';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { api, type AppSession } from './lib/apiClient';

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [role, setRole] = useState<'admin' | 'seller' | 'unauthorized' | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        checkUserRole(s.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = api.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        checkUserRole(s.user.id);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUserRole = async (userId: string) => {
    setProfileError(null);
    try {
      const { data, error } = await api.from('worker_profiles').select('*').eq('id', userId).single();

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
          setProfileError('Tu sesión expiró o es inválida. Vuelve a iniciar sesión.');
          await api.auth.signOut();
          setSession(null);
          setRole(null);
          return;
        }

        if (code === 'PGRST116') {
          setProfileError(
            'Tu usuario no tiene perfil de vendedor/admin en la base de datos. Pide al administrador que revise worker_profiles.'
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
          await api.auth.signOut();
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
    return <Login onLogin={() => {}} />;
  }

  if (role === 'unauthorized') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-800 p-6">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-gray-200">
          <h2 className="text-2xl font-bold mb-3 text-red-600">No se pudo verificar tu acceso</h2>
          <p className="text-gray-600 mb-6">
            {profileError ||
              'No pudimos cargar tu perfil en el servidor. Cierra sesión e intenta de nuevo; si persiste, contacta al administrador.'}
          </p>
          <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg p-3 mb-6">
            Tras una actualización del sistema debes <b>cerrar sesión</b> e <b>iniciar sesión otra vez</b>.
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="bg-orange-500 text-white px-4 py-3 rounded-lg font-bold hover:bg-orange-600"
              onClick={async () => {
                await api.auth.signOut();
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
