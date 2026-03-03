import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import { supabase, isSupabaseConfigured } from './lib/supabase';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [blockDashboard, setBlockDashboard] = useState(false);

  useEffect(() => {
    let mounted = true;
    let signingOutPostSignup = false;

    const readPostSignup = () => {
      try {
        return sessionStorage.getItem('gs_post_signup_v1') === 'true';
      } catch {
        return false;
      }
    };

    const init = async () => {
      try {
        if (!isSupabaseConfigured) {
          if (mounted) setSession(null);
          return;
        }
        const postSignup = readPostSignup();
        if (mounted) setBlockDashboard(postSignup);
        if (postSignup) {
          signingOutPostSignup = true;
          try {
            await supabase.auth.signOut();
          } finally {
            try {
              sessionStorage.removeItem('gs_post_signup_v1');
            } catch {
              void 0;
            }
            signingOutPostSignup = false;
            if (mounted) setSession(null);
            if (mounted) setBlockDashboard(false);
          }
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (mounted) setSession(data.session);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    if (!isSupabaseConfigured) {
      return () => {
        mounted = false;
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      const postSignup = readPostSignup();
      if (mounted) setBlockDashboard(postSignup);

      if (postSignup && !signingOutPostSignup && newSession) {
        signingOutPostSignup = true;
        try {
          await supabase.auth.signOut();
        } finally {
          try {
            sessionStorage.removeItem('gs_post_signup_v1');
          } catch {
            void 0;
          }
          signingOutPostSignup = false;
          if (mounted) setSession(null);
          if (mounted) setBlockDashboard(false);
        }
        return;
      }

      if (mounted) setSession(newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100" />
    );
  }

  return session && !blockDashboard ? (
    <Dashboard onLogout={handleLogout} />
  ) : (
    <Login onSuccess={() => void 0} />
  );
}

export default App;
