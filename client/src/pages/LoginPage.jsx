import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Use Link for navigation
import axios from 'axios'; 

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
   try {
      // Sends the email and password to the backend
      const response = await axios.post('http://localhost:8000/api/auth/login', {
        email,
        password,
      });

      // If login is successful, save the token and user info
      if (response.status === 200) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('userEmail', response.data.email);
        
        // 3. Redirect to the dashboard
        navigate('/');
      }

    } catch (err) {
      // Handle errors (like "Invalid credentials")
      const message = err.response ? err.response.data.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };    

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-8 bg-surface/70 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center text-accent">
          PrepAI Login
        </h1>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-text-secondary"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-background border border-text-secondary/30 rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-accent focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-text-secondary"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-background border border-text-secondary/30 rounded-md text-text-primary placeholder-text-secondary focus:outline-none focus:ring-accent focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-darker disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        </form>
        <p className="text-sm text-center text-text-secondary">
          Don't have an account?{' '}
          <Link 
            to="/signup" 
            className="font-medium text-accent hover:text-accent-darker"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;