import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Palette,
  Sliders,
  ShieldCheck,
  Check,
  Sparkles,
  Camera,
  Moon,
  Sun,
  Image as ImageIcon,
  Save,
  Upload,
  Trash2,
  AlertCircle,
  AlertTriangle,
  X,
  RefreshCw,
  Eye,
  CheckCircle2,
  Lock,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { useTheme } from '../context/ThemeContext';
import { validateImageFile, formatBytes } from '../utils/backgroundStorage';

const TARGET_ROLES = [
  'Backend Developer',
  'Full-Stack Engineer',
  'Frontend Engineer',
  'DevOps / SRE Engineer',
  'Mobile Developer (iOS/Android)',
  'Data Engineer / AI Engineer',
];

const TARGET_COMPANIES = [
  'Google',
  'Amazon',
  'Meta',
  'Microsoft',
  'Apple',
  'Netflix',
  'Stripe',
  'Uber',
  'Any Top Tech',
];

const EXPERIENCE_LEVELS = [
  'Fresher (0-1 yrs)',
  'Junior (1-3 yrs)',
  'Mid-Level (3-5 yrs)',
  'Senior (5+ yrs)',
  'Lead / Staff (8+ yrs)',
];

const SettingsPage = () => {
  const navigate = useNavigate();
  const { userName, userEmail, logout, isLoggedIn, isLoaded } = useAuth();
  const { openLogin } = useModal();
  const {
    theme,
    setTheme,
    dashboardBg,
    dashboardBgId,
    selectBuiltInBg,
    applyCustomBg,
    selectExistingCustomBg,
    removeCustomBg,
    hasCustomBg,
    customBgMeta,
    builtInBackgrounds,
  } = useTheme();

  const [activeTab, setActiveTab] = useState('profile');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Custom background upload & preview states
  const [pendingUpload, setPendingUpload] = useState(null); // { file, previewUrl, meta, warning }
  const [uploadError, setUploadError] = useState(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [customActionSuccess, setCustomActionSuccess] = useState(null); // 'applied' | 'removed'
  const fileInputRef = useRef(null);

  // Revoke preview object URL when pendingUpload changes or component unmounts
  useEffect(() => {
    return () => {
      if (pendingUpload?.previewUrl) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
      }
    };
  }, [pendingUpload]);

  // If user logs out while a preview is pending, clean it up
  useEffect(() => {
    if (!isLoggedIn && pendingUpload) {
      if (pendingUpload.previewUrl) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
      }
      setPendingUpload(null);
    }
  }, [isLoggedIn, pendingUpload]);

  // Image Upload Validation & Processing
  const handleFileSelected = async (file) => {
    if (!file) return;

    // Strict authentication restriction
    if (!isLoggedIn) {
      setUploadError('Please sign in to upload custom backgrounds.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadError(null);
    setIsProcessingFile(true);

    try {
      const validation = await validateImageFile(file);
      if (!validation.valid) {
        setUploadError(validation.error);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // Revoke any previous preview URL
      if (pendingUpload?.previewUrl) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
      }

      const previewUrl = URL.createObjectURL(file);
      setPendingUpload({
        file,
        previewUrl,
        meta: {
          name: file.name,
          size: file.size,
          type: validation.mimeType,
          width: validation.width,
          height: validation.height,
          aspectRatio: validation.aspectRatio,
        },
        warning: validation.warning,
      });
    } catch (err) {
      console.error('File processing error:', err);
      setUploadError('Failed to process image file. Please try another image.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleCancelPendingUpload = () => {
    if (pendingUpload?.previewUrl) {
      URL.revokeObjectURL(pendingUpload.previewUrl);
    }
    setPendingUpload(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyPendingUpload = async () => {
    if (!pendingUpload) return;

    // Strict authentication restriction
    if (!isLoggedIn) {
      setUploadError('Please sign in to apply custom backgrounds.');
      return;
    }

    setIsApplying(true);
    setUploadError(null);

    try {
      await applyCustomBg(pendingUpload.file, pendingUpload.meta);
      if (pendingUpload.previewUrl) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
      }
      setPendingUpload(null);
      setCustomActionSuccess('applied');
      setTimeout(() => setCustomActionSuccess(null), 3500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Apply custom background error:', err);
      setUploadError('Failed to store custom background in browser storage.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCustomBg = async () => {
    setIsRemoving(true);
    setUploadError(null);

    try {
      await removeCustomBg();
      setCustomActionSuccess('removed');
      setTimeout(() => setCustomActionSuccess(null), 3500);
    } catch (err) {
      console.error('Remove custom background error:', err);
      setUploadError('Failed to delete custom background.');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!isLoggedIn) return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  };

  // Load preferences from localStorage
  const [targetRole, setTargetRole] = useState(() => {
    return localStorage.getItem('prepai_target_role') || 'Backend Developer';
  });
  const [targetCompany, setTargetCompany] = useState(() => {
    return localStorage.getItem('prepai_target_company') || 'Google';
  });
  const [experienceLevel, setExperienceLevel] = useState(() => {
    return localStorage.getItem('prepai_experience_level') || 'Fresher (0-1 yrs)';
  });
  const [yearsExperience, setYearsExperience] = useState(() => {
    return localStorage.getItem('prepai_years_experience') || '0';
  });
  const [defaultLanguage, setDefaultLanguage] = useState(() => {
    return localStorage.getItem('prepai_default_language') || 'javascript';
  });

  const handleSaveProfile = (e) => {
    e.preventDefault();
    localStorage.setItem('prepai_target_role', targetRole);
    localStorage.setItem('prepai_target_company', targetCompany);
    localStorage.setItem('prepai_experience_level', experienceLevel);
    localStorage.setItem('prepai_years_experience', yearsExperience);
    localStorage.setItem('prepai_default_language', defaultLanguage);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const userInitial = userName ? userName.charAt(0).toUpperCase() : (isLoggedIn ? 'U' : '?');

  return (
    <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full pb-12 animate-fade-in">
      {/* Header matching reference mockup */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
          <Sliders size={14} />
          <span>Configuration</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Customize your profile, appearance, preferences, and interview targets.
        </p>
      </div>

      {/* Tabs Bar: Profile | Appearance | Preferences | Account (Notifications explicitly removed per specification) */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 mb-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'profile'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
          }`}
        >
          <User size={15} />
          <span>Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'appearance'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
          }`}
        >
          <Palette size={15} />
          <span>Appearance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'preferences'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
          }`}
        >
          <Sliders size={15} />
          <span>Preferences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'account'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
          }`}
        >
          <ShieldCheck size={15} />
          <span>Account</span>
        </button>
      </div>

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* User Profile Card */}
          <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-xl flex items-center justify-center shadow-md">
                {userInitial}
              </div>
              <button
                type="button"
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-surface border border-border text-text-secondary hover:text-emerald-400 transition shadow"
                title="Change Photo"
              >
                <Camera size={13} />
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    {userName || (isLoggedIn ? 'Candidate Profile' : 'Guest User')}
                  </h3>
                  <p className="text-xs text-text-secondary">
                    {userEmail || (isLoggedIn ? 'Personal candidate workspace' : 'Sign in to access your candidate profile')}
                  </p>
                </div>
                {isLoggedIn ? (
                  <span className="inline-flex self-center sm:self-auto items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                    Active Plan
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (openLogin) openLogin();
                      else navigate('/login');
                    }}
                    className="inline-flex self-center sm:self-auto items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition cursor-pointer"
                  >
                    <LogIn size={13} />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Account identity is synchronized with Clerk authentication. Target role and experience calibrate AI interview difficulty and DSA problem recommendations.
              </p>
            </div>
          </div>

          {/* Profile Details Inputs */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-5">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border/40 pb-3">
              <User size={16} className="text-emerald-400" />
              <span>Target Role & Career Preferences</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={userName || (isLoggedIn ? 'Candidate' : 'Guest')}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/40 border border-border/60 text-text-secondary text-xs cursor-not-allowed"
                  title="Managed via Clerk identity"
                />
                <span className="text-[10px] text-text-muted mt-1 block">
                  Managed via Clerk account provider.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={userEmail || (isLoggedIn ? 'Not provided' : 'Sign in to link email')}
                  readOnly
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/40 border border-border/60 text-text-secondary text-xs cursor-not-allowed"
                  title="Managed via Clerk identity"
                />
                <span className="text-[10px] text-text-muted mt-1 block">
                  Primary notification and report recipient.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Target Role
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/60 border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500/60"
                >
                  {TARGET_ROLES.map((r) => (
                    <option key={r} value={r} className="bg-surface text-text-primary">
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Target Company
                </label>
                <select
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/60 border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500/60"
                >
                  {TARGET_COMPANIES.map((c) => (
                    <option key={c} value={c} className="bg-surface text-text-primary">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Experience Level
                </label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/60 border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500/60"
                >
                  {EXPERIENCE_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl} className="bg-surface text-text-primary">
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Years of Experience
                </label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  value={yearsExperience}
                  onChange={(e) => setYearsExperience(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/60 border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/40">
              {savedSuccess && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-fade-in">
                  <Check size={14} /> Saved preferences!
                </span>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-md transition"
              >
                <Save size={14} />
                <span>Save Preferences</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: APPEARANCE */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          {/* Notification Banners */}
          {customActionSuccess === 'applied' && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>Custom background successfully applied and stored in local IndexedDB.</span>
              </div>
              <button
                type="button"
                onClick={() => setCustomActionSuccess(null)}
                className="p-1 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {customActionSuccess === 'removed' && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-border text-text-secondary text-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>Custom background removed. Reverted to Alpine Sunset.</span>
              </div>
              <button
                type="button"
                onClick={() => setCustomActionSuccess(null)}
                className="p-1 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Theme Selection: Exactly Dark and Light */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Palette size={16} className="text-emerald-600 dark:text-emerald-400" />
                <span>Application Theme</span>
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Choose between the primary dark developer theme and the clean light theme.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              {/* Dark Theme Button */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-between p-4 rounded-xl border text-left transition ${
                  theme === 'dark'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
                    : 'bg-surface-elevated/40 border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-surface border border-border text-emerald-400">
                    <Moon size={18} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-text-primary">Dark Theme</span>
                    <span className="block text-[11px] text-text-muted">Deep matte-black & emerald</span>
                  </div>
                </div>
                {theme === 'dark' && <Check size={18} className="text-emerald-400" />}
              </button>

              {/* Light Theme Button */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-between p-4 rounded-xl border text-left transition ${
                  theme === 'light'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.12)]'
                    : 'bg-surface-elevated/40 border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-surface border border-border text-amber-500">
                    <Sun size={18} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-text-primary">Light Theme</span>
                    <span className="block text-[11px] text-text-muted">Warm neutral & slate</span>
                  </div>
                </div>
                {theme === 'light' && <Check size={18} className="text-emerald-600 dark:text-emerald-400" />}
              </button>
            </div>
          </div>

          {/* Curated Dashboard Background Gallery (8 Options) */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <ImageIcon size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Curated Dashboard Backgrounds</span>
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Choose from 8 curated 16:9 cinematic backgrounds designed to harmonize with the matte-black and emerald aesthetic.
                </p>
              </div>
              <span className="text-[11px] text-text-muted font-mono self-start sm:self-auto px-2 py-1 rounded bg-surface-elevated/60 border border-border/50">
                8 Presets Available
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {builtInBackgrounds.map((bg) => {
                const isSelected = dashboardBgId === bg.id;
                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => selectBuiltInBg(bg.id)}
                    aria-pressed={isSelected}
                    className={`group relative flex flex-col rounded-xl overflow-hidden border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isSelected
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-lg bg-emerald-500/5'
                        : 'border-border/60 hover:border-emerald-500/40 hover:shadow-md bg-surface/80'
                    }`}
                  >
                    <div className="h-32 w-full relative overflow-hidden bg-surface-elevated">
                      <img
                        src={bg.path}
                        alt={bg.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                      {/* Tag Badge */}
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/60 backdrop-blur-sm text-text-primary border border-white/10">
                        {bg.tag}
                      </div>

                      {/* Selected Checkmark */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 p-1 rounded-full bg-emerald-500 text-white shadow-md animate-scale-in">
                          <Check size={13} strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-surface/90 flex flex-col flex-1 justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-text-primary truncate">
                            {bg.name}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-1 line-clamp-2 leading-relaxed">
                          {bg.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Background Upload & Management Section */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Upload size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Custom Background Upload</span>
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  Upload your own high-resolution image to personalize your dashboard background.
                </p>
              </div>
            </div>

            {/* Saved Custom Background Tile (if one exists for signed-in user) */}
            {isLoggedIn && hasCustomBg && customBgMeta && (
              <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-20 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0 relative bg-surface">
                    <img
                      src={dashboardBg}
                      alt="Current Custom Background"
                      className="w-full h-full object-cover"
                    />
                    {dashboardBgId === 'custom' && (
                      <div className="absolute top-1 right-1 p-0.5 rounded-full bg-emerald-500 text-white">
                        <Check size={10} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-primary">
                        {customBgMeta.name || 'Custom Background'}
                      </span>
                      {dashboardBgId === 'custom' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Currently Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-text-muted">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 flex flex-wrap items-center gap-2">
                      <span>{customBgMeta.width} × {customBgMeta.height} px</span>
                      <span>•</span>
                      <span>{formatBytes(customBgMeta.size)}</span>
                      <span>•</span>
                      <span>{customBgMeta.type}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  {dashboardBgId !== 'custom' && (
                    <button
                      type="button"
                      onClick={selectExistingCustomBg}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition"
                    >
                      Set as Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRemoveCustomBg}
                    disabled={isRemoving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold transition disabled:opacity-50"
                  >
                    {isRemoving ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}

            {/* LIVE PREVIEW & CONFIRMATION FLOW */}
            {pendingUpload && (
              <div className="rounded-xl border border-emerald-500/40 bg-surface/90 overflow-hidden shadow-2xl space-y-4 animate-scale-in">
                <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye size={16} className="text-emerald-400" />
                    <span className="text-xs font-bold text-text-primary">
                      Live Dashboard Simulation & Preview
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-semibold">
                    Review before applying
                  </span>
                </div>

                <div className="px-5 pt-1 space-y-4">
                  {/* Simulated Dashboard Viewport */}
                  <div className="relative rounded-xl overflow-hidden border border-border/70 h-64 w-full shadow-inner bg-surface">
                    {/* Background Layer with cover */}
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                      style={{
                        backgroundImage: `url("${pendingUpload.previewUrl}")`,
                      }}
                    />

                    {/* Gradient Fade Overlay matching the dashboard treatment */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          theme === 'dark'
                            ? 'linear-gradient(to bottom, rgba(10, 15, 29, 0.40) 0%, rgba(10, 15, 29, 0.75) 50%, #0d1117 100%)'
                            : 'linear-gradient(to bottom, rgba(248, 250, 252, 0.35) 0%, rgba(248, 250, 252, 0.75) 50%, #f3f4f1 100%)',
                      }}
                    />

                    {/* Simulated Dashboard Content for Legibility & Contrast Verification */}
                    <div className="relative z-10 p-5 h-full flex flex-col justify-between pointer-events-none select-none">
                      {/* Top Header simulation */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 backdrop-blur-md">
                            PREVIEW MODE
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 rounded-md bg-surface/70 backdrop-blur-md border border-border/60 text-[10px] font-mono text-text-primary">
                            🔥 3 Day Streak
                          </div>
                        </div>
                      </div>

                      {/* Hero Greeting simulation */}
                      <div className="max-w-md">
                        <h4 className="text-base font-bold text-text-primary drop-shadow-sm">
                          Good evening, Aman
                        </h4>
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                          "Success is neither magical nor mysterious. It is the natural consequence of applying basic fundamentals consistently."
                        </p>
                      </div>

                      {/* Mock Card */}
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-surface/80 backdrop-blur-md border border-border/80 shadow-md flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <Sparkles size={16} />
                          </div>
                          <div>
                            <span className="block text-xs font-bold text-text-primary">
                              Behavioral Coach
                            </span>
                            <span className="block text-[10px] text-text-muted">
                              AI Voice & STAR Practice
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metadata & Technical Specs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/50">
                      <span className="block text-[10px] text-text-muted">Dimensions</span>
                      <span className="font-semibold text-text-primary">
                        {pendingUpload.meta.width} × {pendingUpload.meta.height} px
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/50">
                      <span className="block text-[10px] text-text-muted">File Size</span>
                      <span className="font-semibold text-text-primary">
                        {formatBytes(pendingUpload.meta.size)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/50">
                      <span className="block text-[10px] text-text-muted">Aspect Ratio</span>
                      <span className="font-semibold text-text-primary">
                        {pendingUpload.meta.aspectRatio.toFixed(2)}:1 {Math.abs(pendingUpload.meta.aspectRatio - 1.77) < 0.1 ? '(16:9 Widescreen)' : ''}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface-elevated/40 border border-border/50">
                      <span className="block text-[10px] text-text-muted">MIME Type</span>
                      <span className="font-semibold text-text-primary">
                        {pendingUpload.meta.type}
                      </span>
                    </div>
                  </div>

                  {/* Warning banner if image has non-fatal aspect ratio / resolution flags */}
                  {pendingUpload.warning && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                      <span>{pendingUpload.warning}</span>
                    </div>
                  )}

                  {/* Apply / Cancel Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-2 pb-5 border-t border-border/40">
                    <button
                      type="button"
                      onClick={handleCancelPendingUpload}
                      disabled={isApplying}
                      className="px-4 py-2 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated text-xs font-semibold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyPendingUpload}
                      disabled={isApplying}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-md transition disabled:opacity-50"
                    >
                      {isApplying ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Saving to Browser...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Apply Background</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* UPLOAD DROPZONE */}
            {(!pendingUpload || !isLoggedIn) && (
              <div className="relative rounded-xl overflow-hidden">
                {/* Underlying Dropzone: Fully visible in current position and size */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => {
                    if (!isLoggedIn) return;
                    fileInputRef.current?.click();
                  }}
                  className={`relative flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed transition-all ${
                    isLoggedIn
                      ? isDragging
                        ? 'border-emerald-400 bg-emerald-500/10 scale-[1.005] cursor-pointer'
                        : 'border-border/80 hover:border-emerald-500/50 hover:bg-surface-elevated/30 bg-surface/40 cursor-pointer'
                      : 'border-border/60 bg-surface/30 cursor-default'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    disabled={!isLoggedIn}
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => {
                      if (!isLoggedIn) return;
                      const file = e.target.files?.[0];
                      if (file) handleFileSelected(file);
                    }}
                  />

                  <div className="p-3.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
                    {isProcessingFile ? (
                      <RefreshCw size={22} className="animate-spin" />
                    ) : (
                      <Upload size={22} />
                    )}
                  </div>

                  <div className="text-center space-y-1">
                    <span className="block text-xs font-bold text-text-primary">
                      {isProcessingFile
                        ? 'Decoding & verifying image...'
                        : 'Drop your background image here, or browse files'}
                    </span>
                    <span className="block text-[11px] text-text-muted">
                      Supports JPEG, PNG, and WebP up to 5 MB
                    </span>
                    <span className="block text-[10px] text-emerald-400/80 font-mono pt-1">
                      Recommended: 2560 × 1440 or 1920 × 1080 (16:9 Widescreen)
                    </span>
                  </div>
                </div>

                {/* Subtle dark translucent locked overlay for signed-out guests */}
                {!isLoggedIn && (
                  <div className="absolute inset-0 z-10 rounded-xl bg-background/80 dark:bg-black/75 backdrop-blur-[2px] border border-border/40 dark:border-white/5 flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2.5 shadow-[0_0_16px_rgba(16,185,129,0.15)]">
                      <Lock size={20} className="stroke-[2.2]" />
                    </div>
                    <h4 className="text-sm font-bold text-text-primary tracking-tight mb-1">
                      Sign in to unlock custom backgrounds
                    </h4>
                    <p className="text-xs text-text-secondary max-w-xs mb-3.5 leading-relaxed">
                      Personalize your dashboard with your own image.
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openLogin) openLogin();
                        else navigate('/login');
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/30 transition transform hover:-translate-y-0.5 cursor-pointer pointer-events-auto"
                    >
                      <LogIn size={14} />
                      <span>Sign In</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error Banner */}
            {uploadError && (
              <div className="flex items-start justify-between gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs animate-shake">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="p-0.5 hover:text-white flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-6">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border/40 pb-3">
            <Sliders size={16} className="text-emerald-400" />
            <span>Workspace & AI Preferences</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Default DSA Programming Language
              </label>
              <select
                value={defaultLanguage}
                onChange={(e) => {
                  setDefaultLanguage(e.target.value);
                  localStorage.setItem('prepai_default_language', e.target.value);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/60 border border-border text-text-primary text-xs focus:outline-none focus:border-emerald-500/60"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                Preferred Speech Synthesis Voice
              </label>
              <input
                type="text"
                value="Google UK English (Default)"
                readOnly
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-elevated/40 border border-border text-text-secondary text-xs cursor-not-allowed"
              />
              <span className="text-[10px] text-text-muted mt-1 block">
                Microsoft voices are excluded; Google UK English is prioritized.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACCOUNT */}
      {activeTab === 'account' && (
        <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 space-y-6">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 border-b border-border/40 pb-3">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span>Account Status & Security</span>
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-surface-elevated/40 border border-border/60 gap-4">
            <div>
              <span className="text-xs font-bold text-text-primary block">Subscription Tier</span>
              <span className="text-xs text-text-secondary">PrepAI Developer Community Access</span>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Active Plan
            </span>
          </div>

          <div className="pt-4 border-t border-border/40 flex justify-between items-center">
            <span className="text-xs text-text-secondary">Session management provided by Clerk.</span>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
