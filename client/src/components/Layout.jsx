// import React from 'react';  NO NEED IN VITE new version React
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import StreakCounter from './StreakCounter';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const Layout = () => {
  const { isLoggedIn } = useAuth(); //Get the user's login status from context
  const location = useLocation();
  // Check if the user is logged in
  if (!isLoggedIn) {
    // If not logged in, redirect them to the /login page
    return <Navigate to="/login" replace />;
  }

  // If logged in, show the layout with sidebar and main content
  return (
    <div className="flex h-screen bg-background text-text-primary font-sans">
      {/* Persistent sidebar */}
      <Sidebar />

      {/* The main content area that will change based on the route */}
      <main className="flex flex-col flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto relative">
        <div className="absolute top-6 right-8 z-20 flex items-center gap-4">
            <StreakCounter /> {/* The Streak component */}
            <ThemeToggle />   {/* The Theme Toggle */}
          </div>
        {/* Add Animation Wrapper */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname} // This key is essential for AnimatePresence
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col flex-1" // Ensures the page component fills the space
          >
            {/* Outlet is a placeholder from react-router-dom where the routed page component will be rendered */}
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>

  );
};

export default Layout;
