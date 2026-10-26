import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Send,
  LogOut,
  RefreshCw,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PlayCircle,
  FileText,
  Upload,
  CheckCircle,
  Loader2,
  LogIn,
  AlertCircle,
  Award,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Briefcase,
  Building2,
  GraduationCap,
  X,
  Square,
  Trash2,
  Edit3,
  Target,
  ShieldCheck,
  Activity,
  Keyboard,
  ArrowRight,
  Circle,
  CheckCircle2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PepeAvatar from '../components/PepeAvatar';
import AudioWaveform from '../components/AudioWaveform';
import { SpeechTranscriptAccumulator, processSpeechVoices } from '../utils/speechUtils';

// Experience Level Definitions
export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: 'intern', label: 'Student / Intern', description: 'Academic projects, fundamentals & problem solving' },
  { value: 'fresher', label: 'Fresher / Entry-Level (0–1 yrs)', description: 'Core CS concepts, coursework & reasoning' },
  { value: 'junior', label: 'Junior (1–3 yrs)', description: 'Implementation decisions, practical debugging & features' },
  { value: 'mid', label: 'Mid-Level (3–5 yrs)', description: 'System design, trade-offs, architecture & ownership' },
  { value: 'senior', label: 'Senior (5+ yrs)', description: 'Scalability, reliability, leadership & production systems' },
  { value: 'lead', label: 'Lead / Staff / Principal', description: 'Cross-system architecture, strategy & high-stakes decisions' },
];

export const COMPANY_OPTIONS = [
  'Google',
  'Meta',
  'Amazon',
  'Microsoft',
  'Apple',
  'Netflix',
  'Stripe',
  'Uber',
  'Tech Company',
];

export const MILESTONES = [
  { id: 1, label: 'Welcome and Introduction', triggerTurn: 1 },
  { id: 2, label: 'Fundamentals & Experience', triggerTurn: 2 },
  { id: 3, label: 'Problem Solving', triggerTurn: 4 },
  { id: 4, label: 'System Design & Trade-offs', triggerTurn: 6 },
  { id: 5, label: 'Behavioral & Collaboration', triggerTurn: 7 },
  { id: 6, label: 'Wrap Up', triggerTurn: 8 },
];

