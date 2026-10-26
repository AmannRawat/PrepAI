import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  Clock,
  Code2,
  MessageSquare,
  FileText,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateNice(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

const CalendarPage = () => {
  const { isLoggedIn, isLoaded, getToken, userId } = useAuth();
  const { openLogin } = useModal();

  // Current selected month view (defaults to real today)
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Real user activity state
  const [activeDays, setActiveDays] = useState([]);
  const [streak, setStreak] = useState(0);
  const [streakStartDate, setStreakStartDate] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleResetToToday = () => {
    setCurrentDate(new Date());
  };

  const fetchCalendarData = useCallback(async () => {
    if (!isLoaded || !isLoggedIn) {
      setActiveDays([]);
      setStreak(0);
      setStreakStartDate(null);
      setMilestones([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/user/calendar`,
        {
          params: {
            year,
            month: month + 1,
            timezone: tz,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.data) {
        setActiveDays(Array.isArray(res.data.activeDays) ? res.data.activeDays : []);
        setStreak(typeof res.data.currentStreak === 'number' ? res.data.currentStreak : 0);
        setStreakStartDate(res.data.streakStartDate || null);
        setMilestones(Array.isArray(res.data.todayMilestones) ? res.data.todayMilestones : []);
      }
    } catch (err) {
      console.error('Failed to fetch calendar activity:', err);
      setError('Unable to load your activity data. Please try again.');
      setActiveDays([]);
      setStreak(0);
      setStreakStartDate(null);
      setMilestones([]);
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isLoaded, isLoggedIn, month, year]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData, userId]);

  const realToday = new Date();
  const isViewingCurrentMonth =
    realToday.getFullYear() === year && realToday.getMonth() === month;

  return (
    <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full pb-12 animate-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
            <CalendarIcon size={14} />
            <span>Preparation Schedule</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
            Calendar & Activity History
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Track your interview practice cadence, daily streaks, and preparation milestones.
          </p>
        </div>

        {!isViewingCurrentMonth && (
          <button
            type="button"
            onClick={handleResetToToday}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-elevated text-xs font-semibold text-text-secondary hover:text-text-primary transition shadow-sm"
          >
            <RotateCcw size={13} />
            <span>Back to Today</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
          {/* Month Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-text-primary">
                {MONTH_NAMES[month]} {year}
              </h2>
              {isLoading && <Loader2 size={15} className="animate-spin text-emerald-400" />}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition"
                aria-label="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-border hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition"
                aria-label="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-text-secondary mb-3">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-11 rounded-xl opacity-0" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const isToday =
                isViewingCurrentMonth && realToday.getDate() === dayNum;
              const hasActivity = isLoggedIn && activeDays.includes(dayNum);

              return (
                <div
                  key={dayNum}
                  className={`relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-semibold transition select-none ${
                    isToday
                      ? 'bg-emerald-500 text-white font-bold shadow-[0_0_14px_rgba(16,185,129,0.4)]'
                      : hasActivity
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : 'text-text-secondary hover:bg-surface-elevated/70'
                  }`}
                >
                  <span>{dayNum}</span>
                  {hasActivity && !isToday && (
                    <span className="w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Calendar Legend / Status */}
          <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between text-[11px] text-text-muted">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Today</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
                <span>Completed Practice</span>
              </div>
            </div>
            {isLoggedIn && (
              <span>
                {activeDays.length} active {activeDays.length === 1 ? 'day' : 'days'} this month
              </span>
            )}
          </div>
        </div>

        {/* Schedule & Focus Sidebar (1 col) */}
        <div className="space-y-4">
          {!isLoaded ? (
            <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 animate-pulse text-center">
              <div className="h-4 bg-surface-elevated rounded w-1/2 mx-auto mb-3" />
              <div className="h-8 bg-surface-elevated rounded w-1/3 mx-auto" />
            </div>
          ) : !isLoggedIn ? (
            /* Logged-Out Prompt */
            <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                <Flame size={24} />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1">
                Track Your Daily Progress
              </h3>
              <p className="text-xs text-text-secondary max-w-xs mb-4 leading-relaxed">
                Sign in to record your practice streaks, review calendar milestones, and monitor your interview preparation cadence.
              </p>
              <button
                type="button"
                onClick={openLogin}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2"
              >
                <span>Sign In to View Activity</span>
              </button>
            </div>
          ) : (
            <>
              {/* Error Alert */}
              {error && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>{error}</p>
                    <button
                      type="button"
                      onClick={fetchCalendarData}
                      className="mt-2 underline font-semibold hover:text-red-300"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Genuine Current Streak Card */}
              <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Flame size={15} className="text-amber-500 fill-amber-500" />
                  <span>Current Streak Status</span>
                </h3>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-extrabold text-text-primary">{streak}</span>
                  <span className="text-xs text-text-secondary">
                    {streak === 1 ? 'Consecutive Day' : 'Consecutive Days'}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-2 leading-relaxed">
                  {streak === 0
                    ? 'Complete a DSA problem, mock interview, or resume review today to begin your streak!'
                    : streakStartDate
                    ? `You've sustained daily interview prep since ${formatDateNice(streakStartDate)}. Keep up the momentum!`
                    : 'Active daily preparation streak. Keep up the momentum!'}
                </p>
              </div>

              {/* Today's Genuine Milestones */}
              <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-emerald-400" />
                  <span>Today's Milestones</span>
                </h3>

                {milestones.length === 0 ? (
                  <div className="text-center py-4 px-2">
                    <p className="text-xs text-text-muted mb-3">
                      No activity recorded today yet.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Link
                        to="/dsa"
                        className="flex items-center justify-center gap-2 p-2 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border text-xs font-semibold text-text-primary transition"
                      >
                        <Code2 size={14} className="text-emerald-400" />
                        <span>Practice DSA Arena</span>
                      </Link>
                      <Link
                        to="/behavioral"
                        className="flex items-center justify-center gap-2 p-2 rounded-xl bg-surface-elevated/60 hover:bg-surface-elevated border border-border text-xs font-semibold text-text-primary transition"
                      >
                        <MessageSquare size={14} className="text-teal-400" />
                        <span>Start Mock Interview</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    {milestones.map((m) => {
                      const Icon =
                        m.type === 'dsa'
                          ? Code2
                          : m.type === 'interview'
                          ? MessageSquare
                          : FileText;
                      const iconColor =
                        m.type === 'dsa'
                          ? 'text-emerald-400'
                          : m.type === 'interview'
                          ? 'text-teal-400'
                          : 'text-sky-400';

                      const isSuccess =
                        m.status === 'Solved' ||
                        m.status === 'Completed' ||
                        m.status === 'Reviewed';

                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-elevated/40 border border-border/40"
                        >
                          <Icon size={15} className={`${iconColor} shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-text-primary truncate font-medium">{m.title}</p>
                            {m.time && (
                              <p className="text-[10px] text-text-secondary/60">{m.time}</p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] font-bold shrink-0 ${
                              isSuccess ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {m.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
