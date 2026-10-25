import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  getCustomBackground,
  saveCustomBackground,
  deleteCustomBackground,
} from '../utils/backgroundStorage';

export const BUILT_IN_BACKGROUNDS = [
  {
    id: 'alpine-sunset',
    name: 'Alpine Sunset',
    path: '/backgrounds/bg-mountain-night.jpg',
    description: 'Cinematic mountain peaks, warm sunset and lake reflections',
    tag: 'Default',
  },
  {
    id: 'emerald-forest',
    name: 'Emerald Forest',
    path: '/backgrounds/bg-misty-forest.jpg',
    description: 'Dark evergreen forest, mist and subtle green valley tones',
    tag: 'Atmospheric',
  },
  {
    id: 'midnight-peaks',
    name: 'Midnight Peaks',
    path: '/backgrounds/bg-twilight-peaks.jpg',
    description: 'Starlit alpine silhouettes under a deep indigo night sky',
    tag: 'Celestial',
  },
  {
    id: 'matte-obsidian',
    name: 'Matte Obsidian',
    path: '/backgrounds/bg-matte-obsidian.jpg',
    description: 'Premium brushed-titanium with carbon fiber weave and emerald rim lighting',
    tag: 'Minimal',
  },
  {
    id: 'aurora-night',
    name: 'Aurora Night',
    path: '/backgrounds/bg-aurora-night.jpg',
    description: 'Dark mountain peaks under glowing green and teal northern lights',
    tag: 'Vibrant',
  },
  {
    id: 'twilight-lake',
    name: 'Twilight Lake',
    path: '/backgrounds/bg-sunset-dusk.jpg',
    description: 'Cinematic blue-grey twilight glow across quiet mountain waters',
    tag: 'Calm',
  },
  {
    id: 'dark-abstract',
    name: 'Dark Abstract',
    path: '/backgrounds/bg-dark-abstract.jpg',
    description: 'Minimal charcoal obsidian geometric planes with soft emerald refractions',
    tag: 'Modern',
  },
  {
    id: 'golden-horizon',
    name: 'Golden Horizon',
    path: '/backgrounds/bg-golden-horizon.jpg',
    description: 'Rugged dark landscape with a warm golden amber sunset horizon',
    tag: 'Dramatic',
  },
];

