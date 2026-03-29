import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from './firebase';
import { AlertCircle, Activity, Eye, EyeOff, Check, X, Mail } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: () => void;
}

export function Auth({ onAuthSuccess }: AuthProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Validation metrics
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const passwordLength = password.length >= 8;
  const passwordStrength = [passwordLength, hasUpperCase, hasLowerCase, hasNumbers].filter(Boolean).length;
  const passwordMatch = password === confirmPassword;
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmitSignUp = passwordLength && passwordMatch && displayName.trim() && isValidEmail;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // Create account
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        // Update profile with display name
        await updateProfile(user, { displayName });
        onAuthSuccess();
      } else {
        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess();
      }
    } catch (err: any) {
      const errorMessages: { [key: string]: string } = {
        'auth/email-already-in-use': 'Email already registered. Try signing in.',
        'auth/weak-password': 'Password must be at least 8 characters.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
      };
      setError(errorMessages[err.code] || err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-10">
          {/* Logo & Header */}
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-300">
              <Activity className="w-10 h-10 text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-1">NurseFlow</h1>
            <p className="text-slate-500 text-sm font-medium">{isSignUp ? 'Create Your Account' : 'Welcome Back'}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex gap-3 animate-in">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Display Name - Sign Up Only */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={loading}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50 transition-all"
                  required={isSignUp}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="you@hospital.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50 pr-11 transition-all"
                  required
                />
                {email && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValidEmail ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {isSignUp ? 'Create Password' : 'Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50 pr-11 transition-all"
                  required
                  minLength={isSignUp ? 8 : 1}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {isSignUp && password && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`flex-1 h-full ${passwordStrength >= 1 ? 'bg-red-500' : 'bg-slate-200'}`} />
                    <div className={`flex-1 h-full ${passwordStrength >= 2 ? 'bg-yellow-500' : 'bg-slate-200'}`} />
                    <div className={`flex-1 h-full ${passwordStrength >= 3 ? 'bg-blue-500' : 'bg-slate-200'}`} />
                    <div className={`flex-1 h-full ${passwordStrength >= 4 ? 'bg-green-500' : 'bg-slate-200'}`} />
                  </div>
                  <p className={`text-xs font-medium ${
                    passwordStrength >= 3 ? 'text-green-600' :
                    passwordStrength >= 2 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {passwordStrength <= 2 ? 'Weak' : passwordStrength === 3 ? 'Good' : 'Strong'} password
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      {passwordLength ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
                      <span className={passwordLength ? 'text-green-600' : 'text-slate-500'}>At least 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {hasUpperCase ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
                      <span className={hasUpperCase ? 'text-green-600' : 'text-slate-500'}>Uppercase letter</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {hasLowerCase ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
                      <span className={hasLowerCase ? 'text-green-600' : 'text-slate-500'}>Lowercase letter</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {hasNumbers ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-slate-300" />}
                      <span className={hasNumbers ? 'text-green-600' : 'text-slate-500'}>Number</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password - Sign Up Only */}
            {isSignUp && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-slate-50 pr-11 transition-all"
                    required
                  />
                  {confirmPassword && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {passwordMatch ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                {confirmPassword && !passwordMatch && (
                  <p className="text-xs text-red-600 mt-1">Passwords don't match</p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (isSignUp && !canSubmitSignUp)}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-slate-600 text-sm mb-4">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            </p>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setPassword('');
                setConfirmPassword('');
                setDisplayName('');
              }}
              className="px-6 py-2.5 bg-blue-50 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
            >
              {isSignUp ? 'Sign In Instead' : 'Create Account'}
            </button>
          </div>

          {/* Footer */}
          <p className="text-xs text-slate-400 text-center mt-6">
            Secure healthcare data • End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}

