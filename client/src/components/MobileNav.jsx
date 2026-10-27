import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Code,
  MessageSquare,
  FileText,
  User,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

const MobileNav = () => {
  const getNavLinkClass = ({ isActive }) => {
    return isActive
      ? 'flex flex-col items-center justify-center w-full h-full text-accent min-w-0 px-0.5'
      : 'flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-text-primary transition-colors min-w-0 px-0.5';
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-t border-text-secondary/20 h-16 flex items-center z-50 pb-safe shadow-lg">

      <NavLink to="/" className={getNavLinkClass} end aria-label="Home">
        <Home size={20} />
        <span className="text-[10px] mt-0.5 font-medium">Home</span>
      </NavLink>

      <NavLink to="/dsa-arena" className={getNavLinkClass} aria-label="DSA Arena">
        <Code size={20} />
        <span className="text-[10px] mt-0.5 font-medium">DSA</span>
      </NavLink>

      <NavLink to="/behavioral-coach" className={getNavLinkClass} aria-label="Behavioral Coach">
        <MessageSquare size={20} />
        <span className="text-[10px] mt-0.5 font-medium">Coach</span>
      </NavLink>

      <NavLink to="/resume-reviewer" className={getNavLinkClass} aria-label="Resume Reviewer">
        <FileText size={20} />
        <span className="text-[10px] mt-0.5 font-medium">Resume</span>
      </NavLink>

      <NavLink to="/profile" className={getNavLinkClass} aria-label="Profile and Progress">
        <User size={20} />
        <span className="text-[10px] mt-0.5 font-medium">Profile</span>
      </NavLink>

      <NavLink to="/settings" className={getNavLinkClass} aria-label="Settings">
        <Settings size={20} />
        <span className="text-[10px] mt-0.5 font-medium">Settings</span>
      </NavLink>

    </nav>
  );
};

export default MobileNav;