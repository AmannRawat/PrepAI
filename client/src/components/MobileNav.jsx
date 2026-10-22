import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Code,
  MessageSquare,
  FileText,
  User,
  LogOut,
  LogIn
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

const MobileNav = () => {
  const { logout, isLoggedIn, isLoaded } = useAuth();
  const { openLogin } = useModal();
  const navigate = useNavigate();

  const handleLoginClick = () => {
    if (openLogin) {
      openLogin();
    } else {
      navigate('/login');
    }
  };

  const getNavLinkClass = ({ isActive }) => {
    return isActive
      ? 'flex flex-col items-center justify-center w-full h-full text-accent'
      : 'flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-text-primary transition-colors';
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-md border-t border-text-secondary/20 h-16 flex items-center z-50 pb-safe">

      <NavLink to="/" className={getNavLinkClass} end>
        <Home size={22} />
        <span className="text-[10px] mt-1">Home</span>
      </NavLink>

      <NavLink to="/dsa-arena" className={getNavLinkClass}>
        <Code size={22} />
        <span className="text-[10px] mt-1">DSA</span>
      </NavLink>

      <NavLink to="/behavioral-coach" className={getNavLinkClass}>
        <MessageSquare size={22} />
        <span className="text-[10px] mt-1">Coach</span>
      </NavLink>

      <NavLink to="/resume-reviewer" className={getNavLinkClass}>
        <FileText size={22} />
        <span className="text-[10px] mt-1">Resume</span>
      </NavLink>

      <NavLink to="/profile" className={getNavLinkClass}>
        <User size={22} />
        <span className="text-[10px] mt-1">Profile</span>
      </NavLink>

      {/* Auth action: Logout if logged in, Login if logged out */}
      {isLoaded && (
        isLoggedIn ? (
          <button
            type="button"
            onClick={logout}
            className="flex flex-col items-center justify-center w-full h-full text-text-secondary hover:text-red-400 transition-colors"
          >
            <LogOut size={22} />
            <span className="text-[10px] mt-1">Logout</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLoginClick}
            className="flex flex-col items-center justify-center w-full h-full text-accent hover:text-accent-darker transition-colors"
            aria-label="Login or Sign in"
          >
            <LogIn size={22} />
            <span className="text-[10px] mt-1">Login</span>
          </button>
        )
      )}

    </div>
  );
};

export default MobileNav;