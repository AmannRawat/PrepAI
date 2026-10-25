import { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Flame,
  CheckCircle2,
  Clock,
  Code2,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarPage = () => {
  const { userName } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 9, 25)); // October 2026

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Streak days simulated for October 2026
  const activeStreakDays = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

  return (
    <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full pb-12 animate-fade-in">
      <div className="mb-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
          {/* Month Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold text-text-primary">
              {monthNames[month]} {year}
            </h2>
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
              const isToday = dayNum === 25;
              const hasStreak = activeStreakDays.includes(dayNum);

              return (
                <div
                  key={dayNum}
                  className={`relative flex flex-col items-center justify-center h-11 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isToday
                      ? 'bg-emerald-500 text-white font-bold shadow-[0_0_14px_rgba(16,185,129,0.4)]'
                      : hasStreak
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                      : 'text-text-secondary hover:bg-surface-elevated/70'
                  }`}
                >
                  <span>{dayNum}</span>
                  {hasStreak && !isToday && (
                    <span className="w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule & Focus Sidebar (1 col) */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Flame size={15} className="text-amber-500 fill-amber-500" />
              <span>Current Streak Status</span>
            </h3>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-extrabold text-text-primary">12</span>
              <span className="text-xs text-text-secondary">Consecutive Days</span>
            </div>
            <p className="text-xs text-text-muted mt-2">
              You've sustained daily interview prep since Oct 14th. Keep up the momentum!
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock size={15} className="text-emerald-400" />
              <span>Today's Milestones</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-elevated/40 border border-border/40">
                <Code2 size={15} className="text-emerald-400 shrink-0" />
                <span className="text-text-primary flex-1">DSA Array Optimization</span>
                <span className="text-[10px] text-emerald-400 font-bold">Solved</span>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-elevated/40 border border-border/40">
                <MessageSquare size={15} className="text-teal-400 shrink-0" />
                <span className="text-text-primary flex-1">System Design Mock Session</span>
                <span className="text-[10px] text-teal-400 font-bold">Pending</span>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-elevated/40 border border-border/40">
                <FileText size={15} className="text-sky-400 shrink-0" />
                <span className="text-text-primary flex-1">Resume ATS Target Tuning</span>
                <span className="text-[10px] text-sky-400 font-bold">Pending</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
