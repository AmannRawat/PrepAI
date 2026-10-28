import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Sliders,
  ShieldCheck,
  Check,
  Camera,
  Moon,
  Sun,
  Palette,
  Image as ImageIcon,
  ImageOff,
  Save,
  Upload,
  AlertCircle,
  AlertTriangle,
  X,
  RefreshCw,
  CheckCircle2,
  Lock,
  LogIn,
  Volume2,
  Play,
  LogOut,
  ArrowRight,
  FileText,
  Brain,
  Trash2,
  Edit3,
  Plus,
  Award,
  TrendingUp,
  Target,
  ExternalLink,
  Sparkles,
  BookmarkCheck,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { useTheme } from '../context/ThemeContext';
import { validateImageFile, formatBytes } from '../utils/backgroundStorage';
import { processSpeechVoices } from '../utils/speechUtils';
import { trackEvent, ALLOWED_EVENTS } from '../utils/analytics.js';

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

const MEMORY_CATEGORIES = [
  { id: 'all', label: 'All Memories' },
  { id: 'technical_strength', label: 'Technical Strengths' },
  { id: 'technical_weakness', label: 'Growth Areas' },
  { id: 'interview_feedback', label: 'Interview Feedback' },
  { id: 'experience', label: 'Experience Facts' },
  { id: 'preference', label: 'Preferences' },
  { id: 'goal', label: 'Career Goals' },
];