// Clean model Markdown artifacts before passing to browser speech synthesis
const cleanTextForSpeech = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/^###\s*/gm, '')
    .replace(/^##\s*/gm, '')
    .replace(/^#\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-•*]\s+/gm, '')
    .replace(/---/g, '')
    .trim();
};

// Check if a message contains a final interview assessment report
const isReportMessage = (text) => {
  if (!text || typeof text !== 'string') return false;
  return (
    text.includes('### Interview Completed') ||
    text.includes('Candidate Evaluation Report') ||
    text.includes('Overall Assessment') ||
    (text.includes('Technical Strengths') && text.includes('Technical Weaknesses')) ||
    (text.includes('Strengths') && text.includes('Areas to Improve'))
  );
};

// Polished Final Report UI Card Component with Celebratory Avatar
const InterviewReportCard = ({
  text,
  targetRole,
  targetCompany,
  experienceLevel,
  onRestart,
  onSpeak,
  isTtsEnabled
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy report:', err);
    }
  };

  const levelLabel =
    EXPERIENCE_LEVEL_OPTIONS.find((opt) => opt.value === experienceLevel)?.label ||
    experienceLevel ||
    'Entry-level';

  return (
    <div className="w-full max-w-3xl my-3 bg-surface/90 border border-accent/40 rounded-xl shadow-2xl p-6 text-text-primary backdrop-blur-sm animate-in fade-in duration-300">
      {/* Top Banner / Metadata */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-text-secondary/20">
        <div className="flex items-center gap-3">
          <PepeAvatar size="lg" isCelebrating={true} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-accent">Candidate Evaluation Report</h3>
              <span className="px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-semibold">
                Completed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-surface border border-text-secondary/30 text-text-secondary font-medium">
                Role: <span className="text-text-primary">{targetRole}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface border border-text-secondary/30 text-text-secondary font-medium">
                Company: <span className="text-text-primary">{targetCompany}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface border border-accent/30 text-accent font-medium">
                Level: <span className="text-text-primary">{levelLabel}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-text-secondary/30 text-xs font-medium text-text-secondary hover:text-accent hover:border-accent/50 transition-colors"
            title="Copy Report to Clipboard"
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-400" />
                <span className="text-green-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>Copy Report</span>
              </>
            )}
          </button>
          {isTtsEnabled && (
            <button
              onClick={() => onSpeak(text)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-text-secondary/30 text-xs font-medium text-text-secondary hover:text-accent hover:border-accent/50 transition-colors"
              title="Listen to feedback"
            >
              <Volume2 size={14} />
              <span>Listen</span>
            </button>
          )}
          <button
            onClick={onRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-darker transition-colors"
            title="Start New Interview"
          >
            <RotateCcw size={14} />
            <span>New Interview</span>
          </button>
        </div>
      </div>

      {/* Structured Report Markdown Rendering */}
      <div className="pt-4 text-sm leading-relaxed prose dark:prose-invert text-text-primary max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => (
              <h1 className="text-xl font-bold text-accent mt-4 mb-2 pb-1 border-b border-text-secondary/20" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-lg font-bold text-accent mt-4 mb-2" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-base font-semibold text-accent/90 mt-3 mb-1" {...props} />
            ),
            p: ({ node, ...props }) => (
              <p className="text-sm text-text-primary/95 leading-relaxed mb-3" {...props} />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc list-inside space-y-1.5 mb-3 text-sm text-text-primary/90 pl-1" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal list-inside space-y-1.5 mb-3 text-sm text-text-primary/90 pl-1" {...props} />
            ),
            li: ({ node, ...props }) => (
              <li className="leading-relaxed" {...props} />
            ),
            strong: ({ node, ...props }) => (
              <strong className="font-semibold text-accent" {...props} />
            ),
            code: ({ node, inline, children, ...props }) => {
              if (inline || !String(children).includes('\n')) {
                return (
                  <code className="bg-surface text-accent px-1.5 py-0.5 rounded text-xs font-mono border border-text-secondary/20" {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <pre className="bg-surface text-text-primary p-3 rounded-lg overflow-x-auto text-xs font-mono my-2.5 border border-text-secondary/25 leading-relaxed">
                  <code {...props}>{children}</code>
                </pre>
              );
            },
            hr: ({ node, ...props }) => (
              <hr className="border-t border-text-secondary/20 my-4" {...props} />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote className="border-l-4 border-accent/60 pl-3 py-1 my-2 italic text-text-secondary bg-surface/50 rounded-r" {...props} />
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
};

const BehavioralCoach = () => {
  const { getToken, isLoggedIn, userId, userName } = useAuth();
  const { openLogin } = useModal();
  const navigate = useNavigate();

  const userInitial = userName ? userName.trim().charAt(0).toUpperCase() : 'A';

  // Session & conversation state
  const [sessionId, setSessionId] = useState(null);
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const requestInFlightRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionOver, setIsSessionOver] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(0);
  const isInitialScrolledRef = useRef(false);
  const lastHydratedSessionIdRef = useRef(null);
  const saveBehavioralStateRef = useRef(null);

  // Audio / Speech Synthesis state (TTS)
  const [voices, setVoices] = useState([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activityRecorded, setActivityRecorded] = useState(false);

  // Setup state
  const [showSetup, setShowSetup] = useState(false);
  const [targetRole, setTargetRole] = useState(() => {
    return localStorage.getItem('prepai_target_role') || 'Software Engineer';
  });
  const [targetCompany, setTargetCompany] = useState(() => {
    return localStorage.getItem('prepai_target_company') || 'Google';
  });
  const [experienceLevel, setExperienceLevel] = useState('mid');
  const [difficulty, setDifficulty] = useState('Medium');
  const [startingDifficulty, setStartingDifficulty] = useState('Medium');
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState('Medium');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [focusAreas, setFocusAreas] = useState('');
  const [useResume, setUseResume] = useState(true);
  const [interviewType, setInterviewType] = useState('Behavioral'); // 'Technical' | 'Behavioral' | 'Mixed'
  const [stagePlan, setStagePlan] = useState([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);

  // Resume status & Upload state
  const [resumeStatus, setResumeStatus] = useState({ hasResume: false, documentId: null });
  const [isCheckingResume, setIsCheckingResume] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef(null);

  // ---------------------------------------------------------
  // Voice Recording Studio State & Web Audio API
  // ---------------------------------------------------------
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechError, setSpeechError] = useState(null);
  const [analyserNode, setAnalyserNode] = useState(null);

  const recognitionRef = useRef(null);
  const accumulatorRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const isRecordingStateRef = useRef(false);
  const timerIntervalRef = useRef(null);
  const preRecordingInputRef = useRef('');

  const [isTtsEnabled, setIsTtsEnabled] = useState(() => {
    const saved = localStorage.getItem('isTtsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('isTtsEnabled', JSON.stringify(isTtsEnabled));
  }, [isTtsEnabled]);

  // Format recording timer into mm:ss
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ---------------------------------------------------------
  // Speech Synthesis Voices Loading & Preferred Google UK Selection
  // ---------------------------------------------------------
  const loadVoices = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const allVoices = window.speechSynthesis.getVoices();
    const saved = localStorage.getItem('preferredVoiceName') || '';

    const { sortedVoices, defaultVoiceName } = processSpeechVoices(allVoices, saved);
    setVoices(sortedVoices);

    if (defaultVoiceName) {
      setSelectedVoiceName(defaultVoiceName);
    }
  }, []);

  useEffect(() => {
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      };
    }
  }, [loadVoices]);

  // Clean up all audio and speech resources on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
    };
  }, []);

  // Safe release of microphone and Web Audio analyser resources
  const cleanupAudioResources = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }

    setAnalyserNode(null);
    isRecordingStateRef.current = false;
  };

  // ---------------------------------------------------------
  // Voice Recording Lifecycle & Pause-Preserving Accumulation
  // ---------------------------------------------------------
  const startVoiceRecording = async () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError(
        "Voice speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari."
      );
      setTimeout(() => setSpeechError(null), 6000);
      return;
    }

    stopSpeaking(); // Stop any active TTS audio
    setSpeechError(null);
    cleanupAudioResources();

    // Preserve any text already typed before voice input was initiated
    preRecordingInputRef.current = input;
    accumulatorRef.current = new SpeechTranscriptAccumulator(input);

    setIsVoiceMode(true);
    setIsRecording(true);
    isRecordingStateRef.current = true;
    setRecordingSeconds(0);

    // 1. Initialize Web Audio API AnalyserNode for the real-time audio waveform
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        mediaStreamRef.current = stream;

        const AudioContextClass =
          window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64; // Provides 32 frequency bins, ideal for 16-bar symmetrical waveform
          analyser.smoothingTimeConstant = 0.75;
          source.connect(analyser);
          setAnalyserNode(analyser);
        }
      }
    } catch (audioErr) {
      console.warn("Could not initialize audio waveform analyzer:", audioErr);
      // Non-fatal: continue with speech recognition even if visualizer fails
    }

    // 2. Start SpeechRecognition with cumulative transcript accumulation
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        isRecordingStateRef.current = true;
      };

      recognition.onresult = (event) => {
        if (!accumulatorRef.current) return;
        const currentFull = accumulatorRef.current.handleResult(event);
        setInput(currentFull);
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setSpeechError("Microphone permission was denied. Please allow microphone access in your browser.");
          stopVoiceRecording();
        } else if (event.error === 'network') {
          setSpeechError("Network error during speech recognition. Please verify your connection.");
        }
      };

      recognition.onend = () => {
        // If the browser paused the recognition stream due to silence,
        // seamlessly commit past results and restart so earlier words are never lost!
        if (isRecordingStateRef.current) {
          accumulatorRef.current?.commitSession();
          try {
            recognition.start();
          } catch (e) {
            stopVoiceRecording();
          }
        } else {
          setIsRecording(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();

      // 3. Start Recording Timer Interval
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start voice recognition:", err);
      setSpeechError("Failed to start microphone. Please check permissions.");
      stopVoiceRecording();
    }
  };

  // Stop recording, release audio stream, but KEEP transcript in editable input
  const stopVoiceRecording = () => {
    isRecordingStateRef.current = false;
    setIsRecording(false);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }

    setAnalyserNode(null);

    // Finalize accumulated transcript into input field
    if (accumulatorRef.current) {
      const finalized = accumulatorRef.current.getFinalizedTranscript();
      if (finalized) {
        setInput(finalized);
      }
    }
  };

  // Cancel recording and revert to pre-recording input
  const cancelVoiceRecording = () => {
    stopVoiceRecording();
    setInput(preRecordingInputRef.current || '');
    setIsVoiceMode(false);
  };

  // Finish and submit voice answer
  const submitVoiceAnswer = () => {
    stopVoiceRecording();
    setIsVoiceMode(false);
    if ((input ?? '').trim()) {
      handleSubmit();
    }
  };

  // ---------------------------------------------------------
  // Check existing resume status for authenticated user
  // ---------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    const checkResume = async () => {
      if (!isLoggedIn) {
        setResumeStatus({ hasResume: false, documentId: null });
        return;
      }
      setIsCheckingResume(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/interview/resume-status`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (isMounted && res.data) {
          setResumeStatus(res.data);
          if (res.data.hasResume) {
            setUseResume(true);
          }
        }
      } catch (err) {
        console.warn("Could not check resume status:", err);
      } finally {
        if (isMounted) setIsCheckingResume(false);
      }
    };
    checkResume();
    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, getToken]);

  // ---------------------------------------------------------
  // Behavioral Coach persistence
  // ---------------------------------------------------------
  const behavioralStorageKey = userId ? `prepai:${userId}:behavioral` : null;

  const saveBehavioralState = useCallback(
    (overrides = {}) => {
      if (!behavioralStorageKey) return;
      try {
        const stateToSave = {
          messages: overrides.messages !== undefined ? overrides.messages : messages,
          targetRole: (overrides.targetRole !== undefined ? overrides.targetRole : targetRole) ?? '',
          targetCompany: (overrides.targetCompany !== undefined ? overrides.targetCompany : targetCompany) ?? 'Tech Company',
          interviewType: (overrides.interviewType !== undefined ? overrides.interviewType : interviewType) ?? 'Behavioral',
          difficulty: (overrides.difficulty !== undefined ? overrides.difficulty : difficulty) ?? 'Medium',
          startingDifficulty: (overrides.startingDifficulty !== undefined ? overrides.startingDifficulty : startingDifficulty) ?? 'Medium',
          adaptiveDifficulty: (overrides.adaptiveDifficulty !== undefined ? overrides.adaptiveDifficulty : adaptiveDifficulty) ?? 'Medium',
          experienceLevel: (overrides.experienceLevel !== undefined ? overrides.experienceLevel : experienceLevel) ?? 'fresher',
          yearsOfExperience: (overrides.yearsOfExperience !== undefined ? overrides.yearsOfExperience : yearsOfExperience) ?? '',
          focusAreas: (overrides.focusAreas !== undefined ? overrides.focusAreas : focusAreas) ?? '',
          stagePlan: overrides.stagePlan !== undefined ? overrides.stagePlan : stagePlan,
          currentStageIndex: overrides.currentStageIndex !== undefined ? overrides.currentStageIndex : currentStageIndex,
          useResume: overrides.useResume !== undefined ? overrides.useResume : useResume,
          isSessionOver: overrides.isSessionOver !== undefined ? overrides.isSessionOver : isSessionOver,
          activityRecorded: overrides.activityRecorded !== undefined ? overrides.activityRecorded : activityRecorded,
          sessionId: overrides.sessionId !== undefined ? overrides.sessionId : sessionId,
          showSetup: overrides.showSetup !== undefined ? overrides.showSetup : showSetup
        };

        localStorage.setItem(behavioralStorageKey, JSON.stringify(stateToSave));
      } catch (error) {
        console.error("Failed to save Behavioral Coach state:", error);
      }
    },
    [
      behavioralStorageKey,
      messages,
      sessionId,
      targetRole,
      targetCompany,
      interviewType,
      difficulty,
      startingDifficulty,
      adaptiveDifficulty,
      experienceLevel,
      yearsOfExperience,
      focusAreas,
      stagePlan,
      currentStageIndex,
      useResume,
      isSessionOver,
      activityRecorded,
      showSetup
    ]
  );

  useEffect(() => {
    saveBehavioralStateRef.current = saveBehavioralState;
  }, [saveBehavioralState]);

  useEffect(() => {
    if (!behavioralStorageKey) return;
    try {
      const savedState = localStorage.getItem(behavioralStorageKey);
      if (!savedState) return;

      const parsedState = JSON.parse(savedState);
      if (parsedState.sessionId) setSessionId(parsedState.sessionId);
      if (Array.isArray(parsedState.messages) && parsedState.messages.length > 0) {
        setMessages(parsedState.messages);
      }
      if (parsedState.targetRole != null) setTargetRole(String(parsedState.targetRole));
      if (parsedState.targetCompany != null) setTargetCompany(String(parsedState.targetCompany));
      if (parsedState.interviewType != null) setInterviewType(String(parsedState.interviewType));
      if (parsedState.difficulty != null) setDifficulty(String(parsedState.difficulty));
      if (parsedState.startingDifficulty != null) {
        setStartingDifficulty(String(parsedState.startingDifficulty));
      } else if (parsedState.difficulty != null) {
        setStartingDifficulty(String(parsedState.difficulty));
      }
      if (parsedState.adaptiveDifficulty != null) {
        setAdaptiveDifficulty(String(parsedState.adaptiveDifficulty));
      } else if (parsedState.difficulty != null) {
        setAdaptiveDifficulty(String(parsedState.difficulty));
      }
      if (parsedState.experienceLevel != null) setExperienceLevel(String(parsedState.experienceLevel));
      if (parsedState.yearsOfExperience !== undefined) {
        setYearsOfExperience(parsedState.yearsOfExperience != null ? String(parsedState.yearsOfExperience) : '');
      }
      if (parsedState.focusAreas !== undefined) {
        setFocusAreas(parsedState.focusAreas != null ? String(parsedState.focusAreas) : '');
      }
      if (Array.isArray(parsedState.stagePlan)) setStagePlan(parsedState.stagePlan);
      if (typeof parsedState.currentStageIndex === 'number') setCurrentStageIndex(parsedState.currentStageIndex);
      if (parsedState.useResume !== undefined) setUseResume(Boolean(parsedState.useResume));
      if (parsedState.isSessionOver !== undefined) setIsSessionOver(Boolean(parsedState.isSessionOver));
      if (parsedState.activityRecorded !== undefined) setActivityRecorded(Boolean(parsedState.activityRecorded));
      if (parsedState.showSetup !== undefined) setShowSetup(Boolean(parsedState.showSetup));

      console.log("Behavioral Coach state restored from localStorage.");
    } catch (error) {
      console.error("Failed to restore Behavioral Coach state:", error);
    }
  }, [behavioralStorageKey]);

  // ---------------------------------------------------------
  // Authoritative Backend Session Hydration on Mount/Reload
  // ---------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    const hydrateAuthoritativeSession = async () => {
      if (!sessionId || !isLoggedIn) return;
      if (lastHydratedSessionIdRef.current === sessionId) return;

      try {
        const token = await getToken();
        if (!token || !isMounted) return;

        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/interview/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!isMounted || !res.data) return;

        lastHydratedSessionIdRef.current = sessionId;

        const data = res.data;
        if (Array.isArray(data.stagePlan) && data.stagePlan.length > 0) {
          setStagePlan(data.stagePlan);
        }
        if (typeof data.currentStageIndex === 'number') {
          setCurrentStageIndex(data.currentStageIndex);
        }
        if (data.targetRole) setTargetRole(String(data.targetRole));
        if (data.targetCompany) setTargetCompany(String(data.targetCompany));
        if (data.interviewType) setInterviewType(String(data.interviewType));
        if (data.difficulty) setDifficulty(String(data.difficulty));
        if (data.startingDifficulty) setStartingDifficulty(String(data.startingDifficulty));
        if (data.adaptiveDifficulty) setAdaptiveDifficulty(String(data.adaptiveDifficulty));
        if (data.experienceLevel) setExperienceLevel(String(data.experienceLevel));
        if (data.yearsOfExperience !== undefined) {
          setYearsOfExperience(data.yearsOfExperience != null ? String(data.yearsOfExperience) : '');
        }
        if (data.focusAreas !== undefined) {
          setFocusAreas(data.focusAreas != null ? String(data.focusAreas) : '');
        }
        if (data.status === 'completed') setIsSessionOver(true);
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages((prev) => {
            if (
              prev.length === data.messages.length &&
              prev[prev.length - 1]?.text === data.messages[data.messages.length - 1]?.text &&
              prev[0]?.text === data.messages[0]?.text
            ) {
              return prev;
            }
            return data.messages;
          });
        }

        saveBehavioralStateRef.current?.({
          sessionId: data.sessionId,
          stagePlan: data.stagePlan,
          currentStageIndex: data.currentStageIndex,
          targetRole: data.targetRole ?? '',
          targetCompany: data.targetCompany ?? 'Tech Company',
          interviewType: data.interviewType ?? 'Behavioral',
          difficulty: data.difficulty ?? 'Medium',
          startingDifficulty: data.startingDifficulty || data.difficulty || 'Medium',
          adaptiveDifficulty: data.adaptiveDifficulty || data.difficulty || 'Medium',
          experienceLevel: data.experienceLevel ?? 'fresher',
          yearsOfExperience: data.yearsOfExperience != null ? String(data.yearsOfExperience) : '',
          focusAreas: data.focusAreas ?? '',
          isSessionOver: data.status === 'completed',
          messages: data.messages
        });

        console.log("Behavioral Coach hydrated authoritative session from backend:", data.sessionId);
      } catch (err) {
        console.warn("Could not hydrate interview session from backend:", err.message);
      }
    };

    hydrateAuthoritativeSession();
    return () => {
      isMounted = false;
    };
  }, [sessionId, isLoggedIn, getToken]);

  // ---------------------------------------------------------
  // Speech Synthesis Playback
  // ---------------------------------------------------------
  const speak = (text) => {
    if (!isTtsEnabled) return;
    window.speechSynthesis.cancel();
    const cleanedText = cleanTextForSpeech(text);
    if (!cleanedText) return;

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    const selectedVoice = voices.find((voice) => voice.name === selectedVoiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ---------------------------------------------------------
  // Chat Scrolling Logic: Keep position stable when reading up,
  // auto-scroll on new message if already near bottom or user message.
  // ---------------------------------------------------------
  const checkIfNearBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return true;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= 120;
  }, []);

  const handleChatScroll = useCallback(() => {
    if (chatContainerRef.current) {
      isNearBottomRef.current = checkIfNearBottom();
    }
  }, [checkIfNearBottom]);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  // Message update scrolling
  useEffect(() => {
    if (!messages || messages.length === 0) {
      prevMessagesLengthRef.current = 0;
      return;
    }

    const prevLength = prevMessagesLengthRef.current;
    const currentLength = messages.length;

    // Initial mount or session hydration
    if (!isInitialScrolledRef.current && currentLength > 0) {
      isInitialScrolledRef.current = true;
      prevMessagesLengthRef.current = currentLength;
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
      return;
    }

    // When new message is added
    if (currentLength > prevLength) {
      const latestMessage = messages[currentLength - 1];
      const isUserMessage = latestMessage?.sender === 'user';

      if (isUserMessage) {
        // User sent message -> force scroll to bottom
        isNearBottomRef.current = true;
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
      } else if (isNearBottomRef.current) {
        // AI response -> only scroll if user was near bottom
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
        });
      }
      prevMessagesLengthRef.current = currentLength;
    } else if (currentLength < prevLength) {
      prevMessagesLengthRef.current = currentLength;
    }
  }, [messages, scrollToBottom]);

  // Loading indicator scrolling (only if user is already near bottom)
  useEffect(() => {
    if (isLoading && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    }
  }, [isLoading, scrollToBottom]);

  const startNewInterview = () => {
    stopSpeaking();
    cleanupAudioResources();
    setIsVoiceMode(false);
    setSessionId(null);
    setMessages([]);
    setStagePlan([]);
    setCurrentStageIndex(0);
    setErrorMessage(null);
    setInput('');
    setIsSessionOver(false);
    setUploadSuccess(false);
    setShowSetup(true);
    setActivityRecorded(false);
    isInitialScrolledRef.current = false;
    lastHydratedSessionIdRef.current = null;
    isNearBottomRef.current = true;
    prevMessagesLengthRef.current = 0;

    if (behavioralStorageKey) {
      try {
        localStorage.removeItem(behavioralStorageKey);
      } catch (error) {
        console.error("Failed to clear previous Behavioral Coach state:", error);
      }
    }
  };

  // Dedicated Resume Upload for Behavioral Interview
  const handleFileUpload = async (e) => {
    if (!isLoggedIn) {
      openLogin();
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsUploading(true);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const token = await getToken();
      if (!token) {
        alert("Your session is not ready. Please try again.");
        return;
      }

      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/interview/upload-resume`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`
          }
        }
      );

      setUploadSuccess(true);
      setUseResume(true);
      if (res.data?.documentId) {
        setResumeStatus({
          hasResume: true,
          documentId: res.data.documentId
        });
      }

      saveBehavioralState({ useResume: true });
    } catch (error) {
      console.error("Upload failed", error);
      const errMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to upload and index resume. Please try again.";
      alert(`Upload Failed: ${errMsg}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!(input ?? '').trim() || isLoading) return;

    stopSpeaking();
    stopVoiceRecording();
    setIsVoiceMode(false);

    if (isTtsEnabled) {
      const silentUtterance = new SpeechSynthesisUtterance(" ");
      window.speechSynthesis.speak(silentUtterance);
    }

    sendMessage(input);
  };

  const handleExitInterview = () => {
    stopSpeaking();
    cleanupAudioResources();
    setIsVoiceMode(false);
    setSessionId(null);
    setMessages([]);
    setStagePlan([]);
    setCurrentStageIndex(0);
    setStartingDifficulty(difficulty);
    setAdaptiveDifficulty(difficulty);
    setErrorMessage(null);
    setInput('');
    setIsSessionOver(false);
    setActivityRecorded(false);
    setUploadSuccess(false);
    setShowSetup(true);
    isInitialScrolledRef.current = false;
    lastHydratedSessionIdRef.current = null;
    isNearBottomRef.current = true;
    prevMessagesLengthRef.current = 0;

    if (behavioralStorageKey) {
      try {
        localStorage.removeItem(behavioralStorageKey);
      } catch (error) {
        console.error("Failed to clear Behavioral Coach state on exit:", error);
      }
    }
  };

  // Start interview session with experience calibration
  const handleStartInterview = async () => {
    if (requestInFlightRef.current || isStartingInterview) {
      return;
    }

    if (!isLoggedIn) {
      openLogin();
      return;
    }

    const trimmedRole = (targetRole ?? '').trim();
    if (!trimmedRole) {
      setErrorMessage("Please enter a target role before starting the interview.");
      return;
    }

    const trimmedCompany = (targetCompany ?? '').trim() || 'Tech Company';
    const trimmedFocusAreas = (focusAreas ?? '').trim();
    const rawYears = (yearsOfExperience ?? '').toString().trim();
    let parsedYears = null;
    if (rawYears !== '') {
      const num = Number(rawYears);
      if (!Number.isNaN(num) && num >= 0) {
        parsedYears = num;
      }
    }

    setIsStartingInterview(true);
    setErrorMessage(null);
    requestInFlightRef.current = true;

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication token is not available. Please log in again.");
      }

      const payload = {
        targetRole: trimmedRole,
        targetCompany: trimmedCompany,
        interviewType: interviewType || 'Behavioral',
        difficulty: difficulty || 'Medium',
        experienceLevel: experienceLevel || 'fresher',
        yearsOfExperience: parsedYears,
        focusAreas: trimmedFocusAreas || null,
        useResumeContext: Boolean(useResume)
      };

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/interview/start`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          timeout: 130000
        }
      );

      const newSessionId = response.data?.sessionId;
      const initialQuestion = response.data?.question || "Tell me about yourself and your background.";
      const initialMessages = [{ sender: 'ai', text: initialQuestion }];
      const stages = Array.isArray(response.data?.stagePlan) ? response.data.stagePlan : [];
      const stageIdx = typeof response.data?.currentStageIndex === 'number' ? response.data.currentStageIndex : 0;
      const startDiff = response.data?.startingDifficulty || difficulty || 'Medium';
      const adaptDiff = response.data?.adaptiveDifficulty || startDiff;

      setSessionId(newSessionId);
      lastHydratedSessionIdRef.current = newSessionId;
      isInitialScrolledRef.current = false;
      isNearBottomRef.current = true;
      setTargetRole(trimmedRole);
      setTargetCompany(trimmedCompany);
      setFocusAreas(trimmedFocusAreas);
      setMessages(initialMessages);
      setStagePlan(stages);
      setCurrentStageIndex(stageIdx);
      setStartingDifficulty(startDiff);
      setAdaptiveDifficulty(adaptDiff);
      setShowSetup(false);
      setIsSessionOver(false);

      saveBehavioralState({
        sessionId: newSessionId,
        messages: initialMessages,
        targetRole: trimmedRole,
        targetCompany: trimmedCompany,
        interviewType: interviewType || 'Behavioral',
        difficulty: difficulty || 'Medium',
        startingDifficulty: startDiff,
        adaptiveDifficulty: adaptDiff,
        experienceLevel: experienceLevel || 'fresher',
        yearsOfExperience: rawYears,
        focusAreas: trimmedFocusAreas,
        stagePlan: stages,
        currentStageIndex: stageIdx,
        useResume,
        showSetup: false,
        isSessionOver: false
      });

      speak(initialQuestion);
    } catch (err) {
      console.error("Failed to start interview session:", err);
      const isTimeout =
        err.code === 'ECONNABORTED' ||
        err.name === 'TimeoutError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.response?.status === 504;

      const msg = isTimeout
        ? (err.response?.data?.message || "The interview service took longer than expected to start your session. Please try again.")
        : (err.response?.data?.message || err.message || "Failed to start interview. Please ensure backend and AI services are running.");
      setErrorMessage(msg);
    } finally {
      setIsStartingInterview(false);
      requestInFlightRef.current = false;
    }
  };

  // Submit interview answer to the LangGraph workflow
  const sendMessage = async (messageText) => {
    if (requestInFlightRef.current || isLoading) {
      return;
    }

    if (!messageText || !messageText.trim()) {
      return;
    }

    const activeSessionId = sessionId;
    if (!activeSessionId) {
      setErrorMessage("No active interview session found. Please start an interview first.");
      setShowSetup(true);
      return;
    }

    const userMessage = { sender: 'user', text: messageText };
    const newMessageHistory = [...messages, userMessage];

    if (messageText !== "USER_ACTION: End interview") {
      isNearBottomRef.current = true;
      setMessages(newMessageHistory);
      setInput('');
      saveBehavioralState({
        messages: newMessageHistory
      });
    }

    setIsLoading(true);
    setErrorMessage(null);
    requestInFlightRef.current = true;

    try {
      let token = null;
      let config = {};

      if (isLoggedIn) {
        token = await getToken();
        if (!token) {
          throw new Error("Authentication token is not available.");
        }
        config = {
          headers: {
            Authorization: `Bearer ${token}`
          }
        };
      } else {
        openLogin();
        throw new Error("Please log in to continue your interview.");
      }

      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/interview/${activeSessionId}/answer`,
        {
          answer: messageText
        },
        {
          ...config,
          timeout: 130000
        }
      );

      const isCompleted = response.data?.status === "completed" || Boolean(response.data?.final_report);
      let replyText = "";

      if (isCompleted) {
        setIsSessionOver(true);
        const report = response.data?.final_report || "Interview completed. Thank you!";
        replyText = `### Interview Completed\n\n${report}`;
      } else {
        replyText = response.data?.question || response.data?.reply || "Could you elaborate further?";
      }

      if (response.data?.stagePlan && Array.isArray(response.data.stagePlan)) {
        setStagePlan(response.data.stagePlan);
      }
      const updatedStageIndex = typeof response.data?.currentStageIndex === 'number'
        ? response.data.currentStageIndex
        : (isCompleted ? Math.max(0, (response.data?.stagePlan || stagePlan).length - 1) : currentStageIndex);
      setCurrentStageIndex(updatedStageIndex);

      const updatedAdaptiveDifficulty = response.data?.adaptiveDifficulty || response.data?.adaptive_difficulty;
      if (updatedAdaptiveDifficulty) {
        setAdaptiveDifficulty(updatedAdaptiveDifficulty);
      }

      speak(replyText);

      const aiResponse = { sender: 'ai', text: replyText };
      const completeMessageHistory = [...newMessageHistory, aiResponse];

      setMessages(completeMessageHistory);

      saveBehavioralState({
        messages: completeMessageHistory,
        isSessionOver: isCompleted,
        sessionId: activeSessionId,
        stagePlan: response.data?.stagePlan || stagePlan,
        currentStageIndex: updatedStageIndex,
        adaptiveDifficulty: updatedAdaptiveDifficulty || adaptiveDifficulty
      });

      if (
        isLoggedIn &&
        token &&
        !activityRecorded &&
        messageText !== "USER_ACTION: End interview"
      ) {
        axios.post(
          `${import.meta.env.VITE_API_URL}/api/user/record-activity`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        ).then(() => {
          setActivityRecorded(true);
          saveBehavioralState({
            activityRecorded: true
          });
        }).catch(err => {
          console.error("Failed to record activity:", err);
        });
      }
    } catch (err) {
      console.error("Error submitting answer to interview session:", err);
      let errorResponseText = "Sorry, I'm having trouble connecting to the interview service. Please try again.";

      const isTimeout =
        err.code === 'ECONNABORTED' ||
        err.name === 'TimeoutError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.response?.status === 504;

      if (isTimeout) {
        errorResponseText =
          err.response?.data?.message ||
          "The interview workflow took longer than expected to process your answer. Your response was preserved below—please submit again.";
      } else if (err.response && err.response.status === 401) {
        errorResponseText = "Sorry, your session has expired. Please log in again.";
      } else if (err.response && err.response.status === 404) {
        errorResponseText = "Interview session not found or you do not have permission to access it.";
      } else if (err.response?.data?.message) {
        errorResponseText = err.response.data.message;
      }

      setErrorMessage(errorResponseText);

      // Non-destructive recovery: restore typed answer into input field if it failed
      if (messageText !== "USER_ACTION: End interview") {
        setInput(messageText);
        setMessages(messages);
        saveBehavioralState({
          messages: messages,
          sessionId: activeSessionId
        });
      }
    } finally {
      setIsLoading(false);
      requestInFlightRef.current = false;
    }
  };



  return (
    <div className="flex flex-col flex-1 h-[85vh] md:h-full p-4 pt-4 bg-surface/70 rounded-lg border border-text-secondary/20 relative">
      {/* SETUP MODAL OVERLAY */}
      {showSetup && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 rounded-lg overflow-y-auto">
          <div className="bg-surface border border-emerald-500/30 p-6 rounded-2xl shadow-2xl max-w-lg w-full animate-in fade-in zoom-in duration-200 my-auto relative">
            <button
              type="button"
              onClick={() => setShowSetup(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background/80 transition-colors"
              title="Close"
            >
              <X size={18} />
            </button>
            <div className="flex items-center justify-center gap-3 mb-2">
              <PepeAvatar size="lg" />
              <div className="text-left">
                <h2 className="text-2xl font-bold text-emerald-400">Interview Setup</h2>
                <p className="text-xs text-text-secondary">Configure your target role, experience, and context</p>
              </div>
            </div>

            <div className="space-y-3.5 mt-4">
              {/* Target Role */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Briefcase size={14} className="text-accent" />
                  Target Role <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={targetRole ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTargetRole(value);
                    saveBehavioralState({ targetRole: value });
                  }}
                  placeholder="e.g. Frontend Developer, SRE, Data Scientist"
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-lg focus:border-accent outline-none text-text-primary text-sm"
                />
              </div>

              {/* Target Company */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Building2 size={14} className="text-accent" />
                  Target Company
                </label>
                <input
                  type="text"
                  value={targetCompany ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTargetCompany(value);
                    saveBehavioralState({ targetCompany: value });
                  }}
                  placeholder="e.g. Google, Stripe, Startup"
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-lg focus:border-accent outline-none text-text-primary text-sm"
                />
              </div>

              {/* Experience Level */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <GraduationCap size={14} className="text-accent" />
                  Experience Level
                </label>
                <select
                  value={experienceLevel ?? 'fresher'}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExperienceLevel(value);
                    saveBehavioralState({ experienceLevel: value });
                  }}
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-lg focus:border-accent outline-none text-text-primary text-sm"
                >
                  {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-text-secondary/80 mt-1">
                  {EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === experienceLevel)?.description}
                </p>
              </div>

              {/* Relevant Years of Experience (Optional/Flexible) */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                  Relevant Years of Experience <span className="text-[10px] lowercase text-text-secondary/70 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="0.5"
                  value={yearsOfExperience ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setYearsOfExperience(val);
                    saveBehavioralState({ yearsOfExperience: val });
                  }}
                  placeholder="e.g. 0.5, 2, 5 (leave blank if not applicable)"
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-lg focus:border-accent outline-none text-text-primary text-sm"
                />
              </div>

              {/* Focus Areas or Custom Instructions */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-accent" />
                  Areas of Focus or Instructions <span className="text-[10px] lowercase text-text-secondary/70 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={focusAreas ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFocusAreas(val);
                    saveBehavioralState({ focusAreas: val });
                  }}
                  placeholder="e.g. Focus on React internals, system design, or problem-solving trade-offs"
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-lg focus:border-accent outline-none text-text-primary text-sm resize-none"
                />
              </div>

              {/* Resume Context Section */}
              <div className="bg-background/60 p-3.5 rounded-lg border border-text-secondary/20">
                {isLoggedIn ? (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useResume}
                          onChange={(e) => {
                            const value = e.target.checked;
                            setUseResume(value);
                            saveBehavioralState({ useResume: value });
                          }}
                          className="form-checkbox h-4 w-4 text-accent rounded bg-surface border-text-secondary/50"
                        />
                        <span className="ml-2 text-text-primary text-sm font-medium">Use Resume Context</span>
                      </label>

                      {resumeStatus.hasResume && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 font-medium">
                          <CheckCircle size={12} />
                          Resume Linked
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-secondary mb-2.5">
                      {resumeStatus.hasResume
                        ? "Your uploaded resume will personalize questions and follow-ups."
                        : "Upload a PDF resume to personalize questions to your actual projects and experience."}
                    </p>

                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".pdf"
                      onChange={handleFileUpload}
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="w-full py-2 border border-dashed border-accent/50 rounded-lg flex items-center justify-center gap-2 text-xs text-accent hover:bg-accent/10 transition-colors"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Uploading & Indexing Resume...</span>
                        </>
                      ) : uploadSuccess ? (
                        <>
                          <CheckCircle size={14} className="text-green-400" />
                          <span className="text-green-400 font-medium">Resume Successfully Linked!</span>
                        </>
                      ) : resumeStatus.hasResume ? (
                        <>
                          <Upload size={14} />
                          <span>Update / Replace Resume (PDF)</span>
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          <span>Upload Resume (PDF)</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="text-center py-1">
                    <p className="text-xs text-text-secondary mb-2">
                      Log in to link your resume and get personalized questions based on your experience.
                    </p>
                    <button
                      type="button"
                      onClick={openLogin}
                      className="w-full py-2 bg-accent/10 border border-accent/30 text-accent rounded-lg flex items-center justify-center gap-2 text-xs font-semibold hover:bg-accent hover:text-white transition-colors"
                    >
                      <LogIn size={14} /> Log In to Personalize
                    </button>
                  </div>
                )}
              </div>

              {errorMessage && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleStartInterview}
                disabled={isStartingInterview}
                className="w-full bg-accent hover:bg-accent-darker disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors mt-2 flex items-center justify-center gap-2 text-sm shadow-md"
              >
                {isStartingInterview ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Preparing Interview Session...</span>
                  </>
                ) : (
                  "Start Interview"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="mb-4 pb-3 border-b border-text-secondary/15">
        {!isLoggedIn && (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-2 rounded-md mb-2 text-xs text-center flex items-center justify-center gap-2">
            <AlertCircle size={14} />
            <span>
              Guest Mode: Chat history will not be saved.{' '}
              <button onClick={openLogin} className="underline font-bold hover:text-blue-300">
                Log In
              </button>
            </span>
          </div>
        )}

        <div className="flex justify-between items-center gap-4">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 shadow-sm">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight">
                  Behavioral Coach
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
                  AI Interviewer
                </span>
              </div>
              <p className="text-text-secondary text-xs mt-0.5 truncate">
                Practice real interviews with AI. Get personalized feedback and improve every time.
              </p>
            </div>
          </div>

          {/* Right Controls: Preferred Voice Selection & Audio Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex items-center gap-1.5 bg-surface/80 border border-text-secondary/25 px-2.5 py-1.5 rounded-lg text-xs">
              <span className="text-text-secondary font-medium hidden sm:inline">Voice:</span>
              <select
                value={selectedVoiceName ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedVoiceName(val);
                  localStorage.setItem('preferredVoiceName', val);
                }}
                className="bg-transparent text-text-primary text-xs outline-none cursor-pointer max-w-[150px] sm:max-w-[180px] truncate font-medium"
                title="Select Interviewer Voice"
              >
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name} className="bg-surface text-text-primary">
                    {voice.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                const newState = !isTtsEnabled;
                setIsTtsEnabled(newState);
                if (!newState) stopSpeaking();
              }}
              className="p-1.5 rounded-lg border border-text-secondary/30 bg-surface/80 text-text-secondary hover:text-text-primary transition-colors"
              title={isTtsEnabled ? "Mute TTS audio" : "Enable TTS audio"}
              aria-label={isTtsEnabled ? "Mute TTS" : "Enable TTS"}
            >
              {isTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN TWO-COLUMN WORKSPACE: Setup & Progress on Left, Chat & Voice Studio on Right */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4 overflow-hidden">
        {/* LEFT COLUMN: Setup & Progress */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col gap-3.5 overflow-y-auto pr-1">
          {/* Card 1: Interview Setup */}
          <div className="bg-surface/90 border border-text-secondary/20 rounded-2xl p-4 shadow-sm backdrop-blur-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-text-primary tracking-wide">
                Interview Setup
              </h3>
              {useResume && resumeStatus.hasResume && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                  Resume Active
                </span>
              )}
            </div>

            {/* Company */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                Company
              </label>
              <div className="relative">
                <select
                  value={targetCompany ?? 'Tech Company'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTargetCompany(val);
                    saveBehavioralState({ targetCompany: val });
                  }}
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-xl text-text-primary text-xs font-medium appearance-none focus:border-emerald-500 outline-none cursor-pointer pr-8"
                >
                  {COMPANY_OPTIONS.map((c) => (
                    <option key={c} value={c} className="bg-surface text-text-primary">
                      {c}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Experience Level */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                Experience Level
              </label>
              <div className="relative">
                <select
                  value={experienceLevel ?? 'fresher'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setExperienceLevel(val);
                    saveBehavioralState({ experienceLevel: val });
                  }}
                  className="w-full p-2.5 bg-background border border-text-secondary/30 rounded-xl text-text-primary text-xs font-medium appearance-none focus:border-emerald-500 outline-none cursor-pointer pr-8"
                >
                  {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-surface text-text-primary">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Interview Type */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                Interview Type
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-background/80 rounded-xl border border-text-secondary/25">
                {['Technical', 'Behavioral', 'Mixed'].map((type) => {
                  const active = interviewType.toLowerCase() === type.toLowerCase();
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setInterviewType(type);
                        saveBehavioralState({ interviewType: type });
                      }}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        active
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-text-secondary">
                  Difficulty
                </label>
                {sessionId && (
                  <span className="text-[10px] text-text-secondary/70">
                    Draft for restart
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-background/80 rounded-xl border border-text-secondary/25">
                {['Easy', 'Medium', 'Hard'].map((diff) => {
                  const active = difficulty === diff;
                  return (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => {
                        setDifficulty(diff);
                        saveBehavioralState({ difficulty: diff });
                      }}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        active
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {diff}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start / Restart Interview Button */}
            <button
              type="button"
              onClick={handleStartInterview}
              disabled={isStartingInterview || isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
            >
              {isStartingInterview ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Preparing Session...</span>
                </>
              ) : (
                <>
                  <span>{sessionId ? 'Restart Interview' : 'Start Interview'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {/* Advanced Context / Resume trigger */}
            <div className="pt-0.5 flex items-center justify-between text-[11px] text-text-secondary">
              <button
                type="button"
                onClick={() => setShowSetup(true)}
                className="text-text-secondary hover:text-emerald-400 flex items-center gap-1 transition-colors"
              >
                <Edit3 size={12} />
                <span>Advanced Context & Resume</span>
              </button>
            </div>
          </div>

          {/* Card 2: Interview Progress */}
          {(() => {
            const activeStages = stagePlan && stagePlan.length > 0 ? stagePlan : [
              'Welcome and Introduction',
              'Fundamentals & Core Concepts',
              'Problem Solving & Experience',
              'Behavioral & Situational Questions',
              'Wrap-up'
            ];
            const totalStages = activeStages.length;
            const completedStages = isSessionOver ? totalStages : Math.min(currentStageIndex, totalStages);
            const progressPercent = totalStages > 0
              ? Math.min(100, Math.round((completedStages / totalStages) * 100))
              : 0;
            const levelLabel =
              EXPERIENCE_LEVEL_OPTIONS.find((o) => o.value === experienceLevel)?.label || experienceLevel;

            return (
              <div className="bg-surface/90 border border-text-secondary/20 rounded-2xl p-4 shadow-sm backdrop-blur-sm space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text-primary tracking-wide">
                    Interview Progress
                  </h3>
                  <span className="text-[11px] font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    {isSessionOver ? "Completed" : `${completedStages}/${totalStages}`}
                  </span>
                </div>

                {/* Circular Ring Indicator */}
                <div className="flex items-center gap-3.5 py-1">
                  <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-text-secondary/20"
                        strokeWidth="3.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-emerald-400 transition-all duration-500 ease-out"
                        strokeDasharray={`${progressPercent}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-xs font-bold text-text-primary leading-none block">
                        {completedStages}/{totalStages}
                      </span>
                      <span className="text-[9px] text-text-secondary leading-none block mt-0.5">
                        Stages
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-text-primary">
                      {completedStages} of {totalStages} Stages Completed
                    </p>
                    <div className="text-[11px] text-text-secondary mt-0.5 leading-snug flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-emerald-400">
                        {adaptiveDifficulty || startingDifficulty || difficulty}
                      </span>
                      {startingDifficulty && (adaptiveDifficulty || startingDifficulty) !== startingDifficulty && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                          Adaptive (from {startingDifficulty})
                        </span>
                      )}
                      <span>•</span>
                      <span>{interviewType}</span>
                      <span>•</span>
                      <span>{levelLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Adaptive Stage Plan List */}
                <div className="space-y-2 pt-2 border-t border-text-secondary/15">
                  {activeStages.map((stageName, idx) => {
                    let status = 'pending';
                    if (isSessionOver || idx < currentStageIndex) {
                      status = 'completed';
                    } else if (idx === currentStageIndex) {
                      status = 'active';
                    }

                    return (
                      <div key={stageName + idx} className="flex items-center gap-2.5 text-xs">
                        {status === 'completed' ? (
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        ) : status === 'active' ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400 flex items-center justify-center shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          </div>
                        ) : (
                          <Circle size={15} className="text-text-secondary/40 shrink-0" />
                        )}
                        <span
                          className={
                            status === 'completed'
                              ? 'text-text-primary font-medium'
                              : status === 'active'
                              ? 'text-emerald-400 font-semibold'
                              : 'text-text-secondary/70'
                          }
                        >
                          {stageName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN: Chat conversation & Voice Studio */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto pr-2 space-y-4 mb-3"
          >
            {errorMessage && !showSetup && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm mb-2 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {messages.length === 0 && !showSetup && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-secondary">
                <PepeAvatar size="xl" className="mb-3" />
                <h3 className="text-lg font-semibold text-text-primary">Ready to begin your interview</h3>
                <p className="text-sm max-w-sm mt-1">
                  Choose your company, interview type, and difficulty on the left, then click Start Interview.
                </p>
                <button
                  onClick={handleStartInterview}
                  disabled={isStartingInterview}
                  className="mt-4 px-5 py-2.5 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-emerald-400 transition-colors shadow-md flex items-center gap-2"
                >
                  {isStartingInterview ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                  <span>Start Interview</span>
                </button>
              </div>
            )}

            {messages.map((msg, index) => {
              if (msg.text === "USER_ACTION: End interview") return null;

              if (isReportMessage(msg.text)) {
                return (
                  <div key={index} className="flex justify-center w-full my-2">
                    <InterviewReportCard
                      text={msg.text}
                      targetRole={targetRole}
                      targetCompany={targetCompany}
                      experienceLevel={experienceLevel}
                      onRestart={startNewInterview}
                      onSpeak={speak}
                      isTtsEnabled={isTtsEnabled}
                    />
                  </div>
                );
              }

              const isAi = msg.sender === 'ai';
              const isLatestAi = isAi && index === messages.length - 1;
              const timeStr = msg.timestamp
                ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '10:24 AM';

              return (
                <div
                  key={index}
                  className={`flex ${isAi ? 'justify-start items-start gap-3' : 'justify-end items-start gap-3'} group`}
                >
                  {isAi && (
                    <PepeAvatar
                      size="md"
                      isSpeaking={isSpeaking && isLatestAi}
                      className="mt-0.5 shrink-0"
                    />
                  )}

                  <div className={`flex flex-col ${isAi ? 'items-start' : 'items-end'} max-w-xl`}>
                    <div
                      className={`p-4 rounded-2xl whitespace-pre-wrap relative shadow-sm ${
                        isAi
                          ? 'bg-surface/90 text-text-primary border border-text-secondary/20 rounded-tl-sm'
                          : 'bg-emerald-600/90 text-white rounded-tr-sm'
                      }`}
                    >
                      {isAi ? (
                        <div className="prose dark:prose-invert text-text-primary max-w-none text-sm leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ node, ...props }) => (
                                <h1 className="text-base font-bold text-accent mt-3 mb-1.5 pb-1 border-b border-text-secondary/20" {...props} />
                              ),
                              h2: ({ node, ...props }) => (
                                <h2 className="text-sm font-bold text-accent mt-2.5 mb-1" {...props} />
                              ),
                              h3: ({ node, ...props }) => (
                                <h3 className="text-sm font-semibold text-accent/90 mt-2 mb-1" {...props} />
                              ),
                              p: ({ node, ...props }) => (
                                <p className="mb-2.5 last:mb-0 leading-relaxed text-text-primary/95 text-sm" {...props} />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul className="list-disc list-inside space-y-1 mb-2.5 pl-1 text-sm text-text-primary/90" {...props} />
                              ),
                              ol: ({ node, ...props }) => (
                                <ol className="list-decimal list-inside space-y-1 mb-2.5 pl-1 text-sm text-text-primary/90" {...props} />
                              ),
                              li: ({ node, ...props }) => <li className="leading-relaxed text-sm" {...props} />,
                              strong: ({ node, ...props }) => (
                                <strong className="font-semibold text-accent" {...props} />
                              ),
                              em: ({ node, ...props }) => (
                                <em className="italic text-text-primary/90" {...props} />
                              ),
                              code: ({ node, inline, children, ...props }) => {
                                if (inline || !String(children).includes('\n')) {
                                  return (
                                    <code className="bg-surface text-accent px-1.5 py-0.5 rounded text-xs font-mono border border-text-secondary/20" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <pre className="bg-surface text-text-primary p-3 rounded-lg overflow-x-auto text-xs font-mono my-2.5 border border-text-secondary/25 leading-relaxed">
                                    <code {...props}>{children}</code>
                                  </pre>
                                );
                              },
                              blockquote: ({ node, ...props }) => (
                                <blockquote className="border-l-4 border-accent/70 pl-3 py-1.5 my-2.5 italic text-text-secondary bg-surface/40 rounded-r text-xs leading-relaxed" {...props} />
                              ),
                              hr: ({ node, ...props }) => (
                                <hr className="border-t border-text-secondary/20 my-3" {...props} />
                              ),
                            }}
                          >
                            {msg.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <span className="text-sm leading-relaxed">{msg.text}</span>
                      )}

                      {isAi && (
                        <button
                          onClick={() => speak(msg.text)}
                          className="absolute -right-8 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-text-secondary hover:text-accent p-1"
                          title="Read aloud"
                        >
                          <PlayCircle size={18} />
                        </button>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-text-secondary/60 mt-1 px-1">
                      {timeStr}
                    </span>
                  </div>

                  {!isAi && (
                    <div className="w-8 h-8 rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                      {userInitial}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Small Animated Typing Indicator */}
            {isLoading && (
              <div className="flex justify-start items-start gap-3">
                <PepeAvatar size="md" isThinking={true} className="mt-0.5 shrink-0" />
                <div className="bg-background text-text-primary border border-text-secondary/20 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-3 shadow-sm">
                  <div className="flex items-center gap-1.5 py-1 px-0.5" aria-label="Loading response">
                    <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-text-secondary text-xs font-medium">
                    Pepe is formulating your question...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Voice Speech Error Feedback */}
          {speechError && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs p-2.5 rounded-lg mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-amber-400" />
                <span>{speechError}</span>
              </div>
              <button
                onClick={() => setSpeechError(null)}
                className="text-amber-400 hover:text-white p-0.5"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* BOTTOM CONTROLS: Voice Studio or Regular Input */}
          {!isSessionOver ? (
            isVoiceMode ? (
              /* MODERN VOICE RECORDING STUDIO (Matches Reference Screenshot) */
              <div className="bg-surface/95 border border-emerald-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md mb-2 animate-in fade-in zoom-in duration-200">
                {/* 1. Status prompt */}
                <div className="text-center mb-1">
                  <span className="text-xs font-medium text-text-secondary">
                    {isRecording ? "Listening... Speak now" : (input ?? '').trim() ? "Ready to send (review transcript below)" : "Tap microphone to speak"}
                  </span>
                </div>

                {/* 2. Waveform & Center Glowing Microphone Control */}
                <AudioWaveform
                  analyserNode={analyserNode}
                  isRecording={isRecording}
                  timerText={formatTimer(recordingSeconds)}
                  statusText={
                    isRecording
                      ? "Listening... Speak now"
                      : (input ?? '').trim()
                      ? "Ready to send"
                      : "Tap microphone to speak"
                  }
                  onMicClick={() => {
                    if (isRecording) {
                      stopVoiceRecording();
                    } else {
                      startVoiceRecording();
                    }
                  }}
                />

                {/* 3. Editable Transcript Preview Box if speech recorded */}
                {input ? (
                  <div className="bg-background/90 border border-emerald-500/30 rounded-xl p-3 flex items-start gap-2.5 my-3 shadow-inner">
                    <Activity size={16} className="text-emerald-400 shrink-0 mt-0.5 animate-pulse" />
                    <textarea
                      rows={2}
                      value={input ?? ''}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Review and edit your spoken answer..."
                      className="flex-1 bg-transparent text-emerald-300 font-medium text-xs leading-relaxed outline-none resize-none placeholder:text-emerald-600/70"
                    />
                    <button
                      type="button"
                      onClick={submitVoiceAnswer}
                      disabled={isLoading || !(input ?? '').trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs shadow-md hover:bg-emerald-400 transition-all disabled:opacity-50"
                      title="Send answer"
                    >
                      {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      <span>Send</span>
                    </button>
                  </div>
                ) : null}

                {/* 4. Bottom Action Controls: Keyboard icon, Stop, Timer, End Interview */}
                <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-text-secondary/15">
                  <button
                    type="button"
                    onClick={() => {
                      stopVoiceRecording();
                      setIsVoiceMode(false);
                    }}
                    className="p-2 rounded-xl bg-surface border border-text-secondary/30 text-text-secondary hover:text-text-primary hover:border-text-secondary/50 transition-all text-xs flex items-center gap-1.5"
                    title="Switch to keyboard typing"
                  >
                    <Keyboard size={15} />
                  </button>

                  <div className="flex items-center gap-3">
                    {isRecording ? (
                      <button
                        type="button"
                        onClick={stopVoiceRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-text-secondary/30 text-xs font-semibold text-text-primary hover:bg-surface/80 transition-all"
                        title="Stop recording"
                      >
                        <Square size={12} className="text-text-secondary" />
                        <span>Stop</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startVoiceRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-emerald-500/40 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        title="Resume recording"
                      >
                        <Mic size={12} />
                        <span>Resume</span>
                      </button>
                    )}

                    <span className="text-xs font-mono text-text-secondary font-medium">
                      {formatTimer(recordingSeconds)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleExitInterview}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition-all"
                    title="End Interview"
                  >
                    <LogOut size={13} />
                    <span>End Interview</span>
                  </button>
                </div>
              </div>
            ) : (
              /* REGULAR TYPED INPUT WITH VOICE BUTTON */
              <form onSubmit={handleSubmit} className="flex items-center gap-2 md:gap-3 mb-16 md:mb-0">
                <input
                  type="text"
                  value={input ?? ''}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isLoading
                      ? "Pepe is evaluating..."
                      : "Type your answer or click mic for voice input..."
                  }
                  className="flex-1 p-3 bg-background text-text-primary text-sm rounded-xl border border-text-secondary/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={isLoading}
                />

                {/* Microphone Button to launch Voice Recording Studio */}
                <button
                  type="button"
                  onClick={() => {
                    setIsVoiceMode(true);
                    startVoiceRecording();
                  }}
                  disabled={isLoading}
                  className="p-3 rounded-xl bg-surface hover:bg-surface/80 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.25)] transition-all shrink-0 disabled:opacity-50"
                  title="Answer with Voice (Speech Recognition)"
                  aria-label="Start voice input"
                >
                  <Mic size={18} />
                </button>

                {/* Submit Answer Button */}
                <button
                  type="submit"
                  className="bg-emerald-500 p-3 rounded-xl text-slate-950 font-bold hover:bg-emerald-400 transition-colors disabled:opacity-50 shrink-0"
                  disabled={isLoading || !(input ?? '').trim()}
                  title="Submit Answer"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>

                {/* Exit Interview Button */}
                <button
                  type="button"
                  onClick={handleExitInterview}
                  className="bg-red-600/80 p-3 rounded-xl text-white hover:bg-red-600 transition-colors disabled:opacity-50 shrink-0"
                  disabled={isLoading}
                  title="Exit Interview"
                >
                  <LogOut size={18} />
                </button>
              </form>
            )
          ) : (
            <div className="flex justify-center items-center pt-2">
              <button
                onClick={startNewInterview}
                className="flex items-center gap-2 bg-emerald-500 text-slate-950 font-bold py-2.5 px-6 rounded-xl hover:bg-emerald-400 transition-colors shadow-md text-sm"
              >
                <RefreshCw size={16} /> Start New Interview
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BehavioralCoach;