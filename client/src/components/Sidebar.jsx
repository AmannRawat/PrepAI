// import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Code, MessageSquare, FileText } from 'lucide-react';

const Sidebar = () => {
  // A helper function for NavLink's className to apply styles for active links
  const getNavLinkClass = ({ isActive }) => {
    return isActive
      ? 'flex items-center p-3 rounded-lg bg-accent text-white shadow-lg' // Active link style
      : 'flex items-center p-3 rounded-lg hover:bg-surface transition-colors duration-200'; // Inactive link style
  };

  return (
    <aside className="w-64 bg-surface/50 backdrop-blur-sm border-r border-text-secondary/20 p-6 flex-col hidden md:flex">
      <div className="flex items-center gap-2 mb-12">
        <span className="text-2xl font-bold text-accent font-mono">PrepAI</span>
      </div>
      <div className="bg-background">
  Tailwind custom theme working 🎉
</div>
      
      <nav className="flex flex-col space-y-4">
        <NavLink to="/" className={getNavLinkClass}>
          <Home className="mr-4" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/dsa-arena" className={getNavLinkClass}>
          <Code className="mr-4" />
          <span>DSA Arena</span>
        </NavLink>
        <NavLink to="/behavioral-coach" className={getNavLinkClass}>
          <MessageSquare className="mr-4" />
          <span>Behavioral Coach</span>
        </NavLink>
        <NavLink to="/resume-reviewer" className={getNavLinkClass}>
          <FileText className="mr-4" />
          <span>Resume Reviewer</span>
        </NavLink>
      </nav>

      {/* Placeholder for user profile at the bottom */}
      <div className="mt-auto">
        <div className="flex items-center p-3 rounded-lg hover:bg-surface transition-colors duration-200 cursor-pointer">
            {/* User profile content will go here in Phase 4 */}
            <div className="w-10 h-10 bg-text-secondary/50 rounded-full mr-4"></div>
            <span>User Profile</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
