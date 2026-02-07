import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';

const LoginForm = ({ onSuccess, isModal = false }) => {
  // State to toggle between Login and Signup
  const [isSignUp, setIsSignUp] = useState(false);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        // --- SIGN UP FLOW ---
        // 1. Create the account
        await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/signup`, {
          name,
          email,
          password,
        });

        // 2. Immediately Log In (Auto-login)
        const loginResponse = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          email,
          password,
        });

        if (loginResponse.status === 200) {
           login(loginResponse.data);
           if (onSuccess) onSuccess();
           else navigate('/');
        }

      } else {
        // --- LOGIN FLOW ---
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
          email,
          password,
        });

        if (response.status === 200) {
          login(response.data);
          if (onSuccess) onSuccess();
          else navigate('/');
        }
      }

    } catch (err) {
      const message = err.response ? err.response.data.message : 'Authentication failed.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header for the Form */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-text-primary">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p className="text-sm text-text-secondary">
            {isSignUp ? 'Join to track your progress & save history' : 'Log in to continue your progress'}
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        
        {/* Name Field (Only for Sign Up) */}
        {isSignUp && (
            <div className="relative animate-in fade-in slide-in-from-top-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-text-secondary" />
                </div>
                <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 bg-background border border-text-secondary/30 rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                    placeholder="Full Name"
                />
            </div>
        )}

        {/* Email Field */}
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail size={18} className="text-text-secondary" />
            </div>
            <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 bg-background border border-text-secondary/30 rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                placeholder="Email Address"
            />
        </div>

        {/* Password Field */}
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} className="text-text-secondary" />
            </div>
            <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 bg-background border border-text-secondary/30 rounded-lg text-text-primary focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-all"
                placeholder="Password"
            />
        </div>

        {error && <div className="text-sm text-red-400 text-center bg-red-400/10 p-2 rounded">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-accent hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-all"
        >
          {loading ? (
             <><Loader2 className="animate-spin" size={18}/> {isSignUp ? 'Creating Account...' : 'Logging in...'}</>
          ) : (
             <>{isSignUp ? 'Sign Up' : 'Log In'} <ArrowRight size={18} /></>
          )}
        </button>
      </form>

      {/* Toggle Button */}
      <div className="mt-6 text-center">
        <p className="text-sm text-text-secondary">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{' '}
          <button 
            type="button"
            onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
            }}
            className="font-bold text-accent hover:underline focus:outline-none"
          >
            {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginForm;