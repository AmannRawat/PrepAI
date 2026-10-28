import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const StreakCounter = () => {
  const {
    getToken,
    isLoggedIn,
    isLoaded,
  } = useAuth();
  const [streak, setStreak] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const fetchStreak = async () => {
      if (!isLoaded || !isLoggedIn) {
        setStreak(null);
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          setStreak(null);
          return;
        }

        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/user/progress`,
          {
            params: {
              timezone: tz,
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!isCancelled && response.data && response.data.currentStreak !== undefined) {
          setStreak(response.data.currentStreak);
        } else if (!isCancelled) {
          setStreak(0);
        }
      } catch (error) {
        console.error("Error fetching streak:", error);
        if (!isCancelled) setStreak(null);
      }
    };

    fetchStreak();

    return () => {
      isCancelled = true;
    };
  }, [getToken, isLoaded, isLoggedIn]);

  // When signed out, during initial loading, or before valid data arrives, hide streak completely
  if (!isLoaded || !isLoggedIn || streak === null || streak === undefined) {
    return null;
  }

  return (
    <div
      className="relative flex items-center select-none animate-fade-in"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Sleek Pill matching reference screenshot */}
      <div className="flex items-center gap-1.5 bg-surface/80 backdrop-blur-md border border-amber-500/25 px-3 py-1.5 rounded-full cursor-help transition hover:border-amber-500/40 hover:bg-surface shadow-[0_0_12px_rgba(245,158,11,0.08)]">
        <Flame size={15} className="text-amber-500 fill-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
          {streak} Day Streak
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-surface/95 backdrop-blur-md border border-border rounded-xl shadow-xl z-50 text-xs text-text-secondary animate-in fade-in zoom-in-95 duration-150">
          <p className="font-semibold text-text-primary mb-1 flex items-center gap-1.5">
            <Flame size={14} className="text-amber-500 fill-amber-500" /> Daily Streak
          </p>
          <p className="leading-relaxed">
            Solve DSA problems, practice behavioral interviews, or review resumes daily to maintain your consistency streak.
          </p>
        </div>
      )}
    </div>
  );
};

export default StreakCounter;