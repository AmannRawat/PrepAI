import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import StreakCounter from './StreakCounter';
import MobileNav from './MobileNav';
import LoginModal from './LoginModal';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { useTheme } from '../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userName, isLoggedIn, isLoaded } = useAuth();
  const { openLogin } = useModal();
  const { dashboardBg, theme } = useTheme();

  const userInitial = userName ? userName.charAt(0).toUpperCase() : null;

  const isDashboard = location.pathname === '/';
  const isLight = theme === 'light';

  return (
    <div className="flex h-screen bg-background text-text-primary font-sans overflow-hidden">
      {/* Persistent left sidebar */}
      <Sidebar />

      {/* Main viewport */}
      <main className="flex flex-col flex-1 h-screen overflow-y-auto relative">
        {/* Shared mountain landscape background layer for Dashboard - extends to very top behind header */}
        {isDashboard && (
          <div
            className="absolute top-0 left-0 right-0 h-[960px] sm:h-[840px] lg:h-[740px] pointer-events-none z-0 overflow-hidden"
            style={{
              backgroundImage: isLight
                ? `linear-gradient(to bottom, rgba(243, 244, 241, 0.35) 0%, rgba(243, 244, 241, 0.30) 20%, rgba(243, 244, 241, 0.65) 55%, rgba(243, 244, 241, 0.90) 80%, var(--color-background) 100%), url("${dashboardBg || '/backgrounds/bg-mountain-night.jpg'}")`
                : `linear-gradient(to bottom, rgba(9, 11, 14, 0.04) 0%, rgba(9, 11, 14, 0.02) 20%, rgba(9, 11, 14, 0.2) 50%, rgba(9, 11, 14, 0.72) 80%, var(--color-background) 100%), url("${dashboardBg || '/backgrounds/bg-mountain-night.jpg'}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}

        {/* Top-Right Header Status Bar */}
        <header
          className={`sticky top-0 z-30 flex items-center justify-end gap-3 px-6 py-3.5 shrink-0 transition-colors ${
            isDashboard
              ? 'bg-transparent border-b border-border/40 dark:border-white/5'
              : 'bg-background/80 backdrop-blur-md border-b border-border/40'
          }`}
        >
          {/* User Streak: strictly hidden when signed out or invalid */}
          {isLoaded && isLoggedIn && <StreakCounter />}

          {/* Public Control: Theme Toggle always accessible */}
          <ThemeToggle />

          {/* User Avatar / Sign In Action */}
          {!isLoaded ? (
            <div className="w-8 h-8 rounded-full bg-surface-elevated animate-pulse shrink-0" />
          ) : isLoggedIn ? (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-sm hover:ring-2 hover:ring-emerald-400/50 transition cursor-pointer"
              title="Account & Settings"
              aria-label="Account Settings"
            >
              {userInitial || 'U'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (openLogin) openLogin();
                else navigate('/login');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs transition cursor-pointer"
              title="Sign In"
            >
              <LogIn size={14} />
              <span>Sign In</span>
            </button>
          )}
        </header>

        {/* Content Area with Page Transitions */}
        <div className={`flex-1 flex flex-col relative z-10 ${isDashboard ? 'p-0' : 'p-4 sm:p-6 md:p-8'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col flex-1"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <MobileNav />
      <LoginModal />
    </div>
  );
};

export default Layout;
