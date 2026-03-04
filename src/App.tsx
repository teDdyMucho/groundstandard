import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import LoginForm from './components/LoginForm';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : data.session);
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : nextSession);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div className="text-sm font-semibold text-white/80">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return <Dashboard />;
}

export default App;