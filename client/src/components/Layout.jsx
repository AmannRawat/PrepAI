// import React from 'react';  NO NEED IN VITE new version React
import { Outlet,Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle'; 
import { useAuth } from '../context/AuthContext';
const Layout = () => {
  const { isLoggedIn } = useAuth(); //Get the user's login status from context
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
         <div className="absolute top-6 right-8 z-10">
          <ThemeToggle />
        </div>
        {/* Outlet is a placeholder from react-router-dom where the routed page component will be rendered */}
        <Outlet />
      </main>
    </div>
    
  );
};

export default Layout;
