import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Code, MessageSquare, FileText, User } from 'lucide-react';

const MobileNav = () => {
  const getNavLinkClass = ({ isActive }) => {
    return isActive
      ? 'flex flex-col items-center justify-center w-full h-full text-accent'
      : 'flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-text-primary';
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-t border-text-secondary/20 h-16 flex items-center justify-around z-50 pb-safe">
      <NavLink to="/" className={getNavLinkClass} end>
        <Home size={24} />
        <span className="text-[10px] mt-1">Home</span>
      </NavLink>
      <NavLink to="/dsa-arena" className={getNavLinkClass}>
        <Code size={24} />
        <span className="text-[10px] mt-1">DSA</span>
      </NavLink>
      <NavLink to="/behavioral-coach" className={getNavLinkClass}>
        <MessageSquare size={24} />
        <span className="text-[10px] mt-1">Coach</span>
      </NavLink>
      <NavLink to="/resume-reviewer" className={getNavLinkClass}>
        <FileText size={24} />
        <span className="text-[10px] mt-1">Resume</span>
      </NavLink>
      <NavLink to="/profile" className={getNavLinkClass}>
        <User size={24} />
        <span className="text-[10px] mt-1">Profile</span>
      </NavLink>
    </div>
  );
};

export default MobileNav;