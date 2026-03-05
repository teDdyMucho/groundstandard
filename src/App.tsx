import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import LaunchPad from './components/LaunchPad';
import LoginForm from './components/LoginForm';
import { supabase } from './lib/supabase';
import type { Session } from '@supabase/supabase-js';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [hasLaunchedTool, setHasLaunchedTool] = useState(() => sessionStorage.getItem('gs_has_launched_tool_v1') === '1');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : data.session);
      if (!data.session || forceLogin) {
        sessionStorage.removeItem('gs_has_launched_tool_v1');
        setHasLaunchedTool(false);
      }
      setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const forceLogin = sessionStorage.getItem('gs_force_login_v1') === '1';
      setSession(forceLogin ? null : nextSession);
      if (!nextSession || forceLogin) {
        sessionStorage.removeItem('gs_has_launched_tool_v1');
        setHasLaunchedTool(false);
      }
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

  if (!hasLaunchedTool) {
    return (
      <LaunchPad
        domainLabel={typeof window !== 'undefined' ? window.location.host : 'groundstandard.netlify.app'}
        onLaunchArticleGenerator={() => {
          sessionStorage.setItem('gs_has_launched_tool_v1', '1');
          setHasLaunchedTool(true);
        }}
      />
    );
  }

  return (
    <Dashboard
      onBackToLaunch={() => {
        sessionStorage.removeItem('gs_has_launched_tool_v1');
        setHasLaunchedTool(false);
      }}
    />
  );
}

export default App;