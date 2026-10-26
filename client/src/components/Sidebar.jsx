import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Code2,
  MessageSquare,
  FileText,
  TrendingUp,
  Calendar,
  Settings,
  User,
  LogOut,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import PepeAvatar from './PepeAvatar';

const Sidebar = () => {
  const {
    logout,
    userName,
    userEmail,
    userImageUrl,
    isLoaded,
    isLoggedIn,
  } = useAuth();
  const { openLogin } = useModal();
  const navigate = useNavigate();

  const handleLoginClick = () => {
    if (openLogin) {
      openLogin();
    } else {
      navigate('/login');
    }
  };

  // NavLink styling based on active state matching reference mockup
  const getNavLinkClass = ({ isActive }) => {
    const base = 'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 group';
    if (isActive) {
      return `${base} bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-400 font-semibold dark:font-medium shadow-xs dark:shadow-[0_0_16px_rgba(16,185,129,0.12)] backdrop-blur-sm`;
    }
    return `${base} text-text-secondary hover:text-text-primary hover:bg-surface-hover/60 border border-transparent`;
  };

  const userInitial = userName ? userName.charAt(0).toUpperCase() : 'A';

  return (
    <aside className="w-64 bg-surface/90 backdrop-blur-md border-r border-border p-5 flex-col hidden md:flex shrink-0 select-none z-20">
      {/* Brand Header with Pepe Logo */}
      <div className="flex items-center gap-3 mb-8 px-1">
        <PepeAvatar size="sm" className="shrink-0" />
        <span className="text-xl font-bold tracking-tight text-text-primary">
          Prep<span className="text-emerald-600 dark:text-emerald-400">AI</span>
        </span>
      </div>

      {/* Main Navigation Menu */}
      <nav className="flex flex-col space-y-1.5 flex-1">
        <NavLink to="/" end className={getNavLinkClass}>
          <LayoutDashboard className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/dsa-arena" className={getNavLinkClass}>
          <Code2 className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>DSA Arena</span>
        </NavLink>

        <NavLink to="/behavioral-coach" className={getNavLinkClass}>
          <MessageSquare className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Behavioral Coach</span>
        </NavLink>

        <NavLink to="/resume-reviewer" className={getNavLinkClass}>
          <FileText className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Resume Reviewer</span>
        </NavLink>

        <NavLink to="/progress" className={getNavLinkClass}>
          <TrendingUp className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Progress</span>
        </NavLink>

        <NavLink to="/calendar" className={getNavLinkClass}>
          <Calendar className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Calendar</span>
        </NavLink>

        <NavLink to="/settings" className={getNavLinkClass}>
          <Settings className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
          <span>Settings</span>
        </NavLink>
      </nav>

      {/* User Profile / Auth Anchor at Bottom */}
      <div className="pt-4 border-t border-border/40 mt-auto">
        {!isLoaded ? (
          <div className="flex items-center gap-3 p-2 rounded-xl animate-pulse">
            <div className="w-9 h-9 rounded-full bg-surface-elevated" />
            <div className="h-3.5 bg-surface-elevated rounded w-24" />
          </div>
        ) : isLoggedIn ? (
          <div className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated/70 dark:bg-surface-elevated/40 border border-border hover:border-border/80 transition">
            <NavLink
              to="/settings"
              className="flex items-center gap-3 overflow-hidden group flex-1 min-w-0"
              title="View settings and profile"
            >
              {userImageUrl ? (
                <img
                  src={userImageUrl}
                  alt={userName || 'User'}
                  className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm group-hover:ring-2 group-hover:ring-emerald-400/50 transition"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }
                  }}
                />
              ) : null}
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold text-xs flex items-center justify-center shrink-0 shadow-sm group-hover:ring-2 group-hover:ring-emerald-400/50 transition ${userImageUrl ? 'hidden' : 'flex'}`}
              >
                {userInitial}
              </div>
              <span className="text-xs font-semibold text-text-primary truncate">
                {userName || 'Candidate'}
              </span>
            </NavLink>

            <button
              onClick={logout}
              type="button"
              className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-surface transition ml-1 shrink-0"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleLoginClick}
            type="button"
            className="flex items-center justify-center gap-2 w-full p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold transition"
          >
            <LogIn size={15} />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;