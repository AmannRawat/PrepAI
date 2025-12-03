import { useEffect, useState } from 'react';
import { Flame, Info } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const StreakCounter = () => {
  const { token } = useAuth();
  const [streak, setStreak] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  // Fetch streak
  useEffect(() => {
    const fetchStreak = async () => {
      if (!token) return;
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/user/progress`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setStreak(response.data.currentStreak || 0);
      } catch (error) {
        console.error("Error fetching streak:", error);
      }
    };
    fetchStreak();
  }, [token]);

  return (
    <div 
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* The Badge */}
      <div className="flex items-center gap-2 bg-surface/50 border border-text-secondary/20 px-3 py-1.5 rounded-full cursor-help transition-colors hover:bg-surface">
        <Flame size={20} className={`${streak > 0 ? 'text-orange-500 fill-orange-500' : 'text-text-secondary'}`} />
        <span className={`font-bold ${streak > 0 ? 'text-orange-500' : 'text-text-secondary'}`}>
          {streak}
        </span>
      </div>

      {/* The Tooltip (Hidden by default) */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-surface border border-text-secondary/20 rounded-lg shadow-xl z-50 text-sm text-text-secondary animate-in fade-in zoom-in-95 duration-200">
          <p className="font-semibold text-text-primary mb-1 flex items-center gap-2">
            <Flame size={14} className="text-orange-500" /> Daily Streak
          </p>
          <p>
            Complete at least one activity (DSA problem, Mock Interview, or Resume Review) every day to build your streak!
          </p>
        </div>
      )}
    </div>
  );
};

export default StreakCounter;