import axios from 'axios';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Code, MessageSquare, FileText, User, LogOut, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
const Sidebar = () => {
  const [streak, setStreak] = useState(0);
  const { logout, userEmail,userName ,token} = useAuth();

// Fetch streak when sidebar loads
  useEffect(() => {
    const fetchStreak = async () => {
      if (!token) return;
      try {
        const response = await axios.get('http://localhost:8000/api/user/progress', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setStreak(response.data.currentStreak || 0);
      } catch (error) {
        console.error("Error fetching streak:", error);
      }
    };
    fetchStreak();
  }, [token]);

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
      
      {/* Streak Counter Section
      <div className="mb-6 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 p-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-orange-500/20 p-1.5 rounded-lg">
            <Flame size={20} className="text-orange-500 fill-orange-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-text-secondary font-semibold uppercase tracking-wider">Day Streak</span>
            <span className="text-lg font-bold text-text-primary leading-none">{streak}</span>
          </div>
        </div>
      </div> */}

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
        {/* Changed this to a NavLink pointing to /profile */}
        <NavLink to="/profile" className={getNavLinkClass}>
            <div className="w-10 h-10 bg-text-secondary/50 rounded-full mr-4 flex items-center justify-center">
              <User size={20} className="text-text-primary" />
            </div>
            <span className="truncate">{userName || 'User Profile'}</span>
            {/* <span className="truncate">User Profile</span> */}
        </NavLink>

        {/* Logout Button */}
        <button 
          onClick={logout} 
          className="flex items-center p-3 rounded-lg hover:bg-surface transition-colors duration-200 w-full mt-2"
        >
            <LogOut className="mr-4" />
            <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
