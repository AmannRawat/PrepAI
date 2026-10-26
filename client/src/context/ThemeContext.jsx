import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import {
  getCustomBackground,
  saveCustomBackground,
  deleteCustomBackground,
} from '../utils/backgroundStorage';

export const BUILT_IN_BACKGROUNDS = [
  {
    id: 'morning-lake',
    name: 'Morning Lake',
    path: '/backgrounds/bg-lake-morning.jpg',
    url: '/backgrounds/bg-lake-morning.jpg',
    description: 'Serene alpine lake with tranquil mountain reflections at sunrise',
    tag: 'Default',
  },
  {
    id: 'aurora-night',
    name: 'Aurora Night',
    path: '/backgrounds/bg-aurora-night.jpg',
    url: '/backgrounds/bg-aurora-night.jpg',
    description: 'Vibrant emerald northern lights dancing over dramatic mountain ridges',
    tag: 'Vibrant',
  },
  {
    id: 'snow-peak',
    name: 'Snow Peak',
    path: '/backgrounds/bg-snow-peak.jpg',
    url: '/backgrounds/bg-snow-peak.jpg',
    description: 'Majestic snow-capped summits bathed in crisp alpine daylight',
    tag: 'Alpine',
  },
  {
    id: 'misty-forest',
    name: 'Misty Forest',
    path: '/backgrounds/bg-misty-forest.png',
    url: '/backgrounds/bg-misty-forest.png',
    description: 'Atmospheric evergreen pines draped in soft morning fog and mist',
    tag: 'Nature',
  },
  {
    id: 'moon-shine',
    name: 'Moonlight Serenade',
    path: '/backgrounds/bg-moon-shine.jpg',
    url: '/backgrounds/bg-moon-shine.jpg',
    description: 'Silvery celestial full moon illuminating a peaceful mountain vista',
    tag: 'Celestial',
  },
  {
    id: 'dreamy-horizon',
    name: 'Dreamy Horizon',
    path: '/backgrounds/bg-dreamy.jpg',
    url: '/backgrounds/bg-dreamy.jpg',
    description: 'Ethereal pastel clouds and glowing twilight sky with soft warm gradients',
    tag: 'Atmospheric',
  },
  {
    id: 'cosmic-nebula',
    name: 'Cosmic Nebula',
    path: '/backgrounds/bg-nebula.jpg',
    url: '/backgrounds/bg-nebula.jpg',
    description: 'Deep space interstellar nebula sparkling with distant star clusters',
    tag: 'Cosmic',
  },
  {
    id: 'dark-abstract',
    name: 'Dark Abstract',
    path: '/backgrounds/bg-dark-abstract.jpg',
    url: '/backgrounds/bg-dark-abstract.jpg',
    description: 'Sleek minimalist obsidian geometry accented by subtle neon reflections',
    tag: 'Minimal',
  },
];

