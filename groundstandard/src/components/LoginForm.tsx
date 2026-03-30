import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LoginFormProps = {
  onSuccess?: () => void;
};

export default function LoginForm({ onSuccess }: LoginFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [fullName, email, password, confirmPassword, mode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!confirmPassword) {
        setError('Please confirm your password.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signup') {
        sessionStorage.setItem('gs_force_login_v1', '1');
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (signUpError) throw signUpError;
        await supabase.auth.signOut();
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setInfo('Account created. Please sign in to continue.');
      } else {
        sessionStorage.removeItem('gs_force_login_v1');
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        onSuccess?.();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/20 to-indigo-50/30 px-4 py-12">
      <div className="w-full max-w-[480px]">
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)] overflow-hidden">
          <div className="px-8 pt-10 pb-8">
            <div className="flex items-center gap-3 mb-8">
              <img 
                src="/image/icon.png" 
                alt="Ground Standard" 
                className="w-12 h-12 rounded-xl"
              />
              <div>
                <div className="text-base font-black text-gray-900">Ground Standard</div>
                <div className="text-xs text-gray-600">Secure access to your workspace</div>
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-black text-gray-900 mb-2">{mode === 'signup' ? 'Create account' : 'Sign in'}</h1>
              <p className="text-sm text-gray-600">Access your workspace to manage articles, statuses, and content workflows.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2.5 uppercase tracking-wide">Full name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2.5 uppercase tracking-wide">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Password</label>
                  {mode === 'signin' && (
                    <button type="button" className="text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Confirm password</label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                  {error}
                </div>
              )}

              {info && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                  </>
                ) : (
                  mode === 'signup' ? 'Create account' : 'Sign in'
                )}
              </button>

              <button
                type="button"
                onClick={() => setMode(m => (m === 'signin' ? 'signup' : 'signin'))}
                className="w-full px-6 py-3 rounded-xl text-sm font-bold bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50 transition-all duration-200"
              >
                {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
              </button>
            </form>

            <div className="mt-8 text-center text-xs text-gray-500">
              By continuing, you agree to use this system responsibly.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
