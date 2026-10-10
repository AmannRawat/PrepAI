import { useEffect, useState } from 'react';
import { Flame, Info } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const StreakCounter = () => {
  const {
    getToken,
    isLoggedIn,
    isLoaded
  } = useAuth();
  const [streak, setStreak] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  // Fetch streak
  // Fetch streak
  // Fetch streak
  useEffect(() => {
    const fetchStreak = async () => {
      // Wait until Clerk has finished loading
      if (!isLoaded || !isLoggedIn) return;

      try {
        // Get the current Clerk session token
        const token = await getToken();

        if (!token) return;

        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/user/progress`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        setStreak(response.data.currentStreak || 0);

      } catch (error) {
        console.error("Error fetching streak:", error);
      }
    };

    fetchStreak();
  }, [getToken, isLoaded, isLoggedIn]);
  
  // If not logged in, return null (don't render anything)
  if (!isLoggedIn) return null;
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