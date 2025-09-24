// import React from 'react';  NO NEED IN VITE new version React
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle'; 
const Layout = () => {
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
