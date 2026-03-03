import { useState, type FormEvent } from 'react';
import { Lock, Mail, LogIn } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type LoginProps = {
  onSuccess: () => void;
};
//dfsaf
export default function Login({ onSuccess }: LoginProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showSignupSuccess, setShowSignupSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err && 'message' in err) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
    return 'Request failed';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const eTrim = email.trim();
    const pTrim = password.trim();
    if (!eTrim || !pTrim) {
      setError('Please enter email and password.');
      return;
    }

    if (mode === 'signup') {
      const nTrim = fullName.trim();
      if (!nTrim) {
        setError('Please enter your full name.');
        return;
      }
      if (pTrim.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (pTrim !== confirmPassword.trim()) {
        setError('Passwords do not match.');
        return;
      }
    }

    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and restart the dev server.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: eTrim,
          password: pTrim,
        });
        if (signInError) throw signInError;
        onSuccess();
        return;
      }

      try {
        sessionStorage.setItem('gs_post_signup_v1', 'true');
      } catch {
        void 0;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: eTrim,
        password: pTrim,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName.trim(),
          },
        },
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        await supabase.auth.signOut();
      }

      setPassword('');
      setConfirmPassword('');
      setFullName('');
      setMode('signin');
      setShowSignupSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotError(null);
    setForgotMessage(null);

    const eTrim = forgotEmail.trim();
    if (!eTrim) {
      setForgotError('Please enter your email.');
      return;
    }

    if (!isSupabaseConfigured) {
      setForgotError('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY and restart the dev server.');
      return;
    }

    setForgotSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(eTrim, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw resetError;
      setForgotMessage('Password reset email sent. Please check your inbox.');
    } catch (err) {
      setForgotError(getErrorMessage(err));
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="px-8 py-8 bg-gradient-to-r from-peacock-600 to-peacock-500">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
                <LogIn className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Welcome back</h1>
                <p className="text-sm text-white/80">Sign in to continue to your dashboard</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
            {error && (
              <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
                {error}
              </div>
            )}
            {message && (
              <div className="p-4 rounded-2xl border border-peacock-200 bg-peacock-50 text-peacock-900 text-sm font-medium">
                {message}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-peacock-500/30 focus:border-peacock-500 focus:bg-white transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-800">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-peacock-500/30 focus:border-peacock-500 focus:bg-white transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="Juan Dela Cruz"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-800">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-peacock-500/30 focus:border-peacock-500 focus:bg-white transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {mode === 'signin' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot(true);
                    setForgotEmail(email.trim());
                    setForgotError(null);
                    setForgotMessage(null);
                  }}
                  className="text-xs font-semibold text-peacock-700 hover:text-peacock-800"
                  disabled={submitting}
                >
                  Forgot password?
                </button>
              </div>
            )}

            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-800">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-peacock-500/30 focus:border-peacock-500 focus:bg-white transition-all duration-200 text-black placeholder-gray-500"
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-peacock-600 to-peacock-700 hover:from-peacock-700 hover:to-peacock-800 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn className={`w-5 h-5 ${submitting ? 'animate-pulse' : ''}`} />
              {submitting
                ? mode === 'signin'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setMessage(null);
                setPassword('');
                setConfirmPassword('');
                setFullName('');
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              }}
              className="w-full text-sm font-semibold text-peacock-700 hover:text-peacock-800"
              disabled={submitting}
            >
              {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
            </button>
          </form>
        </div>
      </div>

      {showSignupSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSignupSuccess(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 p-6 z-10">
            <div className="text-lg font-extrabold text-black mb-2">Account created successfully</div>
            <div className="text-sm text-gray-600 mb-5">You can now sign in using the email and password you created.</div>
            <button
              type="button"
              onClick={() => setShowSignupSuccess(false)}
              className="w-full inline-flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-peacock-600 to-peacock-700 hover:from-peacock-700 hover:to-peacock-800 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Go to Sign in
            </button>
          </div>
        </div>
      )}

      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!forgotSubmitting) setShowForgot(false); }} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 p-6 z-10">
            <div className="text-lg font-extrabold text-black mb-1">Reset your password</div>
            <div className="text-sm text-gray-600 mb-4">Enter your email and we’ll send a reset link.</div>

            {forgotError && (
              <div className="mb-4 p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-sm font-medium">
                {forgotError}
              </div>
            )}
            {forgotMessage && (
              <div className="mb-4 p-4 rounded-2xl border border-peacock-200 bg-peacock-50 text-peacock-900 text-sm font-medium">
                {forgotMessage}
              </div>
            )}

            <div className="space-y-2 mb-5">
              <label className="text-sm font-semibold text-gray-800">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-peacock-500/30 focus:border-peacock-500 focus:bg-white transition-all duration-200 text-black placeholder-gray-500"
                  placeholder="you@company.com"
                  autoComplete="email"
                  disabled={forgotSubmitting}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-bold text-peacock-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all duration-200"
                disabled={forgotSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-peacock-600 to-peacock-700 hover:from-peacock-700 hover:to-peacock-800 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={forgotSubmitting}
              >
                {forgotSubmitting ? 'Sending...' : 'Send reset link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