const DEFAULT_BG = BUILT_IN_BACKGROUNDS[0];

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Clerk authentication state
  const clerkAuth = useClerkAuth();
  const authLoaded = clerkAuth?.isLoaded ?? true;
  const isSignedIn = clerkAuth?.isSignedIn ?? false;
  const clerkUserId = clerkAuth?.userId ?? null;

  // Active identity scope: 'guest' | clerkUserId
  // When authentication is still resolving (authLoaded === false), we prevent flashing previous accounts
  const activeScope = (authLoaded && isSignedIn && clerkUserId) ? clerkUserId : 'guest';
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;

  // Theme state: dark or light (device/browser visual preference)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') return 'light';
    return 'dark'; // Dark is default developer aesthetic
  });

  // Track the active background ID (built-in ID or 'custom') for active scope
  const [dashboardBgId, setDashboardBgId] = useState(DEFAULT_BG.id);

  // Active background URL string (either a built-in static path or a blob object URL)
  const [dashboardBg, setDashboardBgState] = useState(DEFAULT_BG.path);

  // Custom background metadata & availability for active scope
  const [hasCustomBg, setHasCustomBg] = useState(false);
  const [customBgMeta, setCustomBgMeta] = useState(null);
  const [isBgLoading, setIsBgLoading] = useState(true);

  // Keep track of active object URL to prevent memory leaks and identity leakage
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

  // Account-scoped background loader and identity switch handler
  useEffect(() => {
    if (!authLoaded) {
      // Waiting for Clerk to finish determining authentication.
      // Do not reveal or flash any previous account's wallpaper.
      setIsBgLoading(true);
      return;
    }

    let isCancelled = false;
    const scope = activeScope;

    const loadScopeBackground = async () => {
      setIsBgLoading(true);

      // Clean up previous blob URL to prevent memory leaks and identity leakage
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }

      // 1. Retrieve account-scoped saved ID
      const accountKey = `prepai_dashboard_bg_id_${scope}`;
      let savedId = localStorage.getItem(accountKey);

      // Cautious migration: only for guest, migrate legacy shared key if it exists
      if (!savedId && scope === 'guest') {
        const legacyId = localStorage.getItem('prepai_dashboard_bg_id');
        if (legacyId && (legacyId === 'custom' || BUILT_IN_BACKGROUNDS.some((b) => b.id === legacyId))) {
          localStorage.setItem(accountKey, legacyId);
          savedId = legacyId;
        }
      }

      if (!savedId) {
        savedId = DEFAULT_BG.id;
      }

      // 2. Query account-scoped custom background from IndexedDB
      try {
        const stored = await getCustomBackground(scope);
        if (isCancelled) return;

        if (stored && stored.blob) {
          setHasCustomBg(true);
          setCustomBgMeta(stored.metadata);

          if (savedId === 'custom') {
            const url = URL.createObjectURL(stored.blob);
            activeObjectUrlRef.current = url;
            setDashboardBgId('custom');
            setDashboardBgState(url);
            setIsBgLoading(false);
            return;
          }
        } else {
          setHasCustomBg(false);
          setCustomBgMeta(null);
        }

        // If savedId was 'custom' but no custom blob exists for this account, fallback
        const effectiveId = savedId === 'custom' ? DEFAULT_BG.id : savedId;
        const match = BUILT_IN_BACKGROUNDS.find((b) => b.id === effectiveId) || DEFAULT_BG;

        setDashboardBgId(match.id);
        setDashboardBgState(match.path);
      } catch (err) {
        console.warn('Failed to load account background:', err);
        setDashboardBgId(DEFAULT_BG.id);
        setDashboardBgState(DEFAULT_BG.path);
      } finally {
        if (!isCancelled) {
          setIsBgLoading(false);
        }
      }
    };

    loadScopeBackground();

    return () => {
      isCancelled = true;
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, [authLoaded, activeScope]);

  // Select a built-in background for the active account scope
  const selectBuiltInBg = useCallback((bgIdOrPath) => {
    const scope = activeScopeRef.current;
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

    localStorage.setItem(`prepai_dashboard_bg_id_${scope}`, match.id);
    localStorage.setItem(`dashboardBg_${scope}`, match.path);
  }, []);

  // Save and activate a newly uploaded custom background image for active account scope
  const applyCustomBg = useCallback(async (blob, metadata = {}) => {
    const scope = activeScopeRef.current;
    if (scope === 'guest') {
      throw new Error('Please sign in to upload a custom background.');
    }

    try {
      const stored = await saveCustomBackground(blob, metadata, scope);

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

      localStorage.setItem(`prepai_dashboard_bg_id_${scope}`, 'custom');
      localStorage.setItem(`dashboardBg_${scope}`, 'custom');

      return stored;
    } catch (err) {
      console.error('Failed to apply custom background:', err);
      throw err;
    }
  }, []);

  // Switch back to an existing custom background if already in IndexedDB for active account scope
  const selectExistingCustomBg = useCallback(async () => {
    const scope = activeScopeRef.current;
    try {
      const stored = await getCustomBackground(scope);
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

        localStorage.setItem(`prepai_dashboard_bg_id_${scope}`, 'custom');
        localStorage.setItem(`dashboardBg_${scope}`, 'custom');
      }
    } catch (err) {
      console.error('Failed to switch to existing custom background:', err);
    }
  }, []);

  // Remove the custom background from IndexedDB and revert to default for active account scope
  const removeCustomBg = useCallback(async () => {
    const scope = activeScopeRef.current;
    try {
      await deleteCustomBackground(scope);

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