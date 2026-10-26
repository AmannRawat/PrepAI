import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Code2,
  MessageSquare,
  FileText,
  BarChart3,
  ArrowRight,
  Flame,
  CheckCircle2,
  Circle,
  Quote,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// 6 Curated short, professional motivational quotes
const MOTIVATIONAL_QUOTES = [
  "Discipline today creates a stronger tomorrow.",
  "Consistency is the code that compiles into excellence.",
  "Every solved problem expands your technical intuition.",
  "Small daily improvements build unstoppable momentum.",
  "Embrace the challenge; mastery is forged in the struggle.",
  "Preparation turns opportunity into inevitable success.",
];

// Progressive typewriter quote card with zero layout shift and reduced-motion support
const TypewriterQuote = () => {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedText(MOTIVATIONAL_QUOTES[quoteIndex]);
      const timer = setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
      }, 7000);
      return () => clearTimeout(timer);
    }

    const currentQuote = MOTIVATIONAL_QUOTES[quoteIndex];
    let timeoutId;

    if (!isDeleting) {
      if (displayedText.length < currentQuote.length) {
        timeoutId = setTimeout(() => {
          setDisplayedText(currentQuote.slice(0, displayedText.length + 1));
        }, 35);
      } else {
        // Pause at completion so quote can be comfortably read
        timeoutId = setTimeout(() => {
          setIsDeleting(true);
        }, 3600);
      }
    } else {
      if (displayedText.length > 0) {
        timeoutId = setTimeout(() => {
          setDisplayedText(currentQuote.slice(0, displayedText.length - 1));
        }, 18);
      } else {
        setIsDeleting(false);
        setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
      }
    }

    return () => clearTimeout(timeoutId);
  }, [displayedText, isDeleting, quoteIndex, prefersReducedMotion]);

  return (
    <div className="mt-4 max-w-xl flex items-start gap-3 min-h-[52px] p-3 rounded-2xl bg-white/75 border border-slate-200/80 shadow-xs dark:bg-transparent dark:border-transparent dark:shadow-none dark:p-0 transition-all">
      <Quote className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5 drop-shadow" />
      <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-white/95 italic leading-relaxed drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
        “{displayedText}”
        {!prefersReducedMotion && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-700 dark:bg-emerald-400 animate-pulse align-middle shadow-sm" />
        )}
      </p>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { userName, userId, getToken, isLoaded, isLoggedIn } = useAuth();
  const { dashboardBg } = useTheme();

  const [progress, setProgress] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // User-scoped Today's Focus Checklist State
  const [userTasks, setUserTasks] = useState(null);

  useEffect(() => {
    if (!isLoggedIn || !userId) {
      setUserTasks(null);
      return;
    }
    try {
      const saved = localStorage.getItem(`prepai_today_focus_${userId}`);
      if (saved) {
        setUserTasks(JSON.parse(saved));
        return;
      }
    } catch {}
    setUserTasks(null);
  }, [isLoggedIn, userId]);

  // Derive focus tasks from real activity if not customized
  const focusTasks = useMemo(() => {
    if (!isLoggedIn) return [];
    if (userTasks && userTasks.length > 0) return userTasks;

    const today = new Date();
    const isToday = (dateStr) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    };

    const solvedToday = Boolean(
      progress?.dsaSubmissions?.some((sub) => isToday(sub.createdAt))
    );
    const interviewedToday = Boolean(
      progress?.chatSessions?.some((sess) => isToday(sess.createdAt))
    );
    const hasReviewedResume = Boolean(
      progress?.resumeReviews && progress.resumeReviews.length > 0
    );

    return [
      {
        id: 'dsa',
        text: 'Solve 2 DSA problems',
        done: solvedToday,
      },
      {
        id: 'mock',
        text: 'Do 1 mock interview',
        done: interviewedToday,
      },
      {
        id: 'resume',
        text: 'Review your resume',
        done: hasReviewedResume,
      },
    ];
  }, [isLoggedIn, userTasks, progress]);

  const toggleTask = (id) => {
    if (!isLoggedIn || !userId) return;
    const updated = focusTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    setUserTasks(updated);
    try {
      localStorage.setItem(`prepai_today_focus_${userId}`, JSON.stringify(updated));
    } catch {}
  };

  // Fetch real user progress data with account isolation and cleanup
  useEffect(() => {
    if (!isLoaded) return;
    if (!isLoggedIn || !userId) {
      setProgress(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const fetchProgress = async () => {
      try {
        const token = await getToken();
        if (!token) {
          if (isMounted) {
            setProgress(null);
            setIsLoading(false);
          }
          return;
        }

        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/user/progress`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (isMounted) {
          setProgress(response.data);
        }
      } catch (err) {
        console.error('Failed to fetch progress', err);
        if (isMounted) {
          setProgress(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProgress();

    return () => {
      isMounted = false;
    };
  }, [getToken, isLoaded, isLoggedIn, userId]);

  // Dynamic time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const [greeting, setGreeting] = useState(getGreeting);

  useEffect(() => {
    const timer = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Quick stats values from real data
  const problemsSolvedCount = useMemo(() => {
    if (!isLoggedIn) return '—';
    if (progress?.dsaStats?.uniqueSolved !== undefined) {
      return progress.dsaStats.uniqueSolved;
    }
    if (progress?.dsaSubmissions?.length) {
      return progress.dsaSubmissions.length;
    }
    return 0;
  }, [progress, isLoggedIn]);

  const mockInterviewsCount = useMemo(() => {
    if (!isLoggedIn) return '—';
    if (progress?.chatSessions?.length) {
      return progress.chatSessions.length;
    }
    return 0;
  }, [progress, isLoggedIn]);

  const resumeScoreVal = useMemo(() => {
    if (!isLoggedIn) return '—';
    const latestReview = progress?.resumeReviews?.[0];
    if (latestReview?.atsAssessment?.estimatedScore) {
      return `${latestReview.atsAssessment.estimatedScore} / 100`;
    }
    return 'Not reviewed';
  }, [progress, isLoggedIn]);

  const streakDaysVal = useMemo(() => {
    if (!isLoggedIn) return '—';
    if (progress?.currentStreak !== undefined) {
      return `${progress.currentStreak} days`;
    }
    return '0 days';
  }, [progress, isLoggedIn]);

  // Real trend calculations (only when valid comparison data exists)
  const problemsSolvedTrend = useMemo(() => {
    if (!isLoggedIn || !progress?.dsaSubmissions?.length) return null;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recent = progress.dsaSubmissions.filter(
      (s) => s.createdAt && now - new Date(s.createdAt).getTime() <= sevenDaysMs
    ).length;
    const previous = progress.dsaSubmissions.filter((s) => {
      if (!s.createdAt) return false;
      const diff = now - new Date(s.createdAt).getTime();
      return diff > sevenDaysMs && diff <= sevenDaysMs * 2;
    }).length;

    if (previous > 0) {
      const change = Math.round(((recent - previous) / previous) * 100);
      return change >= 0 ? `+${change}%` : `${change}%`;
    }
    return null;
  }, [isLoggedIn, progress]);

  const mockInterviewsTrend = useMemo(() => {
    if (!isLoggedIn || !progress?.chatSessions?.length) return null;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recent = progress.chatSessions.filter(
      (s) => s.createdAt && now - new Date(s.createdAt).getTime() <= sevenDaysMs
    ).length;
    const previous = progress.chatSessions.filter((s) => {
      if (!s.createdAt) return false;
      const diff = now - new Date(s.createdAt).getTime();
      return diff > sevenDaysMs && diff <= sevenDaysMs * 2;
    }).length;

    if (previous > 0) {
      const change = Math.round(((recent - previous) / previous) * 100);
      return change >= 0 ? `+${change}%` : `${change}%`;
    }
    return null;
  }, [isLoggedIn, progress]);

  const resumeScoreTrend = useMemo(() => {
    if (!isLoggedIn || !progress?.resumeReviews || progress.resumeReviews.length < 2) return null;
    const latest = progress.resumeReviews[0]?.atsAssessment?.estimatedScore;
    const prev = progress.resumeReviews[1]?.atsAssessment?.estimatedScore;
    if (typeof latest === 'number' && typeof prev === 'number' && prev > 0) {
      const diff = latest - prev;
      return diff >= 0 ? `+${diff} pts` : `${diff} pts`;
    }
    return null;
  }, [isLoggedIn, progress]);

  const streakTrend = useMemo(() => {
    if (!isLoggedIn || !progress?.currentStreak) return null;
    return progress.currentStreak > 0 ? 'Active streak' : null;
  }, [isLoggedIn, progress]);

  // Mini-calendar state for dashboard
  const [calendarDate, setCalendarDate] = useState(() => new Date(2026, 9, 25)); // October 2026
  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const monthName = calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDayOffset = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInCurrentMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  // Highlight dates ONLY when backed by actual activity records for authenticated users
  const activeStreakDates = useMemo(() => {
    if (!isLoggedIn || !progress) return [];

    const activeDays = new Set();

    if (Array.isArray(progress.dsaSubmissions)) {
      progress.dsaSubmissions.forEach((sub) => {
        if (!sub?.createdAt) return;
        const d = new Date(sub.createdAt);
        if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
          activeDays.add(d.getDate());
        }
      });
    }

    if (Array.isArray(progress.chatSessions)) {
      progress.chatSessions.forEach((sess) => {
        if (!sess?.createdAt) return;
        const d = new Date(sess.createdAt);
        if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
          activeDays.add(d.getDate());
        }
      });
    }

    if (Array.isArray(progress.resumeReviews)) {
      progress.resumeReviews.forEach((rev) => {
        if (!rev?.createdAt) return;
        const d = new Date(rev.createdAt);
        if (d.getFullYear() === calendarYear && d.getMonth() === calendarMonth) {
          activeDays.add(d.getDate());
        }
      });
    }

    return Array.from(activeDays);
  }, [isLoggedIn, progress, calendarYear, calendarMonth]);

  const today = new Date();
  const isCurrentCalendarMonth =
    today.getFullYear() === calendarYear && today.getMonth() === calendarMonth;
  const currentDay = isCurrentCalendarMonth ? today.getDate() : -1;

  return (
    <div className="flex flex-col flex-1 w-full pb-12 animate-fade-in">
      {/* Hero Content Section floating over shared background layer */}
      <div className="relative w-full overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-6 sm:pt-8 pb-10 sm:pb-14">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            {/* Greeting & Headline */}
            <div className={`w-full ${isLoggedIn ? 'max-w-xl' : 'max-w-2xl'} p-6 sm:p-7 rounded-3xl bg-white/80 backdrop-blur-md border border-slate-200/90 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:bg-transparent dark:backdrop-blur-none dark:border-transparent dark:shadow-none dark:p-0 transition-all`}>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 block mb-1 tracking-wide drop-shadow-sm">
                {greeting},
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight drop-shadow-sm dark:drop-shadow-md">
                {!isLoaded ? (
                  <span className="inline-block w-48 h-10 bg-slate-200 dark:bg-white/10 rounded-xl animate-pulse align-middle" />
                ) : isLoggedIn && userName ? (
                  <>
                    {userName} <span className="inline-block animate-bounce">👋</span>
                  </>
                ) : isLoggedIn ? (
                  <>
                    Welcome back <span className="inline-block animate-bounce">👋</span>
                  </>
                ) : (
                  <>
                    Welcome to PrepAI <span className="inline-block animate-bounce">👋</span>
                  </>
                )}
              </h1>
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 mt-2 font-medium leading-relaxed drop-shadow-sm">
                Keep building. Your next opportunity is closer than you think.
              </p>

              {/* Motivational Quote directly over landscape */}
              <TypewriterQuote />
            </div>

            {/* Today's Focus Checklist Card - Authenticated Users Only */}
            {isLoggedIn && (
              <div className="w-full lg:w-80 p-5 rounded-2xl bg-white/95 dark:bg-surface/70 backdrop-blur-md border border-slate-200/90 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] dark:shadow-2xl shrink-0">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/10 pb-2.5 mb-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>Today's Focus</span>
                  </h3>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">
                    {focusTasks.filter((t) => t.done).length} / {focusTasks.length} Completed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {focusTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className="flex items-center gap-2.5 w-full text-left text-xs transition group cursor-pointer"
                    >
                      {task.done ? (
                        <CheckCircle2 size={16} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-slate-400 dark:text-slate-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 shrink-0" />
                      )}
                      <span
                        className={`leading-snug font-medium ${
                          task.done
                            ? 'text-slate-400 dark:text-slate-200 line-through opacity-85'
                            : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-950 dark:group-hover:text-white'
                        }`}
                      >
                        {task.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: Feature Cards, Quick Stats, Calendar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 w-full space-y-6 relative z-10">
        {/* 4 Feature Action Cards with genuine glass hover effect matching reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: DSA ARENA */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/dsa-arena')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/dsa-arena')}
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white/95 dark:bg-[#0e1319]/85 backdrop-blur-md dark:backdrop-blur-xl border border-slate-200/90 dark:border-white/10 hover:bg-emerald-50/70 dark:hover:bg-[#06241a]/25 hover:border-emerald-500/50 dark:hover:border-emerald-400/50 hover:shadow-[0_12px_28px_-6px_rgba(5,150,105,0.18)] dark:hover:shadow-[0_0_28px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-emerald-400 transition-all duration-200 ease-out cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-lg overflow-hidden"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-3.5 group-hover:scale-105 group-hover:bg-emerald-500/20 dark:group-hover:bg-emerald-500/25 group-hover:border-emerald-500/50 dark:group-hover:border-emerald-400/60 group-focus-visible:scale-105 transition-all duration-200">
                <Code2 size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                DSA Arena
              </h3>
              <p className="text-xs text-slate-600 dark:text-text-secondary mt-1 font-normal leading-relaxed">
                Solve AI-generated coding problems with immediate feedback.
              </p>
            </div>
            {/* CTA Button Capsule */}
            <div className="mt-5 p-1 pl-3.5 pr-1.5 rounded-full bg-emerald-50 dark:bg-[#0a1216] border border-emerald-600/25 dark:border-emerald-500/20 group-hover:border-emerald-600/50 dark:group-hover:border-emerald-400/50 group-hover:bg-emerald-100 dark:group-hover:bg-[#07241c] transition-all duration-200 flex items-center justify-between shadow-xs dark:shadow-sm relative z-10">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 transition-colors">
                Start Practicing
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-200/80 dark:bg-[#0e2d24] text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 group-hover:text-white dark:group-hover:text-slate-950 group-hover:border-transparent group-hover:shadow-[0_0_10px_rgba(5,150,105,0.3)] dark:group-hover:shadow-[0_0_12px_rgba(16,185,129,0.5)] group-hover:translate-x-0.5 transition-all duration-200 shrink-0">
                <ArrowRight size={13} className="stroke-[2.5]" />
              </div>
            </div>
          </div>

          {/* CARD 2: BEHAVIORAL COACH */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/behavioral-coach')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/behavioral-coach')}
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white/95 dark:bg-[#0e1319]/85 backdrop-blur-md dark:backdrop-blur-xl border border-slate-200/90 dark:border-white/10 hover:bg-emerald-50/70 dark:hover:bg-[#06241a]/25 hover:border-emerald-500/50 dark:hover:border-emerald-400/50 hover:shadow-[0_12px_28px_-6px_rgba(5,150,105,0.18)] dark:hover:shadow-[0_0_28px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-emerald-400 transition-all duration-200 ease-out cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-lg overflow-hidden"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-cyan-500/15 border border-sky-500/25 dark:border-cyan-500/30 text-sky-700 dark:text-cyan-400 flex items-center justify-center mb-3.5 group-hover:scale-105 group-hover:bg-sky-500/20 dark:group-hover:bg-cyan-500/25 group-hover:border-sky-500/50 dark:group-hover:border-cyan-400/60 group-focus-visible:scale-105 transition-all duration-200">
                <MessageSquare size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Behavioral Coach
              </h3>
              <p className="text-xs text-slate-600 dark:text-text-secondary mt-1 font-normal leading-relaxed">
                Practice mock interviews with AI interviewer & live voice recognition.
              </p>
            </div>
            {/* CTA Button Capsule */}
            <div className="mt-5 p-1 pl-3.5 pr-1.5 rounded-full bg-emerald-50 dark:bg-[#0a1216] border border-emerald-600/25 dark:border-emerald-500/20 group-hover:border-emerald-600/50 dark:group-hover:border-emerald-400/50 group-hover:bg-emerald-100 dark:group-hover:bg-[#07241c] transition-all duration-200 flex items-center justify-between shadow-xs dark:shadow-sm relative z-10">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 transition-colors">
                Start Interview
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-200/80 dark:bg-[#0e2d24] text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 group-hover:text-white dark:group-hover:text-slate-950 group-hover:border-transparent group-hover:shadow-[0_0_10px_rgba(5,150,105,0.3)] dark:group-hover:shadow-[0_0_12px_rgba(16,185,129,0.5)] group-hover:translate-x-0.5 transition-all duration-200 shrink-0">
                <ArrowRight size={13} className="stroke-[2.5]" />
              </div>
            </div>
          </div>

          {/* CARD 3: RESUME REVIEWER */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/resume-reviewer')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/resume-reviewer')}
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white/95 dark:bg-[#0e1319]/85 backdrop-blur-md dark:backdrop-blur-xl border border-slate-200/90 dark:border-white/10 hover:bg-emerald-50/70 dark:hover:bg-[#06241a]/25 hover:border-emerald-500/50 dark:hover:border-emerald-400/50 hover:shadow-[0_12px_28px_-6px_rgba(5,150,105,0.18)] dark:hover:shadow-[0_0_28px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-emerald-400 transition-all duration-200 ease-out cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-lg overflow-hidden"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-cyan-500/15 border border-sky-500/25 dark:border-cyan-500/30 text-sky-700 dark:text-cyan-400 flex items-center justify-center mb-3.5 group-hover:scale-105 group-hover:bg-sky-500/20 dark:group-hover:bg-cyan-500/25 group-hover:border-sky-500/50 dark:group-hover:border-cyan-400/60 group-focus-visible:scale-105 transition-all duration-200">
                <FileText size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Resume Reviewer
              </h3>
              <p className="text-xs text-slate-600 dark:text-text-secondary mt-1 font-normal leading-relaxed">
                Get ATS-friendly feedback, gap analysis, and tailored rewrites.
              </p>
            </div>
            {/* CTA Button Capsule */}
            <div className="mt-5 p-1 pl-3.5 pr-1.5 rounded-full bg-emerald-50 dark:bg-[#0a1216] border border-emerald-600/25 dark:border-emerald-500/20 group-hover:border-emerald-600/50 dark:group-hover:border-emerald-400/50 group-hover:bg-emerald-100 dark:group-hover:bg-[#07241c] transition-all duration-200 flex items-center justify-between shadow-xs dark:shadow-sm relative z-10">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 transition-colors">
                Review Resume
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-200/80 dark:bg-[#0e2d24] text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 group-hover:text-white dark:group-hover:text-slate-950 group-hover:border-transparent group-hover:shadow-[0_0_10px_rgba(5,150,105,0.3)] dark:group-hover:shadow-[0_0_12px_rgba(16,185,129,0.5)] group-hover:translate-x-0.5 transition-all duration-200 shrink-0">
                <ArrowRight size={13} className="stroke-[2.5]" />
              </div>
            </div>
          </div>

          {/* CARD 4: PROGRESS & ANALYTICS */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/progress')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/progress')}
            className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white/95 dark:bg-[#0e1319]/85 backdrop-blur-md dark:backdrop-blur-xl border border-slate-200/90 dark:border-white/10 hover:bg-emerald-50/70 dark:hover:bg-[#06241a]/25 hover:border-emerald-500/50 dark:hover:border-emerald-400/50 hover:shadow-[0_12px_28px_-6px_rgba(5,150,105,0.18)] dark:hover:shadow-[0_0_28px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:-translate-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-emerald-400 transition-all duration-200 ease-out cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-lg overflow-hidden"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-cyan-500/15 border border-sky-500/25 dark:border-cyan-500/30 text-sky-700 dark:text-cyan-400 flex items-center justify-center mb-3.5 group-hover:scale-105 group-hover:bg-sky-500/20 dark:group-hover:bg-cyan-500/25 group-hover:border-sky-500/50 dark:group-hover:border-cyan-400/60 group-focus-visible:scale-105 transition-all duration-200">
                <BarChart3 size={20} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Progress & Analytics
              </h3>
              <p className="text-xs text-slate-600 dark:text-text-secondary mt-1 font-normal leading-relaxed">
                Track your performance, topic accuracy, and consistency trends.
              </p>
            </div>
            {/* CTA Button Capsule */}
            <div className="mt-5 p-1 pl-3.5 pr-1.5 rounded-full bg-emerald-50 dark:bg-[#0a1216] border border-emerald-600/25 dark:border-emerald-500/20 group-hover:border-emerald-600/50 dark:group-hover:border-emerald-400/50 group-hover:bg-emerald-100 dark:group-hover:bg-[#07241c] transition-all duration-200 flex items-center justify-between shadow-xs dark:shadow-sm relative z-10">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 transition-colors">
                View Analytics
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-200/80 dark:bg-[#0e2d24] text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30 flex items-center justify-center group-hover:bg-emerald-600 dark:group-hover:bg-emerald-400 group-hover:text-white dark:group-hover:text-slate-950 group-hover:border-transparent group-hover:shadow-[0_0_10px_rgba(5,150,105,0.3)] dark:group-hover:shadow-[0_0_12px_rgba(16,185,129,0.5)] group-hover:translate-x-0.5 transition-all duration-200 shrink-0">
                <ArrowRight size={13} className="stroke-[2.5]" />
              </div>
            </div>
          </div>
        </div>

      {/* Bottom Section: Quick Stats (Left 3 cols) & Calendar Widget (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Stats Grid */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-text-primary tracking-tight">
              Quick Stats
            </h2>
            <span className="text-[11px] text-slate-600 dark:text-text-secondary font-medium">
              Real-time activity telemetry
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            {/* Stat 1: Problems Solved */}
            <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#0e1319]/80 backdrop-blur-md border border-slate-200/90 dark:border-white/5 flex flex-col justify-between hover:border-emerald-500/50 dark:hover:border-emerald-500/30 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs">
              <div>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-2.5">
                  <Code2 size={16} />
                </div>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white block tracking-tight">
                  {!isLoaded ? (
                    <span className="inline-block w-10 h-7 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    problemsSolvedCount
                  )}
                </span>
                <span className="text-xs text-slate-600 dark:text-text-secondary font-medium block mt-0.5">
                  Problems Solved
                </span>
              </div>
              {!isLoggedIn ? (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400 transition cursor-pointer"
                    title="Sign in to track your progress"
                  >
                    <Lock size={11} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Sign in to track</span>
                  </button>
                  <svg className="w-14 h-4 overflow-visible opacity-25" viewBox="0 0 60 18" fill="none">
                    <path d="M2 9 L58 9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  {problemsSolvedTrend ? (
                    <span className="inline-flex items-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <TrendingUp size={11} className="mr-0.5" /> {problemsSolvedTrend}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] text-slate-600 dark:text-text-secondary font-medium">
                      {problemsSolvedCount > 0 ? 'Recorded' : 'No activity yet'}
                    </span>
                  )}
                  <svg className="w-14 h-4 overflow-visible" viewBox="0 0 60 18" fill="none">
                    <path d="M2 15 C 16 15, 24 11, 36 9 C 46 7, 52 3, 58 2" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="58" cy="2" r="2" fill="#10b981" />
                  </svg>
                </div>
              )}
            </div>

            {/* Stat 2: Mock Interviews */}
            <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#0e1319]/80 backdrop-blur-md border border-slate-200/90 dark:border-white/5 flex flex-col justify-between hover:border-blue-500/50 dark:hover:border-blue-500/30 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs">
              <div>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/25 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 flex items-center justify-center mb-2.5">
                  <MessageSquare size={16} />
                </div>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white block tracking-tight">
                  {!isLoaded ? (
                    <span className="inline-block w-10 h-7 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    mockInterviewsCount
                  )}
                </span>
                <span className="text-xs text-slate-600 dark:text-text-secondary font-medium block mt-0.5">
                  Mock Interviews
                </span>
              </div>
              {!isLoggedIn ? (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-400 transition cursor-pointer"
                    title="Sign in to track your progress"
                  >
                    <Lock size={11} className="text-blue-700 dark:text-blue-400 shrink-0" />
                    <span>Sign in to track</span>
                  </button>
                  <svg className="w-14 h-4 overflow-visible opacity-25" viewBox="0 0 60 18" fill="none">
                    <path d="M2 9 L58 9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  {mockInterviewsTrend ? (
                    <span className="inline-flex items-center text-xs font-bold text-blue-700 dark:text-blue-400">
                      <TrendingUp size={11} className="mr-0.5" /> {mockInterviewsTrend}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] text-slate-600 dark:text-text-secondary font-medium">
                      {mockInterviewsCount > 0 ? 'Recorded' : 'No interviews yet'}
                    </span>
                  )}
                  <svg className="w-14 h-4 overflow-visible" viewBox="0 0 60 18" fill="none">
                    <path d="M2 14 C 16 15, 26 13, 36 9 C 46 6, 52 4, 58 3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="58" cy="3" r="2" fill="#3b82f6" />
                  </svg>
                </div>
              )}
            </div>

            {/* Stat 3: Resume Score */}
            <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#0e1319]/80 backdrop-blur-md border border-slate-200/90 dark:border-white/5 flex flex-col justify-between hover:border-amber-500/50 dark:hover:border-amber-500/30 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs">
              <div>
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center mb-2.5">
                  <FileText size={16} />
                </div>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white block truncate tracking-tight">
                  {!isLoaded ? (
                    <span className="inline-block w-16 h-7 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    resumeScoreVal
                  )}
                </span>
                <span className="text-xs text-slate-600 dark:text-text-secondary font-medium block mt-0.5">
                  Resume Score
                </span>
              </div>
              {!isLoggedIn ? (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-amber-700 dark:text-slate-400 dark:hover:text-amber-400 transition cursor-pointer"
                    title="Sign in to track your progress"
                  >
                    <Lock size={11} className="text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Sign in to track</span>
                  </button>
                  <svg className="w-14 h-4 overflow-visible opacity-25" viewBox="0 0 60 18" fill="none">
                    <path d="M2 9 L58 9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  {resumeScoreTrend ? (
                    <span className="inline-flex items-center text-xs font-bold text-amber-700 dark:text-amber-400">
                      <TrendingUp size={11} className="mr-0.5" /> {resumeScoreTrend}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] text-slate-600 dark:text-text-secondary font-medium">
                      {progress?.resumeReviews?.length ? 'Latest review' : 'Not reviewed'}
                    </span>
                  )}
                  <svg className="w-14 h-4 overflow-visible" viewBox="0 0 60 18" fill="none">
                    <path d="M2 15 C 16 15, 26 12, 36 9 C 46 7, 52 3, 58 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="58" cy="2" r="2" fill="#f59e0b" />
                  </svg>
                </div>
              )}
            </div>

            {/* Stat 4: Current Streak */}
            <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#0e1319]/80 backdrop-blur-md border border-slate-200/90 dark:border-white/5 flex flex-col justify-between hover:border-orange-500/50 dark:hover:border-orange-500/30 transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs">
              <div>
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/25 dark:border-orange-500/30 text-orange-700 dark:text-orange-400 flex items-center justify-center mb-2.5">
                  <Flame size={16} className="fill-orange-500 dark:fill-orange-400" />
                </div>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white block tracking-tight">
                  {!isLoaded ? (
                    <span className="inline-block w-12 h-7 bg-slate-200 dark:bg-white/10 rounded animate-pulse" />
                  ) : (
                    streakDaysVal
                  )}
                </span>
                <span className="text-xs text-slate-600 dark:text-text-secondary font-medium block mt-0.5">
                  Current Streak
                </span>
              </div>
              {!isLoggedIn ? (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-orange-700 dark:text-slate-400 dark:hover:text-orange-400 transition cursor-pointer"
                    title="Sign in to track your progress"
                  >
                    <Lock size={11} className="text-orange-700 dark:text-orange-400 shrink-0" />
                    <span>Sign in to track</span>
                  </button>
                  <svg className="w-14 h-4 overflow-visible opacity-25" viewBox="0 0 60 18" fill="none">
                    <path d="M2 9 L58 9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200/80 dark:border-white/5">
                  {streakTrend ? (
                    <span className="inline-flex items-center text-xs font-bold text-orange-700 dark:text-orange-400">
                      <Flame size={11} className="mr-0.5 fill-orange-500 dark:fill-orange-400" /> {streakTrend}
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] text-slate-600 dark:text-text-secondary font-medium">
                      {progress?.currentStreak ? `${progress.currentStreak} day streak` : '0 days recorded'}
                    </span>
                  )}
                  <svg className="w-14 h-4 overflow-visible" viewBox="0 0 60 18" fill="none">
                    <path d="M2 14 C 16 15, 26 11, 36 9 C 46 6, 52 3, 58 2" stroke="#f97316" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="58" cy="2" r="2" fill="#f97316" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Calendar Widget matching reference mockup */}
        <div className="p-4 rounded-2xl bg-white/95 dark:bg-[#0e1319]/80 backdrop-blur-md border border-slate-200/90 dark:border-white/5 flex flex-col justify-between shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-white/5 pb-2 mb-2">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900 dark:text-text-primary">
                {monthName}
              </span>
              {!isLoggedIn && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">
                  Sign in to track your activity
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-slate-600 dark:text-text-secondary">
              <button
                type="button"
                onClick={() => setCalendarDate(new Date(calendarYear, calendarMonth - 1, 1))}
                className="p-1 rounded hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-surface-hover dark:hover:text-text-primary transition cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(new Date(calendarYear, calendarMonth + 1, 1))}
                className="p-1 rounded hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-surface-hover dark:hover:text-text-primary transition cursor-pointer"
                title="Next month"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-600 dark:text-text-secondary mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
              <span key={idx}>{day}</span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <span key={`blank-${i}`} className="h-6" />
            ))}

            {Array.from({ length: daysInCurrentMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === currentDay;
              const isStreak = activeStreakDates.includes(day);

              return (
                <div
                  key={day}
                  onClick={() => navigate('/calendar')}
                  className={`h-6 flex items-center justify-center rounded-full font-medium cursor-pointer transition ${
                    isToday
                      ? 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 font-bold shadow-[0_0_10px_rgba(16,185,129,0.3)] dark:shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                      : isStreak
                      ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 font-bold'
                      : 'text-slate-800 dark:text-text-secondary/70 hover:bg-slate-100 dark:hover:bg-surface-hover/70 font-semibold hover:text-slate-900 dark:hover:text-text-primary'
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Dashboard;