const SettingsPage = () => {
  const navigate = useNavigate();
  const {
    userName,
    userEmail,
    userImageUrl,
    openUserProfile,
    logout,
    isLoggedIn,
    isLoaded,
    getToken,
    userId,
  } = useAuth();
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

  // Active IA tab: 'profile' | 'appearance' | 'preferences' | 'account'
  const [activeTab, setActiveTab] = useState('profile');

  // Failed wallpaper thumbnail image tracker for graceful fallback
  const [failedImages, setFailedImages] = useState({});
  const handleImageError = useCallback((id) => {
    setFailedImages((prev) => ({ ...prev, [id]: true }));
  }, []);

  // Feedback states
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  // Avatar error fallback
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  // Career profile fields (persisted per authenticated user)
  const [targetRole, setTargetRole] = useState('Backend Developer');
  const [targetCompany, setTargetCompany] = useState('Google');
  const [experienceLevel, setExperienceLevel] = useState('Fresher (0-1 yrs)');
  const [yearsExperience, setYearsExperience] = useState('0');

  // Preferred Resume states
  const [resumes, setResumes] = useState([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [resumesError, setResumesError] = useState(null);
  const [isSettingPreferred, setIsSettingPreferred] = useState(false);
  const [resumeActionMessage, setResumeActionMessage] = useState(null);

  // Workspace preferences
  const [defaultLanguage, setDefaultLanguage] = useState(() => {
    return localStorage.getItem('prepai_default_language') || 'javascript';
  });

  // Speech voice selection
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState(() => {
    return localStorage.getItem('preferredVoiceName') || '';
  });
  const [isPlayingVoiceSample, setIsPlayingVoiceSample] = useState(false);

  // Custom background upload states
  const [pendingUpload, setPendingUpload] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [customActionSuccess, setCustomActionSuccess] = useState(null);
  const fileInputRef = useRef(null);

  // Account & Personalization: Memories (What Pepe Knows)
  const [memories, setMemories] = useState([]);
  const [isLoadingMemories, setIsLoadingMemories] = useState(false);
  const [selectedMemoryCategory, setSelectedMemoryCategory] = useState('all');
  const [editingMemoryId, setEditingMemoryId] = useState(null);
  const [editMemoryContent, setEditMemoryContent] = useState('');
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [showAddMemoryModal, setShowAddMemoryModal] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState('technical_strength');
  const [newMemoryContent, setNewMemoryContent] = useState('');

  // Account & Personalization: Learning & Progress
  const [progressData, setProgressData] = useState(null);
  const [dsaStatsData, setDsaStatsData] = useState(null);
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);

  // Account & Personalization: Preparation Goals (Study Plan)
  const [goalsProfile, setGoalsProfile] = useState({
    targetCompanies: '',
    dailyTime: '',
    weakTopics: '',
    dailyTarget: '',
  });
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);
  const [isSavingGoals, setIsSavingGoals] = useState(false);
  const [goalsSuccessMessage, setGoalsSuccessMessage] = useState(null);

  // Reset avatar load state when image URL changes
  useEffect(() => {
    setImageLoadFailed(false);
  }, [userImageUrl]);

  // Load available speech synthesis voices
  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const allVoices = window.speechSynthesis.getVoices();
    const saved = localStorage.getItem('preferredVoiceName') || selectedVoiceName;
    const { sortedVoices, defaultVoiceName } = processSpeechVoices(allVoices, saved);

    setVoices(sortedVoices);
    if (defaultVoiceName && (!selectedVoiceName || !sortedVoices.some((v) => v.name === selectedVoiceName))) {
      setSelectedVoiceName(defaultVoiceName);
    }
  }, [selectedVoiceName]);

  useEffect(() => {
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, [loadVoices]);

  // 1. Fetch user career preferences
  useEffect(() => {
    let isMounted = true;
    if (!isLoaded) return;

    if (!isLoggedIn) {
      setTargetRole('Backend Developer');
      setTargetCompany('Google');
      setExperienceLevel('Fresher (0-1 yrs)');
      setYearsExperience('0');
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    const fetchPreferences = async () => {
      setIsProfileLoading(true);
      setProfileError(null);

      try {
        const token = await getToken();
        if (!token || !isMounted) return;

        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/user/preferences`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (isMounted && res.data?.careerPreferences) {
          const prefs = res.data.careerPreferences;
          if (prefs.targetRole) setTargetRole(prefs.targetRole);
          if (prefs.targetCompany) setTargetCompany(prefs.targetCompany);
          if (prefs.experienceLevel) setExperienceLevel(prefs.experienceLevel);
          if (prefs.yearsOfExperience !== undefined && prefs.yearsOfExperience !== null) {
            setYearsExperience(String(prefs.yearsOfExperience));
          }
          if (prefs.defaultLanguage) {
            setDefaultLanguage(prefs.defaultLanguage);
            localStorage.setItem('prepai_default_language', prefs.defaultLanguage);
          }
          if (prefs.preferredVoice) {
            setSelectedVoiceName(prefs.preferredVoice);
            localStorage.setItem('preferredVoiceName', prefs.preferredVoice);
          }
        }
      } catch (err) {
        console.error('Failed to load user preferences:', err);
      } finally {
        if (isMounted) setIsProfileLoading(false);
      }
    };

    fetchPreferences();
    return () => { isMounted = false; };
  }, [isLoggedIn, isLoaded, userId, getToken]);

  // 2. Fetch authenticated user resumes
  const fetchUserResumes = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoadingResumes(true);
    setResumesError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/resume/my-resumes`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        setResumes(res.data.resumes || []);
      }
    } catch (err) {
      console.error('Failed to fetch user resumes:', err);
      setResumesError(err.response?.data?.message || 'Could not load your uploaded resumes. Please try again.');
    } finally {
      setIsLoadingResumes(false);
    }
  }, [isLoggedIn, getToken]);

  useEffect(() => {
    if (isLoggedIn && activeTab === 'profile') {
      fetchUserResumes();
    }
  }, [isLoggedIn, activeTab, fetchUserResumes]);

  // 3. Fetch Personalization Memories (What Pepe Knows)
  const fetchMemories = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoadingMemories(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/user/memories`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.success) {
        setMemories(res.data.memories || []);
      }
    } catch (err) {
      console.error('Failed to fetch user memories:', err);
    } finally {
      setIsLoadingMemories(false);
    }
  }, [isLoggedIn, getToken]);

  // 4. Fetch Learning & Progress Data
  const fetchProgressAndStats = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoadingProgress(true);
    try {
      const token = await getToken();
      if (!token) return;

      const [progressRes, statsRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API_URL}/api/user/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: null })),
        axios.get(`${import.meta.env.VITE_API_URL}/api/user/dsa-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => ({ data: null })),
      ]);

      if (progressRes?.data) setProgressData(progressRes.data);
      if (statsRes?.data) setDsaStatsData(statsRes.data);
    } catch (err) {
      console.error('Failed to load learning & progress data:', err);
    } finally {
      setIsLoadingProgress(false);
    }
  }, [isLoggedIn, getToken]);

  // 5. Fetch Preparation Goals (Study Plan)
  const fetchPreparationGoals = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoadingGoals(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/user/study-plan`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data) {
        const onb = res.data.onboardingProfile || {};
        const pl = res.data.plan || {};
        setGoalsProfile({
          targetCompanies: onb.targetCompanies || '',
          dailyTime: onb.dailyTime || '',
          weakTopics: onb.weakTopics || '',
          dailyTarget: pl.dailyTarget || '',
        });
      }
    } catch (err) {
      console.error('Failed to load study plan goals:', err);
    } finally {
      setIsLoadingGoals(false);
    }
  }, [isLoggedIn, getToken]);

  // Trigger Account tab data loads
  useEffect(() => {
    if (isLoggedIn && activeTab === 'account') {
      fetchMemories();
      fetchProgressAndStats();
      fetchPreparationGoals();
    }
  }, [isLoggedIn, activeTab, fetchMemories, fetchProgressAndStats, fetchPreparationGoals]);

  // Handle saving career profile preferences
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) {
      if (openLogin) openLogin();
      return;
    }

    setIsProfileSaving(true);
    setProfileError(null);

    const parsedYears = Math.max(0, parseInt(yearsExperience, 10) || 0);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication session expired.');

      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/user/preferences`,
        {
          targetRole,
          targetCompany,
          experienceLevel,
          yearsOfExperience: parsedYears,
          defaultLanguage,
          preferredVoice: selectedVoiceName,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      localStorage.setItem('prepai_target_role', targetRole);
      localStorage.setItem('prepai_target_company', targetCompany);
      localStorage.setItem('prepai_experience_level', experienceLevel);
      localStorage.setItem('prepai_years_experience', String(parsedYears));

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving career profile:', err);
      setProfileError('Failed to save profile preferences. Please try again.');
    } finally {
      setIsProfileSaving(false);
    }
  };

  // Handle setting preferred resume
  const handleSelectPreferredResume = async (resumeId) => {
    if (!isLoggedIn) return;
    setIsSettingPreferred(true);
    setResumeActionMessage(null);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/resume/preferred`,
        { resumeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setResumes((prev) =>
          prev.map((r) => ({
            ...r,
            isPreferred: String(r._id) === String(resumeId),
          }))
        );
        setResumeActionMessage('Preferred resume updated. Future mock interviews and coach sessions will use this resume.');
        setTimeout(() => setResumeActionMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to set preferred resume:', err);
      setResumeActionMessage('Failed to set preferred resume. Please try again.');
      setTimeout(() => setResumeActionMessage(null), 4000);
    } finally {
      setIsSettingPreferred(false);
    }
  };

  // Handle language change
  const handleLanguageChange = async (newLang) => {
    setDefaultLanguage(newLang);
    localStorage.setItem('prepai_default_language', newLang);

    if (isLoggedIn) {
      try {
        const token = await getToken();
        if (token) {
          await axios.put(
            `${import.meta.env.VITE_API_URL}/api/user/preferences`,
            { defaultLanguage: newLang },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      } catch (err) {
        console.warn('Could not sync language preference to account:', err);
      }
    }
  };

  // Handle voice change
  const handleVoiceChange = async (newVoiceName) => {
    setSelectedVoiceName(newVoiceName);
    localStorage.setItem('preferredVoiceName', newVoiceName);

    if (isLoggedIn) {
      try {
        const token = await getToken();
        if (token) {
          await axios.put(
            `${import.meta.env.VITE_API_URL}/api/user/preferences`,
            { preferredVoice: newVoiceName },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }
      } catch (err) {
        console.warn('Could not sync voice preference to account:', err);
      }
    }
  };

  // Handle playing voice sample
  const handlePlayVoiceSample = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const sampleText =
      'Hello, I am Pepe, your AI interview mentor. Let us prepare for your upcoming software engineering interview.';
    const utterance = new SpeechSynthesisUtterance(sampleText);

    if (selectedVoiceName && voices.length > 0) {
      const match = voices.find((v) => v.name === selectedVoiceName);
      if (match) utterance.voice = match;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsPlayingVoiceSample(true);
    utterance.onend = () => setIsPlayingVoiceSample(false);
    utterance.onerror = () => setIsPlayingVoiceSample(false);

    window.speechSynthesis.speak(utterance);
  };

  // Memory management handlers
  const handleCreateMemory = async (e) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;

    setIsSavingMemory(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/user/memories`,
        {
          category: newMemoryCategory,
          content: newMemoryContent.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setMemories((prev) => [res.data.memory, ...prev]);
        setNewMemoryContent('');
        setShowAddMemoryModal(false);
      }
    } catch (err) {
      console.error('Failed to create memory:', err);
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleUpdateMemory = async (memoryId) => {
    if (!editMemoryContent.trim()) return;

    setIsSavingMemory(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/user/memories/${memoryId}`,
        { content: editMemoryContent.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setMemories((prev) =>
          prev.map((m) => (m._id === memoryId ? res.data.memory : m))
        );
        setEditingMemoryId(null);
        setEditMemoryContent('');
      }
    } catch (err) {
      console.error('Failed to update memory:', err);
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    if (!window.confirm('Are you sure you want to remove this personalization memory? Pepe will no longer reference it.')) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/user/memories/${memoryId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setMemories((prev) => prev.filter((m) => m._id !== memoryId));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  // Preparation Goals Save Handler
  const handleSaveGoals = async (e) => {
    e.preventDefault();
    if (!isLoggedIn) return;

    setIsSavingGoals(true);
    setGoalsSuccessMessage(null);

    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.put(
        `${import.meta.env.VITE_API_URL}/api/user/study-plan`,
        {
          onboardingProfile: {
            targetCompanies: goalsProfile.targetCompanies,
            dailyTime: goalsProfile.dailyTime,
            weakTopics: goalsProfile.weakTopics,
          },
          plan: {
            dailyTarget: goalsProfile.dailyTarget,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        setGoalsSuccessMessage('Preparation goals saved! Your DSA Coach and Study Plan have been updated.');
        setTimeout(() => setGoalsSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to save study goals:', err);
    } finally {
      setIsSavingGoals(false);
    }
  };

  // Background upload handlers
  const handleFileSelected = async (file) => {
    if (!file) return;

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

  const handleApplyPendingUpload = async () => {
    if (!pendingUpload) return;
    if (!isLoggedIn) {
      setUploadError('Please sign in to upload custom backgrounds.');
      return;
    }
    setIsApplying(true);
    setUploadError(null);
    try {
      const result = await applyCustomBg(pendingUpload.file);
      if (result) {
        URL.revokeObjectURL(pendingUpload.previewUrl);
        setPendingUpload(null);
        setCustomActionSuccess('applied');
        trackEvent(ALLOWED_EVENTS.SETTINGS_PREFERENCE_CHANGED, {
          setting_type: 'wallpaper',
          new_value: 'custom',
        });
        setTimeout(() => setCustomActionSuccess(null), 3000);
      } else {
        setUploadError('Failed to apply custom background.');
      }
    } catch (err) {
      setUploadError(err.message || 'Failed to store background.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCustomBackground = async () => {
    setIsRemoving(true);
    try {
      const result = await removeCustomBg();
      if (result.success) {
        setCustomActionSuccess('removed');
        setTimeout(() => setCustomActionSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Error removing custom background:', err);
    } finally {
      setIsRemoving(false);
    }
  };

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    if (selectedMemoryCategory === 'all') return true;
    return m.category === selectedMemoryCategory;
  });

  const userInitial = userName ? userName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex flex-col flex-1 max-w-5xl mx-auto w-full px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
          <Sliders size={14} />
          <span>Configuration & Identity</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Manage your professional identity, application behavior, and personalized preparation memory.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-border/60 pb-3 mb-6 overflow-x-auto no-scrollbar scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
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
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
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
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
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
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition cursor-pointer ${
            activeTab === 'account'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40'
          }`}
        >
          <Brain size={15} />
          <span>Account & Personalization</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: PROFILE — Professional Identity & Preferred Resume      */}
      {/* ============================================================== */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {!isLoaded ? (
            <div className="p-8 rounded-2xl bg-surface/70 border border-border/60 animate-pulse text-center">
              <div className="h-5 bg-surface-elevated rounded w-1/3 mx-auto mb-3" />
              <div className="h-4 bg-surface-elevated rounded w-1/2 mx-auto" />
            </div>
          ) : !isLoggedIn ? (
            /* Guest Profile State */
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border text-text-muted font-bold text-xl flex items-center justify-center shadow-sm">
                  ?
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-text-primary">Guest Candidate</h3>
                      <p className="text-xs text-text-secondary">Browsing without an authenticated account</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => (openLogin ? openLogin() : navigate('/login'))}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                      <LogIn size={14} />
                      <span>Sign In to Save Profile</span>
                    </button>
                  </div>
                  <p className="text-xs text-text-secondary mt-3 leading-relaxed">
                    Signing in enables account-backed career preferences, uploaded resume indexing with ATS analysis, and custom mock interview calibration tailored to your experience level.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Authenticated Profile State */
            <div className="space-y-6">
              {/* Authenticated Identity Card */}
              <div className="p-5 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="relative group shrink-0">
                  {userImageUrl && !imageLoadFailed ? (
                    <img
                      src={userImageUrl}
                      alt={userName || 'User'}
                      className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500/40 shadow-sm"
                      onError={() => setImageLoadFailed(true)}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-2xl flex items-center justify-center border-2 border-border shadow-sm">
                      {userInitial}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openUserProfile && openUserProfile()}
                    className="absolute bottom-0 right-0 p-1.5 rounded-full bg-emerald-500 text-black hover:bg-emerald-400 transition shadow-sm cursor-pointer"
                    title="Change profile picture"
                    aria-label="Change profile picture"
                  >
                    <Camera size={14} />
                  </button>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-bold text-text-primary">{userName || 'Candidate'}</h3>
                      <p className="text-xs text-text-secondary">{userEmail || 'Authenticated User'}</p>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold self-center sm:self-auto">
                      <ShieldCheck size={12} />
                      <span>Verified Account</span>
                    </div>
                  </div>

                  <p className="text-xs text-text-secondary mt-2">
                    Your profile picture and primary credentials are authenticated via your provider. Click the camera icon to manage your avatar and social connections.
                  </p>
                </div>
              </div>

              {/* Career Targets Form */}
              <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-text-primary">Career Target Preferences</h3>
                    <p className="text-xs text-text-secondary">
                      Pepe calibrates mock interview difficulty, focus questions, and coding evaluation based on these targets.
                    </p>
                  </div>
                </div>

                {profileError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{profileError}</span>
                  </div>
                )}

                {savedSuccess && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>Preferences successfully saved to your PrepAI account.</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                        Target Role
                      </label>
                      <select
                        value={targetRole}
                        onChange={(e) => setTargetRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary focus:outline-none focus:border-emerald-500 transition"
                      >
                        {TARGET_ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                        Target Company Tier
                      </label>
                      <select
                        value={targetCompany}
                        onChange={(e) => setTargetCompany(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary focus:outline-none focus:border-emerald-500 transition"
                      >
                        {TARGET_COMPANIES.map((company) => (
                          <option key={company} value={company}>{company}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                        Experience Level
                      </label>
                      <select
                        value={experienceLevel}
                        onChange={(e) => setExperienceLevel(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary focus:outline-none focus:border-emerald-500 transition"
                      >
                        {EXPERIENCE_LEVELS.map((level) => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                        Years of Professional Experience
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={yearsExperience}
                        onChange={(e) => setYearsExperience(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isProfileSaving || isProfileLoading}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                    >
                      {isProfileSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                      <span>{isProfileSaving ? 'Saving Preferences...' : 'Save Career Preferences'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Preferred Resume Section */}
              <div className="p-4 sm:p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-emerald-400" />
                      <h3 className="text-base font-bold text-text-primary">Preferred Resume</h3>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Select which of your uploaded resumes Pepe should reference as your default context for mock interviews and AI coaching.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/resume-reviewer')}
                    className="px-3 py-1.5 rounded-xl bg-surface-elevated/70 hover:bg-surface-elevated border border-border text-xs font-medium text-text-primary flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
                  >
                    <Upload size={13} />
                    <span>Upload New Resume</span>
                  </button>
                </div>

                {resumeActionMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span>{resumeActionMessage}</span>
                  </div>
                )}

                {isLoadingResumes ? (
                  <div className="p-8 text-center text-xs text-text-secondary animate-pulse">
                    Loading your indexed resumes...
                  </div>
                ) : resumesError ? (
                  <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/10 text-center space-y-3">
                    <p className="text-xs text-red-400 font-medium">{resumesError}</p>
                    <button
                      type="button"
                      onClick={fetchUserResumes}
                      className="px-3.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-xs font-semibold text-text-primary transition cursor-pointer"
                    >
                      Retry Loading Resumes
                    </button>
                  </div>
                ) : resumes.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-border/80 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-surface-elevated mx-auto flex items-center justify-center text-text-secondary">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">No Resumes Uploaded Yet</h4>
                      <p className="text-xs text-text-secondary max-w-md mx-auto mt-1">
                        Upload your resume in the Resume Reviewer to get real-time ATS scoring, keyword match analysis, and interview question tailoring.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/resume-reviewer')}
                      className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload size={14} />
                      <span>Go to Resume Reviewer</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {resumes.map((resume) => (
                      <div
                        key={resume._id}
                        className={`p-3.5 sm:p-4 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 ${
                          resume.isPreferred
                            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs'
                            : 'bg-surface-elevated/40 border-border hover:border-border/80'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto flex-1">
                          <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${resume.isPreferred ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-elevated text-text-secondary'}`}>
                            <FileText size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span
                                className="text-xs font-bold text-text-primary truncate max-w-[180px] xs:max-w-[220px] sm:max-w-xs md:max-w-sm"
                                title={resume.fileName}
                              >
                                {resume.fileName}
                              </span>
                              {resume.isPreferred && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold shrink-0">
                                  <BookmarkCheck size={11} /> Preferred Default
                                </span>
                              )}
                              {resume.isHighestScore && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold shrink-0">
                                  <Award size={11} /> Highest ATS
                                </span>
                              )}
                              {resume.isNewest && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold shrink-0">
                                  Latest Upload
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-text-secondary mt-1.5">
                              <span className="truncate max-w-[200px] sm:max-w-xs">
                                Target: <strong className="text-text-primary font-medium">{resume.jobTitle}</strong>
                              </span>
                              <span className="hidden xs:inline text-text-secondary/50">•</span>
                              <span className="shrink-0 text-text-secondary/80">
                                {new Date(resume.createdAt).toLocaleDateString()}
                              </span>
                              <span className="hidden xs:inline text-text-secondary/50">•</span>
                              <span className={`font-semibold shrink-0 px-1.5 py-0.5 rounded ${resume.atsScore >= 75 ? 'bg-emerald-500/15 text-emerald-400' : resume.atsScore >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
                                ATS Score: {resume.atsScore}/100
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0 flex justify-end sm:block">
                          {resume.isPreferred ? (
                            <span className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                              <Check size={14} /> Active Preferred
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isSettingPreferred}
                              onClick={() => handleSelectPreferredResume(resume._id)}
                              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-xs font-semibold text-text-primary transition cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              Set as Preferred
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: PREFERENCES — How PrepAI Behaves                         */}
      {/* ============================================================== */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          {/* Guest Notice */}
          {!isLoggedIn && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center justify-between gap-3">
              <span>Theme and preferences are temporarily stored for your browser. Sign in to sync them to your cloud account.</span>
              <button
                type="button"
                onClick={() => (openLogin ? openLogin() : navigate('/login'))}
                className="px-3 py-1 rounded-lg bg-blue-500 text-white font-semibold shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            </div>
          )}

          {/* DSA Editor Language Configuration */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <h3 className="text-base font-bold text-text-primary mb-1">DSA Programming Language</h3>
            <p className="text-xs text-text-secondary mb-4">
              Sets the default programming language and boilerplate template when entering DSA Arena or solving a new coding problem.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'javascript', label: 'JavaScript', ext: '.js' },
                { id: 'python', label: 'Python', ext: '.py' },
                { id: 'cpp', label: 'C++', ext: '.cpp' },
                { id: 'java', label: 'Java', ext: '.java' },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleLanguageChange(lang.id)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    defaultLanguage === lang.id
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-xs'
                      : 'bg-surface-elevated/40 border-border hover:border-border/80 text-text-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{lang.label}</span>
                    {defaultLanguage === lang.id && <Check size={14} className="text-emerald-400" />}
                  </div>
                  <span className="text-[10px] text-text-secondary mt-1 block">Default editor syntax</span>
                </button>
              ))}
            </div>
          </div>

          {/* Speech Synthesis Voice Selection */}
          <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <h3 className="text-base font-bold text-text-primary mb-1">Behavioral Coach Voice</h3>
            <p className="text-xs text-text-secondary mb-4">
              Select the speech synthesis voice Pepe uses during mock interviews. Microsoft voices are excluded; Google UK English is preferred where available.
            </p>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <select
                    value={selectedVoiceName}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary focus:outline-none focus:border-emerald-500 transition"
                  >
                    {voices.length === 0 ? (
                      <option value="">Default System Voice</option>
                    ) : (
                      voices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handlePlayVoiceSample}
                  disabled={isPlayingVoiceSample}
                  className="px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-xs font-semibold text-text-primary flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  {isPlayingVoiceSample ? <RefreshCw size={14} className="animate-spin text-emerald-400" /> : <Play size={14} />}
                  <span>{isPlayingVoiceSample ? 'Speaking...' : 'Test Voice Audio'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB: APPEARANCE — Theme & Dashboard Wallpaper                  */}
      {/* ============================================================== */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          {/* Theme & Mode Configuration */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <h3 className="text-base font-bold text-text-primary mb-1">Color Theme & Mode</h3>
            <p className="text-xs text-text-secondary mb-4">
              Switch between Dark and Light mode. Your choice is persisted seamlessly across all pages.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => {
                  setTheme('dark');
                  trackEvent(ALLOWED_EVENTS.SETTINGS_PREFERENCE_CHANGED, {
                    setting_type: 'theme',
                    new_value: 'dark',
                  });
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 ring-1 ring-emerald-500/30 shadow-xs'
                    : 'bg-surface-elevated/40 border-border text-text-primary hover:border-border/80'
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs font-semibold">
                  <Moon size={16} />
                  <span>Dark Mode</span>
                </div>
                {theme === 'dark' && <Check size={14} className="text-emerald-400" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setTheme('light');
                  trackEvent(ALLOWED_EVENTS.SETTINGS_PREFERENCE_CHANGED, {
                    setting_type: 'theme',
                    new_value: 'light',
                  });
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 ring-1 ring-emerald-500/30 shadow-xs'
                    : 'bg-surface-elevated/40 border-border text-text-primary hover:border-border/80'
                }`}
              >
                <div className="flex items-center gap-2.5 text-xs font-semibold">
                  <Sun size={16} />
                  <span>Light Mode</span>
                </div>
                {theme === 'light' && <Check size={14} className="text-emerald-400" />}
              </button>
            </div>
          </div>

          {/* Wallpaper Gallery & Custom Upload */}
          <div className="p-5 sm:p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-text-primary mb-0.5">Dashboard Background Wallpaper</h3>
                <p className="text-xs text-text-secondary">
                  Choose a personalized high-resolution wallpaper or upload your own image for your home dashboard.
                </p>
              </div>
              {hasCustomBg && (
                <span className="self-start sm:self-auto text-[11px] px-2.5 py-1 rounded-full bg-surface-elevated border border-border text-text-secondary font-medium">
                  {dashboardBgId === 'custom' ? 'Custom Wallpaper Active' : 'Custom Wallpaper Stored'}
                </span>
              )}
            </div>

            {/* Built-in Wallpaper Grid (8 real assets) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
              {builtInBackgrounds.map((bg) => {
                const isSelected = !hasCustomBg && dashboardBgId === bg.id;
                const isFailed = failedImages[bg.id];

                return (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => {
                      selectBuiltInBg(bg.id);
                      trackEvent(ALLOWED_EVENTS.SETTINGS_PREFERENCE_CHANGED, {
                        setting_type: 'wallpaper',
                        new_value: bg.id,
                      });
                    }}
                    className={`relative rounded-xl overflow-hidden border transition-all duration-200 group text-left aspect-video cursor-pointer touch-manipulation focus:outline-none ${
                      isSelected
                        ? 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                        : 'border-border/70 hover:border-border/90 hover:shadow-md'
                    }`}
                    title={bg.name}
                  >
                    {/* Active Selected Badge */}
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-slate-950 p-1 rounded-full shadow-md z-20 flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}

                    {/* Category Tag */}
                    {bg.tag && (
                      <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/65 text-white/95 backdrop-blur-sm z-20 border border-white/10 shadow-xs">
                        {bg.tag}
                      </span>
                    )}

                    {/* Image with Graceful Error Fallback */}
                    {isFailed ? (
                      <div className="absolute inset-0 bg-gradient-to-br from-surface-elevated via-surface to-background flex flex-col items-center justify-center p-3 text-center">
                        <ImageOff size={22} className="text-text-secondary/60 mb-1" />
                        <span className="text-[11px] font-medium text-text-secondary">{bg.name}</span>
                      </div>
                    ) : (
                      <img
                        src={bg.path || bg.url}
                        alt={bg.name}
                        loading="lazy"
                        onError={() => handleImageError(bg.id)}
                        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                      />
                    )}

                    {/* Gradient Text Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex flex-col justify-end z-10 pointer-events-none">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate drop-shadow-sm">{bg.name}</span>
                        {isSelected && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/75 line-clamp-1 leading-tight drop-shadow-sm mt-0.5">
                        {bg.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Background Upload Area */}
            <div className="pt-4 border-t border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Custom Wallpaper
                </h4>
                <span className="text-[11px] text-text-secondary">
                  JPG, PNG, WebP • Max 8 MB
                </span>
              </div>

              {!isLoggedIn ? (
                /* Signed-Out / Guest Locked Upload State */
                <div
                  onClick={() => (openLogin ? openLogin() : navigate('/login'))}
                  className="p-5 rounded-xl border border-dashed border-border/80 bg-surface/40 hover:bg-surface/60 transition cursor-pointer text-center group"
                  role="button"
                  tabIndex={0}
                  aria-label="Sign in to upload a custom background"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-elevated mx-auto flex items-center justify-center text-emerald-400 mb-2 border border-border/60 group-hover:scale-105 transition-transform shadow-xs">
                    <Lock size={18} />
                  </div>
                  <span className="text-xs font-semibold text-text-primary block">
                    Sign in to upload a custom background
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5 max-w-sm mx-auto">
                    Custom high-resolution wallpapers are saved to your personal account profile.
                  </p>
                </div>
              ) : (
                /* Authenticated Custom Upload State */
                <>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (!isLoggedIn) {
                        setUploadError('Please sign in to upload custom backgrounds.');
                        if (openLogin) openLogin();
                        return;
                      }
                      if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]);
                    }}
                    className={`p-5 rounded-xl border border-dashed text-center transition cursor-pointer ${
                      isDragging ? 'border-emerald-400 bg-emerald-500/10' : 'border-border/80 hover:border-border bg-surface-elevated/20'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                      }}
                    />
                    <Upload size={20} className="mx-auto text-emerald-400 mb-1.5" />
                    <span className="text-xs font-semibold text-text-primary block">
                      Click to upload custom background (JPG, PNG, WebP)
                    </span>
                    <span className="text-[10px] text-text-secondary mt-0.5 block">
                      Up to 8 MB. High resolution (1920x1080 or 4K) recommended.
                    </span>
                  </div>

                  {uploadError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}

                  {/* Active / Stored Custom Background Management Card */}
                  {hasCustomBg && !pendingUpload && (
                    <div className="p-3.5 rounded-xl bg-surface-elevated/40 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-14 h-9 rounded-lg overflow-hidden border border-border shrink-0 bg-black">
                          <img
                            src={dashboardBgId === 'custom' ? dashboardBg : '/backgrounds/bg-lake-morning.jpg'}
                            alt="Custom Background"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-text-primary truncate">
                              {customBgMeta?.fileName || 'Custom Wallpaper'}
                            </span>
                            {dashboardBgId === 'custom' && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            {customBgMeta?.sizeBytes ? formatBytes(customBgMeta.sizeBytes) : ''}
                            {customBgMeta?.width && customBgMeta?.height ? ` • ${customBgMeta.width}x${customBgMeta.height}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                        {dashboardBgId !== 'custom' && (
                          <button
                            type="button"
                            onClick={selectExistingCustomBg}
                            className="px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-xs font-semibold text-text-primary transition cursor-pointer"
                          >
                            Apply Custom
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={removeCustomBg}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition cursor-pointer"
                          title="Delete Custom Background"
                          aria-label="Delete Custom Background"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pending Upload Preview Card */}
                  {pendingUpload && (
                    <div className="p-3.5 rounded-xl bg-surface-elevated border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={pendingUpload.previewUrl}
                          alt="Preview"
                          className="w-14 h-9 object-cover rounded-lg border border-border shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-text-primary truncate block">
                            {pendingUpload.meta.name}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            {formatBytes(pendingUpload.meta.size)} • {pendingUpload.meta.width}x{pendingUpload.meta.height}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(pendingUpload.previewUrl);
                            setPendingUpload(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isApplying}
                          onClick={handleApplyPendingUpload}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                        >
                          {isApplying ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                          <span>{isApplying ? 'Applying...' : 'Apply Wallpaper'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ACCOUNT & PERSONALIZATION — What PrepAI Stores & Uses   */}
      {/* ============================================================== */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {!isLoaded ? (
            <div className="p-8 rounded-2xl bg-surface/70 border border-border/60 animate-pulse text-center">
              <div className="h-5 bg-surface-elevated rounded w-1/3 mx-auto mb-3" />
              <div className="h-4 bg-surface-elevated rounded w-1/2 mx-auto" />
            </div>
          ) : !isLoggedIn ? (
            /* Guest Account State */
            <div className="p-8 rounded-2xl bg-surface/70 border border-border/60 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-surface-elevated mx-auto flex items-center justify-center text-emerald-400 shadow-sm">
                <Lock size={24} />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-bold text-text-primary">Account & Personalization Requires Sign In</h3>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                  Sign in to inspect your persistent memory profile with Pepe, review verified learning progress, and manage tailored preparation goals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => (openLogin ? openLogin() : navigate('/login'))}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <LogIn size={15} />
                <span>Sign In / Create Account</span>
              </button>
            </div>
          ) : (
            /* Authenticated Account & Personalization View */
            <div className="space-y-6">
              {/* SECTION A: WHAT PEPE KNOWS ABOUT YOU */}
              <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Brain size={18} className="text-emerald-400" />
                      <h3 className="text-base font-bold text-text-primary">What Pepe Knows About You</h3>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Personalized memory facts Pepe uses during mock interviews and coach sessions. Edit or remove items to adjust subsequent AI behavior.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddMemoryModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-xs font-semibold inline-flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add Confirmed Fact</span>
                  </button>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
                  {MEMORY_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedMemoryCategory(cat.id)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold transition shrink-0 cursor-pointer ${
                        selectedMemoryCategory === cat.id
                          ? 'bg-emerald-500 text-black shadow-xs'
                          : 'bg-surface-elevated/60 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Add Memory Modal / Form */}
                {showAddMemoryModal && (
                  <form onSubmit={handleCreateMemory} className="mb-4 p-4 rounded-xl bg-surface-elevated/70 border border-emerald-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text-primary">Add Confirmed Personal Fact / Preference</span>
                      <button
                        type="button"
                        onClick={() => setShowAddMemoryModal(false)}
                        className="text-text-secondary hover:text-text-primary"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-text-secondary mb-1">Category</label>
                        <select
                          value={newMemoryCategory}
                          onChange={(e) => setNewMemoryCategory(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-primary"
                        >
                          <option value="technical_strength">Technical Strength</option>
                          <option value="technical_weakness">Growth Area</option>
                          <option value="experience">Experience Fact</option>
                          <option value="preference">Preference</option>
                          <option value="goal">Career Goal</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-text-secondary mb-1">Memory Content</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 4 years of hands-on experience building production Kubernetes pipelines"
                          value={newMemoryContent}
                          onChange={(e) => setNewMemoryContent(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-primary"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddMemoryModal(false)}
                        className="px-3 py-1 rounded-lg text-xs text-text-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingMemory}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs"
                      >
                        {isSavingMemory ? 'Saving...' : 'Save to Memory'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Memories List */}
                {isLoadingMemories ? (
                  <div className="p-8 text-center text-xs text-text-secondary animate-pulse">
                    Loading personalization memories...
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-border/80 text-center">
                    <p className="text-xs text-text-secondary">
                      No memories found in this category. As you practice mock interviews or add personal facts, Pepe will record verified context here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredMemories.map((mem) => {
                      const isManual = mem.source === 'manual';
                      const isEditing = editingMemoryId === mem._id;

                      return (
                        <div
                          key={mem._id}
                          className="p-3.5 rounded-xl bg-surface-elevated/40 border border-border/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                                {mem.category.replace('_', ' ')}
                              </span>

                              {isManual ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                  User Fact
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 text-[10px] font-bold">
                                  AI Inferred ({mem.source})
                                </span>
                              )}

                              <span className="text-[10px] text-text-secondary">
                                Confirmed: {new Date(mem.lastConfirmedAt).toLocaleDateString()}
                              </span>
                            </div>

                            {isEditing ? (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editMemoryContent}
                                  onChange={(e) => setEditMemoryContent(e.target.value)}
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-surface border border-emerald-500 text-xs text-text-primary"
                                />
                                <button
                                  type="button"
                                  disabled={isSavingMemory}
                                  onClick={() => handleUpdateMemory(mem._id)}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-semibold"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMemoryId(null)}
                                  className="px-2 py-1.5 text-xs text-text-secondary"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-text-primary leading-relaxed">{mem.content}</p>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemoryId(mem._id);
                                  setEditMemoryContent(mem.content);
                                }}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition"
                                title="Edit memory"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMemory(mem._id)}
                                className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-surface transition"
                                title="Delete memory"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION B: LEARNING & PROGRESS */}
              <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-400" />
                      <h3 className="text-base font-bold text-text-primary">Learning & Progress</h3>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Empirical activity records from your verified coding problem submissions and interview evaluations.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/progress')}
                    className="px-3 py-1.5 rounded-xl bg-surface-elevated/70 hover:bg-surface-elevated border border-border text-xs font-medium text-text-primary inline-flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
                  >
                    <span>Full Analytics View</span>
                    <ExternalLink size={12} />
                  </button>
                </div>

                <div className="mb-4 p-2.5 rounded-xl bg-surface-elevated/40 border border-border/50 text-[11px] text-text-secondary flex items-center gap-2">
                  <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                  <span>These records reflect verified compiler submissions and scored interview sessions, distinct from AI inferences.</span>
                </div>

                {isLoadingProgress ? (
                  <div className="p-6 text-center text-xs text-text-secondary animate-pulse">
                    Loading activity metrics...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase">Problems Solved</span>
                      <h4 className="text-xl font-bold text-text-primary mt-1">
                        {dsaStatsData?.totalSolved ?? progressData?.dsaStats?.uniqueSolved ?? 0}
                      </h4>
                      <span className="text-[10px] text-emerald-400 mt-0.5 block">
                        Accuracy: {dsaStatsData?.accuracy ?? progressData?.dsaStats?.accuracyRate ?? 0}%
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase">Interviews Done</span>
                      <h4 className="text-xl font-bold text-text-primary mt-1">
                        {progressData?.chatSessions?.length ?? 0}
                      </h4>
                      <span className="text-[10px] text-text-secondary mt-0.5 block">Completed sessions</span>
                    </div>

                    <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase">Current Streak</span>
                      <h4 className="text-xl font-bold text-text-primary mt-1">
                        {progressData?.currentStreak ?? 0} days
                      </h4>
                      <span className="text-[10px] text-emerald-400 mt-0.5 block">Consecutive activity</span>
                    </div>

                    <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase">Latest ATS Match</span>
                      <h4 className="text-xl font-bold text-text-primary mt-1">
                        {progressData?.resumeReviews?.[0]?.atsAssessment?.estimatedScore ?? 'N/A'}{progressData?.resumeReviews?.[0] ? '/100' : ''}
                      </h4>
                      <span className="text-[10px] text-text-secondary mt-0.5 block">Preferred resume</span>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION C: PREPARATION GOALS */}
              <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Target size={18} className="text-emerald-400" />
                      <h3 className="text-base font-bold text-text-primary">Preparation Goals & Schedule</h3>
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Your active study roadmap. Updating your focus topics updates your daily DSA problem recommendation engine.
                    </p>
                  </div>
                </div>

                {goalsSuccessMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 size={15} />
                    <span>{goalsSuccessMessage}</span>
                  </div>
                )}

                {isLoadingGoals ? (
                  <div className="p-6 text-center text-xs text-text-secondary animate-pulse">
                    Loading your study plan...
                  </div>
                ) : (
                  <form onSubmit={handleSaveGoals} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          Target Companies
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Google, Meta, Stripe"
                          value={goalsProfile.targetCompanies}
                          onChange={(e) => setGoalsProfile({ ...goalsProfile, targetCompanies: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          Daily Time Commitment
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 1 hour / day"
                          value={goalsProfile.dailyTime}
                          onChange={(e) => setGoalsProfile({ ...goalsProfile, dailyTime: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          Focus Areas / Weak Topics
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Dynamic Programming, Graphs, System Design"
                          value={goalsProfile.weakTopics}
                          onChange={(e) => setGoalsProfile({ ...goalsProfile, weakTopics: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          Daily Practice Target
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 2 LeetCode Mediums + 1 Behavioral Story"
                          value={goalsProfile.dailyTarget}
                          onChange={(e) => setGoalsProfile({ ...goalsProfile, dailyTarget: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface-elevated/70 border border-border text-xs text-text-primary"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSavingGoals}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Save size={14} />
                        <span>{isSavingGoals ? 'Saving Plan...' : 'Save Preparation Goals'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* SECTION D: ACCOUNT ACTIONS */}
              <div className="p-6 rounded-2xl bg-surface/70 backdrop-blur-md border border-border/60">
                <h3 className="text-base font-bold text-text-primary mb-1">Account & Session Management</h3>
                <p className="text-xs text-text-secondary mb-4">
                  Manage authentication credentials, identity settings, and active browser sessions.
                </p>

                <div className="p-4 rounded-xl bg-surface-elevated/50 border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider block">
                      Account Status
                    </span>
                    <p className="text-sm font-semibold text-text-primary truncate mt-0.5">
                      {userEmail || 'Authenticated User'}
                    </p>
                    <span className="text-[11px] text-text-secondary mt-0.5 block">
                      Managed via Clerk Authentication
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => openUserProfile && openUserProfile()}
                      className="px-3.5 py-2 rounded-xl bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-xs font-semibold text-text-primary transition cursor-pointer"
                    >
                      Manage Security & DP
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to sign out of PrepAI?')) {
                          logout();
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