const DEFAULT_BG = BUILT_IN_BACKGROUNDS[0];

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Theme state: dark or light
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') return 'light';
    return 'dark'; // Dark is default developer aesthetic
  });

  // Track the active background ID (built-in ID or 'custom')
  const [dashboardBgId, setDashboardBgId] = useState(() => {
    return localStorage.getItem('prepai_dashboard_bg_id') || 'alpine-sunset';
  });

  // Active background URL string (either a built-in static path or a blob object URL)
  const [dashboardBg, setDashboardBgState] = useState(() => {
    const savedId = localStorage.getItem('prepai_dashboard_bg_id');
    if (savedId && savedId !== 'custom') {
      const match = BUILT_IN_BACKGROUNDS.find((b) => b.id === savedId);
      if (match) return match.path;
    }
    const legacyPath = localStorage.getItem('dashboardBg');
    if (legacyPath && !legacyPath.startsWith('blob:')) {
      return legacyPath;
    }
    return DEFAULT_BG.path;
  });

  // Custom background metadata & availability
  const [hasCustomBg, setHasCustomBg] = useState(false);
  const [customBgMeta, setCustomBgMeta] = useState(null);
  const [isBgLoading, setIsBgLoading] = useState(true);

  // Keep track of active object URL to prevent memory leaks
  const activeObjectUrlRef = useRef(null);

  // Sync theme class to document root
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark', 'vintage', 'night');
    root.classList.add(theme);
    if (theme === 'dark') {
      root.classList.add('night'); // backward compatibility
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Load custom background from IndexedDB on initial mount
  useEffect(() => {
    let isCancelled = false;

    const initBackground = async () => {
      try {
        const stored = await getCustomBackground();
        if (isCancelled) return;

        if (stored && stored.blob) {
          setHasCustomBg(true);
          setCustomBgMeta(stored.metadata);

          // If the user previously selected the custom background, activate it
          if (dashboardBgId === 'custom') {
            const url = URL.createObjectURL(stored.blob);
            if (activeObjectUrlRef.current) {
              URL.revokeObjectURL(activeObjectUrlRef.current);
            }
            activeObjectUrlRef.current = url;
            setDashboardBgState(url);
          }
        } else {
          setHasCustomBg(false);
          setCustomBgMeta(null);

          // If user had custom selected but storage is empty, fallback to default
          if (dashboardBgId === 'custom') {
            setDashboardBgId(DEFAULT_BG.id);
            setDashboardBgState(DEFAULT_BG.path);
            localStorage.setItem('prepai_dashboard_bg_id', DEFAULT_BG.id);
            localStorage.setItem('dashboardBg', DEFAULT_BG.path);
          }
        }
      } catch (err) {
        console.warn('Failed to inspect IndexedDB custom background:', err);
      } finally {
        if (!isCancelled) {
          setIsBgLoading(false);
        }
      }
    };

    initBackground();

    return () => {
      isCancelled = true;
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  // Select a built-in background
  const selectBuiltInBg = useCallback((bgIdOrPath) => {
    const match = BUILT_IN_BACKGROUNDS.find(
      (b) => b.id === bgIdOrPath || b.path === bgIdOrPath
    ) || DEFAULT_BG;

    // Revoke any active custom blob object URL
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }

    setDashboardBgId(match.id);
    setDashboardBgState(match.path);
    localStorage.setItem('prepai_dashboard_bg_id', match.id);
    localStorage.setItem('dashboardBg', match.path);
  }, []);

  // Save and activate a newly uploaded custom background image
  const applyCustomBg = useCallback(async (blob, metadata = {}) => {
    try {
      const stored = await saveCustomBackground(blob, metadata);

      // Create new blob object URL
      const newUrl = URL.createObjectURL(blob);

      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }
      activeObjectUrlRef.current = newUrl;

      setHasCustomBg(true);
      setCustomBgMeta(stored);
      setDashboardBgId('custom');
      setDashboardBgState(newUrl);

      localStorage.setItem('prepai_dashboard_bg_id', 'custom');
      // Do NOT store blob URL or base64 in localStorage
      localStorage.setItem('dashboardBg', 'custom');

      return stored;
    } catch (err) {
      console.error('Failed to apply custom background:', err);
      throw err;
    }
  }, []);

  // Switch back to an existing custom background if already in IndexedDB
  const selectExistingCustomBg = useCallback(async () => {
    try {
      const stored = await getCustomBackground();
      if (stored && stored.blob) {
        const newUrl = URL.createObjectURL(stored.blob);

        if (activeObjectUrlRef.current) {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        }
        activeObjectUrlRef.current = newUrl;

        setDashboardBgId('custom');
        setDashboardBgState(newUrl);
        setHasCustomBg(true);
        setCustomBgMeta(stored.metadata);
        localStorage.setItem('prepai_dashboard_bg_id', 'custom');
        localStorage.setItem('dashboardBg', 'custom');
      }
    } catch (err) {
      console.error('Failed to switch to existing custom background:', err);
    }
  }, []);

  // Remove the custom background from IndexedDB and revert to default
  const removeCustomBg = useCallback(async () => {
    try {
      await deleteCustomBackground();

      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }

      setHasCustomBg(false);
      setCustomBgMeta(null);

      // Revert to default built-in background
      selectBuiltInBg(DEFAULT_BG.id);
    } catch (err) {
      console.error('Failed to remove custom background:', err);
      throw err;
    }
  }, [selectBuiltInBg]);

  // Backward compatible setter for legacy calls
  const setDashboardBg = useCallback(
    (val) => {
      if (val === 'custom') {
        selectExistingCustomBg();
      } else {
        selectBuiltInBg(val);
      }
    },
    [selectBuiltInBg, selectExistingCustomBg]
  );

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        dashboardBg,
        dashboardBgId,
        selectBuiltInBg,
        applyCustomBg,
        selectExistingCustomBg,
        removeCustomBg,
        hasCustomBg,
        customBgMeta,
        isBgLoading,
        builtInBackgrounds: BUILT_IN_BACKGROUNDS,
        setDashboardBg,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);