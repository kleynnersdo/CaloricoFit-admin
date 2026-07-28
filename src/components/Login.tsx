import React, { useState } from 'react';
import { supabase, isMockSupabase, supabaseUrl } from '../lib/supabase';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [documentId, setDocumentId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to format cedula into a virtual email
  const getVirtualEmail = (input: string) => {
    return input.includes('@') ? input.trim() : `${input.trim()}@caloricofit.com`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const email = getVirtualEmail(documentId);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (data.session) {
        onLogin();
      }
    } catch (err: any) {
      if (err.message.includes('Invalid login credentials')) {
        setError('Cédula o contraseña incorrectos.');
      } else {
        setError(err.message || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            <span className="text-orange-500">Calórico</span> Fit
          </h1>
          <p className="text-gray-500 mt-2">Sistema Administrativo y POS</p>
        </div>

        {isMockSupabase && (
          <div className="mb-4 bg-amber-50 text-amber-800 p-4 rounded-lg text-xs border border-amber-200">
            <span className="font-semibold block mb-1">⚠️ Supabase No Configurado</span>
            El sistema está usando una base de datos simulada. Debes configurar <strong>VITE_SUPABASE_URL</strong> y <strong>VITE_SUPABASE_ANON_KEY</strong> en tus variables de entorno de Vercel o de la aplicación.
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 text-red-600 p-4 rounded-lg text-sm font-medium border border-red-100">
            <span className="block font-semibold">{error}</span>
            {error.includes('Failed to fetch') && (
              <span className="block mt-1 text-xs text-red-500 font-normal">
                Este error ocurre cuando el navegador no puede conectarse a Supabase. 
                Verifica que la URL del proyecto sea correcta (actualmente: <code>{supabaseUrl}</code>) y que no incluya subrutas adicionales.
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cédula o Correo Electrónico
            </label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all font-mono"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              placeholder="12345678 o admin@correo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black hover:bg-gray-800 text-white font-medium py-3 rounded-lg flex justify-center transition-all disabled:opacity-50"
            >
              {loading ? 'Cargando...' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
