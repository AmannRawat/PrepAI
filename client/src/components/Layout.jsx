import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
  return (
    <div className="flex min-h-screen bg-background text-text-primary font-sans">
      {/* Persistent sidebar */}
      <Sidebar />
      
      {/* The main content area that will change based on the route */}
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        {/* Outlet is a placeholder from react-router-dom where the routed page component will be rendered */}
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
