import { StrictMode, useEffect, useState } from 'react';
import POS from './components/POS';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<'admin' | 'seller' | null>(null);
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
    try {
      const { data, error } = await supabase
        .from('worker_profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') {
          // No existe, debe arreglar su base de datos obligatoriamente
          setRole('unauthorized'); 
        } else {
          console.error('Error fetching role:', error);
          setRole('unauthorized');
        }
      }
      
      if (data) {
        if (data.is_active === false) {
           // Seller is inactive! Let's just log them out
           alert("Tu cuenta ha sido inhabilitada por el administrador.");
           await supabase.auth.signOut();
           return;
        }
        setRole(data.role as 'admin' | 'seller');
      }
    } catch (error) {
        console.error(error);
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
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-3xl w-full border border-gray-200 overflow-hidden">
          <h2 className="text-3xl font-bold mb-4 text-red-600">Configuración Requerida</h2>
          <p className="text-gray-600 mb-6 text-lg">
            Estás viendo esto porque tu usuario administrador aún no existe en la base de datos o le faltan columnas (Error de RLS). <b>Nada funcionará hasta que apliques este parche.</b>
          </p>

          <div className="mb-6 bg-orange-50 p-6 rounded border border-orange-200">
            <h3 className="font-bold text-orange-900 mb-2">Instrucciones para el Administrador:</h3>
            <p className="text-sm text-orange-800 mb-4">
              Copia TODO el texto del siguiente cuadro y pégalo en el <b>SQL Editor</b> de tu panel de Supabase y presiona "Run" (Ejecutar).
              Esto reparará la estructura de la base de datos y permitirá la creación de vendedores sin errores.
            </p>
            <div className="bg-gray-900 text-green-400 p-4 rounded text-xs font-mono h-64 overflow-y-auto mb-4 select-all whitespace-pre-wrap">
{`-- 1. ASEGURAR QUE LAS COLUMNAS EXISTAN EN LA TABLA
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS document_id TEXT;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.worker_profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. INSERTAR TU PERFIL COMO SUPER ADMIN PERMANENTE
INSERT INTO public.worker_profiles (id, first_name, last_name, role, email) 
VALUES ('${session?.user?.id}', 'Super', 'Admin', 'admin', '${session?.user?.email}')
ON CONFLICT (id) DO UPDATE SET role = 'admin', email = EXCLUDED.email;

-- 3. REPARAR EL TRIGGER PARA QUE LOS VENDEDORES SE CREEN AUTOMÁTICAMENTE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.worker_profiles (id, first_name, last_name, email, document_id, phone, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'first_name', 'Nuevo'),
    COALESCE(new.raw_user_meta_data->>'last_name', 'Usuario'),
    new.email,
    new.raw_user_meta_data->>'document_id',
    new.raw_user_meta_data->>'phone',
    COALESCE(new.raw_user_meta_data->>'role', 'seller')
  ) ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    document_id = COALESCE(EXCLUDED.document_id, worker_profiles.document_id),
    phone = COALESCE(EXCLUDED.phone, worker_profiles.phone),
    role = EXCLUDED.role;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
`}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                className="bg-black text-white px-4 py-3 rounded font-bold w-full hover:bg-gray-800 transition-colors shadow-md" 
                onClick={() => window.location.reload()}
              >
                ✔ Ya ejecuté el código, verificar y entrar
              </button>
            </div>
            <p className="text-xs text-center text-gray-500 mt-4">
              Si habías intentado registrar a un vendedor previamente y falló, debes eliminarlo de "Authentication" y volver a crearlo luego de aplicar este código.
              <br /><br />
              <b>¿Te sale el error "violates foreign key constraint"?</b> Significa que borraste tu usuario en Supabase, pero <b>sigues teniendo la sesión abierta</b> en esta pestaña. Por favor, haz clic abajo en <b>Cerrar Sesión</b> y vuelve a iniciar sesión con un usuario válido.
            </p>
          </div>
          <div className="flex justify-center border-t border-gray-200 pt-6">
            <button 
              className="text-gray-500 text-sm underline hover:text-black" 
              onClick={() => supabase.auth.signOut()}
            >
              Cerrar Sesión
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

