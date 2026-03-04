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
    <div className="h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50/30 px-4 py-6">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-white border border-gray-200/60 rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] overflow-hidden h-[calc(100vh-3rem)] max-h-[820px]">
          <div className="p-8 lg:p-10 xl:p-12 flex flex-col justify-center">
            <div className="mb-6">
              <h1 className="text-3xl lg:text-4xl font-black text-gray-900 mb-2 tracking-tight">{mode === 'signup' ? 'Create account' : 'Sign in'}</h1>
              <p className="text-sm text-gray-600 leading-relaxed">Access your workspace to manage articles, statuses, and content workflows.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2.5 tracking-wide">Full name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                      placeholder="Juan Dela Cruz"
                      autoComplete="name"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2.5 tracking-wide">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
                    placeholder="you@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="block text-sm font-bold text-gray-800 tracking-wide">Password</label>
                  {mode === 'signin' && (
                    <button type="button" className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-semibold transition-colors">
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
                    className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
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
                    <label className="block text-sm font-bold text-gray-800 tracking-wide">Confirm password</label>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="w-5 h-5 text-gray-400" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 text-sm transition-all duration-200"
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
                <div className="rounded-xl border-2 border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800 flex items-start gap-2">
                  <span className="text-red-600 mt-0.5">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {info && (
                <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-5 py-4 text-sm font-semibold text-blue-900">
                  {info}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
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
                className="w-full mt-3 px-6 py-3 rounded-xl text-sm font-bold bg-white border-2 border-gray-200 text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
              >
                {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
              </button>
            </form>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-red-600">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.5),transparent_50%)]" />
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.4),transparent_60%)]" />
            <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative h-full min-h-[500px] lg:min-h-full p-12 lg:p-16 xl:p-20 text-white flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-4 mb-16">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center font-black text-xl shadow-2xl">
                    GS
                  </div>
                  <div>
                    <div className="text-lg font-black tracking-tight">Ground Standard</div>
                    <div className="text-sm text-white/90 font-semibold tracking-wide">Research. Generate. Scale.</div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>
                    <div className="text-5xl lg:text-6xl font-black tracking-tight leading-tight mb-6">
                      {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                    </div>
                    <div className="text-lg text-white/95 max-w-lg leading-relaxed font-medium">
                      {mode === 'signup'
                        ? 'Set up your account to start managing your research pipeline and content workflows.'
                        : 'Continue managing your content research pipeline. Access powerful tools for article discovery, content generation, and workflow automation.'}
                    </div>
                  </div>

                  <div className="space-y-4 max-w-lg">
                    <div className="flex items-start gap-3 text-white/90">
                      <div className="w-6 h-6 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm">✓</span>
                      </div>
                      <div className="text-sm font-medium leading-relaxed">
                        Automated research article discovery and content extraction
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-white/90">
                      <div className="w-6 h-6 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm">✓</span>
                      </div>
                      <div className="text-sm font-medium leading-relaxed">
                        AI-powered content generation and rewriting capabilities
                      </div>
                    </div>
                    <div className="flex items-start gap-3 text-white/90">
                      <div className="w-6 h-6 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm">✓</span>
                      </div>
                      <div className="text-sm font-medium leading-relaxed">
                        Streamlined workflow for content review and publishing
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-sm text-white/75 font-medium">
                Enterprise-grade security • Encrypted authentication
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
